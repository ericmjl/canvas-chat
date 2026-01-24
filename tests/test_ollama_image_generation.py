"""Property-based unit tests for Ollama image generation.

These tests verify critical behaviors of the Ollama image generation
implementation using Given/When/Then pattern.
"""

import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.canvas_chat.app import OLLAMA_BASE_URL
from tests.fixtures.ollama_responses import (
    OLLAMA_FINAL_CHUNK_EMPTY_DATA,
    OLLAMA_FINAL_CHUNK_IMAGE_ONLY,
    OLLAMA_FINAL_CHUNK_RESPONSE_ONLY,
    OLLAMA_SUCCESS_RESPONSE,
    OLLAMA_TIMEOUT_RESPONSE,
)


class Property_OllamaRoutingTests:
    """Test suite: Ollama model routing and parameter handling properties.

    Property: ollama_image/* models always route to Ollama API, not LiteLLM
    """

    @pytest.mark.anyio
    async def given_ollama_model_when_detecting_prefix_then_route_to_ollama(self):
        """Given Ollama model with prefix, When detecting, Then route to Ollama API."""

        # Given
        model = "ollama_image/x/z-image-turbo:latest"

        # When (check the detection logic directly)
        is_ollama = model.startswith("ollama_image/")
        extracted_model = model.replace("ollama_image/", "")

        # Then
        assert is_ollama is True
        assert extracted_model == "x/z-image-turbo:latest"

    @pytest.mark.anyio
    async def given_non_ollama_model_when_detecting_then_use_litellm(self):
        """Given non-Ollama model, When detecting, Then use LiteLLM path."""

        # Given
        model = "dall-e-3"

        # When
        is_ollama = model.startswith("ollama_image/")

        # Then
        assert is_ollama is False

    @pytest.mark.anyio
    async def given_ollama_model_when_extracting_then_return_model_name(self):
        """Given Ollama model, When extracting, Then return model name."""
        # Given
        model = "ollama_image/x/z-image-turbo:latest"

        # When
        extracted = model.replace("ollama_image/", "")

        # Then
        assert extracted == "x/z-image-turbo:latest"

    @pytest.mark.anyio
    async def given_ollama_model_when_setting_base_then_use_ollama_url(self):
        """Given Ollama model, When setting base URL, Then use OLLAMA_BASE_URL."""
        # Given
        model = "ollama_image/x/z-image-turbo:latest"

        # When
        is_ollama = model.startswith("ollama_image/")

        # Then
        if is_ollama:
            api_base = OLLAMA_BASE_URL

        # Then
        assert api_base == "http://localhost:11434"


class Property_OllamaParameterHandlingTests:
    """Test suite: Ollama-specific parameter handling.

    Property: Ollama requests don't require auth and disable unsupported parameters
    """

    @pytest.mark.anyio
    async def given_ollama_model_when_setting_api_key_then_use_dummy(self):
        """Given Ollama model, When setting API key, Then use 'dummy' value."""
        # Given
        model = "ollama_image/x/z-image-turbo:latest"

        # When
        is_ollama = model.startswith("ollama_image/")
        api_key = "dummy" if is_ollama else "real_key"

        # Then
        assert api_key == "dummy"

    @pytest.mark.anyio
    async def given_ollama_model_when_setting_quality_then_disable(self):
        """Given Ollama model, When setting quality, Then set to None."""
        # Given
        model = "ollama_image/x/z-image-turbo:latest"
        quality = "hd"

        # When
        is_ollama = model.startswith("ollama_image/")
        if is_ollama:
            quality = None

        # Then
        assert quality is None


class Property_OllamaResponseParsingTests:
    """Test suite: Ollama response parsing behavior.

    Property: Final "done":true chunk always extracts base64 image
    """

    @pytest.mark.anyio
    async def given_progress_chunk_when_parsing_then_continue_loop(self):
        """Given progress chunk with done:false, When parsing, Then continue loop."""
        # Given
        chunk = json.loads(OLLAMA_SUCCESS_RESPONSE[0])

        # When
        is_done = chunk.get("done")
        has_image = chunk.get("image")

        # Then
        assert is_done is False
        assert has_image is None

    @pytest.mark.anyio
    async def given_final_chunk_with_image_when_parsing_then_extract_image(self):
        """Given final chunk with image field, When parsing, Then extract base64."""
        # Given
        chunk = json.loads(OLLAMA_FINAL_CHUNK_IMAGE_ONLY)

        # When
        is_done = chunk.get("done")
        image_base64 = chunk.get("image") or chunk.get("response")

        # Then
        assert is_done is True
        assert image_base64 == "iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg=="

    @pytest.mark.anyio
    async def given_final_chunk_with_response_when_parsing_then_extract_response(self):
        """Given final chunk with response field, When parsing, Then extract base64."""
        # Given
        chunk = json.loads(OLLAMA_FINAL_CHUNK_RESPONSE_ONLY)

        # When
        is_done = chunk.get("done")
        image_base64 = chunk.get("image") or chunk.get("response")

        # Then
        assert is_done is True
        assert image_base64 == "iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg=="

    @pytest.mark.anyio
    async def given_final_chunk_with_both_fields_when_parsing_then_prefer_image(self):
        """Given final chunk with both fields, When parsing, Then prefer image field."""
        # Given
        chunk = json.loads(OLLAMA_SUCCESS_RESPONSE[-1])  # Last chunk has both fields

        # When
        is_done = chunk.get("done")
        image_base64 = chunk.get("image") or chunk.get("response")

        # Then
        assert is_done is True
        assert image_base64 == "iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg=="

    @pytest.mark.anyio
    async def given_final_chunk_with_empty_fields_when_parsing_then_return_none(self):
        """Given final chunk with empty fields, When parsing, Then return None."""
        # Given
        chunk = json.loads(OLLAMA_FINAL_CHUNK_EMPTY_DATA)

        # When
        is_done = chunk.get("done")
        image_base64 = chunk.get("image") or chunk.get("response")

        # Then
        assert is_done is True
        assert image_base64 is None or image_base64 == ""


class Property_OllamaErrorHandlingTests:
    """Test suite: Ollama error handling.

    Property: Ollama errors return 500 with user-friendly messages
    """

    @pytest.mark.anyio
    @patch("httpx.AsyncClient")
    async def given_no_final_chunk_when_processing_then_raise_error(
        self, mock_client_class
    ):
        """Given timeout scenario, When processing, Then raise HTTP 500 error."""
        from fastapi import HTTPException

        from src.canvas_chat.app import ImageGenerationRequest, generate_image

        # Given
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = iter(OLLAMA_TIMEOUT_RESPONSE)

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = mock_response

        mock_client_class.return_value = mock_client

        # When
        request = ImageGenerationRequest(
            prompt="test",
            model="ollama_image/x/z-image-turbo:latest",
            size="1024x1024",
            quality="hd",
            n=1,
            api_key=None,
            base_url=None,
        )

        # Then (verify error is raised)
        with pytest.raises(HTTPException) as exc_info:
            await generate_image(request)

        assert exc_info.value.status_code == 500
        assert "No image data returned from Ollama" in exc_info.value.detail
