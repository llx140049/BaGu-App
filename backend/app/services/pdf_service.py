"""PDF text extraction service using pdfplumber."""
import os
import tempfile
from pathlib import Path
import pdfplumber


async def extract_text_from_pdf(file_bytes: bytes, filename: str = "") -> str:
    """
    Extract text from PDF bytes using pdfplumber.
    Returns concatenated text from all pages.
    """
    # Save to temp file since pdfplumber works with file paths
    suffix = ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        text_parts: list[str] = []
        with pdfplumber.open(tmp_path) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"--- 第{i + 1}页 ---\n{page_text}")
        return "\n\n".join(text_parts)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


async def extract_text_from_markdown(file_bytes: bytes, filename: str = "") -> str:
    """Read Markdown/plain text content from bytes."""
    return file_bytes.decode("utf-8", errors="replace")
