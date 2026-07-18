import os
import uuid
import traceback
from pathlib import Path
from collections import defaultdict
from urllib.parse import unquote
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.question import Document, Question
from app.services.pdf_service import extract_markdown_from_pdf, extract_text_from_markdown, extract_text_from_pdf
from app.services.deepseek import generate_questions_from_text

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_preview_store: dict[str, dict] = {}


def _preview_response(preview_token: str, preview: dict) -> dict:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for question in preview["questions"]:
        grouped[question["cat"]].append(question)
    return {
        "preview_token": preview_token,
        "document_id": preview["document_id"],
        "file_name": preview["file_name"],
        "file_type": preview["file_type"],
        "total": len(preview["questions"]),
        "generate_questions": preview["generate_questions"],
        "content": preview["content"],
        "categories": [
            {"cat": cat, "count": len(items), "questions": items}
            for cat, items in grouped.items()
        ],
    }


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
        filename = unquote(file.filename or "untitled").replace("\\", "/").split("/")[-1] or "untitled"
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
            if file_type == "pdf":
                image_dir = UPLOAD_DIR / f"{file_id}-assets"
                image_dir.mkdir(parents=True, exist_ok=True)
                text = await extract_markdown_from_pdf(file_bytes, filename, image_dir, f"/api/v1/document-assets/{image_dir.name}/")
                question_text = await extract_text_from_pdf(file_bytes, filename)
            else:
                text = await extract_text_from_markdown(file_bytes, filename)
                question_text = text
            if not text.strip():
                raise HTTPException(400, detail="无法从文件中提取到任何文本内容")

            document_id = str(uuid.uuid4())

            validated = []
            if generate_questions:
                questions = await generate_questions_from_text(question_text)
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
                "question_content": question_text,
                "questions": validated,
                "generate_questions": generate_questions,
            }

            return _preview_response(preview_token, _preview_store[preview_token])
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


@router.post("/generate")
async def generate_preview_questions(body: dict):
    """Generate questions only after the document has been parsed successfully."""
    token = body.get("preview_token", "")
    preview = _preview_store.get(token)
    if preview is None:
        raise HTTPException(404, detail="导入数据已过期，请重新选择文件")

    try:
        generated = await generate_questions_from_text(preview["question_content"])
        validated = []
        for question in generated:
            if not isinstance(question, dict) or not {"cat", "q", "a"}.issubset(question):
                continue
            item = _fix_qa_swap({
                "cat": str(question["cat"]),
                "q": str(question["q"]),
                "a": str(question["a"]),
                "source_document_id": preview["document_id"],
                "source_document_ids": [preview["document_id"]],
            })
            validated.append(item)
        if not validated:
            raise HTTPException(500, detail="AI 未能生成有效题目，请检查 DeepSeek API Key 或重试")
        preview["questions"] = validated
        preview["generate_questions"] = True
        return _preview_response(token, preview)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, detail=f"生成题目失败: {str(exc)}") from exc


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
    category = "/".join(part.strip() for part in str(body.get("category", "导入文档")).split("/") if part.strip())
    if not category:
        category = "导入文档"
    if document is None:
        document = Document(
            id=document_id,
            user_id=owner_id,
            title=preview["file_name"],
            cat=category,
            content=content,
            source="AI 导入",
            source_file_name=preview["file_name"],
            original_file_key=Path(preview["file_path"]).name if preview["file_type"] == "pdf" else "",
        )
        db.add(document)
    else:
        document.content = content
        document.cat = category
        document.source_file_name = preview["file_name"]
        document.original_file_key = Path(preview["file_path"]).name if preview["file_type"] == "pdf" else ""
    for item in questions:
        # Keep generated questions in the same directory as their source document.
        item["cat"] = document.cat
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
        "category": document.cat,
        "content": content,
        "questions": questions,
        "generate_questions": preview["generate_questions"],
        "has_original_file": bool(document.original_file_key),
    }
