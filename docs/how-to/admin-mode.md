# How to set up admin mode for enterprise deployments

Admin mode allows administrators to control which models are available and manage API keys server-side. Users don't need to configure anything - it "just works."

## When to use admin mode

Admin mode is designed for enterprise or internal deployments where:

- Administrators want to control which LLM models are available
- API keys should not be visible to end users (even in browser DevTools)
- Users shouldn't need to bring their own API keys

For personal use or demos, stick with normal mode where users provide their own keys via the Settings panel.

## Prerequisites

You need:

- Canvas Chat installed (`pip install canvas-chat` or via `uvx`)
- API keys for the LLM providers you want to make available
- Write access to the directory where you'll run Canvas Chat

## Step 1: Create the configuration file

Create a `config.yaml` file in the directory where you'll run Canvas Chat:

```yaml
# config.yaml - Admin-controlled model configuration
# API keys are read from environment variables, not stored here.

models:
  # OpenAI models
  - id: "openai/gpt-4o"
    name: "GPT-4o"
    apiKeyEnvVar: "OPENAI_API_KEY"
    contextWindow: 128000

  - id: "openai/gpt-4o-mini"
    name: "GPT-4o Mini"
    apiKeyEnvVar: "OPENAI_API_KEY"
    contextWindow: 128000

  # Anthropic models
  - id: "anthropic/claude-sonnet-4-20250514"
    name: "Claude Sonnet 4"
    apiKeyEnvVar: "ANTHROPIC_API_KEY"
    contextWindow: 200000

  - id: "anthropic/claude-3-5-haiku-20241022"
    name: "Claude 3.5 Haiku"
    apiKeyEnvVar: "ANTHROPIC_API_KEY"
    contextWindow: 200000
```

See `config.example.yaml` in the repository for a complete template with all common providers.

### Configuration fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | LiteLLM-compatible model ID (provider/model-name) |
| `name` | No | Display name shown in UI (defaults to `id`) |
| `apiKeyEnvVar` | Yes | Environment variable name containing the API key |
| `contextWindow` | No | Token limit for context building (default: 128000) |
| `endpointEnvVar` | No | Environment variable name for custom endpoint URL |

## Step 2: Set environment variables

Set the environment variables referenced in your config:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

For production deployments, use your platform's secrets management:

- **Docker:** Use `--env-file` or Docker secrets
- **Kubernetes:** Use Secrets or external secret managers
- **AWS:** Use Secrets Manager or Parameter Store
- **Modal:** Use `modal secret create` (see Modal deployment section)

## Step 3: Start Canvas Chat in admin mode

```bash
uvx canvas-chat --admin-mode
```

Canvas Chat will:

1. Load `config.yaml` from the current directory
2. Validate that all required environment variables are set
3. Start with the configured models

If any environment variable is missing, you'll see a clear error:

```text
ValueError: Missing environment variables for admin mode:
  - openai/gpt-4o: OPENAI_API_KEY not set
```

## Step 4: Verify the setup

1. Open Canvas Chat in your browser
2. Click Settings (⚙️) - you should **not** see API key input fields
3. The model picker should show only your configured models
4. Send a test message to verify LLM connectivity

## Adding custom or self-hosted models

For internal or self-hosted LLMs, use the `endpointEnvVar` field to specify an environment variable containing the endpoint URL:

```yaml
models:
  - id: "custom/internal-llm"
    name: "Internal LLM"
    apiKeyEnvVar: "INTERNAL_LLM_KEY"
    endpointEnvVar: "INTERNAL_LLM_ENDPOINT"
    contextWindow: 32000
```

Then set the environment variable:

```bash
export INTERNAL_LLM_ENDPOINT="https://llm.internal.company.com/v1"
export INTERNAL_LLM_KEY="your-internal-key"
```

Using environment variables for endpoints (rather than hardcoded URLs) allows the same `config.yaml` to work across dev, test, and production environments - just set different values for the environment variables in each environment.

The endpoint is passed to LiteLLM as `base_url`, so it should be OpenAI-compatible.

## Modal deployment with admin mode

For Modal deployments, set secrets using the Modal CLI:

```bash
# Create secrets
modal secret create canvas-chat-secrets \
  OPENAI_API_KEY="sk-..." \
  ANTHROPIC_API_KEY="sk-ant-..."

# Reference in modal_app.py
@app.function(secrets=[modal.Secret.from_name("canvas-chat-secrets")])
def run_app():
    ...
```

Then add `config.yaml` to your Modal app and enable admin mode.

## Disabling admin mode

To return to normal mode (users provide their own keys):

```bash
uvx canvas-chat --no-admin-mode
# or simply:
uvx canvas-chat
```

Normal mode is the default - you only need `--admin-mode` to explicitly enable it.

## Troubleshooting

### "Admin mode requires config.yaml in current directory"

Canvas Chat looks for `config.yaml` in the directory where you run the command. Either:

- Create `config.yaml` in that directory, or
- `cd` to the directory containing your config file

### "Model 'xxx' not available"

This error appears when a user tries to use a model not in your config. Either:

- Add the model to `config.yaml`, or
- This is expected behavior - admin mode restricts available models

### API key environment variable not found at startup

The error message tells you exactly which variables are missing:

```text
Missing environment variables for admin mode:
  - anthropic/claude-sonnet-4-20250514: ANTHROPIC_API_KEY not set
```

Set the variable and restart Canvas Chat.

### Models work in normal mode but fail in admin mode

Double-check that:

1. The environment variable name in `config.yaml` matches exactly what you exported
2. The environment variable value is the complete API key
3. The model ID matches LiteLLM's expected format (e.g., `openai/gpt-4o`, not just `gpt-4o`)

### Users still see API key settings

If the Settings panel still shows API key fields:

1. Verify you started with `--admin-mode` flag
2. Check the browser console for errors loading `/api/config`
3. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
