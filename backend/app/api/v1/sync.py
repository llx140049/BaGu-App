"""Sync API — push/pull questions and progress."""
import os, json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.database import get_db
from app.models.question import Document, Question
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])

DATA_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads")) / "_sync"

QUESTIONS_FILE = "questions.json"
PROGRESS_FILE = "progress.json"
DOCUMENTS_FILE = "documents.json"
SETTINGS_FILE = "settings.json"
STUDY_RECORDS_FILE = "study_records.json"

def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _write_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _user_dir(user_id: str) -> Path:
    d = DATA_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _tag_list(value: object) -> list[str]:
    """Keep sync payloads compatible with both SQLite JSON text and API arrays."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = [value]
    if not isinstance(value, list):
        return []
    return [tag.strip() for tag in value if isinstance(tag, str) and tag.strip()]

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
    ud = _user_dir(user_id)
    
    existing_q = _read_json(ud / QUESTIONS_FILE)
    for q in body.questions:
        qid = q.get("id")
        if qid:
            existing_q[qid] = {**q, "tags": _tag_list(q.get("tags"))}
    _write_json(ud / QUESTIONS_FILE, existing_q)
    
    existing_p = _read_json(ud / PROGRESS_FILE)
    for p in body.progress:
        pid = p.get("question_id")
        if pid:
            existing_p[pid] = p
    _write_json(ud / PROGRESS_FILE, existing_p)

    existing_d = _read_json(ud / DOCUMENTS_FILE)
    for d in body.documents:
        did = d.get("id")
        if did:
            # Documents confirmed through /upload/confirm already have the
            # extracted source text in the database. Prefer that canonical
            # copy so an older device cannot replace it with its legacy Q/A
            # summary during a later sync.
            try:
                document = await db.scalar(
                    select(Document).where(Document.id == UUID(did), Document.user_id == UUID(user_id))
                )
            except ValueError:
                document = None
            if document is not None:
                existing_d[did] = {
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
            else:
                existing_d[did] = {**d, "tags": _tag_list(d.get("tags"))}
    _write_json(ud / DOCUMENTS_FILE, existing_d)

    if body.settings:
        _write_json(ud / SETTINGS_FILE, body.settings)

    existing_records = _read_json(ud / STUDY_RECORDS_FILE)
    for record in body.study_records:
        date = record.get("date")
        if date:
            existing_records[date] = record
    _write_json(ud / STUDY_RECORDS_FILE, existing_records)
    
    return {"status": "ok", "questions": len(existing_q), "progress": len(existing_p), "documents": len(existing_d), "study_records": len(existing_records)}

@router.get("/pull", response_model=SyncPullResponse)
async def sync_pull(user_id: str = Depends(get_current_user)):
    ud = _user_dir(user_id)
    questions = list(_read_json(ud / QUESTIONS_FILE).values())
    progress = list(_read_json(ud / PROGRESS_FILE).values())
    documents = list(_read_json(ud / DOCUMENTS_FILE).values())
    settings = _read_json(ud / SETTINGS_FILE)
    study_records = list(_read_json(ud / STUDY_RECORDS_FILE).values())
    return SyncPullResponse(
        questions=questions,
        progress=progress,
        documents=documents,
        settings=settings,
        study_records=study_records,
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

    documents = list(await db.scalars(
        select(Document).where(Document.user_id == owner_id, Document.id.in_(document_ids))
    ))
    existing_document_ids = {str(document.id) for document in documents}
    questions = list(await db.scalars(
        select(Question).where(Question.user_id == owner_id, Question.source_document_id.in_(document_ids))
    ))

    if body.delete_related_questions:
        for question in questions:
            await db.delete(question)
    else:
        for question in questions:
            question.source_document_id = None

    for document in documents:
        await db.delete(document)
    await db.commit()

    user_directory = _user_dir(user_id)
    document_id_strings = {str(document_id) for document_id in document_ids}
    document_store = _read_json(user_directory / DOCUMENTS_FILE)
    for document_id in document_id_strings:
        document_store.pop(document_id, None)
    _write_json(user_directory / DOCUMENTS_FILE, document_store)

    question_store = _read_json(user_directory / QUESTIONS_FILE)
    removed_question_ids: set[str] = set()
    for question_id, question in list(question_store.items()):
        if question.get("source_document_id") not in document_id_strings:
            continue
        if body.delete_related_questions:
            removed_question_ids.add(question_id)
            question_store.pop(question_id, None)
        else:
            question["source_document_id"] = None
            question["source_document_ids"] = []
    _write_json(user_directory / QUESTIONS_FILE, question_store)

    if body.delete_related_questions:
        progress_store = _read_json(user_directory / PROGRESS_FILE)
        for question_id in removed_question_ids:
            progress_store.pop(question_id, None)
        _write_json(user_directory / PROGRESS_FILE, progress_store)

    return {
        "deleted_documents": len(existing_document_ids),
        "deleted_questions": len(questions) if body.delete_related_questions else 0,
    }


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

    questions = list(await db.scalars(
        select(Question).where(Question.user_id == owner_id, Question.id.in_(question_ids))
    ))
    for question in questions:
        await db.delete(question)
    await db.commit()

    user_directory = _user_dir(user_id)
    question_id_strings = {str(question_id) for question_id in question_ids}
    question_store = _read_json(user_directory / QUESTIONS_FILE)
    for question_id in question_id_strings:
        question_store.pop(question_id, None)
    _write_json(user_directory / QUESTIONS_FILE, question_store)

    progress_store = _read_json(user_directory / PROGRESS_FILE)
    for question_id in question_id_strings:
        progress_store.pop(question_id, None)
    _write_json(user_directory / PROGRESS_FILE, progress_store)

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

    document = await db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == owner_id)
    )
    if document is None:
        raise HTTPException(404, detail="Document not found")

    document.cat = category
    questions = list(await db.scalars(
        select(Question).where(Question.user_id == owner_id, Question.source_document_id == document_id)
    ))
    for question in questions:
        question.cat = category
    await db.commit()

    user_directory = _user_dir(user_id)
    document_store = _read_json(user_directory / DOCUMENTS_FILE)
    if body.document_id in document_store:
        document_store[body.document_id]["cat"] = category
    _write_json(user_directory / DOCUMENTS_FILE, document_store)

    question_store = _read_json(user_directory / QUESTIONS_FILE)
    for question in question_store.values():
        if question.get("source_document_id") == body.document_id:
            question["cat"] = category
    _write_json(user_directory / QUESTIONS_FILE, question_store)

    return {"document_id": body.document_id, "category": category, "updated_questions": len(questions)}
