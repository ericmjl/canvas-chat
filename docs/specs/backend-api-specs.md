# Backend API Specifications

**Created**: 2026-03-16
**Status**: Active
**HLD**: [High-Level Design](../high-level-design.md)

## Chat API

### [x] API-REQ-001: POST /api/chat

**Location**: `app.py`

The system MUST provide a `/api/chat` endpoint that accepts POST requests with messages, model, and API key. The endpoint MUST return an SSE stream of the LLM response.

**Request:**

```json
{
    "messages": [{ "role": "user", "content": "Hello" }],
    "model": "openai/gpt-4o",
    "api_key": "sk-...",
    "temperature": 0.3
}
```

**Response:** Server-Sent Events stream with `content` events.

### [x] API-REQ-002: POST /api/summarize

**Location**: `app.py`

The system MUST provide a `/api/summarize` endpoint that accepts conversation messages and returns a summary.

### [x] API-REQ-003: POST /api/committee

**Location**: `app.py`

The system MUST provide a `/api/committee` endpoint that accepts multiple model configurations and returns parallel responses from each model.

## Search API

### [x] API-REQ-004: POST /api/exa/search

**Location**: `app.py`

The system MUST provide an `/api/exa/search` endpoint that accepts a query and returns search results from Exa API.

### [x] API-REQ-005: POST /api/exa/research

**Location**: `app.py`

The system MUST provide an `/api/exa/research` endpoint that performs deep research, streaming results as they are generated.

### [x] API-REQ-006: POST /api/exa/get-contents

**Location**: `app.py`

The system MUST provide an `/api/exa/get-contents` endpoint that fetches and extracts content from URLs.

### [x] API-REQ-007: POST /api/ddg/search

**Location**: `ddg_endpoints.py`

The system MUST provide a `/api/ddg/search` endpoint as a fallback when Exa is unavailable.

### [x] API-REQ-008: POST /api/ddg/research

**Location**: `ddg_endpoints.py`

The system MUST provide a `/api/ddg/research` endpoint as a fallback for deep research.

## File Processing API

### [x] API-REQ-009: POST /api/upload-file

**Location**: `app.py`

The system MUST provide an `/api/upload-file` endpoint that accepts file uploads and routes to appropriate handlers based on file type.

### [x] API-REQ-010: POST /api/pptx/upload

**Location**: `pptx_endpoints.py`

The system MUST provide an `/api/pptx/upload` endpoint for PowerPoint file processing with slide-by-slide streaming.

### [x] API-REQ-011: POST /api/pptx/caption

**Location**: `pptx_endpoints.py`

The system MUST provide an `/api/pptx/caption` endpoint to generate captions for slides using the LLM.

### [x] API-REQ-012: POST /api/pptx/narrate

**Location**: `pptx_endpoints.py`

The system MUST provide an `/api/pptx/narrate` endpoint to generate narrative summaries for presentations.

## Code Generation API

### [x] API-REQ-013: POST /api/generate-code

**Location**: `code_handler.py`

The system MUST provide a `/api/generate-code` endpoint that generates Python code based on user prompt and context.

### [x] API-REQ-014: POST /api/matrix/fill

**Location**: `matrix_handler.py`

The system MUST provide an `/api/matrix/fill` endpoint to fill matrix cells using the LLM with provided context.

## Image Generation API

### [x] API-REQ-015: POST /api/generate-image

**Location**: `app.py`

The system MUST provide a `/api/generate-image` endpoint that generates images using DALL-E, Gemini, or Ollama.

## Utility API

### [x] API-REQ-016: POST /api/refine-query

**Location**: `app.py`

The system MUST provide a `/api/refine-query` endpoint that refines ambiguous queries using context from the graph.

### [x] API-REQ-017: GET /api/models

**Location**: `app.py`

The system MUST provide an `/api/models` endpoint that returns available models from configured providers.

## WebSocket API

### [x] API-REQ-018: WS /signal

**Location**: `app.py`

The system MUST provide a WebSocket `/signal` endpoint for WebRTC peer connection signaling (optional multiplayer).

## Admin Mode

### [x] API-REQ-019: Server-Side Keys

**Location**: `config.py`

When admin mode is enabled, the system MUST use API keys from the config file instead of requiring keys from the client.

### [x] API-REQ-020: Hide Settings

**Location**: `app.py`, `index.html`

When admin mode is enabled, the system MUST hide API key settings in the frontend.

## Status Key

- `[ ]` Active requirement
- `[x]` Implemented requirement
- `[D]` Deferred requirement
