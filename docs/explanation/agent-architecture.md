# Agent Architecture (ADR)

## Status

Implemented (v2.0 - PostCreate Hooks, Graph Tools, Data-Driven Display)

## Context

Canvas Chat supports rich, non-linear interaction with LLMs through a DAG of nodes. However, execution logic was previously implicit and feature-specific (e.g., chat, committee, research-like flows).

As the system grows, we needed a unified execution and memory model that:

- Supports complex agent behaviors (delegation, research, synthesis)
- Remains deterministic and debuggable
- Integrates naturally with the DAG
- Supports long-horizon memory and reflection
- Allows future extensibility (custom agents, tools, MCP servers, storage backends)
- **Enables config-based agent definition** (no code required for simple agents)
- **Supports autonomous graph manipulation** (edges, metadata updates)

## Decision

We introduced a **Base Agent + Sub-Agent architecture** where:

1. **Agents** are explicit execution units that transform selected nodes into new nodes
2. **Every execution** is recorded as part of the graph (Run Nodes, Artifact Nodes)
3. **Memory** is a pluggable system supporting retain / recall / reflect semantics
4. **Config-based agents** can be defined entirely in YAML with postCreate hooks
5. **Graph tools** enable agents to autonomously navigate and modify the graph

### Core Design Principle

> Canvas Chat is event-driven. Agents execute only in response to host-recognized user or node events, and never observe or mutate the canvas autonomously.

- **The canvas is the clock** — Agents react to user actions, not internal timers
- **The DAG is the truth** — All state is visible in the graph
- **Agents are reactors, not daemons** — No background execution

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Input                                      │
│                          (message or /command)                               │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BaseAgent                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ • Receives user input from App.handleSend()                             │ │
│  │ • Routes slash commands to registered sub-agents                        │ │
│  │ • Handles regular messages directly (creates human/AI nodes)            │ │
│  │ • Manages sub-agent registry (command → agentId mapping)               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────┐
            │                             │                         │
            ▼                             ▼                         ▼
┌───────────────────┐         ┌───────────────────┐     ┌───────────────────┐
│   Direct Handler  │         │   RunController   │     │   Legacy Plugin   │
│  (Feature engine) │         │  (builtin engine) │     │  (FeatureRegistry)│
├───────────────────┤         ├───────────────────┤     ├───────────────────┤
│ Fast path for     │         │ Full execution    │     │ Fallback for      │
│ plugins that      │         │ with:             │     │ plugins without   │
│ handle commands   │         │ • Event streaming │     │ AgentDefinition   │
│ synchronously     │         │ • Run tracking    │     │                   │
│                   │         │ • Artifact nodes  │     │                   │
│ Examples:         │         │ • Memory retention│     │                   │
│ • /reflect        │         │ • PostCreate hooks│     │                   │
│ • /committee      │         │                   │     │                   │
│ • /factcheck      │         │ Examples:         │     │                   │
└───────────────────┘         │ • Config agents   │     │                   │
                              └─────────┬─────────┘     └───────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Engine Adapter                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ BuiltinEngineAdapter (default):                                         │ │
│  │ • Streams LLM completions via chat.streamCompletion()                  │ │
│  │ • Yields events: RUN_STARTED, TOKEN_DELTA, ARTIFACT_CREATED, etc.      │ │
│  │ • Supports cancellation                                                 │ │
│  │                                                                         │ │
│  │ Future adapters: LangChain, OpenAI Assistants, etc.                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Graph Integration                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ Nodes Created:                          Edges Created:                  │ │
│  │ • RUN node (execution record)           • RUN_TRIGGER (source → run)    │ │
│  │ • ARTIFACT node (agent output)          • RUN_ARTIFACT (run → artifact) │ │
│  │ • REFLECTION node (analysis output)     • RUN_REFLECTION (for reflects) │ │
│  │                                         • SUBAGENT (parent → child run) │ │
│  │                                                                         │ │
│  │ PostCreate Hooks:                                                       │ │
│  │ • Automatic edge creation via $variable references                      │ │
│  │ • Metadata updates on source/branch nodes                              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture Overview

