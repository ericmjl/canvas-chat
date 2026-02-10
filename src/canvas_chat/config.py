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
class BudgetsConfig:
    """Budget limits for agent execution."""

    max_tokens: int = 50000  # Maximum tokens to use
    max_tool_calls: int = 20  # Maximum tool invocations
    timeout_ms: int = 300000  # Timeout in milliseconds (5 minutes)

    @classmethod
    def from_dict(cls, data: dict | None) -> "BudgetsConfig":
        """Create BudgetsConfig from YAML dict."""
        if not data:
            return cls()
        return cls(
            max_tokens=data.get("maxTokens", 50000),
            max_tool_calls=data.get("maxToolCalls", 20),
            timeout_ms=data.get("timeoutMs", 300000),
        )


@dataclass
class HITLConfig:
    """Human-in-the-loop policy configuration."""

    require_tool_approval: bool = False  # Require approval for tool calls
    require_subagent_approval: bool = False  # Require approval for sub-agent spawns
    require_mutation_approval: bool = True  # Require approval for canvas mutations
    auto_approve_tools: list[str] = field(default_factory=list)  # Tools to auto-approve

    @classmethod
    def from_dict(cls, data: dict | None) -> "HITLConfig":
        """Create HITLConfig from YAML dict."""
        if not data:
            return cls()
        return cls(
            require_tool_approval=data.get("requireToolApproval", False),
            require_subagent_approval=data.get("requireSubagentApproval", False),
            require_mutation_approval=data.get("requireMutationApproval", True),
            auto_approve_tools=data.get("autoApproveTools", []),
        )


@dataclass
class OutputDisplayConfig:
    """Data-driven display configuration for agent output nodes.

    Allows config-based agents to customize their output node appearance
    without requiring JavaScript code.
    """

    type_label: str | None = None  # Display label (e.g., 'Reflection')
    type_icon: str | None = None  # Emoji icon (e.g., '🔮')
    actions: list[str] = field(default_factory=list)  # Action button IDs

    @classmethod
    def from_dict(cls, data: dict | None) -> "OutputDisplayConfig | None":
        """Create OutputDisplayConfig from YAML dict."""
        if not data:
            return None
        return cls(
            type_label=data.get("typeLabel"),
            type_icon=data.get("typeIcon"),
            actions=data.get("actions", []),
        )

    def to_dict(self) -> dict:
        """Convert to dict for frontend."""
        result = {}
        if self.type_label:
            result["typeLabel"] = self.type_label
        if self.type_icon:
            result["typeIcon"] = self.type_icon
        if self.actions:
            result["actions"] = self.actions
        return result


@dataclass
class EdgeSpec:
    """Specification for an edge to create after artifact creation.

    Variable references are resolved at runtime:
        - $artifact: The artifact node just created (always available)
        - $source: Each source node that triggered the run (expands to multiple)
        - $branch: Branch point node (requires usePathContext: true)
        - $leaf: Leaf node where agent was triggered (requires usePathContext: true)
        - Any other string is treated as a literal node ID

    Edge types:
        - reply: Standard conversation edge
        - run_reflection: Reflection analysis edge
        - run_artifact: Run to artifact edge
        - run_trigger: Trigger to run edge
        - subagent: Parent to sub-agent edge

    Example YAML:
        edges:
          - from: $branch
            to: $artifact
            edgeType: run_reflection
    """

    from_: str  # Source node reference
    to: str  # Target node reference
    edge_type: str = "reply"  # Edge type (reply, run_reflection, etc.)

    @classmethod
    def from_dict(cls, data: dict) -> "EdgeSpec":
        """Create EdgeSpec from YAML dict."""
        return cls(
            from_=data.get("from", "$artifact"),
            to=data.get("to", "$source"),
            edge_type=data.get("edgeType", "reply"),
        )

    def to_dict(self) -> dict:
        """Convert to dict for frontend."""
        return {
            "from": self.from_,
            "to": self.to,
            "edgeType": self.edge_type,
        }


