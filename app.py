# /// script
# dependencies = [
#     "fastapi>=0.115.0",
#     "uvicorn>=0.32.0",
#     "litellm>=1.50.0",
#     "sse-starlette>=2.0.0",
#     "pydantic>=2.0.0",
#     "exa-py>=1.0.0",
# ]
# ///
"""
Canvas Chat - A visual, non-linear chat interface.

Conversations are nodes on an infinite canvas, allowing branching,
merging, and exploration of topics as a DAG.
"""

import json
import logging
import traceback
from pathlib import Path
from typing import Optional

import litellm
from exa_py import Exa
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure litellm
litellm.drop_params = True  # Drop unsupported params gracefully

app = FastAPI(title="Canvas Chat", version="0.1.0")

# Mount static files
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# --- Pydantic Models ---


class Message(BaseModel):
    """A single message in the conversation."""

    role: str  # "user", "assistant", "system"
    content: str


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""

    messages: list[Message]
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None


class SummarizeRequest(BaseModel):
    """Request body for summarize endpoint."""

    messages: list[Message]
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None


class ModelInfo(BaseModel):
    """Information about an available model."""

    id: str
    name: str
    provider: str
    context_window: int


class ExaSearchRequest(BaseModel):
    """Request body for Exa search endpoint."""

    query: str
    api_key: str
    num_results: int = 5
    search_type: str = "auto"  # "auto", "neural", "keyword"


class ExaSearchResult(BaseModel):
    """A single Exa search result."""

    title: str
    url: str
    snippet: str
    published_date: Optional[str] = None
    author: Optional[str] = None


class ExaResearchRequest(BaseModel):
    """Request body for Exa research endpoint."""

    instructions: str
    api_key: str
    model: str = "exa-research"  # "exa-research" or "exa-research-pro"


# --- Model Registry ---

