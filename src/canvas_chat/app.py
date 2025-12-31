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
import httpx
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
    base_url: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None


class SummarizeRequest(BaseModel):
    """Request body for summarize endpoint."""

    messages: list[Message]
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


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


class ExaGetContentsRequest(BaseModel):
    """Request body for Exa get-contents endpoint."""

    url: str
    api_key: str


class ExaContentsResult(BaseModel):
    """Result from Exa get-contents."""

    title: str
    url: str
    text: str
    published_date: Optional[str] = None
    author: Optional[str] = None


class ProviderModelsRequest(BaseModel):
    """Request body for fetching models from a provider."""

    provider: str  # "openai", "anthropic", "google", "groq", "github"
    api_key: str


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
        "id": "anthropic/claude-sonnet-4-5-20250929",
        "name": "Claude Sonnet 4.5",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-opus-4-5-20251101",
        "name": "Claude Opus 4.5",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-opus-4-20250514",
        "name": "Claude Opus 4",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-3-7-sonnet-20250219",
        "name": "Claude 3.7 Sonnet",
        "provider": "Anthropic",
        "context_window": 200000,
    },
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
        "name": "GPT-4o",
        "provider": "GitHub",
        "context_window": 128000,
    },
    {
        "id": "github/gpt-4o-mini",
        "name": "GPT-4o Mini",
        "provider": "GitHub",
        "context_window": 128000,
    },
    {
        "id": "github/Llama-3.3-70B-Instruct",
        "name": "Llama 3.3 70B",
        "provider": "GitHub",
        "context_window": 128000,
    },
    {
        "id": "github/DeepSeek-R1",
        "name": "DeepSeek R1",
        "provider": "GitHub",
        "context_window": 64000,
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


def get_copilot_headers(model: str) -> dict:
    """Return extra headers needed for GitHub Copilot models.

    GitHub Copilot API requires specific headers for IDE authentication.
    See: https://docs.litellm.ai/docs/providers/github_copilot
    """
    if model.startswith("github_copilot/"):
        return {
            "editor-version": "vscode/1.85.1",
            "Copilot-Integration-Id": "vscode-chat",
        }
    return {}


def add_copilot_headers(kwargs: dict, model: str) -> dict:
    """Add GitHub Copilot headers to kwargs if needed."""
    copilot_headers = get_copilot_headers(model)
    if copilot_headers:
        kwargs["extra_headers"] = copilot_headers
    return kwargs


OLLAMA_BASE_URL = "http://localhost:11434"


async def fetch_ollama_models() -> list[dict]:
    """Fetch available models from local Ollama instance."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = []
                for model in data.get("models", []):
                    name = model.get("name", "")
                    # Clean up model name for display (remove :latest suffix)
                    display_name = name.replace(":latest", "")
                    models.append(
                        {
                            "id": f"ollama_chat/{name}",
                            "name": display_name,
                            "provider": "Ollama",
                            "context_window": 128000,  # Default, varies by model
                        }
                    )
                return models
    except (httpx.RequestError, httpx.TimeoutException):
        # Ollama not running or not accessible
        pass
    return []


# Provider-specific model fetching functions
PROVIDER_ENDPOINTS = {
    "openai": "https://api.openai.com/v1/models",
    "groq": "https://api.groq.com/openai/v1/models",
    "github": "https://models.inference.ai.azure.com/models",
}

# Context windows for known models (used as fallback)
KNOWN_CONTEXT_WINDOWS = {
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-4": 8192,
    "gpt-3.5-turbo": 16385,
    "claude-3": 200000,
    "claude-3.5": 200000,
    "claude-sonnet-4": 200000,
    "claude-opus-4": 200000,
    "gemini-1.5": 2000000,
    "gemini-2": 1000000,
    "llama": 128000,
    "mixtral": 32768,
}


def get_context_window(model_id: str) -> int:
    """Estimate context window for a model based on known patterns."""
    model_lower = model_id.lower()
    for pattern, ctx in KNOWN_CONTEXT_WINDOWS.items():
        if pattern in model_lower:
            return ctx
    return 128000  # Default


def is_chat_model(model_id: str) -> bool:
    """Filter for models that support chat completions."""
    model_lower = model_id.lower()
    # Include chat-capable models
    chat_patterns = [
        "gpt-3.5",
        "gpt-4",
        "gpt-oss",
        "chatgpt",
        "claude",
        "gemini",
        "llama",
        "mixtral",
        "deepseek",
        "qwen",
        "compound",  # Groq compound models
    ]
    # Exclude non-chat models
    exclude_patterns = [
        "whisper",
        "tts",
        "dall-e",
        "embedding",
        "moderation",
        "guard",  # Safety/guard models
        "safeguard",
        "realtime",  # Realtime API models
        "audio",  # Audio models
        "turbo-instruct",  # Legacy instruct models (not chat)
        "image",  # Image generation models
    ]

    if any(exc in model_lower for exc in exclude_patterns):
        return False
    return any(pat in model_lower for pat in chat_patterns)


async def fetch_openai_models(api_key: str) -> list[dict]:
    """Fetch available models from OpenAI."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                PROVIDER_ENDPOINTS["openai"],
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code == 200:
                data = response.json()
                models = []
                for m in data.get("data", []):
                    model_id = m.get("id", "")
                    if is_chat_model(model_id):
                        models.append(
                            {
                                "id": f"openai/{model_id}",
                                "name": model_id,
                                "provider": "OpenAI",
                                "context_window": get_context_window(model_id),
                            }
                        )
                return models
    except (httpx.RequestError, httpx.TimeoutException) as e:
        logger.warning(f"Failed to fetch OpenAI models: {e}")
    return []


async def fetch_groq_models(api_key: str) -> list[dict]:
    """Fetch available models from Groq."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                PROVIDER_ENDPOINTS["groq"],
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code == 200:
                data = response.json()
                models = []
                for m in data.get("data", []):
                    model_id = m.get("id", "")
                    # Filter out non-chat models (TTS, whisper, guard, etc.)
                    if not is_chat_model(model_id):
                        continue
                    models.append(
                        {
                            "id": f"groq/{model_id}",
                            "name": model_id,
                            "provider": "Groq",
                            "context_window": m.get(
                                "context_window", get_context_window(model_id)
                            ),
                        }
                    )
                return models
    except (httpx.RequestError, httpx.TimeoutException) as e:
        logger.warning(f"Failed to fetch Groq models: {e}")
    return []


async def fetch_github_models(api_key: str) -> list[dict]:
    """Fetch available models from GitHub Models."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                PROVIDER_ENDPOINTS["github"],
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code == 200:
                data = response.json()
                models = []
                for m in data if isinstance(data, list) else data.get("data", []):
                    model_id = m.get("id", "") or m.get("name", "")
                    if model_id:
                        models.append(
                            {
                                "id": f"github/{model_id}",
                                "name": model_id,
                                "provider": "GitHub",
                                "context_window": get_context_window(model_id),
                            }
                        )
                return models
    except (httpx.RequestError, httpx.TimeoutException) as e:
        logger.warning(f"Failed to fetch GitHub models: {e}")
    return []


async def fetch_google_models(api_key: str) -> list[dict]:
    """Fetch available models from Google AI."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://generativelanguage.googleapis.com/v1/models?key={api_key}",
            )
            if response.status_code == 200:
                data = response.json()
                models = []
                for m in data.get("models", []):
                    # Model name format: "models/gemini-1.5-pro"
                    full_name = m.get("name", "")
                    model_id = full_name.replace("models/", "")
                    display_name = m.get("displayName", model_id)
                    # Only include generative models
                    if "generateContent" in m.get("supportedGenerationMethods", []):
                        models.append(
                            {
                                "id": f"gemini/{model_id}",
                                "name": display_name,
                                "provider": "Google",
                                "context_window": m.get("inputTokenLimit", 1000000),
                            }
                        )
                return models
    except (httpx.RequestError, httpx.TimeoutException) as e:
        logger.warning(f"Failed to fetch Google models: {e}")
    return []


# Anthropic doesn't have a models list API, so we use a static list
ANTHROPIC_MODELS = [
    {
        "id": "anthropic/claude-sonnet-4-5-20250929",
        "name": "Claude Sonnet 4.5",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-opus-4-5-20251101",
        "name": "Claude Opus 4.5",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-opus-4-20250514",
        "name": "Claude Opus 4",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "provider": "Anthropic",
        "context_window": 200000,
    },
    {
        "id": "anthropic/claude-3-7-sonnet-20250219",
        "name": "Claude 3.7 Sonnet",
        "provider": "Anthropic",
        "context_window": 200000,
    },
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
]


async def fetch_anthropic_models(api_key: str) -> list[dict]:
    """Return static Anthropic models (no list API available)."""
    # Verify the API key is valid by checking format
    if api_key and api_key.startswith("sk-ant-"):
        return ANTHROPIC_MODELS
    return []


# --- Routes ---


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main application."""
    index_path = STATIC_DIR / "index.html"
    return HTMLResponse(content=index_path.read_text())


@app.get("/api/models")
async def list_models() -> list[ModelInfo]:
    """List available models, including dynamically fetched Ollama models."""
    # Start with static registry models
    models = [ModelInfo(**m) for m in MODEL_REGISTRY]

    # Fetch Ollama models dynamically
    ollama_models = await fetch_ollama_models()
    models.extend([ModelInfo(**m) for m in ollama_models])

    return models


@app.post("/api/provider-models")
async def get_provider_models(request: ProviderModelsRequest) -> list[ModelInfo]:
    """Fetch available models from a specific provider using the provided API key."""
    provider = request.provider.lower()
    api_key = request.api_key

    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required")

    models: list[dict] = []

    if provider == "openai":
        models = await fetch_openai_models(api_key)
    elif provider == "anthropic":
        models = await fetch_anthropic_models(api_key)
    elif provider == "google":
        models = await fetch_google_models(api_key)
    elif provider == "groq":
        models = await fetch_groq_models(api_key)
    elif provider == "github":
        models = await fetch_github_models(api_key)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    return [ModelInfo(**m) for m in models]


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

    # Add base URL if provided (for custom LLM proxies)
    if request.base_url:
        kwargs["base_url"] = request.base_url

    # Add GitHub Copilot headers if needed
    add_copilot_headers(kwargs, request.model)

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
            error_msg = str(e)
            # Check for GitHub Copilot auth issues
            if (
                "github_copilot" in request.model.lower()
                or "copilot" in error_msg.lower()
            ):
                yield {
                    "event": "error",
                    "data": f'GitHub Copilot authentication required. Please run \'python -c "import litellm; litellm.completion(model=\\"github_copilot/gpt-4\\", messages=[{{\\"role\\": \\"user\\", \\"content\\": \\"test\\"}}])"\' in your terminal to authenticate. Original error: {error_msg}',
                }
            else:
                yield {"event": "error", "data": f"Authentication failed: {error_msg}"}
        except litellm.RateLimitError as e:
            yield {"event": "error", "data": f"Rate limit exceeded: {e}"}
        except litellm.APIError as e:
            yield {"event": "error", "data": f"API error: {e}"}
        except Exception as e:
            error_msg = str(e)
            # Also check for Copilot auth in general exceptions
            if request.model.startswith("github_copilot/") and (
                "auth" in error_msg.lower()
                or "device" in error_msg.lower()
                or "token" in error_msg.lower()
            ):
                yield {
                    "event": "error",
                    "data": f"GitHub Copilot authentication required. Please check your terminal/server logs for the device code and URL to authenticate. Error: {error_msg}",
                }
            else:
                yield {"event": "error", "data": f"Error: {error_msg}"}

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

    if request.base_url:
        kwargs["base_url"] = request.base_url

    # Add GitHub Copilot headers if needed
    add_copilot_headers(kwargs, request.model)

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


class RefineQueryRequest(BaseModel):
    """Request body for refining a user query with context."""

    user_query: str  # What the user typed (e.g., "how does this work?")
    context: str  # The context from selected text or parent nodes
    command_type: str = "search"  # "search" or "research"
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


@app.post("/api/refine-query")
async def refine_query(request: RefineQueryRequest):
    """
    Use an LLM to refine a user query using surrounding context.

    This resolves pronouns and vague references like "how does this work?"
    into specific queries based on the surrounding context.
    Works for both search queries and research instructions.
    """
    logger.info(
        f"Refine query: user_query='{request.user_query}', command_type={request.command_type}, context_length={len(request.context)}"
    )

    provider = extract_provider(request.model)

    # Different prompts for search vs research
    if request.command_type == "research":
        system_prompt = """You are a research instructions optimizer. Given a user's research request and the context it refers to, generate clear, specific research instructions.

Rules:
- Return ONLY the refined research instructions, nothing else
- Resolve any pronouns or vague references (like "this", "it", "that") using the context
- Make the instructions specific and actionable
- Include key technical terms from the context
- Keep it concise but complete (1-2 sentences)
- Do not include quotes around the instructions

Examples:
- User: "research more about this" Context: "Toffoli Gate (CCNOT)..." → "Research the Toffoli gate (CCNOT) in quantum computing, including its applications, implementation, and relationship to reversible computing"
- User: "find alternatives" Context: "gradient descent optimization..." → "Research alternative optimization algorithms to gradient descent, comparing their convergence properties and use cases"
- User: "explain how this works" Context: "transformer attention mechanism..." → "Research how the transformer attention mechanism works, including self-attention, multi-head attention, and their computational complexity" """
    else:
        system_prompt = """You are a search query optimizer. Given a user's question and the context it refers to, generate an effective web search query.

Rules:
- Return ONLY the search query text, nothing else
- Resolve any pronouns or vague references (like "this", "it", "that") using the context
- Make the query specific and searchable
- Include key technical terms from the context
- Keep it concise (under 15 words typically)
- Do not include quotes around the query

Examples:
- User: "how does this work?" Context: "Toffoli Gate (CCNOT)..." → "how Toffoli gate CCNOT quantum computing works"
- User: "explain this better" Context: "gradient descent optimization..." → "gradient descent optimization algorithm explained"
- User: "what are alternatives?" Context: "React framework..." → "React framework alternatives comparison" """

    try:
        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"User query: {request.user_query}\n\nContext:\n{request.context[:2000]}",
                },
            ],
            "temperature": 0.3,
            "max_tokens": 150,
        }

        # Add API key if provided
        if request.api_key:
            kwargs["api_key"] = request.api_key
        if request.base_url:
            kwargs["base_url"] = request.base_url

        response = await litellm.acompletion(**kwargs)
        refined_query = response.choices[0].message.content.strip()

        # Remove quotes if the LLM wrapped the query in them
        if refined_query.startswith('"') and refined_query.endswith('"'):
            refined_query = refined_query[1:-1]

        logger.info(f"Refined query: '{refined_query}'")
        return {"original_query": request.user_query, "refined_query": refined_query}

    except Exception as e:
        logger.error(f"Failed to refine query: {e}")
        logger.error(traceback.format_exc())
        # Fall back to the original query if LLM fails
        return {
            "original_query": request.user_query,
            "refined_query": request.user_query,
        }


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


