# AppContext API reference

`AppContext` provides dependency injection for feature plugins, giving controlled access to Canvas-Chat APIs without exposing the entire `App` instance.

## Class: AppContext

Container for Canvas-Chat application APIs, passed to feature plugins via constructor.

### Constructor

```javascript
constructor(app: App)
```

**Parameters:**

- `app` - Main App instance

**Usage:**

```javascript
// In App.initializePluginSystem()
const appContext = new AppContext(this);
this.featureRegistry.setAppContext(appContext);
```

**Note:** App developers create `AppContext`. Plugin developers receive it via their constructor.

## Properties

### graph

```javascript
graph: CRDTGraph;
```

CRDT-backed graph data structure managing nodes and edges.

#### Node operations

**Add node:**

```javascript
const node = createNode(NodeType.NOTE, 'Content', { position: { x: 0, y: 0 } });
context.graph.addNode(node);
```

**Get node:**

```javascript
const node = context.graph.getNode(nodeId);
if (node) {
    console.log(node.content, node.type, node.position);
}
```

**Update node:**

```javascript
context.graph.updateNode(nodeId, {
    content: 'New content',
    position: { x: 100, y: 200 },
});
```

**Delete node:**

```javascript
context.graph.deleteNode(nodeId);
```

**Get all nodes:**

```javascript
const nodes = context.graph.getAllNodes(); // Returns: Array<Node>
```

**Get leaf nodes:**

```javascript
const leaves = context.graph.getLeafNodes(); // Nodes with no children
```

#### Edge operations

**Add edge:**

```javascript
const edge = createEdge(fromNodeId, toNodeId, EdgeType.REPLY);
context.graph.addEdge(edge);
```

**Get edge:**

```javascript
const edge = context.graph.getEdge(edgeId);
```

**Delete edge:**

```javascript
context.graph.deleteEdge(edgeId);
```

**Get node edges:**

```javascript
const edges = context.graph.getEdgesForNode(nodeId); // Returns: Array<Edge>
```

#### Graph traversal

**Resolve conversation context:**

```javascript
// Get message history for LLM
const contextNodes = context.graph.resolveContext([nodeId]);
// Returns: Array of nodes in conversation order
```

**Get visible subtree:**

```javascript
// Get expanded descendants of a node
const subtree = context.graph.getVisibleSubtree(nodeId);
```

#### Auto-positioning

**Calculate position for new node:**

```javascript
const parentIds = context.canvas.getSelectedNodeIds();
const position = context.graph.autoPosition(parentIds);
// Returns: { x: number, y: number }

const newNode = createNode(NodeType.AI, 'Content', { position });
```

### canvas

```javascript
canvas: Canvas;
```

Visual canvas for rendering nodes and managing viewport.

#### Node rendering

**Render node:**

```javascript
context.canvas.renderNode(node);
```

**Remove node:**

```javascript
context.canvas.removeNode(nodeId);
```

**Update node content:**

```javascript
// While streaming
context.canvas.updateNodeContent(nodeId, partialContent, true);

// After completion
context.canvas.updateNodeContent(nodeId, finalContent, false);
```

#### Selection

**Get selected nodes:**

```javascript
const selectedIds = context.canvas.getSelectedNodeIds();
// Returns: string[]
```

**Clear selection:**

```javascript
context.canvas.clearSelection();
```

#### Viewport control

**Center on coordinates:**

```javascript
context.canvas.centerOnAnimated(x, y, durationMs);
```

**Pan to node:**

```javascript
context.canvas.panToNodeAnimated(nodeId);
```

#### Streaming controls

**Show/hide stop button:**

```javascript
context.canvas.showStopButton(nodeId);
context.canvas.hideStopButton(nodeId);
```

**Show/hide continue button:**

```javascript
context.canvas.showContinueButton(nodeId);
context.canvas.hideContinueButton(nodeId);
```

#### Edge rendering

