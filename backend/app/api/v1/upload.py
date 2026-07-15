import os
import uuid
import traceback
from pathlib import Path
from collections import defaultdict
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import Document, Question
from app.services.pdf_service import extract_text_from_pdf, extract_text_from_markdown
from app.services.deepseek import generate_questions_from_text

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_preview_store: dict[str, dict] = {}


def _fix_qa_swap(q_item: dict) -> dict:
    """Detect and fix cases where DeepSeek swapped q and a fields.
    
    Heuristics:
    - If 'a' ends with '？' it's likely a question → swap
    - If len(q) > len(a) * 1.5, q is the answer and a is the question → swap
    - If 'a' contains question words and 'q' doesn't → swap
    """
    q_text = q_item.get("q", "")
    a_text = q_item.get("a", "")
    if not q_text or not a_text:
        return q_item
    
    should_swap = False
    
    # If 'a' ends with Chinese question mark, it's definitely a question
    if a_text.strip().endswith("？"):
        should_swap = True
    
    # If 'q' is significantly longer than 'a', likely swapped
    if not should_swap and len(q_text) > len(a_text) * 1.5 and len(q_text) > 15:
        should_swap = True
    
    # If 'a' contains question words (common in Chinese interview questions)
    question_words = ["什么", "如何", "为什么", "怎么", "哪些", "是否", "怎样", "简述", "解释", "描述"]
    if not should_swap:
        a_has_question_word = any(w in a_text for w in question_words)
        q_has_question_word = any(w in q_text for w in question_words)
        if a_has_question_word and not q_has_question_word:
            should_swap = True
    
    if should_swap:
        q_item["q"], q_item["a"] = q_item["a"], q_item["q"]
    
    return q_item


@router.post("/pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    generate_questions: bool = Form(True),
):
    try:
        filename = file.filename or "untitled"
        ext = os.path.splitext(filename)[1].lower()

        if ext == ".pdf":
            file_type = "pdf"
        elif ext in (".md", ".markdown", ".txt", ".text"):
            file_type = "markdown"
        else:
            raise HTTPException(400, detail=f"不支持的文件格式: {ext}，请上传 PDF、Markdown(.md) 或文本文件(.txt)")

        file_bytes = await file.read()
        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(file_bytes) > max_size:
            raise HTTPException(400, detail=f"文件过大，最大 {settings.MAX_UPLOAD_SIZE_MB}MB")

        # Save
        file_id = str(uuid.uuid4())
        save_path = UPLOAD_DIR / f"{file_id}{ext}"
        with open(save_path, "wb") as f:
            f.write(file_bytes)

        try:
            text = await extract_text_from_pdf(file_bytes, filename) if file_type == "pdf" else await extract_text_from_markdown(file_bytes, filename)
            if not text.strip():
                raise HTTPException(400, detail="无法从文件中提取到任何文本内容")

            document_id = str(uuid.uuid4())

            validated = []
            if generate_questions:
                questions = await generate_questions_from_text(text)
                for q in questions:
                    if not isinstance(q, dict) or "cat" not in q or "q" not in q or "a" not in q:
                        continue
                    item = {
                        "cat": str(q["cat"]),
                        "q": str(q["q"]),
                        "a": str(q["a"]),
                        "source_document_id": document_id,
                        "source_document_ids": [document_id],
                    }
                    item = _fix_qa_swap(item)
                    validated.append(item)

            if generate_questions and not validated:
                raise HTTPException(500, detail="AI 未能生成有效题目，请检查 DeepSeek API Key 或重试")

            preview_token = str(uuid.uuid4())
            _preview_store[preview_token] = {
                "document_id": document_id,
                "file_name": filename,
                "file_type": file_type,
                "file_path": str(save_path),
                "content": text,
                "questions": validated,
                "generate_questions": generate_questions,
            }

            grouped: dict[str, list[dict]] = defaultdict(list)
            for q in validated:
                grouped[q["cat"]].append(q)

            return {
                "preview_token": preview_token,
                "document_id": document_id,
                "file_name": filename,
                "total": len(validated),
                "generate_questions": generate_questions,
                "content": text,
                "categories": [
                    {"cat": cat, "count": len(items), "questions": items}
                    for cat, items in grouped.items()
                ],
            }
        except HTTPException:
            raise
        except Exception as e:
            try:
                os.unlink(save_path)
            except OSError:
                pass
            raise HTTPException(500, detail=f"处理失败: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=f"上传失败: {str(e)}")


@router.post("/confirm")
async def confirm_upload(
    body: dict,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = body.get("preview_token", "")
    if token not in _preview_store:
        raise HTTPException(404, detail="预览数据已过期，请重新上传")

    preview = _preview_store[token]
    questions = preview["questions"]

    for edit in body.get("edits", []):
        idx = edit.get("index")
        if isinstance(idx, int) and 0 <= idx < len(questions):
            for key in ("cat", "q", "a"):
                if key in edit:
                    questions[idx][key] = edit[key]

    questions = [q for q in questions if not q.get("_deleted")]
    try:
        owner_id = uuid.UUID(user_id)
        document_id = uuid.UUID(preview["document_id"])
    except ValueError as exc:
        raise HTTPException(401, detail="Invalid user id") from exc

    document = await db.scalar(select(Document).where(Document.id == document_id, Document.user_id == owner_id))
    content = preview["content"]
    if document is None:
        document = Document(
            id=document_id,
            user_id=owner_id,
            title=preview["file_name"],
            cat="导入文档",
            content=content,
            source="AI 导入",
            source_file_name=preview["file_name"],
        )
        db.add(document)
    else:
        document.content = content
    for item in questions:
        db.add(
            Question(
                user_id=owner_id,
                cat=item["cat"],
                q=item["q"],
                a=item["a"],
                source=item.get("source", ""),
                source_document_id=document_id,
                tags=item.get("tags", []),
            )
        )
    await db.commit()
    _preview_store.pop(token, None)

    return {
        "imported": len(questions),
        "document_id": preview["document_id"],
        "file_name": preview["file_name"],
        "content": content,
        "questions": questions,
        "generate_questions": preview["generate_questions"],
    }