def format_research_output(output) -> str:
    """Format Exa research output object into readable markdown."""
    if not output:
        return ""

    output_type = getattr(output, "output_type", None)

    if output_type == "tasks":
        # Planning phase: show reasoning and task list
        reasoning = getattr(output, "reasoning", "")
        tasks = getattr(output, "tasks_instructions", [])
        parts = []
        if reasoning:
            parts.append(f"**Planning:** {reasoning}")
        if tasks:
            parts.append("\n**Tasks:**")
            for i, task in enumerate(tasks, 1):
                parts.append(f"{i}. {task}")
        return "\n".join(parts)

    elif output_type == "completed":
        # Completed research: show content and optionally cost
        content = getattr(output, "content", "")
        cost = getattr(output, "cost_dollars", None)
        parts = [content]
        if cost:
            total = getattr(cost, "total", None)
            if total is not None:
                parts.append(f"\n\n---\n*Research cost: ${total:.4f}*")
        return "\n".join(parts)

    elif output_type == "stop":
        # Research stopped: show reasoning
        reasoning = getattr(output, "reasoning", "")
        return f"**Completed:** {reasoning}" if reasoning else ""

    else:
        # Unknown output type: try to get content or convert to string
        if hasattr(output, "content"):
            return output.content
        return str(output)


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
                    # Format the output object into readable markdown
                    formatted = format_research_output(event.output)
                    if formatted:
                        yield {"event": "content", "data": formatted}
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


