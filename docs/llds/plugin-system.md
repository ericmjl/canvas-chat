# Plugin System

**Created**: 2026-03-16
**Status**: Design Phase

## Context and Design Philosophy

Canvas-Chat is extensible through plugins. The plugin system lets developers add new features without modifying core code. Three levels of extensibility allow incremental addition of functionality.

## Three-Level Architecture

### Level 1: Custom Node Types

Custom visual representations for nodes:

- **What**: New node rendering, actions, keyboard shortcuts
- **Example**: MatrixNode with table UI, CodeNode with output panel
- **Registration**: `NodeRegistry.register({ type, protocol, defaultSize, css })`

### Level 2: Feature Plugins

Complex workflows with slash commands:

- **What**: Multi-step LLM operations, stateful features
- **Example**: Committee (multiple LLMs), Research (web search + LLM)
- **Registration**: `FeatureRegistry.register({ id, feature, slashCommands })`

### Level 3: Extension Hooks

Hook into existing features:

- **What**: Modify or augment behavior
- **Example**: Logging, validation, analytics
- **Mechanism**: Event subscriptions

## FeaturePlugin Base Class

All feature plugins extend `FeaturePlugin`:

```javascript
class MyFeature extends FeaturePlugin {
    // Slash commands this feature handles
    getSlashCommands() { return [{ command: '/mycmd', ... }] }

    // Handle the command
    async handleCommand(command, args, context) { ... }

    // Subscribe to app events
    getEventSubscriptions() { return { 'nodeAdded': this.onNodeAdded } }

    // Handle canvas events from custom nodes
    getCanvasEventHandlers() { return { 'myEvent': this.handleMyEvent } }

    // Called when plugin loads
    async onLoad() { ... }
}
```

### AppContext

Plugins receive `AppContext` for dependency injection:

```javascript
constructor(context) {
    this.graph = context.graph;
    this.canvas = context.canvas;
    this.chat = context.chat;
    this.storage = context.storage;
    this.modalManager = context.modalManager;
    this.undoManager = context.undoManager;
}
```

## Node Protocols

Custom node types implement the `BaseNode` protocol:

```javascript
class MyNode extends BaseNode {
    getTypeLabel() {
        return 'My Node';
    }
    getTypeIcon() {
        return '📦';
    }
    getSummaryText() {
        return 'Short summary';
    }
    renderContent() {
        return '<div>...</div>';
    }
    getActions() {
        return [Actions.COPY, Actions.EDIT];
    }
    isContentEditable() {
        return true;
    }
}
```

## Slash Command Routing

When user types `/command`:

1. App checks `NodeRegistry` for custom node creation commands
2. App checks `FeatureRegistry` for feature commands
3. First match wins (based on priority)

### Priority Levels

| Priority | Level     | Use                      |
| -------- | --------- | ------------------------ |
| 2000     | OVERRIDE  | Force a specific handler |
| 1000     | BUILTIN   | Core features            |
| 500      | OFFICIAL  | First-party plugins      |
| 100      | COMMUNITY | Third-party extensions   |

## Event System

### Event Bus

`FeatureRegistry` maintains an internal event bus:

```javascript
// Subscribe
featureRegistry.on('eventName', handler);

// Emit
featureRegistry.emit('eventName', { data });
```

### Cancellable Events

Some events can be cancelled:

```javascript
// Command before event - can prevent execution
getEventSubscriptions() {
    return {
        'command:before': (event) => {
            if (shouldBlock) {
                event.preventDefault();
            }
        }
    }
}
```

## File Upload Handlers

Separate registry for file type handlers:

```javascript
FileUploadRegistry.register({
    id: 'pdf',
    extensions: ['.pdf'],
    handler: PdfHandler,
});
```

Priority: BUILTIN (100) > OFFICIAL (50) > COMMUNITY (10)

## Open Questions & Future Decisions

### Resolved

1. ✅ Three-level system - allows both simple and complex extensions
2. ✅ Priority system - resolves conflicts predictably

### Deferred

1. Plugin marketplace? Sharing mechanism?
2. Plugin versioning and updates?

## References

- HLD: `/docs/high-level-design.md`
- Implementation:
  - `src/canvas_chat/static/js/feature-plugin.js`
  - `src/canvas_chat/static/js/feature-registry.js`
  - `src/canvas_chat/static/js/node-registry.js`
  - `src/canvas_chat/static/js/node-protocols.js`
