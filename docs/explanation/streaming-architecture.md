# Streaming architecture

This document explains the design decision to use Server-Sent Events (SSE) for LLM response streaming.

## Context

Canvas Chat streams LLM responses token-by-token to the frontend, allowing users to see responses as they're generated rather than waiting for the complete response.

## Decision

We use SSE (Server-Sent Events) for streaming LLM responses from the backend to the frontend.

## Alternatives considered

### Non-streaming (simple POST request)

Wait for the complete LLM response, then display it all at once.

**Advantages:**

- Simplest implementation
- No parsing complexity
- Guaranteed correct content formatting

**Disadvantages:**

- Higher perceived latency (2-5 seconds of waiting before any content appears)
- Poor user experience for long responses

### WebSockets

Bidirectional persistent connection.

**Advantages:**

- More reliable than SSE for some edge cases
- Better binary data support

**Disadvantages:**

- More complex to implement
- Overkill for unidirectional streaming
- Doesn't solve the core parsing challenges

### NDJSON streaming

Each chunk is a complete JSON object on its own line.

**Advantages:**

- Self-describing format
- Clear content boundaries

**Disadvantages:**

- Similar complexity to SSE
- Less browser-native support

## Why SSE

SSE provides the best balance of:

1. **Native browser support** - No additional libraries needed
2. **Unidirectional simplicity** - We only need server-to-client streaming
3. **Automatic reconnection** - Built into the EventSource API
4. **Text-based** - Natural fit for LLM token streams

## Implementation notes

SSE uses CRLF (`\r\n`) line endings per HTTP specification. Our client normalizes these to LF (`\n`) before parsing to ensure consistent handling across platforms.

Multi-line content in SSE is sent as multiple `data:` lines within a single event. Per the SSE specification, the client joins these lines with newlines when reconstructing the content.
