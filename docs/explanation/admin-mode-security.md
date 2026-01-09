# Admin mode security model

This document explains why admin mode exists, what threats it protects against, and its limitations.

## Why server-side API keys?

In the default "bring your own key" mode, users paste their API keys into the browser. These keys are stored in localStorage and sent with each API request. This is fine for personal use but problematic for enterprise deployments.

The core security concern is API key exposure. When keys are stored in the browser:

1. Users can extract them using browser DevTools (Inspect → Application → Local Storage)
2. Keys appear in network request headers (visible in DevTools → Network)
3. Malicious browser extensions could read localStorage
4. XSS vulnerabilities could exfiltrate keys

Admin mode solves this by keeping API keys on the server. The browser never receives or sends API keys - it only sends the model ID, and the server injects credentials before forwarding requests to LLM providers.

## Request flow comparison

### Normal mode (user provides keys)

```text
Browser                              Server                 LLM Provider
   │                                   │                         │
   ├─ POST /api/chat ─────────────────>│                         │
   │  {model, api_key, messages}       │                         │
   │                                   ├─ POST /v1/chat ────────>│
   │                                   │  {api_key, messages}    │
   │<─ SSE streaming response ─────────┤<────────────────────────┤
```

The API key travels from browser to server to provider. Anyone with browser DevTools can see the key.

### Admin mode (server manages keys)

```text
Browser                              Server                 LLM Provider
   │                                   │                         │
   ├─ POST /api/chat ─────────────────>│                         │
   │  {model, messages}                │                         │
   │  (no api_key!)                    │                         │
   │                                   │ Look up key from env    │
   │                                   ├─ POST /v1/chat ────────>│
   │                                   │  {api_key, messages}    │
   │<─ SSE streaming response ─────────┤<────────────────────────┤
```

The API key never leaves the server. The browser only knows which model to use, not how to authenticate with it.

## What admin mode protects against

### Key extraction via DevTools

In normal mode, any user can open DevTools → Application → Local Storage and copy the API key. In admin mode, there's nothing to copy - the key doesn't exist in the browser.

### Network inspection

In normal mode, API keys appear in request payloads (visible in DevTools → Network → request body). In admin mode, requests contain only `model` and `messages` - no credentials.

### XSS attacks

If an attacker injects JavaScript into the page (via XSS vulnerability), they could steal API keys from localStorage. In admin mode, there are no keys to steal from the frontend.

### Browser extension access

Malicious browser extensions can read localStorage and intercept network requests. Admin mode prevents key exposure to extensions since keys never reach the browser.

### Unauthorized model access

Users can only use models explicitly configured in `config.yaml`. They cannot add arbitrary models or connect to unauthorized endpoints.

## What admin mode does NOT protect against

### Server access

Anyone with access to the server (SSH, container shell, etc.) can read environment variables and extract API keys. Admin mode assumes the server is trusted.

### Malicious administrators

The administrator who configures `config.yaml` and sets environment variables has full access to all API keys. This is by design - admin mode is about protecting keys from end users, not from admins.

### Excessive API usage

Users can still make unlimited API calls through the UI, potentially running up costs. Admin mode doesn't include rate limiting - that's a separate concern. Consider:

- Rate limiting at the reverse proxy level (nginx, Cloudflare)
- Per-user quotas at the LLM provider level
- Usage monitoring via provider dashboards

### Conversation content exfiltration

Admin mode doesn't encrypt or protect conversation content. Users can copy/paste their conversations, and conversations traverse the network to LLM providers. If conversation confidentiality is critical, consider:

- Running behind a VPN
- Using self-hosted LLMs
- Implementing data loss prevention (DLP) at the network level

### Man-in-the-middle attacks

If the connection between Canvas Chat server and LLM providers is compromised, attackers could intercept API keys. This is mitigated by HTTPS, but ensure your server's TLS configuration is strong.

## Implementation details

### Environment variable storage

API keys are stored as environment variables, not in config files. This follows the [twelve-factor app](https://12factor.net/config) principle and integrates well with:

- Docker secrets
- Kubernetes Secrets
- AWS Secrets Manager / Parameter Store
- HashiCorp Vault
- Modal secrets

### Startup validation

When starting with `--admin-mode`, Canvas Chat validates that all required environment variables are set. This fails fast with clear error messages rather than failing later when a user tries to use a model.

### Credential injection

The `inject_admin_credentials()` function runs as a FastAPI dependency on each LLM endpoint. It:

1. Looks up the model configuration from `config.yaml`
2. Reads the API key from the environment variable
3. Injects `api_key` and `base_url` into the request
4. Raises HTTP 400 if the model isn't configured

This pattern keeps endpoint logic unchanged - they receive requests as if the user provided credentials.

### Frontend config endpoint

The `/api/config` endpoint returns:

```json
{
  "adminMode": true,
  "models": [
    {"id": "openai/gpt-4o", "name": "GPT-4o", "provider": "Openai", "context_window": 128000}
  ]
}
```

The response contains model metadata but **never** includes API keys or environment variable names.

## Recommendations for administrators

### Use a secrets manager

Rather than setting environment variables directly, use a secrets manager to inject them at runtime:

```bash
# AWS Secrets Manager (via CLI)
export OPENAI_API_KEY=$(aws secretsmanager get-secret-value --secret-id canvas-chat/openai --query SecretString --output text)

# HashiCorp Vault
export OPENAI_API_KEY=$(vault kv get -field=api_key secret/canvas-chat/openai)
```

### Run behind authentication

Admin mode controls access to API keys but not access to Canvas Chat itself. Deploy behind:

- SSO (SAML, OIDC)
- VPN
- Basic auth at the reverse proxy
- IP allowlisting

### Monitor API usage

Check your LLM provider dashboards regularly:

- OpenAI: platform.openai.com/usage
- Anthropic: console.anthropic.com/account/usage
- Google AI: aistudio.google.com/usage

### Rotate keys periodically

Even with admin mode, rotate API keys periodically. Update the environment variable and restart Canvas Chat. Users experience no disruption since they don't configure keys.

### Audit access to the server

Since anyone with server access can read environment variables, restrict and audit server access:

- Use IAM roles with least privilege
- Enable audit logging for SSH/shell access
- Consider secrets-as-a-service that logs all access

## Summary

Admin mode is designed for enterprise deployments where:

- End users shouldn't see or manage API keys
- Administrators want to control which models are available
- API costs should be controlled centrally

It provides meaningful security against casual extraction and browser-based attacks, but it's not a complete security solution. Combine it with proper authentication, network controls, and monitoring for a comprehensive security posture.
