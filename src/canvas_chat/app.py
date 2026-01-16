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
import importlib.util
import json
import logging
import os
import sys
import traceback
from pathlib import Path
from typing import Any, TypeVar

import httpx
import litellm
from exa_py import Exa
from fastapi import (
    FastAPI,
    File,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from canvas_chat import __version__
from canvas_chat.config import AppConfig
from canvas_chat.file_upload_registry import FileUploadRegistry

# Import built-in file upload handler plugins (registers them)
# Import built-in URL fetch handler plugins (registers them)
from canvas_chat.plugins import (
    git_repo_handler,  # noqa: F401
    pdf_handler,  # noqa: F401
    pdf_url_handler,  # noqa: F401
    youtube_handler,  # noqa: F401
)
from canvas_chat.plugins.pdf_handler import MAX_PDF_SIZE
from canvas_chat.url_fetch_registry import UrlFetchRegistry

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure litellm
litellm.drop_params = True  # Drop unsupported params gracefully

app = FastAPI(title="Canvas Chat", version=__version__)

# Register plugin-specific endpoints (must be after app creation)
git_repo_handler.register_endpoints(app)

# --- Configuration Management ---
# This is initialized at module load time based on environment variables
# set by the CLI (--config and --admin-mode flags)
_app_config: AppConfig | None = None


def get_admin_config() -> AppConfig:
    """Get the application configuration, initializing if needed.

    Returns configuration in one of three modes:
    1. Admin mode: Server-side API keys from config file
    2. Normal mode with config: Pre-populated models, users provide keys
    3. No config: Empty config, users provide everything
    """
    global _app_config
    if _app_config is None:
        config_path_str = os.environ.get("CANVAS_CHAT_CONFIG_PATH")
        admin_mode = os.environ.get("CANVAS_CHAT_ADMIN_MODE") == "true"

        if config_path_str:
            try:
                config_path = Path(config_path_str)
                _app_config = AppConfig.load(config_path, admin_mode=admin_mode)

                if admin_mode:
                    logger.info(
                        f"Admin mode: {len(_app_config.models)} models configured "
                        f"(server-side keys)"
                    )
                else:
                    logger.info(
                        f"Config loaded: {len(_app_config.models)} models configured "
                        f"(users provide keys via UI)"
                    )

                if _app_config.plugins:
                    logger.info(f"Loaded {len(_app_config.plugins)} plugin(s)")
                    # Load Python plugins dynamically
                    load_python_plugins(_app_config)
            except Exception as e:
                logger.error(f"Failed to load config: {e}")
                _app_config = AppConfig.empty()
        else:
            _app_config = AppConfig.empty()
    return _app_config


def load_python_plugins(config: AppConfig) -> None:
    """Load Python plugins from config dynamically.

    Python plugins are imported as modules, which triggers their registration
    with registries (e.g., FileUploadRegistry) via side-effect imports.

    Args:
        config: AppConfig with plugins to load
    """
    for plugin in config.plugins:
        if plugin.py_path:
            try:
                # Load the Python module dynamically
                spec = importlib.util.spec_from_file_location(
                    plugin.plugin_id, plugin.py_path
                )
                if spec is None or spec.loader is None:
                    logger.warning(
                        f"Failed to create spec for Python plugin: {plugin.py_path}"
                    )
                    continue

                module = importlib.util.module_from_spec(spec)
                # Add to sys.modules so imports within the plugin work correctly
                sys.modules[plugin.plugin_id] = module
                spec.loader.exec_module(module)

                logger.info(
                    f"Loaded Python plugin: {plugin.py_path.name} "
                    f"(id: {plugin.plugin_id})"
                )
            except Exception as e:
                logger.error(
                    f"Failed to load Python plugin {plugin.py_path}: {e}",
                    exc_info=True,
                )


# Mount static files
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
async def health_check(request: Request):
    """Simple health check endpoint used by CI to verify deployment.

    Returns a short JSON payload with status and optional service info.
    Attempts a lightweight readiness probe for optional local services (e.g., Ollama).
    If the optional service is not reachable, the endpoint still returns 200 but
    includes the service status so CI can choose how to interpret it.
    """
    result = {"status": "ok", "service": "canvas-chat"}

    # Check optional Ollama readiness (non-fatal)
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            result["ollama"] = resp.status_code == 200
    except Exception:
        result["ollama"] = False

    return result


# --- Pydantic Models ---


class Message(BaseModel):
    """A single message in the conversation.

    Content can be a string (text-only) or a list of content parts (multimodal).
    Multimodal format: [{"type": "text", "text": "..."},
    {"type": "image_url", "image_url": {"url": "data:..."}}]
    """

    role: str  # "user", "assistant", "system"
    content: str | list


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""

    messages: list[Message]
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = 0.7
    max_tokens: int | None = None


class SummarizeRequest(BaseModel):
    """Request body for summarize endpoint."""

    messages: list[Message]
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


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
    published_date: str | None = None
    author: str | None = None


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
    published_date: str | None = None
    author: str | None = None


class DDGSearchRequest(BaseModel):
    """Request body for DuckDuckGo search endpoint."""

    query: str
    max_results: int = 10


class DDGSearchResult(BaseModel):
    """A single DuckDuckGo search result."""

    title: str
    url: str
    snippet: str


class DDGResearchRequest(BaseModel):
    """Request body for DDG-based deep research fallback endpoint.

    This is used when Exa's /research is unavailable (no Exa API key).
    The backend orchestrates an iterative search -> fetch -> summarize loop
    using DuckDuckGo + free URL fetching + the user's selected LLM.
    """

    instructions: str
    context: str | None = None
    model: str
    api_key: str | None = None
    base_url: str | None = None
    max_iterations: int = 4
    max_sources: int = 40
    max_queries_per_iteration: int = 4
    max_results_per_query: int = 10


class DDGResearchSource(BaseModel):
    """A single discovered source for DDG-based research."""

    url: str
    title: str
    snippet: str | None = None
    summary: str
    iteration: int
    query: str


class ProviderModelsRequest(BaseModel):
    """Request body for fetching models from a provider."""

    provider: str  # "openai", "anthropic", "google", "groq", "github"
    api_key: str


class CommitteeRequest(BaseModel):
    """
    Request model for the committee feature.

    The committee feature allows multiple LLMs to respond to a question,
    optionally review each other's responses, and then have a chairman
    model synthesize a final answer.
    """

    question: str  # The question to ask the committee
    context: list[Message]  # Conversation history for context
    models: list[str]  # Committee member models (2-5 models)
    chairman_model: str  # Model that synthesizes the final answer
    api_keys: dict[str, str]  # Provider -> API key mapping
    base_url: str | None = None
    include_review: bool = False  # Whether to include review/ranking stage


class GenerateCodeRequest(BaseModel):
    """
    Request model for AI-augmented code generation.

    Generates Python code based on natural language prompts with context about
    available DataFrames and conversation history.
    """

    prompt: str  # Natural language description of desired code
    existing_code: str | None = None  # Current code (for modifications)
    dataframe_info: list[dict] | None = None  # DataFrame metadata
    context: list[Message] | None = None  # Ancestor node content
    model: str = "anthropic/claude-sonnet-4-20250514"
    api_key: str | None = None
    base_url: str | None = None


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


def get_api_key_for_provider(provider: str, request_key: str | None) -> str | None:
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
    html = index_path.read_text()

    # Inject plugin script tags if plugins are configured
    config = get_admin_config()
    if config.plugins:
        plugin_scripts = []
        for plugin in config.plugins:
            # Only inject JS plugins (Python plugins are loaded on backend)
            if plugin.js_path:
                plugin_url = f"/api/plugins/{plugin.js_path.name}"
                plugin_scripts.append(
                    f'        <script type="module" src="{plugin_url}"></script>'
                )

        # Inject before the closing </body> tag
        if plugin_scripts:
            plugin_html = "\n".join(plugin_scripts)
            html = html.replace(
                "</body>",
                f"\n        <!-- Custom plugins -->\n{plugin_html}\n    </body>",
            )

    return HTMLResponse(content=html)


@app.get("/api/config")
async def get_config():
    """Get application configuration for the frontend.

    Returns admin mode status and available models.
    In admin mode, returns admin-configured models (without secrets).
    In normal mode, returns empty models (frontend will fetch from providers).
    """
    config = get_admin_config()
    return {
        "adminMode": config.admin_mode,
        "models": config.get_frontend_models() if config.admin_mode else [],
    }


@app.get("/api/plugins")
async def list_plugins():
    """List available plugin files.

    Returns plugin information for JavaScript plugins configured in config.yaml.
    Python-only plugins are not listed (they're backend-only).
    """
    config = get_admin_config()
    if not config.plugins:
        return {"plugins": []}

    plugins_info = []
    for plugin in config.plugins:
        # Only list JS plugins (Python plugins are backend-only)
        if plugin.js_path:
            plugins_info.append(
                {
                    "name": plugin.js_path.name,
                    "url": f"/api/plugins/{plugin.js_path.name}",
                    "id": plugin.plugin_id,
                }
            )

    return {"plugins": plugins_info}


@app.get("/api/plugins/{plugin_name}")
async def serve_plugin(plugin_name: str):
    """Serve a plugin JavaScript file.

    Args:
        plugin_name: Name of the plugin file (e.g., "my-poll-node.js")

    Returns:
        The plugin file contents as JavaScript

    Raises:
        HTTPException: If plugin not found
    """
    config = get_admin_config()

    if not config.plugins:
        raise HTTPException(status_code=404, detail="Plugins not configured")

    # Find the plugin by JS filename
    plugin = None
    for p in config.plugins:
        if p.js_path and p.js_path.name == plugin_name:
            plugin = p
            break

    if plugin is None or not plugin.js_path:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_name}' not found")

    try:
        content = plugin.js_path.read_text()
        return HTMLResponse(content=content, media_type="application/javascript")
    except Exception as e:
        logger.error(f"Error serving plugin {plugin_name}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to load plugin: {str(e)}"
        ) from e


