"""PDF text extraction service using pdfplumber."""
import base64
import io
import os
import tempfile
from pathlib import Path
import pdfplumber
import pymupdf4llm


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


def _image_markdown(image, path: Path | None = None, url: str = "") -> str:
    """Encode a rendered PDF image inline so Markdown is self-contained."""
    if path is not None:
        image.save(path, format="PNG", optimize=True)
        return f"![PDF 原图]({url})"
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"![PDF 原图](data:image/png;base64,{encoded})"


async def extract_markdown_from_pdf(file_bytes: bytes, filename: str = "", image_dir: Path | None = None, image_url_prefix: str = "") -> str:
    """Convert a PDF to Markdown while retaining its page images.

    Text pages keep selectable extracted text and embed each raster image region.
    Scanned pages have no extractable text, so the whole rendered page is embedded
    to preserve the original material instead of returning an empty document.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if image_dir is None:
            raise ValueError("image_dir is required for PDF Markdown conversion")
        image_dir.mkdir(parents=True, exist_ok=True)
        markdown = pymupdf4llm.to_markdown(
            tmp_path,
            filename=filename,
            write_images=True,
            image_path=str(image_dir),
            force_text=True,
        )
        image_urls: dict[str, str] = {}
        for index, image_file in enumerate(image_dir.iterdir()):
            if image_file.is_file():
                placeholder = f"__BAGU_IMAGE_{index}__"
                for source_path in (str(image_file), image_file.as_posix(), image_file.name):
                    markdown = markdown.replace(source_path, placeholder)
                image_urls[placeholder] = f"{{{{API_BASE}}}}{image_url_prefix}{image_file.name}"
        for placeholder, image_url in image_urls.items():
            markdown = markdown.replace(placeholder, image_url)
        return markdown.strip()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


async def extract_text_from_markdown(file_bytes: bytes, filename: str = "") -> str:
    """Read Markdown/plain text content from bytes."""
    return file_bytes.decode("utf-8", errors="replace")
