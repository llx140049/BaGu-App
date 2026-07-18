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
        "model": "deepseek-chat",
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


async def generate_questions_from_text(text: str) -> list[dict[str, str]]:
    """
    Send text to DeepSeek API and get structured Q&A array.
    Returns list of {cat, q, a} dicts.
    """
    max_chars = 400000
    truncated = text[:max_chars]
    if len(text) > max_chars:
        truncated += "\n\n[注意：原文过长，已截断前400K字符]"

    result = await _call_deepseek(
        prompt=f"请根据以下文本内容生成面试题：\n\n{truncated}",
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
