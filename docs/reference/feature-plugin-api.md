# FeaturePlugin API reference

This document describes the `FeaturePlugin` base class API for creating Level 2 plugins (feature plugins with slash commands and multi-step workflows).

## Class: FeaturePlugin

Base class for all feature plugins. Provides dependency injection via `AppContext` and defines the plugin lifecycle.

### Constructor

```javascript
constructor(context: AppContext)
```

**Parameters:**

- `context` - AppContext instance providing access to Canvas-Chat APIs

**Usage:**

```javascript
class MyFeature extends FeaturePlugin {
    constructor(context) {
        super(context);

        // Access APIs
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.chat = context.chat;

        // Initialize feature state
        this.myState = {};
    }
}
```

**Note:** Always call `super(context)` before accessing context properties.

## Lifecycle hooks

### onLoad()

```javascript
async onLoad(): Promise<void>
```

Called when the plugin is registered and loaded. Use for initialization.

**When it's called:**

- After plugin registration via `FeatureRegistry.register()`
- Before any slash commands are routed to the plugin
- After event subscriptions are registered

**Common uses:**

- Load saved state from storage
- Initialize resources
- Set up timers or intervals
- Log plugin loading

**Example:**

```javascript
async onLoad() {
    console.log('[MyFeature] Loaded');

    // Load saved state
    const savedData = this.storage.getItem('my-feature-state');
    if (savedData) {
        this.state = JSON.parse(savedData);
    }

    // Initialize resources
    this.workers = new Map();

    // Log to user
    this.showToast?.('MyFeature loaded', 'info');
}
```

### onUnload()

```javascript
async onUnload(): Promise<void>
```

Called when the plugin is unregistered. Use for cleanup.

**When it's called:**

- Via `FeatureRegistry.unregister(pluginId)`
- Before plugin removal from registry
- After event subscriptions are removed

**Common uses:**

- Save state to storage
- Abort ongoing operations
- Clear timers/intervals
- Release resources

**Example:**

```javascript
async onUnload() {
    console.log('[MyFeature] Unloaded');

    // Save state
    this.storage.setItem('my-feature-state', JSON.stringify(this.state));

    // Abort operations
    for (const [id, worker] of this.workers.entries()) {
        worker.abort();
    }
    this.workers.clear();

    // Log to user
    this.showToast?.('MyFeature unloaded', 'info');
}
```

## Event subscriptions

### getEventSubscriptions()

```javascript
getEventSubscriptions(): Object<string, Function>
```

Returns an object mapping event names to handler functions for feature registry events.

**Returns:**

Object where:

- Key: Event name (string)
- Value: Handler function (receives `CanvasEvent` or `CancellableEvent`)

**Example:**

```javascript
getEventSubscriptions() {
    return {
        'node:created': this.onNodeCreated.bind(this),
        'node:deleted': this.onNodeDeleted.bind(this),
        'selfheal:before': this.onSelfHealBefore.bind(this),
    };
}
```

### getCanvasEventHandlers()

```javascript
getCanvasEventHandlers(): Object<string, Function>
```

Returns an object mapping canvas event names to handler functions. These handlers are automatically registered on the canvas when the plugin loads and unregistered when the plugin unloads.

**When to use:**

- Your plugin creates custom node types that emit canvas events (e.g., `canvas.emit('myCustomEvent', nodeId, ...args)`)
- You need to handle interactions with custom nodes (clicks, votes, etc.)
- You want to keep event handling logic within your plugin (self-contained)

**Returns:**

Object where:

- Key: Canvas event name (string)
- Value: Handler function (receives event arguments directly, not wrapped in an event object)

**Example:**

```javascript
getCanvasEventHandlers() {
    return {
        'pollVote': this.handlePollVote.bind(this),
        'pollAddOption': this.handlePollAddOption.bind(this),
        'pollResetVotes': this.handlePollResetVotes.bind(this),
    };
}

handlePollVote(nodeId, optionIndex) {
    const node = this.graph.getNode(nodeId);
    // Update votes...
    this.graph.updateNode(nodeId, { votes: node.votes });
    this.canvas.renderNode(node);
}
```

**Note:** Canvas event handlers receive arguments directly from `canvas.emit()`, unlike feature registry events which wrap data in event objects.

```javascript
onNodeCreated(event) {
    const { nodeId, nodeType } = event.data;
    console.log('Node created:', nodeId, nodeType);
}

onSelfHealBefore(event) {
    // Can prevent self-healing
    if (event.data.attemptNum > 2) {
        event.preventDefault();
        console.log('Prevented self-healing after 2 attempts');
    }
}

```

