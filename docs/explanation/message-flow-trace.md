# Complete Message Flow Trace

This document traces the complete code flow when a user types text in the ChatBox input field and presses Enter.

## High-Level Overview

```
User Types Message
    ↓
ChatBox Input Event
    ↓
handleSend() in App class (triggers Base Agent)
    ↓
Base Agent Orchestrates
    ├─ Check if slash command (starts with "/")
    │   ├─ YES: Spawn Sub-Agent
    │   │   ├─ Sub-agent receives command
    │   │   ├─ Sub-agent validates against available tools/commands
    │   │   ├─ Sub-agent executes (may create nodes, call LLM, etc.)
    │   │   └─ Sub-agent returns result/artifacts
    │   │
    │   └─ NO: Base Agent Executes (Regular Message)
    │       ├─ Plan: Create Human node with message
    │       ├─ Decide: Which parent nodes to use
    │       ├─ Execute:
    │       │   ├─ Create Human node with message
    │       │   ├─ Create edges from selected nodes
    │       │   ├─ Create AI response node
    │       │   ├─ Build LLM request with context
    │       │   └─ Stream response (onChunk updates, onDone completes)
    │       └─ Store: Update nodes with content (CRDT persistence)
    ↓
Graph updated via CRDT
    ↓
Canvas re-renders nodes/edges
```

## Architecture Pattern: Agent Orchestration

With the base agent refactor, the message flow is now orchestrated by an agent that either:

1. **Handles regular messages directly** - Agent invokes tools to:
    - Create nodes (human, AI)
    - Build graph context
    - Stream LLM responses
    - Store results

2. **Delegates slash commands to sub-agents** - Base agent:
    - Recognizes slash command pattern
    - Determines target sub-agent (by command name)
    - Spawns sub-agent with command and context
    - Waits for sub-agent results
    - Integrates results into graph

**Key Principle:** The canvas is the clock. The DAG is the truth. Agents are reactors, not daemons.

This means:

- App.handleSend() triggers the base agent but doesn't orchestrate directly
- Base agent receives user input as context
- Agent operates on the graph (Yjs CRDT) as the source of truth
- Sub-agents operate within the same graph context (collaborative environment)

## Detailed Message Flow

### 1. User Input Entry Point

**File:** [src/canvas_chat/static/js/index.html](index.html)

```html
<!-- Chat input textarea -->
<textarea id="chat-input" placeholder="Ask anything or type a slash command..." data-autoresize="true"></textarea>
```

**Event Listener:** Set up in `App.constructor()`

```javascript
this.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
    }
});
```

---

### 2. handleSend() - Triggers Base Agent

**File:** [src/canvas_chat/static/js/app.js](app.js) - Line 1290

**What Changed with Base Agent Refactor:**

The `handleSend()` method now acts as the **trigger point** that invokes the base agent. Instead of orchestrating all the logic directly, it:

1. Extracts message + context from the UI
2. Invokes the base agent with this input
3. Base agent handles all orchestration (fork LLM request, handle slash commands, etc.)
4. Canvas listens to graph changes (CRDT events) and re-renders

**Current handleSend() still exists for backwards compatibility:**

```javascript
async handleSend() {
    const content = this.chatInput.value.trim();
    if (!content) return;

    // Get context (selected nodes or text selection)
    const selectedIds = this.canvas.getSelectedNodeIds();
    let slashContext = null;
    // ... determine context ...

    // FUTURE: Invoke base agent instead
    // const result = await this.baseAgent.invoke({
    //     message: content,
    //     context: slashContext,
    //     selectedNodeIds: selectedIds,
    // });

    // For now, still uses plugin routing
    if (await this.tryHandleSlashCommand(content, slashContext)) {
        return;
    }

    // Regular message handling (will become base agent responsibility)
    // ... create human/AI nodes, stream response ...
}
```

---

### 3. Base Agent Message Processing

**Agent Responsibilities:**

The base agent receives user input and:

1. **Analyze:** Determine message type (slash command vs regular)
2. **Plan:** Decide what actions to take
3. **Execute:**
    - For slash commands: spawn appropriate sub-agent
    - For regular messages: execute LLM workflow
