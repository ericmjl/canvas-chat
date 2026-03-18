# Backend: LLM Proxy and Services

**Created**: 2026-03-16
**Status**: Design Phase

## Context and Design Philosophy

The FastAPI backend provides two things:

1. **LLM proxy** - Routes requests to various LLM providers
2. **Services** - Web search, research, file processing

It does NOT store user data. All conversation data stays in the browser.

## LLM Proxy

### Architecture

```text
Frontend → Backend → LiteLLM → Provider APIs
```

LiteLLM provides a unified API across providers:

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
- **Unified interface**: Single endpoint works with any LiteLLM-supported model

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

1. ✅ LiteLLM - reduces provider-specific code
2. ✅ SSE streaming - real-time token delivery
3. ✅ No user data storage - privacy, simplicity

### Deferred

1. Rate limiting per user?
2. Usage analytics?

## References

- HLD: `/docs/high-level-design.md`
- Implementation: `src/canvas_chat/app.py`