@app.post("/api/exa/get-contents")
async def exa_get_contents(request: ExaGetContentsRequest):
    """
    Fetch the full page contents from a URL using Exa's get-contents API.

    Returns the page text, title, and metadata.
    """
    logger.info(f"Exa get-contents request: url='{request.url}'")

    try:
        exa = Exa(api_key=request.api_key)

        # Fetch contents for the URL
        logger.info("Calling Exa get_contents...")
        results = exa.get_contents(
            urls=[request.url],
            text={"max_characters": 10000},  # Get substantial text for summarization
        )

        if not results.results:
            raise HTTPException(status_code=404, detail="No content found for URL")

        result = results.results[0]
        logger.info(f"Got content for: {result.title}")

        return ExaContentsResult(
            title=result.title or "Untitled",
            url=result.url,
            text=result.text or "",
            published_date=result.published_date,
            author=result.author,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Exa get-contents failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# --- Matrix Endpoints ---


class MatrixFillRequest(BaseModel):
    """Request body for filling a matrix cell."""

    row_item: str
    col_item: str
    context: str  # User-provided matrix context
    messages: list[Message]  # DAG history for additional context
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class GenerateTitleRequest(BaseModel):
    """Request body for generating a session title."""

    content: str  # Summary of conversation content
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class GenerateSummaryRequest(BaseModel):
    """Request body for generating a node summary for semantic zoom."""

    content: str  # Node content to summarize
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class ParseTwoListsRequest(BaseModel):
    """Request body for parsing two lists from context nodes."""

    contents: list[str]  # Content from all selected context nodes
    context: str  # User-provided matrix context to help identify the two lists
    model: str = "openai/gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


@app.post("/api/parse-two-lists")
async def parse_two_lists(request: ParseTwoListsRequest):
    """
    Use LLM to extract two separate lists from context node contents.

    Returns two lists: one for rows, one for columns (max 10 each).
    """
    combined_content = "\n\n---\n\n".join(request.contents)
    logger.info(
        f"Parse two lists request: {len(request.contents)} nodes, total length={len(combined_content)}, context={request.context[:50]}..."
    )

    provider = extract_provider(request.model)

    system_prompt = f"""The user wants to create a matrix/table for: {request.context}

Extract TWO separate lists from the following text as SHORT LABELS for matrix rows and columns.

Rules:
- Return ONLY a JSON object with "rows" and "columns" arrays, no other text
- Extract just the NAME or LABEL of each item, not descriptions
- For example: "GitHub Copilot: $10/month..." → "GitHub Copilot" (not the full text)
- Look for two naturally separate categories (e.g., products vs attributes, services vs features)
- If the text has numbered/bulleted lists, extract the item names from those
- If only one list is clearly present, put it in "rows" and infer reasonable column headers from the context
- Maximum 10 items per list - pick the most distinct ones if there are more
- Keep labels concise (1-5 words typically)

Example input: "1. GitHub Copilot: $10/month... 2. Tabnine: Free tier available..."
Example output: {{"rows": ["GitHub Copilot", "Tabnine"], "columns": ["Price", "Features", "Python Support"]}}"""

    try:
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

        # Add GitHub Copilot headers if needed
        add_copilot_headers(kwargs, request.model)

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

            if request.base_url:
                kwargs["base_url"] = request.base_url

            # Add GitHub Copilot headers if needed
            add_copilot_headers(kwargs, request.model)

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


@app.post("/api/generate-title")
async def generate_title(request: GenerateTitleRequest):
    """
    Generate a session title based on conversation content.

    Returns a short, descriptive title for the canvas session.
    """
    logger.info(f"Generate title request: content length={len(request.content)}")

    provider = extract_provider(request.model)

    system_prompt = """Generate a short, descriptive title for a conversation/session based on the content provided.

Rules:
- Return ONLY the title text, no quotes or extra formatting
- Keep it concise: 3-6 words is ideal
- Make it descriptive of the main topic or theme
- Use title case
- Do not include generic words like "Discussion" or "Chat" unless truly relevant
- If content mentions specific topics, technologies, or concepts, include them

Examples of good titles:
- "Python API Design Patterns"
- "Marketing Strategy Q1 2025"
- "Machine Learning Model Optimization"
- "React Component Architecture"
"""

    try:
        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Generate a title for this conversation:\n\n{request.content}",
                },
            ],
            "temperature": 0.7,
            "max_tokens": 50,
        }

        api_key = get_api_key_for_provider(provider, request.api_key)
        if api_key:
            kwargs["api_key"] = api_key

        if request.base_url:
            kwargs["base_url"] = request.base_url

        # Add GitHub Copilot headers if needed
        add_copilot_headers(kwargs, request.model)

        response = await litellm.acompletion(**kwargs)
        title = response.choices[0].message.content.strip()

        # Clean up any quotes or extra formatting
        title = title.strip("\"'")

        logger.info(f"Generated title: {title}")
        return {"title": title}

    except Exception as e:
        logger.error(f"Generate title failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-summary")
