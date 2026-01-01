"""Unit tests for Pydantic models - no API calls required."""

import pytest
from pydantic import ValidationError

from canvas_chat.app import (
    CommitteeRequest,
    ExaContentsResult,
    ExaGetContentsRequest,
    Message,
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


# --- CommitteeRequest tests ---


def test_committee_request_valid():
    """Test that CommitteeRequest validates correct input."""
    request = CommitteeRequest(
        question="What is the best approach?",
        context=[
            Message(role="user", content="I have a problem"),
            Message(role="assistant", content="Let me help"),
        ],
        models=["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"],
        chairman_model="openai/gpt-4o",
        api_keys={"openai": "sk-test", "anthropic": "sk-ant-test"},
    )
    assert request.question == "What is the best approach?"
    assert len(request.context) == 2
    assert len(request.models) == 2
    assert request.chairman_model == "openai/gpt-4o"
    assert request.include_review is False  # default
    assert request.base_url is None  # default


def test_committee_request_with_review():
    """Test CommitteeRequest with review stage enabled."""
    request = CommitteeRequest(
        question="Evaluate these options",
        context=[],
        models=[
            "openai/gpt-4o",
            "anthropic/claude-sonnet-4-20250514",
            "groq/llama-3.1-70b-versatile",
        ],
        chairman_model="openai/gpt-4o",
        api_keys={"openai": "sk-test"},
        include_review=True,
    )
    assert request.include_review is True
    assert len(request.models) == 3


def test_committee_request_with_base_url():
    """Test CommitteeRequest with custom base URL."""
    request = CommitteeRequest(
        question="Test question",
        context=[],
        models=["openai/gpt-4o", "openai/gpt-4o-mini"],
        chairman_model="openai/gpt-4o",
        api_keys={},
        base_url="https://my-proxy.example.com/v1",
    )
    assert request.base_url == "https://my-proxy.example.com/v1"


def test_committee_request_empty_context():
    """Test CommitteeRequest with empty context list."""
    request = CommitteeRequest(
        question="Fresh question",
        context=[],
        models=["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"],
        chairman_model="openai/gpt-4o",
        api_keys={},
    )
    assert request.context == []


def test_committee_request_missing_question():
    """Test that CommitteeRequest requires question."""
    with pytest.raises(ValidationError):
        CommitteeRequest(
            context=[],
            models=["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"],
            chairman_model="openai/gpt-4o",
            api_keys={},
        )


def test_committee_request_missing_models():
    """Test that CommitteeRequest requires models."""
    with pytest.raises(ValidationError):
        CommitteeRequest(
            question="Test",
            context=[],
            chairman_model="openai/gpt-4o",
            api_keys={},
        )


def test_committee_request_missing_chairman():
    """Test that CommitteeRequest requires chairman_model."""
    with pytest.raises(ValidationError):
        CommitteeRequest(
            question="Test",
            context=[],
            models=["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"],
            api_keys={},
        )


def test_committee_request_missing_api_keys():
    """Test that CommitteeRequest requires api_keys dict."""
    with pytest.raises(ValidationError):
        CommitteeRequest(
            question="Test",
            context=[],
            models=["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"],
            chairman_model="openai/gpt-4o",
        )
