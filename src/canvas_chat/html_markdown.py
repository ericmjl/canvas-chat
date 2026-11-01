"""Turn fetched HTML into markdown the canvas can render.

Direct URL fetch uses html2text. That library doubles the backslash on
inline and display math delimiters and discards MathJax ``script`` bodies,
so KaTeX in the canvas cannot render the equation. Relative image and link
URLs are also left unresolved.

Conversion extracts math (Quarto/Pandoc spans, MathJax scripts, MathML
annotations) into placeholders, rewrites relative URLs against the page
URL, runs html2text, then restores delimiters with a single backslash.
"""

from __future__ import annotations

import html
from dataclasses import dataclass
from urllib.parse import urljoin
from uuid import uuid4

import html2text
from bs4 import BeautifulSoup, Tag

__all__ = [
    "ExtractedMath",
    "convert_html_to_markdown",
    "postprocess_math_delimiters",
    "preprocess_html_for_math",
    "resolve_relative_urls",
    "strip_math_delimiters",
]


@dataclass(frozen=True)
class ExtractedMath:
    """Math lifted out of HTML before markdown conversion.

    ``placeholder`` is the token written into the HTML. ``tex`` is the
    LaTeX source, possibly still wrapped in delimiters. ``display`` is
    true when the expression should use display delimiters.
    """

    placeholder: str
    tex: str
    display: bool


def convert_html_to_markdown(html_content: str, base_url: str = "") -> str:
    """Convert HTML to markdown, preserving math and absolute URLs.

    :param html_content: HTML document or fragment.
    :param base_url: Page URL used to resolve relative image and link URLs.
        Empty skips resolution.
    :returns: Markdown whose math uses single-backslash KaTeX delimiters.
    """
    prepared = html_content
    if base_url:
        prepared = resolve_relative_urls(prepared, base_url)
    prepared, blocks = preprocess_html_for_math(prepared)
    converter = html2text.HTML2Text()
    converter.ignore_links = False
    converter.body_width = 0
    markdown = converter.handle(prepared)
    return postprocess_math_delimiters(markdown, blocks)


def resolve_relative_urls(html_content: str, base_url: str) -> str:
    """Resolve relative ``img src`` and ``a href`` values against ``base_url``.

    Absolute ``http``/``https`` URLs and ``data:`` URIs are preserved. A
    ``<base href>`` in the document overrides ``base_url`` when present.

    :param html_content: HTML document or fragment.
    :param base_url: Fetched page URL. Empty leaves the HTML unchanged.
    :returns: HTML with relative image and link URLs made absolute.
    """
    if not base_url:
        return html_content
    soup = BeautifulSoup(html_content, "html.parser")
    page_base = effective_base_url(soup, base_url)
    for tag_name, attr in (("img", "src"), ("a", "href")):
        for tag in soup.find_all(tag_name):
            raw = tag.get(attr)
            if not isinstance(raw, str):
                continue
            stripped = raw.strip()
            if is_absolute_or_embedded_url(stripped):
                if stripped != raw:
                    tag[attr] = stripped
                continue
            tag[attr] = urljoin(page_base, stripped)
    return str(soup)


