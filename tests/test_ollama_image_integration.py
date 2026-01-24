"""Integration tests for Ollama image generation.

These tests verify the end-to-end flow from API endpoint to Ollama response.
"""

# Add src to path
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.canvas_chat.app import app
from tests.fixtures.ollama_responses import (
    OLLAMA_ERROR_RESPONSE,
    OLLAMA_SUCCESS_RESPONSE,
    OLLAMA_TIMEOUT_RESPONSE,
)


class Integration_OllamaImageGenerationTests:
    """Test suite: End-to-end Ollama image generation flow.

    Layer: Integration (API contract)
    Purpose: Verify FastAPI endpoint correctly routes Ollama requests
    """

    @pytest.fixture
    def client(self):
        """FastAPI test client."""
        return TestClient(app)

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def given_ollama_request_when_api_succeeds_then_return_image(
        self, mock_client_class, client
    ):
        """Given successful Ollama generation, When calling API, Then return image."""
        from src.canvas_chat.app import ImageGenerationRequest

        # Given: Mock Ollama HTTP response
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = iter(OLLAMA_SUCCESS_RESPONSE)

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = mock_response

        mock_client_class.return_value = mock_client

        # When: Call FastAPI endpoint
        request = ImageGenerationRequest(
            prompt="A serene Japanese garden",
            model="ollama_image/x/z-image-turbo:latest",
            size="1024x1024",
            quality="hd",
            n=1,
            api_key=None,
            base_url=None,
        )

        response = client.post("/api/generate-image", json=request.model_dump())

        # Then: Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["imageData"] == "iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg=="
        assert data["mimeType"] == "image/png"
        assert data["revised_prompt"] is None  # Ollama doesn't support this

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def given_ollama_timeout_when_generating_then_return_error(
        self, mock_client_class, client
    ):
        """Given Ollama timeout, When calling API, Then return 500 error."""
        from src.canvas_chat.app import ImageGenerationRequest

        # Given: Mock Ollama timeout (no final chunk)
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = iter(OLLAMA_TIMEOUT_RESPONSE)

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = mock_response

        mock_client_class.return_value = mock_client

        # When: Call FastAPI endpoint
        request = ImageGenerationRequest(
            prompt="A serene Japanese garden",
            model="ollama_image/x/z-image-turbo:latest",
            size="1024x1024",
            quality="hd",
            n=1,
            api_key=None,
            base_url=None,
        )

        response = client.post("/api/generate-image", json=request.model_dump())

        # Then: Verify error response
        assert response.status_code == 500
        assert "No image data returned from Ollama" in response.json()["detail"]

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def given_ollama_error_when_failing_then_propagate(
        self, mock_client_class, client
    ):
        """Given Ollama API error, When calling API, Then return 500 error."""
        from src.canvas_chat.app import ImageGenerationRequest

        # Given: Mock Ollama error response
        mock_response = AsyncMock()
        mock_response.status_code = 400
        mock_response.aiter_lines.return_value = iter([OLLAMA_ERROR_RESPONSE])

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = mock_response

        mock_client_class.return_value = mock_client

        # When: Call FastAPI endpoint
        request = ImageGenerationRequest(
            prompt="A serene Japanese garden",
            model="ollama_image/x/z-image-turbo:latest",
            size="1024x1024",
            quality="hd",
            n=1,
            api_key=None,
            base_url=None,
        )

        response = client.post("/api/generate-image", json=request.model_dump())

        # Then: Verify error propagated
        assert response.status_code == 500
        assert "error" in response.json()["detail"].lower()

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def given_dalle_e3_request_when_non_ollama_then_use_litellm(
        self, mock_client_class, mock_litellm, client
    ):
        """Given DALL-E model, When calling API, Then use LiteLLM path."""
        from src.canvas_chat.app import ImageGenerationRequest

        # Given: DALL-E request (non-Ollama)
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.data = [
            {"url": "https://example.com/image.png", "revised_prompt": "enhanced"}
        ]

        mock_litellm.aimage_generation.return_value = mock_response

        request = ImageGenerationRequest(
            prompt="A cat",
            model="dall-e-3",
            size="1024x1024",
            quality="hd",
            n=1,
            api_key="sk-test",
            base_url=None,
        )

        # When: Call FastAPI endpoint
        response = client.post("/api/generate-image", json=request.model_dump())

        # Then: Verify LiteLLM was called
        assert mock_litellm.aimage_generation.called
        call_kwargs = mock_litellm.aimage_generation.call_args.kwargs
        assert call_kwargs["model"] == "dall-e-3"
        assert call_kwargs["quality"] == "hd"
        assert response.status_code == 200

    @pytest.mark.anyio
    async def property_provider_isolation_when_using_ollama_then_dont_affect_dalle(
        self, mock_litellm
    ):
        """Given Ollama request, When processing, Then DALL-E code unchanged."""
        from src.canvas_chat.app import ImageGenerationRequest

        # Given: Mix of Ollama and DALL-E requests
        mock_response = AsyncMock()
        mock_response.data = [{"url": "https://example.com/image.png"}]

        mock_litellm.aimage_generation.return_value = mock_response

        # When: First Ollama (should not call LiteLLM)
        ImageGenerationRequest(
            prompt="test",
            model="ollama_image/x/z-image-turbo:latest",
            size="1024x1024",
            quality="hd",
            n=1,
            api_key=None,
            base_url=None,
        )

        # When: Then DALL-E (should call LiteLLM)
        ImageGenerationRequest(
            prompt="test",
            model="dall-e-3",
            size="1024x1024",
            quality="hd",
            n=1,
            api_key="sk-test",
            base_url=None,
        )

        # Then: Only DALL-E calls LiteLLM
        mock_litellm.aimage_generation.assert_called_once()
        call_kwargs = mock_litellm.aimage_generation.call_args.kwargs
        assert call_kwargs["model"] == "dall-e-3"