4. **Store:** Persist results to graph (CRDT)

**Agent-based Control Flow:**

```
Base Agent.invoke(input)
    ├─ Input contains:
    │   ├─ message: "text from user"
    │   ├─ context: "selected nodes content or text selection"
    │   └─ selectedNodeIds: ["id1", "id2"]
    │
    ├─ Analyze: Check if message.startsWith('/')
    │   │
    │   ├─ If YES → Slash command
    │   │   ├─ Extract command and args
    │   │   ├─ Find matching sub-agent
    │   │   ├─ Spawn sub-agent with:
    │   │   │   ├─ command: "/poll"
    │   │   │   ├─ args: "poll question?"
    │   │   │   └─ context: selected text or nodes
    │   │   └─ Return sub-agent result
    │   │
    │   └─ If NO → Regular message
    │       ├─ Plan: Create Human → LLM call → AI response
    │       ├─ Create human node
    │       ├─ Create edges from selectedNodeIds
    │       ├─ Create AI response node
    │       ├─ Call LLM with context
    │       ├─ Stream response (update AI node via CRDT)
    │       └─ Return completion artifacts
    │
    └─ Monitor: Graph changes trigger canvas re-renders
```

---

### Original handleSend() Entry Point (Legacy)

**File:** [src/canvas_chat/static/js/app.js](app.js) - Line 1290

**What it does:**

- Validates input (not empty)
- Determines context (selected nodes or text selection)
- Routes to slash commands if applicable
- Otherwise creates human/AI node pair and streams response

#### 2.1 Get Input Content

```javascript
const content = this.chatInput.value.trim();
if (!content) return; // Bail if empty
```

#### 2.2 Determine Context (Selected Nodes or Text Selection)

```javascript
// Priority 1: Selected text
const textSelection = window.getSelection();
let selectedText = textSelection ? textSelection.toString().trim() : '';

// Priority 2: Browser's pending selection (stored from canvas)
if (!selectedText && this.canvas.pendingSelectedText) {
    selectedText = this.canvas.pendingSelectedText;
}

// Priority 3: Selected nodes
const selectedIds = this.canvas.getSelectedNodeIds();
let slashContext = null;

if (selectedText) {
    slashContext = selectedText;
} else if (selectedIds.length > 0) {
    // Gather content from selected nodes
    const contextParts = selectedIds
        .map((id) => {
            const node = this.graph.getNode(id);
            return node ? node.content : '';
        })
        .filter((c) => c);
    slashContext = contextParts.join('\n\n');
}
```

---

### 4. Slash Command Handling (Agent-based)

**With Base Agent Refactor:**

Slash commands are now delegated to sub-agents instead of being handled by the plugin registry directly.

#### Sub-Agent Spawning

```javascript
// Base agent determines this is a slash command
if (message.startsWith('/')) {
    const command = message.split(' ')[0]; // e.g., '/poll'
    const args = message.split(' ').slice(1).join(' ');

    // Find and spawn appropriate sub-agent
    const subAgent = await this.findSubAgent(command);

    if (subAgent) {
        // Invoke sub-agent with full context
        const result = await subAgent.invoke({
            command,
            args,
            context, // selected nodes content
            graph: this.graph, // pass graph reference
            canvas: this.canvas, // pass canvas reference
        });
        return result; // Sub-agent handles everything
    }
}
```

#### How This Works

1. **Base agent receives:** `/poll What's your favorite language?`
2. **Base agent recognizes:** It's a slash command for PollFeature sub-agent
3. **Base agent spawns sub-agent** with:
    - Command name
    - Arguments
    - User context (selected text/nodes)
    - Graph and canvas references (sub-agent can modify graph directly)
4. **Sub-agent executes:**
    - Creates poll node
    - Adds to graph (CRDT update)
    - Canvas listens to CRDT changes and re-renders
5. **Base agent continues:** Ready for next message

**Benefits of Agent-based Slash Commands:**

