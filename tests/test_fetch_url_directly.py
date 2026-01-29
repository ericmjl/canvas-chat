"""Unit tests for fetch_url_directly (app.py direct-fetch fallback).

Ensures HTML is converted to markdown via html2text so we never send raw HTML
or embedded <style> to the frontend. Guards against reverting to raw response.text.
"""

from unittest.mock import AsyncMock

import pytest

from canvas_chat.app import fetch_url_directly

# Sample HTML that would interfere with the UI if injected into the DOM.
# If this were returned raw and set via innerHTML, it would:
# - hide the entire page (body { display: none })
# - hide all nodes (.node { visibility: hidden })
# The unit test verifies fetch_url_directly converts this to markdown so
# we never send raw HTML; the Cypress test verifies that even if the API
# returned this, the app would still show the toolbar (client-side sanitization).
SAMPLE_HTML_WITH_STYLE = """<!DOCTYPE html>
<html>
<head>
<title>Example Page</title>
<style>
body { display: none; }
.node { visibility: hidden; }
</style>
</head>
<body>
<h1>Hello World</h1>
<p>This is a <strong>paragraph</strong> with <em>formatting</em>.</p>
<ul>
<li>Item one</li>
<li>Item two</li>
</ul>
</body>
</html>
"""

SAMPLE_HTML_MINIMAL = """<!DOCTYPE html>
<html><head><title>Minimal</title></head>
<body><p>Just text.</p></body></html>
"""


@pytest.mark.anyio
async def test_fetch_url_directly_returns_markdown_not_raw_html():
    """Direct fetch must convert HTML to markdown; no raw <style> or <body>.

    The sample HTML would interfere with the UI if injected (hides body and .node).
    We assert it does not appear in the returned content so the frontend never
    receives it.
    """
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_HTML_WITH_STYLE

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    title, content = await fetch_url_directly("https://example.com/page", mock_client)

    assert title == "Example Page"
    # Content must be markdown from html2text, not raw HTML
    assert "<style>" not in content
    assert "</style>" not in content
    assert "<body>" not in content
    assert "<head>" not in content
    # Should contain markdown-style representation of the body content
    assert "Hello World" in content
    assert "paragraph" in content or "formatting" in content


@pytest.mark.anyio
async def test_fetch_url_directly_extracts_title():
    """Title must be extracted from <title> tag."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_HTML_MINIMAL

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    title, content = await fetch_url_directly("https://example.com", mock_client)

    assert title == "Minimal"
    assert "Just text" in content or "text" in content


@pytest.mark.anyio
async def test_fetch_url_directly_raises_on_non_200():
    """Direct fetch must raise when response status is not 200."""
    mock_response = AsyncMock()
    mock_response.status_code = 404
    mock_response.text = "Not Found"

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    with pytest.raises(Exception, match="Direct fetch returned 404"):
        await fetch_url_directly("https://example.com/missing", mock_client)


@pytest.mark.anyio
async def test_fetch_url_directly_uses_untitled_when_no_title_tag():
    """When HTML has no <title>, title must be 'Untitled'."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.text = "<html><body><p>No title here.</p></body></html>"

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    title, content = await fetch_url_directly("https://example.com", mock_client)

    assert title == "Untitled"
    assert "No title here" in content or "No title" in content
