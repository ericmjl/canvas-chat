"""Configuration module for canvas-chat.

This module provides configuration management for:
1. Model definitions (pre-populate model picker in UI)
2. Custom plugins (node types)
3. Admin mode (server-side API key management)

Two modes:
- Normal mode: Config defines models + plugins, users provide their own API keys via UI
- Admin mode: Config + server-side API keys, users cannot configure keys (enterprise)

Key design principles:
- Config is optional (can run without config.yaml)
- Plugins work with or without admin mode
- API keys are NEVER sent to the frontend in admin mode
- Environment variables are used for secrets in admin mode
- Validation happens at startup to fail fast with clear errors
"""

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

from ruamel.yaml import YAML

logger = logging.getLogger(__name__)


@dataclass
class ModelConfig:
    """Configuration for a single model.

    In normal mode: Just defines what models are available (users add their own keys)
    In admin mode: Also specifies which env var contains the API key
    """

    id: str  # LiteLLM-compatible model ID (provider/model-name)
    name: str  # Display name shown in UI
    api_key_env_var: str | None = None  # Environment variable name (admin mode only)
    context_window: int = 128000  # Token limit for context building
    endpoint_env_var: str | None = None  # Optional env var for custom endpoint

    @classmethod
    def from_dict(
        cls, data: dict, index: int, admin_mode: bool = False
    ) -> "ModelConfig":
        """Create ModelConfig from YAML dict with validation.

        Args:
            data: YAML dictionary
            index: Index in models list (for error messages)
            admin_mode: Whether running in admin mode (requires apiKeyEnvVar)
        """
        # Validate required fields
        if "id" not in data:
            raise ValueError(f"Model at index {index} missing 'id' field")

        model_id = data["id"]

        # In admin mode, apiKeyEnvVar is required
        if admin_mode and "apiKeyEnvVar" not in data:
            raise ValueError(
                f"Model {model_id} missing 'apiKeyEnvVar' field "
                f"(required in admin mode)"
            )

        return cls(
            id=model_id,
            name=data.get("name", model_id),
            api_key_env_var=data.get("apiKeyEnvVar"),
            context_window=data.get("contextWindow", 128000),
            endpoint_env_var=data.get("endpointEnvVar"),
        )


