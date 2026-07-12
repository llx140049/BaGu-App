from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID


# ─── Question ───
class QuestionCreate(BaseModel):
    cat: str
    q: str
    a: str
    source: Optional[str] = ""
    tags: Optional[List[str]] = []


class QuestionUpdate(BaseModel):
    cat: Optional[str] = None
    q: Optional[str] = None
    a: Optional[str] = None
    source: Optional[str] = None
    tags: Optional[List[str]] = None


class QuestionResponse(BaseModel):
    id: UUID
    user_id: UUID
    cat: str
    q: str
    a: str
    source: Optional[str] = ""
    tags: Optional[List[str]] = []
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Upload ───
class UploadPreview(BaseModel):
    file_name: str
    questions: List[QuestionCreate]


class UploadConfirm(BaseModel):
    file_name: str
    file_type: str = "pdf"
    questions: List[QuestionCreate]


class UploadRecordResponse(BaseModel):
    id: UUID
    file_name: str
    file_type: Optional[str] = "pdf"
    question_count: int = 0
    status: str = "completed"
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Progress ───
class ProgressBatchItem(BaseModel):
    question_id: UUID
    level: int = 0
    correct: int = 0
    incorrect: int = 0
    last_review: Optional[datetime] = None
    next_review: Optional[datetime] = None
    is_starred: Optional[bool] = None


class ProgressBatchRequest(BaseModel):
    items: List[ProgressBatchItem]


class ProgressResponse(BaseModel):
    id: UUID
    question_id: UUID
    level: int = 0
    correct: int = 0
    incorrect: int = 0
    last_review: Optional[datetime] = None
    next_review: Optional[datetime] = None
    is_starred: bool = False

    model_config = {"from_attributes": True}


# ─── Stats ───
class StatsOverview(BaseModel):
    total: int = 0
    learned: int = 0
    learning: int = 0
    starred: int = 0
    accuracy: float = 0.0


class CalendarDay(BaseModel):
    date: str
    count: int = 0


class TrendPoint(BaseModel):
    date: str
    count: int = 0
    correct: int = 0
    cumulative: int = 0


class StatsCompare(BaseModel):
    your_accuracy: float = 0.0
    avg_accuracy: float = 0.0
    your_streak: int = 0
    avg_streak: int = 0


# ─── Auth ───
class AuthRegister(BaseModel):
    email: str
    password: str


class AuthLogin(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str = ""
