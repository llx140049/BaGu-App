from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import UserSettings
from app.schemas.schemas import UserSettingsResponse, UserSettingsUpdate

router = APIRouter(prefix="/api/v1/user/settings", tags=["user-settings"])


def _user_uuid(user_id: str) -> UUID:
    try:
        return UUID(user_id)
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc


async def _settings(user_id: UUID, db: AsyncSession) -> UserSettings | None:
    return await db.scalar(select(UserSettings).where(UserSettings.user_id == user_id))


@router.get("", response_model=UserSettingsResponse)
async def get_settings(user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    settings = await _settings(_user_uuid(user_id), db)
    return UserSettingsResponse(daily_new_target=settings.daily_new_target if settings else 10)


@router.put("", response_model=UserSettingsResponse)
async def update_settings(body: UserSettingsUpdate, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not 1 <= body.daily_new_target <= 200:
        raise HTTPException(422, detail="daily_new_target must be between 1 and 200")
    uid = _user_uuid(user_id)
    settings = await _settings(uid, db)
    if settings is None:
        settings = UserSettings(user_id=uid, daily_new_target=body.daily_new_target)
        db.add(settings)
    else:
        settings.daily_new_target = body.daily_new_target
    await db.commit()
    return UserSettingsResponse(daily_new_target=settings.daily_new_target)
