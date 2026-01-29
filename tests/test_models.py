"""Unit tests for Pydantic models - no API calls required."""

import pytest
from pydantic import ValidationError

from canvas_chat.app import (
    CommitteeRequest,
    ExaContentsResult,
    ExaGetContentsRequest,
    FetchPdfRequest,
    FetchUrlRequest,
    FetchUrlResult,
    Message,
    PdfResult,
    RefineQueryRequest,
)
from canvas_chat.plugins.ddg_endpoints import (
    DDGResearchRequest,
    DDGResearchSource,
    DDGSearchRequest,
    DDGSearchResult,
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


# --- FetchUrlRequest and FetchUrlResult tests ---


def test_fetch_url_request_valid():
    """Test that FetchUrlRequest validates correct input."""
    request = FetchUrlRequest(url="https://example.com/article")
    assert request.url == "https://example.com/article"


def test_fetch_url_request_missing_url():
    """Test that FetchUrlRequest requires url."""
    with pytest.raises(ValidationError):
        FetchUrlRequest()


def test_fetch_url_result_valid():
    """Test that FetchUrlResult validates correct input."""
    result = FetchUrlResult(
        url="https://example.com/article",
        title="Test Article",
        content="# Test Article\n\nThis is the content.",
    )
    assert result.url == "https://example.com/article"
    assert result.title == "Test Article"
    assert result.content == "# Test Article\n\nThis is the content."


def test_fetch_url_result_missing_required():
    """Test that FetchUrlResult requires url, title, and content."""
    with pytest.raises(ValidationError):
        FetchUrlResult(url="https://example.com", title="Test")

    with pytest.raises(ValidationError):
        FetchUrlResult(url="https://example.com", content="content")

    with pytest.raises(ValidationError):
        FetchUrlResult(title="Test", content="content")


# --- FetchPdfRequest and PdfResult tests ---


def test_fetch_pdf_request_valid():
    """Test that FetchPdfRequest validates correct input."""
    request = FetchPdfRequest(url="https://example.com/document.pdf")
    assert request.url == "https://example.com/document.pdf"


def test_fetch_pdf_request_with_query_params():
    """Test FetchPdfRequest accepts URLs with query parameters."""
    request = FetchPdfRequest(url="https://example.com/doc.pdf?token=abc123")
    assert request.url == "https://example.com/doc.pdf?token=abc123"


def test_fetch_pdf_request_missing_url():
    """Test that FetchPdfRequest requires url."""
    with pytest.raises(ValidationError):
        FetchPdfRequest()


def test_pdf_result_valid():
    """Test that PdfResult validates correct input."""
    result = PdfResult(
        filename="document.pdf",
        content="# Document\n\nExtracted text content.",
        page_count=5,
    )
    assert result.filename == "document.pdf"
    assert result.content == "# Document\n\nExtracted text content."
    assert result.page_count == 5


def test_pdf_result_with_warning_banner():
    """Test PdfResult with the standard warning banner content."""
    content = (
        """> 📄 **PDF Import** — Text was extracted automatically """
        """and may contain errors.
> Consider sourcing the original if precision is critical.

---

# Extracted Content

Some text from the PDF."""
    )
    result = PdfResult(filename="report.pdf", content=content, page_count=10)
    assert result.filename == "report.pdf"
    assert "PDF Import" in result.content
    assert result.page_count == 10


def test_pdf_result_single_page():
    """Test PdfResult with single page document."""
    result = PdfResult(filename="one-pager.pdf", content="Brief content", page_count=1)
    assert result.page_count == 1


def test_pdf_result_missing_filename():
    """Test that PdfResult requires filename."""
    with pytest.raises(ValidationError):
        PdfResult(content="Some content", page_count=1)


def test_pdf_result_missing_content():
    """Test that PdfResult requires content."""
    with pytest.raises(ValidationError):
        PdfResult(filename="doc.pdf", page_count=1)


def test_pdf_result_missing_page_count():
    """Test that PdfResult requires page_count."""
    with pytest.raises(ValidationError):
        PdfResult(filename="doc.pdf", content="Content")


# --- DDGSearchRequest and DDGSearchResult tests ---


def test_ddg_search_request_valid():
    """Test that DDGSearchRequest validates correct input."""
    request = DDGSearchRequest(query="python async programming", max_results=5)
    assert request.query == "python async programming"
    assert request.max_results == 5


def test_ddg_search_request_defaults():
    """Test DDGSearchRequest default values."""
    request = DDGSearchRequest(query="test query")
    assert request.query == "test query"
    assert request.max_results == 10  # default


def test_ddg_search_request_missing_query():
    """Test that DDGSearchRequest requires query."""
    with pytest.raises(ValidationError):
        DDGSearchRequest(max_results=5)


def test_ddg_search_result_valid():
    """Test that DDGSearchResult validates correct input."""
    result = DDGSearchResult(
        title="Python Async Guide",
        url="https://example.com/python-async",
        snippet="Learn about async programming in Python...",
    )
    assert result.title == "Python Async Guide"
    assert result.url == "https://example.com/python-async"
    assert result.snippet == "Learn about async programming in Python..."


def test_ddg_search_result_empty_snippet():
    """Test DDGSearchResult with empty snippet."""
    result = DDGSearchResult(title="Test Result", url="https://example.com", snippet="")
    assert result.snippet == ""


def test_ddg_search_result_missing_required():
    """Test that DDGSearchResult requires title, url, and snippet."""
    with pytest.raises(ValidationError):
        DDGSearchResult(title="Test", url="https://example.com")

    with pytest.raises(ValidationError):
        DDGSearchResult(title="Test", snippet="snippet")

    with pytest.raises(ValidationError):
        DDGSearchResult(url="https://example.com", snippet="snippet")


# --- DDGResearchRequest and DDGResearchSource tests ---


def test_ddg_research_request_valid():
    """Test that DDGResearchRequest validates correct input."""
    request = DDGResearchRequest(
        instructions="Research quantum computing",
        model="openai/gpt-4o-mini",
        api_key="test-key",
        context="Some context",
        max_iterations=4,
        max_sources=40,
    )
    assert request.instructions == "Research quantum computing"
    assert request.model == "openai/gpt-4o-mini"
    assert request.api_key == "test-key"
    assert request.context == "Some context"
    assert request.max_iterations == 4
    assert request.max_sources == 40


def test_ddg_research_request_defaults():
    """Test DDGResearchRequest default values."""
    request = DDGResearchRequest(
        instructions="Research topic", model="openai/gpt-4o-mini", api_key="test-key"
    )
    assert request.instructions == "Research topic"
    assert request.context is None
    assert request.base_url is None
    assert request.max_iterations == 4
    assert request.max_sources == 40
    assert request.max_queries_per_iteration == 4
    assert request.max_results_per_query == 10


def test_ddg_research_request_missing_required():
    """Test that DDGResearchRequest requires instructions and model.

    api_key is optional.
    """
    with pytest.raises(ValidationError):
        DDGResearchRequest(model="openai/gpt-4o-mini", api_key="test-key")

    with pytest.raises(ValidationError):
        DDGResearchRequest(instructions="Research", api_key="test-key")

    # api_key is optional, so this should work
    request = DDGResearchRequest(instructions="Research", model="openai/gpt-4o-mini")
    assert request.instructions == "Research"
    assert request.model == "openai/gpt-4o-mini"
    assert request.api_key is None


def test_ddg_research_source_valid():
    """Test that DDGResearchSource validates correct input."""
    source = DDGResearchSource(
        url="https://example.com/article",
        title="Example Article",
        summary="This is a summary of the article.",
        iteration=1,
        query="research query",
    )
    assert source.url == "https://example.com/article"
    assert source.title == "Example Article"
    assert source.summary == "This is a summary of the article."
    assert source.iteration == 1
    assert source.query == "research query"
    assert source.snippet is None  # Optional field


def test_ddg_research_source_with_snippet():
    """Test DDGResearchSource with optional snippet field."""
    source = DDGResearchSource(
        url="https://example.com/article",
        title="Example Article",
        summary="Summary",
        iteration=2,
        query="query",
        snippet="Article snippet text",
    )
    assert source.snippet == "Article snippet text"


def test_ddg_research_source_missing_required():
    """Test that DDGResearchSource requires url, title, summary, iteration, query."""
    with pytest.raises(ValidationError):
        DDGResearchSource(title="Title", summary="Summary", iteration=1, query="query")

    with pytest.raises(ValidationError):
        DDGResearchSource(
            url="https://example.com",
            summary="Summary",
            iteration=1,
            query="query",
        )

    with pytest.raises(ValidationError):
        DDGResearchSource(
            url="https://example.com", title="Title", iteration=1, query="query"
        )
