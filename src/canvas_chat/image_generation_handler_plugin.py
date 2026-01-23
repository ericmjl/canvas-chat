"""Image Generation Handler Plugin Base Class

Base class for backend image generation handlers. Plugins extend this class to
implement image generation for specific providers (OpenAI, Google, Ollama, etc.).

Example:
    class DalleHandler(ImageGenerationHandlerPlugin):
        async def generate_image(self, request):
            # Generate image with DALL-E
            response = await litellm.aimage_generation(
                prompt=request.prompt,
                model=request.model,
                size=request.size,
                quality=request.quality,
                n=request.n,
                api_key=request.api_key,
                api_base=request.base_url,
            )
            return {
                "image_data": response.data[0],
                "revised_prompt": response.data[0].revised_prompt,
            }

    ImageGenerationRegistry.register(
        id="openai-dalle",
        models=["dall-e-3", "dall-e-2"],
        handler=DalleHandler,
        priority=PRIORITY.BUILTIN,
    )
"""

import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class ImageGenerationRequest:
    """Request model for image generation.

    Supports standard params plus provider-specific params.
    """

    def __init__(
        self,
        prompt: str,
        model: str,
        size: str = "1024x1024",
        quality: str = "hd",
        n: int = 1,
        api_key: str | None = None,
        base_url: str | None = None,
        **kwargs,
    ):
        self.prompt = prompt
        self.model = model
        self.size = size
        self.quality = quality
        self.n = n
        self.api_key = api_key
        self.base_url = base_url
        self.extra_params = kwargs


class ImageGenerationResponse:
    """Response from image generation API.

    Standard fields for all providers.
    """

    def __init__(
        self,
        image_data: str,
        mime_type: str = "image/png",
        revised_prompt: str | None = None,
    ):
        self.image_data = image_data
        self.mime_type = mime_type
        self.revised_prompt = revised_prompt


class ImageGenerationHandlerPlugin(ABC):
    """Base class for image generation handlers.

    All handlers must implement async generate_image().

    Provides registration support and error handling.
    """

    @abstractmethod
    async def generate_image(
        self, request: ImageGenerationRequest
    ) -> ImageGenerationResponse:
        """Generate an image from a text prompt.

        Args:
            request: ImageGenerationRequest with prompt and parameters

        Returns:
            ImageGenerationResponse with base64 encoded image data

        Raises:
            Exception: If generation fails
        """
        raise NotImplementedError(
            "ImageGenerationHandlerPlugin.generate_image() must be "
            "implemented by subclass"
        )
