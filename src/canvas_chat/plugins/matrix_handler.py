"""
Matrix Feature Plugin - Python Backend

Handles matrix-specific API endpoints for parsing rows/columns from context
and filling matrix cells.
"""

import logging
import traceback

import litellm
from fastapi import HTTPException
from llamabot import AsyncStructuredBot
from llamabot.components.messages import HumanMessage
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)


class ParseTwoListsRequest(BaseModel):
    """Request body for parsing two lists from context nodes."""

    contents: list[str]
    context: str
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class Message(BaseModel):
    """Message for conversation context."""

    role: str
    content: str


class MatrixTwoListsOutput(BaseModel):
    """Structured output for parse-two-lists."""

    rows: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)


class MatrixFillRequest(BaseModel):
    """Request body for filling a matrix cell."""

    row_item: str
    col_item: str
    context: str  # User-provided matrix context
    messages: list[Message]  # DAG history for additional context
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


def register_endpoints(app):
    """Register matrix plugin endpoints with the FastAPI app."""

    @app.post("/api/parse-two-lists")
    async def parse_two_lists(request: ParseTwoListsRequest):
        """
        Use LLM to extract two separate lists from context node contents.

        Returns two lists: one for rows, one for columns (max 10 each).
        """
        from canvas_chat.app import (
            copilot_extras_for_bot,
            extract_provider,
            get_api_key_for_provider,
            inject_admin_credentials,
            prepare_copilot_openai_request,
        )

        inject_admin_credentials(request)

        combined_content = "\n\n---\n\n".join(request.contents)
        logger.info(
            f"Parse two lists request: {len(request.contents)} nodes, "
            f"total length={len(combined_content)}, "
            f"context={request.context[:50]}..."
        )

        provider = extract_provider(request.model)

        system_prompt = f"""The user wants to create a matrix/table for: {request.context}

Extract TWO separate lists from the following text as SHORT LABELS for matrix rows and columns.

Rules:
- Return ONLY a JSON object with "rows" and "columns" arrays, no other text
- Extract just the NAME or LABEL of each item, not descriptions
- For example: "GitHub Copilot: $10/month..." -> "GitHub Copilot" (not the full text)
- Look for two naturally separate categories (e.g., products vs attributes, services vs features)
- If the text uses "vs" or "versus", split on that: items before "vs" go to rows, items after go to columns
- If items are comma-separated, split them into individual entries
- If the text has numbered/bulleted lists, extract the item names from those
- If only one list is clearly present, put it in "rows" and infer reasonable column headers from the context  # noqa: E501
- Maximum 10 items per list - pick the most distinct ones if there are more
- Keep labels concise (1-5 words typically)

Example 1: "Python, JavaScript vs Speed, Ease of Learning"
Example 1 output: {{"rows": ["Python", "JavaScript"], "columns": ["Speed", "Ease of Learning"]}}

Example 2: "1. GitHub Copilot: $10/month... 2. Tabnine: Free tier available..."
Example 2 output: {{"rows": ["GitHub Copilot", "Tabnine"], "columns": ["Price", "Features", "Python Support"]}}"""  # noqa: E501

        try:
            api_key = get_api_key_for_provider(provider, request.api_key)

            # Use ``litellm.supports_response_schema`` (module attribute), not a
            # function imported before ``app`` patches Copilot (see app.py).
            if not litellm.supports_response_schema(
                model=request.model, custom_llm_provider=None
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Parse-two-lists needs a model that supports structured JSON "
                        "(response_schema). Pick a model that supports it for your "
                        "provider, or switch provider."
                    ),
                )

            prep = {
                "model": request.model,
                "messages": [],
                "api_key": api_key,
                "base_url": request.base_url,
            }
            prep = prepare_copilot_openai_request(prep, request.model, api_key)
            extras = copilot_extras_for_bot(prep)
            parse_lists_bot = AsyncStructuredBot(
                system_prompt=system_prompt,
                pydantic_model=MatrixTwoListsOutput,
                model_name=prep["model"],
                temperature=0.3,
                stream_target="none",
                api_key=prep.get("api_key"),
                **extras,
            )

            result = await parse_lists_bot(
                HumanMessage(content=combined_content), num_attempts=5
            )
            if result is None:
                raise HTTPException(
                    status_code=502,
                    detail="Could not obtain valid structured output after retries.",
                )
            return {"rows": result.rows, "columns": result.columns}

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Parse-two-lists failed: {e}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/matrix/fill")
    async def matrix_fill(request: MatrixFillRequest):
        """
        Fill a single matrix cell by evaluating row item against column item.

        Returns SSE stream with the evaluation content.
        """
        from canvas_chat.app import (
            _stream_text_deltas_async_simple_bot,
            extract_provider,
            get_api_key_for_provider,
            inject_admin_credentials,
            prepare_copilot_openai_request,
        )

        inject_admin_credentials(request)

        logger.info(
            f"Matrix fill request: row_item={request.row_item[:50]}..., "
            f"col_item={request.col_item[:50]}..."
        )

        provider = extract_provider(request.model)

        async def generate():
            try:
                system_prompt = f"""You are evaluating items in a matrix.
Matrix context: {request.context}

You will be given a row item and a column item. Evaluate or analyze the row
item against the column item. Be concise (2-3 sentences). Focus on the specific
intersection of these two items. Do not repeat the item names in your response
- get straight to the evaluation."""

                messages = [{"role": "system", "content": system_prompt}]

                for msg in request.messages:
                    messages.append({"role": msg.role, "content": msg.content})

                messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"Row item: {request.row_item}\n"
                            f"Column item: {request.col_item}"
                        ),
                    }
                )

                kwargs = {
                    "model": request.model,
                    "temperature": 0.5,
                }

                api_key = get_api_key_for_provider(provider, request.api_key)
                if api_key:
                    kwargs["api_key"] = api_key

                if request.base_url:
                    kwargs["base_url"] = request.base_url

                kwargs = prepare_copilot_openai_request(kwargs, request.model, api_key)

                async for content in _stream_text_deltas_async_simple_bot(
                    messages, kwargs, temperature=0.5
                ):
                    yield {"event": "message", "data": content}

                yield {"event": "done", "data": ""}

            except Exception as e:
                logger.error(f"Matrix fill error: {e}")
                logger.error(traceback.format_exc())
                yield {"event": "error", "data": str(e)}

        return EventSourceResponse(generate())
