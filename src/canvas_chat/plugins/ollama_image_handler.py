"""Ollama Image Generation Handler Plugin

Handles image generation using Ollama's local models.
Experimental support for local image generation.
"""

import base64
import logging

import httpx
import litellm

from canvas_chat.image_generation_handler_plugin import (
    ImageGenerationHandlerPlugin,
    ImageGenerationRequest,
    ImageGenerationResponse,
)
from canvas_chat.image_generation_registry import PRIORITY, ImageGenerationRegistry

logger = logging.getLogger(__name__)


class OllamaImageHandler(ImageGenerationHandlerPlugin):
    """Handler for Ollama image generation.

    Supports local Ollama models via litellm.
    Experimental - requires Ollama server running locally.
    """

    async def generate_image(
        self, request: ImageGenerationRequest
    ) -> ImageGenerationResponse:
        """Generate an image using Ollama.

        Args:
            request: ImageGenerationRequest with prompt and parameters

        Returns:
            ImageGenerationResponse with base64 encoded image data

        Raises:
            litellm.APIError: If Ollama is not running or fails
            Exception: For other generation errors
        """
        logger.info(f"Ollama image generation: model={request.model}")

        # Ollama-specific parameters
        ollama_params = {}
        if request.extra_params.get("width"):
            ollama_params["width"] = request.extra_params["width"]
        if request.extra_params.get("height"):
            ollama_params["height"] = request.extra_params["height"]
        if request.extra_params.get("steps"):
            ollama_params["steps"] = request.extra_params["steps"]

        # Call litellm.aimage_generation with Ollama parameters
        response = await litellm.aimage_generation(
            prompt=request.prompt,
            model=request.model,
            n=request.n,
            api_key=request.api_key or "ollama",
            api_base=request.base_url,
            **ollama_params,
        )

        # Get generated image
        image_data = response.data[0]

        # Handle URL or base64 response
        if image_data.url:
            # Download image from URL and convert to base64
            logger.info(f"Downloading image from URL: {image_data.url[:50]}...")
            async with httpx.AsyncClient(timeout=60.0) as client:
                img_response = await client.get(image_data.url)
                img_response.raise_for_status()
                image_bytes = img_response.content
                image_base64 = base64.b64encode(image_bytes).decode("utf-8")
        elif image_data.b64_json:
            # Already base64
            image_base64 = image_data.b64_json
        else:
            raise ValueError("No image data returned from Ollama")

        logger.info("Image generated successfully")

        # Return base64 image
        return ImageGenerationResponse(
            image_data=image_base64,
            mime_type="image/png",
            revised_prompt=None,
        )


# Register Ollama handler (experimental)
ImageGenerationRegistry.register(
    id="ollama",
    models=["ollama/stable-diffusion", "ollama/sd-xl"],
    handler=OllamaImageHandler,
    priority=PRIORITY["COMMUNITY"],
    description="Ollama local image generation (experimental, requires Ollama server)",
)

logger.info("Ollama image generation handler plugin loaded")
