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

import asyncio
import asyncio
import json
import logging
import traceback
from pathlib import Path
from typing import Optional

import litellm
import httpx
import pymupdf
from exa_py import Exa
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
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


class CommitteeRequest(BaseModel):
    """Request body for LLM committee endpoint.

    The committee feature allows multiple LLMs to respond to a question,
    optionally review each other's responses, and then have a chairman
    model synthesize a final answer.
    """

    question: str  # The question to ask the committee
    context: list[Message]  # Conversation history for context
    models: list[str]  # Committee member models (2-5 models)
    chairman_model: str  # Model that synthesizes the final answer
    api_keys: dict[str, str]  # Provider -> API key mapping
    base_url: Optional[str] = None
    include_review: bool = False  # Whether to include review/ranking stage


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


# --- URL Fetch Endpoint ---


class FetchUrlRequest(BaseModel):
    """Request body for fetching URL content as markdown."""

    url: str


class FetchUrlResult(BaseModel):
    """Result from fetching URL content."""

    url: str
    title: str
    content: str  # Markdown content


# --- PDF Upload/Fetch Models ---


class FetchPdfRequest(BaseModel):
    """Request body for fetching PDF content from URL."""

    url: str


class PdfResult(BaseModel):
    """Result from PDF text extraction."""

    filename: str
    content: str  # Markdown content with warning banner
    page_count: int


# Maximum PDF file size (25 MB)
MAX_PDF_SIZE = 25 * 1024 * 1024

# Warning banner prepended to PDF content
PDF_WARNING_BANNER = """> 📄 **PDF Import** — Text was extracted automatically and may contain errors.
> Consider sourcing the original if precision is critical. Edit this note to correct any issues.

---

"""


def extract_text_from_pdf(pdf_bytes: bytes) -> tuple[str, int]:
    """
    Extract text from PDF bytes using pymupdf.

    Returns:
        tuple: (extracted_text, page_count)
    """
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)

    text_parts = []
    for page_num, page in enumerate(doc, start=1):
        page_text = page.get_text()
        if page_text.strip():
            text_parts.append(f"## Page {page_num}\n\n{page_text.strip()}")

    doc.close()

    full_text = (
        "\n\n".join(text_parts) if text_parts else "(No text content found in PDF)"
    )
    return full_text, page_count


async def fetch_url_via_jina(url: str, client: httpx.AsyncClient) -> tuple[str, str]:
    """
    Fetch URL content via Jina Reader API.

    Returns (title, content) tuple.
    Raises exception if Jina fails.
    """
    jina_url = f"https://r.jina.ai/{url}"
    response = await client.get(
        jina_url,
        headers={"Accept": "text/markdown"},
        follow_redirects=True,
    )

    if response.status_code != 200:
        raise Exception(f"Jina Reader returned {response.status_code}")

    content = response.text

    # Check for error messages in Jina response
    if "SecurityCompromiseError" in content or "blocked" in content.lower():
        raise Exception("Jina Reader blocked this domain")

    # Extract title from first markdown heading
    title = "Untitled"
    for line in content.split("\n"):
        if line.startswith("# "):
            title = line[2:].strip()
            break

    return title, content


async def fetch_url_directly(url: str, client: httpx.AsyncClient) -> tuple[str, str]:
    """
    Fetch URL content directly and convert HTML to markdown.

    Returns (title, content) tuple.
    Uses html2text for HTML-to-markdown conversion.
    """
    import html2text

    response = await client.get(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; CanvasChat/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
        follow_redirects=True,
    )

    if response.status_code != 200:
        raise Exception(f"Direct fetch returned {response.status_code}")

    html_content = response.text

    # Extract title from HTML
    title = "Untitled"
    import re

    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html_content, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()

    # Convert HTML to markdown
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = False
    h.ignore_emphasis = False
    h.body_width = 0  # Don't wrap lines
    content = h.handle(html_content)

    return title, content