@dataclass
class MetadataUpdateSpec:
    """Specification for a metadata update after artifact creation.

    Variable references are resolved at runtime (same as EdgeSpec):
        - $artifact: The artifact node just created
        - $source: Each source node (updates applied to each)
        - $branch: Branch point node (requires usePathContext: true)
        - $leaf: Leaf node (requires usePathContext: true)

    Metadata values can also contain variable references:
        metadata:
          reflectionNodeIds: [$artifact]  # Stores artifact ID

    Merge behavior:
        - Arrays are appended (existing + new)
        - Objects are shallow-merged
        - Primitives are overwritten

    Example YAML:
        metadataUpdates:
          - target: $branch
            metadata:
              reflectionNodeIds: [$artifact]
              hasReflection: true
    """

    target: str  # Node reference
    metadata: dict = field(default_factory=dict)  # Metadata to merge

    @classmethod
    def from_dict(cls, data: dict) -> "MetadataUpdateSpec":
        """Create MetadataUpdateSpec from YAML dict."""
        return cls(
            target=data.get("target", "$artifact"),
            metadata=data.get("metadata", {}),
        )

    def to_dict(self) -> dict:
        """Convert to dict for frontend."""
        return {
            "target": self.target,
            "metadata": self.metadata,
        }


@dataclass
class PostCreateConfig:
    """Post-creation hooks executed after an artifact is created.

    Allows declarative graph manipulation without custom JavaScript code.
    This enables config-based agents to create edges and update metadata
    on the conversation graph, similar to what code-based plugins do.

    Variable references (resolved at runtime):
        - $artifact: The artifact node just created (always available)
        - $source: Each source node that triggered the run (may expand)
        - $branch: Branch point node (requires usePathContext: true)
        - $leaf: Leaf node where agent was triggered (requires usePathContext)

    Path context (usePathContext: true):
        When enabled, traces back from the source node to find:
        - $leaf: The node where the user triggered the agent
        - $branch: The nearest branch point (node with multiple children) or root

    Use cases:
        - Creating edges from source nodes to output (like reflection links)
        - Updating metadata on related nodes (tracking reflections)
        - Building graph relationships based on conversation context

    Example YAML:
        postCreate:
          usePathContext: true
          edges:
            - from: $branch
              to: $artifact
              edgeType: run_reflection
          metadataUpdates:
            - target: $branch
              metadata:
                reflectionNodeIds: [$artifact]
    """

    edges: list[EdgeSpec] = field(default_factory=list)  # Edges to create
    metadata_updates: list[MetadataUpdateSpec] = field(
        default_factory=list
    )  # Metadata updates
    use_path_context: bool = False  # Enable $branch/$leaf resolution

    @classmethod
    def from_dict(cls, data: dict | None) -> "PostCreateConfig | None":
        """Create PostCreateConfig from YAML dict."""
        if not data:
            return None
        return cls(
            edges=[EdgeSpec.from_dict(e) for e in data.get("edges", [])],
            metadata_updates=[
                MetadataUpdateSpec.from_dict(m) for m in data.get("metadataUpdates", [])
            ],
            use_path_context=data.get("usePathContext", False),
        )

    def to_dict(self) -> dict:
        """Convert to dict for frontend."""
        result = {}
        if self.edges:
            result["edges"] = [e.to_dict() for e in self.edges]
        if self.metadata_updates:
            result["metadataUpdates"] = [m.to_dict() for m in self.metadata_updates]
        if self.use_path_context:
            result["usePathContext"] = self.use_path_context
        return result


