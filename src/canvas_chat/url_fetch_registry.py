r"""URL Fetch Registry - Plugin System for Backend URL Fetch Handlers

Enables dynamic registration of URL fetch handlers on the Python backend.
Both built-in URL types and third-party plugins use this same registration API.

Usage:
    from canvas_chat.url_fetch_registry import UrlFetchRegistry, PRIORITY
    from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin

    class MyUrlHandler(UrlFetchHandlerPlugin):
        async def fetch_url(self, url: str) -> dict:
            # Fetch URL content
            return {"title": "...", "content": "..."}

    UrlFetchRegistry.register(
        id="my-handler",
        url_patterns=[
            r"^https?://example\.com/.*$",
        ],
        handler=MyUrlHandler,
        priority=PRIORITY.BUILTIN,
    )
"""

import logging
import re
from typing import ClassVar

logger = logging.getLogger(__name__)

# Priority levels for URL fetch handlers (higher priority = checked first)
PRIORITY = {
    "BUILTIN": 100,
    "OFFICIAL": 50,
    "COMMUNITY": 10,
}


class UrlFetchRegistry:
    """Registry for URL fetch handlers."""

    _handlers: ClassVar[dict[str, dict]] = {}

    @classmethod
    def register(
        cls,
        id: str,
        url_patterns: list[str] | None = None,
        handler: type | None = None,
        priority: int = PRIORITY["COMMUNITY"],
    ) -> None:
        r"""Register a URL fetch handler.

        Args:
            id: Unique handler identifier
            url_patterns: List of regex patterns to match URLs (e.g., [r"^https?://github\.com/.*$"])
            handler: Handler class (must extend UrlFetchHandlerPlugin)
            priority: Priority level (higher = checked first)

        Raises:
            ValueError: If config is invalid
        """
        if not id:
            raise ValueError("UrlFetchRegistry.register: id is required")
        if not handler:
            raise ValueError(
                f'UrlFetchRegistry.register: handler is required for "{id}"'
            )
        if not isinstance(handler, type):
            raise ValueError(
                f'UrlFetchRegistry.register: handler must be a class for "{id}"'
            )
        if not url_patterns:
            raise ValueError(
                f'UrlFetchRegistry.register: must specify url_patterns for "{id}"'
            )

        # Check for duplicate registration
        if id in cls._handlers:
            logger.warning(f'UrlFetchRegistry: Overwriting existing handler "{id}"')

        # Store the config
        cls._handlers[id] = {
            "id": id,
            "handler": handler,
            "url_patterns": url_patterns,
            "priority": priority,
        }

        logger.info(f"[UrlFetchRegistry] Registered URL fetch handler: {id}")

    @classmethod
    def find_handler(cls, url: str) -> dict | None:
        """Find a handler for a given URL.

        Args:
            url: URL to match against registered patterns

        Returns:
            Handler config dict, or None if no handler found
        """
        # Get all handlers sorted by priority (highest first)
        handlers = sorted(
            cls._handlers.values(), key=lambda h: h["priority"], reverse=True
        )

        for handler_config in handlers:
            # Check URL pattern matches
            for pattern in handler_config["url_patterns"]:
                try:
                    if re.match(pattern, url, re.IGNORECASE):
                        return handler_config
                except re.error as e:
                    logger.warning(
                        f'Invalid regex pattern "{pattern}" for handler '
                        f'"{handler_config["id"]}": {e}'
                    )
                    continue

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