@app.post("/api/fetch-url")
async def fetch_url(request: FetchUrlRequest):
    """
    Fetch the content of a URL and return it as markdown.

    Strategy:
    1. Try Jina Reader API first (free, good markdown conversion)
    2. Fall back to direct fetch + html2text if Jina fails

    Design rationale (see docs/explanation/url-fetching.md):
    - This endpoint enables zero-config URL fetching for /note <url>
    - Separate from /api/exa/get-contents which uses Exa API (requires API key)
    - Jina Reader provides good markdown conversion for most public web pages
    - Direct fetch fallback ensures robustness when Jina is unavailable
    """
    logger.info(f"Fetch URL request: url='{request.url}'")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Try Jina Reader first
            try:
                title, content = await fetch_url_via_jina(request.url, client)
                logger.info(f"Successfully fetched URL via Jina: {title}")
                return FetchUrlResult(url=request.url, title=title, content=content)
            except Exception as jina_error:
                logger.warning(
                    f"Jina Reader failed, falling back to direct fetch: {jina_error}"
                )

            # Fall back to direct fetch
            title, content = await fetch_url_directly(request.url, client)
            logger.info(f"Successfully fetched URL directly: {title}")
            return FetchUrlResult(url=request.url, title=title, content=content)

    except httpx.TimeoutException:
        logger.error(f"Timeout fetching URL: {request.url}")
        raise HTTPException(status_code=504, detail="Request timed out")
    except Exception as e:
        logger.error(f"Fetch URL failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# --- PDF Upload/Fetch Endpoints ---


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF file and extract its text content.

    The extracted text is returned as markdown with a warning banner
    about potential extraction errors.

    Limits:
    - Maximum file size: 25 MB
    - Only PDF files are accepted
    """
    logger.info(f"PDF upload request: filename='{file.filename}'")

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Read file content
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        logger.error(f"Failed to read uploaded file: {e}")
        raise HTTPException(status_code=400, detail="Failed to read uploaded file")

    # Validate file size
    if len(pdf_bytes) > MAX_PDF_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"PDF file is too large. Maximum size is {MAX_PDF_SIZE // (1024 * 1024)} MB",
        )

    # Extract text from PDF
    try:
        text, page_count = extract_text_from_pdf(pdf_bytes)
        content = PDF_WARNING_BANNER + text
        logger.info(
            f"Successfully extracted text from PDF: {file.filename} ({page_count} pages)"
        )
        return PdfResult(filename=file.filename, content=content, page_count=page_count)
    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Failed to extract text from PDF: {str(e)}"
        )


@app.post("/api/fetch-pdf")
async def fetch_pdf(request: FetchPdfRequest):
    """
    Fetch a PDF from a URL and extract its text content.

    The extracted text is returned as markdown with a warning banner
    about potential extraction errors.

    Limits:
    - Maximum file size: 25 MB
    - URL must point to a PDF file
    """
    logger.info(f"PDF fetch request: url='{request.url}'")

    # Extract filename from URL
    filename = request.url.split("/")[-1].split("?")[0]
    if not filename.endswith(".pdf"):
        filename = filename + ".pdf" if filename else "document.pdf"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Stream the response to check size before downloading fully
            async with client.stream(
                "GET", request.url, follow_redirects=True
            ) as response:
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Failed to fetch PDF: HTTP {response.status_code}",
                    )

                # Check content type
                content_type = response.headers.get("content-type", "")
                if (
                    "pdf" not in content_type.lower()
                    and not request.url.lower().endswith(".pdf")
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="URL does not appear to point to a PDF file",
                    )

                # Check content length if available
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > MAX_PDF_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDF file is too large. Maximum size is {MAX_PDF_SIZE // (1024 * 1024)} MB",
                    )

                # Read the PDF content
                pdf_bytes = b""
                async for chunk in response.aiter_bytes():
                    pdf_bytes += chunk
                    if len(pdf_bytes) > MAX_PDF_SIZE:
                        raise HTTPException(
                            status_code=413,
                            detail=f"PDF file is too large. Maximum size is {MAX_PDF_SIZE // (1024 * 1024)} MB",
                        )

        # Extract text from PDF
        text, page_count = extract_text_from_pdf(pdf_bytes)
        content = PDF_WARNING_BANNER + text
        logger.info(
            f"Successfully fetched and extracted PDF: {filename} ({page_count} pages)"
        )
        return PdfResult(filename=filename, content=content, page_count=page_count)

    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.error(f"Timeout fetching PDF: {request.url}")
        raise HTTPException(status_code=504, detail="Request timed out")
    except Exception as e:
        logger.error(f"Failed to fetch PDF: {e}")
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
            system_prompt = f"""You fill matrix cells with BRIEF evaluations. Context: {request.context}

STRICT FORMAT RULES:
- MAXIMUM 50 words total
- NO headers, NO bullet points, NO markdown formatting
- NO section titles like "Key Points" or "Summary"
- Plain text only, 2-3 sentences max
- Start directly with your evaluation

FORBIDDEN patterns:
- "## " or "### " (markdown headers)
- "**Bold text**"
- Starting with "This intersection..." or "When evaluating..."
- Lists or structured formats

Write like a terse expert jotting a note, not a formal report.

Be extremely concise. Sacrifice grammar for the sake of concision."""

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


# --- Committee Endpoint ---


def get_api_key_for_model(model: str, api_keys: dict[str, str]) -> Optional[str]:
    """Get the API key for a model from the api_keys dict."""
    provider = extract_provider(model)
    # Map provider names to storage keys
    provider_map = {
        "openai": "openai",
        "anthropic": "anthropic",
        "gemini": "google",
        "google": "google",
        "groq": "groq",
        "github": "github",
        "github_copilot": "github",
        "ollama": None,  # Ollama doesn't need API key
        "ollama_chat": None,
    }
    key_name = provider_map.get(provider.lower())
    if key_name:
        return api_keys.get(key_name)
    return None


async def stream_single_opinion(
    index: int,
    model: str,
    question: str,
    context: list[dict],
    api_key: Optional[str],
    base_url: Optional[str],
    queue: asyncio.Queue,
):
    """Stream a single committee member's opinion to the queue."""
    try:
        # Send start event
        await queue.put(
            {"event": "opinion_start", "data": {"index": index, "model": model}}
        )

        system_prompt = """You are a committee member providing your independent opinion.
Analyze the question thoughtfully and provide your perspective.
Be specific and substantive in your response."""

        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation context
        for msg in context:
            messages.append({"role": msg["role"], "content": msg["content"]})

        # Add the question
        messages.append({"role": "user", "content": question})

        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": 0.7,
            "stream": True,
        }

        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            kwargs["base_url"] = base_url

        add_copilot_headers(kwargs, model)

        response = await litellm.acompletion(**kwargs)
        full_content = ""

        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_content += content
                await queue.put(
                    {
                        "event": "opinion_chunk",
                        "data": {"index": index, "content": content},
                    }
                )

        await queue.put(
            {
                "event": "opinion_done",
                "data": {"index": index, "full_content": full_content},
            }
        )

        return full_content

    except Exception as e:
        logger.error(f"Opinion {index} failed: {e}")
        await queue.put(
            {"event": "opinion_error", "data": {"index": index, "error": str(e)}}
        )
        return None


