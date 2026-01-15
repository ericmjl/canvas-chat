"""File Upload Handler Plugin Base Class

Base class for backend file type handlers. Plugins extend this class to handle
specific file types (PDF, Word, PowerPoint, etc.) on the server side.

Example:
    class WordDocHandler(FileUploadHandlerPlugin):
        async def process_file(self, file_bytes: bytes, filename: str) -> dict:
            # Process Word document
            text = extract_text_from_word(file_bytes)
            return {
                "content": text,
                "title": filename,
                "page_count": get_page_count(file_bytes),
            }

    FileUploadRegistry.register(
        id="word-doc",
        mime_types=[
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        extensions=[".doc", ".docx"],
        handler=WordDocHandler,
        priority=PRIORITY.BUILTIN,
    )
"""

import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class FileUploadHandlerPlugin(ABC):
    """Base class for file upload handler plugins."""

    @abstractmethod
    async def process_file(self, file_bytes: bytes, filename: str) -> dict[str, Any]:
        """Process a file and return extracted data.

        Args:
            file_bytes: Raw file bytes
            filename: Original filename

        Returns:
            Dictionary with extracted data. Must include:
            - "content": str - Extracted text content (markdown)
            - "title": str - Document title (optional, defaults to filename)
            Additional fields are allowed (e.g., "page_count", "metadata", etc.)

        Raises:
            Exception: If processing fails
        """
        raise NotImplementedError(
            "FileUploadHandlerPlugin.process_file() must be implemented by subclass"
        )

    def validate_file_size(
        self, file_bytes: bytes, max_size: int, file_type: str
    ) -> None:
        """Validate file size.

        Args:
            file_bytes: File bytes
            max_size: Maximum size in bytes
            file_type: File type description (for error message)

        Raises:
            ValueError: If file is too large
        """
        if len(file_bytes) > max_size:
            max_size_mb = max_size // (1024 * 1024)
            raise ValueError(
                f"{file_type} file is too large. Maximum size is {max_size_mb} MB"
            )