def preprocess_html_for_math(
    html_content: str,
) -> tuple[str, list[ExtractedMath]]:
    """Extract math from common HTML patterns and replace it with placeholders.

    Handles, uniformly:

    - Quarto/Pandoc elements with classes ``math inline`` or ``math display``
    - MathJax ``<script type="math/tex">`` (``mode=display`` for display math)
    - MathML ``<annotation encoding="application/x-tex">`` inside ``<math>``

    :param html_content: HTML document or fragment.
    :returns: HTML with math replaced by placeholders, and the extracted blocks.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    blocks: list[ExtractedMath] = []
    prefix = f"CANVASMATH{uuid4().hex}"

    pandoc_tags = innermost_tags(
        [tag for tag in soup.find_all(class_="math") if is_pandoc_math_tag(tag)]
    )
    for tag in pandoc_tags:
        tex = pandoc_math_tex(tag)
        if tex is None:
            continue
        take_math(tag, tex, "display" in tag_class_names(tag), blocks, prefix)

    mathml_tags = [
        tag for tag in soup.find_all("math") if annotation_tex(tag) is not None
    ]
    for tag in innermost_tags(mathml_tags):
        tex = annotation_tex(tag)
        if tex is None:
            continue
        take_math(tag, tex, mathml_is_display(tag, tex), blocks, prefix)

    for script in list(soup.find_all("script")):
        mode = mathjax_display_mode(script)
        if mode is None:
            continue
        take_math(script, script.get_text(), mode == "display", blocks, prefix)

    return str(soup), blocks


def postprocess_math_delimiters(content: str, math_blocks: list[ExtractedMath]) -> str:
    """Replace math placeholders with single-backslash KaTeX delimiters.

    Existing ``\\(...\\)``, ``\\[...\\]``, ``$...$``, and ``$$...$$`` wrappers
    on the stored TeX are stripped before the delimiter for ``display`` is
    applied, so equations are not double-wrapped.

    :param content: Markdown produced by html2text, still containing placeholders.
    :param math_blocks: Blocks returned by :func:`preprocess_html_for_math`.
    :returns: Markdown with placeholders replaced by math delimiters.
    """
    updated = content
    for block in math_blocks:
        tex = strip_math_delimiters(block.tex)
        if not tex:
            updated = updated.replace(block.placeholder, "")
            continue
        if block.display:
            replacement = f"\\[{tex}\\]"
        else:
            replacement = f"\\({tex}\\)"
        updated = updated.replace(block.placeholder, replacement)
    return updated


def strip_math_delimiters(tex: str) -> str:
    """Remove surrounding math delimiters from LaTeX source.

    :param tex: TeX, possibly wrapped in delimiters.
    :returns: TeX without wrapping ``\\(...\\)``, ``\\[...\\]``, ``$``, or ``$$``.
    """
    cleaned = tex.strip()
    changed = True
    while changed and cleaned:
        changed = False
        for opener, closer in (("\\[", "\\]"), ("\\(", "\\)"), ("$$", "$$")):
            if (
                cleaned.startswith(opener)
                and cleaned.endswith(closer)
                and len(cleaned) >= len(opener) + len(closer)
            ):
                cleaned = cleaned[len(opener) : -len(closer)].strip()
                changed = True
                break
        if changed:
            continue
        if (
            len(cleaned) > 2
            and cleaned.startswith("$")
            and cleaned.endswith("$")
            and not cleaned.startswith("$$")
        ):
            cleaned = cleaned[1:-1].strip()
            changed = True
    return cleaned


def effective_base_url(html_soup: BeautifulSoup, base_url: str) -> str:
    """Return the URL relative links resolve against.

    :param html_soup: Parsed document, possibly containing ``<base href>``.
    :param base_url: Fetched page URL.
    :returns: Absolute base used for :func:`urllib.parse.urljoin`.
    """
    base_tag = html_soup.find("base", href=True)
    if not isinstance(base_tag, Tag):
        return base_url
    href = base_tag.get("href")
    if not isinstance(href, str) or not href.strip():
        return base_url
    return urljoin(base_url, href.strip())


def is_absolute_or_embedded_url(url: str) -> bool:
    """Return whether ``url`` must be left unchanged.

    :param url: Attribute value, already stripped.
    :returns: True for empty values, ``data:`` URIs, and absolute or non-http schemes.
    """
    if not url:
        return True
    return url.lower().startswith(
        (
            "data:",
            "mailto:",
            "javascript:",
            "tel:",
            "sms:",
            "http://",
            "https://",
        )
    )


def tag_class_names(tag: Tag) -> list[str]:
    """Return CSS classes on ``tag`` as a list of strings.

    :param tag: Element that may or may not have a class attribute.
    :returns: Class names, or an empty list.
    """
    classes = tag.get("class")
    if classes is None:
        return []
    if isinstance(classes, str):
        return classes.split()
    return [str(name) for name in classes]


def is_pandoc_math_tag(tag: Tag) -> bool:
    """Return whether ``tag`` is a Quarto/Pandoc math wrapper.

    :param tag: Element to test.
    :returns: True when classes include ``math`` and ``inline`` or ``display``.
    """
    classes = tag_class_names(tag)
    return "math" in classes and ("inline" in classes or "display" in classes)


def annotation_tex(container: Tag) -> str | None:
    """Return TeX from the first MathML ``application/x-tex`` annotation.

    :param container: Element that may contain an ``annotation`` child.
    :returns: Annotation text, or ``None`` when no TeX annotation is present.
    """
    for annotation in container.find_all("annotation"):
        encoding = annotation.get("encoding")
        if not isinstance(encoding, str):
            continue
        if encoding.lower() != "application/x-tex":
            continue
        text = annotation.get_text()
        if text.strip():
            return text
    return None


def pandoc_math_tex(tag: Tag) -> str | None:
    """Return the TeX source carried by a Quarto/Pandoc math element.

    Prefers an embedded MathML annotation when the span also holds rendered
    markup. Otherwise uses the element's text, which for Quarto is the
    delimited TeX source.

    :param tag: Pandoc math element.
    :returns: TeX source, or ``None`` when the element has no text.
    """
    annotated = annotation_tex(tag)
    if annotated is not None and annotated.strip():
        return annotated
    text = tag.get_text()
    if text.strip():
        return text
    return None


def mathml_is_display(tag: Tag, tex: str) -> bool:
    """Return whether a MathML element should render as display math.

    :param tag: ``math`` element.
    :param tex: Annotation TeX, possibly still wrapped in delimiters.
    :returns: True for ``display="block"`` or TeX wrapped in display delimiters.
    """
    display_attr = tag.get("display")
    if isinstance(display_attr, str) and display_attr.lower() == "block":
        return True
    stripped = tex.strip()
    return stripped.startswith("\\[") or stripped.startswith("$$")


def mathjax_display_mode(script: Tag) -> str | None:
    """Return ``inline`` or ``display`` for a MathJax script, else ``None``.

    :param script: ``script`` element.
    :returns: Display mode, or ``None`` when the type is not ``math/tex``.
    """
    script_type = script.get("type")
    if not isinstance(script_type, str):
        return None
    lowered = script_type.strip().lower()
    if not lowered.startswith("math/tex"):
        return None
    if "mode=display" in lowered:
        return "display"
    return "inline"


def innermost_tags(tags: list[Tag]) -> list[Tag]:
    """Keep tags that do not contain another tag from the same list.

    :param tags: Candidate elements in document order.
    :returns: Tags with no selected descendant.
    """
    selected = {id(tag) for tag in tags}
    kept: list[Tag] = []
    for tag in tags:
        contains_selected = False
        for descendant in tag.descendants:
            if isinstance(descendant, Tag) and id(descendant) in selected:
                contains_selected = True
                break
        if not contains_selected:
            kept.append(tag)
    return kept


def take_math(
    tag: Tag,
    tex: str,
    display: bool,
    blocks: list[ExtractedMath],
    prefix: str,
) -> None:
    """Store ``tex`` and replace ``tag`` with a placeholder.

    :param tag: Element to remove from the document.
    :param tex: LaTeX source. HTML entities are unescaped. Empty input is ignored.
    :param display: Whether the expression is display math.
    :param blocks: Accumulator of extracted blocks. Updated in place.
    :param prefix: Placeholder prefix unique to this document.
    """
    cleaned = html.unescape(tex).strip()
    if not cleaned:
        return
    placeholder = f"{prefix}{len(blocks)}END"
    blocks.append(ExtractedMath(placeholder=placeholder, tex=cleaned, display=display))
    tag.replace_with(placeholder)
