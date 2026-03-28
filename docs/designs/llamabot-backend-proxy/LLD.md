# Low-Level Design: LLM backend (llamabot integration)

**Parent:** [High-Level Design](../../high-level-design.md)
**Status:** Design (pre-implementation)
**Created:** 2026-03-28
**Updated:** 2026-03-28

## Related documents

- [High-Level Design](../../high-level-design.md)
- [Backend LLM proxy (narrative LLD)](../../llds/backend-llm-proxy.md)
- [LLM proxy EARS](./llm-proxy-EARS.md)
- [Backend API specs](../../specs/backend-api-specs.md)

## 1. Context

The FastAPI backend today routes **text** LLM work through **LiteLLM** (`litellm.acompletion`, structured outputs, streaming). **Image generation**, **token counting**, and **GitHub Copilot model discovery** also use LiteLLM-specific APIs and should remain on LiteLLM until a deliberate replacement exists.

This LLD describes migrating **chat completions** (streaming and non-streaming) and **structured JSON outputs** to **llamabot** (`SimpleBot`, `StructuredBot`) behind a small adapter while **preserving** HTTP/SSE contracts for the existing frontend.

## 2. Goals

- Centralize provider-agnostic configuration (model id, `api_key`, `base_url`, temperature, max tokens) in one module.
- Use **SimpleBot** for unstructured text: SSE streams (`/api/chat`, `/api/generate-code`, `/api/matrix/fill`, committee streams, etc.) and one-shot calls (summarize, title, summary, `_llm_text`).
- Use **StructuredBot** (or equivalent) for Pydantic-backed outputs: refine-query, matrix parse-two-lists, PPTX caption endpoints, `run_structured_string_list` (DDG query lists).
- Preserve **admin mode**, **GitHub Copilot** kwargs shaping (`prepare_copilot_openai_request`), and **user-facing error strings** (including Copilot auth hints).

## 3. Non-goals

- **PocketFlow** or other graph orchestration frameworks for committee—committee stays as asyncio + queues + parallel SimpleBot streams unless a future design explicitly adds a workflow engine.
- Removing the **LiteLLM** dependency entirely in the first iteration (images, tokens, Copilot model lists may keep using LiteLLM).
- Changing frontend routes, request bodies, or SSE event names.

## 4. Component overview

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  FastAPI    │────▶│  llm adapter     │────▶│  llamabot   │
│  routes     │     │  (new module)    │     │  SimpleBot /│
└─────────────┘     │  + copilot hook  │     │  Structured │
       │            └────────┬─────────┘     └─────────────┘
       │                     │
       │                     └── (optional) litellm.supports_response_schema
       │
       └── unchanged: aimage_generation, token_counter, github_copilot_models
```

Planned module (name TBD, e.g. `canvas_chat/llm_adapter.py`):

- Builds bot instances from request-scoped credentials after `inject_admin_credentials`.
- Applies `prepare_copilot_openai_request`-equivalent inputs so Copilot continues to work.
- Maps streaming chunks to the same SSE shapes routes emit today.
- Maps structured results to existing Pydantic models (`RefinedQueryOutput`, matrix rows/columns, PPTX outputs, etc.).
- Translates provider/SDK errors into the same HTTP status and SSE `error` payloads as today.

## 5. Data and interfaces

- **Inputs:** Same as current routes—OpenRouter-style model strings, optional `base_url`, per-provider API keys, message lists.
- **Outputs:** Byte-for-byte compatible SSE where applicable; JSON bodies unchanged for REST endpoints.
- **Structured capability detection:** May continue to call `litellm.supports_response_schema` in the adapter until StructuredBot exposes a single abstraction for “schema supported.”

## 6. Error handling

Handlers today catch LiteLLM exception types (`AuthenticationError`, `RateLimitError`, `APIError`, `APIConnectionError`). The adapter shall either:

- Catch llamabot/provider exceptions and map them to the same user-visible strings, or
- Document a thin exception-mapping table in code next to the adapter.

## 7. Dependencies

- **llamabot** (already in `pyproject.toml`; version to be pinned after API spike).
- **litellm** retained for non-chat utilities as above.

## 8. Testing strategy

- Unit tests mock the **adapter** (not duplicated completion logic).
- Existing integration tests that mock `litellm` at route level may be updated to mock the adapter once introduced.
- E2E behaviour unchanged: same Cypress assumptions for SSE and JSON responses.

## 9. Rollout

1. Spike: confirm async streaming and structured APIs on target llamabot version.
2. Implement adapter + migrate one streaming route (`/api/chat`).
3. Migrate remaining streams and one-shots; then structured paths.
4. Leave LiteLLM-only utilities in place; trim unused `acompletion` imports.
