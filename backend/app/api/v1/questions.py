from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

router = APIRouter(prefix="/api/v1/questions", tags=["questions"])

@router.get("/")
async def list_questions():
    """List questions (stub — used via frontend SQLite)."""
    return []

@router.get("/{question_id}")
async def get_question(question_id: str):
    raise HTTPException(501, detail="Not implemented")

@router.put("/{question_id}")
async def update_question(question_id: str):
    raise HTTPException(501, detail="Not implemented")

@router.delete("/{question_id}")
async def delete_question(question_id: str):
    raise HTTPException(501, detail="Not implemented")
