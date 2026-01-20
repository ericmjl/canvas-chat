"""Unit tests for AppConfig - no API calls required."""

import pytest

from canvas_chat.config import AppConfig, ModelConfig

# --- ModelConfig.from_dict tests ---


def test_model_config_from_dict_valid():
    """Test creating ModelConfig from valid dict."""
    data = {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
        "apiKeyEnvVar": "OPENAI_API_KEY",
        "contextWindow": 128000,
        "endpointEnvVar": "OPENAI_ENDPOINT",
    }
    model = ModelConfig.from_dict(data, 0, admin_mode=True)

    assert model.id == "openai/gpt-4o"
    assert model.name == "GPT-4o"
    assert model.api_key_env_var == "OPENAI_API_KEY"
    assert model.context_window == 128000
    assert model.endpoint_env_var == "OPENAI_ENDPOINT"


def test_model_config_from_dict_defaults():
    """Test ModelConfig uses defaults for optional fields."""
    data = {
        "id": "openai/gpt-4o",
        "apiKeyEnvVar": "OPENAI_API_KEY",
    }
    model = ModelConfig.from_dict(data, 0, admin_mode=True)

    assert model.id == "openai/gpt-4o"
    assert model.name == "openai/gpt-4o"  # defaults to id
    assert model.context_window == 128000  # default
    assert model.endpoint_env_var is None  # default


def test_model_config_from_dict_missing_id():
    """Test ModelConfig raises error when id is missing."""
    data = {
        "name": "GPT-4o",
        "apiKeyEnvVar": "OPENAI_API_KEY",
    }
    with pytest.raises(ValueError, match="Model at index 0 missing 'id' field"):
        ModelConfig.from_dict(data, 0, admin_mode=True)


def test_model_config_from_dict_missing_api_key_env_var_admin_mode():
    """Test ModelConfig raises error when apiKeyEnvVar is missing in admin mode."""
    data = {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
    }
    with pytest.raises(ValueError, match="openai/gpt-4o missing 'apiKeyEnvVar' field"):
        ModelConfig.from_dict(data, 0, admin_mode=True)


def test_model_config_from_dict_missing_api_key_env_var_normal_mode():
    """Test ModelConfig allows missing apiKeyEnvVar in normal mode."""
    data = {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
    }
    model = ModelConfig.from_dict(data, 0, admin_mode=False)
    assert model.id == "openai/gpt-4o"
    assert model.api_key_env_var is None


# --- AppConfig.load tests ---


def test_admin_config_load_valid(tmp_path):
    """Test loading valid config from YAML file."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    name: "GPT-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
    contextWindow: 128000

  - id: "anthropic/claude-sonnet-4-20250514"
    name: "Claude Sonnet 4"
    apiKeyEnvVar: "ANTHROPIC_API_KEY"
""")

    config = AppConfig.load(config_file, admin_mode=True)

    assert config.admin_mode is True
    assert len(config.models) == 2
    assert config.models[0].id == "openai/gpt-4o"
    assert config.models[0].name == "GPT-4o"
    assert config.models[1].id == "anthropic/claude-sonnet-4-20250514"


def test_admin_config_load_file_not_found(tmp_path):
    """Test AppConfig.load raises error when config file doesn't exist."""
    config_file = tmp_path / "nonexistent.yaml"

    with pytest.raises(FileNotFoundError, match="Config file not found"):
        AppConfig.load(config_file, admin_mode=True)


def test_admin_config_load_empty_file(tmp_path):
    """Test AppConfig.load raises error for empty config file."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("")

    with pytest.raises(ValueError, match="is empty or invalid YAML"):
        AppConfig.load(config_file, admin_mode=True)


def test_admin_config_load_no_models(tmp_path):
    """Test AppConfig.load raises error when no models are defined."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("someKey: someValue\n")

    with pytest.raises(ValueError, match="requires at least one model"):
        AppConfig.load(config_file, admin_mode=True)


def test_admin_config_load_empty_models_list(tmp_path):
    """Test AppConfig.load raises error when models list is empty."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("models: []\n")

    with pytest.raises(ValueError, match="requires at least one model"):
        AppConfig.load(config_file, admin_mode=True)


# --- AppConfig.disabled tests ---


def test_admin_config_disabled():
    """Test creating a disabled admin config."""
    config = AppConfig.empty()

    assert config.admin_mode is False
    assert config.models == []


# --- AppConfig.validate_environment tests ---


def test_admin_config_validate_environment_all_set(tmp_path, monkeypatch):
    """Test validate_environment passes when all env vars are set."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "TEST_OPENAI_KEY"
  - id: "anthropic/claude-sonnet-4-20250514"
    apiKeyEnvVar: "TEST_ANTHROPIC_KEY"