### Core Types

#### AgentDefinition

A declarative specification describing what an agent is and what it is allowed to do:

```javascript
{
    id: 'research-agent',
    name: 'Research Agent',
    engine: 'builtin',
    model: 'openai/gpt-4o',
    systemPrompt: 'You are a research assistant...',
    allowedTools: ['web_search', 'fetch_url'],
    budgets: {
        maxTokens: 100000,
        maxToolCalls: 20,
        timeoutMs: 300000
    },
    hitl: {
        requireApprovalForTools: false,
        requireApprovalForMutations: true
    },
    subagents: {
        retriever: { ... }
    }
}
```

#### Run Node

Represents a single agent execution in the DAG:

- Displays status, agent metadata, plan, and trace summary
- Parent to all artifacts produced during the run
- Connected from triggering node(s) via `RUN_TRIGGER` edge

#### Artifact Node

Represents outputs produced by agent runs:

- Assistant messages, research reports, structured outputs
- Connected from producing Run Node via `RUN_ARTIFACT` edge

### Event Model

Agent execution is expressed entirely via events:

| Event Type                 | Purpose                               |
| -------------------------- | ------------------------------------- |
| `run.started`              | Run began execution                   |
| `run.status`               | Status change (running, paused, etc.) |
| `run.completed`            | Run finished successfully             |
| `run.failed`               | Run encountered an error              |
| `token.delta`              | LLM token streaming                   |
| `tool.call.requested`      | Tool invocation pending               |
| `tool.call.completed`      | Tool invocation finished              |
| `subagent.spawn.requested` | Sub-agent delegation pending          |
| `subagent.spawn.completed` | Sub-agent finished                    |
| `artifact.created`         | New artifact node created             |
| `plan.created`             | Execution plan established            |
| `plan.updated`             | Plan step completed                   |
| `progress.update`          | Heartbeat for long-running runs       |

### Engine Adapter Interface

Agents are executed via engine adapters, allowing multiple execution strategies:

```javascript
class EngineAdapter {
    async *run(request, hostContext) {
        // Yield events as execution progresses
        yield { type: 'run.started', ... };
        // ... execution logic ...
        yield { type: 'run.completed', ... };
    }
}
```

Engines:

- Do not mutate the canvas directly
- Do not manage persistence
- Interact only through host-provided interfaces

### Host Context

The host exposes only safe primitives to engines:

- `llm.stream(...)` — LLM API calls
- `tools.invoke(...)` — Permission-checked tool calls
- `spawnSubagent(...)` — Sub-agent delegation
- `emit(event)` — Event emission
- `memory.recall(...)` — Memory retrieval

### Run Controller

The Run Controller orchestrates agent execution:

1. Creates and manages agent runs
2. Streams events to the UI
3. Persists execution traces
4. Enforces budgets, depth limits, and HITL policies
5. Materializes artifacts into DAG nodes
6. Coordinates memory retention

### Memory Store

Memory is a derived layer with three core operations:

1. **Retain** — Persist memories derived from runs and artifacts
2. **Recall** — Retrieve relevant memories using semantic, lexical, or temporal search
3. **Reflect** — (Optional) Produce synthesized answers from recalled memories

```javascript
await memoryStore.retain({
    bankId: 'workspace-123',
    type: 'experience',
    content: 'User asked about Python async patterns',
    sourceRefs: ['run-abc', 'node-xyz'],
});

const memories = await memoryStore.recall({
    bankId: 'workspace-123',
    query: 'async programming',
    types: ['world', 'experience'],
    limit: 10,
});
```

Memory types:

- **World** — Facts about the world
- **Experience** — What happened (run summaries, user interactions)
- **Opinion** — Beliefs with confidence scores

## DAG Integration

### Graph Linking Rules

```
[Human Node] ---(RUN_TRIGGER)---> [Run Node] ---(RUN_ARTIFACT)---> [AI Node]
                                       |
                                       +---(SUBAGENT)---> [Sub-Run Node]
```

