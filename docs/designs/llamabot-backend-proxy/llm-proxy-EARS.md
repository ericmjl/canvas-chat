# LLM backend proxy — EARS (llamabot migration)

**Parent LLD:** [LLD.md](./LLD.md)
**Created:** 2026-03-28
**Status:** Active gap (pre-implementation)

## Related documents

- [LLD](./LLD.md)
- [Backend API specs](../../specs/backend-api-specs.md)

## Parity and routing

- [ ] **LLM-BOT-PAR-001**: The system shall preserve existing request and response contracts for `POST /api/chat`, `POST /api/summarize`, `POST /api/committee`, plugin routes that stream LLM output, and structured JSON endpoints listed in the LLD, so that clients require no changes for migration.

- [ ] **LLM-BOT-PAR-002**: When serving streaming completions, the system shall emit the same SSE event names and payload shapes the frontend already consumes (`message`, `done`, `error`, and committee-specific events as today).

- [ ] **LLM-BOT-PAR-003**: When `inject_admin_credentials` or user-supplied keys are applied, the system shall pass the same effective credentials and `base_url` into the llamabot layer as today’s LiteLLM kwargs receive after `prepare_copilot_openai_request`.

## SimpleBot (unstructured text)

- [ ] **LLM-BOT-SIM-001**: The system shall use SimpleBot (or an equivalent one-shot/stream helper from llamabot) for all unstructured text completions that currently call `litellm.acompletion` without a Pydantic `response_format`, including streaming and non-streaming paths.

- [ ] **LLM-BOT-SIM-002**: When a streaming completion fails with an authentication, rate limit, or provider error, the system shall surface user-visible messages consistent with existing handlers (including GitHub Copilot auth guidance where applicable).

## StructuredBot (structured outputs)

- [ ] **LLM-BOT-STR-001**: The system shall use StructuredBot (or equivalent) for endpoints that require validated Pydantic output (refine-query, matrix parse-two-lists, PPTX caption/narrative endpoints, and DDG query lists via `run_structured_string_list`).

- [ ] **LLM-BOT-STR-002**: Where the model does not support schema-constrained generation, the system shall fall back to unstructured generation and parse/validate in a way that preserves current behaviour (including existing fallback branches).

## LiteLLM retention

- [ ] **LLM-BOT-UTL-001**: The system shall continue to use LiteLLM for `aimage_generation` (non-Ollama image path), `token_counter` (including `GET /api/token-count`), and GitHub Copilot model enumeration (`github_copilot_models`, tests using `get_model_info`) until a separate design replaces those dependencies.

## Committee orchestration

- [ ] **LLM-BOT-COM-001**: The system shall implement the committee flow (parallel opinions, optional reviews, chairman synthesis) with the same concurrency and SSE sequencing as today, using SimpleBot streams per leg **without** introducing PocketFlow or another graph engine in this migration.
