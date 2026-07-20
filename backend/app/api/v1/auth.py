"""Database-backed authentication with legacy local-account migration."""

import hashlib
import hmac
import json
import os
import secrets
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.models.question import AppUser

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

LEGACY_USERS_FILE = Path(os.getenv("UPLOAD_DIR", "./uploads")) / "_sync" / "users.json"
SCRYPT_N = 2**14


class AuthRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str


def _normalized_email(email: str) -> str:
    return email.strip().casefold()


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=8, p=1)
    return f"scrypt${SCRYPT_N}$8$1${salt.hex()}${derived.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    if stored.startswith("scrypt$"):
        try:
            _, n, r, p, salt, expected = stored.split("$", 5)
            actual = hashlib.scrypt(
                password.encode(),
                salt=bytes.fromhex(salt),
                n=int(n),
                r=int(r),
                p=int(p),
            )
            return hmac.compare_digest(actual, bytes.fromhex(expected))
        except (TypeError, ValueError):
            return False

    # Compatibility with the original local salt:sha256 format.
    try:
        salt, expected = stored.split(":", 1)
    except ValueError:
        return False
    actual = hashlib.sha256((salt + password).encode()).hexdigest()
    return hmac.compare_digest(actual, expected)


def _legacy_user(email: str) -> dict | None:
    if not LEGACY_USERS_FILE.is_file():
        return None
    try:
        users = json.loads(LEGACY_USERS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return users.get(email) or next(
        (user for key, user in users.items() if key.casefold() == email),
        None,
    )


@router.post("/register", response_model=AuthResponse)
async def register(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    email = _normalized_email(body.email)
    if len(body.password) < 8:
        raise HTTPException(400, detail="密码至少需要 8 个字符")
    existing = await db.scalar(select(AppUser).where(func.lower(AppUser.email) == email))
    if existing:
        raise HTTPException(400, detail="邮箱已注册")

    user = AppUser(email=email, password_hash=_hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return AuthResponse(token=create_access_token(str(user.id)), user_id=str(user.id), email=user.email)


@router.post("/login", response_model=AuthResponse)
async def login(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    email = _normalized_email(body.email)
    user = await db.scalar(select(AppUser).where(func.lower(AppUser.email) == email))

    if user is None:
        legacy = _legacy_user(email)
        if legacy and _verify_password(body.password, str(legacy.get("password", ""))):
            try:
                user_id = uuid.UUID(str(legacy["id"]))
            except (KeyError, ValueError):
                user_id = uuid.uuid4()
            user = AppUser(
                id=user_id,
                email=email,
                password_hash=_hash_password(body.password),
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

    if user is None or not _verify_password(body.password, user.password_hash):
        raise HTTPException(401, detail="邮箱或密码错误")

    # Upgrade a migrated legacy hash after its first successful login.
    if not user.password_hash.startswith("scrypt$"):
        user.password_hash = _hash_password(body.password)
        await db.commit()

    return AuthResponse(token=create_access_token(str(user.id)), user_id=str(user.id), email=user.email)


@router.get("/me")
async def get_me(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc
    user = await db.get(AppUser, uid)
    if user is None:
        raise HTTPException(404, detail="User not found")
    return {"user_id": str(user.id), "email": user.email}