# --- Credential Injection for Admin Mode ---


# TypeVar for any request with model, api_key, and base_url fields
T = TypeVar("T")


def inject_admin_credentials(request: T) -> T:
    """Inject admin credentials into a request if admin mode is enabled.

    Works with any request object that has `model`, `api_key`, and optionally
    `base_url` attributes (e.g., ChatRequest, SummarizeRequest, etc.).

    In normal mode (admin mode disabled), this is a no-op.

    Args:
        request: Any request object with model/api_key/base_url fields

    Returns:
        The same request object, with credentials injected if in admin mode

    Raises:
        HTTPException: If admin mode is enabled but the requested model
            is not configured or the API key env var is not set.
    """
    config = get_admin_config()

    if not config.admin_mode:
        return request

    model_id = getattr(request, "model", None)
    if model_id is None:
        return request

    api_key, base_url = config.resolve_credentials(model_id)

    if api_key is None:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{model_id}' not available in admin mode",
        )

    # Inject credentials into the request
    request.api_key = api_key
    if base_url and hasattr(request, "base_url"):
        request.base_url = base_url

    return request


def inject_admin_credentials_committee(request: CommitteeRequest) -> CommitteeRequest:
    """Inject admin credentials into a CommitteeRequest if admin mode is enabled.

    CommitteeRequest is special because it has multiple models (committee members
    plus chairman) and uses api_keys dict instead of a single api_key field.

    In admin mode, we populate the api_keys dict with credentials for all models
    used in the request.

    Args:
        request: CommitteeRequest with models, chairman_model, and api_keys fields

    Returns:
        The same request object, with api_keys populated if in admin mode

    Raises:
        HTTPException: If admin mode is enabled but a requested model
            is not configured or the API key env var is not set.
    """
    config = get_admin_config()

    if not config.admin_mode:
        return request

    # Collect all models that need credentials
    all_models = list(request.models) + [request.chairman_model]

    # Build api_keys dict from admin config
    admin_api_keys: dict[str, str] = {}
    for model_id in all_models:
        api_key, base_url = config.resolve_credentials(model_id)

        if api_key is None:
            raise HTTPException(
                status_code=400,
                detail=f"Model '{model_id}' not available in admin mode",
            )

        # Extract provider from model_id (e.g., "openai/gpt-4o" -> "openai")
        provider = extract_provider(model_id)
        admin_api_keys[provider] = api_key

        # If base_url is configured, set it on the request
        # (all models in a committee share the same base_url)
        if base_url and request.base_url is None:
            request.base_url = base_url

    # Replace the api_keys dict with admin-provided credentials
    request.api_keys = admin_api_keys

    return request


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
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

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
                    "data": (
                        f"GitHub Copilot authentication required. Please run "
                        f"'python -c \"import litellm; litellm.completion("
                        f'model=\\"github_copilot/gpt-4\\", messages=[{{'
                        f'{{\\"role\\": \\"user\\", \\"content\\": \\"test\\"}}}}])"\' '
                        f"in your terminal to authenticate. Original error: {error_msg}"
                    ),
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
                    "data": (
                        f"GitHub Copilot authentication required. Please check "
                        f"your terminal/server logs for the device code and URL "
                        f"to authenticate. Error: {error_msg}"
                    ),
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
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

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
        raise HTTPException(status_code=500, detail=str(e)) from e


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
    command_type: str = "search"  # "search", "research", or "factcheck"
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class RefinedQueryOutput(BaseModel):
    """Structured output for refined query - used with LLM structured generation."""

    refined_query: str = Field(
        ...,
        description=(
            "The refined, context-aware query or instructions. "
            "Resolve all pronouns and vague references using the provided context. "
            "Make it specific, actionable, and include key technical terms. "
            "For search queries: keep concise (under 15 words). "
            "For research: 1-2 complete sentences with clear scope. "
            "For factcheck: a clear declarative statement."
        ),
    )


