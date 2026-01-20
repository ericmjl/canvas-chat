# Feature Flags

Canvas-Chat uses environment variables to control feature availability. This allows
deployments to enable or disable features without code changes.

## GitHub Copilot

| Variable                            | Default | Purpose                       |
| ----------------------------------- | ------- | ----------------------------- |
| `CANVAS_CHAT_ENABLE_GITHUB_COPILOT` | `true`  | Enable/disable GitHub Copilot |

### Why disable GitHub Copilot?

LiteLLM's built-in `github_copilot/` provider uses file-based authentication that
stores tokens in `~/.config/litellm/github_copilot/`. This doesn't work in read-only
containerized environments like Modal.

Set to `false` in such deployments:

```bash
CANVAS_CHAT_ENABLE_GITHUB_COPILOT=false
```

### Frontend behavior

When disabled:

- GitHub Copilot section is hidden in Settings
- Copilot models are not fetched or shown in the model picker
- Auth endpoints return 410 Gone

### Modal deployment

The Modal deployment sets this to `false`:

```python
# modal_app.py
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(...)
    .env({"CANVAS_CHAT_ENABLE_GITHUB_COPILOT": "false"})
)
```
