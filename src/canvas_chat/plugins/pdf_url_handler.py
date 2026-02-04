"""PDF URL Fetch Handler Plugin

Handles PDF URLs by returning the URL for the frontend to load and extract
text via PDF.js. No server-side extraction (avoids jumbled fallback and keeps
PDF handling in the plugin layer).
"""

import logging
from typing import Any

from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin
from canvas_chat.url_fetch_registry import PRIORITY, UrlFetchRegistry

logger = logging.getLogger(__name__)


class PdfUrlHandler(UrlFetchHandlerPlugin):
    """Handler for PDF URLs. Returns pdf_url for frontend viewer + extraction."""

    async def fetch_url(self, url: str) -> dict[str, Any]:
        """Return PDF URL and title; frontend loads and extracts text with PDF.js.

        Args:
            url: PDF URL

        Returns:
            Dictionary with:
            - "title": str - From URL path (filename without extension)
            - "content": str - Empty (frontend will extract and set node.content)
            - "metadata": dict - content_type, pdf_url, source
        """
        logger.info(f"PDF URL (frontend will load): {url}")

        filename = url.split("/")[-1].split("?")[0]
        if not filename.endswith(".pdf"):
            filename = filename + ".pdf" if filename else "document.pdf"
        title = filename.rsplit(".", 1)[0] if "." in filename else filename

        return {
            "title": title,
            "content": "",
            "metadata": {
                "content_type": "pdf",
                "pdf_url": url,
                "source": "url",
            },
        }


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
