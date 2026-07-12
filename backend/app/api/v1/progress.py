from fastapi import APIRouter
from app.schemas.schemas import ProgressBatchRequest, ProgressResponse

router = APIRouter(prefix="/api/v1/progress", tags=["progress"])


@router.post("/batch")
async def batch_sync_progress(body: ProgressBatchRequest):
    """Batch sync learning progress (stub for P1)."""
    raise NotImplementedError("to be implemented in P1")
