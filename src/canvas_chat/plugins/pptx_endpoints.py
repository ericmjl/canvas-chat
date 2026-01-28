"""PowerPoint (PPTX) API endpoints plugin.

This module contains PPTX-specific request/response models and endpoints.
It is registered from `canvas_chat.app` via `register_endpoints(app)`.

Why this lives here (not app.py):
- Keeps `app.py` focused on core app wiring
- Keeps PPTX-specific models/endpoints co-located with the PPTX feature
"""

from __future__ import annotations

import json
import logging
import traceback
from typing import Any

from pydantic import BaseModel, Field
from slugify import slugify

logger = logging.getLogger(__name__)


def _one_paragraph(text: str) -> str:
    """Normalize text to a single paragraph (no newlines, collapsed whitespace)."""
    return " ".join((text or "").strip().split())


def _extract_json_object(text: str) -> dict[str, Any]:
    """Parse a JSON object from LLM output (best-effort).

    This is a fallback mechanism for models/providers that return `message.content`
    as a string even when using structured output, or for non-structured models.
    """
    text = (text or "").strip()
    if not text:
        return {}

    # Strict parse
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # Best-effort: find first {...} region
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            if isinstance(data, dict):
                return data
        except Exception:
            return {}

    return {}


def _pptx_fallback_narrative_presets() -> list[dict[str, Any]]:
    """Fallback presets returned when LLM suggestions are unavailable."""
    return [
        {
            "id": "story-arc",
            "label": "Story arc",
            "description": (
                "A coherent narrative that flows slide-to-slide with a clear "
                "throughline."
            ),
            "voice": "Warm, confident, and clear.",
            "audience_hint": "",
            "length": "medium",
            "structure": "narrative",
            "inclusion": "captioned_only",
        },
        {
            "id": "executive-summary",
            "label": "Executive summary",
            "description": (
                "High-level summary: goals, key points, and recommended next steps."
            ),
            "voice": "Direct, crisp, and business-friendly.",
            "audience_hint": "Leadership / stakeholders",
            "length": "short",
            "structure": "executive_summary",
            "inclusion": "captioned_only",
        },
        {
            "id": "speaker-notes",
            "label": "Speaker notes",
            "description": (
                "Slide-by-slide speaker notes that are easy to present from."
            ),
            "voice": "Conversational and engaging.",
            "audience_hint": "",
            "length": "long",
            "structure": "speaker_notes",
            "inclusion": "all",
        },
    ]


def _slugify_id(text: str) -> str:
    return slugify(text or "") or "preset"


# =============================================================================
# Request/Response Models
# =============================================================================


class PptxSlideCaptionTitleRequest(BaseModel):
    """Request body for PPTX slide caption+title generation (text-only)."""

    slide_text: str = ""
    slide_title: str | None = None
    filename: str | None = None

    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class SlideCaptionTitleOutput(BaseModel):
    """Structured output for a single slide (title + one-paragraph caption)."""

    title: str = Field(..., description="Short slide title (max ~8 words).")
    caption: str = Field(
        ...,
        description="One paragraph caption (3-5 sentences). No bullets. No newlines.",
    )


class PptxDeckCaptionTitleRequest(BaseModel):
    """Request body for PPTX deck caption+title generation (text-only)."""

    slides: list[dict[str, Any]]
    filename: str | None = None

    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class DeckCaptionTitleOutput(BaseModel):
    """Structured output for an ordered list of slide title/caption pairs."""

    slides: list[SlideCaptionTitleOutput] = Field(
        ...,
        description=(
            "Ordered list of title/caption pairs, one per input slide, in the same "
            "order."
        ),
    )


class PptxNarrativeStyleSuggestionsRequest(BaseModel):
    """Request body for PPTX narrative style suggestions (text-only)."""

    slides: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Compact slide summaries, each with optional title/caption.",
    )
    filename: str | None = None

    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class NarrativeStylePreset(BaseModel):
    """A narrative preset suggested for weaving a deck."""

    id: str = Field(..., description="Stable slug id (lowercase, hyphenated).")
    label: str = Field(..., description="Short name shown in the UI.")
    description: str = Field(..., description="1-2 sentence description.")
    voice: str = Field("", description="Voice/persona guidance.")
    audience_hint: str = Field("", description="Suggested audience hint.")
    length: str = Field("medium", description="One of: short|medium|long.")
    structure: str = Field(
        "narrative",
        description="One of: narrative|executive_summary|speaker_notes.",
    )
    inclusion: str = Field("captioned_only", description="One of: all|captioned_only.")


class NarrativeStyleSuggestionsOutput(BaseModel):
    """Structured output for narrative style suggestions."""

    presets: list[NarrativeStylePreset]


# =============================================================================
# Endpoint Registration
# =============================================================================


