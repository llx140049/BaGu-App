import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    cat = Column(String(100), nullable=False, default="")
    content = Column(Text, nullable=False, default="")
    source = Column(String(255), default="")
    source_file_name = Column(String(255), default="")
    original_file_key = Column(String(255), default="")
    tags = Column(JSON, default=list)
    scroll_offset = Column(Float, nullable=False, default=0)
    reading_progress = Column(Float, nullable=False, default=0)
    last_read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    @property
    def has_original_file(self) -> bool:
        return bool(self.original_file_key)


class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    cat = Column(String(100), nullable=False)
    q = Column(Text, nullable=False)
    a = Column(Text, nullable=False)
    source = Column(String(255), default="")
    source_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True, index=True)
    # JSON works with both the local SQLite database and PostgreSQL.
    tags = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    source_document = relationship("Document", foreign_keys=[source_document_id], lazy="joined")


class QuestionSource(Base):
    __tablename__ = "question_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False, index=True)
    source_kind = Column(String(50), default="derived")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    question = relationship("Question", foreign_keys=[question_id], lazy="joined")
    document = relationship("Document", foreign_keys=[document_id], lazy="joined")


class UploadRecord(Base):
    __tablename__ = "upload_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(20), default="pdf")
    file_url = Column(Text, default="")
    question_count = Column(Integer, default=0)
    status = Column(String(20), default="processing")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CardProgress(Base):
    __tablename__ = "card_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    question_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    level = Column(Integer, default=0)
    correct = Column(Integer, default=0)
    incorrect = Column(Integer, default=0)
    last_review = Column(DateTime(timezone=True), nullable=True)
    next_review = Column(DateTime(timezone=True), nullable=True)
    is_starred = Column(Boolean, default=False)


class StudyRecord(Base):
    __tablename__ = "study_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    date = Column(Date, nullable=False)
    count = Column(Integer, default=0)
    correct = Column(Integer, default=0)
    incorrect = Column(Integer, default=0)
    new_count = Column(Integer, default=0)


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_settings_user_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    daily_new_target = Column(Integer, nullable=False, default=10)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ReviewEvent(Base):
    """Immutable history of one question review."""

    __tablename__ = "review_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False, index=True)
    category = Column(String(100), nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, index=True)
    study_date = Column(Date, nullable=False, index=True)
    is_correct = Column(Boolean, nullable=False, default=False)
    quality = Column(Integer, nullable=False, default=0)
    session_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    question = relationship("Question", foreign_keys=[question_id], lazy="joined")
