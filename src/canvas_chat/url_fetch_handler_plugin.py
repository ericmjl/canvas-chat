r"""URL Fetch Handler Plugin Base Class

Base class for backend URL fetch handlers. Plugins extend this class to handle
specific URL types (git repositories, documentation sites, etc.) on the server side.

Example:
    class GitRepoHandler(UrlFetchHandlerPlugin):
        async def fetch_url(self, url: str) -> dict:
            # Fetch git repository content
            return {"title": "repo-name", "content": "..."}

        async def list_files(self, url: str) -> dict | None:
            # List files in repository
            return {"files": [...]}

        async def fetch_selected_files(self, url: str, file_paths: list[str]) -> dict:
            # Fetch selected files
            return {"title": "repo-name", "content": "..."}

    UrlFetchRegistry.register(
        id="git-repo",
        url_patterns=[
            r"^https?://github\.com/.*$",
        ],
        handler=GitRepoHandler,
        priority=PRIORITY.BUILTIN,
    )
"""

import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class UrlFetchHandlerPlugin(ABC):
    """Base class for URL fetch handler plugins."""

    @abstractmethod
    async def fetch_url(self, url: str) -> dict[str, Any]:
        """Fetch URL content and return title/content dict.

        Args:
            url: URL to fetch

        Returns:
            Dictionary with:
            - "title": str - Page/repo title
            - "content": str - Markdown content

        Raises:
            Exception: If fetching fails
        """
        raise NotImplementedError(
            "UrlFetchHandlerPlugin.fetch_url() must be implemented by subclass"
        )

    async def list_files(self, url: str, **kwargs: Any) -> dict[str, Any] | None:
        """List files available for selection (optional, for interactive selection).

        Args:
            url: URL to list files from
            **kwargs: Additional handler-specific parameters (e.g., git_credentials)

        Returns:
            Dictionary with file tree structure, or None if not supported.
            Structure: {
                "files": [
                    {"path": "README.md", "type": "file", "size": 1234},
                    {"path": "src/", "type": "directory", "children": [...]}
                ]
            }
        """
        return None

    async def fetch_selected_files(
        self, url: str, file_paths: list[str], **kwargs: Any
    ) -> dict[str, Any]:
        """Fetch content from selected files.

        Args:
            url: Repository URL
            file_paths: List of file paths to fetch (e.g., ["README.md", "src/main.py"])
            **kwargs: Additional handler-specific parameters (e.g., git_credentials)

        Returns:
            Dictionary with:
            - "title": str - Repository name
            - "content": str - Markdown content from selected files

        Raises:
            NotImplementedError: If not implemented by subclass
            Exception: If fetching fails
        """
        raise NotImplementedError(
            "Subclass must implement fetch_selected_files() "
            "if list_files() is supported"
        )
