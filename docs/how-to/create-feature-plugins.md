# How to create feature plugins

This guide shows you how to extend Canvas-Chat with custom features using the Level 2 plugin system.

## Overview

Feature plugins enable complex, multi-step workflows beyond simple node rendering. With feature plugins, you can:

- Create slash commands that orchestrate multiple LLM calls
- Manage stateful workflows (e.g., committee discussions, research pipelines)
- Access Canvas-Chat APIs (graph, canvas, chat, storage, modals)
- Subscribe to application events
- Extend existing features with custom behaviors

## Prerequisites

- Canvas-Chat running locally or deployed
- Basic JavaScript knowledge (ES modules, async/await, classes)
- Understanding of Canvas-Chat's node system

## Quick start

Here's a minimal feature plugin:

```javascript
/**
 * Bookmark Manager Plugin
 * Adds /bookmark command to save important nodes for later review
 */

import { FeaturePlugin } from '/static/js/feature-plugin.js';
import { NodeType, createNode } from '/static/js/graph-types.js';

class BookmarkFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.bookmarks = new Set();
    }

    async onLoad() {
        console.log('[BookmarkFeature] Loaded');
    }

    async handleBookmark(command, args, context) {
        const selectedIds = this.canvas.getSelectedNodeIds();

        if (selectedIds.length === 0) {
            this.showToast('Select a node to bookmark', 'warning');
            return;
        }

        for (const nodeId of selectedIds) {
            this.bookmarks.add(nodeId);
        }

        this.showToast(`Bookmarked ${selectedIds.length} node(s)`, 'success');
    }
}

// Register the plugin
export { BookmarkFeature };
```

## Architecture overview

### The three plugin levels

Canvas-Chat supports three levels of extensibility:

| Level       | Capability         | Use Case                                               |
| ----------- | ------------------ | ------------------------------------------------------ |
| **Level 1** | Custom node types  | Custom rendering, simple interactions                  |
| **Level 2** | Feature plugins    | Multi-step workflows, slash commands, state management |
| **Level 3** | Feature extensions | Hook into existing features, modify behaviors          |

This guide covers **Level 2**.

### How feature plugins work

1. **Registration**: Plugins are registered with the `FeatureRegistry`
2. **Dependency injection**: Plugins receive an `AppContext` with access to all Canvas-Chat APIs
3. **Lifecycle**: Plugins have `onLoad()` and `onUnload()` hooks
4. **Slash commands**: Plugins can register slash commands that route to handler methods
5. **Events**: Plugins can emit and subscribe to events

## Step 1: Create a feature class

All feature plugins extend `FeaturePlugin`:

```javascript
import { FeaturePlugin } from '/static/js/feature-plugin.js';

class MyFeature extends FeaturePlugin {
    constructor(context) {
        super(context);

        // Access Canvas-Chat APIs via context
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.chat = context.chat;
        this.storage = context.storage;
        this.app = context.app;

        // Initialize feature state
        this.myState = {};
    }
}
```

### Available APIs (via AppContext)

The `context` parameter provides access to:

| API               | Description          | Common Methods                                                |
| ----------------- | -------------------- | ------------------------------------------------------------- |
| `graph`           | Graph data structure | `addNode()`, `getNode()`, `addEdge()`, `autoPosition()`       |
| `canvas`          | Visual canvas        | `renderNode()`, `updateNodeContent()`, `getSelectedNodeIds()` |
| `chat`            | LLM communication    | `sendMessage()`, `getApiKeyForModel()`, `summarize()`         |
| `storage`         | LocalStorage wrapper | `getSession()`, `saveSession()`, `getApiKeys()`               |
| `modelPicker`     | Model selector UI    | `value` property (current model)                              |
| `featureRegistry` | Plugin registry      | `emit()`, `getFeature()`                                      |
| `showToast()`     | Toast notifications  | Call directly: `this.showToast(msg, type)`                    |

## Step 2: Implement lifecycle hooks

### onLoad() - Initialization

Called when the plugin is registered:

```javascript
async onLoad() {
    console.log('[MyFeature] Loaded');

    // Load saved state
    const savedData = this.storage.getItem('my-feature-data');
    if (savedData) {
        this.myState = JSON.parse(savedData);
    }

    // Initialize any resources
    await this.initializeResources();
}
```

### onUnload() - Cleanup

Called when the plugin is unregistered:

```javascript
async onUnload() {
    console.log('[MyFeature] Unloaded');

    // Save state
    this.storage.setItem('my-feature-data', JSON.stringify(this.myState));

    // Clean up resources
    this.cleanup();
}
```

