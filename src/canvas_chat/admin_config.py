"""Admin configuration module for enterprise deployments.

This module provides server-side API key management for admin-controlled
deployments where users don't need to (and can't) configure their own keys.

Key design principles:
- API keys are NEVER sent to the frontend
- Config is loaded from config.yaml in the current working directory
- Environment variables are used for actual secrets
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
    """Configuration for a single admin-managed model.

    Both API keys and endpoints are configured via environment variables,
    allowing different values for dev/test/prod environments without
    changing the config file.
    """

    id: str  # LiteLLM-compatible model ID (provider/model-name)
    name: str  # Display name shown in UI
    api_key_env_var: str  # Environment variable name containing the API key
    context_window: int = 128000  # Token limit for context building
    endpoint_env_var: str | None = None  # Optional env var for custom endpoint

    @classmethod
    def from_dict(cls, data: dict, index: int) -> "ModelConfig":
        """Create ModelConfig from YAML dict with validation."""
        # Validate required fields
        if "id" not in data:
            raise ValueError(f"Model at index {index} missing 'id' field")

        model_id = data["id"]

        if "apiKeyEnvVar" not in data:
            raise ValueError(f"Model {model_id} missing 'apiKeyEnvVar' field")

        return cls(
            id=model_id,
            name=data.get("name", model_id),
            api_key_env_var=data["apiKeyEnvVar"],
            context_window=data.get("contextWindow", 128000),
            endpoint_env_var=data.get("endpointEnvVar"),
        )


@dataclass
class AdminConfig:
    """Admin configuration for server-side API key management and plugins.

    When enabled, this configuration:
    1. Loads model definitions from config.yaml
    2. Resolves API keys from environment variables at request time
    3. Provides a safe model list for the frontend (without secrets)
    4. Injects credentials into requests via FastAPI dependency
    5. Manages custom plugin files for node types
    """

    enabled: bool = False
    models: list[ModelConfig] = field(default_factory=list)
    plugins: list[Path] = field(default_factory=list)
    _config_path: Path | None = None

    @classmethod
    def load(cls, config_path: Path | None = None) -> "AdminConfig":
        """Load admin configuration from config.yaml.

        Args:
            config_path: Path to config.yaml. Defaults to ./config.yaml

        Returns:
            AdminConfig with enabled=True and models loaded

        Raises:
            FileNotFoundError: If config.yaml doesn't exist
            ValueError: If config is invalid
        """
        if config_path is None:
            config_path = Path.cwd() / "config.yaml"

        if not config_path.exists():
            raise FileNotFoundError(
                f"Admin mode requires config.yaml in current directory "
                f"({config_path}). See config.example.yaml for format."
            )

        yaml = YAML(typ="safe")
        with config_path.open() as f:
            data = yaml.load(f)

        if not data:
            raise ValueError(f"Config file {config_path} is empty or invalid YAML")

        if "models" not in data or not data["models"]:
            raise ValueError("Admin mode requires at least one model in config.yaml")

        models = []
        for i, model_data in enumerate(data["models"]):
            model = ModelConfig.from_dict(model_data, i)
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
            enabled=True, models=models, plugins=plugins, _config_path=config_path
        )

        logger.info(f"Admin mode enabled with {len(models)} models from {config_path}")
        if plugins:
            logger.info(f"Loaded {len(plugins)} plugin(s)")

        return config

    @classmethod
    def disabled(cls) -> "AdminConfig":
        """Create a disabled admin config (normal mode)."""
        return cls(enabled=False, models=[])

    def validate_environment(self) -> None:
        """Validate that all required environment variables are set.

        Call this at startup to fail fast with clear error messages.

        Raises:
            ValueError: If any required environment variable is not set
        """
        missing = []
        for model in self.models:
            if not os.environ.get(model.api_key_env_var):
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

        Args:
            model_id: The model ID to look up

        Returns:
            Tuple of (api_key, base_url). Both may be None if model not found.
        """
        model = self.get_model_config(model_id)
        if model is None:
            return (None, None)

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
