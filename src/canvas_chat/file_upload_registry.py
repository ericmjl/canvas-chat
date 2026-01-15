"""File Upload Registry - Plugin System for Backend File Type Handlers

Enables dynamic registration of file type handlers on the Python backend.
Both built-in file types and third-party plugins use this same registration API.

Usage:
    from canvas_chat.file_upload_registry import FileUploadRegistry, PRIORITY
    from canvas_chat.file_upload_handler_plugin import FileUploadHandlerPlugin

    class WordDocHandler(FileUploadHandlerPlugin):
        async def process_file(self, file_bytes: bytes, filename: str) -> dict:
            # Process Word document
            return {"content": "...", "title": "..."}

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
from typing import ClassVar

logger = logging.getLogger(__name__)

# Priority levels for file upload handlers (higher priority = checked first)
PRIORITY = {
    "BUILTIN": 100,
    "OFFICIAL": 50,
    "COMMUNITY": 10,
}


class FileUploadRegistry:
    """Registry for file upload handlers."""

    _handlers: ClassVar[dict[str, dict]] = {}

    @classmethod
    def register(
        cls,
        id: str,
        mime_types: list[str] | None = None,
        extensions: list[str] | None = None,
        handler: type | None = None,
        priority: int = PRIORITY["COMMUNITY"],
    ) -> None:
        """Register a file type handler.

        Args:
            id: Unique handler identifier
            mime_types: List of MIME types (e.g., ["application/pdf"])
            extensions: List of file extensions this handler supports (e.g., [".pdf"])
            handler: Handler class (must extend FileUploadHandlerPlugin)
            priority: Priority level (higher = checked first)

        Raises:
            ValueError: If config is invalid
        """
        if not id:
            raise ValueError("FileUploadRegistry.register: id is required")
        if not handler:
            raise ValueError(
                f'FileUploadRegistry.register: handler is required for "{id}"'
            )
        if not isinstance(handler, type):
            raise ValueError(
                f'FileUploadRegistry.register: handler must be a class for "{id}"'
            )
        if not mime_types and not extensions:
            raise ValueError(
                f"FileUploadRegistry.register: must specify either "
                f'mime_types or extensions for "{id}"'
            )

        # Check for duplicate registration
        if id in cls._handlers:
            logger.warning(f'FileUploadRegistry: Overwriting existing handler "{id}"')

        # Store the config
        cls._handlers[id] = {
            "id": id,
            "handler": handler,
            "mime_types": mime_types or [],
            "extensions": extensions or [],
            "priority": priority,
        }

        logger.info(f"[FileUploadRegistry] Registered file handler: {id}")

    @classmethod
    def find_handler(
        cls, filename: str | None = None, mime_type: str | None = None
    ) -> dict | None:
        """Find a handler for a given file.

        Args:
            filename: File name (for extension matching)
            mime_type: MIME type (for MIME type matching)

        Returns:
            Handler config dict, or None if no handler found
        """
        # Get all handlers sorted by priority (highest first)
        handlers = sorted(
            cls._handlers.values(), key=lambda h: h["priority"], reverse=True
        )

        for handler_config in handlers:
            # Check MIME type match
            if mime_type and handler_config["mime_types"]:
                for registered_mime in handler_config["mime_types"]:
                    if mime_type == registered_mime:
                        return handler_config
                    # Support wildcard patterns like "image/*"
                    if registered_mime.endswith("/*") and mime_type.startswith(
                        registered_mime[:-1]
                    ):
                        return handler_config

            # Check extension match
            if filename and handler_config["extensions"]:
                filename_lower = filename.lower()
                for ext in handler_config["extensions"]:
                    if filename_lower.endswith(ext.lower()):
                        return handler_config

        return None

    @classmethod
    def get_all_handlers(cls) -> list[dict]:
        """Get all registered handlers.

        Returns:
            List of handler config dicts
        """
        return list(cls._handlers.values())

    @classmethod
    def get_handler_by_id(cls, handler_id: str) -> dict | None:
        """Get a handler by ID.

        Args:
            handler_id: Handler ID

        Returns:
            Handler config dict, or None if not found
        """
        return cls._handlers.get(handler_id)
