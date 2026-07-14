from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import CardProgress, Document, Question
from app.schemas.schemas import QuestionCreate, QuestionResponse, QuestionUpdate

router = APIRouter(prefix="/api/v1/questions", tags=["questions"])


def _user_uuid(user_id: str) -> UUID:
    try:
        return UUID(user_id)
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc


def _response(question: Question) -> QuestionResponse:
    source_id = question.source_document_id
    return QuestionResponse(
        id=question.id,
        user_id=question.user_id,
        cat=question.cat,
        q=question.q,
        a=question.a,
        source=question.source or "",
        source_document_id=source_id,
        source_document_ids=[source_id] if source_id else [],
        tags=question.tags or [],
        created_at=question.created_at,
    )


async def _question_or_404(question_id: UUID, user_id: UUID, db: AsyncSession) -> Question:
    question = await db.scalar(select(Question).where(Question.id == question_id, Question.user_id == user_id))
    if question is None:
        raise HTTPException(404, detail="Question not found")
    return question


async def _validate_document(document_id: UUID | None, user_id: UUID, db: AsyncSession) -> None:
    if document_id is None:
        return
    found = await db.scalar(select(Document.id).where(Document.id == document_id, Document.user_id == user_id))
    if found is None:
        raise HTTPException(400, detail="Source document not found")


@router.get("/", response_model=list[QuestionResponse])
async def list_questions(
    document_id: UUID | None = None,
    starred: bool | None = None,
    mistakes: bool | None = None,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _user_uuid(user_id)
    statement = select(Question).where(Question.user_id == uid).order_by(Question.created_at.desc())
    if document_id is not None:
        statement = statement.where(Question.source_document_id == document_id)
    if starred is not None:
        starred_ids = select(CardProgress.question_id).where(CardProgress.user_id == uid, CardProgress.is_starred.is_(starred))
        statement = statement.where(Question.id.in_(starred_ids))
    if mistakes:
        mistake_ids = select(CardProgress.question_id).where(CardProgress.user_id == uid, CardProgress.incorrect > 0)
        statement = statement.where(Question.id.in_(mistake_ids))
    result = await db.scalars(statement)
    return [_response(question) for question in result]


@router.post("/", response_model=QuestionResponse, status_code=201)
async def create_question(body: QuestionCreate, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = _user_uuid(user_id)
    source_id = body.source_document_id or (body.source_document_ids[0] if body.source_document_ids else None)
    await _validate_document(source_id, uid, db)
    question = Question(
        user_id=uid,
        cat=body.cat,
        q=body.q,
        a=body.a,
        source=body.source or "",
        source_document_id=source_id,
        tags=body.tags or [],
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return _response(question)


@router.get("/{question_id}", response_model=QuestionResponse)
async def get_question(question_id: UUID, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _response(await _question_or_404(question_id, _user_uuid(user_id), db))


@router.put("/{question_id}", response_model=QuestionResponse)
async def update_question(question_id: UUID, body: QuestionUpdate, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uid = _user_uuid(user_id)
    question = await _question_or_404(question_id, uid, db)
    updates = body.model_dump(exclude_unset=True)
    document_ids = updates.pop("source_document_ids", None)
    source_id = updates.get("source_document_id")
    if source_id is None and document_ids is not None:
        source_id = document_ids[0] if document_ids else None
        updates["source_document_id"] = source_id
    if "source_document_id" in updates:
        await _validate_document(source_id, uid, db)
    for field, value in updates.items():
        setattr(question, field, value)
    await db.commit()
    await db.refresh(question)
    return _response(question)


@router.delete("/{question_id}", status_code=204)
async def delete_question(question_id: UUID, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    question = await _question_or_404(question_id, _user_uuid(user_id), db)
    await db.delete(question)
    await db.commit()
