"""Database-backed synchronization API."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import Document, Question, SyncSnapshot

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])

LEGACY_SYNC_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads")) / "_sync"
LEGACY_FILES = {
    "questions": "questions.json",
    "progress": "progress.json",
    "documents": "documents.json",
    "settings": "settings.json",
    "study_records": "study_records.json",
}


def _read_legacy_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _store(value: object) -> dict:
    return dict(value) if isinstance(value, dict) else {}


def _tag_list(value: object) -> list[str]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = [value]
    if not isinstance(value, list):
        return []
    return [tag.strip() for tag in value if isinstance(tag, str) and tag.strip()]


async def _snapshot(db: AsyncSession, user_id: str) -> SyncSnapshot:
    try:
        owner_id = UUID(user_id)
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc
    snapshot = await db.get(SyncSnapshot, owner_id)
    if snapshot is not None:
        return snapshot

    # One-time local development compatibility: read the previous JSON data
    # only when the user has no PostgreSQL snapshot yet. Never write JSON again.
    legacy_dir = LEGACY_SYNC_DIR / str(owner_id)
    values = {
        field: _read_legacy_json(legacy_dir / filename)
        for field, filename in LEGACY_FILES.items()
    }
    snapshot = SyncSnapshot(user_id=owner_id, **values)
    db.add(snapshot)
    await db.flush()
    return snapshot


class SyncPushRequest(BaseModel):
    questions: list[dict] = []
    progress: list[dict] = []
    documents: list[dict] = []
    settings: dict = {}
    study_records: list[dict] = []


class SyncPullResponse(BaseModel):
    questions: list[dict]
    progress: list[dict]
    documents: list[dict]
    settings: dict
    study_records: list[dict]
    synced_at: str


class DeleteDocumentsRequest(BaseModel):
    document_ids: list[str]
    delete_related_questions: bool = False


class DeleteQuestionsRequest(BaseModel):
    question_ids: list[str]


class UpdateDocumentCategoryRequest(BaseModel):
    document_id: str
    category: str


@router.post("/push")
async def sync_push(
    body: SyncPushRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snapshot = await _snapshot(db, user_id)
    existing_questions = _store(snapshot.questions)
    for question in body.questions:
        question_id = question.get("id")
        if question_id:
            existing_questions[question_id] = {**question, "tags": _tag_list(question.get("tags"))}
    snapshot.questions = existing_questions

    existing_progress = _store(snapshot.progress)
    for progress in body.progress:
        question_id = progress.get("question_id")
        if question_id:
            existing_progress[question_id] = progress
    snapshot.progress = existing_progress

    existing_documents = _store(snapshot.documents)
    for item in body.documents:
        document_id = item.get("id")
        if not document_id:
            continue
        try:
            document = await db.scalar(
                select(Document).where(Document.id == UUID(document_id), Document.user_id == UUID(user_id))
            )
        except ValueError:
            document = None
        if document is None:
            existing_documents[document_id] = {**item, "tags": _tag_list(item.get("tags"))}
            continue
        existing_documents[document_id] = {
            "id": str(document.id),
            "title": document.title,
            "cat": document.cat,
            "content": document.content,
            "source": document.source,
            "has_original_file": bool(document.original_file_key),
            "tags": document.tags or [],
            "scroll_offset": document.scroll_offset or 0,
            "reading_progress": document.reading_progress or 0,
            "last_read_at": document.last_read_at.isoformat() if document.last_read_at else None,
            "created_at": document.created_at.isoformat() if document.created_at else None,
        }
    snapshot.documents = existing_documents

    if body.settings:
        snapshot.settings = dict(body.settings)

    existing_records = _store(snapshot.study_records)
    for record in body.study_records:
        date = record.get("date")
        if date:
            existing_records[date] = record
    snapshot.study_records = existing_records
    await db.commit()

    return {
        "status": "ok",
        "questions": len(existing_questions),
        "progress": len(existing_progress),
        "documents": len(existing_documents),
        "study_records": len(existing_records),
    }


@router.get("/pull", response_model=SyncPullResponse)
async def sync_pull(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snapshot = await _snapshot(db, user_id)
    await db.commit()
    return SyncPullResponse(
        questions=list(_store(snapshot.questions).values()),
        progress=list(_store(snapshot.progress).values()),
        documents=list(_store(snapshot.documents).values()),
        settings=_store(snapshot.settings),
        study_records=list(_store(snapshot.study_records).values()),
        synced_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/delete-documents")
async def delete_synced_documents(
    body: DeleteDocumentsRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        document_ids = [UUID(document_id) for document_id in set(body.document_ids)]
        owner_id = UUID(user_id)
    except ValueError as exc:
        raise HTTPException(400, detail="Invalid document id") from exc
    if not document_ids:
        return {"deleted_documents": 0, "deleted_questions": 0}

    documents = list(await db.scalars(select(Document).where(Document.user_id == owner_id, Document.id.in_(document_ids))))
    questions = list(await db.scalars(select(Question).where(Question.user_id == owner_id, Question.source_document_id.in_(document_ids))))
    if body.delete_related_questions:
        for question in questions:
            await db.delete(question)
    else:
        for question in questions:
            question.source_document_id = None
    for document in documents:
        await db.delete(document)

    snapshot = await _snapshot(db, user_id)
    document_ids_as_text = {str(document_id) for document_id in document_ids}
    document_store = _store(snapshot.documents)
    for document_id in document_ids_as_text:
        document_store.pop(document_id, None)
    snapshot.documents = document_store

    question_store = _store(snapshot.questions)
    removed_question_ids: set[str] = set()
    for question_id, question in list(question_store.items()):
        if question.get("source_document_id") not in document_ids_as_text:
            continue
        if body.delete_related_questions:
            removed_question_ids.add(question_id)
            question_store.pop(question_id, None)
        else:
            question["source_document_id"] = None
            question["source_document_ids"] = []
    snapshot.questions = question_store
    if body.delete_related_questions:
        progress_store = _store(snapshot.progress)
        for question_id in removed_question_ids:
            progress_store.pop(question_id, None)
        snapshot.progress = progress_store
    await db.commit()
    return {"deleted_documents": len(documents), "deleted_questions": len(questions) if body.delete_related_questions else 0}


@router.post("/delete-questions")
async def delete_synced_questions(
    body: DeleteQuestionsRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        question_ids = [UUID(question_id) for question_id in set(body.question_ids)]
        owner_id = UUID(user_id)
    except ValueError as exc:
        raise HTTPException(400, detail="Invalid question id") from exc
    if not question_ids:
        return {"deleted_questions": 0}

    questions = list(await db.scalars(select(Question).where(Question.user_id == owner_id, Question.id.in_(question_ids))))
    for question in questions:
        await db.delete(question)
    snapshot = await _snapshot(db, user_id)
    question_ids_as_text = {str(question_id) for question_id in question_ids}
    question_store = _store(snapshot.questions)
    for question_id in question_ids_as_text:
        question_store.pop(question_id, None)
    snapshot.questions = question_store
    progress_store = _store(snapshot.progress)
    for question_id in question_ids_as_text:
        progress_store.pop(question_id, None)
    snapshot.progress = progress_store
    await db.commit()
    return {"deleted_questions": len(questions)}


@router.post("/update-document-category")
async def update_document_category(
    body: UpdateDocumentCategoryRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = body.category.strip()
    if not category:
        raise HTTPException(400, detail="Category cannot be empty")
    try:
        document_id = UUID(body.document_id)
        owner_id = UUID(user_id)
    except ValueError as exc:
        raise HTTPException(400, detail="Invalid document id") from exc
    document = await db.scalar(select(Document).where(Document.id == document_id, Document.user_id == owner_id))
    if document is None:
        raise HTTPException(404, detail="Document not found")

    document.cat = category
    questions = list(await db.scalars(select(Question).where(Question.user_id == owner_id, Question.source_document_id == document_id)))
    for question in questions:
        question.cat = category
    snapshot = await _snapshot(db, user_id)
    document_store = _store(snapshot.documents)
    if body.document_id in document_store:
        document_store[body.document_id]["cat"] = category
    snapshot.documents = document_store
    question_store = _store(snapshot.questions)
    for question in question_store.values():
        if question.get("source_document_id") == body.document_id:
            question["cat"] = category
    snapshot.questions = question_store
    await db.commit()
    return {"document_id": body.document_id, "category": category, "updated_questions": len(questions)}
