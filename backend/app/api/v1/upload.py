import os
import uuid
import traceback
import re
from difflib import SequenceMatcher
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
from app.services.deepseek import align_question_tags_with_existing, generate_questions_from_text, generate_tags_from_text
from app.services.object_storage import object_storage

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_preview_store: dict[str, dict] = {}
CHUNK_MAX_CHARS = 30_000


def _normalize_tags(value) -> list[str]:
    """Keep imported AI tags compact and safe for both SQLite and PostgreSQL."""
    if isinstance(value, str):
        values = value.replace("，", ",").replace("、", ",").split(",")
    elif isinstance(value, list):
        values = value
    else:
        values = []
    tags: list[str] = []
    for value in values:
        tag = str(value).strip().strip("#")
        if tag and tag not in tags:
            tags.append(tag[:50])
    return tags[:3]


def _normalize_question_tags(value) -> list[str]:
    # A question belongs to one reusable parent topic. Multiple tags made the
    # study scope fragment into many near-duplicate, overly specific entries.
    return _normalize_tags(value)[:1]


def _section_title(line: str, fallback_index: int) -> str:
    heading = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
    if heading:
        return heading.group(1).strip()
    page = re.match(r"^---\s*(?:第\s*)?(\d+)\s*(?:页|page)\s*---\s*$", line, re.IGNORECASE)
    if page:
        return f"第 {page.group(1)} 页"
    return f"第 {fallback_index} 段"


def _split_long_section(title: str, content: str) -> list[dict]:
    """Split an oversized section on paragraph boundaries, then on lines."""
    chunks: list[dict] = []
    current = ""
    for paragraph in re.split(r"\n\s*\n", content):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if current and len(current) + len(paragraph) + 2 > CHUNK_MAX_CHARS:
            chunks.append({"title": title, "content": current})
            current = ""
        if len(paragraph) > CHUNK_MAX_CHARS:
            if current:
                chunks.append({"title": title, "content": current})
                current = ""
            for start in range(0, len(paragraph), CHUNK_MAX_CHARS):
                chunks.append({"title": title, "content": paragraph[start:start + CHUNK_MAX_CHARS]})
        else:
            current = f"{current}\n\n{paragraph}".strip()
    if current:
        chunks.append({"title": title, "content": current})
    return chunks


def split_study_material(text: str) -> list[dict]:
    """Create model-sized chunks using Markdown headings or PDF page separators."""
    sections: list[dict] = []
    current_title = "文档概览"
    current_lines: list[str] = []
    for line in text.splitlines():
        if re.match(r"^#{1,6}\s+\S", line) or re.match(r"^---\s*(?:第\s*)?\d+\s*(?:页|page)\s*---\s*$", line, re.IGNORECASE):
            content = "\n".join(current_lines).strip()
            if content:
                sections.append({"title": current_title, "content": content})
            current_title = _section_title(line, len(sections) + 1)
            current_lines = [line]
        else:
            current_lines.append(line)
    content = "\n".join(current_lines).strip()
    if content:
        sections.append({"title": current_title, "content": content})

    chunks: list[dict] = []
    pending_titles: list[str] = []
    pending_content = ""
    for section in sections or [{"title": "文档概览", "content": text.strip()}]:
        for piece in _split_long_section(section["title"], section["content"]):
            if pending_content and len(pending_content) + len(piece["content"]) + 2 <= CHUNK_MAX_CHARS:
                pending_content = f"{pending_content}\n\n{piece['content']}"
                if piece["title"] not in pending_titles:
                    pending_titles.append(piece["title"])
                continue
            if pending_content:
                chunks.append({"title": "、".join(pending_titles), "titles": pending_titles, "content": pending_content})
            pending_titles = [piece["title"]]
            pending_content = piece["content"]
    if pending_content:
        chunks.append({"title": "、".join(pending_titles), "titles": pending_titles, "content": pending_content})
    return [chunk for chunk in chunks if chunk["content"].strip()]


def _question_key(question: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]", "", question).casefold()


def _are_similar_questions(left: str, right: str) -> bool:
    if left == right:
        return True
    if min(len(left), len(right)) < 8:
        return False
    if left in right or right in left:
        return True
    return SequenceMatcher(None, left, right).ratio() >= 0.88