""")

    monkeypatch.setenv("TEST_OPENAI_KEY", "sk-test-openai")
    monkeypatch.setenv("TEST_ANTHROPIC_KEY", "sk-test-anthropic")

    config = AppConfig.load(config_file, admin_mode=True)
    # Should not raise
    config.validate_environment()


def test_admin_config_validate_environment_missing(tmp_path, monkeypatch):
    """Test validate_environment raises error when env vars are missing."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "TEST_MISSING_KEY_1"
  - id: "anthropic/claude-sonnet-4-20250514"
    apiKeyEnvVar: "TEST_MISSING_KEY_2"
""")

    # Ensure env vars are NOT set
    monkeypatch.delenv("TEST_MISSING_KEY_1", raising=False)
    monkeypatch.delenv("TEST_MISSING_KEY_2", raising=False)

    config = AppConfig.load(config_file, admin_mode=True)

    with pytest.raises(ValueError, match="Missing environment variables"):
        config.validate_environment()


def test_admin_config_validate_environment_partial(tmp_path, monkeypatch):
    """Test validate_environment lists all missing env vars."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "TEST_KEY_SET"
  - id: "anthropic/claude-sonnet-4-20250514"
    apiKeyEnvVar: "TEST_KEY_MISSING"
""")

    monkeypatch.setenv("TEST_KEY_SET", "sk-test")
    monkeypatch.delenv("TEST_KEY_MISSING", raising=False)

    config = AppConfig.load(config_file, admin_mode=True)

    with pytest.raises(ValueError, match="TEST_KEY_MISSING not set"):
        config.validate_environment()


# --- AppConfig.get_model_config tests ---


def test_admin_config_get_model_config_found(tmp_path):
    """Test get_model_config returns correct model when found."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    name: "GPT-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
  - id: "anthropic/claude-sonnet-4-20250514"
    name: "Claude Sonnet 4"
    apiKeyEnvVar: "ANTHROPIC_API_KEY"
""")

    config = AppConfig.load(config_file, admin_mode=True)
    model = config.get_model_config("anthropic/claude-sonnet-4-20250514")

    assert model is not None
    assert model.id == "anthropic/claude-sonnet-4-20250514"
    assert model.name == "Claude Sonnet 4"


def test_admin_config_get_model_config_not_found(tmp_path):
    """Test get_model_config returns None when model not found."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
""")

    config = AppConfig.load(config_file, admin_mode=True)
    model = config.get_model_config("nonexistent/model")

    assert model is None


# --- AppConfig.resolve_credentials tests ---


def test_admin_config_resolve_credentials_found(tmp_path, monkeypatch):
    """Test resolve_credentials returns correct api_key and endpoint."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "custom/internal-llm"
    apiKeyEnvVar: "TEST_CUSTOM_KEY"
    endpointEnvVar: "TEST_CUSTOM_ENDPOINT"
""")

    monkeypatch.setenv("TEST_CUSTOM_KEY", "sk-custom-secret")
    monkeypatch.setenv("TEST_CUSTOM_ENDPOINT", "https://internal.example.com/v1")

    config = AppConfig.load(config_file, admin_mode=True)
    api_key, base_url = config.resolve_credentials("custom/internal-llm")

    assert api_key == "sk-custom-secret"
    assert base_url == "https://internal.example.com/v1"


def test_admin_config_resolve_credentials_no_endpoint(tmp_path, monkeypatch):
    """Test resolve_credentials returns None for endpoint when not configured."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "TEST_OPENAI_KEY"
""")

    monkeypatch.setenv("TEST_OPENAI_KEY", "sk-test-key")

    config = AppConfig.load(config_file, admin_mode=True)
    api_key, base_url = config.resolve_credentials("openai/gpt-4o")

    assert api_key == "sk-test-key"
    assert base_url is None


def test_admin_config_resolve_credentials_endpoint_env_not_set(tmp_path, monkeypatch):
    """Test resolve_credentials returns None for endpoint when env var not set."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "custom/internal-llm"
    apiKeyEnvVar: "TEST_CUSTOM_KEY"
    endpointEnvVar: "TEST_CUSTOM_ENDPOINT"