- ✅ Sub-agents are autonomous (don't need to report back to App class)
- ✅ Sub-agents can spawn their own sub-agents (nested agent trees)
- ✅ Slash commands become first-class agent workflows (not special cases)
- ✅ Easier to test (sub-agents are isolated executable units)
- ✅ Commands can be complex multi-step LLM workflows

**Legacy Routing (still exists for compatibility):**

```javascript
// File: src/canvas_chat/static/js/app.js
async tryHandleSlashCommand(content, context = null) {
    const parts = content.split(' ');
    const command = parts[0]; // e.g., '/poll'
    const args = parts.slice(1).join(' ');

    // Priority 1: Check NodeRegistry (custom node plugins)
    if (NodeRegistry.hasSlashCommand(command)) {
        const cmdConfig = NodeRegistry.getSlashCommand(command);
        if (cmdConfig && cmdConfig.handler) {
            await cmdConfig.handler(this, args, context);
            return true;
        }
    }

    // Priority 2: Check FeatureRegistry (feature plugins)
    const handled = await this.featureRegistry.handleSlashCommand(command, args, { text: context });
    if (handled) {
        return true;
    }

    return false;
}
```

This legacy routing will be replaced by agent-based delegation once migration is complete.

---

### 5. Regular Message Flow (Base Agent Execution)

**With Base Agent Refactor:**

Regular messages are now handled by the base agent in a coordinated workflow. The agent:

1. Creates a conversation plan
2. Invokes tools to create nodes and stream responses
3. Stores results to the graph

#### Agent-based Flow

```javascript
// Base Agent receives input
const input = {
    message: "What is React?",
    context: [selectedNodeContent], // or empty if no selection
    selectedNodeIds: ["node-1", "node-2"],
};

// Base agent orchestrates
async execute(input) {
    // Step 1: Plan
    const plan = await this.prototypeWithTools(() => ({
        create_human_node: {
            message: input.message,
            position: this.computePosition(input.selectedNodeIds),
        },
        create_ai_node: {
            parentId: humanNode.id, // Reference from previous step
        },
        stream_response: {
            messageHistory: await this.buildMessages([...]),
            onChunk: (chunk) => updateGraph(humanNode.id, chunk),
            onDone: (fullContent) => finalizeNode(humanNode.id, fullContent),
        },
    }));

    // Step 2: Execute
    const humanNode = await this.tools.create_human_node(...);
    const aiNode = await this.tools.create_ai_node(...);
    const result = await this.tools.stream_response(...);

    // Step 3: Store
    return { humanNode, aiNode, result };
}
```

#### Legacy Implementation (Still Exists)

For backwards compatibility, the old implementation still handles this:

**File:** [src/canvas_chat/static/js/app.js](app.js) - Line 1335

#### 4.1 Get Parent Nodes

```javascript
let parentIds = this.canvas.getSelectedNodeIds();
```

- If nodes are selected on canvas, they become parents
- If no nodes are selected, human node becomes root (no incoming edges)

#### 4.2 Create Human Node

```javascript
const humanNode = createNode(NodeType.HUMAN, content, {
    position: this.graph.autoPosition(parentIds.length > 0 ? parentIds : []),
});

this.addUserNode(humanNode);
```

**Node Structure:**

```javascript
{
    id: "human-<uuid>",
    type: "human",
    content: "What is React?",
    position: { x: 100, y: 200 },
    width: 300,
    height: 200,
    metadata: {},
    timestamp: 1234567890,
}
```

#### 4.3 Create Edges to Parents

```javascript
if (parentIds.length > 0) {
    for (const parentId of parentIds) {
        const edge = createEdge(parentId, humanNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
        this.graph.addEdge(edge);

        // Update collapse button for parent
        this.updateCollapseButtonForNode(parentId);
    }
}
```

**Edge Types:**

- `REPLY`: Single parent → one response follows
- `MERGE`: Multiple parents → responses merge together

#### 4.4 Clear Input & Selection

```javascript
this.chatInput.value = '';
this.canvas.clearSelection();
```

#### 4.5 Create AI Response Node

```javascript
const model = this.modelPicker.value;
const aiNode = createNode(NodeType.AI, '', {
    position: this.graph.autoPosition([humanNode.id]),
    model: model.split('/').pop(), // e.g., 'gpt-4'
});

this.addUserNode(aiNode);

const aiEdge = createEdge(humanNode.id, aiNode.id, EdgeType.REPLY);
this.graph.addEdge(aiEdge);

this.updateCollapseButtonForNode(humanNode.id);
```

---

### 6. Context Resolution & LLM Request Building

**NOTE:** With base agent refactor, these operations become agent tools instead of direct method calls.

#### 6.1 Resolve Context

**File:** [src/canvas_chat/static/js/crdt-graph.js](crdt-graph.js)

```javascript
const context = this.graph.resolveContext([humanNode.id]);
```

**What resolveContext() does:**

- Traverses the DAG backwards from human node
- Collects all ancestor nodes (path from root to human node)
- Returns ordered array of nodes representing conversation history
- Used to provide context to LLM

**Result:**

```javascript
[
    { id: 'root-1', type: 'human', content: 'Hello' },
    { id: 'ai-1', type: 'ai', content: 'Hi there!' },
    { id: 'human-2', type: 'human', content: 'What is React?' },
];
```

#### 6.2 Build Messages for API

**File:** [src/canvas_chat/static/js/chat.js](chat.js)

```javascript
const messages = buildMessagesForApi(context);
```

**What buildMessagesForApi() does:**

- Converts context nodes into LLM message format
- Merges consecutive messages from same sender (user/assistant)
- Handles special node types (references, citations, etc.)
- Returns array of `{ role, content }` objects

**Result:**

```javascript
[
    {
        role: 'user',
        content: 'Hello',
    },
    {
        role: 'assistant',
        content: 'Hi there!',
    },
    {
        role: 'user',
        content: 'What is React?',
    },
];
```

#### 6.3 Build LLM Request

**File:** [src/canvas_chat/static/js/app.js](app.js) - Line 1250

```javascript
const request = this.buildLLMRequest({
    messages: messages,
    temperature: chat.getTemperatureForModel(model),
});
```

**buildLLMRequest() adds:**

```javascript
buildLLMRequest(additionalParams = {}) {
    const model = this.modelPicker.value;

    // In admin mode, backend handles credentials
    if (this.adminMode) {
        return {
            model: model,
            ...additionalParams,
        };
    }

    // Normal mode: include user-provided credentials
    const apiKey = chat.getApiKeyForModel(model);
    const baseUrl = chat.getBaseUrlForModel(model);

    return {
        model: model,
        api_key: apiKey,
        base_url: baseUrl,
        ...additionalParams,
    };
}
```

**Final Request:**

```javascript
{
    model: "gpt-4",
    api_key: "sk-...",
    base_url: "https://api.openai.com/v1",
    messages: [...],
    temperature: 0.7,
}
```

---

### 7. Streaming Response

**File:** [src/canvas_chat/static/js/app.js](app.js) - Line 1375

**NOTE:** Streaming becomes an agent tool that yields chunks and updates the graph incrementally.

#### 7.1 Create Abort Controller

```javascript
const abortController = new AbortController();

// Register with StreamingManager (auto-shows stop button)
this.streamingManager.register(aiNode.id, {
    abortController,
    featureId: 'ai',
    context: { messages, model, humanNodeId: humanNode.id },
    onContinue: async (nodeId, state) => {
        // Resume streaming from where we left off
        await this.continueAIResponse(nodeId, state.context);
    },
});
```

#### 7.2 Stream with Abort

```javascript
this.streamWithAbort(
    aiNode.id,
    abortController,
    messages,
    model,
    // onChunk callback
    (chunk, fullContent) => {
        this.canvas.updateNodeContent(aiNode.id, fullContent, true);
        this.graph.updateNode(aiNode.id, { content: fullContent });
    },
    // onDone callback
    (fullContent) => {
        this.streamingManager.unregister(aiNode.id); // Auto-hides stop button
        this.canvas.updateNodeContent(aiNode.id, fullContent, false);
        this.graph.updateNode(aiNode.id, { content: fullContent });
        this.saveSession();
        this.generateNodeSummary(aiNode.id);
    },
    // onError callback
    (error) => {
        this.streamingManager.unregister(aiNode.id);
        // Handle error...
    }
);
```

#### 7.3 What streamWithAbort() Does

**File:** [src/canvas_chat/static/js/app.js](app.js)

```javascript
async streamWithAbort(nodeId, abortController, messages, model, onChunk, onDone, onError) {
    try {
        // Send request to backend
        const request = this.buildLLMRequest({ messages });

        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: abortController.signal, // Can be aborted
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        // Read streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            fullContent += chunk;

            // Call onChunk callback
            onChunk(chunk, fullContent);
        }

        // Streaming complete
        onDone(fullContent);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Stream aborted by user');
        } else {
            onError(error);
        }
    }
}
```

---

## Data Flow Through the System

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ User types in ChatBox input field                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   handleSend()         │
        │ (app.js:1290)          │
        └────────────┬───────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
    ┌──────────────┐      ┌──────────────────┐
    │ Slash cmd?   │ YES  │ tryHandleCommand │
    │ (/command)   ├─────▶│ (route to plugin)│
    └──────┬───────┘      └──────────────────┘
           │ NO
           ▼
    ┌─────────────────────┐
    │ Create human node   │
    │ - id, type, content │
    │ - position          │
    └────────┬────────────┘
             │
             ▼
    ┌─────────────────────┐
    │ Create edges from   │
    │ selected parents    │
    │ (if any)            │
    └────────┬────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Create AI node       │
    │ (empty content)      │
    │ - model set          │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Resolve context      │
    │ (traverse DAG back)  │
    │ → array of nodes     │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Build messages       │
    │ (role/content pairs) │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ streamWithAbort()    │
    │ - POST /api/chat/... │
    │ - stream chunks      │
    │ - update node        │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ onChunk callback     │
    │ - update AI node     │
    │ - update canvas      │
    │ - CRDT stores data   │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ onDone callback      │
    │ - mark complete      │
    │ - generate summary   │
    │ - save session       │
    └──────────────────────┘
```

---

## Key Data Structures

### Message Format

```javascript
{
    role: "user" | "assistant",
    content: "The actual text content"
}
```

### Node Object

```javascript
{
    id: "human-<uuid>",
    type: NodeType.HUMAN,
    content: "What is React?",
    position: { x: 100, y: 200 },
    width: 300,
    height: 200,
    metadata: {
        // Optional metadata
    },
    timestamp: 1234567890000,
}
```

### Edge Object

```javascript
{
    id: "edge-<uuid>",
    from: "human-1-id",
    to: "ai-1-id",
    type: EdgeType.REPLY | EdgeType.MERGE,
    metadata: {}
}
```

### LLM Request Payload

```javascript
{
    model: "gpt-4",
    api_key: "sk-...",
    base_url: "https://api.openai.com/v1",
    messages: [
        { role: "user", content: "..." },
        { role: "assistant", content: "..." },
    ],
    temperature: 0.7,
}
```

---

## Important Concepts

### Context Resolution

The `resolveContext()` method:

1. Takes an array of node IDs (e.g., human node being responded to)
2. Traverses backwards through edges to find all ancestors
3. Returns ordered array representing conversation path
4. Provides full context to LLM for understanding conversation

### Streaming Update Pattern

Every chunk from the LLM triggers two operations:

1. **Canvas Update (immediate visual feedback)**

    ```javascript
    this.canvas.updateNodeContent(aiNode.id, fullContent, true);
    ```

2. **Graph Update (persistent storage via CRDT)**
    ```javascript
    this.graph.updateNode(aiNode.id, { content: fullContent });
    ```

This dual update ensures:

- Users see content appearing in real-time
- Data is persisted to the graph (Yjs CRDT)
- Changes sync across multiple viewers (if using WebRTC)

### Plugin Command Registration

Plugins register slash commands during `onLoad()`:

```javascript
export class MyFeature extends FeaturePlugin {
    async onLoad() {
        this.registerSlashCommand('/mycommand', 'Shortened description', 'Long description');
    }

    async handleMycommand(args, context) {
        // Handle the command
    }
}
```

The FeatureRegistry stores this mapping:

- Command name → Feature ID + Handler method name
- When `/mycommand` is typed, registry calls `feature.handleMycommand()`

---

## Error Handling

### Streaming Errors

```javascript
catch (error) {
    if (error.name === 'AbortError') {
        // User clicked stop button
    } else {
        // Network or API error
        onError(error);
    }
}
```

### API Errors

```javascript
if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
}
```

Errors are handled in the `onError` callback, which:

- Updates UI to show error state
- Removes node from graph if creation failed
- Shows error notification to user

---

## Migration Strategy: From Plugin Routing to Agent Orchestration

### The Refactoring Goal

The base agent refactor transforms message handling from **direct orchestration** (App class calling methods) to **agent-based orchestration** (Base agent coordinating sub-agents and tools).

### Old Architecture → New Architecture

```
OLD (Plugin-based):
User Input
  ↓
