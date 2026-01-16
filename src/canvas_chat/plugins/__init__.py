"""Backend plugins for canvas-chat.

This package contains backend file upload handler plugins and URL fetch handler plugins.
"""

# Import built-in URL fetch handler plugins (registers them)
from canvas_chat.plugins import (
    git_repo_handler,  # noqa: F401
    pdf_url_handler,  # noqa: F401
    youtube_handler,  # noqa: F401
)