def _deduplicate_questions(questions: list[dict]) -> tuple[list[dict], int]:
    """Keep the first clear version of duplicate or near-duplicate questions."""
    unique: list[dict] = []
    keys: list[str] = []
    removed = 0
    for question in questions:
        key = _question_key(str(question.get("q", "")))
        if not key or any(_are_similar_questions(key, seen) for seen in keys):
            removed += 1
            continue
        keys.append(key)
        unique.append(question)
    return unique, removed


async def _align_question_tags(questions: list[dict], existing_tags: list[str]) -> None:
    """Use account tags when possible, but never block a successful import."""
    if not questions:
        return
    try:
        aligned = await align_question_tags_with_existing(questions, existing_tags)
        for question, tags in zip(questions, aligned):
            if tags:
                question["tags"] = _normalize_question_tags(tags)
            else:
                question["tags"] = _normalize_question_tags(question.get("tags"))
    except Exception:
        for question in questions:
            question["tags"] = _normalize_question_tags(question.get("tags"))


def _exclude_filename_tags(tags: list[str], filename: str) -> list[str]:
    """Do not treat an imported file's display name as a knowledge tag."""
    file_stem = os.path.splitext(filename)[0]

    def comparable(value: str) -> str:
        return re.sub(r"[^\w\u4e00-\u9fff]", "", value).casefold()

    filename_key = comparable(file_stem)
    return [tag for tag in tags if comparable(tag) != filename_key]


async def _generate_document_tags(text: str, filename: str) -> list[str]:
    """Tags enrich an import but must never make the import itself fail."""
    try:
        return _exclude_filename_tags(_normalize_tags(await generate_tags_from_text(text)), filename)
    except Exception:
        return []


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
        "tags": preview.get("tags", []),
        "coverage": preview.get("coverage"),
        "content": preview["content"],
        "categories": [
            {"cat": cat, "count": len(items), "questions": items}
            for cat, items in grouped.items()
        ],
    }


def _fix_qa_swap(q_item: dict) -> dict:
    """Only fix an unmistakable question/answer inversion from the model.

    Length and keyword guesses caused valid Markdown questions to be swapped,
    so an answer is now treated as a question only when it is a single line
    ending in a question mark.
    """
    q_text = q_item.get("q", "")
    a_text = q_item.get("a", "")
    if not q_text or not a_text:
        return q_item

    answer_is_single_question = "\n" not in a_text.strip() and a_text.rstrip().endswith(("?", "？"))
    question_is_question = q_text.rstrip().endswith(("?", "？"))
    if answer_is_single_question and not question_is_question:
        q_item["q"], q_item["a"] = q_item["a"], q_item["q"]

    return q_item


async def _generate_preview_questions(preview: dict) -> tuple[list[dict], dict]:
    """Generate chunk by chunk so long documents are covered before preview."""
    generated: list[dict] = []
    covered: dict[str, int] = {}
    all_sections: list[str] = []
    generation_errors: list[str] = []
    for chunk in split_study_material(preview["question_content"]):
        title = chunk["title"]
        chunk_sections = chunk.get("titles", [title])
        for section_title in chunk_sections:
            if section_title not in all_sections:
                all_sections.append(section_title)
        try:
            questions = await generate_questions_from_text(chunk["content"], section_title=title)
        except Exception as exc:
            # Preserve successfully generated sections and surface this one as
            # uncovered in the preview instead of losing the entire import.
            message = str(exc)
            if "HTTP 402" in message or "Insufficient Balance" in message:
                message = "AI 服务余额不足，请充值后重试"
            generation_errors.append(message)
            continue
        valid_count = 0
        for question in questions:
            if not isinstance(question, dict) or not {"cat", "q", "a"}.issubset(question):
                continue
            item = _fix_qa_swap({
                "cat": str(question["cat"]),
                "q": str(question["q"]),
                "a": str(question["a"]),
                "source_document_id": preview["document_id"],
                "source_document_ids": [preview["document_id"]],
                "tags": _exclude_filename_tags(_normalize_question_tags(question.get("tags")), preview["file_name"]) or preview.get("tags", [])[:1],
                "_section": title,
            })
            generated.append(item)
            valid_count += 1
        if valid_count:
            for section_title in chunk_sections:
                covered[section_title] = covered.get(section_title, 0) + valid_count

    questions, deduplicated = _deduplicate_questions(generated)
    coverage = {
        "covered_sections": [
            {"title": title, "count": covered[title]}
            for title in all_sections if title in covered
        ],
        "uncovered_sections": [title for title in all_sections if title not in covered],
        "generated_count": len(generated),
        "deduplicated_count": deduplicated,
        "question_count": len(questions),
        "generation_errors": generation_errors,
    }
    return questions, coverage