def register_endpoints(app) -> None:
    """Register PPTX endpoints on the provided FastAPI app."""
    from fastapi import HTTPException

    @app.post("/api/pptx/caption-title-slide")
    async def pptx_caption_title_slide(request: PptxSlideCaptionTitleRequest):
        """Generate a slide title + one-paragraph caption (text-only)."""
        from canvas_chat.app import inject_admin_credentials

        inject_admin_credentials(request)

        system_prompt = """You generate slide titles and captions.

Rules:
- Return JSON matching the provided schema.
- Caption must be ONE paragraph (no newlines, no bullet points).
- Title must be short (max ~8 words).
"""

        slide_text = (request.slide_text or "").strip()
        slide_title = (request.slide_title or "").strip()
        filename = (request.filename or "").strip()

        user_prompt = (
            (f"Filename: {filename}\n\n" if filename else "")
            + (f"Existing slide title: {slide_title}\n\n" if slide_title else "")
            + "Slide text (may be incomplete):\n"
            + (slide_text[:4000] if slide_text else "(no text found)")
            + "\n\nReturn title + caption."
        )

        try:
            from canvas_chat.app import (
                _llm_text,
                litellm,
                prepare_copilot_openai_request,
            )

            supports_structured = litellm.supports_response_schema(
                model=request.model, custom_llm_provider=None
            )

            kwargs: dict[str, Any] = {
                "model": request.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 300,
            }
            if request.api_key:
                kwargs["api_key"] = request.api_key
            if request.base_url:
                kwargs["base_url"] = request.base_url

            kwargs = prepare_copilot_openai_request(
                kwargs, request.model, request.api_key
            )

            if supports_structured:
                kwargs["response_format"] = SlideCaptionTitleOutput
                response = await litellm.acompletion(**kwargs)
                content = response.choices[0].message.content
                if isinstance(content, str):
                    parsed = _extract_json_object(content)
                    out = SlideCaptionTitleOutput.model_validate(parsed)
                elif hasattr(content, "title") and hasattr(content, "caption"):
                    out = SlideCaptionTitleOutput(
                        title=content.title, caption=content.caption
                    )
                else:
                    out = SlideCaptionTitleOutput.model_validate(content)
            else:
                text = await _llm_text(
                    model=request.model,
                    api_key=request.api_key,
                    base_url=request.base_url,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=300,
                )
                out = SlideCaptionTitleOutput.model_validate(_extract_json_object(text))

            out.title = _one_paragraph(out.title).strip('"')
            out.caption = _one_paragraph(out.caption)
            return {"title": out.title, "caption": out.caption}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"PPTX slide caption/title failed: {e}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/pptx/caption-title-deck")
    async def pptx_caption_title_deck(request: PptxDeckCaptionTitleRequest):
        """Generate titles + one-paragraph captions for all slides (single call)."""
        from canvas_chat.app import inject_admin_credentials

        inject_admin_credentials(request)

        slides = request.slides or []
        if not isinstance(slides, list) or len(slides) == 0:
            raise HTTPException(status_code=400, detail="No slides provided")

        prepared: list[dict[str, str]] = []
        for s in slides:
            title = _one_paragraph(str((s or {}).get("title") or ""))[:120]
            text = str((s or {}).get("text_content") or "")
            prepared.append(
                {"title": title, "text_content": (text.strip()[:2500] if text else "")}
            )

        system_prompt = """You generate slide titles and captions for an entire deck.

Rules:
- Return JSON matching the provided schema.
- You MUST return exactly one {title, caption} object per input slide, in the same
  order.
- Each caption must be ONE paragraph (no newlines, no bullet points).
- Each title must be short (max ~8 words).
"""

        items = []
        for i, s in enumerate(prepared):
            items.append(
                f"Slide {i + 1}:\n"
                + (f"Existing title: {s['title']}\n" if s["title"] else "")
                + ("Text:\n" + (s["text_content"] or "(no text found)") + "\n")
            )

        filename = (request.filename or "").strip()
        user_prompt = (
            (f"Filename: {filename}\n\n" if filename else "")
            + "\n\n".join(items)
            + "\n\nReturn JSON with slides: [{title, caption}, ...]."
        )

        try:
            from canvas_chat.app import (
                _llm_text,
                litellm,
                prepare_copilot_openai_request,
            )

            supports_structured = litellm.supports_response_schema(
                model=request.model, custom_llm_provider=None
            )

            kwargs: dict[str, Any] = {
                "model": request.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 1200,
            }
            if request.api_key:
                kwargs["api_key"] = request.api_key
            if request.base_url:
                kwargs["base_url"] = request.base_url

            kwargs = prepare_copilot_openai_request(
                kwargs, request.model, request.api_key
            )

            if supports_structured:
                kwargs["response_format"] = DeckCaptionTitleOutput
                response = await litellm.acompletion(**kwargs)
                content = response.choices[0].message.content
                if isinstance(content, str):
                    out = DeckCaptionTitleOutput.model_validate(
                        _extract_json_object(content)
                    )
                elif hasattr(content, "slides"):
                    out = DeckCaptionTitleOutput(slides=content.slides)
                else:
                    out = DeckCaptionTitleOutput.model_validate(content)
            else:
                text = await _llm_text(
                    model=request.model,
                    api_key=request.api_key,
                    base_url=request.base_url,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=1200,
                )
                out = DeckCaptionTitleOutput.model_validate(_extract_json_object(text))

            if len(out.slides) != len(prepared):
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Model returned {len(out.slides)} slides, expected "
                        f"{len(prepared)}"
                    ),
                )

            normalized = []
            for s in out.slides:
                normalized.append(
                    {
                        "title": _one_paragraph(s.title).strip('"'),
                        "caption": _one_paragraph(s.caption),
                    }
                )

            return {"slides": normalized}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"PPTX deck caption/title failed: {e}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/pptx/narrative-style-suggestions")
    async def pptx_narrative_style_suggestions(
        request: PptxNarrativeStyleSuggestionsRequest,
    ):
        """Suggest 3-5 narrative style presets for weaving a PPTX deck."""
        from canvas_chat.app import inject_admin_credentials

        inject_admin_credentials(request)

        prepared: list[dict[str, str]] = []
        for s in (request.slides or [])[:25]:
            title = _one_paragraph(str((s or {}).get("title") or ""))[:120]
            caption = _one_paragraph(str((s or {}).get("caption") or ""))[:500]
            if not title and not caption:
                continue
            prepared.append({"title": title, "caption": caption})

        system_prompt = """You propose narrative presets for weaving a slide deck.

Return JSON matching the provided schema.

Rules:
- Provide 3-5 distinct presets.
- Each preset must be usable without further context.
- id: lowercase slug (letters, numbers, dashes) and stable.
- label: short and friendly.
- description: 1-2 sentences, concrete and specific.
- length must be one of: short|medium|long
- structure must be one of: narrative|executive_summary|speaker_notes
- inclusion must be one of: all|captioned_only
"""

        filename = (request.filename or "").strip()
        user_prompt = (
            (f"Filename: {filename}\n\n" if filename else "")
            + "Deck signals (titles/captions; may be partial):\n\n"
            + "\n\n".join(
                [
                    f"Slide {i + 1}:\n"
                    + (f"Title: {s['title']}\n" if s["title"] else "")
                    + (f"Caption: {s['caption']}\n" if s["caption"] else "")
                    for i, s in enumerate(prepared)
                ]
            )
            + "\n\nReturn presets."
        )

        try:
            from canvas_chat.app import (
                _llm_text,
                litellm,
                prepare_copilot_openai_request,
            )

            supports_structured = litellm.supports_response_schema(
                model=request.model, custom_llm_provider=None
            )

            kwargs: dict[str, Any] = {
                "model": request.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 800,
            }
            if request.api_key:
                kwargs["api_key"] = request.api_key
            if request.base_url:
                kwargs["base_url"] = request.base_url

            kwargs = prepare_copilot_openai_request(
                kwargs, request.model, request.api_key
            )

            if supports_structured:
                kwargs["response_format"] = NarrativeStyleSuggestionsOutput
                response = await litellm.acompletion(**kwargs)
                content = response.choices[0].message.content
                if isinstance(content, str):
                    out = NarrativeStyleSuggestionsOutput.model_validate(
                        _extract_json_object(content)
                    )
                elif hasattr(content, "presets"):
                    out = NarrativeStyleSuggestionsOutput(presets=content.presets)
                else:
                    out = NarrativeStyleSuggestionsOutput.model_validate(content)
            else:
                text = await _llm_text(
                    model=request.model,
                    api_key=request.api_key,
                    base_url=request.base_url,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                    max_tokens=800,
                )
                out = NarrativeStyleSuggestionsOutput.model_validate(
                    _extract_json_object(text)
                )

            presets: list[dict[str, Any]] = []
            for p in out.presets[:5]:
                label = _one_paragraph(p.label)[:60]
                desc = _one_paragraph(p.description)[:240]
                pid = _slugify_id(getattr(p, "id", "") or label)
                presets.append(
                    {
                        "id": pid,
                        "label": label,
                        "description": desc,
                        "voice": _one_paragraph(getattr(p, "voice", "") or "")[:200],
                        "audience_hint": _one_paragraph(
                            getattr(p, "audience_hint", "") or ""
                        )[:120],
                        "length": getattr(p, "length", "medium") or "medium",
                        "structure": getattr(p, "structure", "narrative")
                        or "narrative",
                        "inclusion": getattr(p, "inclusion", "captioned_only")
                        or "captioned_only",
                    }
                )

            if not presets:
                presets = _pptx_fallback_narrative_presets()
            return {"presets": presets}
        except Exception as e:
            logger.warning(f"PPTX narrative style suggestions failed: {e}")
            return {"presets": _pptx_fallback_narrative_presets()}
