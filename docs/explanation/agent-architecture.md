# Agent Architecture (ADR)

## Status

Implemented (Initial Foundation)

## Context

Canvas Chat supports rich, non-linear interaction with LLMs through a DAG of nodes. However, execution logic was previously implicit and feature-specific (e.g., chat, committee, research-like flows).

As the system grows, we needed a unified execution and memory model that:

- Supports complex agent behaviors (delegation, research, synthesis)
- Remains deterministic and debuggable
- Integrates naturally with the DAG
- Supports long-horizon memory and reflection
- Allows future extensibility (custom agents, tools, MCP servers, storage backends)

## Decision

We introduced a **Base Agent + Sub-Agent architecture** where:

1. **Agents** are explicit execution units that transform selected nodes into new nodes
2. **Every execution** is recorded as part of the graph (Run Nodes, Artifact Nodes)
3. **Memory** is a pluggable system supporting retain / recall / reflect semantics

### Core Design Principle

> Canvas Chat is event-driven. Agents execute only in response to host-recognized user or node events, and never observe or mutate the canvas autonomously.

- **The canvas is the clock** — Agents react to user actions, not internal timers
- **The DAG is the truth** — All state is visible in the graph
- **Agents are reactors, not daemons** — No background execution

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

Agents are configured in `config.yaml`:

```yaml
agents:
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

guardrails:
    maxSubagentDepth: 1
    maxSubagentSpawns: 3

memoryStore:
    type: in-memory
```

## File Structure

```
src/canvas_chat/static/js/agent/
├── agent-types.js      # Core type definitions
├── engine-adapter.js   # Engine adapter interface
├── memory-store.js     # Memory store interface
├── run-controller.js   # Run orchestration
└── index.js            # Module exports

src/canvas_chat/config.py   # Python configuration
config.example.yaml         # Example configuration
```

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
