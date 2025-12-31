"""Unit tests for Pydantic models - no API calls required."""

import pytest
from pydantic import ValidationError

from canvas_chat.app import (
    ExaContentsResult,
    ExaGetContentsRequest,
    RefineQueryRequest,
)


def test_exa_get_contents_request_valid():
    """Test that ExaGetContentsRequest validates correct input."""
    request = ExaGetContentsRequest(
        url="https://example.com/article", api_key="test-api-key"
    )
    assert request.url == "https://example.com/article"
    assert request.api_key == "test-api-key"


def test_exa_get_contents_request_missing_url():
    """Test that ExaGetContentsRequest requires url."""
    with pytest.raises(ValidationError):
        ExaGetContentsRequest(api_key="test-api-key")


def test_exa_get_contents_request_missing_api_key():
    """Test that ExaGetContentsRequest requires api_key."""
    with pytest.raises(ValidationError):
        ExaGetContentsRequest(url="https://example.com")


def test_exa_contents_result_valid():
    """Test that ExaContentsResult validates correct input."""
    result = ExaContentsResult(
        title="Test Article",
        url="https://example.com/article",
        text="This is the article content.",
        published_date="2024-01-15",
        author="John Doe",
    )
    assert result.title == "Test Article"
    assert result.url == "https://example.com/article"
    assert result.text == "This is the article content."
    assert result.published_date == "2024-01-15"
    assert result.author == "John Doe"


def test_exa_contents_result_optional_fields():
    """Test that ExaContentsResult allows optional fields to be None."""
    result = ExaContentsResult(
        title="Test Article", url="https://example.com/article", text="Content here"
    )
    assert result.published_date is None
    assert result.author is None


def test_exa_contents_result_missing_required():
    """Test that ExaContentsResult requires title, url, and text."""
    with pytest.raises(ValidationError):
        ExaContentsResult(title="Test", url="https://example.com")

    with pytest.raises(ValidationError):
        ExaContentsResult(title="Test", text="content")

    with pytest.raises(ValidationError):
        ExaContentsResult(url="https://example.com", text="content")


def test_refine_query_request_valid():
    """Test that RefineQueryRequest validates correct input."""
    request = RefineQueryRequest(
        user_query="how does this work?",
        context="Toffoli Gate (CCNOT) is a quantum gate...",
        command_type="search",
    )
    assert request.user_query == "how does this work?"
    assert request.context == "Toffoli Gate (CCNOT) is a quantum gate..."
    assert request.command_type == "search"


def test_refine_query_request_defaults():
    """Test RefineQueryRequest default values."""
    request = RefineQueryRequest(user_query="research this", context="Some context")
    assert request.command_type == "search"  # default
    assert request.model == "openai/gpt-4o-mini"  # default
    assert request.api_key is None
    assert request.base_url is None


def test_refine_query_request_research_type():
    """Test RefineQueryRequest with research command type."""
    request = RefineQueryRequest(
        user_query="tell me more",
        context="Quantum computing basics",
        command_type="research",
    )
    assert request.command_type == "research"


def test_refine_query_request_missing_required():
    """Test that RefineQueryRequest requires user_query and context."""
    with pytest.raises(ValidationError):
        RefineQueryRequest(context="Some context")

    with pytest.raises(ValidationError):
        RefineQueryRequest(user_query="some query")