**Render edge:**

```javascript
const fromNode = context.graph.getNode(fromId);
const toNode = context.graph.getNode(toId);

context.canvas.renderEdge(edge, fromNode.position, toNode.position);
```

**Remove edge:**

```javascript
context.canvas.removeEdge(edgeId);
```

### chat

```javascript
chat: Chat;
```

LLM communication interface with streaming support.

#### API credentials

**Get API key for model:**

```javascript
const model = context.modelPicker.value;
const apiKey = context.chat.getApiKeyForModel(model);
```

**Get base URL for model:**

```javascript
const baseUrl = context.chat.getBaseUrlForModel(model);
// Returns custom base URL or null (use default)
```

#### Send message (streaming)

```javascript
const messages = [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello!' },
];

const model = context.modelPicker.value;
const abortController = new AbortController();

await context.chat.sendMessage(
    messages,
    model,
    // onChunk: (chunk, fullContent) => void
    (chunk, fullContent) => {
        context.canvas.updateNodeContent(nodeId, fullContent, true);
    },
    // onDone: () => void
    () => {
        context.canvas.updateNodeContent(nodeId, finalContent, false);
        console.log('Streaming complete');
    },
    // onError: (error) => void
    (error) => {
        console.error('Stream error:', error);
        context.showToast?.(`Error: ${error.message}`, 'error');
    },
    // signal: AbortSignal (optional)
    abortController.signal
);

// To abort:
// abortController.abort();
```

#### Summarize (non-streaming)

```javascript
const messages = [{ role: 'user', content: 'Long text to summarize...' }];

const model = context.modelPicker.value;
const summary = await context.chat.summarize(messages, model);
console.log('Summary:', summary);
```

#### Token estimation

```javascript
const text = 'Some text to analyze';
const model = context.modelPicker.value;
const tokens = context.chat.estimateTokens(text, model);
console.log('Estimated tokens:', tokens);
```

### storage

```javascript
storage: Storage;
```

LocalStorage wrapper for data persistence.

#### Key-value storage

**Set item:**

```javascript
context.storage.setItem('my-plugin-state', JSON.stringify(state));
```

**Get item:**

```javascript
const raw = context.storage.getItem('my-plugin-state');
if (raw) {
    const state = JSON.parse(raw);
}
```

**Remove item:**

```javascript
context.storage.removeItem('my-plugin-state');
```

#### Session management

**Save session:**

```javascript
const session = {
    id: 'session-123',
    nodes: context.graph.getAllNodes(),
    // ... other session data
};

context.storage.saveSession(session);
```

**Get session:**

```javascript
const session = context.storage.getSession('session-123');
```

#### API keys (read-only)

**Get all API keys:**

```javascript
const apiKeys = context.storage.getApiKeys();
// Returns: Object<provider, apiKey>
// Example: { 'openai': 'sk-...', 'anthropic': 'sk-ant-...' }
```

**Get Exa API key:**

```javascript
const exaKey = context.storage.getExaApiKey();
```

### modelPicker

```javascript
modelPicker: HTMLSelectElement;
```

UI dropdown for model selection.

**Get current model:**

```javascript
const model = context.modelPicker.value;
console.log('Selected model:', model); // e.g., 'openai/gpt-4'
```

**Listen for changes:**

```javascript
context.modelPicker.addEventListener('change', (e) => {
    console.log('Model changed to:', e.target.value);
});
```

### chatInput

```javascript
chatInput: HTMLTextAreaElement;
```

Chat input textarea element.

**Get input value:**

```javascript
const text = context.chatInput.value;
```

**Set input value:**

```javascript
context.chatInput.value = 'New text';
```

**Focus input:**

```javascript
context.chatInput.focus();
```

### featureRegistry

```javascript
featureRegistry: FeatureRegistry;
```

Plugin registry for accessing other plugins and emitting events.

#### Get other plugins

