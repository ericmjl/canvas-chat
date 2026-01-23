"""Tests for image generation handler plugins and registry.

Tests the plugin-based image generation system.
"""

import pytest

from canvas_chat.image_generation_handler_plugin import (
    ImageGenerationHandlerPlugin,
    ImageGenerationRequest,
    ImageGenerationResponse,
)
from canvas_chat.image_generation_registry import PRIORITY, ImageGenerationRegistry


class MockImageHandler(ImageGenerationHandlerPlugin):
    """Mock handler for testing."""

    async def generate_image(
        self, request: ImageGenerationRequest
    ) -> ImageGenerationResponse:
        return ImageGenerationResponse(
            image_data="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
            mime_type="image/png",
            revised_prompt="test revised prompt",
        )


def test_registry_register_handler():
    """Test that a handler can be registered."""
    ImageGenerationRegistry.register(
        id="test-handler",
        models=["test-model-1", "test-model-2"],
        handler=MockImageHandler,
        priority=PRIORITY["COMMUNITY"],
        description="Test handler",
    )

    handler = ImageGenerationRegistry.get_handler_by_id("test-handler")
    assert handler is not None
    assert handler["id"] == "test-handler"
    assert handler["models"] == ["test-model-1", "test-model-2"]


def test_registry_find_handler_by_model():
    """Test that a handler can be found by model."""
    ImageGenerationRegistry.register(
        id="test-find-handler",
        models=["test-find-model"],
        handler=MockImageHandler,
        priority=PRIORITY["COMMUNITY"],
    )

    handler = ImageGenerationRegistry.find_handler("test-find-model")
    assert handler is not None
    assert handler["id"] == "test-find-handler"


def test_registry_priority_order():
    """Test that higher priority handlers are found first."""
    ImageGenerationRegistry.register(
        id="low-priority",
        models=["priority-model"],
        handler=MockImageHandler,
        priority=PRIORITY["COMMUNITY"],
    )

    ImageGenerationRegistry.register(
        id="high-priority",
        models=["priority-model"],
        handler=MockImageHandler,
        priority=PRIORITY["BUILTIN"],
    )

    handler = ImageGenerationRegistry.find_handler("priority-model")
    assert handler is not None
    assert handler["id"] == "high-priority"


def test_registry_get_all_handlers():
    """Test getting all registered handlers."""
    handlers = ImageGenerationRegistry.get_all_handlers()
    assert isinstance(handlers, list)
    assert len(handlers) > 0


def test_registry_get_all_models():
    """Test getting all models from all handlers."""
    models = ImageGenerationRegistry.get_all_models()
    assert isinstance(models, list)
    assert len(models) > 0

    # Check that each model entry has required fields
    for model in models:
        assert "model" in model
        assert "handler_id" in model
        assert "description" in model


def test_registry_duplicate_registration():
    """Test that duplicate registration overwrites existing handler."""
    ImageGenerationRegistry.register(
        id="duplicate-test",
        models=["duplicate-model"],
        handler=MockImageHandler,
        priority=PRIORITY["COMMUNITY"],
        description="First",
    )

    # Register again with same ID
    ImageGenerationRegistry.register(
        id="duplicate-test",
        models=["duplicate-model"],
        handler=MockImageHandler,
        priority=PRIORITY["BUILTIN"],
        description="Second",
    )

    # Should have the second registration (overwritten)
    handler = ImageGenerationRegistry.get_handler_by_id("duplicate-test")
    assert handler is not None
    assert handler["priority"] == PRIORITY["BUILTIN"]


def test_image_generation_request():
    """Test ImageGenerationRequest creation."""
    request = ImageGenerationRequest(
        prompt="A beautiful sunset",
        model="dall-e-3",
        size="1024x1024",
        quality="hd",
        n=1,
        api_key="test-key",
        base_url="https://api.example.com",
    )

    assert request.prompt == "A beautiful sunset"
    assert request.model == "dall-e-3"
    assert request.size == "1024x1024"
    assert request.quality == "hd"
    assert request.n == 1
    assert request.api_key == "test-key"
    assert request.base_url == "https://api.example.com"


def test_image_generation_response():
    """Test ImageGenerationResponse creation."""
    response = ImageGenerationResponse(
        image_data="base64data",
        mime_type="image/png",
        revised_prompt="revised",
    )

    assert response.image_data == "base64data"
    assert response.mime_type == "image/png"
    assert response.revised_prompt == "revised"


def test_image_generation_request_defaults():
    """Test ImageGenerationRequest default values."""
    request = ImageGenerationRequest(
        prompt="test",
        model="test-model",
    )

    assert request.prompt == "test"
    assert request.model == "test-model"
    assert request.size == "1024x1024"
    assert request.quality == "hd"
    assert request.n == 1
    assert request.api_key is None
    assert request.base_url is None


def test_image_generation_response_defaults():
    """Test ImageGenerationResponse default values."""
    response = ImageGenerationResponse(
        image_data="base64data",
    )

    assert response.image_data == "base64data"
    assert response.mime_type == "image/png"
    assert response.revised_prompt is None


def test_registry_validation_empty_id():
    """Test that registration with empty ID raises ValueError."""
    with pytest.raises(ValueError, match="id is required"):
        ImageGenerationRegistry.register(
            id="",
            models=["test"],
            handler=MockImageHandler,
        )


def test_registry_validation_no_handler():
    """Test that registration without handler raises ValueError."""
    with pytest.raises(ValueError, match="handler is required"):
        ImageGenerationRegistry.register(
            id="test-no-handler",
            models=["test"],
            handler=None,
        )


def test_registry_validation_no_models():
    """Test that registration without models raises ValueError."""
    with pytest.raises(ValueError, match="models list cannot be empty"):
        ImageGenerationRegistry.register(
            id="test-no-models",
            models=[],
            handler=MockImageHandler,
        )


def test_registry_handler_not_class():
    """Test that registration with non-class handler raises ValueError."""
    with pytest.raises(ValueError, match="handler must be a class"):
        ImageGenerationRegistry.register(
            id="test-not-class",
            models=["test"],
            handler=MockImageHandler(),  # type: ignore[arg-type]
        )


def test_abstract_base_class():
    """Test that ImageGenerationHandlerPlugin cannot be instantiated directly."""
    with pytest.raises(TypeError, match="abstract"):
        ImageGenerationHandlerPlugin()  # type: ignore[abstract]
