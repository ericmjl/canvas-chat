import litellm
from fastapi.testclient import TestClient

from canvas_chat.app import app


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
