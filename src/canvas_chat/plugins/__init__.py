"""Backend plugins for canvas-chat.

This package contains backend file upload handler plugins, URL fetch handler plugins,
and image generation handler plugins.
"""

# Import built-in URL fetch handler plugins (registers them)
# Import built-in image generation handler plugins (registers them)
from canvas_chat.plugins import (
    git_repo_handler,  # noqa: F401
    google_image_handler,  # noqa: F401
    ollama_image_handler,  # noqa: F401
    openai_image_handler,  # noqa: F401
    pdf_url_handler,  # noqa: F401
    youtube_handler,  # noqa: F401
)