```javascript
const otherPlugin = context.featureRegistry.getFeature('other-plugin-id');
if (otherPlugin) {
    otherPlugin.someMethod();
}
```

#### Emit events

```javascript
import { CanvasEvent } from '/static/js/plugin-events.js';

const event = new CanvasEvent('my-custom-event', {
    data: 'some value',
});

context.featureRegistry.emit('my-custom-event', event);
```

#### Get registered commands

```javascript
const commands = context.featureRegistry.getSlashCommands();
console.log('Available commands:', commands);
// Example: ['/committee', '/matrix', '/factcheck', ...]
```

### undoManager

```javascript
undoManager: UndoManager;
```

Undo/redo functionality manager.

**Push action to undo stack:**

```javascript
context.undoManager.pushUndo({
    type: 'nodeMove',
    nodeId: 'node-123',
    before: { x: 0, y: 0 },
    after: { x: 100, y: 100 },
});
```

**Undo last action:**

```javascript
context.undoManager.undo();
```

**Redo last undone action:**

```javascript
context.undoManager.redo();
```

### modalManager

```javascript
modalManager: ModalManager;
```

Modal dialog management system.

**Show plugin modal:**

```javascript
context.modalManager.showPluginModal('my-plugin', 'modal-id');
```

**Hide plugin modal:**

```javascript
context.modalManager.hidePluginModal('my-plugin', 'modal-id');
```

**Get modal element:**

```javascript
const modal = context.modalManager.getPluginModal('my-plugin', 'modal-id');
if (modal) {
    const input = modal.querySelector('#my-input');
}
```

**Register modal template:**

```javascript
context.modalManager.registerModal('my-plugin', 'modal-id', '<div>Modal HTML</div>');
```

### app

```javascript
app: App;
```

Main application instance. **Use sparingly** - prefer specific APIs above.

#### When to use

Only use `app` for methods not available via other APIs:

**Save session:**

```javascript
context.app.saveSession();
```

**Update UI state:**

```javascript
context.app.updateEmptyState();
```

**Access modal manager:**

```javascript
context.app.modalManager.showModal('my-modal-id');
```

### Additional context properties

#### streamingNodes

```javascript
streamingNodes: Map<nodeId, state>
```

Tracks active streaming operations.

**Usage:**

```javascript
// Store streaming state
const abortController = new AbortController();
context.streamingNodes.set(nodeId, {
    abortController,
    model,
    messages,
});

// Later, abort streaming
const state = context.streamingNodes.get(nodeId);
if (state) {
    state.abortController.abort();
    context.streamingNodes.delete(nodeId);
}
```

#### pyodideRunner

```javascript
pyodideRunner: PyodideRunner;
```

Python code execution engine (for code features).

**Usage:**

```javascript
const result = await context.pyodideRunner.runCode(code, nodeId);
console.log('Output:', result.stdout);
console.log('HTML:', result.html);
console.log('Error:', result.error);
```

#### apiUrl

```javascript
apiUrl: string;
```

Base URL for backend API (for proxy/admin mode).

**Usage:**