- A Run Node is connected FROM the node(s) that triggered it
- Artifact nodes are connected FROM their producing Run Node
- Sub-agent Run Nodes are connected FROM the parent Run Node

### New Node Types

| Type       | Purpose                                    |
| ---------- | ------------------------------------------ |
| `run`      | Agent execution record with trace and plan |
| `artifact` | Structured output from an agent run        |

### New Edge Types

| Type           | Purpose                              |
| -------------- | ------------------------------------ |
| `run_trigger`  | Connects triggering node to Run Node |
| `run_artifact` | Connects Run Node to its artifacts   |
| `subagent`     | Connects parent run to sub-agent run |

## PostCreate Hooks

PostCreate hooks enable config-based agents to define graph operations declaratively. When an artifact is created, the RunController automatically executes these hooks.

### Variable References

Hooks use `$variable` syntax to reference nodes in the execution context:

| Variable   | Description                                           |
| ---------- | ----------------------------------------------------- |
| `$artifact`| The newly created artifact node                       |
| `$source`  | The node that triggered the agent (user input node)   |
| `$branch`  | The branch point (first node with multiple children)  |
| `$leaf`    | The leaf node of the conversation path                |

### Hook Actions

#### addEdge

Creates an edge between two nodes:

```yaml
postCreate:
  - action: addEdge
    from: $source
    to: $artifact
    edgeType: reply
```

#### updateMetadata

Updates metadata on an existing node:

```yaml
postCreate:
  - action: updateMetadata
    target: $source
    key: hasReflection
    value: true
```

### Example: Reflection Agent

```yaml
agents:
  reflect:
    id: reflect
    name: Reflection Agent
    command: /reflect
    engine: builtin
    model: anthropic/claude-sonnet-4-20250514
    artifactType: REFLECTION
    postCreate:
      - action: addEdge
        from: $source
        to: $artifact
        edgeType: run_reflection
      - action: updateMetadata
        target: $branch
        key: hasReflection
        value: true
```

### Variable Resolution

The RunController resolves variables using the execution context:

```javascript
resolvePostCreateVariable(variableName, context) {
    switch (variableName) {
        case '$artifact': return context.artifactNodeId;
        case '$source': return context.sourceNodeId;
        case '$branch': return context.branchNodeId;
        case '$leaf': return context.leafNodeId;
        default: return null;
    }
}
```

## Graph Tools

Agents can use graph tools to navigate and manipulate the conversation DAG. Two parallel systems exist for different use cases.

### Tool Categories

| Category   | Examples                                    | Purpose                    |
| ---------- | ------------------------------------------- | -------------------------- |
| `search`   | web_search, semantic_search                 | Information retrieval      |
| `fetch`    | fetch_url, fetch_pdf                        | Content acquisition        |
| `compute`  | calculate, code_execute                     | Computation                |
| `transform`| summarize, translate, extract               | Content transformation     |
| `storage`  | memory_store, file_write                    | Persistence                |
| `external` | send_email, api_call                        | External side effects      |
| `custom`   | user-defined                                | Plugin-specific            |
| `graph`    | findPathToRoot, getPathContent, createNode  | DAG navigation/mutation    |

### Built-in Graph Tools

#### Navigation Tools

```javascript
// Find path from a node to the root (oldest ancestor)
{
    name: 'graph:findPathToRoot',
    description: 'Find the path from a node to the root of the conversation',
    parameters: { nodeId: 'string' },
    returns: 'Array of node IDs from given node to root'
}

// Get content of nodes along a path
{
    name: 'graph:getPathContent',
    description: 'Get the content of all nodes along a path',
    parameters: { nodeIds: 'string[]' },
    returns: 'Array of { id, type, content, title } objects'
}
```

#### Mutation Tools

