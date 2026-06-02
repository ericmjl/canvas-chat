# Agentic Mode — Low-Level Design

**Feature:** Agentic Mode (tool-using agent loop)
**Status:** Draft
**Created:** 2026-06-02
**Parent:** [High-Level Design](../../high-level-design.md) (Section 14)

## Related Documents

- [HLD Section 14: Agentic Mode](../../high-level-design.md#14-agentic-mode)
- [Agent Loop EARS](./agent-loop-EARS.md)
- [Tool System EARS](./tool-system-EARS.md)
- [Plotly Integration EARS](./plotly-integration-EARS.md)

## 1. Overview

Agentic mode replaces the single-turn "user types → one AI node streams back" flow with a ReAct-style agent loop. The LLM receives tool definitions, calls tools as needed, and the system executes them and feeds results back until the LLM produces a final text response.

**Key components:**

1. **AgentFeature** — Frontend plugin (`plugins/agent.js`) implementing FeaturePlugin with `/agent` slash command
2. **Backend `/api/agent` endpoint** — Handles tool-calling loop with LLM, returns streaming SSE events
3. **Viewport context gatherer** — Serializes visible nodes into the agent's context
4. **Plotly integration** — Updated Pyodide setup code for Plotly default

## 2. Architecture

### 2.1 Agent Loop Flow

```text
User types message
        │
        ▼
AgentFeature.handleCommand('/agent', args)
        │
        ├── Gather viewport context (visible nodes → serialized text)
        ├── Create human node on canvas
        ├── Create agent node (streaming placeholder)
        │
        └── POST /api/agent (SSE stream)
                │
                ├── LLM call with tools + viewport context
                │       │
                │       ├── LLM returns text → stream to agent node (done)
                │       │
                │       └── LLM returns tool_calls → for each:
                │               │
                │               ├── Send SSE event: { type: "tool_start", tool, call_id }
                │               ├── Execute tool (frontend or backend)
                │               ├── Send SSE event: { type: "tool_result", call_id, result }
                │               └── Feed result back to LLM → repeat loop
                │
                └── LLM returns final text → stream to agent node (done)
```

### 2.2 Backend vs Frontend Tool Execution

**Backend-executed tools** (in the `/api/agent` SSE loop):

- `execute_code` — Runs Python via Pyodide (frontend JS execution, result sent back)
- `search_web` — Uses existing DDG/Exa search
- `generate_image` — Uses existing image generation pipeline

**Frontend-executed tools** (AgentFeature handles via SSE events):

- `read_node` — Reads node content from graph
- `create_note` — Creates a note node on canvas
- `create_code` — Creates a code node on canvas

Actually, for simplicity and to avoid complex coordination, **all tool execution happens on the backend**. The frontend only handles node creation events sent via SSE.

**Revised approach:** The backend `/api/agent` endpoint runs the full agent loop:

1. Receives viewport context + user message + tool definitions
2. Calls LLM with tool definitions
3. If tool_calls returned, executes tools server-side, feeds results back
4. Repeats until LLM returns final text
5. Streams SSE events for: tool progress, node creation commands, final text

The frontend AgentFeature listens to SSE events and creates/updates nodes on the canvas in real-time.

### 2.3 Backend Tool Definitions

```python
AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "execute_code",
            "description": "Execute Python code and return output. Use for data analysis, calculations, plotting.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"},
                    "purpose": {"type": "string", "description": "What this code does (shown to user)"}
                },
                "required": ["code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": "Create a note node on the canvas with text content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "Generate an image from a text description.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "Image description"},
                    "size": {"type": "string", "enum": ["1024x1024", "512x512"], "default": "1024x1024"}
                },
                "required": ["prompt"]
            }
        }
    }
]
```

### 2.4 SSE Event Protocol

The `/api/agent` endpoint emits these SSE events:

```text
event: text          data: "chunk of response text"     # Streaming final text
event: tool_start    data: {"tool": "execute_code", "call_id": "...", "purpose": "..."}
event: tool_result   data: {"call_id": "...", "output": "...", "images": [...], "nodes": [...]}
event: node_create   data: {"type": "code", "title": "...", "code": "...", "output": "...", "parent_id": "..."}
event: node_create   data: {"type": "note", "title": "...", "content": "...", "parent_id": "..."}
event: node_create   data: {"type": "image", "image_url": "...", "parent_id": "..."}
event: done          data: ""
event: error         data: "error message"
```

### 2.5 Viewport Context Gathering

The frontend gathers viewport context before each agent request:

```javascript
gatherViewportContext() {
    const viewBox = this.canvas.viewBox;
    const visibleNodes = this.graph.getAllNodes().filter(node => {
        if (!this.graph.isNodeVisible(node.id)) return false;
        const pos = node.position;
        const size = getDefaultNodeSize(node.type);
        return (
            pos.x + size.width > viewBox.x &&
            pos.x < viewBox.x + viewBox.width &&
            pos.y + size.height > viewBox.y &&
            pos.y < viewBox.y + viewBox.height
        );
    });

    return visibleNodes.map(node => ({
        id: node.id,
        type: node.type,
        title: node.title || '',
        content: (node.content || '').substring(0, 2000),
    }));
}
```

Context is truncated per-node to stay within token budgets. The agent's system prompt instructs it to reference nodes by ID when using tools.

## 3. Plotly Integration

### 3.1 Changes to pyodide-runner.js

Replace matplotlib setup with Plotly in the execution preamble:

```python
# Plotly setup (replaces matplotlib setup)
try:
    import plotly.graph_objects as go
    import plotly.express as px
    import plotly.io as pio

    # Capture Plotly figures
    _figures = []
    _original_show = pio.show

    def _capture_plotly_show(fig, *args, **kwargs):
        import json
        _figures.append({
            'type': 'plotly',
            'html': fig.to_html(include_plotlyjs='cdn', full_html=False)
        })

    pio.show = _capture_plotly_show
except ImportError:
    pass
```

### 3.2 Fallback matplotlib support

If user explicitly imports matplotlib, it still works. The setup code checks for both:

```python
# Matplotlib fallback (still works if explicitly imported)
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    # ... existing capture logic ...
except ImportError:
    pass
```

## 4. Data Models

### 4.1 AgentRequest (backend)

```python
class AgentRequest(BaseModel):
    messages: list[dict]          # Conversation history
    viewport_context: list[dict]  # Visible nodes [{id, type, title, content}]
    model: str
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = 0.7
    max_tokens: int | None = None
```

### 4.2 AgentResponse SSE events

Each SSE event has an `event` type and `data` payload:

- `text` — Streaming text chunk for the main agent node
- `tool_start` — Tool invocation started (shows progress to user)
- `tool_result` — Tool completed with output
- `node_create` — Instruction to create a new node on the canvas
- `done` — Agent loop complete
- `error` — Error occurred

## 5. Frontend: AgentFeature Plugin

### 5.1 Class structure

```javascript
class AgentFeature extends FeaturePlugin {
    getSlashCommands()           // ['/agent']
    handleCommand(command, args) // Activate agent loop
    gatherViewportContext()      // Serialize visible nodes
    handleSSEEvent(event, data)  // Process SSE events from backend
    createNodeFromInstruction()  // Create canvas nodes from SSE node_create events
    isActive()                   // Whether agent mode is active
}
```

### 5.2 Agent mode activation

- `/agent <message>` starts the agent loop with the given message
- The human message appears as a HUMAN node, the agent response as an AI node
- Tool-created nodes (code, notes, images) appear as children of the agent node
- Agent node shows tool progress inline (e.g., "Running code...", "Searching web...")

## 6. Error Handling

- Tool execution errors are fed back to the LLM as tool result errors
- The LLM can retry with different code/approach
- Maximum 10 tool calls per agent turn to prevent infinite loops
- If LLM doesn't support tool calling, fall back to regular streaming (no tools)

## 7. Dependencies

- **llamabot** — Already used for chat; agent endpoint uses `AsyncSimpleBot` with tool calling
- **litellm** — `supports_function_calling()` check, tool call passthrough
- **Existing Pyodide** — Code execution tool uses the same runner
- **Existing search** — Web search tool reuses DDG/Exa endpoints
- **Existing image gen** — Image tool reuses DALL-E pipeline

## 8. Implementation Pitfalls

### 8.1 FeaturePlugin property access

The `FeaturePlugin` base class copies all context properties to `this.*` in its constructor. Plugins must **never** access `this.context.*` — it is `undefined` and causes `TypeError: can't access property "...", this.context is undefined`.

**Correct:**

```javascript
this.modelPicker.value        // ✓ copied by base class
this.buildLLMRequest({})      // ✓ copied by base class
this.canvas.getSelectedNodeIds() // ✓ copied by base class
this.generateNodeSummary(id)  // ✓ copied by base class
```

**Wrong:**

```javascript
this.context.modelPicker.value    // ✗ TypeError: this.context is undefined
this.context.buildLLMRequest({})  // ✗ TypeError: this.context is undefined
```

**Exception:** Use `this._context` only for properties NOT copied by the base class (e.g., `pyodideRunner`):

```javascript
const runner = this._context.pyodideRunner;  // OK — not copied by base
```
