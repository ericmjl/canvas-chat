"""Unit tests for AdminConfig - no API calls required."""

import pytest

from canvas_chat.admin_config import AdminConfig, ModelConfig

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
    model = ModelConfig.from_dict(data, 0)

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
    model = ModelConfig.from_dict(data, 0)

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
        ModelConfig.from_dict(data, 0)


def test_model_config_from_dict_missing_api_key_env_var():
    """Test ModelConfig raises error when apiKeyEnvVar is missing."""
    data = {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
    }
    with pytest.raises(ValueError, match="openai/gpt-4o missing 'apiKeyEnvVar' field"):
        ModelConfig.from_dict(data, 0)


# --- AdminConfig.load tests ---


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

    config = AdminConfig.load(config_file)

    assert config.enabled is True
    assert len(config.models) == 2
    assert config.models[0].id == "openai/gpt-4o"
    assert config.models[0].name == "GPT-4o"
    assert config.models[1].id == "anthropic/claude-sonnet-4-20250514"


def test_admin_config_load_file_not_found(tmp_path):
    """Test AdminConfig.load raises error when config file doesn't exist."""
    config_file = tmp_path / "nonexistent.yaml"

    with pytest.raises(FileNotFoundError, match="Admin mode requires config.yaml"):
        AdminConfig.load(config_file)


def test_admin_config_load_empty_file(tmp_path):
    """Test AdminConfig.load raises error for empty config file."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("")

    with pytest.raises(ValueError, match="is empty or invalid YAML"):
        AdminConfig.load(config_file)


def test_admin_config_load_no_models(tmp_path):
    """Test AdminConfig.load raises error when no models are defined."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("someKey: someValue\n")

    with pytest.raises(ValueError, match="requires at least one model"):
        AdminConfig.load(config_file)


def test_admin_config_load_empty_models_list(tmp_path):
    """Test AdminConfig.load raises error when models list is empty."""
    config_file = tmp_path / "config.yaml"
    config_file.write_text("models: []\n")

    with pytest.raises(ValueError, match="requires at least one model"):
        AdminConfig.load(config_file)


# --- AdminConfig.disabled tests ---


def test_admin_config_disabled():
    """Test creating a disabled admin config."""
    config = AdminConfig.disabled()

    assert config.enabled is False
    assert config.models == []


# --- AdminConfig.validate_environment tests ---


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

    config = AdminConfig.load(config_file)
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

    config = AdminConfig.load(config_file)

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

    config = AdminConfig.load(config_file)

    with pytest.raises(ValueError, match="TEST_KEY_MISSING not set"):
        config.validate_environment()


# --- AdminConfig.get_model_config tests ---


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

    config = AdminConfig.load(config_file)
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

    config = AdminConfig.load(config_file)
    model = config.get_model_config("nonexistent/model")

    assert model is None


# --- AdminConfig.resolve_credentials tests ---


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

    config = AdminConfig.load(config_file)
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

    config = AdminConfig.load(config_file)
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

    config = AdminConfig.load(config_file)
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

    config = AdminConfig.load(config_file)
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

    config = AdminConfig.load(config_file)
    api_key, base_url = config.resolve_credentials("openai/gpt-4o")

    assert api_key is None
    assert base_url is None


# --- AdminConfig.get_frontend_models tests ---


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

    config = AdminConfig.load(config_file)
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

    config = AdminConfig.load(config_file)
    frontend_models = config.get_frontend_models()

    assert frontend_models[0]["provider"] == "Unknown"