```javascript
// Create a new node
{
    name: 'graph:createNode',
    description: 'Create a new node in the graph',
    parameters: { type: 'NodeType', content: 'string', position?: 'object' }
}

// Create an edge between nodes
{
    name: 'graph:createEdge',
    description: 'Create an edge between two nodes',
    parameters: { from: 'string', to: 'string', type: 'EdgeType' }
}

// Update node metadata
{
    name: 'graph:updateMetadata',
    description: 'Update metadata on a node',
    parameters: { nodeId: 'string', key: 'string', value: 'any' }
}
```

### Tool Binding Strategies

Two implementations exist for different binding semantics:

| File               | Binding Time | Use Case                                      |
| ------------------ | ------------ | --------------------------------------------- |
| `graph-tools.js`   | Early        | AgenticExecutor (graph bound at tool creation)|
| `tool-registry.js` | Late         | Config-based agents (context.graph at invoke) |

**Note:** This duplication is intentional. The AgenticExecutor needs tools with pre-bound graph references, while config-based agents need tools that can adapt to different execution contexts.

## Human-in-the-Loop (HITL)

HITL is implemented as a host-level policy, not engine logic:

- **Gated actions**: Tool calls, sub-agent spawning, canvas mutations
- **Mechanism**: Engine emits intent → Host evaluates policy → If required, pause until approval
- **Persistence**: All approvals are persisted as events

## Guardrails

Default safety limits:

- Max sub-agent depth: 1
- Max sub-agent spawns per run: 3
- Budget inheritance for sub-agents
- No automatic cascading runs

## Configuration

### Config-Based Agents

Agents can be defined entirely in YAML without writing code. The configuration system supports:

- **Commands**: Slash command registration (`/reflect`, `/research`, etc.)
- **Models**: LLM model selection with provider prefix
- **Tools**: Allowed tool lists with permission checks
- **PostCreate**: Declarative graph operations
- **Context Gathering**: Automatic path finding and content retrieval

### Full Configuration Example

```yaml
# config.yaml

agents:
  # Base agent handles regular chat
  base:
    id: base
    name: Base Agent
    engine: builtin
    model: openai/gpt-4o
    systemPrompt: 'You are a helpful assistant...'
    allowedTools: []
    budgets:
      maxTokens: 100000
      maxToolCalls: 20
      timeoutMs: 300000

  # Config-based reflection agent
  reflect:
    id: reflect
    name: Reflection Agent
    command: /reflect
    engine: builtin
    model: anthropic/claude-sonnet-4-20250514
    systemPrompt: |
      You are a reflection assistant. Analyze the conversation path
      and provide insights about patterns, missed opportunities,
      and alternative approaches.
    artifactType: REFLECTION
    contextGathering:
      method: pathToRoot
      includeContent: true
    postCreate:
      - action: addEdge
        from: $source
        to: $artifact
        edgeType: run_reflection
      - action: updateMetadata
        target: $branch
        key: hasReflection
        value: true

guardrails:
  maxSubagentDepth: 1
  maxSubagentSpawns: 3

memoryStore:
  type: in-memory

# Plugin configuration (separate from agents)
plugins:
  - path: ./plugins/my-plugin.js
  - js: ./plugins/feature.js
    py: ./plugins/handler.py
    id: my-feature
```

### Agent Definition Schema

```yaml
agentId:
  id: string              # Unique identifier
  name: string            # Display name
  command: string         # Optional slash command (e.g., /reflect)
  engine: string          # Execution engine (builtin, feature, etc.)
  model: string           # LLM model with provider prefix
  systemPrompt: string    # System prompt for LLM

  # Optional fields
  artifactType: string    # Type for created nodes (REFLECTION, etc.)
  allowedTools: string[]  # List of allowed tool names

  contextGathering:       # How to gather conversation context
    method: string        # 'pathToRoot', 'selectedNodes', etc.
    includeContent: bool  # Whether to include node content

  postCreate:             # Actions after artifact creation
    - action: string      # 'addEdge' or 'updateMetadata'
      # ... action-specific fields

  budgets:                # Resource limits
    maxTokens: number
    maxToolCalls: number
    timeoutMs: number

  hitl:                   # Human-in-the-loop settings
    requireApprovalForTools: bool
    requireApprovalForMutations: bool

  subagents:              # Nested sub-agent definitions
    agentId: { ... }
```