App.handleSend()
  ├─ tryHandleSlashCommand()
  │   └─ Plugin registry lookup → feature.handler()
  └─ Direct node creation
     ├─ createNode()
     ├─ graph.addEdge()
     ├─ streamWithAbort()
     └─ graph.updateNode()

NEW (Agent-based):
User Input
  ↓
App.handleSend() → Base Agent
  ├─ Analyze message type
  ├─ For slash commands: Spawn(SubAgent)
  │   └─ Sub-agent(command) ← autonomous execution
  └─ For regular: Base Agent executes
     ├─ Tool: create_human_node()
     ├─ Tool: create_ai_node()
     ├─ Tool: stream_response() ← yields chunks
     └─ Tool: update_graph()
```

### Phase 1: Co-existence (Current)

- Plugin routing still works (FeatureRegistry)
- Base agent work in parallel with legacy code
- Both can modify the graph
- Canvas listens to CRDT changes regardless of origin

### Phase 2: Migration

1. **Slash Commands → Sub-agents**
    - `/poll` → PollSubAgent
    - `/code` → CodeSubAgent
    - etc.

2. **Regular Messages → Base Agent Tools**
    - `create_human_node()` tool
    - `create_ai_node()` tool
    - `stream_response()` tool
    - `build_context()` tool

3. **Plugin hooks → Agent decision points**
    - Before creating node → Agent can cancel/modify
    - After streaming done → Agent can post-process

### Phase 3: Full Migration

- Remove plugin registry
- Remove legacy `tryHandleSlashCommand()`
- Base agent is the only orchestrator
- Sub-agents are discoverable via agent framework

### Key Principles for Migration

1. **Graph is source of truth** - All changes go through CRDT, not callbacks
2. **Agents are reactive** - They respond to user input, not scheduled
3. **Tools are atomic** - Each tool does one thing (create node, build context, stream)
4. **Sub-agents are autonomous** - They don't report back, they modify graph directly
5. **Canvas listens** - UI reacts to graph changes via CRDT events

### What This Means for Developers

**On Legacy Path:**

```javascript
// App still handles this directly
this.createNode(...);
this.graph.addEdge(...);
```

**On Agent Path:**

```javascript
// Base agent handles this via tools
await this.baseAgent.invoke({
    tools: {
        create_node: (config) => { ... },
        add_edge: (from, to) => { ... },
    }
});
```

---

## Related Files

### Frontend (Static JS)

- [app.js](../../../src/canvas_chat/static/js/app.js) - Main App class, handleSend
- [feature-registry.js](../../../src/canvas_chat/static/js/feature-registry.js) - Plugin routing
- [chat.js](../../../src/canvas_chat/static/js/chat.js) - Message building
- [crdt-graph.js](../../../src/canvas_chat/static/js/crdt-graph.js) - Context resolution

### Backend (Python/FastAPI)

- [app.py](../../../src/canvas_chat/app.py) - `/api/chat/stream` endpoint

### Documentation

- [Feature Plugin API](feature-plugin-api.md) - How to build plugins
- [App Context API](app-context-api.md) - Available APIs for plugins
- [Feature Registry API](feature-registry-api.md) - Plugin registration patterns