@dataclass
class PluginConfig:
    """Configuration for a plugin (JavaScript, Python, or both).

    Supports three formats:
    1. JavaScript-only: js_path set, py_path None
    2. Python-only: py_path set, js_path None
    3. Paired: Both js_path and py_path set (same plugin_id)
    """

    js_path: Path | None = None
    py_path: Path | None = None
    id: str | None = None  # Explicit plugin ID (for pairing JS and PY)

    @property
    def plugin_id(self) -> str:
        """Get plugin identifier (for pairing JS and PY).

        Uses explicit id if provided, otherwise derives from filename.
        """
        if self.id:
            return self.id
        # Derive from JS or PY filename
        if self.js_path:
            return self.js_path.stem
        if self.py_path:
            return self.py_path.stem
        raise ValueError("Plugin must have at least js_path or py_path")

    @classmethod
    def from_dict(cls, data: dict | str, config_dir: Path) -> "PluginConfig | None":
        """Create PluginConfig from YAML entry.

        Supports:
        - String: "./plugins/my-plugin.js" (JS-only, backwards compatible)
        - Dict with "path": {"path": "./plugins/my-plugin.js"}
          (JS-only, backwards compatible)
        - Dict with "js"/"py": {"js": "./plugins/my-plugin.js",
          "py": "./plugins/my_plugin.py", "id": "my-plugin"}

        Args:
            data: Plugin entry from YAML (string or dict)
            config_dir: Directory containing config.yaml (for resolving relative paths)

        Returns:
            PluginConfig if valid, None if invalid/not found
        """
        js_path = None
        py_path = None
        plugin_id = None

        # Handle string format (backwards compatible)
        if isinstance(data, str):
            plugin_path = Path(data)
            if not plugin_path.is_absolute():
                plugin_path = config_dir / plugin_path
            if not plugin_path.exists():
                logger.warning(f"Plugin file not found: {plugin_path}")
                return None
            # Determine if it's JS or PY by extension
            if plugin_path.suffix == ".js":
                js_path = plugin_path.resolve()
            elif plugin_path.suffix == ".py":
                py_path = plugin_path.resolve()
            else:
                logger.warning(f"Plugin file must be .js or .py: {plugin_path}")
                return None

        # Handle dict format
        elif isinstance(data, dict):
            # Backwards compatible: "path" field
            if "path" in data:
                plugin_path = Path(data["path"])
                if not plugin_path.is_absolute():
                    plugin_path = config_dir / plugin_path
                if not plugin_path.exists():
                    logger.warning(f"Plugin file not found: {plugin_path}")
                    return None
                if plugin_path.suffix == ".js":
                    js_path = plugin_path.resolve()
                elif plugin_path.suffix == ".py":
                    py_path = plugin_path.resolve()
                else:
                    logger.warning(f"Plugin file must be .js or .py: {plugin_path}")
                    return None

            # New format: "js" and/or "py" fields
            if "js" in data:
                js_plugin_path = Path(data["js"])
                if not js_plugin_path.is_absolute():
                    js_plugin_path = config_dir / js_plugin_path
                if not js_plugin_path.exists():
                    logger.warning(f"Plugin JS file not found: {js_plugin_path}")
                    return None
                js_path = js_plugin_path.resolve()

            if "py" in data:
                py_plugin_path = Path(data["py"])
                if not py_plugin_path.is_absolute():
                    py_plugin_path = config_dir / py_plugin_path
                if not py_plugin_path.exists():
                    logger.warning(f"Plugin Python file not found: {py_plugin_path}")
                    return None
                py_path = py_plugin_path.resolve()

            # Explicit plugin ID (for pairing)
            if "id" in data:
                plugin_id = data["id"]

            # Must have at least one path
            if not js_path and not py_path:
                logger.warning(f"Plugin entry must have 'js' or 'py' field: {data}")
                return None

        else:
            logger.warning(f"Invalid plugin entry: {data}")
            return None

        return cls(js_path=js_path, py_path=py_path, id=plugin_id)