```javascript
const response = await fetch(`${context.apiUrl}/api/some-endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'value' }),
});
```

#### adminMode

```javascript
adminMode: boolean;
```

Whether admin mode is enabled. In admin mode, models are configured server-side and API keys are not stored in localStorage.

**Usage:**

```javascript
if (context.adminMode) {
    // Admin mode specific logic
    console.log('Admin models:', context.adminModels);
}
```

#### adminModels

```javascript
adminModels: string[];
```

Array of model identifiers configured by admin (only available in admin mode).

**Usage:**

```javascript
if (context.adminMode && context.adminModels.length > 0) {
    // Use admin-configured models
    const model = context.adminModels[0];
}
```

## Helper functions

### showToast()

```javascript
context.showToast(message: string, type: string): void
```

Display toast notification.

**Parameters:**

- `message` - Text to display
- `type` - `'info'`, `'success'`, `'warning'`, `'error'`

**Usage:**

```javascript
context.showToast?.('Operation completed', 'success');
```

**Note:** Use optional chaining (`?.`) as it may be undefined in tests.

### updateCollapseButtonForNode()

```javascript
context.updateCollapseButtonForNode(nodeId: string): void
```

Update the collapse/expand button visibility for a node based on whether it has children.

**Usage:**

```javascript
// After adding/removing child nodes, update the collapse button
context.updateCollapseButtonForNode?.(nodeId);
```

**Note:** Use optional chaining (`?.`) as it may be undefined in tests.

## Design rationale

### Why AppContext?

**Problem:** Feature plugins need access to app functionality, but:

- Exposing entire `App` instance creates tight coupling
- Hard to test plugins in isolation
- Difficult to version/evolve APIs

**Solution:** AppContext provides:

✅ **Controlled API surface**: Only expose what plugins need
✅ **Testability**: Mock AppContext for isolated testing
✅ **Versioning**: Can add/deprecate APIs without breaking App internals
✅ **Documentation**: Clear contract between app and plugins

### What NOT to put in AppContext

- Internal app state (e.g., `this.selectedNodes`)
- UI component references (except essential ones like `modelPicker`)
- Methods that modify app structure (use events instead)

### What TO put in AppContext

- Read-only state (e.g., `streamingNodes` for coordination)
- APIs with clear contracts (e.g., `graph`, `canvas`, `chat`)
- Helper functions used by multiple plugins (e.g., `showToast`)

## Example usage

### Complete feature plugin using AppContext

```javascript
import { FeaturePlugin } from '/static/js/feature-plugin.js';
import { NodeType, createNode } from '/static/js/graph-types.js';

class MyFeature extends FeaturePlugin {
    constructor(context) {
        super(context);

        // Store context APIs
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.chat = context.chat;
        this.storage = context.storage;
        this.modelPicker = context.modelPicker;

        // Initialize feature state
        this.operations = new Map();
    }

    async onLoad() {
        console.log('[MyFeature] Loaded');

        // Load saved state
        const saved = this.storage.getItem('my-feature-state');
        if (saved) {
            this.state = JSON.parse(saved);
        }
    }

    async handleMyCommand(command, args, context) {
        // Get selected nodes
        const selectedIds = this.canvas.getSelectedNodeIds();

        // Get model
        const model = this.modelPicker.value;

        // Create new node
        const position = this.graph.autoPosition(selectedIds);
        const node = createNode(NodeType.AI, '', { position, model });

        // Add to graph
        this.graph.addNode(node);
        this.canvas.renderNode(node);

        // Stream LLM response
        const abortController = new AbortController();
        this.operations.set(node.id, { abortController });

        await this.chat.sendMessage(
            [{ role: 'user', content: args }],
            model,
            (chunk, fullContent) => {
                this.canvas.updateNodeContent(node.id, fullContent, true);
            },
            () => {
                this.canvas.updateNodeContent(node.id, node.content, false);
                this.operations.delete(node.id);
                this.showToast?.('Complete', 'success');
            },
            (error) => {
                this.showToast?.(`Error: ${error.message}`, 'error');
                this.operations.delete(node.id);
            },
            abortController.signal
        );
    }

    async onUnload() {
        // Abort all operations
        for (const [nodeId, op] of this.operations.entries()) {
            op.abortController.abort();
        }
        this.operations.clear();

        // Save state
        this.storage.setItem('my-feature-state', JSON.stringify(this.state));

        console.log('[MyFeature] Unloaded');
    }
}

export { MyFeature };
```

## See also

- [FeaturePlugin API Reference](./feature-plugin-api.md)
- [How to Create Feature Plugins](../how-to/create-feature-plugins.md)
- [Extension Hooks Reference](./extension-hooks.md)
