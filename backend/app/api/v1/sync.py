"""Sync API — push/pull questions and progress."""
import os, json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.security import get_current_user

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

@router.post("/push")
async def sync_push(body: SyncPushRequest, user_id: str = Depends(get_current_user)):
    ud = _user_dir(user_id)
    
    existing_q = _read_json(ud / QUESTIONS_FILE)
    for q in body.questions:
        qid = q.get("id")
        if qid:
            existing_q[qid] = q
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
            existing_d[did] = d
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