# Common models with their context windows
# Users can still use any LiteLLM-supported model
MODEL_REGISTRY: list[dict] = [
    # OpenAI
    {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
        "provider": "OpenAI",
        "context_window": 128000,
    },
    {
        "id": "openai/gpt-4o-mini",
        "name": "GPT-4o Mini",
        "provider": "OpenAI",
        "context_window": 128000,
    },
    {
        "id": "openai/gpt-4-turbo",
        "name": "GPT-4 Turbo",
        "provider": "OpenAI",
        "context_window": 128000,
    },
    {
        "id": "openai/gpt-3.5-turbo",
        "name": "GPT-3.5 Turbo",
        "provider": "OpenAI",
        "context_window": 16385,
    },
    # Anthropic
    {
        "id": "anthropic/claude-3-5-sonnet-20241022",
        "name": "Claude 3.5 Sonnet",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-3-5-haiku-20241022",
        "name": "Claude 3.5 Haiku",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-3-opus-20240229",
        "name": "Claude 3 Opus",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    # Google
    {
        "id": "gemini/gemini-1.5-pro",
        "name": "Gemini 1.5 Pro",
        "provider": "Google",
        "context_window": 2000000,
    },
    {
        "id": "gemini/gemini-1.5-flash",
        "name": "Gemini 1.5 Flash",
        "provider": "Google",
        "context_window": 1000000,
    },
    # Ollama (local)
    {
        "id": "ollama_chat/llama3.1",
        "name": "Llama 3.1 (Local)",
        "provider": "Ollama",
        "context_window": 128000,
    },
    {
        "id": "ollama_chat/mistral",
        "name": "Mistral (Local)",
        "provider": "Ollama",
        "context_window": 32000,
    },
    # Groq
    {
        "id": "groq/llama-3.1-70b-versatile",
        "name": "Llama 3.1 70B",
        "provider": "Groq",
        "context_window": 128000,
    },
    {
        "id": "groq/mixtral-8x7b-32768",
        "name": "Mixtral 8x7B",
        "provider": "Groq",
        "context_window": 32768,
    },
    # GitHub Models (requires GitHub PAT with models:read scope)
    {
        "id": "github/gpt-4o",
        "name": "GPT-4o (GitHub)",
        "provider": "GitHub",
        "context_window": 128000,
    },
    {
        "id": "github/gpt-4o-mini",
        "name": "GPT-4o Mini (GitHub)",
        "provider": "GitHub",
        "context_window": 128000,
    },
    {
        "id": "github/Llama-3.3-70B-Instruct",
        "name": "Llama 3.3 70B (GitHub)",
        "provider": "GitHub",
        "context_window": 128000,
    },
    {
        "id": "github/DeepSeek-R1",
        "name": "DeepSeek R1 (GitHub)",
        "provider": "GitHub",
        "context_window": 64000,
    },
    # GitHub Copilot (requires active Copilot subscription)
    {
        "id": "github_copilot/gpt-4",
        "name": "GPT-4 (Copilot)",
        "provider": "GitHub Copilot",
        "context_window": 128000,
    },
    {
        "id": "github_copilot/claude-3.5-sonnet",
        "name": "Claude 3.5 Sonnet (Copilot)",
        "provider": "GitHub Copilot",
        "context_window": 200000,
    },
    {
        "id": "github_copilot/claude-sonnet-4",
        "name": "Claude Sonnet 4 (Copilot)",
        "provider": "GitHub Copilot",
        "context_window": 200000,
    },
    {
        "id": "github_copilot/claude-opus-4",
        "name": "Claude Opus 4 (Copilot)",
        "provider": "GitHub Copilot",
        "context_window": 200000,
    },
]


def get_api_key_for_provider(
    provider: str, request_key: Optional[str]
) -> Optional[str]:
    """Get API key from request or fall back to environment."""
    if request_key:
        return request_key
    # LiteLLM will automatically check environment variables
    return None


def extract_provider(model: str) -> str:
    """Extract provider from model string."""
    if "/" in model:
        return model.split("/")[0]
    # Default to OpenAI for models without prefix
    return "openai"


# --- Routes ---


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main application."""
    index_path = STATIC_DIR / "index.html"
    return HTMLResponse(content=index_path.read_text())


@app.get("/api/models")
async def list_models() -> list[ModelInfo]:
    """List available models."""
    return [ModelInfo(**m) for m in MODEL_REGISTRY]


@app.post("/api/chat")
async def chat(request: ChatRequest, http_request: Request):
    """
    Stream a chat completion response.

    The frontend sends the full conversation context (resolved from the DAG).
    We proxy to LiteLLM and stream the response back via SSE.
    """
    provider = extract_provider(request.model)

    # Build kwargs for litellm
    kwargs = {
        "model": request.model,
        "messages": [{"role": m.role, "content": m.content} for m in request.messages],
        "temperature": request.temperature,
        "stream": True,
    }

    if request.max_tokens:
        kwargs["max_tokens"] = request.max_tokens

    # Add API key if provided
    if request.api_key:
        kwargs["api_key"] = request.api_key

    async def generate():
        """Generate SSE events from the LLM stream."""
        try:
            response = await litellm.acompletion(**kwargs)

            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield {"event": "message", "data": content}

            # Send completion signal
            yield {"event": "done", "data": ""}

        except litellm.AuthenticationError as e:
            yield {"event": "error", "data": f"Authentication failed: {e}"}
        except litellm.RateLimitError as e:
            yield {"event": "error", "data": f"Rate limit exceeded: {e}"}
        except litellm.APIError as e:
            yield {"event": "error", "data": f"API error: {e}"}
        except Exception as e:
            yield {"event": "error", "data": f"Error: {e}"}

    return EventSourceResponse(generate())


@app.post("/api/summarize")
async def summarize(request: SummarizeRequest):
    """
    Generate a summary of a conversation branch.

    Used for creating summary nodes that condense long branches.
    """
    provider = extract_provider(request.model)

    # Build the summarization prompt
    conversation = "\n".join([f"{m.role}: {m.content}" for m in request.messages])

    summary_prompt = f"""Please provide a concise summary of the following conversation. 
Focus on the key points, decisions, and insights discussed.

Conversation:
{conversation}

Summary:"""

    kwargs = {
        "model": request.model,
        "messages": [{"role": "user", "content": summary_prompt}],
        "temperature": 0.3,  # Lower temperature for more consistent summaries
        "max_tokens": 500,
    }

    if request.api_key:
        kwargs["api_key"] = request.api_key

    try:
        response = await litellm.acompletion(**kwargs)
        summary = response.choices[0].message.content
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/token-count")
async def estimate_tokens(text: str, model: str = "openai/gpt-4o"):
    """
    Estimate token count for a piece of text.

    Used for context budget visualization.
    """
    try:
        # LiteLLM has a token counting utility
        count = litellm.token_counter(model=model, text=text)
        return {"tokens": count, "model": model}
    except Exception:
        # Fallback: rough estimate (4 chars per token)
        return {"tokens": len(text) // 4, "model": model, "estimated": True}


@app.post("/api/exa/search")
async def exa_search(request: ExaSearchRequest):
    """
    Search the web using Exa's neural search API.

    Returns search results that can be displayed as nodes on the canvas.
    """
    logger.info(
        f"Exa search request: query='{request.query}', num_results={request.num_results}"
    )

    try:
        exa = Exa(api_key=request.api_key)

        # Perform search with text content
        logger.info("Calling Exa search_and_contents...")
        results = exa.search_and_contents(
            request.query,
            type=request.search_type,
            num_results=request.num_results,
            text={"max_characters": 1500},
        )
        logger.info(f"Exa returned {len(results.results)} results")

        # Format results
        formatted_results = []
        for i, result in enumerate(results.results):
            logger.debug(
                f"Processing result {i}: title={result.title}, url={result.url}"
            )
            formatted_results.append(
                ExaSearchResult(
                    title=result.title or "Untitled",
                    url=result.url,
                    snippet=result.text[:500] if result.text else "",
                    published_date=result.published_date,
                    author=result.author,
                )
            )

        logger.info(f"Successfully formatted {len(formatted_results)} results")
        return {
            "query": request.query,
            "results": formatted_results,
            "num_results": len(formatted_results),
        }

    except Exception as e:
        logger.error(f"Exa search failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/exa/research")
async def exa_research(request: ExaResearchRequest):
    """
    Perform deep research using Exa's Research API.

    Returns an SSE stream with research progress and final report.
    """
    logger.info(
        f"Exa research request: instructions='{request.instructions[:100]}...', model={request.model}"
    )

    async def generate():
        try:
            exa = Exa(api_key=request.api_key)

            # Create research task
            logger.info("Creating Exa research task...")
            research = exa.research.create(
                instructions=request.instructions,
                model=request.model,
            )
            logger.info(f"Research task created: {research.research_id}")

            # Stream the research results
            yield {"event": "status", "data": "Research started..."}

            for event in exa.research.get(research.research_id, stream=True):
                # The event object contains progress updates and final results
                if hasattr(event, "status"):
                    yield {"event": "status", "data": event.status}
                if hasattr(event, "output") and event.output:
                    yield {"event": "content", "data": event.output}
                if hasattr(event, "sources") and event.sources:
                    # Send sources as JSON
                    sources_data = [
                        {"title": s.title, "url": s.url} for s in event.sources
                    ]
                    yield {"event": "sources", "data": json.dumps(sources_data)}

            yield {"event": "done", "data": ""}

        except Exception as e:
            logger.error(f"Exa research failed: {e}")
            logger.error(traceback.format_exc())
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(generate())


# --- Matrix Endpoints ---


class ParseListRequest(BaseModel):
    """Request body for parsing list items from node content."""

    content: str
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None


class MatrixFillRequest(BaseModel):
    """Request body for filling a matrix cell."""

    row_item: str
    col_item: str
    context: str  # User-provided matrix context
    messages: list[Message]  # DAG history for additional context
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None


@app.post("/api/parse-list")
async def parse_list(request: ParseListRequest):
    """
    Use LLM to extract list items from freeform text content.

    Returns a list of extracted items (max 10).
    """
    logger.info(f"Parse list request: content length={len(request.content)}")

    provider = extract_provider(request.model)

    system_prompt = """Extract distinct list items from the following text.
Rules:
- Return ONLY a JSON array of strings, no other text
- Each item should be a complete, standalone item from the list
- Preserve the full text of each item (don't truncate)
- If items are numbered or bulleted, remove the numbering/bullets
- Maximum 10 items - if there are more, pick the 10 most distinct ones
- If no clear list structure exists, try to identify distinct concepts/topics

Example output: ["Item one full text", "Item two full text", "Item three full text"]"""

    try:
        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.content},
            ],
            "temperature": 0.3,  # Lower temp for more consistent parsing
        }

        api_key = get_api_key_for_provider(provider, request.api_key)
        if api_key:
            kwargs["api_key"] = api_key

        response = await litellm.acompletion(**kwargs)
        content = response.choices[0].message.content.strip()

        # Parse the JSON array from the response
        # Handle potential markdown code blocks
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        items = json.loads(content)

        # Validate and limit to 10 items
        if not isinstance(items, list):
            raise ValueError("Response is not a list")
        items = [str(item) for item in items[:10]]

        logger.info(f"Parsed {len(items)} items from content")
        return {"items": items, "count": len(items)}

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse list items")
    except Exception as e:
        logger.error(f"Parse list failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


class ParseTwoListsRequest(BaseModel):
    """Request body for parsing two lists from a single node content."""

    content: str
    context: str  # User-provided matrix context to help identify the two lists
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None


@app.post("/api/parse-two-lists")
async def parse_two_lists(request: ParseTwoListsRequest):
    """
    Use LLM to extract two separate lists from a single piece of content.

    Returns two lists: one for rows, one for columns (max 10 each).
    """
    logger.info(
        f"Parse two lists request: content length={len(request.content)}, context={request.context[:50]}..."
    )

    provider = extract_provider(request.model)

    system_prompt = f"""The user wants to create a matrix/table for: {request.context}

Extract TWO separate lists from the following text that could serve as rows and columns for this matrix.

Rules:
- Return ONLY a JSON object with "rows" and "columns" arrays, no other text
- Each array should contain distinct items from the text
- Look for two naturally separate categories (e.g., ideas vs criteria, features vs users, options vs factors)
- If the text has numbered/bulleted lists, those are likely the items
- If only one list is clearly present, put it in "rows" and infer reasonable column headers from the context
- Maximum 10 items per list - pick the most distinct ones if there are more
- Preserve the full text of each item (don't truncate)

Example output: {{"rows": ["Row item 1", "Row item 2"], "columns": ["Column A", "Column B"]}}"""

    try:
        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.content},
            ],
            "temperature": 0.3,
        }

        api_key = get_api_key_for_provider(provider, request.api_key)
        if api_key:
            kwargs["api_key"] = api_key

        response = await litellm.acompletion(**kwargs)
        content = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        result = json.loads(content)

        # Validate structure
        if not isinstance(result, dict):
            raise ValueError("Response is not an object")
        if "rows" not in result or "columns" not in result:
            raise ValueError("Response missing 'rows' or 'columns'")

        rows = [str(item) for item in result["rows"][:10]]
        columns = [str(item) for item in result["columns"][:10]]

        logger.info(f"Parsed {len(rows)} rows and {len(columns)} columns from content")
        return {"rows": rows, "columns": columns}

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse lists")
    except Exception as e:
        logger.error(f"Parse two lists failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/matrix/fill")
async def matrix_fill(request: MatrixFillRequest):
    """
    Fill a single matrix cell by evaluating row item against column item.

    Returns SSE stream with the evaluation content.
    """
    logger.info(
        f"Matrix fill request: row_item={request.row_item[:50]}..., col_item={request.col_item[:50]}..."
    )

    provider = extract_provider(request.model)

    async def generate():
        try:
            system_prompt = f"""You are evaluating items in a matrix.
Matrix context: {request.context}

You will be given a row item and a column item. Evaluate or analyze the row item against the column item.
Be concise (2-3 sentences). Focus on the specific intersection of these two items.
Do not repeat the item names in your response - get straight to the evaluation."""

            # Build messages with history context
            messages = [{"role": "system", "content": system_prompt}]

            # Add conversation history for context (if any)
            for msg in request.messages:
                messages.append({"role": msg.role, "content": msg.content})

            # Add the specific cell evaluation request
            cell_prompt = f"""Row item: {request.row_item}

Column item: {request.col_item}

Evaluate this intersection:"""
            messages.append({"role": "user", "content": cell_prompt})

            kwargs = {
                "model": request.model,
                "messages": messages,
                "temperature": 0.7,
                "stream": True,
            }

            api_key = get_api_key_for_provider(provider, request.api_key)
            if api_key:
                kwargs["api_key"] = api_key

            response = await litellm.acompletion(**kwargs)

            async for chunk in response:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield {"event": "content", "data": content}

            yield {"event": "done", "data": ""}

        except Exception as e:
            logger.error(f"Matrix fill failed: {e}")
            logger.error(traceback.format_exc())
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(generate())


if __name__ == "__main__":
    import random

    import uvicorn

    port = random.randint(7000, 7999)
    print(f"Starting Canvas Chat on http://127.0.0.1:{port}")
    uvicorn.run("app:app", host="127.0.0.1", port=port, reload=True)