@dataclass
class AgentConfig:
    """Configuration for an agent definition.

    Agents are declarative specifications describing what an agent is
    and what it is allowed to do.
    """

    id: str  # Unique agent identifier
    name: str  # Display name
    engine: str = "built-in"  # Engine adapter identifier
    model: str = ""  # LLM model identifier (uses default if empty)
    system_prompt: str = ""  # System prompt for the agent
    allowed_tools: list[str] = field(default_factory=list)  # Allowed tool IDs
    budgets: BudgetsConfig = field(default_factory=BudgetsConfig)
    hitl: HITLConfig = field(default_factory=HITLConfig)
    subagents: dict[str, "AgentConfig"] = field(default_factory=dict)
    default_output_node_type: str | None = None  # Default node type for outputs
    output_display: OutputDisplayConfig | None = None  # Data-driven display config
    output_mode: str | None = (
        None  # Output rendering mode (run_artifact or single_node)
    )
    post_create: PostCreateConfig | None = None  # Post-creation hooks
    slash_command: str | None = None  # Slash command trigger (e.g., "/reflect")

    @classmethod
    def from_dict(cls, data: dict, index: int | None = None) -> "AgentConfig":
        """Create AgentConfig from YAML dict with validation.

        Args:
            data: YAML dictionary
            index: Index in agents list (for error messages)
        """
        # Validate required fields
        if "id" not in data:
            idx_str = f" at index {index}" if index is not None else ""
            raise ValueError(f"Agent{idx_str} missing 'id' field")

        agent_id = data["id"]

        # Parse subagents recursively
        subagents = {}
        if "subagents" in data and data["subagents"]:
            for sub_id, sub_data in data["subagents"].items():
                sub_data["id"] = sub_id  # Ensure id is set
                subagents[sub_id] = cls.from_dict(sub_data)

        return cls(
            id=agent_id,
            name=data.get("name", agent_id),
            engine=data.get("engine", "built-in"),
            model=data.get("model", ""),
            system_prompt=data.get("systemPrompt", ""),
            allowed_tools=data.get("allowedTools", []),
            budgets=BudgetsConfig.from_dict(data.get("budgets")),
            hitl=HITLConfig.from_dict(data.get("hitl")),
            subagents=subagents,
            default_output_node_type=data.get("defaultOutputNodeType"),
            output_display=OutputDisplayConfig.from_dict(data.get("outputDisplay")),
            output_mode=data.get("outputMode"),
            post_create=PostCreateConfig.from_dict(data.get("postCreate")),
            slash_command=data.get("slashCommand"),
        )

    def to_frontend_dict(self) -> dict:
        """Convert to a safe dict for frontend (no sensitive data)."""
        return {
            "id": self.id,
            "name": self.name,
            "engine": self.engine,
            "model": self.model,
            "systemPrompt": self.system_prompt,
            "allowedTools": self.allowed_tools,
            "budgets": {
                "maxTokens": self.budgets.max_tokens,
                "maxToolCalls": self.budgets.max_tool_calls,
                "timeoutMs": self.budgets.timeout_ms,
            },
            "hitl": {
                "requireToolApproval": self.hitl.require_tool_approval,
                "requireSubagentApproval": self.hitl.require_subagent_approval,
                "requireMutationApproval": self.hitl.require_mutation_approval,
            },
            "subagents": {
                sid: sub.to_frontend_dict() for sid, sub in self.subagents.items()
            },
            "defaultOutputNodeType": self.default_output_node_type,
            "outputDisplay": self.output_display.to_dict()
            if self.output_display
            else None,
            "outputMode": self.output_mode,
            "postCreate": self.post_create.to_dict() if self.post_create else None,
            "slashCommand": self.slash_command,
        }


@dataclass
class GuardrailsConfig:
    """Safety guardrails for agent execution."""

    max_subagent_depth: int = 1  # Maximum sub-agent nesting depth
    max_subagent_spawns_per_run: int = 5  # Maximum sub-agents per run
    inherit_budgets: bool = True  # Whether sub-agents inherit parent budgets
    debounce_trigger_ms: int = 500  # Debounce for node-triggered runs

    @classmethod
    def from_dict(cls, data: dict | None) -> "GuardrailsConfig":
        """Create GuardrailsConfig from YAML dict."""
        if not data:
            return cls()
        return cls(
            max_subagent_depth=data.get("maxSubagentDepth", 1),
            max_subagent_spawns_per_run=data.get("maxSubagentSpawnsPerRun", 5),
            inherit_budgets=data.get("inheritBudgets", True),
            debounce_trigger_ms=data.get("debounceTriggerMs", 500),
        )


@dataclass
class MemoryPolicyConfig:
    """Memory retention policy configuration."""

    enabled: bool = True  # Whether memory is enabled
    default_bank_id: str = "default"  # Default memory bank
    max_memories_per_bank: int = 1000  # Maximum memories per bank
    ttl_days: int | None = None  # Time-to-live for memories (None = forever)
    allowed_types: list[str] = field(
        default_factory=lambda: ["world", "experience", "opinion"]
    )

    @classmethod
    def from_dict(cls, data: dict | None) -> "MemoryPolicyConfig":
        """Create MemoryPolicyConfig from YAML dict."""
        if not data:
            return cls()
        return cls(
            enabled=data.get("enabled", True),
            default_bank_id=data.get("defaultBankId", "default"),
            max_memories_per_bank=data.get("maxMemoriesPerBank", 1000),
            ttl_days=data.get("ttlDays"),
            allowed_types=data.get("allowedTypes", ["world", "experience", "opinion"]),
        )