""")

    monkeypatch.setenv("TEST_CUSTOM_KEY", "sk-custom-secret")
    monkeypatch.delenv("TEST_CUSTOM_ENDPOINT", raising=False)

    config = AppConfig.load(config_file, admin_mode=True)
    api_key, base_url = config.resolve_credentials("custom/internal-llm")

    assert api_key == "sk-custom-secret"
    assert base_url is None  # env var not set, so endpoint is None


def test_admin_config_resolve_credentials_not_found(tmp_path):
    """Test resolve_credentials returns (None, None) when model not found."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
""")

    config = AppConfig.load(config_file, admin_mode=True)
    api_key, base_url = config.resolve_credentials("nonexistent/model")

    assert api_key is None
    assert base_url is None


def test_admin_config_resolve_credentials_env_not_set(tmp_path, monkeypatch):
    """Test resolve_credentials returns None for api_key when env var not set."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "TEST_UNSET_KEY"
""")

    monkeypatch.delenv("TEST_UNSET_KEY", raising=False)

    config = AppConfig.load(config_file, admin_mode=True)
    api_key, base_url = config.resolve_credentials("openai/gpt-4o")

    assert api_key is None
    assert base_url is None


# --- AppConfig.get_frontend_models tests ---


def test_admin_config_get_frontend_models(tmp_path):
    """Test get_frontend_models returns safe model list without secrets."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    name: "GPT-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
    contextWindow: 128000
  - id: "anthropic/claude-sonnet-4-20250514"
    name: "Claude Sonnet 4"
    apiKeyEnvVar: "ANTHROPIC_API_KEY"
    contextWindow: 200000
""")

    config = AppConfig.load(config_file, admin_mode=True)
    frontend_models = config.get_frontend_models()

    assert len(frontend_models) == 2

    # First model
    assert frontend_models[0]["id"] == "openai/gpt-4o"
    assert frontend_models[0]["name"] == "GPT-4o"
    assert frontend_models[0]["provider"] == "Openai"
    assert frontend_models[0]["context_window"] == 128000
    # Verify NO secrets are included
    assert "apiKeyEnvVar" not in frontend_models[0]
    assert "api_key_env_var" not in frontend_models[0]
    assert "api_key" not in frontend_models[0]

    # Second model
    assert frontend_models[1]["id"] == "anthropic/claude-sonnet-4-20250514"
    assert frontend_models[1]["name"] == "Claude Sonnet 4"
    assert frontend_models[1]["provider"] == "Anthropic"
    assert frontend_models[1]["context_window"] == 200000


def test_admin_config_get_frontend_models_no_slash_in_id(tmp_path):
    """Test get_frontend_models handles model IDs without slash."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "gpt-4o"
    name: "GPT-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
""")

    config = AppConfig.load(config_file, admin_mode=True)
    frontend_models = config.get_frontend_models()

    assert frontend_models[0]["provider"] == "Unknown"


# --- AppConfig.plugins tests ---


def test_admin_config_load_no_plugins(tmp_path):
    """Test loading config without plugins section."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
""")

    config = AppConfig.load(config_file, admin_mode=True)

    assert config.plugins == []


def test_admin_config_load_empty_plugins_list(tmp_path):
    """Test loading config with empty plugins list."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins: []
""")

    config = AppConfig.load(config_file, admin_mode=True)

    assert config.plugins == []


def test_admin_config_load_single_plugin_relative_path(tmp_path):
    """Test loading config with single plugin (relative path)."""
    config_file = tmp_path / "config.yaml"
    plugin_file = tmp_path / "my-plugin.js"
    plugin_file.write_text("// plugin code")

    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins:
  - path: ./my-plugin.js
""")

    config = AppConfig.load(config_file, admin_mode=True)

    assert len(config.plugins) == 1
    assert config.plugins[0].js_path == (tmp_path / "my-plugin.js").resolve()
    assert config.plugins[0].js_path.exists()


def test_admin_config_load_multiple_plugins(tmp_path):
    """Test loading config with multiple plugins."""
    config_file = tmp_path / "config.yaml"
    plugin1 = tmp_path / "plugin1.js"
    plugin2 = tmp_path / "plugin2.js"
    plugin1.write_text("// plugin 1")
    plugin2.write_text("// plugin 2")

    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins:
  - path: ./plugin1.js
  - path: ./plugin2.js