async def stream_single_review(
    reviewer_index: int,
    reviewer_model: str,
    question: str,
    opinions: list[dict],  # {"index": int, "model": str, "content": str}
    api_key: Optional[str],
    base_url: Optional[str],
    queue: asyncio.Queue,
):
    """Stream a single committee member's review of other opinions."""
    try:
        await queue.put(
            {
                "event": "review_start",
                "data": {"reviewer_index": reviewer_index, "model": reviewer_model},
            }
        )

        # Build the review prompt with anonymized opinions
        other_opinions = [op for op in opinions if op["index"] != reviewer_index]
        opinions_text = "\n\n".join(
            [
                f"**Opinion {chr(65 + i)}:**\n{op['content']}"
                for i, op in enumerate(other_opinions)
            ]
        )

        system_prompt = """You are reviewing and ranking other committee members' opinions.
For each opinion, briefly comment on its strengths and weaknesses.
Then rank them from best to worst with a brief justification.
Be constructive and specific in your critique."""

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"""Question: {question}

Here are the other committee members' opinions:

{opinions_text}

Please review and rank these opinions.""",
            },
        ]

        kwargs = {
            "model": reviewer_model,
            "messages": messages,
            "temperature": 0.5,
            "stream": True,
        }

        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            kwargs["base_url"] = base_url

        add_copilot_headers(kwargs, reviewer_model)

        response = await litellm.acompletion(**kwargs)
        full_content = ""

        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_content += content
                await queue.put(
                    {
                        "event": "review_chunk",
                        "data": {"reviewer_index": reviewer_index, "content": content},
                    }
                )

        await queue.put(
            {
                "event": "review_done",
                "data": {
                    "reviewer_index": reviewer_index,
                    "full_content": full_content,
                },
            }
        )

        return full_content

    except Exception as e:
        logger.error(f"Review {reviewer_index} failed: {e}")
        await queue.put(
            {
                "event": "review_error",
                "data": {"reviewer_index": reviewer_index, "error": str(e)},
            }
        )
        return None


