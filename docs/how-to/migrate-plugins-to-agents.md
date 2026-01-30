# Migrating Plugins to Agent Architecture

This guide explains how to migrate existing feature plugins to use the new Base Agent + Sub-Agent architecture.

## When to Migrate

Consider migrating a plugin to be agent-backed when it:

- **Needs explicit traceability** - Execution should be visible in the DAG
- **Has multi-step workflows** - Complex operations that could benefit from plans
- **Uses LLM calls** - Direct chat API calls that should be instrumented
- **Needs memory** - Operations that benefit from retain/recall/reflect
- **Has delegation patterns** - Work that could be split among sub-agents

## Quick Comparison

### Before: Direct LLM Calls

```javascript
class MyFeature extends FeaturePlugin {
    async handleCommand(command, args, context) {
        // Direct LLM call - no traceability
        const response = await this.chat.stream({
            messages: [{ role: 'user', content: args }],
            model: 'anthropic/claude-sonnet-4-20250514',
        });

        // Manually create node
        const node = this.graph.addNode({
            type: 'ai',
            content: response.content,
        });
    }
}
```

### After: Agent-Backed

```javascript
import { createAgentDefinition, createRunRequest, createRunContext } from '/static/js/agent/index.js';

// Define agent once
const MY_AGENT = createAgentDefinition({
    id: 'my-agent',
    name: 'My Agent',
    model: 'anthropic/claude-sonnet-4-20250514',
    systemPrompt: '...',
    allowedTools: [],
    budgets: { maxTokens: 10000, maxToolCalls: 5, timeoutMs: 60000 },
});

class MyFeature extends FeaturePlugin {
    async onLoad() {
        // Register agent
        this.context.runController?.registerAgent(MY_AGENT);
    }

    async handleCommand(command, args, context) {
        // Create run request - traceability built-in
        const runContext = createRunContext({
            sourceNodeIds: context.selectedNodeIds,
            userQuery: args,
            slashCommand: command,
        });

        const request = createRunRequest(MY_AGENT.id, runContext);

        // Execute via RunController
        for await (const event of this.context.runController.startRun(request)) {
            // Events are logged, nodes are created automatically
        }
    }
}
```

## Migration Steps

### Step 1: Define Your Agent

Convert your feature's behavior into an `AgentDefinition`:

```javascript
import { createAgentDefinition } from '/static/js/agent/index.js';

const MY_AGENT = createAgentDefinition({
    // Required
    id: 'unique-agent-id', // Used for registration
    name: 'Human-Readable Name', // Shown in UI
    model: 'anthropic/claude-sonnet-4-20250514', // LLM model
    systemPrompt: `...`, // Agent instructions

    // Optional but recommended
    allowedTools: ['web_search'], // MCP tools the agent can use
    budgets: {
        maxTokens: 10000, // Token limit
        maxToolCalls: 5, // Tool call limit
        timeoutMs: 60000, // Timeout
    },
    defaultOutputNodeType: 'ai', // Node type for artifacts
    description: 'What this agent does',
});
```

### Step 2: Register in onLoad()

```javascript
async onLoad() {
    if (this.context.runController) {
        this.context.runController.registerAgent(MY_AGENT);
        console.log('[MyFeature] Agent registered');
    } else {
        console.warn('[MyFeature] RunController not available');
    }
}
```

### Step 3: Create Run Requests

Replace direct `chat.stream()` calls with run requests:

```javascript
import { createRunRequest, createRunContext } from '/static/js/agent/index.js';

async handleCommand(command, args, context) {
    const runContext = createRunContext({
        sourceNodeIds: context.selectedNodeIds,
        userQuery: args,
        slashCommand: command,
        // parentRunId: '...',  // If sub-agent
    });

    const request = createRunRequest(
        MY_AGENT.id,           // Which agent
        runContext,            // Execution context
        { customParam: value } // Optional parameters
    );

    // Execute
    for await (const event of this.context.runController.startRun(request)) {
        await this.handleEvent(event);
    }
}
```

### Step 4: Handle Events

The RunController emits events you can handle for UI updates:

```javascript
import { EventType } from '/static/js/agent/index.js';

async handleEvent(event) {
    switch (event.type) {
        case EventType.RUN_STARTED:
            // Show loading indicator
            break;

        case EventType.PLAN_CREATED:
            // Show plan in UI
            this.showPlan(event.data.plan);
            break;

        case EventType.PROGRESS_UPDATE:
            // Update progress bar
            this.updateProgress(event.data.percent, event.data.message);
            break;

        case EventType.TOKEN_DELTA:
            // Streaming tokens - can show live
            break;

        case EventType.ARTIFACT_CREATED:
            // New node created - already in graph
            break;

        case EventType.RUN_COMPLETED:
            // Hide loading, show success
            break;

        case EventType.RUN_FAILED:
            // Show error
            this.showError(event.data.error);
            break;
    }
}
```

## Adding Sub-Agents

For complex workflows, define sub-agents within your agent:

```javascript
const COORDINATOR_AGENT = createAgentDefinition({
    id: 'coordinator',
    name: 'Coordinator',
    model: 'anthropic/claude-sonnet-4-20250514',
    systemPrompt: 'You coordinate research by delegating to specialists.',

    // Sub-agents for delegation
    subagents: {
        searcher: createAgentDefinition({
            id: 'searcher',
            name: 'Web Searcher',
            model: 'anthropic/claude-sonnet-4-20250514',
            systemPrompt: 'You search the web.',
            allowedTools: ['web_search'],
            budgets: { maxTokens: 3000, maxToolCalls: 2, timeoutMs: 30000 },
        }),
        summarizer: createAgentDefinition({
            id: 'summarizer',
            name: 'Summarizer',
            model: 'anthropic/claude-sonnet-4-20250514',
            systemPrompt: 'You summarize content.',
            allowedTools: [],
            budgets: { maxTokens: 2000, maxToolCalls: 0, timeoutMs: 15000 },
        }),
    },

    // HITL policy for sub-agents
    hitl: {
        requireApprovalForSubagents: false, // Auto-approve
    },
});
```

## Using Memory

Access memory for context enhancement:

```javascript
async handleCommand(command, args, context) {
    const memoryStore = this.context.memoryStore;

    // Recall relevant memories before execution
    const memories = await memoryStore.recall({
        query: args,
        memoryTypes: ['world', 'experience'],
        limit: 5,
    });

    // Include in run request parameters
    const request = createRunRequest(MY_AGENT.id, runContext, {
        relevantMemories: memories,
    });

    // After run completes, retain new knowledge
    for await (const event of this.context.runController.startRun(request)) {
        if (event.type === EventType.RUN_COMPLETED) {
            await memoryStore.retain({
                bankId: 'default',
                memoryType: 'experience',
                content: `Completed ${command}: ${args}`,
                sourceRef: { runId: event.runId },
            });
        }
    }
}
```

## Debugging

Enable debug logging to trace execution:

```javascript
import { enableAgentDebug, setAgentLogLevel } from '/static/js/agent/index.js';

async onLoad() {
    // Enable debug mode in development
    if (process.env.NODE_ENV === 'development') {
        enableAgentDebug();
        setAgentLogLevel('DEBUG');
    }
}
```

Or via browser console:

```javascript
window.enableAgentDebug();
window.setAgentLogLevel('TRACE');
```

## Example: Migrating Committee Plugin

Here's how the committee plugin could be migrated (conceptual):

```javascript
// Before: Multiple direct LLM calls
class CommitteeFeature extends FeaturePlugin {
    async handleCommand(command, args, context) {
        const models = ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-pro'];
        const opinions = await Promise.all(
            models.map(model => this.chat.stream({ model, messages: [...] }))
        );
        // ... synthesis
    }
}

// After: Agent with sub-agents for each model
const COMMITTEE_AGENT = createAgentDefinition({
    id: 'committee',
    name: 'LLM Committee',
    systemPrompt: 'You synthesize opinions from multiple LLMs.',
    subagents: {
        openai: createAgentDefinition({ id: 'openai-opinion', model: 'openai/gpt-4o', ... }),
        anthropic: createAgentDefinition({ id: 'anthropic-opinion', model: 'anthropic/claude-sonnet-4-20250514', ... }),
        google: createAgentDefinition({ id: 'google-opinion', model: 'google/gemini-pro', ... }),
    },
});
```

## See Also

- [Agent Architecture ADR](../explanation/agent-architecture.md) - Design decisions
- [example-agent-plugin.js](../../src/canvas_chat/static/js/example-plugins/example-agent-plugin.js) - Complete example
- [example-minimal-agent.js](../../src/canvas_chat/static/js/example-plugins/example-minimal-agent.js) - Minimal example
