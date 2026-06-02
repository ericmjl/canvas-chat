# Tool System EARS Specifications

**Feature:** Agentic Mode — Tool System
**Parent:** [Agentic Mode LLD](./LLD.md)

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
**Summary:** The agent SHALL have access to a `search_web` tool.

When the agent calls `search_web`, the system SHALL:

1. Execute a web search using DDG or Exa (whichever is configured)
2. Return the top results as structured text (title, URL, snippet)
3. Results are returned as a tool result, not as a node

**Location:** `src/canvas_chat/app.py` — agent tool handler; `src/canvas_chat/plugins/ddg_endpoints.py`

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
**Summary:** The agent SHALL have access to a `create_note` tool.

When the agent calls `create_note`, the system SHALL emit a `node_create` SSE event with type `note`, the provided title and content, and the agent node as parent. The frontend creates the note node on the canvas.

**Location:** `src/canvas_chat/app.py` — agent tool handler

---

## TOOL-REQ-005: Tool definitions sent to LLM

**Type:** Ubiquitous
**Summary:** The system SHALL send standard OpenAI-format tool definitions with each agent LLM call.

The tools SHALL be: `execute_code`, `search_web`, `generate_image`, `create_note`. Each tool definition follows the OpenAI function calling format with `name`, `description`, and `parameters` JSON Schema.

**Location:** `src/canvas_chat/app.py` — `AGENT_TOOLS` constant