**Available events:**

See [Extension Hooks Reference](./extension-hooks.md) for complete event listing.

**Event ordering:**

- Events fire in plugin registration order (first registered, first called)
- Multiple plugins can subscribe to the same event
- First plugin to call `preventDefault()` wins (on `CancellableEvent`)

## Helper methods

### showToast()

```javascript
showToast(message: string, type: string): void
```

Display a toast notification to the user.

**Parameters:**

- `message` - Text to display
- `type` - One of: `'info'`, `'success'`, `'warning'`, `'error'`

**Example:**

```javascript
this.showToast('Operation completed', 'success');
this.showToast('Node not found', 'error');
this.showToast('Processing...', 'info');
```

**Note:** `showToast` may be `undefined` in test environments. Use optional chaining:

```javascript
this.showToast?.('Message', 'info');
```

### emit()

```javascript
emit(eventName: string, event: CanvasEvent): void
```

Emit a custom event to the event bus.

**Parameters:**

- `eventName` - Unique event identifier
- `event` - CanvasEvent or CancellableEvent instance

**Example:**

```javascript
import { CanvasEvent } from '/static/js/plugin-events.js';

// Emit simple event
this.emit(
    'myfeature:started',
    new CanvasEvent('myfeature:started', {
        featureId: this.id,
        timestamp: Date.now(),
    })
);

// Emit cancellable event
import { CancellableEvent } from '/static/js/plugin-events.js';

const event = new CancellableEvent('myfeature:before-action', {
    action: 'delete',
    nodeId: 'node-123',
});

this.emit('myfeature:before-action', event);

if (event.defaultPrevented) {
    console.log('Action cancelled by another plugin');
    return;
}
```

## Inherited properties (via AppContext)

All properties from `AppContext` are available via `this.context` or directly:

### Graph API

```javascript
this.graph: CRDTGraph
```

Graph data structure managing nodes and edges.

**Common methods:**

```javascript
// Nodes
this.graph.addNode(node);
this.graph.getNode(nodeId);
this.graph.updateNode(nodeId, updates);
this.graph.deleteNode(nodeId);
this.graph.getAllNodes();
this.graph.getLeafNodes();

// Edges
this.graph.addEdge(edge);
this.graph.getEdge(edgeId);
this.graph.deleteEdge(edgeId);
this.graph.getEdgesForNode(nodeId);

// Traversal
this.graph.resolveContext(nodeIds); // Get conversation context
this.graph.getVisibleSubtree(nodeId); // Get expanded descendants

// Positioning
this.graph.autoPosition(parentIds); // Calculate position for new node
```

### Canvas API

```javascript
this.canvas: Canvas
```

Visual canvas for rendering and interaction.

**Common methods:**

```javascript
// Rendering
this.canvas.renderNode(node);
this.canvas.removeNode(nodeId);
this.canvas.updateNodeContent(nodeId, content, isStreaming);

// Selection
this.canvas.getSelectedNodeIds(); // Returns: string[]
this.canvas.clearSelection();

// Viewport
this.canvas.centerOnAnimated(x, y, duration);
this.canvas.panToNodeAnimated(nodeId);

// Streaming controls
this.canvas.showStopButton(nodeId);
this.canvas.hideStopButton(nodeId);
this.canvas.showContinueButton(nodeId);
this.canvas.hideContinueButton(nodeId);

// Edges
this.canvas.renderEdge(edge, fromPosition, toPosition);
this.canvas.removeEdge(edgeId);
```

### Chat API

```javascript
this.chat: Chat
```

LLM communication interface.

**Common methods:**

```javascript
// Get API credentials
const apiKey = this.chat.getApiKeyForModel(model);
const baseUrl = this.chat.getBaseUrlForModel(model);

// Send message (streaming)
await this.chat.sendMessage(
    messages, // Array of {role, content}
    model, // Model ID
    onChunk, // (chunk, fullContent) => void
    onDone, // () => void
    onError, // (error) => void
    signal // AbortSignal (optional)
);

// Summarize (non-streaming)
const summary = await this.chat.summarize(messages, model);

// Token estimation
const tokens = this.chat.estimateTokens(text, model);
```

### Storage API

```javascript
this.storage: Storage
```

LocalStorage wrapper for persistence.

**Common methods:**

