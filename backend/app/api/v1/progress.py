from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import CardProgress, Question, ReviewEvent
from app.schemas.schemas import ProgressBatchRequest, ProgressResponse

router = APIRouter(prefix="/api/v1/progress", tags=["progress"])


@router.post("/batch", response_model=list[ProgressResponse])
async def batch_sync_progress(
    body: ProgressBatchRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upsert current progress and append only newly observed review events."""
    try:
        user_uuid = UUID(user_id)
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc

    result: list[CardProgress] = []
    for item in body.items:
        question = await db.scalar(
            select(Question).where(Question.id == item.question_id, Question.user_id == user_uuid)
        )
        if question is None:
            raise HTTPException(404, detail=f"Question not found: {item.question_id}")

        progress = await db.scalar(
            select(CardProgress).where(
                CardProgress.user_id == user_uuid,
                CardProgress.question_id == item.question_id,
            )
        )
        old_correct = progress.correct if progress else 0
        old_incorrect = progress.incorrect if progress else 0
        occurred_at = item.last_review or datetime.now(timezone.utc)
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)

        for _ in range(max(0, item.correct - old_correct)):
            db.add(
                ReviewEvent(
                    user_id=user_uuid,
                    question_id=item.question_id,
                    category=question.cat,
                    occurred_at=occurred_at,
                    study_date=occurred_at.astimezone(timezone.utc).date(),
                    is_correct=True,
                    quality=1,
                )
            )
        for _ in range(max(0, item.incorrect - old_incorrect)):
            db.add(
                ReviewEvent(
                    user_id=user_uuid,
                    question_id=item.question_id,
                    category=question.cat,
                    occurred_at=occurred_at,
                    study_date=occurred_at.astimezone(timezone.utc).date(),
                    is_correct=False,
                    quality=0,
                )
            )

        if progress is None:
            progress = CardProgress(user_id=user_uuid, question_id=item.question_id)
            db.add(progress)

        progress.level = item.level
        progress.correct = item.correct
        progress.incorrect = item.incorrect
        progress.last_review = item.last_review
        progress.next_review = item.next_review
        if item.is_starred is not None:
            progress.is_starred = item.is_starred
        result.append(progress)

    await db.commit()
    for progress in result:
        await db.refresh(progress)
    return result
