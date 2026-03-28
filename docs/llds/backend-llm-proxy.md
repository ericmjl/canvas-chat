# Backend: LLM Proxy and Services

**Created**: 2026-03-16
**Updated**: 2026-03-28
**Status**: Design Phase

## Related design documents

- **[LLD: llamabot backend proxy](../designs/llamabot-backend-proxy/LLD.md)** — migration plan: SimpleBot/StructuredBot adapter, LiteLLM retained for images/tokens/Copilot utilities.
- **[EARS: LLM proxy](../designs/llamabot-backend-proxy/llm-proxy-EARS.md)** — testable requirements for API parity and bot usage.

## Context and Design Philosophy

The FastAPI backend provides two things:

1. **LLM proxy** - Routes requests to various LLM providers
2. **Services** - Web search, research, file processing

It does NOT store user data. All conversation data stays in the browser.

## LLM Proxy

### Architecture

**Target (in progress):** text completions are moving from raw LiteLLM `acompletion` to **llamabot** (`SimpleBot` for unstructured text and SSE, `StructuredBot` for Pydantic/JSON outputs) behind a small backend adapter, while **LiteLLM** remains for image generation, token counting, and Copilot-specific helpers. See the [LLD](../designs/llamabot-backend-proxy/LLD.md).

```text
Frontend → Backend → llamabot (SimpleBot / StructuredBot) → Provider APIs
                  ↘ LiteLLM (images, token_counter, Copilot model list only)
```

Historically, all chat traffic went through LiteLLM end-to-end:

```text
Frontend → Backend → LiteLLM → Provider APIs
```

LiteLLM (still used where noted above) provides a unified API across providers:

| Provider  | Example Model                  |
| --------- | ------------------------------ |
| OpenAI    | `openai/gpt-4o`                |
| Anthropic | `anthropic/claude-sonnet-4-5`  |
| Google    | `google/gemini-1.5-pro`        |
| Groq      | `groq/llama-3.1-70b-versatile` |
| GitHub    | `github/gpt-4o`                |

### Chat Endpoint

```text
POST /api/chat
```

Request:

```json
{
    "messages": [{ "role": "user", "content": "Hello" }],
    "model": "openai/gpt-4o",
    "api_key": "sk-...",
    "temperature": 0.3
}
```

Response: Server-Sent Events (SSE) streaming

### Why Proxy?

- **CORS**: Avoids CORS issues with direct provider calls
- **Key management**: API keys stored in browser, not exposed to providers directly
- **Unified interface**: Single endpoint works with any provider/model id the stack supports (same model strings as before; implementation detail may be llamabot + optional LiteLLM utilities)

## Services

### Web Search (Exa)

```text
POST /api/exa/search
POST /api/exa/research
```

Search the web, get content from URLs. Used by:

- `/search` command
- Research feature
- Factcheck feature

### File Processing

```text
POST /api/upload-file
```

Routes to Python handlers based on file type:

- **PDF**: Extract text, create node
- **PowerPoint**: Extract slides, create node
- **CSV/Excel**: Parse data, create node with `csvData`

### Multi-LLM Committee

```text
POST /api/committee
```

Query multiple models in parallel, stream their responses, synthesize with another LLM call.

## Admin Mode

For enterprise deployments:

```yaml
# config.yaml
admin_mode: true
models:
    - id: openai/gpt-4o
      api_key_env_var: OPENAI_API_KEY
```

In admin mode:

- API keys come from server environment
- Frontend doesn't show API key settings
- Keys never exposed to client

## Open Questions & Future Decisions

### Resolved

1. ✅ LiteLLM - reduces provider-specific code (narrowed over time: chat completions migrate to llamabot; see LLD)
2. ✅ SSE streaming - real-time token delivery
3. ✅ No user data storage - privacy, simplicity

### Deferred

1. Rate limiting per user?
2. Usage analytics?

## References

- HLD: [high-level-design.md](../high-level-design.md)
- LLD + EARS: [designs/llamabot-backend-proxy/](../designs/llamabot-backend-proxy/LLD.md)
- Implementation: `src/canvas_chat/app.py` (and plugins under `src/canvas_chat/plugins/`)
