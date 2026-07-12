"""DeepSeek AI service for generating Q&A from text."""
import json
from typing import Any
from httpx import AsyncClient, Timeout
from app.core.config import settings

DEEPSEEK_API_URL = settings.DEEPSEEK_API_URL.rstrip("/") + "/chat/completions"
SYSTEM_PROMPT = """你是一个面试八股文出题助手。请根据用户提供的文本内容，提取关键知识点，生成面试题。

要求：
1. 每道题包含分类(cat)、问题(q)、答案(a)
2. cat 用简短中文分类名，如 "JavaScript"、"React"、"CSS"、"网络"、"数据库" 等
3. 答案要准确、完整、易懂
4. 按知识点分组输出，同一分类的题放在一起
5. 只输出 JSON 数组，不要其他文字

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