@app.post("/api/refine-query")
async def refine_query(request: RefineQueryRequest):
    """
    Use an LLM to refine a user query using surrounding context.

    This resolves pronouns and vague references like "how does this work?"
    into specific queries based on the surrounding context.
    Works for search queries, research instructions, and factcheck claims.
    """
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

    logger.info(
        f"Refine query: user_query='{request.user_query}', "
        f"command_type={request.command_type}, "
        f"context_length={len(request.context)}"
    )

    # Different prompts for search vs research vs factcheck
    if request.command_type == "factcheck":
        system_prompt = """You are a fact-checking assistant. Given a user's query and context, extract or clarify the factual claim(s) to be verified.

Rules:
- Resolve any pronouns or vague references (like "this", "it", "that") using the context
- Make the claim specific and verifiable
- Include key facts, names, numbers, or dates from the context
- Keep it as a clear declarative statement
- If the context is a list of claims (numbered or bulleted), return the full list of claims as a single string, one per line

Examples:
- User: "is this true?" Context: "The Eiffel Tower was built in 1889..." → "The Eiffel Tower was built in 1889"
- User: "verify this claim" Context: "Python is the most popular programming language..." → "Python is the most popular programming language"
- User: "fact check" Context: "Einstein failed math as a student..." → "Albert Einstein failed math as a student"
- User: "verify these" Context: "1. Claim one\n2. Claim two" → "Claim one\nClaim two" """  # noqa: E501
    elif request.command_type == "research":
        system_prompt = """You are a research instructions optimizer. Given a user's research request and the context it refers to, generate clear, specific research instructions.

Rules:
- Resolve any pronouns or vague references (like "this", "it", "that") using the context
- Make the instructions specific and actionable
- Include key technical terms from the context
- Keep it concise but complete (1-2 sentences)

Examples:
- User: "research more about this" Context: "Toffoli Gate (CCNOT)..." → "Research the Toffoli gate (CCNOT) in quantum computing, including its applications, implementation, and relationship to reversible computing"
- User: "find alternatives" Context: "gradient descent optimization..." → "Research alternative optimization algorithms to gradient descent, comparing their convergence properties and use cases"
- User: "explain how this works" Context: "transformer attention mechanism..." → "Research how the transformer attention mechanism works, including self-attention, multi-head attention, and their computational complexity" """  # noqa: E501
    else:
        system_prompt = """You are a search query optimizer. Given a user's question and the context it refers to, generate an effective web search query.

Rules:
- Resolve any pronouns or vague references (like "this", "it", "that") using the context
- Make the query specific and searchable
- Include key technical terms from the context
- Keep it concise (under 15 words typically)

Examples:
- User: "how does this work?" Context: "Toffoli Gate (CCNOT)..." → "how Toffoli gate CCNOT quantum computing works"
- User: "explain this better" Context: "gradient descent optimization..." → "gradient descent optimization algorithm explained"
- User: "what are alternatives?" Context: "React framework..." → "React framework alternatives comparison" """  # noqa: E501

    try:
        # Check if model supports structured outputs
        # LiteLLM's supports_response_schema checks if model supports
        # response_format
        supports_structured = litellm.supports_response_schema(
            model=request.model, custom_llm_provider=None
        )

        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"User query: {request.user_query}\n\n"
                        f"Context:\n{request.context[:2000]}"
                    ),
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

        # Use structured generation if supported
        if supports_structured:
            logger.info(f"Using structured generation for model {request.model}")
            try:
                kwargs["response_format"] = RefinedQueryOutput
                response = await litellm.acompletion(**kwargs)

                # With structured generation, response is already parsed
                if hasattr(response, "choices") and response.choices:
                    # LiteLLM returns structured object directly in message content
                    content = response.choices[0].message.content
                    if isinstance(content, str):
                        # Parse JSON if returned as string
                        import json

                        parsed = json.loads(content)
                        refined_query = parsed.get("refined_query", "").strip()
                    elif hasattr(content, "refined_query"):
                        # Direct object access
                        refined_query = content.refined_query.strip()
                    else:
                        # Fallback: treat as dict
                        refined_query = content.get("refined_query", "").strip()
                else:
                    logger.warning("Unexpected structured response format")
                    refined_query = request.user_query
            except Exception as structured_error:
                # If structured generation fails, fall back to regular completion
                logger.warning(
                    f"Structured generation failed for {request.model}: "
                    f"{structured_error}. Falling back to regular completion."
                )
                # Remove response_format and retry with regular completion
                kwargs.pop("response_format", None)
                response = await litellm.acompletion(**kwargs)
                refined_query = response.choices[0].message.content.strip()

                # Remove quotes if the LLM wrapped the query in them
                if refined_query.startswith('"') and refined_query.endswith('"'):
                    refined_query = refined_query[1:-1]
        else:
            logger.info(
                f"Model {request.model} doesn't support structured generation, "
                "using regular completion"
            )
            response = await litellm.acompletion(**kwargs)
            refined_query = response.choices[0].message.content.strip()

            # Remove quotes if the LLM wrapped the query in them
            if refined_query.startswith('"') and refined_query.endswith('"'):
                refined_query = refined_query[1:-1]

        # If LLM returned empty, fall back to original query
        if not refined_query:
            logger.warning("LLM returned empty refined query, using original")
            refined_query = request.user_query

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
        f"Exa search request: query='{request.query}', "
        f"num_results={request.num_results}"
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
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/ddg/search")
async def ddg_search(request: DDGSearchRequest):
    """
    Search the web using DuckDuckGo.

    This is a free fallback for users who don't have an Exa API key.
    Returns search results in the same format as Exa search.
    """
    logger.info(
        f"DDG search request: query='{request.query}', "
        f"max_results={request.max_results}"
    )

    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            results = list(ddgs.text(request.query, max_results=request.max_results))

        formatted_results = []
        for result in results:
            formatted_results.append(
                DDGSearchResult(
                    title=result.get("title", "Untitled"),
                    url=result.get("href", ""),
                    snippet=result.get("body", ""),
                )
            )

        logger.info(f"DDG returned {len(formatted_results)} results")
        return {
            "query": request.query,
            "results": formatted_results,
            "num_results": len(formatted_results),
            "provider": "duckduckgo",
        }

    except Exception as e:
        logger.error(f"DDG search failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- DDG Deep Research (fallback) prompt templates ---

DDG_RESEARCH_QUERY_GEN_SYSTEM_PROMPT = """You are a web research assistant.
Your job is to turn a user's research instructions (and optional context) into
effective DuckDuckGo search queries.

Output rules (strict):
- Output ONLY valid JSON.
- Output must be a JSON array of strings.
- 3 to 6 queries.
- Each query should be concise (<= 12 words) and specific.
- Avoid quotes around the entire query.
- Avoid duplicate or near-duplicate queries.
"""

DDG_RESEARCH_PAGE_SUMMARY_SYSTEM_PROMPT = """You are a research assistant.
Given a user's research instructions and the content of a web page, write a
tailored summary that directly helps answer the instructions.

Write in markdown. Rules:
- Start with 1-2 sentences of the most relevant takeaway.
- Then add 3-6 bullet points of supporting details (only from the page).
- If the page is irrelevant, say so briefly and suggest what would be relevant.
- Do NOT invent facts not present in the page.
"""

DDG_RESEARCH_ADJACENT_QUERY_SYSTEM_PROMPT = """You are a research assistant.
Given the user's research instructions and what we've learned so far, propose
new DuckDuckGo search queries to explore intellectually adjacent ideas (related
mechanisms, alternatives, critiques, edge cases, or applications).

Output rules (strict):
- Output ONLY valid JSON.
- Output must be a JSON array of strings.
- 2 to 5 queries.
- Each query should be concise (<= 12 words) and specific.
- Avoid duplicate or near-duplicate queries.
"""

DDG_RESEARCH_SYNTHESIS_SYSTEM_PROMPT = """You are a research report writer.
You will be given a user's research instructions and a list of sources with
short summaries.
Write a coherent report that answers the instructions using ONLY the provided sources.

Write in markdown. Rules:
- Provide a clear structure with headings.
- Prefer precise, falsifiable statements over vague generalities.
- When making a claim that comes from a source, cite it inline as a markdown
  link: [Source Name](url)
- CRITICAL: URLs in markdown links must be formatted exactly as:
  [text](https://example.com/path)
  - The URL must be complete and valid
  - Do NOT add any characters after the URL inside the parentheses
  - Do NOT add brackets, punctuation, or special characters after the URL
  - The closing parenthesis ) must immediately follow the last character of the URL
- Example CORRECT: [The Guardian](https://example.com/article)
- Example WRONG: [The Guardian](https://example.com/article【)
- Example WRONG: [The Guardian](https://example.com/article)【
- If evidence is thin or conflicting, say so explicitly.
"""


def _extract_json_array(text: str) -> list[str]:
    """Parse a JSON array of strings from LLM output.

    Includes a small best-effort fallback that extracts the first `[...]` region
    if the model wraps the JSON in extra text.
    """
    text = (text or "").strip()
    if not text:
        return []

    # Strict parse
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except Exception:
        pass

    # Best-effort: find first [...] region
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            if isinstance(data, list):
                return [str(x).strip() for x in data if str(x).strip()]
        except Exception:
            return []

    return []


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        s = item.strip()
        if not s:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


async def _llm_text(
    *,
    model: str,
    api_key: str | None,
    base_url: str | None,
    messages: list[dict],
    temperature: float = 0.3,
    max_tokens: int | None = None,
) -> str:
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url

    add_copilot_headers(kwargs, model)
    response = await litellm.acompletion(**kwargs)
    return (response.choices[0].message.content or "").strip()


async def _llm_json_array(
    *,
    model: str,
    api_key: str | None,
    base_url: str | None,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 250,
) -> list[str]:
    text = await _llm_text(
        model=model,
        api_key=api_key,
        base_url=base_url,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return _dedupe_preserve_order(_extract_json_array(text))


@app.post("/api/ddg/research")
async def ddg_research(request: DDGResearchRequest):
    """
    Perform pseudo deep research using DuckDuckGo + free URL fetching + the user's LLM.

    This endpoint is a fallback for `/research` when no Exa API key is configured.
    It streams progress and results via SSE, similar to Exa research.
    """
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

    max_iterations = max(1, min(request.max_iterations, 8))
    max_sources = max(5, min(request.max_sources, 80))
    max_queries_per_iteration = max(1, min(request.max_queries_per_iteration, 8))
    max_results_per_query = max(1, min(request.max_results_per_query, 25))

    logger.info(
        "DDG research request: "
        f"instructions='{request.instructions[:100]}...', "
        f"model={request.model}, "
        f"max_iterations={max_iterations}, "
        f"max_sources={max_sources}"
    )

    async def generate():
        try:
            from ddgs import DDGS

            instructions = request.instructions.strip()
            context = (request.context or "").strip()

            if not instructions:
                yield {"event": "error", "data": "Empty research instructions"}
                return

            yield {"event": "status", "data": "Generating initial search queries..."}

            seed_user_prompt = (
                f"Research instructions:\n{instructions}\n\n"
                + (f"Context:\n{context[:2000]}\n\n" if context else "")
                + "Return JSON array of DDG search queries."
            )
            next_queries = await _llm_json_array(
                model=request.model,
                api_key=request.api_key,
                base_url=request.base_url,
                system_prompt=DDG_RESEARCH_QUERY_GEN_SYSTEM_PROMPT,
                user_prompt=seed_user_prompt,
            )

            if not next_queries:
                # fallback: use raw instructions as a query
                next_queries = [instructions[:120]]

            seen_queries: set[str] = set()
            seen_urls: set[str] = set()
            sources: list[DDGResearchSource] = []
            min_iterations = min(3, max_iterations)  # Ensure at least 2-3 rounds

            async with httpx.AsyncClient(timeout=30.0) as client:
                for iteration in range(1, max_iterations + 1):
                    iteration_queries = [
                        q
                        for q in next_queries
                        if q.strip() and q.strip().lower() not in seen_queries
                    ][:max_queries_per_iteration]

                    if not iteration_queries:
                        yield {
                            "event": "status",
                            "data": "No new queries to search; stopping early.",
                        }
                        break

                    for q in iteration_queries:
                        seen_queries.add(q.strip().lower())

                    yield {
                        "event": "status",
                        "data": (
                            f"Iteration {iteration}/{max_iterations}: "
                            "searching DuckDuckGo..."
                        ),
                    }

                    # Collect search results (preserve first associated query per URL)
                    url_to_result: dict[str, dict] = {}

                    async def search_with_retry(
                        ddgs, query: str, max_retries: int = 3
                    ) -> list[dict]:
                        """Search DDG with retry logic and exponential backoff."""
                        for attempt in range(max_retries):
                            try:
                                results = list(
                                    ddgs.text(query, max_results=max_results_per_query)
                                )
                                # If we got results, return them
                                if results:
                                    return results
                                # Empty results might indicate rate limiting
                                if attempt < max_retries - 1:
                                    wait_time = 2.0 * (2**attempt)  # 2s, 4s, 8s
                                    logger.warning(
                                        f"DDG query returned empty results: {query} "
                                        f"(attempt {attempt + 1}/{max_retries}, "
                                        f"waiting {wait_time}s)"
                                    )
                                    await asyncio.sleep(wait_time)
                            except Exception as e:
                                if attempt < max_retries - 1:
                                    wait_time = 2.0 * (2**attempt)
                                    logger.warning(
                                        f"DDG query failed: {query} ({e}) "
                                        f"(attempt {attempt + 1}/{max_retries}, "
                                        f"waiting {wait_time}s)"
                                    )
                                    await asyncio.sleep(wait_time)
                                else:
                                    logger.error(
                                        f"DDG query failed after retries: {query} ({e})"
                                    )
                        return []

                    with DDGS() as ddgs:
                        for q in iteration_queries:
                            results = await search_with_retry(ddgs, q)

                            # Validate results are relevant to the query
                            query_lower = q.lower()
                            query_words = set(query_lower.split())
                            relevant_results = []
                            for r in results:
                                url = (r.get("href") or "").strip()
                                if not url:
                                    continue
                                if url in url_to_result or url in seen_urls:
                                    continue

                                title = (r.get("title") or "").lower()
                                snippet = (r.get("body") or "").lower()
                                combined_text = f"{title} {snippet}"

                                # Check if result contains query keywords
                                # Require at least 2 query words to match
                                # (or 1 if query is short)
                                min_matches = 2 if len(query_words) > 2 else 1
                                matches = sum(
                                    1 for word in query_words if word in combined_text
                                )

                                if matches >= min_matches:
                                    relevant_results.append(r)
                                else:
                                    logger.debug(
                                        f"Skipping irrelevant result for '{q}': "
                                        f"{r.get('title', 'Untitled')}"
                                    )

                            for r in relevant_results:
                                url = (r.get("href") or "").strip()
                                url_to_result[url] = {
                                    "query": q,
                                    "title": (r.get("title") or "Untitled").strip(),
                                    "snippet": (r.get("body") or "").strip(),
                                    "url": url,
                                }

                            # Longer delay to reduce rate-limit risk
                            await asyncio.sleep(1.0)

                    if not url_to_result:
                        yield {
                            "event": "status",
                            "data": (
                                f"Iteration {iteration}: no relevant results found. "
                                "This may indicate rate limiting or poor query quality."
                            ),
                        }
                        # If we have no sources at all and this is iteration 1,
                        # fail early
                        if iteration == 1 and len(sources) == 0:
                            yield {
                                "event": "error",
                                "data": (
                                    "No relevant search results found. "
                                    "This may be due to DuckDuckGo rate limiting. "
                                    "Please try again in a few minutes, "
                                    "or add an Exa API key for more reliable research."
                                ),
                            }
                            return
                        # Try to generate adjacent queries anyway
                        learned_blob = "\n".join(
                            [f"- {s.title}: {s.summary[:200]}" for s in sources[-10:]]
                        )
                        next_queries = await _llm_json_array(
                            model=request.model,
                            api_key=request.api_key,
                            base_url=request.base_url,
                            system_prompt=DDG_RESEARCH_ADJACENT_QUERY_SYSTEM_PROMPT,
                            user_prompt=(
                                f"Research instructions:\n{instructions}\n\n"
                                f"What we learned so far:\n{learned_blob}\n\n"
                                f"Previous queries:\n"
                                f"{', '.join(sorted(seen_queries))}\n\n"
                                "Return JSON array of new DDG queries."
                            ),
                        )
                        continue

                    num_to_process = min(len(url_to_result), max_sources - len(sources))
                    yield {
                        "event": "status",
                        "data": (
                            f"Iteration {iteration}: "
                            f"fetching {num_to_process} pages in parallel..."
                        ),
                    }

                    # Mark all URLs as seen upfront
                    for url in url_to_result:
                        seen_urls.add(url)

                    # Process URLs in parallel with concurrency limit
                    sem = asyncio.Semaphore(6)

                    async def process_one(
                        r: dict,
                        iter_num: int = iteration,
                        semaphore: asyncio.Semaphore = sem,
                    ) -> DDGResearchSource | None:
                        url = r["url"]
                        query = r["query"]
                        snippet = r["snippet"]

                        async with semaphore:
                            try:
                                try:
                                    title, content_md = await fetch_url_via_jina(
                                        url, client
                                    )
                                except Exception:
                                    title, content_md = await fetch_url_directly(
                                        url, client
                                    )

                                content_md = (content_md or "").strip()
                                if not content_md:
                                    return None

                                content_for_llm = content_md[:12000]

                                user_prompt = (
                                    f"Research instructions:\n{instructions}\n\n"
                                    + (
                                        f"Context:\n{context[:2000]}\n\n"
                                        if context
                                        else ""
                                    )
                                    + f"Search query that found this page: {query}\n\n"
                                    f"Page title: {title}\n"
                                    f"URL: {url}\n"
                                    + (f"Snippet: {snippet}\n\n" if snippet else "\n")
                                    + f"Page content (markdown):\n{content_for_llm}\n"
                                )

                                summary = await _llm_text(
                                    model=request.model,
                                    api_key=request.api_key,
                                    base_url=request.base_url,
                                    messages=[
                                        {
                                            "role": "system",
                                            "content": (
                                                DDG_RESEARCH_PAGE_SUMMARY_SYSTEM_PROMPT
                                            ),
                                        },
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    temperature=0.3,
                                    max_tokens=450,
                                )

                                # Prefer fetched title, but fall back to DDG title
                                # if fetched is "Untitled"
                                final_title = (
                                    title
                                    if title and title != "Untitled"
                                    else (r["title"] or "Untitled")
                                )

                                return DDGResearchSource(
                                    url=url,
                                    title=final_title,
                                    snippet=snippet or None,
                                    summary=summary,
                                    iteration=iter_num,
                                    query=query,
                                )

                            except Exception as e:
                                logger.warning(f"Failed to process URL: {url} ({e})")
                                return None

                    # Limit to how many we can still add
                    items_to_process = list(url_to_result.values())[:num_to_process]
                    tasks = [process_one(r) for r in items_to_process]
                    results = await asyncio.gather(*tasks)

                    # Collect successful sources and emit events
                    for src in results:
                        if src is not None:
                            sources.append(src)
                            yield {
                                "event": "source",
                                "data": json.dumps(src.model_dump()),
                            }

                    # Check if we should continue to next iteration
                    should_continue = (
                        iteration < min_iterations  # Always do at least min_iterations
                        or (iteration < max_iterations and len(sources) < max_sources)
                    )

                    if not should_continue:
                        if len(sources) >= max_sources:
                            yield {
                                "event": "status",
                                "data": (
                                    f"Reached max sources ({max_sources}) after "
                                    f"{iteration} iterations; synthesizing report..."
                                ),
                            }
                        break

                    # Generate new adjacent queries for next iteration
                    # Use more sources for context to ensure diverse queries
                    num_sources_for_context = min(15, len(sources))
                    learned_blob = "\n".join(
                        [
                            f"- {s.title} ({s.url}): {s.summary[:240]}"
                            for s in sources[-num_sources_for_context:]
                        ]
                    )

                    # Build a more detailed prompt to ensure diverse queries
                    query_prompt = (
                        f"Research instructions:\n{instructions}\n\n"
                        f"What we've learned so far ({len(sources)} sources):\n"
                        f"{learned_blob}\n\n"
                        f"Previous search queries we've already tried:\n"
                        f"{', '.join(sorted(list(seen_queries)[-20:]))}\n\n"
                        f"Generate NEW search queries that explore DIFFERENT aspects "
                        f"of the research topic. Focus on:\n"
                        f"- Specific subtopics we haven't covered yet\n"
                        f"- Alternative perspectives or approaches\n"
                        f"- Related but distinct concepts\n"
                        f"- Practical applications or examples\n\n"
                        f"Return a JSON array of 4-6 new, diverse search queries."
                    )

                    next_queries = await _llm_json_array(
                        model=request.model,
                        api_key=request.api_key,
                        base_url=request.base_url,
                        system_prompt=DDG_RESEARCH_ADJACENT_QUERY_SYSTEM_PROMPT,
                        user_prompt=query_prompt,
                    )

                    # If we didn't get enough new queries, generate fallback queries
                    if not next_queries or len(next_queries) < 2:
                        logger.warning(
                            f"Iteration {iteration}: "
                            "LLM didn't generate enough queries, "
                            "creating fallback queries"
                        )
                        # Create fallback queries based on instructions
                        fallback_terms = [
                            "recipe",
                            "ingredients",
                            "substitute",
                            "adaptation",
                            "variation",
                            "how to",
                            "tutorial",
                        ]
                        fallback_queries = []
                        for term in fallback_terms[:4]:
                            if term not in seen_queries:
                                fallback_queries.append(f"{instructions} {term}")
                        next_queries = (
                            fallback_queries[:4] if fallback_queries else [instructions]
                        )

            # Synthesize final report
            if len(sources) < 3:
                yield {
                    "event": "status",
                    "data": (
                        f"Warning: Only found {len(sources)} relevant sources. "
                        "This may indicate DuckDuckGo rate limiting. "
                        "Results may be incomplete."
                    ),
                }

            yield {"event": "status", "data": "Synthesizing final report..."}

            if not sources:
                yield {
                    "event": "error",
                    "data": (
                        "No relevant sources found. This is likely due to "
                        "DuckDuckGo rate limiting. Please try again in a few minutes, "
                        "or add an Exa API key for more reliable research."
                    ),
                }
                return

            sources_md = "\n".join(
                [f"- [{s.title}]({s.url}): {s.summary}" for s in sources]
            )
            synthesis_user_prompt = (
                f"Research instructions:\n{instructions}\n\n"
                + (f"Context:\n{context[:2000]}\n\n" if context else "")
                + f"Sources (title, url, summary):\n{sources_md}\n"
            )

            # Don't limit max_tokens - let the model generate comprehensive reports
            # Also handle potential truncation gracefully
            try:
                report = await _llm_text(
                    model=request.model,
                    api_key=request.api_key,
                    base_url=request.base_url,
                    messages=[
                        {
                            "role": "system",
                            "content": DDG_RESEARCH_SYNTHESIS_SYSTEM_PROMPT,
                        },
                        {"role": "user", "content": synthesis_user_prompt},
                    ],
                    temperature=0.3,
                    # No max_tokens - let model use its full context window
                )
            except Exception as e:
                logger.error(f"Report synthesis failed: {e}")
                # Return partial report with error note
                report = (
                    f"**Research Report**\n\n"
                    f"*Note: Report generation encountered an error. "
                    f"Below are the sources that were found:*\n\n"
                    f"## Sources Found\n\n"
                    f"{sources_md}\n\n"
                    f"*Error: {str(e)}*"
                )

            # Check if report seems truncated (ends abruptly without punctuation)
            report_stripped = report.rstrip()
            if (
                report
                and report_stripped
                and not report_stripped.endswith(
                    (".", "!", "?", ":", "\n", "---", "```")
                )
            ):
                # Report ends mid-sentence, likely truncated
                report += (
                    "\n\n*Note: Report may be incomplete "
                    "due to response length limits.*"
                )

            yield {"event": "content", "data": report}
            yield {
                "event": "sources",
                "data": json.dumps([{"title": s.title, "url": s.url} for s in sources]),
            }
            yield {"event": "done", "data": ""}

        except Exception as e:
            logger.error(f"DDG research failed: {e}")
            logger.error(traceback.format_exc())
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(generate())


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
        f"Exa research request: instructions='{request.instructions[:100]}...', "
        f"model={request.model}"
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
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- URL Fetch Endpoint ---


class FetchUrlRequest(BaseModel):
    """Request body for fetching URL content as markdown."""

    url: str


class FetchUrlResult(BaseModel):
    """Result from fetching URL content."""

    url: str
    title: str
    content: str  # Markdown content
    metadata: dict[
        str, Any
    ] = {}  # Plugin-specific metadata (e.g., video_id, files, page_count)


# --- PDF Upload/Fetch Models ---


class FetchPdfRequest(BaseModel):
    """Request body for fetching PDF content from URL."""

    url: str


class PdfResult(BaseModel):
    """Result from PDF text extraction."""

    filename: str
    content: str  # Markdown content with warning banner
    page_count: int


# PDF processing moved to plugins/pdf_handler.py
# Import constants for backwards compatibility


# Legacy function for backwards compatibility (fetch-pdf endpoint)
def extract_text_from_pdf(pdf_bytes: bytes) -> tuple[str, int]:
    """
    Extract text from PDF bytes using pymupdf (legacy function).

    This function is maintained for backwards compatibility with fetch-pdf endpoint.
    New code should use the PdfFileUploadHandler plugin instead.

    Returns:
        tuple: (extracted_text, page_count)
    """
    from canvas_chat.plugins.pdf_handler import PdfFileUploadHandler

    handler = PdfFileUploadHandler()
    # Use the handler's method
    return handler.extract_text_from_pdf(pdf_bytes)


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
    Fetch URL content directly (fallback when Jina fails).

    Returns (title, content) tuple.
    Content is returned as plain text (HTML not converted to markdown).
    """
    response = await client.get(url, follow_redirects=True)

    if response.status_code != 200:
        raise Exception(f"Direct fetch returned {response.status_code}")

    # Extract title from HTML if possible
    title = "Untitled"
    content = response.text

    # Try to extract title from HTML
    import re

    title_match = re.search(
        r"<title[^>]*>(.*?)</title>", content, re.IGNORECASE | re.DOTALL
    )
    if title_match:
        title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip()

    return title, content


@app.post("/api/fetch-url")
async def fetch_url(request: FetchUrlRequest):
    """
    Fetch the content of a URL and return it as markdown.

    Strategy:
    1. Check if URL is a git repository - if so, clone and extract files
    2. Try Jina Reader API (free, good markdown conversion)
    3. Fall back to direct fetch + html2text if Jina fails

    Design rationale (see docs/explanation/url-fetching.md):
    - This endpoint enables zero-config URL fetching for /note <url>
    - Separate from /api/exa/get-contents which uses Exa API (requires API key)
    - Jina Reader provides good markdown conversion for most public web pages
    - Direct fetch fallback ensures robustness when Jina is unavailable
    - Git repository support enables standalone content extraction from repos
    """
    logger.info(f"Fetch URL request: url='{request.url}'")

    try:
        # Check URL fetch registry first
        handler_config = UrlFetchRegistry.find_handler(request.url)
        if handler_config:
            try:
                handler = handler_config["handler"]()
                result = await handler.fetch_url(request.url)
                logger.info(f"Successfully fetched URL via handler: {result['title']}")
                return FetchUrlResult(
                    url=request.url,
                    title=result["title"],
                    content=result["content"],
                    video_id=result.get("video_id"),
                )
            except Exception as handler_error:
                logger.warning(
                    f"URL fetch handler failed, falling back to regular URL fetch: "
                    f"{handler_error}"
                )
                # Fall through to regular URL fetching

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
        raise HTTPException(status_code=504, detail="Request timed out") from None
    except Exception as e:
        logger.error(f"Fetch URL failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- File Upload Endpoints (Plugin-based) ---


@app.post("/api/upload-file")
async def upload_file(file: UploadFile = File(...)):  # noqa: B008
    """
    Upload a file and process it using registered file upload handlers.

    This is a generic endpoint that routes to plugin-based handlers.
    Handlers are registered via FileUploadRegistry.

    Returns:
        Dictionary with processed file data (structure depends on handler)
    """
    logger.info(
        f"File upload request: filename='{file.filename}', type='{file.content_type}'"
    )

    # Read file content
    try:
        file_bytes = await file.read()
    except Exception as e:
        logger.error(f"Failed to read uploaded file: {e}")
        raise HTTPException(
            status_code=400, detail="Failed to read uploaded file"
        ) from e

    # Find handler for this file type
    handler_config = FileUploadRegistry.find_handler(
        filename=file.filename, mime_type=file.content_type
    )
    if not handler_config:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type: {file.filename} "
                f"({file.content_type or 'unknown type'})"
            ),
        )

    # Create handler instance and process file
    try:
        handler_class = handler_config["handler"]
        handler = handler_class()
        result = await handler.process_file(file_bytes, file.filename or "unknown")
        logger.info(
            f"Successfully processed file: {file.filename} "
            f"(handler: {handler_config['id']})"
        )
        return result
    except ValueError as e:
        # Validation errors (e.g., file too large)
        logger.warning(f"File validation failed for {file.filename}: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Failed to process file {file.filename}: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Failed to process file: {str(e)}"
        ) from e


# --- PDF Upload/Fetch Endpoints (Legacy - for backwards compatibility) ---


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):  # noqa: B008
    """
    Upload a PDF file and extract its text content (legacy endpoint).

    This endpoint is maintained for backwards compatibility.
    New code should use /api/upload-file instead.

    The extracted text is returned as markdown with a warning banner
    about potential extraction errors.

    Limits:
    - Maximum file size: 25 MB
    - Only PDF files are accepted
    """
    logger.info(f"PDF upload request (legacy): filename='{file.filename}'")

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Read file content
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        logger.error(f"Failed to read uploaded file: {e}")
        raise HTTPException(
            status_code=400, detail="Failed to read uploaded file"
        ) from e

    # Find PDF handler
    handler_config = FileUploadRegistry.find_handler(
        filename=file.filename, mime_type="application/pdf"
    )
    if not handler_config:
        raise HTTPException(status_code=400, detail="PDF handler not available")

    # Process using handler
    try:
        handler_class = handler_config["handler"]
        handler = handler_class()
        result = await handler.process_file(pdf_bytes, file.filename or "unknown.pdf")
        # Convert to legacy format
        return PdfResult(
            filename=file.filename or "unknown.pdf",
            content=result["content"],
            page_count=result.get("page_count", 0),
        )
    except ValueError as e:
        logger.warning(f"PDF validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Failed to extract text from PDF: {str(e)}"
        ) from e


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
                    max_size_mb = MAX_PDF_SIZE // (1024 * 1024)
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDF file is too large. Maximum size is {max_size_mb} MB",  # noqa: E501
                    )

                # Read the PDF content
                pdf_bytes = b""
                async for chunk in response.aiter_bytes():
                    pdf_bytes += chunk
                    if len(pdf_bytes) > MAX_PDF_SIZE:
                        max_size_mb = MAX_PDF_SIZE // (1024 * 1024)
                        raise HTTPException(
                            status_code=413,
                            detail=(
                                f"PDF file is too large. "
                                f"Maximum size is {max_size_mb} MB"
                            ),
                        )

        # Process using PDF handler
        handler_config = FileUploadRegistry.find_handler(
            filename=filename, mime_type="application/pdf"
        )
        if not handler_config:
            raise HTTPException(status_code=400, detail="PDF handler not available")

        try:
            handler_class = handler_config["handler"]
            handler = handler_class()
            result = await handler.process_file(pdf_bytes, filename)
            # Convert to legacy format
            return PdfResult(
                filename=filename,
                content=result["content"],
                page_count=result.get("page_count", 0),
            )
        except ValueError as e:
            logger.warning(f"PDF validation failed: {e}")
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.error(f"Failed to extract text from PDF: {e}")
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500, detail=f"Failed to extract text from PDF: {str(e)}"
            ) from e

    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.error(f"Timeout fetching PDF: {request.url}")
        raise HTTPException(status_code=504, detail="Request timed out") from None
    except Exception as e:
        logger.error(f"Failed to fetch PDF: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- Matrix Endpoints ---


class MatrixFillRequest(BaseModel):
    """Request body for filling a matrix cell."""

    row_item: str
    col_item: str
    context: str  # User-provided matrix context
    messages: list[Message]  # DAG history for additional context
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class GenerateTitleRequest(BaseModel):
    """Request body for generating a session title."""

    content: str  # Summary of conversation content
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class GenerateSummaryRequest(BaseModel):
    """Request body for generating a node summary for semantic zoom."""

    content: str  # Node content to summarize
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


class ParseTwoListsRequest(BaseModel):
    """Request body for parsing two lists from context nodes."""

    contents: list[str]  # Content from all selected context nodes
    context: str  # User-provided matrix context to help identify the two lists
    model: str = "openai/gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None


@app.post("/api/parse-two-lists")
async def parse_two_lists(request: ParseTwoListsRequest):
    """
    Use LLM to extract two separate lists from context node contents.

    Returns two lists: one for rows, one for columns (max 10 each).
    """
    # Inject admin credentials if in admin mode
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
- For example: "GitHub Copilot: $10/month..." → "GitHub Copilot" (not the full text)
- Look for two naturally separate categories (e.g., products vs attributes, services vs features)  # noqa: E501
- If the text uses "vs" or "versus", split on that: items before "vs" go to rows, items after go to columns  # noqa: E501
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
        raise HTTPException(status_code=500, detail="Failed to parse lists") from e
    except Exception as e:
        logger.error(f"Parse two lists failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/matrix/fill")
async def matrix_fill(request: MatrixFillRequest):
    """
    Fill a single matrix cell by evaluating row item against column item.

    Returns SSE stream with the evaluation content.
    """
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

    logger.info(
        f"Matrix fill request: row_item={request.row_item[:50]}..., "
        f"col_item={request.col_item[:50]}..."
    )

    provider = extract_provider(request.model)

    async def generate():
        try:
            system_prompt = (
                f"""You fill matrix cells with BRIEF evaluations. """
                f"""Context: {request.context}

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
            )

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
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

    logger.info(f"Generate title request: content length={len(request.content)}")

    provider = extract_provider(request.model)

    system_prompt = (
        """Generate a short, descriptive title for a conversation/session """
        """based on the content provided.

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
    )

    try:
        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"Generate a title for this conversation:\n\n{request.content}"
                    ),
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
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/generate-summary")
async def generate_summary(request: GenerateSummaryRequest):
    """
    Generate a short summary of node content for semantic zoom.

    Returns a concise 5-10 word summary suitable for display when zoomed out.
    """
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

    logger.info(f"Generate summary request: content length={len(request.content)}")

    provider = extract_provider(request.model)

    system_prompt = (
        """Generate a very short summary (5-10 words) """
        """for the following content.

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
    )

    try:
        kwargs = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Summarize this content:\n\n{request.content[:2000]}",  # noqa: E501
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
        content = response.choices[0].message.content

        # Handle None or empty content from LLM
        if not content:
            logger.warning("LLM returned empty content for summary, using fallback")
            # Return fallback instead of raising error
            fallback = " ".join(request.content[:100].split()[:8])
            return {"summary": fallback + "..." if len(fallback) >= 50 else fallback}

        summary = content.strip()

        # Clean up any quotes or extra formatting
        summary = summary.strip("\"'")

        # Final check for empty summary after cleanup
        if not summary:
            logger.warning("Summary is empty after cleanup, using fallback")
            # Return fallback instead of raising error
            fallback = " ".join(request.content[:100].split()[:8])
            return {"summary": fallback + "..." if len(fallback) >= 50 else fallback}

        logger.info(f"Generated summary: {summary}")
        return {"summary": summary}

    except litellm.APIConnectionError as e:
        # Handle Gemini MAX_TOKENS bug in LiteLLM
        error_str = str(e).lower()
        if "max_tokens" in error_str or "finishreason" in error_str:
            logger.warning(
                f"Gemini MAX_TOKENS parsing error (LiteLLM bug): {e}. "
                "Using fallback summary."
            )
            # Return a fallback: use first few words of content
            fallback = " ".join(request.content[:100].split()[:8])
            return {"summary": fallback + "..." if len(fallback) >= 50 else fallback}
        # Re-raise other APIConnectionErrors
        raise

    except Exception as e:
        logger.error(f"Generate summary failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- Code Generation Endpoint ---


@app.post("/api/generate-code")
async def generate_code(request: GenerateCodeRequest, http_request: Request):
    """
    Generate Python code based on natural language prompt with DataFrame
    and conversation context.

    Returns SSE stream of code tokens.
    """
    # Inject admin credentials if in admin mode
    inject_admin_credentials(request)

    logger.info(f"Code generation request: {request.prompt[:50]}...")

    try:
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
            system_parts.append("\nAVAILABLE DATAFRAMES (USE EXACT COLUMN NAMES BELOW)")
            system_parts.append("\n" + "=" * 60)
            for df_info in request.dataframe_info:
                var_name = df_info.get("varName", "df")
                shape = df_info.get("shape", [0, 0])
                columns = df_info.get("columns", [])
                dtypes = df_info.get("dtypes", {})
                head = df_info.get("head", "")

                system_parts.append(f"\n\nVariable: {var_name}")
                system_parts.append(f"\nShape: {shape[0]} rows × {shape[1]} columns")

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
        # Note: We add this to system prompt to keep it separate from the
        # code generation flow. This helps the model understand the broader
        # context without confusing it with code-specific instructions.
        if request.context:
            system_parts.append("\n\nRelevant context from previous nodes:")
            for msg in (
                request.context
            ):  # Include all context messages (don't truncate PDF content)
                role = msg.role
                content = msg.content
                system_parts.append(f"\n[{role}]: {content}")

        # Add existing code context if modifying
        if request.existing_code:
            system_parts.append(
                f"\n\nCurrent code to modify:\n```python\n{request.existing_code}\n```"
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

        add_copilot_headers(kwargs, request.model)

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


# --- Committee Endpoint ---


def get_api_key_for_model(model: str, api_keys: dict[str, str]) -> str | None:
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
    api_key: str | None,
    base_url: str | None,
    queue: asyncio.Queue,
):
    """Stream a single committee member's opinion to the queue."""
    try:
        # Send start event
        await queue.put(
            {"event": "opinion_start", "data": {"index": index, "model": model}}
        )

        system_prompt = (
            """You are a committee member providing your independent opinion. """
            """Analyze the question thoughtfully and provide your perspective. """
            """Be specific and substantive in your response."""
        )

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
    api_key: str | None,
    base_url: str | None,
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

        system_prompt = (
            """You are reviewing and ranking other committee members' opinions. """
            """For each opinion, briefly comment on its strengths and weaknesses. """
            """Then rank them from best to worst with a brief justification. """
            """Be constructive and specific in your critique."""
        )

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
    # Inject admin credentials if in admin mode
    inject_admin_credentials_committee(request)

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

                except TimeoutError:
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

                    except TimeoutError:
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

            synthesis_prompt = (
                f"""You are the chairman synthesizing """
                f"""the committee's responses.

Question: {request.question}

**Committee Opinions:**

{opinions_text}
{reviews_text}

Please synthesize these perspectives into a comprehensive, balanced answer.
Highlight areas of agreement and note any significant disagreements.
Provide your own assessment of the most accurate and helpful response."""
            )

            chairman_api_key = get_api_key_for_model(
                request.chairman_model, request.api_keys
            )

            kwargs = {
                "model": request.chairman_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a chairman synthesizing committee opinions "
                            "into a final, comprehensive answer."
                        ),
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


# --- WebRTC Signaling Server ---
# Compatible with y-webrtc signaling protocol
# Stateless, room-based peer discovery for local-first multiplayer


class SignalingConnectionManager:
    """
    Manages WebSocket connections for WebRTC signaling.

    This is a stateless, in-memory implementation that:
    - Groups connections by topic (room ID)
    - Relays messages between peers in the same topic
    - Automatically cleans up when connections close
    - Compatible with y-webrtc's signaling protocol
    """

    def __init__(self):
        # topic -> set of websockets
        self.topics: dict[str, set[WebSocket]] = {}
        # websocket -> set of subscribed topics
        self.subscriptions: dict[WebSocket, set[str]] = {}

    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.subscriptions[websocket] = set()
        logger.info(f"Signaling: New connection, total={len(self.subscriptions)}")

    def disconnect(self, websocket: WebSocket):
        """Clean up when a connection closes."""
        # Remove from all subscribed topics
        topics_to_check = self.subscriptions.get(websocket, set()).copy()
        for topic in topics_to_check:
            if topic in self.topics:
                self.topics[topic].discard(websocket)
                if not self.topics[topic]:
                    del self.topics[topic]
                    logger.debug(f"Signaling: Topic '{topic}' removed (empty)")

        # Remove subscription record
        self.subscriptions.pop(websocket, None)
        logger.info(f"Signaling: Connection closed, total={len(self.subscriptions)}")

    def subscribe(self, websocket: WebSocket, topics: list[str]):
        """Subscribe a connection to topics."""
        for topic in topics:
            if topic not in self.topics:
                self.topics[topic] = set()
            self.topics[topic].add(websocket)
            self.subscriptions[websocket].add(topic)
            peer_count = len(self.topics[topic])
            logger.debug(f"Signaling: Subscribed to '{topic}', peers={peer_count}")

    def unsubscribe(self, websocket: WebSocket, topics: list[str]):
        """Unsubscribe a connection from topics."""
        for topic in topics:
            if topic in self.topics:
                self.topics[topic].discard(websocket)
                if not self.topics[topic]:
                    del self.topics[topic]
            if websocket in self.subscriptions:
                self.subscriptions[websocket].discard(topic)

    async def broadcast(self, topic: str, message: dict, exclude: WebSocket):
        """Broadcast a message to all peers in a topic except the sender."""
        if topic not in self.topics:
            return

        peers = self.topics[topic]
        message["clients"] = len(peers)

        disconnected = []
        for peer in peers:
            if peer == exclude:
                continue
            try:
                await peer.send_json(message)
            except Exception:
                disconnected.append(peer)

        # Clean up disconnected peers
        for peer in disconnected:
            self.disconnect(peer)

    def get_peer_count(self, topic: str) -> int:
        """Get number of peers in a topic."""
        return len(self.topics.get(topic, set()))


# Singleton connection manager
signaling_manager = SignalingConnectionManager()


@app.websocket("/signal")
async def signaling_endpoint(websocket: WebSocket):
    """
    WebRTC signaling endpoint compatible with y-webrtc.

    Protocol:
    - subscribe: {"type": "subscribe", "topics": ["room-id"]}
    - unsubscribe: {"type": "unsubscribe", "topics": ["room-id"]}
    - publish: {"type": "publish", "topic": "room-id", ...}
    - ping: {"type": "ping"} -> responds with {"type": "pong"}

    The server relays publish messages to all other peers in the same topic.
    No message content is stored - purely ephemeral relay.
    """
    await signaling_manager.connect(websocket)

    try:
        while True:
            try:
                data = await websocket.receive_json()
            except Exception:
                # Connection closed or invalid JSON
                break

            msg_type = data.get("type")

            if msg_type == "subscribe":
                topics = data.get("topics", [])
                if isinstance(topics, list):
                    signaling_manager.subscribe(websocket, topics)

            elif msg_type == "unsubscribe":
                topics = data.get("topics", [])
                if isinstance(topics, list):
                    signaling_manager.unsubscribe(websocket, topics)

            elif msg_type == "publish":
                topic = data.get("topic")
                if topic:
                    await signaling_manager.broadcast(topic, data, exclude=websocket)

            elif msg_type == "ping":
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    finally:
        signaling_manager.disconnect(websocket)


@app.get("/api/signaling/status")
async def signaling_status():
    """
    Get current signaling server status.

    Returns topic counts for monitoring. No sensitive data exposed.
    """
    return {
        "status": "ok",
        "connections": len(signaling_manager.subscriptions),
        "topics": len(signaling_manager.topics),
        "topic_sizes": {
            topic: len(peers) for topic, peers in signaling_manager.topics.items()
        },
    }