async def generate_summary(request: GenerateSummaryRequest):
    """
    Generate a short summary of node content for semantic zoom.

    Returns a concise 5-10 word summary suitable for display when zoomed out.
    """
    logger.info(f"Generate summary request: content length={len(request.content)}")

    provider = extract_provider(request.model)

    system_prompt = """Generate a very short summary (5-10 words) for the following content.

Rules:
- Return ONLY the summary text, no quotes or formatting
- Be concise and descriptive
- Capture the main topic or key point
- Use sentence case
- Do not start with "This is about" or similar phrases

Examples:
- "Python decorator patterns for caching"
- "Marketing budget allocation for Q2"
- "Debugging React state management issues"
- "Benefits of microservices architecture"
"""

    try:
        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Summarize this content:\n\n{request.content[:2000]}",  # Limit content length
                },
            ],
            "temperature": 0.5,
            "max_tokens": 30,
        }

        api_key = get_api_key_for_provider(provider, request.api_key)
        if api_key:
            kwargs["api_key"] = api_key

        if request.base_url:
            kwargs["base_url"] = request.base_url

        # Add GitHub Copilot headers if needed
        add_copilot_headers(kwargs, request.model)

        response = await litellm.acompletion(**kwargs)
        summary = response.choices[0].message.content.strip()

        # Clean up any quotes or extra formatting
        summary = summary.strip("\"'")

        logger.info(f"Generated summary: {summary}")
        return {"summary": summary}

    except Exception as e:
        logger.error(f"Generate summary failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
