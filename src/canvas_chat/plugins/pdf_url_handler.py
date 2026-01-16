"""PDF URL Fetch Handler Plugin

Handles PDF URL fetching by downloading and extracting text content.
"""

import logging
from typing import Any

import httpx
import pymupdf

from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin
from canvas_chat.url_fetch_registry import PRIORITY, UrlFetchRegistry

logger = logging.getLogger(__name__)

# Maximum PDF file size (25 MB)
MAX_PDF_SIZE = 25 * 1024 * 1024

# Warning banner prepended to PDF content
PDF_WARNING_BANNER = (  # noqa: E501
    """> 📄 **PDF Import** — Text was extracted automatically and may contain errors.
> Please verify important information and check the original document if needed.

"""
)


class PdfUrlHandler(UrlFetchHandlerPlugin):
    """Handler for PDF URLs."""

    async def fetch_url(self, url: str) -> dict[str, Any]:
        """Fetch PDF from URL and extract text content.

        Args:
            url: PDF URL

        Returns:
            Dictionary with:
            - "title": str - PDF filename (without extension)
            - "content": str - Extracted text with warning banner
            - "metadata": dict - Additional metadata (content_type, page_count, source)

        Raises:
            ValueError: If file is too large or not a PDF
            Exception: If PDF extraction fails
        """
        logger.info(f"Fetching PDF from URL: {url}")

        # Extract filename from URL
        filename = url.split("/")[-1].split("?")[0]
        if not filename.endswith(".pdf"):
            filename = filename + ".pdf" if filename else "document.pdf"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Stream the response to check size before downloading fully
                async with client.stream("GET", url, follow_redirects=True) as response:
                    if response.status_code != 200:
                        raise ValueError(
                            f"Failed to fetch PDF: HTTP {response.status_code}"
                        )

                    # Check content type
                    content_type = response.headers.get("content-type", "")
                    if "pdf" not in content_type.lower() and not url.lower().endswith(
                        ".pdf"
                    ):
                        raise ValueError("URL does not appear to point to a PDF file")

                    # Check content length if available
                    content_length = response.headers.get("content-length")
                    if content_length and int(content_length) > MAX_PDF_SIZE:
                        max_size_mb = MAX_PDF_SIZE // (1024 * 1024)
                        raise ValueError(
                            f"PDF file is too large. Maximum size is {max_size_mb} MB"
                        )

                    # Read the PDF content
                    pdf_bytes = b""
                    async for chunk in response.aiter_bytes():
                        pdf_bytes += chunk
                    if len(pdf_bytes) > MAX_PDF_SIZE:
                        max_size_mb = MAX_PDF_SIZE // (1024 * 1024)
                        raise ValueError(
                            f"PDF file is too large. Maximum size is {max_size_mb} MB"
                        )

        except httpx.TimeoutException:
            raise ValueError("Request timed out") from None
        except Exception as e:
            if isinstance(e, ValueError):
                raise
            raise ValueError(f"Failed to fetch PDF: {str(e)}") from e

        # Extract text from PDF
        text, page_count = self._extract_text_from_pdf(pdf_bytes)
        content = PDF_WARNING_BANNER + text

        # Extract title from filename (remove extension)
        title = filename.rsplit(".", 1)[0] if "." in filename else filename

        logger.info(
            f"Successfully extracted text from PDF: {filename} ({page_count} pages)"
        )

        return {
            "title": title,
            "content": content,
            "metadata": {
                "content_type": "pdf",
                "page_count": page_count,
                "source": "url",
            },
        }

    def _extract_text_from_pdf(self, pdf_bytes: bytes) -> tuple[str, int]:
        """Extract text from PDF bytes using pymupdf.

        Args:
            pdf_bytes: PDF file bytes

        Returns:
            tuple: (extracted_text, page_count)
        """
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)

        text_parts = []
        for page_num, page in enumerate(doc, start=1):
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(f"## Page {page_num}\n\n{page_text.strip()}")

        doc.close()

        full_text = (
            "\n\n".join(text_parts) if text_parts else "(No text content found in PDF)"
        )
        return full_text, page_count


# Register PDF URL handler
UrlFetchRegistry.register(
    id="pdf-url",
    url_patterns=[
        r"^https?://.*\.pdf(\?.*)?$",  # URLs ending in .pdf
    ],
    handler=PdfUrlHandler,
    priority=PRIORITY["BUILTIN"],
)

logger.info("PDF URL fetch handler plugin loaded")