```javascript
// Key-value storage
this.storage.setItem(key, value);
const value = this.storage.getItem(key);
this.storage.removeItem(key);

// Session management
this.storage.saveSession(session);
const session = this.storage.getSession(sessionId);

// API keys (read-only)
const apiKeys = this.storage.getApiKeys();
const exaKey = this.storage.getExaApiKey();
```

### Model picker

```javascript
this.modelPicker: HTMLSelectElement
```

UI element for model selection.

**Usage:**

```javascript
const model = this.modelPicker.value; // Current selected model
console.log('Using model:', model); // e.g., 'openai/gpt-4'
```

### Feature registry

```javascript
this.featureRegistry: FeatureRegistry
```

Plugin registry for accessing other plugins.

**Common methods:**

```javascript
// Get other plugins
const otherPlugin = this.featureRegistry.getFeature('other-plugin-id');

// Emit events
this.featureRegistry.emit('my-event', event);

// Get registered commands
const commands = this.featureRegistry.getSlashCommands();
```

### App instance

```javascript
this.app: App
```

Main application instance (use sparingly, prefer specific APIs).

**Common methods:**

```javascript
// Session management
this.app.saveSession();

// Modals (prefer custom modals in your plugin)
this.app.modalManager.showModal(modalId);
```

## Slash command handlers

Slash command handlers are registered via `FeatureRegistry` and called when users type the command.

### Handler signature

```javascript
async handlerMethod(command: string, args: string, context: Object): Promise<void>
```

**Parameters:**

- `command` - Full command string (e.g., `'/mycommand'`)
- `args` - Everything after the command (e.g., `'arg1 arg2'`)
- `context` - Object with:
  - `text` - Selected text or node content (string)

**Example:**

```javascript
async handleMyCommand(command, args, context) {
    console.log('Command:', command);  // '/mycommand'
    console.log('Args:', args);        // 'arg1 arg2'
    console.log('Context:', context.text); // Selected text or ''

    // Parse args
    const parts = args.split(' ');
    const firstArg = parts[0];

    // Use context
    if (context.text) {
        console.log('User selected:', context.text);
    }

    // Implement command logic
    await this.doSomething(firstArg);
}
```

## Best practices

### State management

**Do:**

```javascript
constructor(context) {
    super(context);

    // Per-instance state for concurrent operations
    this.operations = new Map();

    // Feature-wide state
    this.config = {};
}
```

**Don't:**

```javascript
constructor(context) {
    super(context);

    // Single variables for concurrent operations
    this.currentOperation = null; // BAD: only one operation can run
}
```

### Resource cleanup

Always clean up in `onUnload()`:

```javascript
async onUnload() {
    // Abort ongoing operations
    for (const [id, op] of this.operations.entries()) {
        op.abortController.abort();
    }
    this.operations.clear();

    // Clear intervals
    if (this.intervalId) {
        clearInterval(this.intervalId);
    }

    // Save state
    this.storage.setItem('state', JSON.stringify(this.state));
}
```

### Error handling

Always handle errors in async operations:

```javascript
async handleCommand(command, args, context) {
    try {
        await this.doAsyncWork(args);
        this.showToast('Success!', 'success');
    } catch (error) {
        console.error('Command failed:', error);
        this.showToast(`Error: ${error.message}`, 'error');
    }
}
```

### Binding event handlers

Bind methods correctly:

```javascript
getEventSubscriptions() {
    return {
        // Correct: bind this
        'my-event': this.onMyEvent.bind(this),

        // Wrong: loses 'this' context
        // 'my-event': this.onMyEvent,
    };
}
```

## Testing

Test plugins with `PluginTestHarness`:

```javascript
import { PluginTestHarness } from '/static/js/plugin-test-harness.js';

const harness = new PluginTestHarness();

await harness.loadPlugin({
    id: 'my-feature',
    feature: MyFeature,
    slashCommands: [{ command: '/mycommand', handler: 'handleMyCommand' }],
});

// Test command
await harness.executeCommand('/mycommand', 'arg', { text: 'context' });

// Test event
const event = new CanvasEvent('test-event', { data: 'value' });
await harness.emitEvent('test-event', event);

// Verify
const nodes = harness.mockCanvas.getRenderedNodes();
console.assert(nodes.length === 1);

// Cleanup
await harness.unloadPlugin('my-feature');
```

## See also

- [How to Create Feature Plugins](../how-to/create-feature-plugins.md)
- [AppContext API Reference](./app-context-api.md)
- [Extension Hooks Reference](./extension-hooks.md)
- [FeatureRegistry API Reference](./feature-registry-api.md)
