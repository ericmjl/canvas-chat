"""Image Generation Registry - Plugin System for Backend Image Generation Handlers

Enables dynamic registration of image generation handlers on the Python backend.
Both built-in providers and third-party plugins use this same registration API.

Usage:
    from canvas_chat.image_generation_registry import ImageGenerationRegistry, PRIORITY
    from canvas_chat.image_generation_handler_plugin import (
        ImageGenerationHandlerPlugin,
        ImageGenerationRequest,
        ImageGenerationResponse,
    )

    class MyProviderHandler(ImageGenerationHandlerPlugin):
        async def generate_image(
            self, request: ImageGenerationRequest
        ) -> ImageGenerationResponse:
            # Generate image with custom provider
            return ImageGenerationResponse(
                image_data="base64...",
                mime_type="image/png",
                revised_prompt="...",
            )

    ImageGenerationRegistry.register(
        id="my-provider",
        models=["my-model-1", "my-model-2"],
        handler=MyProviderHandler,
        priority=PRIORITY.BUILTIN,
    )
"""

import logging
from typing import ClassVar

logger = logging.getLogger(__name__)

# Priority levels for image generation handlers (higher priority = checked first)
PRIORITY = {
    "BUILTIN": 100,
    "OFFICIAL": 50,
    "COMMUNITY": 10,
}


class ImageGenerationRegistry:
    """Registry for image generation handlers.

    Manages multiple image generation providers (OpenAI, Google, Ollama, etc.)
    with priority-based handler lookup and self-discovery of supported models.
    """

    _handlers: ClassVar[dict[str, dict]] = {}

    @classmethod
    def register(
        cls,
        id: str,
        models: list[str],
        handler: type,
        priority: int = PRIORITY["COMMUNITY"],
        description: str = "",
    ) -> None:
        """Register an image generation handler.

        Args:
            id: Unique handler identifier
            models: List of model IDs this handler supports
            handler: Handler class (must extend ImageGenerationHandlerPlugin)
            priority: Priority level (higher = checked first)
            description: Optional handler description

        Raises:
            ValueError: If config is invalid
        """
        if not id:
            raise ValueError("ImageGenerationRegistry.register: id is required")
        if not handler:
            raise ValueError(
                f'ImageGenerationRegistry.register: handler is required for "{id}"'
            )
        if not isinstance(handler, type):
            raise ValueError(
                f'ImageGenerationRegistry.register: handler must be a class for "{id}"'
            )
        if not models:
            raise ValueError(
                f"ImageGenerationRegistry.register: models list cannot be "
                f"empty for '{id}'"
            )

        # Check for duplicate registration
        if id in cls._handlers:
            logger.warning(
                f'ImageGenerationRegistry: Overwriting existing handler "{id}"'
            )

        # Store the config
        cls._handlers[id] = {
            "id": id,
            "handler": handler,
            "models": models,
            "priority": priority,
            "description": description,
        }

        logger.info(
            f"[ImageGenerationRegistry] Registered handler: {id} (models: {models})"
        )

    @classmethod
    def find_handler(cls, model: str) -> dict | None:
        """Find appropriate handler for a given model.

        Args:
            model: Model string to search for

        Returns:
            Handler config dict, or None if no handler found
        """
        # Get all handlers sorted by priority (highest first)
        handlers = sorted(
            cls._handlers.values(), key=lambda h: h["priority"], reverse=True
        )

        # Find first handler that supports this model
        for handler_config in handlers:
            if model in handler_config["models"]:
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

    @classmethod
    def get_all_models(cls) -> list[dict]:
        """Get all models from all registered handlers.

        Returns:
            List of model info dicts with 'model', 'handler_id', 'description' keys
        """
        models = []
        for handler_config in cls._handlers.values():
            for model in handler_config["models"]:
                models.append(
                    {
                        "model": model,
                        "handler_id": handler_config["id"],
                        "description": handler_config.get("description", ""),
                    }
                )
        return models