@app.post("/api/committee")
async def committee(request: CommitteeRequest):
    """
    Run an LLM committee to answer a question.

    Multiple models respond in parallel, optionally review each other's
    responses, then a chairman model synthesizes the final answer.

    Returns an SSE stream with opinion, review, and synthesis events.
    """
    logger.info(
        f"Committee request: question='{request.question[:50]}...', "
        f"models={request.models}, chairman={request.chairman_model}, "
        f"include_review={request.include_review}"
    )

    # Validate request
    if len(request.models) < 2:
        raise HTTPException(
            status_code=400, detail="At least 2 committee models required"
        )
    if len(request.models) > 5:
        raise HTTPException(
            status_code=400, detail="Maximum 5 committee models allowed"
        )

    async def generate():
        try:
            # Convert context messages to dicts
            context = [{"role": m.role, "content": m.content} for m in request.context]

            # Phase 1: Gather opinions in parallel
            queue: asyncio.Queue = asyncio.Queue()
            opinion_tasks = []

            for i, model in enumerate(request.models):
                api_key = get_api_key_for_model(model, request.api_keys)
                task = asyncio.create_task(
                    stream_single_opinion(
                        index=i,
                        model=model,
                        question=request.question,
                        context=context,
                        api_key=api_key,
                        base_url=request.base_url,
                        queue=queue,
                    )
                )
                opinion_tasks.append(task)

            # Stream events from queue while tasks are running
            opinions_done = 0
            opinions = {}  # index -> {"model": str, "content": str}

            while opinions_done < len(request.models):
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.1)
                    yield {"event": event["event"], "data": json.dumps(event["data"])}

                    if event["event"] == "opinion_done":
                        opinions_done += 1
                        idx = event["data"]["index"]
                        opinions[idx] = {
                            "index": idx,
                            "model": request.models[idx],
                            "content": event["data"]["full_content"],
                        }
                    elif event["event"] == "opinion_error":
                        opinions_done += 1

                except asyncio.TimeoutError:
                    # Check if all tasks are done
                    if all(task.done() for task in opinion_tasks):
                        # Drain remaining queue events
                        while not queue.empty():
                            event = await queue.get()
                            yield {
                                "event": event["event"],
                                "data": json.dumps(event["data"]),
                            }
                            if event["event"] == "opinion_done":
                                idx = event["data"]["index"]
                                opinions[idx] = {
                                    "index": idx,
                                    "model": request.models[idx],
                                    "content": event["data"]["full_content"],
                                }
                        break
                    continue

            # Wait for all opinion tasks to complete
            await asyncio.gather(*opinion_tasks, return_exceptions=True)

            # Phase 2: Reviews (if enabled)
            reviews = {}
            if request.include_review and len(opinions) > 1:
                review_queue: asyncio.Queue = asyncio.Queue()
                review_tasks = []
                opinions_list = list(opinions.values())

                for i, model in enumerate(request.models):
                    if i not in opinions:
                        continue  # Skip failed opinions
                    api_key = get_api_key_for_model(model, request.api_keys)
                    task = asyncio.create_task(
                        stream_single_review(
                            reviewer_index=i,
                            reviewer_model=model,
                            question=request.question,
                            opinions=opinions_list,
                            api_key=api_key,
                            base_url=request.base_url,
                            queue=review_queue,
                        )
                    )
                    review_tasks.append(task)

                # Stream review events
                reviews_done = 0
                expected_reviews = len(
                    [i for i in range(len(request.models)) if i in opinions]
                )

                while reviews_done < expected_reviews:
                    try:
                        event = await asyncio.wait_for(review_queue.get(), timeout=0.1)
                        yield {
                            "event": event["event"],
                            "data": json.dumps(event["data"]),
                        }

                        if event["event"] == "review_done":
                            reviews_done += 1
                            idx = event["data"]["reviewer_index"]
                            reviews[idx] = event["data"]["full_content"]
                        elif event["event"] == "review_error":
                            reviews_done += 1

                    except asyncio.TimeoutError:
                        if all(task.done() for task in review_tasks):
                            while not review_queue.empty():
                                event = await review_queue.get()
                                yield {
                                    "event": event["event"],
                                    "data": json.dumps(event["data"]),
                                }
                                if event["event"] == "review_done":
                                    idx = event["data"]["reviewer_index"]
                                    reviews[idx] = event["data"]["full_content"]
                            break
                        continue

                await asyncio.gather(*review_tasks, return_exceptions=True)

            # Phase 3: Chairman synthesis
            yield {
                "event": "synthesis_start",
                "data": json.dumps({"model": request.chairman_model}),
            }

            # Build synthesis prompt
            opinions_text = "\n\n".join(
                [
                    f"**{opinions[i]['model']}:**\n{opinions[i]['content']}"
                    for i in sorted(opinions.keys())
                ]
            )

            reviews_text = ""
            if reviews:
                reviews_text = "\n\n**Reviews:**\n" + "\n\n".join(
                    [
                        f"*Review by {request.models[i]}:*\n{reviews[i]}"
                        for i in sorted(reviews.keys())
                    ]
                )

            synthesis_prompt = f"""You are the chairman synthesizing the committee's responses.

Question: {request.question}

**Committee Opinions:**

{opinions_text}
{reviews_text}

Please synthesize these perspectives into a comprehensive, balanced answer.
Highlight areas of agreement and note any significant disagreements.
Provide your own assessment of the most accurate and helpful response."""

            chairman_api_key = get_api_key_for_model(
                request.chairman_model, request.api_keys
            )

            kwargs = {
                "model": request.chairman_model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a chairman synthesizing committee opinions into a final, comprehensive answer.",
                    },
                    {"role": "user", "content": synthesis_prompt},
                ],
                "temperature": 0.5,
                "stream": True,
            }

            if chairman_api_key:
                kwargs["api_key"] = chairman_api_key
            if request.base_url:
                kwargs["base_url"] = request.base_url

            add_copilot_headers(kwargs, request.chairman_model)

            response = await litellm.acompletion(**kwargs)
            synthesis_content = ""

            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    synthesis_content += content
                    yield {
                        "event": "synthesis_chunk",
                        "data": json.dumps({"content": content}),
                    }

            yield {
                "event": "synthesis_done",
                "data": json.dumps({"full_content": synthesis_content}),
            }
            yield {"event": "done", "data": ""}

        except Exception as e:
            logger.error(f"Committee failed: {e}")
            logger.error(traceback.format_exc())
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(generate())
