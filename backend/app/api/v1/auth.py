"""Auth API — register, login, user info."""
import os, json, uuid, hashlib, secrets
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.security import create_access_token, get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

DATA_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads")) / "_sync"
DATA_DIR.mkdir(parents=True, exist_ok=True)
USERS_FILE = DATA_DIR / "users.json"

def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _write_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{h}"

def _verify_password(password: str, stored: str) -> bool:
    salt, h = stored.split(":", 1)
    return hashlib.sha256((salt + password).encode()).hexdigest() == h

class AuthRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str

@router.post("/register", response_model=AuthResponse)
async def register(body: AuthRequest):
    users = _read_json(USERS_FILE)
    if body.email in users:
        raise HTTPException(400, detail="邮箱已注册")
    user_id = str(uuid.uuid4())
    users[body.email] = {
        "id": user_id,
        "email": body.email,
        "password": _hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_json(USERS_FILE, users)
    token = create_access_token(user_id)
    return AuthResponse(token=token, user_id=user_id, email=body.email)

@router.post("/login", response_model=AuthResponse)
async def login(body: AuthRequest):
    users = _read_json(USERS_FILE)
    user = users.get(body.email)
    if not user or not _verify_password(body.password, user["password"]):
        raise HTTPException(401, detail="邮箱或密码错误")
    token = create_access_token(user["id"])
    return AuthResponse(token=token, user_id=user["id"], email=body.email)

@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)):
    return {"user_id": user_id}
