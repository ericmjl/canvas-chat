"""Tests for HTML-to-markdown URL fetch helpers.

Covers math preservation (Quarto/Pandoc, MathJax, MathML) and relative URL
resolution. The fixture conversion does not touch the network.
"""

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from bs4 import BeautifulSoup

from canvas_chat.app import fetch_url_directly
from canvas_chat.html_markdown import (
    ExtractedMath,
    convert_html_to_markdown,
    postprocess_math_delimiters,
    preprocess_html_for_math,
    resolve_relative_urls,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "url_fetch_math_page.html"
PAGE_URL = "https://example.com/posts/aalen/page.html"


def test_preprocess_html_for_math_quarto_spans():
    """Quarto/Pandoc inline and display spans become placeholders."""
    html = (
        '<p>See <span class="math inline notranslate">\\(\\alpha_1(t)\\)</span>.</p>'
        '<span class="math display">\\[\\lambda(t)\\]</span>'
    )
    updated, blocks = preprocess_html_for_math(html)

    assert len(blocks) == 2
    assert blocks[0].display is False
    assert blocks[0].tex == r"\(\alpha_1(t)\)"
    assert blocks[1].display is True
    assert r"\lambda(t)" in blocks[1].tex
    assert blocks[0].placeholder in updated
    assert blocks[1].placeholder in updated
    assert "math inline" not in updated
    assert r"\alpha" not in updated


def test_preprocess_html_for_math_mathjax_scripts():
    """MathJax script bodies are kept; ordinary scripts are not math."""
    html = (
        '<script type="math/tex">a < b</script>'
        '<script type="math/tex">a &lt; b</script>'
        '<script type="math/tex; mode=display">\\int_0^1 x^2 dx</script>'
        '<script type="text/javascript">var x = 1;</script>'
    )
    updated, blocks = preprocess_html_for_math(html)

    assert len(blocks) == 3
    assert blocks[0].display is False
    assert blocks[0].tex == "a < b"
    assert blocks[1].tex == "a < b"
    assert blocks[2].display is True
    assert blocks[2].tex == r"\int_0^1 x^2 dx"
    assert "math/tex" not in updated
    assert "var x = 1" in updated


def test_preprocess_html_for_math_mathml_annotation():
    """MathML TeX annotations replace the whole math element."""
    html = """
    <math display="inline">
      <semantics>
        <mi>y</mi>
        <annotation encoding="application/x-tex">y = mx + b</annotation>
      </semantics>
    </math>
    <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <semantics>
        <mrow></mrow>
        <annotation encoding="Application/X-TeX">\\[a^2 + b^2 = c^2\\]</annotation>
      </semantics>
    </math>
    <p><annotation encoding="application/x-tex">not math</annotation></p>
    """
    updated, blocks = preprocess_html_for_math(html)

    assert [block.display for block in blocks] == [False, True]
    assert blocks[0].tex == "y = mx + b"
    assert r"\[a^2 + b^2 = c^2\]" in blocks[1].tex
    assert "<mi>" not in updated
    assert "not math" in updated


def test_postprocess_math_delimiters_strips_and_uses_single_backslash():
    """Stored delimiters are stripped, then reapplied once."""
    blocks = [
        ExtractedMath("TOKENINLINE", r"\(\alpha\)", False),
        ExtractedMath("TOKENDISPLAY", r"\[E = mc^2\]", True),
        ExtractedMath("TOKENDOLLAR", "$x$", False),
        ExtractedMath("TOKENDOUBLE", "$$y$$", True),
        ExtractedMath("TOKENEMPTY", r"\(\)", False),
    ]
    content = "A TOKENINLINE B TOKENDISPLAY C TOKENDOLLAR D TOKENDOUBLE E TOKENEMPTY F"
    result = postprocess_math_delimiters(content, blocks)

    assert result == "A \\(\\alpha\\) B \\[E = mc^2\\] C \\(x\\) D \\[y\\] E  F"
    assert "\\\\(" not in result
    assert "\\\\[" not in result


def test_resolve_relative_urls_images_and_links():
    """Relative URLs become absolute; absolute, data, and mailto stay put."""
    html = """
    <img src="figures/hazard.png" alt="h">
    <img src="/static/logo.png">
    <img src="https://cdn.example.com/abs.png">
    <img src="data:image/png;base64,abc+def=">
    <img src="//cdn.example.com/proto.png">
    <a href="../index.html">Home</a>
    <a href="mailto:a@b.c">Mail</a>
    <a href="#section">Jump</a>
    <a href="page.html?x=1&amp;y=2">Next</a>
    <a href="javascript:alert(1)">Js</a>
    """
    resolved = resolve_relative_urls(html, PAGE_URL)
    soup = BeautifulSoup(resolved, "html.parser")
    srcs = [img.get("src") for img in soup.find_all("img")]
    hrefs = [anchor.get("href") for anchor in soup.find_all("a")]

    assert srcs == [
        "https://example.com/posts/aalen/figures/hazard.png",
        "https://example.com/static/logo.png",
        "https://cdn.example.com/abs.png",
        "data:image/png;base64,abc+def=",
        "https://cdn.example.com/proto.png",
    ]
    assert hrefs == [
        "https://example.com/posts/index.html",
        "mailto:a@b.c",
        "https://example.com/posts/aalen/page.html#section",
        "https://example.com/posts/aalen/page.html?x=1&y=2",
        "javascript:alert(1)",
    ]


def test_resolve_relative_urls_honors_base_href():
    """A base element overrides the fetched page URL."""
    html = """
    <head><base href="https://cdn.example.com/assets/"></head>
    <img src="hazard.png">
    <a href="notes.html">Notes</a>
    """
    resolved = resolve_relative_urls(html, PAGE_URL)
    soup = BeautifulSoup(resolved, "html.parser")

    assert soup.img["src"] == "https://cdn.example.com/assets/hazard.png"
    assert soup.a["href"] == "https://cdn.example.com/assets/notes.html"


def test_resolve_relative_urls_empty_base_keeps_html():
    """Missing page URL does not rewrite the document."""
    html = '<img src="figures/a.png">'
    assert resolve_relative_urls(html, "") == html


def test_convert_html_fixture_preserves_math_and_absolute_urls():
    """End-to-end conversion of a representative page, with no network."""
    html = FIXTURE_PATH.read_text(encoding="utf-8")
    markdown = convert_html_to_markdown(html, PAGE_URL)

    assert r"\(\alpha_1(t)\)" in markdown
    assert r"\[\lambda(t) = \alpha_0(t) + \alpha_1(t)X\]" in markdown
    assert r"\(E = mc^2\)" in markdown
    assert r"\(a < b\)" in markdown
    assert r"\[\int_0^1 x^2 dx\]" in markdown
    assert r"\(y = mx + b\)" in markdown
    assert r"\[a^2 + b^2 = c^2\]" in markdown
    assert "https://example.com/posts/aalen/figures/hazard.png" in markdown
    assert "https://example.com/static/logo.png" in markdown
    assert "https://cdn.example.com/abs.png" in markdown
    assert "https://cdn.example.com/proto.png" in markdown
    assert "data:image/png;base64,iVBORw0KGgo=" in markdown
    assert "https://example.com/posts/index.html" in markdown
    assert "https://example.com/other" in markdown
    assert "data:text/plain,hello" in markdown
    assert "mailto:reader@example.com" in markdown
    assert "CANVASMATH" not in markdown
    assert "\\\\(" not in markdown
    assert "\\\\[" not in markdown
    assert "\\\\alpha" not in markdown
    assert "<style>" not in markdown
    assert "<script" not in markdown
    assert "var leaked" not in markdown
    assert "Hazard plot" in markdown


@pytest.mark.anyio
async def test_fetch_url_directly_uses_math_preserving_conversion():
    """The direct-fetch path passes the page URL into HTML conversion."""
    html = FIXTURE_PATH.read_text(encoding="utf-8")
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.text = html
    mock_response.url = PAGE_URL
    mock_response.headers = AsyncMock()
    mock_response.headers.get = lambda key, default=None: "text/html; charset=utf-8"

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    title, content = await fetch_url_directly(PAGE_URL, mock_client)

    assert title == "Math Fixture"
    assert r"\(\alpha_1(t)\)" in content
    assert r"\[\int_0^1 x^2 dx\]" in content
    assert "https://example.com/posts/aalen/figures/hazard.png" in content
    assert "data:image/png;base64,iVBORw0KGgo=" in content
    assert "\\\\(" not in content
