# How to add and use OpenRouter models

OpenRouter gives you one API key to call many models (OpenAI, Anthropic, Google, Meta, etc.) through a single endpoint. Canvas Chat supports OpenRouter via LiteLLM: you add your OpenRouter API key in Settings, then use any `openrouter/` model from the built-in list or add custom models.

## When to use OpenRouter

- You want **one key** instead of separate keys per provider.
- You want to **try many models** (e.g. different Anthropic or OpenAI variants) without signing up everywhere.
- You’re fine with requests going through [OpenRouter](https://openrouter.ai/) (they proxy to the underlying providers).

If you already have provider API keys and prefer to use them directly, keep using the OpenAI, Anthropic, Google, and Groq fields in Settings instead.

## Prerequisites

- An [OpenRouter API key](https://openrouter.ai/keys) (starts with `sk-or-...`).

## Step 1: Add your OpenRouter API key

1. Open **Settings** (gear icon).
2. In **API Keys**, find **OpenRouter API Key**.
3. Paste your key (e.g. `sk-or-v1-...`).
4. Click **Save Settings**.

Keys are stored only in your browser and are sent with each request to the Canvas Chat backend, which forwards them to LiteLLM/OpenRouter.

## Step 2: Use built-in OpenRouter models

The app ships with a few OpenRouter models in the default list. Open the **model picker** (next to the send button) and look for provider “OpenRouter”. To use current frontier models, add them via **Settings → Custom Models**; good options include:

- **Claude Sonnet 4.6** — `openrouter/anthropic/claude-sonnet-4.6` (1M context)
- **Claude Opus 4.6** — `openrouter/anthropic/claude-opus-4.6` (1M context)
- **o3 Pro** (reasoning) — `openrouter/openai/o3-pro`

For more models, browse [OpenRouter’s catalog](https://openrouter.ai/models) and use the exact model IDs shown there.

## Step 3: Add more OpenRouter models (optional)

OpenRouter supports [many models](https://openrouter.ai/docs#models). To use one that isn’t in the default list:

1. Open **Settings** → **Custom Models**.
2. In **Model ID**, enter the OpenRouter model id in the form:
   - `openrouter/<provider>/<model-name>`
   - Examples:
     - `openrouter/anthropic/claude-sonnet-4.6`
     - `openrouter/anthropic/claude-opus-4.6`
     - `openrouter/openai/o3-pro`
3. Optionally set **Display Name** and **Context Window**.
4. Leave **Base URL** empty (OpenRouter uses its own endpoint).
5. Click **+ Add Model**, then **Save Settings**.

The new model appears in the model picker and uses your existing OpenRouter API key.

## Model ID format

OpenRouter model IDs always start with `openrouter/` and follow:

```text
openrouter/<provider>/<model-name>
```

- **provider** is the underlying provider (e.g. `anthropic`, `openai`, `google`, `meta-llama`).
- **model-name** is the model slug on OpenRouter (see [OpenRouter models](https://openrouter.ai/docs#models)).

The app uses the prefix `openrouter` to look up your OpenRouter API key; you don’t configure keys per provider when using OpenRouter.

## Admin mode (server-side key)

If you run Canvas Chat with `--admin-mode`, models and API keys are configured in `config.yaml` and environment variables. To expose OpenRouter models:

1. In `config.yaml`, add entries with `apiKeyEnvVar: 'OPENROUTER_API_KEY'`:

   ```yaml
   models:
     - id: 'openrouter/anthropic/claude-sonnet-4.6'
       name: 'Claude Sonnet 4.6 (OpenRouter)'
       apiKeyEnvVar: 'OPENROUTER_API_KEY'
       contextWindow: 1000000

     - id: 'openrouter/openai/o3-pro'
       name: 'o3 Pro (OpenRouter)'
       apiKeyEnvVar: 'OPENROUTER_API_KEY'
       contextWindow: 200000
   ```

2. Set the key in the environment:

   ```bash
   export OPENROUTER_API_KEY="sk-or-v1-..."
   ```

Users then see these models in the picker without entering any key in the UI. See [Admin Mode Setup](admin-mode.md) for the full flow.

## Troubleshooting

- **“Authentication failed”** — Check that the OpenRouter key in Settings is correct and has no extra spaces. Get a new key at [openrouter.ai/keys](https://openrouter.ai/keys) if needed.
- **Model not in the list** — Add it under Settings → Custom Models with ID `openrouter/<provider>/<model-name>`. Use the exact id from [OpenRouter’s model list](https://openrouter.ai/docs#models).
- **Wrong or missing key for OpenRouter** — Ensure you’re using the **OpenRouter API Key** field, not the OpenAI or Anthropic fields. OpenRouter uses a single key for all its models.
