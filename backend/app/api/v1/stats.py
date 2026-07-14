from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import CardProgress, Question, ReviewEvent, StudyRecord
from app.schemas.schemas import CalendarDay, StatsCompare, StatsOverview, TagProgress, TrendPoint

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])
MASTERED_LEVEL = 5


def _uid(user_id: str) -> UUID:
    return UUID(user_id)


async def _event_rows(db: AsyncSession, user_id: UUID):
    return (
        await db.execute(
            select(ReviewEvent.study_date, ReviewEvent.is_correct).where(ReviewEvent.user_id == user_id)
        )
    ).all()


def _streak(days: set[date]) -> int:
    cursor = datetime.now(timezone.utc).date()
    if cursor not in days:
        cursor -= timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


@router.get("/overview", response_model=StatsOverview)
async def stats_overview(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(user_id)
    total = await db.scalar(select(func.count(Question.id)).where(Question.user_id == uid)) or 0
    learned = await db.scalar(
        select(func.count(CardProgress.id)).where(
            CardProgress.user_id == uid,
            CardProgress.level >= MASTERED_LEVEL,
        )
    ) or 0
    starred = await db.scalar(
        select(func.count(CardProgress.id)).where(
            CardProgress.user_id == uid,
            CardProgress.is_starred.is_(True),
        )
    ) or 0

    events = await _event_rows(db, uid)
    if events:
        correct = sum(1 for _, is_correct in events if is_correct)
        total_reviews = len(events)
    else:
        correct, incorrect = (
            await db.execute(
                select(
                    func.coalesce(func.sum(StudyRecord.correct), 0),
                    func.coalesce(func.sum(StudyRecord.incorrect), 0),
                ).where(StudyRecord.user_id == uid)
            )
        ).one()
        total_reviews = correct + incorrect

    return StatsOverview(
        total=total,
        learned=learned,
        learning=max(0, total - learned),
        starred=starred,
        accuracy=round(correct / total_reviews, 4) if total_reviews else 0.0,
    )


@router.get("/tag-progress", response_model=list[TagProgress])
async def tag_progress(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(user_id)
    rows = await db.execute(
        select(Question.tags, CardProgress.level)
        .outerjoin(
            CardProgress,
            (CardProgress.question_id == Question.id) & (CardProgress.user_id == uid),
        )
        .where(Question.user_id == uid)
    )
    grouped: dict[str, dict[str, int]] = {}
    for tags, level in rows:
        names = tags if isinstance(tags, list) and tags else ["未分类"]
        for name in names:
            if not isinstance(name, str) or not name.strip():
                name = "未分类"
            item = grouped.setdefault(name, {"total": 0, "mastered": 0})
            item["total"] += 1
            if (level or 0) >= MASTERED_LEVEL:
                item["mastered"] += 1
    return [
        TagProgress(tag=name, total=item["total"], mastered=item["mastered"], progress=round(item["mastered"] / item["total"], 4))
        for name, item in sorted(grouped.items(), key=lambda value: (-value[1]["total"], value[0]))
    ]


@router.get("/calendar", response_model=list[CalendarDay])
async def stats_calendar(
    days: int = Query(365, ge=1, le=730),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(user_id)
    start = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    rows = await db.execute(
        select(ReviewEvent.study_date, func.count(ReviewEvent.id))
        .where(ReviewEvent.user_id == uid, ReviewEvent.study_date >= start)
        .group_by(ReviewEvent.study_date)
        .order_by(ReviewEvent.study_date)
    )
    values = {row[0].isoformat(): row[1] for row in rows}

    # Keep older installations usable before review_events is backfilled.
    if not values:
        rows = await db.execute(
            select(StudyRecord.date, StudyRecord.count)
            .where(StudyRecord.user_id == uid, StudyRecord.date >= start)
            .order_by(StudyRecord.date)
        )
        values = {row[0].isoformat(): row[1] for row in rows}
    return [CalendarDay(date=key, count=value) for key, value in values.items()]


@router.get("/trend", response_model=list[TrendPoint])
async def stats_trend(
    days: int = Query(30, ge=1, le=730),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(user_id)
    start = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    rows = await db.execute(
        select(
            ReviewEvent.study_date,
            func.count(ReviewEvent.id),
            func.sum(func.cast(ReviewEvent.is_correct, Integer)),
        )
        .where(ReviewEvent.user_id == uid, ReviewEvent.study_date >= start)
        .group_by(ReviewEvent.study_date)
        .order_by(ReviewEvent.study_date)
    )
    points = [(row[0], row[1], int(row[2] or 0)) for row in rows]
    if not points:
        legacy = await db.execute(
            select(StudyRecord.date, StudyRecord.count, StudyRecord.correct)
            .where(StudyRecord.user_id == uid, StudyRecord.date >= start)
            .order_by(StudyRecord.date)
        )
        points = [(row[0], row[1], row[2]) for row in legacy]

    cumulative = 0
    result = []
    for day, count, correct in points:
        cumulative += count
        result.append(
            TrendPoint(
                date=day.isoformat(),
                count=count,
                correct=correct,
                cumulative=cumulative,
            )
        )
    return result


@router.get("/compare", response_model=StatsCompare)
async def stats_compare(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(user_id)
    rows = await db.execute(
        select(
            ReviewEvent.user_id,
            func.sum(func.cast(ReviewEvent.is_correct, Integer)),
            func.count(ReviewEvent.id),
        ).group_by(ReviewEvent.user_id)
    )
    accuracies = {
        row[0]: (row[1] / row[2] if row[2] else 0.0)
        for row in rows
    }
    your_accuracy = accuracies.get(uid, 0.0)
    avg_accuracy = sum(accuracies.values()) / len(accuracies) if accuracies else 0.0
    day_rows = await db.execute(
        select(ReviewEvent.study_date)
        .where(ReviewEvent.user_id == uid)
        .distinct()
    )
    return StatsCompare(
        your_accuracy=round(your_accuracy, 4),
        avg_accuracy=round(avg_accuracy, 4),
        your_streak=_streak({row[0] for row in day_rows}),
        avg_streak=0,
    )
