"""Tests for /api/generate-title endpoint.

Guards against regression where endpoint was removed between v0.1.62 and v0.1.63.
"""

from canvas_chat.app import GenerateTitleRequest


class TestGenerateTitleRequest:
    """Test GenerateTitleRequest model.

    CRITICAL: These tests guard against regression where the endpoint
    was removed, causing 404 errors when clicking the ✨ auto-title button.
    """

    def test_generate_title_request_has_content_field(self):
        """CRITICAL: GenerateTitleRequest must have content field."""
        request = GenerateTitleRequest(
            content="Test conversation content",
            model="openai/gpt-4o-mini",
            api_key="sk-test-key",
        )

        assert hasattr(request, "content")
        assert request.content == "Test conversation content"

    def test_generate_title_request_has_model_field(self):
        """Test that model field exists with correct default."""
        request = GenerateTitleRequest(content="Test")

        assert hasattr(request, "model")
        assert request.model == "openai/gpt-4o-mini"

    def test_generate_title_request_has_api_key_field(self):
        """Test that api_key field exists and is optional."""
        # Without API key (optional)
        request1 = GenerateTitleRequest(content="Test")
        assert hasattr(request1, "api_key")
        assert request1.api_key is None

        # With API key
        request2 = GenerateTitleRequest(content="Test", api_key="sk-test-key")
        assert request2.api_key == "sk-test-key"

    def test_generate_title_request_has_base_url_field(self):
        """Test that base_url field exists and is optional."""
        # Without base_url (optional)
        request1 = GenerateTitleRequest(content="Test")
        assert hasattr(request1, "base_url")
        assert request1.base_url is None

        # With base_url
        request2 = GenerateTitleRequest(
            content="Test", base_url="https://api.example.com"
        )
        assert request2.base_url == "https://api.example.com"

    def test_generate_title_request_all_fields(self):
        """Test that all fields can be set together."""
        request = GenerateTitleRequest(
            content="User: Hello\nAssistant: Hi there!",
            model="anthropic/claude-3-5-sonnet-20241022",
            api_key="sk-ant-test-key",
            base_url="https://api.anthropic.com",
        )

        assert request.content == "User: Hello\nAssistant: Hi there!"
        assert request.model == "anthropic/claude-3-5-sonnet-20241022"
        assert request.api_key == "sk-ant-test-key"
        assert request.base_url == "https://api.anthropic.com"
