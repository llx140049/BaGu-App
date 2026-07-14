from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import Document, Question
from app.schemas.schemas import DocumentCreate, DocumentResponse, DocumentUpdate, ReadingProgressUpdate

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


def _user_uuid(user_id: str) -> UUID:
    try:
        return UUID(user_id)
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc


async def _document_or_404(document_id: UUID, user_id: UUID, db: AsyncSession) -> Document:
    document = await db.scalar(select(Document).where(Document.id == document_id, Document.user_id == user_id))
    if document is None:
        raise HTTPException(404, detail="Document not found")
    return document


@router.get("/", response_model=list[DocumentResponse])
async def list_documents(user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = _user_uuid(user_id)
    result = await db.scalars(select(Document).where(Document.user_id == uid).order_by(Document.last_read_at.desc(), Document.created_at.desc()))
    return list(result)


@router.post("/", response_model=DocumentResponse, status_code=201)
async def create_document(body: DocumentCreate, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    document = Document(user_id=_user_uuid(user_id), **body.model_dump())
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: UUID, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _document_or_404(document_id, _user_uuid(user_id), db)


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(document_id: UUID, body: DocumentUpdate, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    document = await _document_or_404(document_id, _user_uuid(user_id), db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(document, field, value)
    await db.commit()
    await db.refresh(document)
    return document


@router.put("/{document_id}/reading-progress", response_model=DocumentResponse)
async def update_reading_progress(document_id: UUID, body: ReadingProgressUpdate, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    document = await _document_or_404(document_id, _user_uuid(user_id), db)
    document.scroll_offset = max(0, body.scroll_offset)
    document.reading_progress = min(100, max(0, body.reading_progress))
    document.last_read_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(document)
    return document


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: UUID, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = _user_uuid(user_id)
    document = await _document_or_404(document_id, uid, db)
    questions = await db.scalars(select(Question).where(Question.user_id == uid, Question.source_document_id == document.id))
    for question in questions:
        question.source_document_id = None
    await db.delete(document)
    await db.commit()
