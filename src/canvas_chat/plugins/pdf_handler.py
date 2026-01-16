"""PDF File Upload Handler Plugin

Handles PDF file uploads and text extraction on the backend.
"""

import logging

import pymupdf

from canvas_chat.file_upload_handler_plugin import FileUploadHandlerPlugin
from canvas_chat.file_upload_registry import PRIORITY, FileUploadRegistry

logger = logging.getLogger(__name__)

# Maximum PDF file size (25 MB)
MAX_PDF_SIZE = 25 * 1024 * 1024

# Warning banner prepended to PDF content
PDF_WARNING_BANNER = (  # noqa: E501
    """> 📄 **PDF Import** — Text was extracted automatically and may contain errors.
> Please verify important information and check the original document if needed.

"""
)


class PdfFileUploadHandler(FileUploadHandlerPlugin):
    """Handler for PDF file uploads."""

    async def process_file(self, file_bytes: bytes, filename: str) -> dict:
        """Extract text from PDF bytes.

        Args:
            file_bytes: PDF file bytes
            filename: Original filename

        Returns:
            Dictionary with:
            - content: Extracted text with warning banner
            - title: Filename (without extension)
            - page_count: Number of pages

        Raises:
            ValueError: If file is too large
            Exception: If PDF extraction fails
        """
        # Validate file size
        self.validate_file_size(file_bytes, MAX_PDF_SIZE, "PDF")

        # Extract text from PDF
        text, page_count = self.extract_text_from_pdf(file_bytes)
        content = PDF_WARNING_BANNER + text

        # Extract title from filename (remove extension)
        title = filename.rsplit(".", 1)[0] if "." in filename else filename

        logger.info(
            f"Successfully extracted text from PDF: {filename} ({page_count} pages)"
        )

        return {
            "content": content,
            "title": title,
            "page_count": page_count,
            "metadata": {
                "content_type": "pdf",
                "page_count": page_count,
                "source": "upload",
            },
        }

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> tuple[str, int]:
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


# Register PDF handler
FileUploadRegistry.register(
    id="pdf",
    mime_types=["application/pdf"],
    extensions=[".pdf"],
    handler=PdfFileUploadHandler,
    priority=PRIORITY["BUILTIN"],
)

logger.info("PDF file upload handler plugin loaded")
