# Event System: Low-Level Design

**Created**: 2026-03-16
**Status**: Complete
**HLD Reference**: [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The Event system exists because Canvas-Chat is a modular application with multiple independent components that need to communicate without tight coupling. The Canvas must know when the Graph changes. Feature plugins need to respond to user actions. The application needs to coordinate between its core modules (Chat, Graph, Canvas) while remaining extensible.

The design philosophy centers on three principles. First, decoupling through pub/sub: components communicate through events rather than direct method calls, allowing them to evolve independently. Second, structured events over raw payloads: rather than passing arbitrary data, events carry typed payloads that make the system self-documenting and easier to debug. Third, optional cancellation: certain events represent pre-conditions where plugins should be able to intervene before an action completes.

The event system serves as the connective tissue between the CRDT-backed graph, the SVG canvas renderer, and the feature plugins. Without it, each component would need direct references to every other component, creating a tangled architecture that would be difficult to maintain or extend.

## Technical Details

### Core Implementation: EventEmitter

The foundation is a simple pub/sub implementation in `event-emitter.js`. This class provides the standard event emitter pattern with four primary methods: `on()` registers listeners, `off()` removes them, `once()` registers single-fire listeners, and `emit()` dispatches to all registered handlers. The implementation copies the listener array before iteration to prevent modification during emission, which could cause bugs if a handler adds or removes other handlers.

```javascript
class EventEmitter {
    constructor() {
        this._events = new Map();
    }

    on(event, listener) {
        if (!this._events.has(event)) {
            this._events.set(event, []);
        }
        this._events.get(event).push(listener);
        return this;
    }

    emit(event, ...args) {
        if (!this._events.has(event)) return false;
        const listeners = this._events.get(event).slice();
        for (const listener of listeners) {
            listener.apply(this, args);
        }
        return true;
    }
}
```

Three classes extend EventEmitter to serve different roles: Canvas emits UI interaction events, CRDTGraph emits data change events, and FeatureRegistry maintains an internal event bus for plugin communication.

### Structured Event Classes

Rather than passing raw data to emitters, the system uses structured event classes that provide consistency and a cleaner API. The `CanvasEvent` class wraps a type string and data payload with a timestamp, similar to DOM events. The `CancellableEvent` extends this to support the prevention pattern, allowing handlers to call `preventDefault()` and optionally provide a reason.

```javascript
class CancellableEvent extends CanvasEvent {
    constructor(type, data = {}) {
        super(type, data);
        this.cancelled = false;
        this.reason = null;
    }

    preventDefault(reason = '') {
        this.cancelled = true;
        this.reason = reason;
    }

    get defaultPrevented() {
        return this.cancelled;
    }
}
```

This pattern appears throughout the plugin system. When the FeatureRegistry processes slash commands, it emits a `command:before` event using CancellableEvent, allowing plugins to intercept and cancel the command if needed.

### Canvas Events

The Canvas class uses a hybrid approach combining callback properties with event emission. Callback properties serve for high-frequency UI interactions where a single handler is expected, while the internal event system handles broader notifications.

The Canvas defines numerous callback properties in its constructor that App wires to handlers:

| Callback Property | Purpose                      | Handler Location     |
| ----------------- | ---------------------------- | -------------------- |
| `onNodeSelect`    | Node selection changed       | App.handleNodeSelect |
| `onNodeMove`      | Node dragged to new position | App.handleNodeMove   |
| `onNodeDrag`      | Real-time during drag        | Multiplayer sync     |
| `onNodeResize`    | Node resized                 | App.handleNodeResize |
| `onNodeResizing`  | Real-time during resize      | Multiplayer sync     |
| `onNodeDelete`    | Delete key pressed           | App.handleNodeDelete |
| `onNodeReply`     | Reply action triggered       | App.handleNodeReply  |
| `onNodeBranch`    | Branch action triggered      | App.handleNodeBranch |
| `onTagRemove`     | Tag removed from node        | App.handleTagRemove  |

These callbacks are set directly on the Canvas instance rather than using the event emitter, which was a design decision made early in development when the event system was simpler. Newer code prefers the event emitter pattern for its flexibility.

For custom node types, the Canvas also emits events that plugins can intercept. These include actions like `nodeRunCode`, `nodeGenerate`, `nodeSummarize`, and `nodeEditContent`. When a user triggers an action on a node, the Canvas emits the corresponding event, and the App dispatches it to the appropriate handler based on node type.

### Graph Events

The CRDTGraph class extends EventEmitter and emits events when the underlying data model changes. These events notify the Canvas that re-rendering is needed.

| Event         | When Fired            | Data               |
| ------------- | --------------------- | ------------------ |
| `nodeAdded`   | Node created in graph | Node object        |
| `nodeRemoved` | Node deleted          | Node ID            |
| `nodeUpdated` | Properties changed    | Node object        |
| `edgeAdded`   | Edge created          | Edge object        |
| `edgeRemoved` | Edge deleted          | Edge ID            |
| `tagCreated`  | New tag added         | Tag color and name |
| `tagUpdated`  | Tag modified          | Tag color and name |
| `tagDeleted`  | Tag removed           | Tag color          |

The graph emits these events after applying changes to the Yjs data structures. Plugins or UI components that need to react to data changes subscribe to these events on the graph instance.

### Feature Events

The FeatureRegistry maintains an internal event bus that coordinates between plugins and the core application. This bus handles slash command lifecycle events and provides extension points for plugins.

Command events follow a before/after pattern:

| Event            | Type             | Purpose                                                               |
| ---------------- | ---------------- | --------------------------------------------------------------------- |
| `command:before` | CancellableEvent | Fired before command handler executes; handlers can prevent execution |
| `command:after`  | CanvasEvent      | Fired after successful command completion                             |
| `command:error`  | CanvasEvent      | Fired when command throws an exception                                |

The registry emits these during `handleSlashCommand()`. Plugins can subscribe to these events to implement cross-cutting concerns like logging, analytics, or command modification.

```javascript
async handleSlashCommand(command, args, context) {
    const beforeEvent = new CancellableEvent('command:before', { command, args, context });
    this._eventBus.emit('command:before', beforeEvent);

    if (beforeEvent.cancelled) {
        return true;
    }

    try {
        await handlerMethod.call(feature, command, args, context);
        this._eventBus.emit('command:after', new CanvasEvent('command:after', { command, result: 'success' }));
    } catch (error) {
        this._eventBus.emit('command:error', new CanvasEvent('command:error', { command, error }));
        throw error;
    }
}
```

### Extension Hooks

Beyond core events, individual features emit their own events that plugins can intercept. The code execution feature, for example, emits a rich set of events around self-healing: `selfheal:before`, `selfheal:error`, `selfheal:fix`, `selfheal:success`, and `selfheal:failed`. These allow plugins to analyze errors, provide custom fix prompts, or prevent default behavior.

Matrix evaluation similarly emits `matrix:before:fill`, `matrix:cell:prompt`, and `matrix:after:fill` events that plugins can use to intercept cell filling operations.

### Event Flow Summary

The complete event flow spans three layers. At the data layer, CRDTGraph emits node and edge change events when the underlying Yjs structures are modified. At the presentation layer, Canvas emits UI interaction events (selection, dragging, resizing) that App handles. At the application layer, FeatureRegistry emits command lifecycle events that plugins can intercept.

Communication flows upward through events: Graph notifies Canvas of data changes, Canvas notifies App of user actions, and App coordinates FeatureRegistry for plugin handling. This upward flow keeps higher-level components unaware of lower-level implementation details.

## Event Type Reference

### Canvas Callback Properties

The following callback properties are defined on Canvas instances. Set these in App initialization to handle specific interactions:

- `onNodeSelect(selection: string[])` - Selection changed
- `onNodeDeselect(selection: string[])` - Deselected all nodes
- `onNodeMove(nodeId: string, newPos: Position, oldPos: Position)` - Node drag completed
- `onNodeDrag(nodeId: string, pos: Position)` - Real-time during drag
- `onNodeResize(nodeId: string, width: number, height: number)` - Resize completed
- `onNodeResizing(nodeId: string, width: number, height: number)` - Real-time during resize
- `onNodeReply(nodeId: string)` - Reply action triggered
- `onNodeBranch(nodeId: string, text: string, reply: string)` - Branch action triggered
- `onNodeDelete(nodeId: string)` - Delete action triggered
- `onNodeCopy(nodeId: string)` - Copy action triggered
- `onNodeTitleEdit(nodeId: string)` - Title edit initiated
- `onNodeStopGeneration(nodeId: string)` - Stop streaming
- `onNodeContinueGeneration(nodeId: string)` - Continue stopped generation
- `onNodeRetry(nodeId: string)` - Retry failed operation
- `onNodeDismissError(nodeId: string)` - Dismiss error node
- `onNodeFitToViewport(nodeId: string)` - Resize node to viewport
- `onNodeResetSize(nodeId: string)` - Reset node to default size
- `onNodeEditContent(nodeId: string)` - Edit node content
- `onCreateFlashcards(nodeId: string)` - Generate flashcards
- `onNodeRunCode(nodeId: string)` - Execute code
- `onNodeGenerate(nodeId: string)` - Generate code via LLM
- `onTagChipClick(color: string)` - Tag chip clicked
- `onTagRemove(color: string, nodeId: string)` - Tag removed from node

### Canvas Emitted Events

The Canvas emits the following events via its internal EventEmitter:

- `nodeSelect(selection: string[])` - Selection changed
- `nodeDeselect(selection: string[])` - Deselected
- `nodeNavigate(nodeId: string)` - Navigate to node
- `fileDrop(file: File, position: Position)` - File dropped on canvas
- `nodeDrag(nodeId: string, pos: Position)` - Real-time drag
- `nodeMove(nodeId: string, newPos: Position, oldPos: Position)` - Drag completed
- `nodeResize(nodeId: string, width: number, height: number)` - Resize completed
- `nodeResizing(nodeId: string, width: number, height: number)` - Real-time resize
- `nodeOutputResize(nodeId: string, height: number)` - Output panel resized
- `nodeOutputToggle(nodeId: string)` - Output panel toggled
- `imageClick(nodeId: string, src: string, data)` - Image clicked

### Canvas Graph Events

| Event         | Payload                         |
| ------------- | ------------------------------- |
| `nodeAdded`   | `{Node}`                        |
| `nodeRemoved` | `{id: string}`                  |
| `nodeUpdated` | `{Node}`                        |
| `edgeAdded`   | `{Edge}`                        |
| `edgeRemoved` | `{id: string}`                  |
| `tagCreated`  | `{color: string, name: string}` |
| `tagUpdated`  | `{color: string, name: string}` |
| `tagDeleted`  | `{color: string}`               |

### Feature Registry Events

| Event            | Type             | Payload                        |
| ---------------- | ---------------- | ------------------------------ |
| `command:before` | CancellableEvent | `{command, args, context}`     |
| `command:after`  | CanvasEvent      | `{command, result: 'success'}` |
| `command:error`  | CanvasEvent      | `{command, error}`             |

### Feature-Specific Extension Hooks

Code self-healing hooks:

- `selfheal:before` - Before healing begins (cancellable)
- `selfheal:error` - After execution error
- `selfheal:fix` - Before LLM generates fix (cancellable, modifiable)
- `selfheal:success` - After successful fix
- `selfheal:failed` - After exhausting retries

Matrix hooks:

- `matrix:before:fill` - Before cell fill (cancellable)
- `matrix:cell:prompt` - During cell processing
- `matrix:after:fill` - After cell fill completes

## Open Questions & Future Decisions

### Resolved

1. ✅ Hybrid approach (callbacks + events) - keeps backward compatibility

### Deferred

1. Callback properties vs events - whether to migrate all callbacks to event listeners
2. Event namespacing - adopt namespacing for feature-specific events
3. Async event handling - support async handlers
4. Event history/replay - for debugging and undo/redo

## References

- [High-Level Design](../high-level-design.md) - Architecture overview
- [Plugin Architecture](../explanation/plugin-architecture.md) - Three-level plugin system
- [Canvas Event Handlers](../reference/canvas-event-handlers.md) - Handler registration pattern
- [Extension Hooks](../reference/extension-hooks.md) - Plugin hook reference
- [Feature Registry API](../reference/feature-registry-api.md) - Event bus methods
- [Feature Plugin API](../reference/feature-plugin-api.md) - Plugin event subscription
