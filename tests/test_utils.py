"""Unit tests for utility functions in app.py - no API calls required."""

from canvas_chat.app import extract_provider

# --- extract_provider() tests ---


def test_extract_provider_openai():
    """Test extracting provider from OpenAI model string."""
    assert extract_provider("openai/gpt-4o") == "openai"
    assert extract_provider("openai/gpt-4o-mini") == "openai"
    assert extract_provider("openai/gpt-3.5-turbo") == "openai"


def test_extract_provider_anthropic():
    """Test extracting provider from Anthropic model string."""
    assert extract_provider("anthropic/claude-sonnet-4-20250514") == "anthropic"
    assert extract_provider("anthropic/claude-3-5-sonnet-20241022") == "anthropic"
    assert extract_provider("anthropic/claude-opus-4") == "anthropic"


def test_extract_provider_groq():
    """Test extracting provider from Groq model string."""
    assert extract_provider("groq/llama-3.1-70b-versatile") == "groq"
    assert extract_provider("groq/mixtral-8x7b-32768") == "groq"


def test_extract_provider_google():
    """Test extracting provider from Google/Gemini model string."""
    assert extract_provider("google/gemini-1.5-pro") == "google"
    assert extract_provider("gemini/gemini-2.0-flash") == "gemini"


def test_extract_provider_github():
    """Test extracting provider from GitHub model string."""
    assert extract_provider("github/gpt-4o") == "github"
    assert extract_provider("github_copilot/gpt-4o") == "github_copilot"


def test_extract_provider_ollama():
    """Test extracting provider from Ollama model string."""
    assert extract_provider("ollama/llama3.2") == "ollama"
    assert extract_provider("ollama_chat/mistral:latest") == "ollama_chat"


def test_extract_provider_without_slash():
    """Test extracting provider defaults to openai when no slash present."""
    assert extract_provider("gpt-4") == "openai"
    assert extract_provider("gpt-4o-mini") == "openai"
    assert extract_provider("claude-3-sonnet") == "openai"


def test_extract_provider_multiple_slashes():
    """Test extracting provider when model string has multiple slashes."""
    # Should take only the first part before the first slash
    assert extract_provider("openai/some/nested/model") == "openai"


def test_extract_provider_empty_before_slash():
    """Test extracting provider with empty string before slash."""
    # Edge case: "/model-name" should return empty string
    assert extract_provider("/model-name") == ""


def test_extract_provider_trailing_slash():
    """Test extracting provider with trailing slash."""
    assert extract_provider("openai/") == "openai"


def test_extract_provider_case_sensitivity():
    """Test that extract_provider preserves case."""
    assert extract_provider("OpenAI/gpt-4o") == "OpenAI"
    assert extract_provider("ANTHROPIC/claude") == "ANTHROPIC"
