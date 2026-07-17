# Agentic Mode — Low-Level Design

**Feature:** Agentic Mode (tool-using agent loop)
**Status:** Draft
**Created:** 2026-06-02
**Parent:** [High-Level Design](../../high-level-design.md) (Section 14)

> **⚠️ MAJOR REWRITE 2026-07-16:** The agent loop has moved from the **backend**
> (Python ReAct loop with SSE events) to the **frontend** (JavaScript loop calling
> the same feature handlers as slash commands). The backend is now a stateless LLM
> proxy (`/api/agent/completion`). This eliminates the structural decoupling that
> caused display-model drift (agent search fan-out vs `/search` carousel). All
> earlier sections describing the backend ReAct loop, `AGENT_TOOLS`,
> `_agent_execute_tool`, SSE `node_create` events, and the ref/link_from system are
> **superseded** by the architecture below. See AGENTS.md (2026-07-16 entries) for
> the full rationale.

## Related Documents

- [HLD Section 14: Agentic Mode](../../high-level-design.md#14-agentic-mode)
- [Agent Loop EARS](./agent-loop-EARS.md)
- [Tool System EARS](./tool-system-EARS.md)
- [Plotly Integration EARS](./plotly-integration-EARS.md)
- [Realtime Voice Agent LLD](../realtime-voice-agent/LLD.md) — Voice input + WebSocket transport extending this agent loop

## 1. Overview

Agentic mode replaces the single-turn "user types → one AI node streams back" flow
with a ReAct-style agent loop. The LLM receives tool definitions (auto-generated
from the feature registry's slash commands), calls tools as needed, and the system
executes them and feeds results back until the LLM produces a final response.

### Architecture: Frontend Loop + Stateless Backend Proxy

The agent loop runs **in JavaScript** (`agent.js`). The backend is a stateless LLM
proxy that makes a single `litellm.acompletion` call per iteration and streams the
response back. Tools are dispatched to the **same feature handlers** that slash
commands use (`featureRegistry.handleSlashCommand`), eliminating parallel
implementations.

```text
┌──────────────── FRONTEND (agent.js) ──────────────────┐
│                                                        │
│  1. Build tools from featureRegistry                   │
│     .getSlashCommandsWithMetadata()                    │
│                                                        │
│  2. POST /api/agent/completion                         │
│     (messages + tools → LLM proxy)                     │
│                                                        │
│  3. Process streamed response:                         │
│     ├─ Text → stream into AI node                      │
│     └─ Tool calls → dispatch to feature handlers:      │
│         search → research.handleSearch()               │
│         code → code.handleCommand()                    │
│         committee → committee.handleCommittee()        │
│         ...etc (same code as slash commands)            │
│                                                        │
│  4. Append tool result to messages, loop to step 2     │
│                                                        │
│  5. When model calls `respond` or returns final text:  │
│     → finalize AI node, link to context nodes           │
│                                                        │
└────────────────────────────────────────────────────────┘
          │
          ▼  (stateless proxy, no tool logic)
┌──────────────── BACKEND (app.py) ─────────────────────┐
│  POST /api/agent/completion                            │
│  → litellm.acompletion(model, messages, tools, stream) │
│  → stream text deltas + tool calls back                │
│  → does NOT execute tools                              │
└────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Every slash command is a tool.** Tools are auto-generated from
   `featureRegistry.getSlashCommandsWithMetadata()`. When the agent calls `search`,
   the frontend dispatches to `research.handleSearch()` — the exact same code path
   as the user typing `/search`. No parallel implementations.

2. **The model decides when to stop.** Standard ReAct: the loop continues while
   the model returns tool calls. It stops when the model calls `respond` or returns
   final text. `MAX_TOOL_CALLS` (30) is a safety net, not the primary mechanism.

3. **The `respond` tool is the synthesis mechanism.** When the model calls
   `respond(content="...", context_nodes=["node-1", "node-3"])`, the frontend
   creates an AI node with the content and links it to the specified context nodes.
   If the model returns final text without calling `respond`, the text goes into
   the agent node as a fallback.

4. **Agent tools carry display DATA, not display DECISIONS.** Because tools
   dispatch to the same feature handlers as slash commands, display changes
   propagate automatically. There is no backend tool layer to drift.

### Design Principle: Agent Mimics Human Behavior

**The agent MUST NOT define its own parallel pipelines for operations that already exist as user-facing features.** Instead, the agent orchestrates the exact same steps a human user would perform manually:

1. **Reuse existing node types and creation flows** — When the agent searches, it creates the same SEARCH node + REFERENCE nodes + SEARCH_RESULT edges that `/search` produces. When the agent runs code, it creates the same CODE node that `/code` produces. No special "agent-only" node variants.

2. **Reuse existing APIs** — The agent calls the same backend endpoints (`/api/ddg/search`, `/api/exa/search`) that the existing features use, not custom agent-only endpoints that duplicate functionality.

3. **Compose multi-step workflows** — After search, the agent selects all reference nodes, reads them, then creates a summary — just as a human would. The agent is an orchestrator, not a separate system.

4. **Preserve data fidelity** — Search results include full URLs (as markdown links), publication dates, and all metadata. The agent must not strip or lose information that the normal flow provides.

**Why:** If the agent has its own search implementation, it drifts from the user-facing behavior. Bugs get fixed in one path but not the other. Features (URLs, reference nodes, edge types) are missing from the agent path. By making the agent reuse the exact same code paths, any improvement to the base feature automatically benefits the agent.

**Key components:**

1. **AgentFeature** (`plugins/agent.js`) — Frontend plugin implementing FeaturePlugin with `/agent` slash command. Owns the ReAct loop, tool building, tool execution, and synthesis.
2. **Backend `/api/agent/completion`** (`app.py`) — Stateless LLM proxy. Takes messages + tools, makes one `litellm.acompletion` call with streaming, accumulates tool-call chunks, streams text deltas + tool calls back via SSE. Does NOT execute tools.
3. **Tool building** (`buildAgentTools()`) — Auto-generates tools from `featureRegistry.getSlashCommandsWithMetadata()` (features with `getSlashCommands()`) plus `BUILTIN_SLASH_COMMANDS` (search, research, committee, factcheck). Excludes `/agent`, `/code`, `/matrix`, `/fetch`, `/git`, `/youtube`. Adds custom `code` tool (auto-executes Python, returns stdout) and `respond` tool (synthesis).
4. **Tool execution** (`executeAgentTool()`) — Dispatches to `featureRegistry.handleSlashCommand()` — the **same code path** as the user typing the slash command. Tracks newly created nodes via before/after diffing. Extracts result content from the node (searchResults, outputStdout, or content).
5. **Search enrichment** (`enrichSearchResults()`) — After a search, auto-fetches the top 2 results' full page content via `fetchUrlContent` (6000 chars each). Gives the LLM rich data instead of ~50-word snippets, preventing excessive re-searching.
6. **Synthesis** (`createSynthesis()` / `respond` tool) — Creates a NEW AI node as a child of the specified tool nodes (via `createLinkedNode`). The agent "thinking" node shows inter-tool reasoning; the synthesis node has the final answer. If the model returns text without calling `respond`, the thinking node IS the synthesis (fallback).
7. **Thinking-token stripping** (`stripThinking()`) — Removes `<think>...</think>` tags (reasoning models like Qwen) and markdown code fences (` ```python ... ``` `) from both streamed text and code before execution.
8. **Canvas context** — When replying to nodes, the agent includes parent node content + code in the user message so it knows what "redo this" refers to.
9. **Agent log** — Side drawer "Agent Log" tab shows tool calls, results, errors, and synthesis during agent runs. Copyable for auditing.
10. **Rate-limit retry** — Backend retries up to 3 times on `RateLimitError` with progressive backoff (5s, 10s, 15s).
11. **Legacy backend** (`/api/agent` SSE endpoint, `AGENT_TOOLS`, `_agent_execute_tool`) — Kept only for `realtime-agent.js` WebSocket compat. Not used by the text agent.

**Edge semantics:** Edges are created ONLY via `createLinkedNode` (parent → child). The agent never calls `graph.addEdge` directly. Bidirectional edges are impossible by construction.

## 2. Architecture

### 2.1 Agent Loop Flow

```text
User types message
        │
        ▼
AgentFeature.handleCommand('/agent', args)
        │
        ├── Create agent node on canvas (no HUMAN node)
        ├── Gather viewport context (visible nodes → serialized text)
        │
        └── POST /api/agent (SSE stream)
                │
                ├── Parent routing: fast LLM call picks relevant
                │   canvas nodes from viewport context
                │       │
                │       └── Send SSE event: set_parents [nodeIds]
                │           (frontend creates REPLY/MERGE edges)
                │
                ├── Main LLM call with tools + viewport context
                │       │
                │       ├── LLM returns text → stream to agent node (done)
                │       │
                │       └── LLM returns tool_calls → for each:
                │               │
                │               ├── Send SSE event: { type: "tool_start", tool, call_id }
                │               ├── Execute tool (backend)
                │               ├── Send SSE event: { type: "node_create", ... }
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
            "description": "Create a note node on the canvas with text content. Use link_from to specify which search result refs this note synthesizes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "link_from": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Refs of search results to link from (e.g. ['ref-0', 'ref-2']). Creates merge edges."
                    }
                },
                "required": ["content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for information. Returns results with ref labels (ref-0, ref-1, ...).",
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

### 2.4 Ref System: LLM-Controlled Graph Structure

The agent controls the graph topology through a **ref system**. The backend assigns stable ref labels to nodes it creates, exposes them in the tool_result text, and the LLM uses them in subsequent tool calls to specify edge relationships.

**Why refs instead of auto-linking:** Hardcoded sequential linking (each new node links to the previous) forces a linear chain that doesn't match how a human uses the canvas. A human selects specific nodes to reply from. The ref system lets the LLM do the same — it reads search results, decides which are relevant, and explicitly says "this note synthesizes from ref-0 and ref-3."

**Flow:**

```text
1. LLM calls search_web("query")
2. Backend creates search + reference nodes, assigns refs:
   node_create: { type: "search", ref: "search-latest", ... }
   node_create: { type: "reference", ref: "ref-0", ... }
   node_create: { type: "reference", ref: "ref-1", ... }
   node_create: { type: "reference", ref: "ref-2", ... }
3. Tool result text includes ref labels:
   [ref-0] Title...
   [ref-1] Title...
   [ref-2] Title...
4. LLM reads results, decides ref-0 and ref-2 are relevant
5. LLM calls create_note(link_from=["ref-0", "ref-2"])
6. Backend emits node_create with link_from_refs:
   node_create: { type: "note", link_from_refs: ["ref-0", "ref-2"], ... }
7. Frontend resolves refs → node IDs, creates MERGE edges
```

**Frontend mapping:** The frontend maintains a `Map<ref, nodeId>` (`refToNodeId`). When a `node_create` event arrives with a `ref`, it's stored. When a `link_from_refs` array is present, the frontend resolves each ref to a node ID and creates MERGE edges. If no refs resolve (e.g., the LLM hallucinated a ref), it falls back to a single GENERATES edge from the default parent.

**Ref stability:** Refs are scoped to the current agent session. The `search-latest` ref is reused for each search (overwrites). Individual result refs (`ref-0`, `ref-1`, ...) are cumulative across searches within a session.

### 2.5 Parent Routing

Before the main agent loop starts, the backend performs a **parent routing** step that determines which existing canvas nodes the agent node should link from. This replaces the old pattern of requiring the user to manually select nodes or always creating a disconnected HUMAN node.

**Why no HUMAN node:** In `/agent` mode, the agent IS the response. Creating a separate HUMAN node adds visual clutter. Instead, the agent node itself links directly to relevant canvas nodes — just like a human user would select nodes and type a reply.

**Routing flow:**

```text
1. Frontend creates agent node (unconnected, "Working...")
2. Frontend sends viewport context + user message to /api/agent
3. Backend runs _agent_route_parents():
   - Fast LLM call with the user's message + viewport node list
   - System prompt: "Which of these nodes are relevant context?"
   - Returns JSON array of node IDs (or empty array)
4. Backend emits set_parents SSE event with the chosen IDs
5. Frontend receives set_parents:
   - Creates REPLY edge (1 parent) or MERGE edges (multiple parents)
   - If empty array or routing fails: agent node stays unconnected
6. Main agent loop proceeds normally
```

**Routing parameters:**

- Uses `run_structured_string_list` with temperature 0.1 (deterministic)
- Max 5 parent nodes
- Falls back to empty list on any error (agent starts unconnected)

**Location:** `src/canvas_chat/app.py` — `_agent_route_parents()`, agent endpoint `generate()`

### 2.6 SSE Event Protocol

The `/api/agent` endpoint emits these SSE events:

```text
event: set_parents   data: ["node-id-1", "node-id-2"]       # Parent routing (first event)
event: text          data: "chunk of response text"          # Streaming final text
event: tool_start    data: {"tool": "execute_code", "call_id": "...", "purpose": "..."}
event: tool_result   data: {"call_id": "...", "output": "...", "images": [...], "nodes": [...]}
event: node_create   data: {"type": "search", "ref": "search-latest", "title": "...", "content": "..."}
event: node_create   data: {"type": "reference", "ref": "ref-0", "title": "...", "content": "..."}
event: node_create   data: {"type": "note", "title": "...", "content": "...", "link_from_refs": ["ref-0", "ref-2"]}
event: node_create   data: {"type": "code", "title": "...", "code": "..."}
event: node_create   data: {"type": "image", "image_url": "..."}
event: done          data: ""
event: error         data: "error message"
```

### 2.7 Viewport Context Gathering

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

### 3.3 HTML node for Plotly output

Plotly figures require `<script>` tag execution (for `plotly.js`), which `innerHTML` does not support. A dedicated `html` node type renders content via a sandboxed iframe with `srcdoc`:

- **NodeType:** `html` (registered in `graph-types.js`)
- **Protocol:** `HtmlNode` (`plugins/html-node.js`) — renders `<iframe sandbox="allow-scripts allow-same-origin" srcdoc="...">`
- **Created by:** `code.js` and `agent.js` when `fig.type === 'plotly'`
- **Not editable:** `isContentEditable()` returns `false` (HTML source is programmatic)
- **Same node size:** 640×480 (matches IMAGE and NOTE defaults)

This replaces the previous approach of storing Plotly HTML in NOTE nodes, which rendered raw HTML as text.

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
