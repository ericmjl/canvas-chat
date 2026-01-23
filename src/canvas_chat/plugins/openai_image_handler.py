"""OpenAI Image Generation Handler Plugin

Handles image generation using OpenAI's DALL-E models (dall-e-3, dall-e-2).
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


class OpenAIImageHandler(ImageGenerationHandlerPlugin):
    """Handler for OpenAI DALL-E image generation.

    Supports DALL-E 3 and DALL-E 2 models via litellm.
    """

    async def generate_image(
        self, request: ImageGenerationRequest
    ) -> ImageGenerationResponse:
        """Generate an image using OpenAI DALL-E.

        Args:
            request: ImageGenerationRequest with prompt and parameters

        Returns:
            ImageGenerationResponse with base64 encoded image data

        Raises:
            litellm.AuthenticationError: If API key is invalid
            litellm.RateLimitError: If rate limit is exceeded
            Exception: For other generation errors
        """
        logger.info(
            f"OpenAI image generation: model={request.model}, "
            f"size={request.size}, quality={request.quality}"
        )

        # Call litellm.aimage_generation
        response = await litellm.aimage_generation(
            prompt=request.prompt,
            model=request.model,
            size=request.size,
            quality=request.quality,
            n=request.n,
            api_key=request.api_key,
            api_base=request.base_url,
        )

        # Get the generated image
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
            raise ValueError("No image data returned from OpenAI")

        logger.info("Image generated successfully")

        # Return base64 image
        return ImageGenerationResponse(
            image_data=image_base64,
            mime_type="image/png",
            revised_prompt=getattr(image_data, "revised_prompt", None),
        )


# Register OpenAI DALL-E handler
ImageGenerationRegistry.register(
    id="openai-dalle",
    models=["dall-e-3", "dall-e-2"],
    handler=OpenAIImageHandler,
    priority=PRIORITY["BUILTIN"],
    description="OpenAI DALL-E image generation (high quality, creative)",
)

logger.info("OpenAI image generation handler plugin loaded")