""")

    config = AppConfig.load(config_file, admin_mode=True)

    assert len(config.plugins) == 2
    assert config.plugins[0].js_path == (tmp_path / "plugin1.js").resolve()
    assert config.plugins[1].js_path == (tmp_path / "plugin2.js").resolve()


def test_admin_config_load_plugin_absolute_path(tmp_path):
    """Test loading config with plugin using absolute path."""
    config_file = tmp_path / "config.yaml"
    plugin_file = tmp_path / "absolute-plugin.js"
    plugin_file.write_text("// plugin code")

    config_file.write_text(f"""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins:
  - path: {plugin_file}
""")

    config = AppConfig.load(config_file, admin_mode=True)

    assert len(config.plugins) == 1
    assert config.plugins[0].js_path == plugin_file.resolve()
    assert config.plugins[0].js_path.is_absolute()


def test_admin_config_load_plugin_nested_path(tmp_path):
    """Test loading config with plugin in nested directory."""
    config_file = tmp_path / "config.yaml"
    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    plugin_file = plugins_dir / "nested-plugin.js"
    plugin_file.write_text("// plugin code")

    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins:
  - path: ./plugins/nested-plugin.js
""")

    config = AppConfig.load(config_file, admin_mode=True)

    assert len(config.plugins) == 1
    assert config.plugins[0].js_path == plugin_file.resolve()
    assert config.plugins[0].js_path.exists()


def test_admin_config_load_plugin_missing_file_warns(tmp_path, caplog):
    """Test loading config with missing plugin file logs warning and skips plugin."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins:
  - path: ./nonexistent-plugin.js
""")

    import logging

    with caplog.at_level(logging.WARNING):
        config = AppConfig.load(config_file, admin_mode=True)

    # Plugin is NOT included because file doesn't exist
    assert len(config.plugins) == 0

    # Warning was logged
    assert "Plugin file not found" in caplog.text
    assert "nonexistent-plugin.js" in caplog.text


def test_admin_config_load_plugin_missing_path_field(tmp_path, caplog):
    """Test loading config with plugin entry missing 'path' field logs warning."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins:
  - name: invalid-entry
""")

    import logging

    with caplog.at_level(logging.WARNING):
        config = AppConfig.load(config_file, admin_mode=True)

    # Plugin is skipped because entry is invalid
    assert len(config.plugins) == 0

    # Warning was logged
    assert "Plugin entry must have 'js' or 'py' field" in caplog.text


def test_admin_config_load_plugins_not_list(tmp_path, caplog):
    """Test loading config where plugins is a string (treated as iterable of chars)."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("""
models:
  - id: "openai/gpt-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
plugins: "not-a-list"
""")

    import logging

    with caplog.at_level(logging.WARNING):
        config = AppConfig.load(config_file, admin_mode=True)

    # String is iterated as characters, each treated as path, all fail to exist
    assert len(config.plugins) == 0

    # Warnings logged for each character path
    assert "Plugin file not found" in caplog.text


# --- is_github_copilot_enabled tests ---


def test_copilot_enabled_by_default(monkeypatch):
    """Copilot should be enabled when env var is not set."""
    monkeypatch.delenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", raising=False)
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is True


def test_copilot_enabled_with_true(monkeypatch):
    """Copilot should be enabled when env var is 'true'."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "true")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is True


def test_copilot_enabled_with_1(monkeypatch):
    """Copilot should be enabled when env var is '1'."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "1")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is True


def test_copilot_enabled_with_yes(monkeypatch):
    """Copilot should be enabled when env var is 'yes'."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "yes")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is True


def test_copilot_disabled_with_false(monkeypatch):
    """Copilot should be disabled when env var is 'false'."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "false")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is False


def test_copilot_disabled_with_0(monkeypatch):
    """Copilot should be disabled when env var is '0'."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "0")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is False


def test_copilot_disabled_with_no(monkeypatch):
    """Copilot should be disabled when env var is 'no'."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "no")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is False


def test_copilot_disabled_with_empty(monkeypatch):
    """Copilot should be disabled when env var is empty."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is False


def test_copilot_disabled_with_random_value(monkeypatch):
    """Copilot should be disabled when env var is random non-truthy value."""
    monkeypatch.setenv("CANVAS_CHAT_ENABLE_GITHUB_COPILOT", "disabled")
    from canvas_chat.config import is_github_copilot_enabled

    assert is_github_copilot_enabled() is False