@dataclass
class AppConfig:
    """Application configuration for models, plugins, and admin mode.

    When loaded with admin_mode=False:
    - Models are pre-populated in UI, users add their own API keys via settings
    - Plugins are loaded and available
    - API key settings UI is shown

    When loaded with admin_mode=True:
    - Models use server-side API keys from environment variables
    - Plugins are loaded and available
    - API key settings UI is hidden (users can't configure keys)
    """

    models: list[ModelConfig] = field(default_factory=list)
    plugins: list[PluginConfig] = field(default_factory=list)
    admin_mode: bool = False
    _config_path: Path | None = None

    @classmethod
    def load(
        cls, config_path: Path | None = None, admin_mode: bool = False
    ) -> "AppConfig":
        """Load configuration from config.yaml.

        Args:
            config_path: Path to config.yaml. Defaults to ./config.yaml
            admin_mode: Whether to enable admin mode (server-side API keys)

        Returns:
            AppConfig with models and plugins loaded

        Raises:
            FileNotFoundError: If config.yaml doesn't exist
            ValueError: If config is invalid
        """
        if config_path is None:
            config_path = Path.cwd() / "config.yaml"

        if not config_path.exists():
            raise FileNotFoundError(
                f"Config file not found: {config_path}. "
                f"See config.example.yaml for format."
            )

        yaml = YAML(typ="safe")
        with config_path.open() as f:
            data = yaml.load(f)

        if not data:
            raise ValueError(f"Config file {config_path} is empty or invalid YAML")

        if "models" not in data or not data["models"]:
            raise ValueError("Config requires at least one model in 'models' section")

        models = []
        for i, model_data in enumerate(data["models"]):
            model = ModelConfig.from_dict(model_data, i, admin_mode=admin_mode)
            models.append(model)

        # Load plugins (optional)
        plugins = []
        if "plugins" in data and data["plugins"]:
            config_dir = config_path.parent
            for plugin_entry in data["plugins"]:
                plugin_config = PluginConfig.from_dict(plugin_entry, config_dir)
                if plugin_config:
                    plugins.append(plugin_config)
                    if plugin_config.js_path and plugin_config.py_path:
                        logger.info(
                            f"Registered paired plugin: {plugin_config.plugin_id} "
                            f"(JS: {plugin_config.js_path.name}, "
                            f"PY: {plugin_config.py_path.name})"
                        )
                    elif plugin_config.js_path:
                        logger.info(
                            f"Registered JS plugin: {plugin_config.js_path.name}"
                        )
                    elif plugin_config.py_path:
                        logger.info(
                            f"Registered Python plugin: {plugin_config.py_path.name}"
                        )

        config = cls(
            models=models,
            plugins=plugins,
            admin_mode=admin_mode,
            _config_path=config_path,
        )

        mode_str = "admin mode" if admin_mode else "normal mode"
        logger.info(
            f"Loaded config ({mode_str}) with {len(models)} models from {config_path}"
        )
        if plugins:
            logger.info(f"Loaded {len(plugins)} plugin(s)")

        return config

    @classmethod
    def empty(cls) -> "AppConfig":
        """Create empty config (no models or plugins)."""
        return cls(models=[], plugins=[], admin_mode=False)

    def validate_environment(self) -> None:
        """Validate that all required environment variables are set.

        Only validates in admin mode. In normal mode, users provide their own keys.

        Call this at startup to fail fast with clear error messages.

        Raises:
            ValueError: If any required environment variable is not set
                (admin mode only)
        """
        if not self.admin_mode:
            return  # No validation needed in normal mode

        missing = []
        for model in self.models:
            if model.api_key_env_var and not os.environ.get(model.api_key_env_var):
                missing.append((model.id, model.api_key_env_var))

        if missing:
            error_lines = [
                f"  - {model_id}: {env_var} not set" for model_id, env_var in missing
            ]
            raise ValueError(
                "Missing environment variables for admin mode:\n"
                + "\n".join(error_lines)
            )

    def get_model_config(self, model_id: str) -> ModelConfig | None:
        """Get configuration for a specific model by ID.

        Args:
            model_id: The model ID (e.g., "openai/gpt-4o")

        Returns:
            ModelConfig if found, None otherwise
        """
        for model in self.models:
            if model.id == model_id:
                return model
        return None

    def resolve_credentials(self, model_id: str) -> tuple[str | None, str | None]:
        """Resolve API key and endpoint for a model.

        Only works in admin mode. Returns (None, None) in normal mode.

        Args:
            model_id: The model ID to look up

        Returns:
            Tuple of (api_key, base_url). Both may be None.
        """
        if not self.admin_mode:
            return (None, None)

        model = self.get_model_config(model_id)
        if model is None:
            return (None, None)

        api_key = None
        if model.api_key_env_var:
            api_key = os.environ.get(model.api_key_env_var)

        endpoint = None
        if model.endpoint_env_var:
            endpoint = os.environ.get(model.endpoint_env_var)

        return (api_key, endpoint)

    def get_frontend_models(self) -> list[dict]:
        """Get a safe model list for the frontend (no secrets).

        Returns a list of model info dicts with:
        - id: Model ID
        - name: Display name
        - provider: Extracted from ID
        - context_window: Token limit

        No API keys or environment variable names are included.
        """
        result = []
        for model in self.models:
            # Extract provider from model ID (first part before /)
            provider = model.id.split("/")[0] if "/" in model.id else "Unknown"
            # Capitalize provider for display
            provider = provider.capitalize()

            result.append(
                {
                    "id": model.id,
                    "name": model.name,
                    "provider": provider,
                    "context_window": model.context_window,
                }
            )
        return result


def is_github_copilot_enabled() -> bool:
    """
    Check if GitHub Copilot is enabled via environment variable.

    Enabled by default (returns True). Set CANVAS_CHAT_ENABLE_GITHUB_COPILOT=false
    to disable (e.g., in containerized environments where LiteLLM's file-based
    auth doesn't work).

    Returns:
        True if GitHub Copilot is enabled, False otherwise.
    """
    env_value = os.getenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "true").lower()
    return env_value in ("true", "1", "yes")
