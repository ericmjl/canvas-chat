"""
Matrix Feature Plugin - Python Backend

Handles matrix-specific API endpoints for parsing rows/columns from context
and filling matrix cells.
"""

import json
import logging
import re
import traceback

from fastapi import HTTPException
from pydantic import BaseModel
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
            import litellm

            kwargs = {
                "model": request.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": combined_content},
                ],
                "temperature": 0.3,
            }

            api_key = get_api_key_for_provider(provider, request.api_key)
            if api_key:
                kwargs["api_key"] = api_key

            if request.base_url:
                kwargs["base_url"] = request.base_url

            kwargs = prepare_copilot_openai_request(kwargs, request.model, api_key)

            response = await litellm.acompletion(**kwargs)
            title = response.choices[0].message.content.strip()

            title = title.strip("\"'")

            logger.info(f"Generated title: {title}")

            try:
                parsed = json.loads(title)
                return {
                    "rows": parsed.get("rows", []),
                    "columns": parsed.get("columns", []),
                }
            except json.JSONDecodeError:
                rows_match = re.search(r'"rows"\s*:\s*\[([^\]]*)\]', title)
                cols_match = re.search(r'"columns"\s*:\s*\[([^\]]*)\]', title)

                rows = []
                cols = []

                if rows_match:
                    rows = [
                        m.strip().strip('"')
                        for m in rows_match.group(1).split(",")
                        if m.strip()
                    ]

                if cols_match:
                    cols = [
                        m.strip().strip('"')
                        for m in cols_match.group(1).split(",")
                        if m.strip()
                    ]

                return {"rows": rows, "columns": cols}

        except Exception as e:
            logger.error(f"Generate title failed: {e}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/matrix/fill")
    async def matrix_fill(request: MatrixFillRequest):
        """
        Fill a single matrix cell by evaluating row item against column item.

        Returns SSE stream with the evaluation content.
        """
        from canvas_chat.app import (
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
                import litellm

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
                    "messages": messages,
                    "temperature": 0.5,
                    "stream": True,
                }

                api_key = get_api_key_for_provider(provider, request.api_key)
                if api_key:
                    kwargs["api_key"] = api_key

                if request.base_url:
                    kwargs["base_url"] = request.base_url

                kwargs = prepare_copilot_openai_request(kwargs, request.model, api_key)

                response = await litellm.acompletion(**kwargs)

                async for chunk in response:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield {"event": "message", "data": content}

                yield {"event": "done", "data": ""}

            except Exception as e:
                logger.error(f"Matrix fill error: {e}")
                logger.error(traceback.format_exc())
                yield {"event": "error", "data": str(e)}

        return EventSourceResponse(generate())