## File Structure

### Agent Module Files

| File                    | Lines | Purpose                                           |
| ----------------------- | ----- | ------------------------------------------------- |
| `index.js`              | ~30   | Module exports (all public components)            |
| `base-agent.js`         | ~570  | Primary orchestrator, command routing             |
| `run-controller.js`     | ~640  | Execution management, postCreate hooks            |
| `agentic-executor.js`   | ~360  | Tool-using agent loop                             |
| `tool-registry.js`      | ~1120 | Tool registration, built-in tools                 |
| `graph-tools.js`        | ~400  | Graph tool definitions for AgenticExecutor        |
| `engine-adapter.js`     | ~400  | Execution strategies, BuiltinEngineAdapter        |
| `agent-types.js`        | ~400  | Type definitions, EventType, factories            |
| `memory-store.js`       | ~200  | Memory primitives (retain/recall/reflect)         |
| `state-store.js`        | ~150  | State persistence (CRDT wrapper)                  |
| `blob-store.js`         | ~250  | Binary storage (IndexedDB, server, in-memory)     |
| `blob-store-utils.js`   | ~50   | Blob store helpers                                |
| `reflection-utils.js`   | ~200  | Path finding, context gathering                   |
| `reflection-agent.js`   | ~145  | Reflection sub-agent orchestration                |
| `debug-logger.js`       | ~100  | Debug logging utilities                           |

### Directory Layout

```
src/canvas_chat/static/js/agent/
├── index.js              # Module exports
├── base-agent.js         # Primary orchestrator
├── run-controller.js     # Execution management
├── agentic-executor.js   # Tool-using agent loop
├── tool-registry.js      # Tool registration
├── graph-tools.js        # Graph tools for executor
├── engine-adapter.js     # Execution strategies
├── agent-types.js        # Type definitions
├── memory-store.js       # Memory primitives
├── state-store.js        # State persistence
├── blob-store.js         # Binary storage
├── blob-store-utils.js   # Blob helpers
├── reflection-utils.js   # Path utilities
├── reflection-agent.js   # Reflection sub-agent
└── debug-logger.js       # Debug logging

src/canvas_chat/config.py     # Python configuration
config.example.yaml           # Example configuration
```

## Known Issues

### Tool Duplication

`graph:findPathToRoot` and `graph:getPathContent` are defined in both `graph-tools.js` and `tool-registry.js`. This is intentional due to different binding semantics:

- **graph-tools.js**: Tools receive graph reference at creation time (early binding)
- **tool-registry.js**: Tools receive graph via context at invocation time (late binding)

**Impact:** No functional impact. Both implementations produce identical results.

**Future:** Consider unifying via a factory pattern that accepts binding strategy.

## Debugging

### Enable Debug Logging

Set localStorage flag to enable verbose agent logging:

```javascript
localStorage.setItem('canvas-chat-debug-agent', 'true');
```

### Debug Output Includes

- Agent routing decisions
- Tool invocations and results
- PostCreate hook execution
- Memory operations
- Event emission timeline

## Non-Goals (Current Scope)

- ❌ Autonomous or background agents
- ❌ Long-running background jobs or queues
- ❌ Untrusted, user-installed Python agent engines
- ❌ Direct agent mutation of the canvas (agents propose; host applies)
- ❌ Perfectly consistent or lossless memory

## Future Extensions

The architecture supports future additions without rewrites:

- **Custom engines** — LangChain, AutoGen, etc.
- **MCP-backed tools** — Standardized tool protocol
- **External memory stores** — Postgres + pgvector, dedicated services
- **Agent Packs** — Bundled agent definitions with tools and prompts
- **Multi-turn HITL** — Rich approval workflows

## Related Documents

- [Plugin Architecture](plugin-architecture.md) — Three-level plugin system
- [Feature Plugin API](../reference/feature-plugin-api.md) — Plugin base class reference
- [Node Protocols](node-protocols.md) — Node rendering and behavior protocols
