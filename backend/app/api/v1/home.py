from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import CardProgress, Document, StudyRecord, UserSettings
from app.schemas.schemas import ContinueReading, HomeOverview

router = APIRouter(prefix="/api/v1/home", tags=["home"])
MASTERED_LEVEL = 5


def _user_uuid(user_id: str) -> UUID:
    try:
        return UUID(user_id)
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc


@router.get("/overview", response_model=HomeOverview)
async def home_overview(user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = _user_uuid(user_id)
    now = datetime.now(timezone.utc)
    due_count = await db.scalar(
        select(func.count(CardProgress.id)).where(
            CardProgress.user_id == uid,
            CardProgress.level < MASTERED_LEVEL,
            CardProgress.last_review.is_not(None),
            or_(CardProgress.next_review.is_(None), CardProgress.next_review <= now),
        )
    ) or 0
    settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == uid))
    target = settings.daily_new_target if settings else 10
    today = now.date()
    completed = await db.scalar(
        select(func.coalesce(func.sum(StudyRecord.new_count), 0)).where(
            StudyRecord.user_id == uid,
            StudyRecord.date == today,
        )
    ) or 0
    document = await db.scalar(
        select(Document)
        .where(Document.user_id == uid, Document.last_read_at.is_not(None))
        .order_by(Document.last_read_at.desc())
        .limit(1)
    )
    continue_reading = None
    if document is not None:
        continue_reading = ContinueReading(
            id=document.id,
            title=document.title,
            reading_progress=document.reading_progress or 0,
            last_read_at=document.last_read_at,
        )
    return HomeOverview(
        due_count=due_count,
        daily_new_target=target,
        today_new_completed=completed,
        today_new_remaining=max(0, target - completed),
        continue_reading=continue_reading,
    )