## Step 3: Register slash commands

Slash commands are registered when loading the plugin:

```javascript
// In your plugin file
export { MyFeature };

// Elsewhere (usually in FeatureRegistry or app.js):
await featureRegistry.register({
    id: 'my-feature',
    feature: MyFeature,
    slashCommands: [
        {
            command: '/mycommand',
            handler: 'handleMyCommand',
        },
    ],
    priority: PRIORITY.COMMUNITY, // or PRIORITY.BUILTIN, PRIORITY.OFFICIAL
});
```

### Implementing command handlers

Command handlers receive three parameters:

```javascript
async handleMyCommand(command, args, context) {
    // command: '/mycommand' (the full command string)
    // args: 'foo bar' (everything after the command)
    // context: { text: 'selected text or node content' }

    console.log('User typed:', command, args);
    console.log('Context:', context.text);

    // Your logic here
}
```

### Command handler patterns

#### Pattern 1: Create nodes based on user input

```javascript
async handleNote(command, args, context) {
    const noteContent = args.trim();

    if (!noteContent) {
        this.showToast('Please provide note content', 'warning');
        return;
    }

    const selectedIds = this.canvas.getSelectedNodeIds();
    const position = this.graph.autoPosition(selectedIds);

    const node = createNode(NodeType.NOTE, noteContent, { position });
    this.graph.addNode(node);
    this.canvas.renderNode(node);

    this.app.saveSession();
}
```

#### Pattern 2: Multi-step LLM workflow

```javascript
async handleAnalyze(command, args, context) {
    const selectedIds = this.canvas.getSelectedNodeIds();

    if (selectedIds.length === 0) {
        this.showToast('Select nodes to analyze', 'warning');
        return;
    }

    // Step 1: Gather context from selected nodes
    const contextNodes = this.graph.resolveContext(selectedIds);
    const messages = buildMessagesForApi(contextNodes);

    // Step 2: Create AI node
    const model = this.modelPicker.value;
    const aiNode = createNode(NodeType.AI, '', {
        position: this.graph.autoPosition(selectedIds),
        model: model.split('/').pop(),
    });
    this.graph.addNode(aiNode);
    this.canvas.renderNode(aiNode);

    // Step 3: Stream LLM response
    const abortController = new AbortController();

    await this.chat.sendMessage(
        messages,
        model,
        // onChunk
        (chunk, fullContent) => {
            this.canvas.updateNodeContent(aiNode.id, fullContent, true);
        },
        // onDone
        () => {
            this.canvas.updateNodeContent(aiNode.id, aiNode.content, false);
            this.app.saveSession();
        },
        // onError
        (error) => {
            this.showToast(`Error: ${error.message}`, 'error');
        },
        abortController.signal
    );
}
```

#### Pattern 3: Show modal for complex input

```javascript
async handleConfigure(command, args, context) {
    // Show custom modal
    const modal = document.getElementById('my-feature-modal');
    modal.classList.remove('hidden');

    // Wait for user input
    const config = await this.waitForModalSubmit(modal);

    // Process configuration
    await this.processConfig(config);
}
```

## Step 4: Subscribe to events

Plugins can react to application events:

```javascript
getEventSubscriptions() {
    return {
        'node:created': this.onNodeCreated.bind(this),
        'node:deleted': this.onNodeDeleted.bind(this),
        'session:loaded': this.onSessionLoaded.bind(this),
    };
}

onNodeCreated(event) {
    const { nodeId, nodeType } = event.data;
    console.log('Node created:', nodeId, nodeType);

    // React to new nodes
    if (nodeType === NodeType.AI) {
        // Track AI responses
    }
}
```

## Step 5: Test your plugin

Use `PluginTestHarness` to test plugins in isolation:

```javascript
import { PluginTestHarness } from '/static/js/plugin-test-harness.js';
import { MyFeature } from './my-feature.js';
import { PRIORITY } from '/static/js/feature-registry.js';

// Create test harness
const harness = new PluginTestHarness();

// Load plugin
await harness.loadPlugin({
    id: 'my-feature',
    feature: MyFeature,
    slashCommands: [
        {
            command: '/mycommand',
            handler: 'handleMyCommand',
        },
    ],
    priority: PRIORITY.COMMUNITY,
});

// Test slash command
await harness.executeCommand('/mycommand', 'test args', {
    text: 'some context',
});

// Verify behavior
const createdNodes = harness.mockCanvas.getRenderedNodes();
console.assert(createdNodes.length === 1, 'Should create one node');

// Test event subscription
await harness.emitEvent('node:created', {
    nodeId: 'test-node',
    nodeType: 'ai',
});

// Verify event handling
const logs = harness.getLogs();
console.assert(logs.includes('Node created'), 'Should log event');

// Unload plugin
await harness.unloadPlugin('my-feature');
```