@router.post("/pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    generate_questions: bool = Form(True),
    _user_id: str = Depends(get_current_user),
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
                original_file_key = await object_storage.put(
                    save_path.name,
                    file_bytes,
                    file.content_type or "application/pdf",
                )
                for image_file in image_dir.iterdir():
                    if image_file.is_file() and image_file.suffix.lower() == ".png":
                        await object_storage.put(
                            f"{image_dir.name}/{image_file.name}",
                            image_file.read_bytes(),
                            "image/png",
                        )
            else:
                text = await extract_text_from_markdown(file_bytes, filename)
                question_text = text
                original_file_key = ""
            if not text.strip():
                raise HTTPException(400, detail="无法从文件中提取到任何文本内容")

            document_id = str(uuid.uuid4())
            document_tags = await _generate_document_tags(question_text, filename)

            validated = []
            if generate_questions:
                preview_for_generation = {
                    "document_id": document_id,
                    "file_name": filename,
                    "question_content": question_text,
                    "tags": document_tags,
                }
                validated, coverage = await _generate_preview_questions(preview_for_generation)

            if generate_questions and not validated:
                raise HTTPException(500, detail="AI 未能生成有效题目，请检查 DeepSeek API Key 或重试")

            preview_token = str(uuid.uuid4())
            _preview_store[preview_token] = {
                "document_id": document_id,
                "file_name": filename,
                "file_type": file_type,
                "file_path": str(save_path),
                "original_file_key": original_file_key,
                "content": text,
                "question_content": question_text,
                "questions": validated,
                "tags": document_tags,
                "coverage": coverage if generate_questions else None,
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
async def generate_preview_questions(body: dict, _user_id: str = Depends(get_current_user)):
    """Generate questions only after the document has been parsed successfully."""
    token = body.get("preview_token", "")
    preview = _preview_store.get(token)
    if preview is None:
        raise HTTPException(404, detail="导入数据已过期，请重新选择文件")

    try:
        validated, coverage = await _generate_preview_questions(preview)
        if not validated:
            detail = coverage["generation_errors"][0] if coverage["generation_errors"] else "AI 未能生成有效题目，请检查模型服务后重试"
            raise HTTPException(502, detail=detail)
        preview["questions"] = validated
        preview["coverage"] = coverage
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

    existing_tags: list[str] = []
    for model in (Question, Document):
        saved_tag_lists = (await db.execute(select(model.tags).where(model.user_id == owner_id))).scalars().all()
        for saved_tags in saved_tag_lists:
            for tag in _normalize_tags(saved_tags):
                if tag not in existing_tags:
                    existing_tags.append(tag)
    await _align_question_tags(questions, existing_tags)

    document = await db.scalar(select(Document).where(Document.id == document_id, Document.user_id == owner_id))
    content = preview["content"]
    category = "/".join(part.strip() for part in str(body.get("category", "导入文档")).split("/") if part.strip())
    if not category:
        category = "导入文档"
    document_tags = _normalize_tags(preview.get("tags"))
    for question in questions:
        for tag in _normalize_question_tags(question.get("tags")):
            if tag not in document_tags:
                document_tags.append(tag)
    document_tags = document_tags[:3]
    if document is None:
        document = Document(
            id=document_id,
            user_id=owner_id,
            title=preview["file_name"],
            cat=category,
            content=content,
            source="AI 导入",
            source_file_name=preview["file_name"],
            original_file_key=preview.get("original_file_key", "") if preview["file_type"] == "pdf" else "",
            tags=document_tags,
        )
        db.add(document)
    else:
        document.content = content
        document.cat = category
        document.source_file_name = preview["file_name"]
        document.original_file_key = preview.get("original_file_key", "") if preview["file_type"] == "pdf" else ""
        document.tags = document_tags
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
                tags=_normalize_question_tags(item.get("tags")) or document_tags[:2],
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
        "tags": document_tags,
    }
