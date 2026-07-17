# Agent Loop EARS Specifications

**Feature:** Agentic Mode — Agent Loop
**Parent:** [Agentic Mode LLD](./LLD.md)

> **⚠️ UPDATED 2026-07-16:** Specs referencing `link_from` and the ref system for
> synthesis notes are **superseded**. Synthesis notes now auto-link to the search
> node as a child (GENERATES edge). See AGENTS.md (2026-07-16) for details.

## Related Documents

- [Agentic Mode LLD](./LLD.md)
- [High-Level Design Section 14](../../high-level-design.md#14-agentic-mode)

---

## AGENT-REQ-001: Agent mode activation

**Type:** Ubiquitous
**Summary:** The system SHALL provide an `/agent` slash command that activates agentic mode.

When the user invokes `/agent <message>`, the system SHALL:

1. Create an AI node (streaming placeholder, initially unconnected)
2. Start the agent loop by sending the message + viewport context + tool definitions to the `/api/agent` endpoint
3. The agent node SHALL NOT have a corresponding HUMAN node — the agent IS the response

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

---

## AGENT-REQ-009: Parent routing

**Type:** Ubiquitous
**Summary:** The agent SHALL automatically determine which existing canvas nodes are relevant context and link from them.

When the agent loop starts, the backend SHALL:

1. Extract the user's message and viewport context (node IDs, types, titles)
2. Perform a fast LLM routing call that selects at most 5 relevant parent node IDs
3. Emit a `set_parents` SSE event with the chosen node IDs
4. The frontend SHALL create REPLY edges (1 parent) or MERGE edges (multiple parents) from those nodes to the agent node
5. If no nodes are relevant, the agent node SHALL remain unconnected

**The routing call SHALL:**

- Use `run_structured_string_list` with temperature 0.1 for deterministic results
- Complete before the main agent loop starts (adds ~1-2s latency)
- Gracefully fall back to no parents on any error

**Location:** `src/canvas_chat/app.py` — `_agent_route_parents()`, agent endpoint `generate()`; `src/canvas_chat/static/js/plugins/agent.js` — `set_parents` handler

---

## AGENT-REQ-010: Agent mimics human behavior

**Type:** Ubiquitous
**Summary:** The agent SHALL reuse existing feature implementations and let the LLM control graph structure via the ref system.

For every tool that corresponds to an existing user-facing feature, the agent SHALL produce the same canvas artifacts (nodes, edges, data structures) that the feature produces when a human user invokes it directly:

1. **Search** — `search_web` SHALL create SEARCH node + REFERENCE nodes + SEARCH_RESULT edges, identical to `/search`. Results MUST include URLs as markdown links. Each node gets a ref label. See TOOL-REQ-002.
2. **Code** — `execute_code` SHALL create CODE nodes identical to `/code`. See TOOL-REQ-001.
3. **Notes** — `create_note` SHALL create NOTE nodes. The LLM controls which nodes the note links from via the `link_from` parameter (ref labels), creating MERGE edges. See TOOL-REQ-004, TOOL-REQ-006.
4. **Graph structure** — The LLM decides which search results are relevant and explicitly specifies them in `link_from`. The frontend MUST NOT auto-link notes to all results. See TOOL-REQ-006.

**The agent MUST NOT introduce new node types, edge types, data formats, or API endpoints for operations that already exist.** The agent is an orchestrator that calls existing features in sequence, not a separate system.

**Rationale:** Separate pipelines drift from user-facing behavior (missing URLs, different node structures, lost metadata). Auto-linking forces a linear chain that doesn't match human canvas usage. The ref system lets the LLM choose its sources, just like a human selects nodes before replying.

**Location:** `src/canvas_chat/static/js/plugins/agent.js` — `AgentFeature`; `src/canvas_chat/app.py` — `_agent_execute_tool()`
