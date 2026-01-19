"""Code Generation Handler Plugin

Provides AI-powered Python code generation with DataFrame context
and conversation history awareness.

Returns SSE stream of generated code tokens.
"""

import logging
import traceback

from fastapi import Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from canvas_chat.file_upload_handler_plugin import FileUploadHandlerPlugin

logger = logging.getLogger(__name__)


# =============================================================================
# Request/Response Models
# =============================================================================


class Message(BaseModel):
    """Message for conversation context."""

    role: str
    content: str


class GenerateCodeRequest(BaseModel):
    """Request model for AI-augmented code generation."""

    prompt: str  # Natural language description of desired code
    existing_code: str | None = None  # Current code (for modifications)
    dataframe_info: list[dict] | None = None  # DataFrame metadata
    context: list[Message] | None = None  # Ancestor node content
    model: str = "anthropic/claude-sonnet-4-20250514"
    api_key: str | None = None
    base_url: str | None = None


# =============================================================================
# Endpoint Registration
# =============================================================================


def register_endpoints(app):
    """Register FastAPI endpoints for code generation.

    This function is called from app.py to register plugin-specific endpoints.
    This keeps the endpoints self-contained within the plugin.

    Args:
        app: FastAPI application instance
    """
    from fastapi import HTTPException

    # Define the endpoint inline to access request models
    @app.post("/api/generate-code")
    async def generate_code(request: GenerateCodeRequest, http_request: Request):
        """
        Generate Python code based on natural language prompt with DataFrame
        and conversation context.

        Returns SSE stream of code tokens.
        """
        # Inject admin credentials if in admin mode
        from canvas_chat.app import inject_admin_credentials

        inject_admin_credentials(request)

        logger.info(f"Code generation request: {request.prompt[:50]}...")

        try:
            # Import here to avoid circular imports
            from canvas_chat.app import (
                extract_provider,
                get_api_key_for_provider,
                litellm,
                prepare_copilot_openai_request,
            )

            # Build system prompt with context
            system_parts = []
            system_parts.append(
                "You are a Python code generator. Output ONLY valid Python code. "
                "No explanations, no markdown code fences, no comments "
                "explaining what the code does. "
                "Just executable Python code that accomplishes the user's "
                "request.\n\n"
                "CRITICAL: When DataFrames are provided below, you MUST use "
                "the EXACT column names shown. "
                "Do NOT guess, hallucinate, or make up column names. "
                "Use ONLY the columns listed."
            )

            # Add DataFrame context if available
            if request.dataframe_info:
                system_parts.append("\n\n" + "=" * 60)
                system_parts.append(
                    "\nAVAILABLE DATAFRAMES (USE EXACT COLUMN NAMES BELOW)"
                )
                system_parts.append("\n" + "=" * 60)
                for df_info in request.dataframe_info:
                    var_name = df_info.get("varName", "df")
                    shape = df_info.get("shape", [0, 0])
                    columns = df_info.get("columns", [])
                    dtypes = df_info.get("dtypes", {})
                    head = df_info.get("head", "")

                    system_parts.append(f"\n\nVariable: {var_name}")
                    system_parts.append(
                        f"\nShape: {shape[0]} rows × {shape[1]} columns"
                    )

                    if columns:
                        system_parts.append(
                            "\n\nEXACT COLUMN NAMES (use these exactly as shown):"
                        )
                        for col in columns:
                            dtype = dtypes.get(col, "unknown")
                            system_parts.append(f"  - '{col}' (dtype: {dtype})")

                    if head:
                        system_parts.append("\n\nSample data (first 3 rows):")
                        system_parts.append(f"{head}")

                system_parts.append("\n" + "=" * 60)
                system_parts.append(
                    "\nREMEMBER: Use ONLY the column names listed above. "
                    "Do not invent new ones."
                )
                system_parts.append("\n" + "=" * 60)

            # Add conversation context if available (PDF content, paper text, etc.)
            if request.context:
                system_parts.append("\n\nRelevant context from previous nodes:")
                for msg in request.context:
                    role = msg.role
                    content = msg.content
                    system_parts.append(f"\n[{role}]: {content}")

            # Add existing code context if modifying
            if request.existing_code:
                system_parts.append(
                    f"\n\nCurrent code to modify:\n```python\n"
                    f"{request.existing_code}\n```"
                )

            system_prompt = "".join(system_parts)

            # Build messages
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.prompt},
            ]

            # Get API credentials
            provider = extract_provider(request.model)
            api_key = get_api_key_for_provider(provider, request.api_key)

            kwargs = {
                "model": request.model,
                "messages": messages,
                "temperature": 0.3,  # Lower temperature for code generation
                "stream": True,
            }

            if api_key:
                kwargs["api_key"] = api_key
            if request.base_url:
                kwargs["base_url"] = request.base_url

            kwargs = prepare_copilot_openai_request(kwargs, request.model, api_key)

            async def generate():
                try:
                    response = await litellm.acompletion(**kwargs)
                    async for chunk in response:
                        if chunk.choices and chunk.choices[0].delta.content:
                            content = chunk.choices[0].delta.content
                            yield {"event": "message", "data": content}
                    yield {"event": "done", "data": ""}
                except litellm.AuthenticationError as e:
                    logger.error(f"Authentication error: {e}")
                    yield {"event": "error", "data": f"Authentication failed: {e}"}
                except litellm.RateLimitError as e:
                    logger.error(f"Rate limit error: {e}")
                    yield {"event": "error", "data": f"Rate limit exceeded: {e}"}
                except Exception as e:
                    logger.error(f"Code generation error: {e}")
                    logger.error(traceback.format_exc())
                    yield {"event": "error", "data": f"Code generation failed: {e}"}

            return EventSourceResponse(generate())

        except Exception as e:
            logger.error(f"Code generation setup failed: {e}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e

    logger.info("Code generation endpoint registered via plugin")


# =============================================================================
# Plugin Registration (for file upload handlers)
# =============================================================================


class CodeGenerationHandler(FileUploadHandlerPlugin):
    """Handler for code-related file operations (placeholder)."""

    async def process_file(self, file_bytes: bytes, filename: str) -> dict:
        """Code generation is handled via API, not file upload."""
        raise NotImplementedError("Code generation is handled via /api/generate-code")


logger.info("Code generation handler plugin loaded")
