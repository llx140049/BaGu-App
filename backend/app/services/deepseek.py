"""DeepSeek AI service for generating Q&A from text."""
import json
from typing import Any
from httpx import AsyncClient, Timeout
from app.core.config import settings

DEEPSEEK_API_URL = settings.DEEPSEEK_API_URL.rstrip("/") + "/chat/completions"
SYSTEM_PROMPT = """你是一个严谨的技术面试题与答案生成助手。请严格依据用户提供的文本提取关键知识点并生成面试题。

要求：
1. 每道题包含分类(cat)、问题(q)、答案(a)。cat 使用简短中文分类名，如 "JavaScript"、"React"、"CSS"、"网络"、"数据库"。
2. 答案(a)必须使用 Markdown，并按以下固定结构组织：
   - **结论：** 先用 1～2 句话直接回答问题。
   - **核心原理：** 解释为什么，说明关键机制或因果关系。
   - **关键要点：** 使用 2～5 条无序列表列出必须记住的事实、步骤或条件。
   - **易错点与追问：** 说明常见误区、适用边界，或面试中可能继续追问的方向；没有合适内容时可省略。
   - **示例：** 仅当原文提供了明确示例、代码或场景时添加，代码必须使用 Markdown 代码块。
3. 不要编造原文没有支持的 API、数据、结论、示例或最佳实践。原文信息不足时，明确写“原文未说明”。
4. 答案应准确、可直接复习：避免空泛套话、重复题干和过长段落；术语首次出现时用一句通俗解释。
5. 按知识点分组输出，同一分类的题放在一起；不要生成语义重复的问题。
6. 只输出合法 JSON 数组，不要 Markdown 围栏或任何其他文字。JSON 字符串中的换行使用 \\n 转义。

输出格式：
[
  {"cat": "分类名", "q": "问题", "a": "答案"},
  {"cat": "分类名", "q": "问题", "a": "答案"}
]"""


SYSTEM_PROMPT += "\nFor every question object, also include tags: an array containing exactly 1 broad, reusable Chinese knowledge tag. Reuse the same tag for related questions in this batch; keep the whole batch to a small shared tag set (normally no more than 4 tags). First generalize detailed concepts to their shared parent topic: for example, 波的干涉、波动、机械波 all use 波; React useEffect、组件渲染 all use React. Do not use a phenomenon, method, chapter title, document/file title, duplicate concept, or deep hierarchy path as a tag."


# Flashcards need short answers and explicit coverage targets. This overrides
# the legacy long-form template above without changing the API integration.
SYSTEM_PROMPT = """You create Chinese study flashcards strictly from supplied material.
Return only a valid JSON array. Every item must be:
{"cat":"short Chinese category","q":"one focused Chinese question","a":"short Markdown answer","tags":["one broad Chinese topic"]}

Rules:
- Cover distinct knowledge points; do not repeat concepts with different wording.
- Each answer must be 80–220 Chinese characters: one direct conclusion and 2–4 short bullets.
- Do not use a fixed multi-section template, long introductions, filler, or facts absent from the material.
- Include a code block only when the source itself provides a necessary example.
- tags contains exactly one broad reusable Chinese topic.
"""