@dataclass
class MemoryStoreConfig:
    """Configuration for the memory store backend."""

    type: str = "in-memory"  # Store type (in-memory, postgres, etc.)
    connection_string_env_var: str | None = None  # Env var for connection string
    policy: MemoryPolicyConfig = field(default_factory=MemoryPolicyConfig)

    @classmethod
    def from_dict(cls, data: dict | None) -> "MemoryStoreConfig":
        """Create MemoryStoreConfig from YAML dict."""
        if not data:
            return cls()
        return cls(
            type=data.get("type", "in-memory"),
            connection_string_env_var=data.get("connectionStringEnvVar"),
            policy=MemoryPolicyConfig.from_dict(data.get("policy")),
        )


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
    """Application configuration for models, plugins, agents, and admin mode.

    When loaded with admin_mode=False:
    - Models are pre-populated in UI, users add their own API keys via settings
    - Plugins are loaded and available
    - Agents are registered and available
    - API key settings UI is shown

    When loaded with admin_mode=True:
    - Models use server-side API keys from environment variables
    - Plugins are loaded and available
    - Agents are registered and available
    - API key settings UI is hidden (users can't configure keys)
    """

    models: list[ModelConfig] = field(default_factory=list)
    plugins: list[PluginConfig] = field(default_factory=list)
    agents: list[AgentConfig] = field(default_factory=list)
    guardrails: GuardrailsConfig = field(default_factory=GuardrailsConfig)
    memory_store: MemoryStoreConfig = field(default_factory=MemoryStoreConfig)
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
            AppConfig with models, plugins, and agents loaded

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

        # Load agents (optional)
        agents = []
        if "agents" in data and data["agents"]:
            for i, agent_data in enumerate(data["agents"]):
                agent = AgentConfig.from_dict(agent_data, i)
                agents.append(agent)
                logger.info(f"Registered agent: {agent.id} ({agent.name})")

        # Load guardrails (optional)
        guardrails = GuardrailsConfig.from_dict(data.get("guardrails"))

        # Load memory store config (optional)
        memory_store = MemoryStoreConfig.from_dict(data.get("memoryStore"))

        config = cls(
            models=models,
            plugins=plugins,
            agents=agents,
            guardrails=guardrails,
            memory_store=memory_store,
            admin_mode=admin_mode,
            _config_path=config_path,
        )

        mode_str = "admin mode" if admin_mode else "normal mode"
        logger.info(
            f"Loaded config ({mode_str}) with {len(models)} models from {config_path}"
        )
        if plugins:
            logger.info(f"Loaded {len(plugins)} plugin(s)")
        if agents:
            logger.info(f"Loaded {len(agents)} agent(s)")

        return config

    @classmethod
    def empty(cls) -> "AppConfig":
        """Create empty config (no models, plugins, or agents)."""
        return cls(
            models=[],
            plugins=[],
            agents=[],
            guardrails=GuardrailsConfig(),
            memory_store=MemoryStoreConfig(),
            admin_mode=False,
        )

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

    def get_agent_config(self, agent_id: str) -> AgentConfig | None:
        """Get configuration for a specific agent by ID.

        Args:
            agent_id: The agent ID

        Returns:
            AgentConfig if found, None otherwise
        """
        for agent in self.agents:
            if agent.id == agent_id:
                return agent
            # Check subagents
            if agent_id in agent.subagents:
                return agent.subagents[agent_id]
        return None

    def get_frontend_agents(self) -> list[dict]:
        """Get a safe agent list for the frontend (no sensitive data).

        Returns a list of agent info dicts suitable for the frontend.
        """
        return [agent.to_frontend_dict() for agent in self.agents]

    def get_frontend_guardrails(self) -> dict:
        """Get guardrails configuration for the frontend."""
        return {
            "maxSubagentDepth": self.guardrails.max_subagent_depth,
            "maxSubagentSpawnsPerRun": self.guardrails.max_subagent_spawns_per_run,
            "inheritBudgets": self.guardrails.inherit_budgets,
            "debounceTriggerMs": self.guardrails.debounce_trigger_ms,
        }

    def get_frontend_memory_config(self) -> dict:
        """Get memory configuration for the frontend."""
        return {
            "enabled": self.memory_store.policy.enabled,
            "defaultBankId": self.memory_store.policy.default_bank_id,
            "allowedTypes": self.memory_store.policy.allowed_types,
        }


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
