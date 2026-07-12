from fastapi import APIRouter
from app.schemas.schemas import StatsOverview, CalendarDay, TrendPoint, StatsCompare

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/overview", response_model=StatsOverview)
async def stats_overview():
    """Get learning overview stats (stub for P1)."""
    raise NotImplementedError("to be implemented in P1")


@router.get("/calendar", response_model=list[CalendarDay])
async def stats_calendar():
    """Get calendar heatmap data (stub for P1)."""
    raise NotImplementedError("to be implemented in P1")


@router.get("/trend", response_model=list[TrendPoint])
async def stats_trend():
    """Get learning trend data (stub for P1)."""
    raise NotImplementedError("to be implemented in P1")


@router.get("/compare", response_model=StatsCompare)
async def stats_compare():
    """Compare with other users (stub for P1)."""
    raise NotImplementedError("to be implemented in P1")
