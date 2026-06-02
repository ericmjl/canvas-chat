# Agent Loop EARS Specifications

**Feature:** Agentic Mode — Agent Loop
**Parent:** [Agentic Mode LLD](./LLD.md)

## Related Documents

- [Agentic Mode LLD](./LLD.md)
- [High-Level Design Section 14](../../high-level-design.md#14-agentic-mode)

---

## AGENT-REQ-001: Agent mode activation

**Type:** Ubiquitous
**Summary:** The system SHALL provide an `/agent` slash command that activates agentic mode.

When the user invokes `/agent <message>`, the system SHALL:

1. Create a HUMAN node with the user's message
2. Create an AI node (streaming placeholder)
3. Start the agent loop by sending the message + viewport context + tool definitions to the `/api/agent` endpoint

**Location:** `src/canvas_chat/static/js/plugins/agent.js` — `AgentFeature.handleCommand()`

---

## AGENT-REQ-002: Agent loop iteration limit

**Type:** State-driven
**Summary:** The system SHALL limit the agent to a maximum of 10 tool calls per user message.

While the agent loop is running, if the number of tool calls exceeds 10, the system SHALL stop the loop, stream a message to the agent node indicating the limit was reached, and end the turn.

**Location:** `src/canvas_chat/app.py` — `/api/agent` endpoint

---

## AGENT-REQ-003: Streaming agent response

**Type:** Ubiquitous
**Summary:** The agent's final text response SHALL stream to the AI node in real-time via SSE.

The system SHALL emit `text` SSE events for each chunk of the agent's final response, and the frontend SHALL update the AI node content in real-time as chunks arrive, identical to the existing streaming chat behavior.

**Location:** `src/canvas_chat/app.py` — `/api/agent` endpoint; `src/canvas_chat/static/js/plugins/agent.js` — `handleSSEEvent()`

---

## AGENT-REQ-004: Tool progress visibility

**Type:** Event-driven
**Summary:** When the agent invokes a tool, the system SHALL show progress in the AI node.

When a `tool_start` SSE event is received, the frontend SHALL append an inline status indicator to the AI node content (e.g., "Running code...", "Searching web for 'query'..."). When `tool_result` is received, the indicator SHALL be replaced with a brief result summary or removed.

**Location:** `src/canvas_chat/static/js/plugins/agent.js` — `handleSSEEvent()`

---

## AGENT-REQ-005: Node creation from tools

**Type:** Event-driven
**Summary:** When the agent creates output (code, notes, images), the system SHALL create canvas nodes.

When a `node_create` SSE event is received, the frontend SHALL:

1. Create a node of the specified type at a position below the agent node
2. Add a REPLY edge from the agent node to the new node
3. Populate the node with the provided content (code, note text, image URL)
4. Focus the viewport on the new node

**Location:** `src/canvas_chat/static/js/plugins/agent.js` — `createNodeFromInstruction()`

---

## AGENT-REQ-006: Viewport context gathering

**Type:** Ubiquitous
**Summary:** The system SHALL include visible canvas nodes as context for each agent request.

When the agent loop starts, the frontend SHALL gather all nodes whose bounding boxes intersect the current viewport and serialize them as context. Each node's content SHALL be truncated to 2000 characters. The context SHALL be sent as the `viewport_context` field in the agent request.

**Location:** `src/canvas_chat/static/js/plugins/agent.js` — `gatherViewportContext()`

---

## AGENT-REQ-007: Tool calling fallback

**Type:** Exception-driven
**Summary:** If the selected model does not support tool calling, the system SHALL fall back to regular streaming.

When the `/api/agent` endpoint detects that the model does not support function/tool calling (via `litellm.supports_function_calling()`), the endpoint SHALL process the request as a regular streaming chat response without tools, identical to `/api/chat`.

**Location:** `src/canvas_chat/app.py` — `/api/agent` endpoint

---

## AGENT-REQ-008: Agent stop control

**Type:** State-driven
**Summary:** The user SHALL be able to stop an active agent loop at any time.

While the agent loop is running, the AI node SHALL display a Stop button. When the user clicks Stop, the frontend SHALL abort the SSE connection. Any partially created nodes remain on the canvas. The agent node content is preserved up to the point of interruption.

**Location:** `src/canvas_chat/static/js/plugins/agent.js` — uses `StreamingManager` for stop button