## Common patterns

### Pattern: Streaming LLM with abort support

```javascript
async streamWithAbort(nodeId, messages, model) {
    const abortController = new AbortController();

    // Track streaming state
    this.streamingNodes.set(nodeId, {
        abortController,
        model,
        messages,
    });

    this.canvas.showStopButton(nodeId);

    try {
        await this.chat.sendMessage(
            messages,
            model,
            // onChunk
            (chunk, fullContent) => {
                this.canvas.updateNodeContent(nodeId, fullContent, true);
            },
            // onDone
            () => {
                this.canvas.updateNodeContent(nodeId, fullContent, false);
                this.canvas.hideStopButton(nodeId);
                this.streamingNodes.delete(nodeId);
            },
            // onError
            (error) => {
                this.showToast(`Error: ${error.message}`, 'error');
                this.canvas.hideStopButton(nodeId);
                this.streamingNodes.delete(nodeId);
            },
            abortController.signal
        );
    } catch (error) {
        console.error('Stream error:', error);
    }
}

stopStreaming(nodeId) {
    const state = this.streamingNodes.get(nodeId);
    if (state) {
        state.abortController.abort();
        this.streamingNodes.delete(nodeId);
        this.canvas.hideStopButton(nodeId);
    }
}
```

### Pattern: Concurrent operations

When multiple instances of an operation can run simultaneously, use `Map` for state:

```javascript
constructor(context) {
    super(context);

    // DON'T: Single state (only one operation can run)
    // this.currentNodeId = null;

    // DO: Per-instance state (many operations can run)
    this.activeOperations = new Map();
}

async processNode(nodeId) {
    const abortController = new AbortController();

    // Store per-operation state
    this.activeOperations.set(nodeId, {
        abortController,
        startTime: Date.now(),
    });

    try {
        await this.doWork(nodeId, abortController.signal);
    } finally {
        this.activeOperations.delete(nodeId);
    }
}

cancelOperation(nodeId) {
    const state = this.activeOperations.get(nodeId);
    if (state) {
        state.abortController.abort();
        this.activeOperations.delete(nodeId);
    }
}
```

### Pattern: Modal interaction

```javascript
async showConfigModal() {
    const modal = document.getElementById('my-feature-modal');
    const form = modal.querySelector('form');

    modal.classList.remove('hidden');

    return new Promise((resolve) => {
        const submitHandler = (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const config = Object.fromEntries(formData);

            modal.classList.add('hidden');
            form.removeEventListener('submit', submitHandler);

            resolve(config);
        };

        form.addEventListener('submit', submitHandler);
    });
}
```

## Best practices

### Do

- ✅ Use `Map` for concurrent operation state (not single variables)
- ✅ Clean up resources in `onUnload()`
- ✅ Show toast notifications for user feedback
- ✅ Handle errors gracefully with try-catch
- ✅ Log plugin lifecycle events
- ✅ Test with `PluginTestHarness`
- ✅ Use `canvas.updateNodeContent(nodeId, content, isStreaming)` for updates
- ✅ Call `app.saveSession()` after making graph changes

### Don't

- ❌ Modify global state directly (use AppContext APIs)
- ❌ Use single variables for concurrent operations (use `Map`)
- ❌ Forget to abort streaming operations on cleanup
- ❌ Skip error handling in async operations
- ❌ Assume plugin load order (use events for coordination)
- ❌ Hardcode model names (use `this.modelPicker.value`)
- ❌ Directly manipulate DOM outside of node content

## Example: Complete feature plugin

Here's a complete example of a "Debate Mode" plugin:

```javascript
/**
 * Debate Mode Plugin
 * Creates a structured debate with pro/con perspectives
 */

import { FeaturePlugin } from '/static/js/feature-plugin.js';
import { NodeType, EdgeType, createNode, createEdge } from '/static/js/graph-types.js';

class DebateFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.debates = new Map(); // Track active debates
    }

    async onLoad() {
        console.log('[DebateFeature] Loaded');
    }

    async handleDebate(command, args, context) {
        const topic = args.trim() || context.text;

        if (!topic) {
            this.showToast('Please provide a debate topic', 'warning');
            return;
        }

        await this.createDebate(topic);
    }

    async createDebate(topic) {
        const model = this.modelPicker.value;
        const selectedIds = this.canvas.getSelectedNodeIds();
        const basePosition = this.graph.autoPosition(selectedIds);

        // Create topic node
        const topicNode = createNode(NodeType.HUMAN, topic, {
            position: basePosition,
        });
        this.graph.addNode(topicNode);
        this.canvas.renderNode(topicNode);

        // Create pro and con nodes
        const proNode = await this.createPerspective(topicNode.id, topic, 'pro', model, {
            x: basePosition.x - 250,
            y: basePosition.y + 200,
        });

        const conNode = await this.createPerspective(topicNode.id, topic, 'con', model, {
            x: basePosition.x + 250,
            y: basePosition.y + 200,
        });

        // Create synthesis node
        await this.createSynthesis([proNode.id, conNode.id], topic, model, {
            x: basePosition.x,
            y: basePosition.y + 400,
        });

        this.app.saveSession();
        this.showToast('Debate created', 'success');
    }

    async createPerspective(parentId, topic, stance, model, position) {
        const prompt = `Argue ${stance === 'pro' ? 'for' : 'against'}: ${topic}`;

        const node = createNode(NodeType.AI, '', {
            position,
            model: model.split('/').pop(),
        });

        this.graph.addNode(node);
        this.canvas.renderNode(node);

        const edge = createEdge(parentId, node.id, EdgeType.REPLY);
        this.graph.addEdge(edge);

        const parentNode = this.graph.getNode(parentId);
        this.canvas.renderEdge(edge, parentNode.position, position);

        // Stream LLM response
        await this.streamResponse(node.id, prompt, model);

        return node;
    }

    async createSynthesis(parentIds, topic, model, position) {
        const prompt = `Synthesize the debate about: ${topic}`;

        const node = createNode(NodeType.SYNTHESIS, '', {
            position,
            model: model.split('/').pop(),
        });

        this.graph.addNode(node);
        this.canvas.renderNode(node);

        for (const parentId of parentIds) {
            const edge = createEdge(parentId, node.id, EdgeType.MERGE);
            this.graph.addEdge(edge);

            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, position);
        }

        await this.streamResponse(node.id, prompt, model);

        return node;
    }

    async streamResponse(nodeId, prompt, model) {
        const abortController = new AbortController();

        this.debates.set(nodeId, { abortController });
        this.canvas.showStopButton(nodeId);

        try {
            await this.chat.sendMessage(
                [{ role: 'user', content: prompt }],
                model,
                (chunk, fullContent) => {
                    this.canvas.updateNodeContent(nodeId, fullContent, true);
                },
                () => {
                    this.canvas.hideStopButton(nodeId);
                    this.debates.delete(nodeId);
                },
                (error) => {
                    this.showToast(`Error: ${error.message}`, 'error');
                    this.canvas.hideStopButton(nodeId);
                    this.debates.delete(nodeId);
                },
                abortController.signal
            );
        } catch (error) {
            console.error('Stream error:', error);
        }
    }

    async onUnload() {
        // Abort all active debates
        for (const [nodeId, state] of this.debates.entries()) {
            state.abortController.abort();
        }
        this.debates.clear();

        console.log('[DebateFeature] Unloaded');
    }
}

export { DebateFeature };
```

## Next steps

- Read the [FeaturePlugin API Reference](../reference/feature-plugin-api.md)
- Learn about [Extension Hooks](../reference/extension-hooks.md) (Level 3 plugins)
- See [AppContext API Reference](../reference/app-context-api.md)
- Study built-in features: `committee.js`, `research.js`, `matrix.js`

## Troubleshooting

### Plugin not loading

- Check browser console for import errors
- Verify `export { MyFeature }` at the end of your file
- Ensure all imports use correct paths

### Slash command not working

- Verify command is registered in `FeatureRegistry`
- Check handler method name matches registration
- Ensure handler method exists on feature class

### API methods undefined

- Verify you're calling APIs via AppContext (e.g., `this.graph`, not `graph`)
- Check that the API exists (see AppContext reference)
- Ensure plugin is loaded after app initialization

### State not persisting

- Use `this.storage.setItem()` to save state
- Call in `onUnload()` or after state changes
- Parse JSON when loading: `JSON.parse(this.storage.getItem(...))`
