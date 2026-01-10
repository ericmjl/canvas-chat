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
    plugins: list[Path] = field(default_factory=list)
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
                if isinstance(plugin_entry, dict) and "path" in plugin_entry:
                    plugin_path = Path(plugin_entry["path"])
                elif isinstance(plugin_entry, str):
                    plugin_path = Path(plugin_entry)
                else:
                    logger.warning(f"Invalid plugin entry: {plugin_entry}")
                    continue

                # Resolve relative paths from config file directory
                if not plugin_path.is_absolute():
                    plugin_path = config_dir / plugin_path

                if not plugin_path.exists():
                    logger.warning(f"Plugin file not found: {plugin_path}")
                    continue

                plugins.append(plugin_path.resolve())
                logger.info(f"Registered plugin: {plugin_path}")

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
