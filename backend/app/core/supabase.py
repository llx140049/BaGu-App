"""Supabase client wrapper — verifies JWTs from Supabase Auth."""
from typing import Optional
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import settings

bearer_scheme = HTTPBearer()

# Supabase JWT verification without fetching JWKS (for HS256 signed tokens)
def verify_supabase_token(token: str) -> dict:
    """Verify a Supabase-issued JWT and return the payload."""
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET or settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Supabase token",
        )


async def get_supabase_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Dependency: extracts and verifies the Supabase user from the Bearer token."""
    payload = verify_supabase_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing sub claim",
        )
    return {"id": user_id, "email": payload.get("email", ""), "payload": payload}
