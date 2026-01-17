import litellm
from fastapi.testclient import TestClient

import canvas_chat.app as app_module
from canvas_chat.app import app
from canvas_chat.config import AppConfig


def test_provider_models_copilot_without_api_key(monkeypatch):
    """Copilot models should be available without api_key in request."""
    monkeypatch.setattr(
        litellm,
        "github_copilot_models",
        {"github_copilot/gpt-4o", "github_copilot/gpt-4o-mini"},
    )

    client = TestClient(app)
    response = client.post("/api/provider-models", json={"provider": "github_copilot"})

    assert response.status_code == 200
    data = response.json()
    assert data, "Expected copilot models in response"
    ids = {model["id"] for model in data}
    assert "github_copilot/gpt-4o" in ids
    assert all(model["provider"] == "GitHub Copilot" for model in data)


def test_provider_models_copilot_blocked_in_admin_mode(monkeypatch):
    """Copilot models should be blocked in admin mode."""
    admin_config = AppConfig(models=[], plugins=[], admin_mode=True)
    monkeypatch.setattr(app_module, "get_admin_config", lambda: admin_config)

    client = TestClient(app)
    response = client.post("/api/provider-models", json={"provider": "github_copilot"})

    assert response.status_code == 400
    assert "admin mode" in response.json()["detail"].lower()