async def _call_deepseek(prompt: str, max_tokens: int = 4096, system: str = "") -> str:
    """Low-level DeepSeek API call. Returns the content string."""
    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        raise ValueError("DEEPSEEK_API_KEY not configured in .env")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "deepseek-v4-flash",
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }

    async with AsyncClient(timeout=Timeout(120.0)) as client:
        resp = await client.post(
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise RuntimeError(f"DeepSeek API error (HTTP {resp.status_code}): {resp.text}")

    return resp.json()["choices"][0]["message"]["content"]


async def generate_tags_from_text(text: str) -> list[str]:
    """Generate a small set of reusable tags from imported document content."""
    truncated = text[:120000]
    result = await _call_deepseek(
        prompt=(
            "Read the following study material and return 1 to 3 broad, reusable Chinese knowledge tags. "
            "First generalize detailed concepts to their shared parent topic: 波的干涉、波动、机械波 should all use 波; "
            "React useEffect、组件渲染 should use React. "
            "Avoid phenomena, methods, chapter titles, overly specific details, duplicate concepts, deep hierarchy paths, and document/file titles. "
            "Use stable topic names (for example: JavaScript, React, 网络). "
            "Return only a JSON array of strings, with no markdown or explanation.\n\n"
            f"Material:\n{truncated}"
        ),
        max_tokens=256,
        system="Choose the highest-level shared topic for study material tags, not detailed subtopics. Output valid JSON only.",
    )
    text_clean = result.strip()
    if text_clean.startswith("```"):
        text_clean = text_clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    parsed = json.loads(text_clean)
    if isinstance(parsed, dict):
        parsed = parsed.get("tags", parsed.get("data", []))
    if not isinstance(parsed, list):
        raise ValueError("Unexpected tag response format")
    return [str(tag).strip() for tag in parsed if isinstance(tag, (str, int, float)) and str(tag).strip()]


async def align_question_tags_with_existing(
    questions: list[dict[str, Any]], existing_tags: list[str],
) -> list[list[str]]:
    """Consolidate a batch of question tags against a user's existing tag set."""
    compact_questions = [
        {"index": index, "question": str(question.get("q", ""))[:180], "tags": question.get("tags", [])}
        for index, question in enumerate(questions[:80])
    ]
    prompt = (
        "Assign exactly 1 Chinese knowledge tag to every question below. Prefer a relevant existing tag, "
        "or create one concise parent tag only when no existing tag fits. Reuse tags across related questions "
        "and use at most 4 distinct tags for the whole batch. Group related subtopics under their "
        "shared feature: 曲线运动 and 相对运动 should both use 质点运动学 when that tag exists. "
        "Do not use document titles, detailed phenomena, duplicate concepts, or deep paths. "
        "Return only JSON array objects: [{\"index\": 0, \"tags\": [\"标签\"]}].\n\n"
        f"Existing tags: {json.dumps(existing_tags[:120], ensure_ascii=False)}\n"
        f"Questions: {json.dumps(compact_questions, ensure_ascii=False)}"
    )
    result = await _call_deepseek(
        prompt=prompt,
        max_tokens=2048,
        system="Consolidate study question tags into stable, shared parent concepts. Output valid JSON only.",
    )
    text_clean = result.strip()
    if text_clean.startswith("```"):
        text_clean = text_clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    parsed = json.loads(text_clean)
    if isinstance(parsed, dict):
        parsed = parsed.get("items", parsed.get("questions", parsed.get("data", [])))
    if not isinstance(parsed, list):
        raise ValueError("Unexpected consolidated tag response format")

    aligned = [[] for _ in questions]
    for item in parsed:
        if not isinstance(item, dict) or not isinstance(item.get("index"), int):
            continue
        index = item["index"]
        if 0 <= index < len(aligned) and isinstance(item.get("tags"), list):
            aligned[index] = [str(tag).strip() for tag in item["tags"] if str(tag).strip()][:1]
    return aligned


async def generate_questions_from_text(text: str, section_title: str | None = None) -> list[dict[str, Any]]:
    """
    Send text to DeepSeek API and get structured Q&A array.
    Returns list of {cat, q, a, tags?} dicts.
    """
    max_chars = 400000
    truncated = text[:max_chars]
    if len(text) > max_chars:
        truncated += "\n\n[注意：原文过长，已截断前400K字符]"

    section_context = (
        f"\n当前只处理文档章节《{section_title}》。只根据本章节内容出题，不要重复其他章节可能已有的通用题。\n"
        if section_title else ""
    )
    result = await _call_deepseek(
        prompt=f"请根据以下文本内容生成面试题：{section_context}\n{truncated}",
        max_tokens=8192,
        system=SYSTEM_PROMPT,
    )

    # Parse JSON — wrap in a JSON object for json_object mode
    # DeepSeek might return bare array or wrapped object
    text_clean = result.strip()
    if text_clean.startswith("```"):
        text_clean = text_clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    parsed = json.loads(text_clean)
    if isinstance(parsed, dict):
        for key in ("questions", "items", "data", "result"):
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
        return [parsed]
    if isinstance(parsed, list):
        return parsed

    raise ValueError(f"Unexpected response format: {type(parsed)}")


async def generate_questions_from_text(text: str, section_title: str | None = None) -> list[dict[str, Any]]:
    """Generate concise cards with a predictable amount of coverage per chunk."""
    truncated = text[:400_000]
    target_count = min(12, max(6, (len(truncated) + 1199) // 1200))
    section_context = f" Current section: {section_title}." if section_title else ""
    result = await _call_deepseek(
        prompt=(
            f"Generate exactly {target_count} Chinese study questions from the material below."
            " Cover both primary and meaningful secondary knowledge points without padding the batch"
            f" with duplicate or weak questions. Stay within the flashcard answer length.{section_context}"
            f"\n\nMaterial:\n{truncated}"
        ),
        max_tokens=6000,
        system=SYSTEM_PROMPT,
    )
    text_clean = result.strip()
    if text_clean.startswith("```"):
        text_clean = text_clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    parsed = json.loads(text_clean)
    if isinstance(parsed, dict):
        for key in ("questions", "items", "data", "result"):
            if isinstance(parsed.get(key), list):
                return parsed[key]
        return [parsed]
    if isinstance(parsed, list):
        return parsed
    raise ValueError(f"Unexpected response format: {type(parsed)}")
