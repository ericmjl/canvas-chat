# Tool System EARS Specifications

**Feature:** Agentic Mode — Tool System
**Parent:** [Agentic Mode LLD](./LLD.md)

> **⚠️ UPDATED 2026-07-16:** Specs referencing `ref-N` labels, `link_from`, and
> `link_from_refs` (TOOL-REQ-004, TOOL-REQ-006) are **superseded**. Agent search
> now attaches `search_results` JSON to the SEARCH node instruction (carousel model,
> matching `/search`). The `create_note` tool no longer accepts `link_from`. See
> AGENTS.md (2026-07-16) for details.

## Related Documents

- [Agentic Mode LLD](./LLD.md)
- [Agent Loop EARS](./agent-loop-EARS.md)

---

## TOOL-REQ-001: Code execution tool

**Type:** Ubiquitous
**Summary:** The agent SHALL have access to an `execute_code` tool that runs Python and returns output.

When the agent calls `execute_code`, the system SHALL:

1. Run the provided Python code using Pyodide (frontend execution)
2. Return stdout, result text/HTML, and any generated figures
3. If figures are produced, include them as `node_create` events so the frontend can render them
4. If an error occurs, return the error message as a tool result error

**Note:** Code execution happens on the frontend via Pyodide. The backend sends the code as a `tool_start` event, the frontend executes it and returns the result via a callback, and the backend feeds the result back to the LLM.

**Revised:** For simplicity, code execution runs server-side using a subprocess or the existing code handler. Plotly figures are captured as HTML and returned inline.

**Location:** `src/canvas_chat/app.py` — agent tool handler; `src/canvas_chat/plugins/code_handler.py`

---

## TOOL-REQ-002: Web search tool

**Type:** Ubiquitous
**Summary:** The agent SHALL have access to a `search_web` tool that produces the same node structure as `/search` and exposes ref labels for the LLM.

When the agent calls `search_web`, the system SHALL:

1. Execute a web search using the same DDGS library as `/api/ddg/search`
2. Create a SEARCH node on the canvas (identical to `ResearchFeature.handleSearch()`)
3. Create REFERENCE nodes for each result with full markdown: `**[title](url)**\n\nsnippet` (including URLs as clickable links)
4. Create SEARCH_RESULT edges from the search node to each reference node
5. Assign stable ref labels to each node (`ref: "search-latest"` for search, `ref: "ref-0"`, `ref: "ref-1"`, ... for references)
6. Return the structured results to the LLM as a tool result with ref labels in the text (e.g., `[ref-0] Title\n  URL: ...\n  Snippet...`)

**The search tool MUST NOT:**

- Strip URLs from results
- Dump all results as plain text into a single node
- Create a different node structure than what `/search` produces
- Use a separate search endpoint that duplicates the existing search logic

**Location:** `src/canvas_chat/app.py` — `_agent_execute_tool()` for `search_web`, `_agent_search_web()`; `src/canvas_chat/static/js/plugins/research.js` — `handleSearch()` (reference implementation)

---

## TOOL-REQ-003: Image generation tool

**Type:** Ubiquitous
**Summary:** The agent SHALL have access to a `generate_image` tool.

When the agent calls `generate_image`, the system SHALL:

1. Generate an image using DALL-E (via litellm)
2. Emit a `node_create` SSE event with the image URL so the frontend creates an image node

**Location:** `src/canvas_chat/app.py` — agent tool handler

---

## TOOL-REQ-004: Note creation tool

**Type:** Ubiquitous
**Summary:** The agent SHALL have access to a `create_note` tool that supports LLM-controlled graph linking via refs.

When the agent calls `create_note`, the system SHALL:

1. Emit a `node_create` SSE event with type `note`, the provided title and content
2. If the `link_from` parameter is provided (array of ref labels), include `link_from_refs` in the `node_create` event
3. The frontend SHALL resolve ref labels to node IDs using the `refToNodeId` map and create MERGE edges from each resolved node
4. If no refs resolve, fall back to a single GENERATES edge from the default parent

**The LLM controls the graph structure.** The frontend MUST NOT auto-link notes to all search results. The LLM reads the tool_result, decides which results are relevant, and explicitly specifies them via `link_from`.

**Location:** `src/canvas_chat/app.py` — `_agent_execute_tool()` for `create_note`; `src/canvas_chat/static/js/plugins/agent.js` — `createNodeFromInstruction()`

---

## TOOL-REQ-005: Tool definitions sent to LLM

**Type:** Ubiquitous
**Summary:** The system SHALL send standard OpenAI-format tool definitions with each agent LLM call.

The tools SHALL be: `execute_code`, `search_web`, `generate_image`, `create_note`. Each tool definition follows the OpenAI function calling format with `name`, `description`, and `parameters` JSON Schema. The `create_note` tool SHALL include an optional `link_from` parameter (array of strings) for specifying ref labels.

**Location:** `src/canvas_chat/app.py` — `AGENT_TOOLS` constant

---

## TOOL-REQ-006: Ref system for LLM-controlled graph structure

**Type:** Ubiquitous
**Summary:** The system SHALL use a ref system so the LLM can control which nodes link to which.

The ref system SHALL:

1. Assign a `ref` field to each `node_create` SSE event (e.g., `"search-latest"`, `"ref-0"`, `"ref-1"`)
2. Expose ref labels in the tool_result text so the LLM can reference specific results (e.g., `[ref-0] Title\n  URL: ...\n  Snippet...`)
3. The `create_note` tool accepts an optional `link_from` parameter (array of ref strings)
4. The frontend maintains a `Map<ref, nodeId>` (`refToNodeId`) to resolve refs to actual canvas node IDs
5. When a `node_create` event contains `link_from_refs`, the frontend creates MERGE edges from each resolved ref's node

**Fallback:** If `link_from_refs` contains refs that don't resolve (e.g., the LLM hallucinated a ref), the frontend SHALL fall back to a single GENERATES edge from the default parent node.

**Location:** `src/canvas_chat/app.py` — `_agent_execute_tool()`, AGENT_SYSTEM_PROMPT; `src/canvas_chat/static/js/plugins/agent.js` — SSE event handler, `createNodeFromInstruction()`
