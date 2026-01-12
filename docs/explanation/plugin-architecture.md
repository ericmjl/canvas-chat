# Plugin architecture

This document explains the design decisions behind Canvas-Chat's three-level plugin system and why it exists.

## The problem

Canvas-Chat started as a monolithic application with all features tightly integrated into `app.js` (~5,600 lines). Adding new features required:

1. **Deep knowledge of app.js internals** - New contributors had to understand the entire codebase
2. **Careful coordination** - Changes to one feature could break others due to shared state
3. **No isolation** - Testing features in isolation was difficult
4. **Risk of conflicts** - Multiple features competing for the same slash commands
5. **No community extensions** - Users couldn't add custom features without forking

This limited Canvas-Chat's extensibility and made it hard for the community to contribute features.

## The solution

We implemented a **three-level plugin architecture** that provides progressively more capability:

### Level 1: Custom node types

**What**: Visual node types with custom rendering and interactions.

**Why**: Many extensions just need to display data differently. A poll plugin needs radio buttons, a chart plugin needs SVG rendering. Custom node types solve this without requiring workflow logic.

**How it works**: The node protocol pattern (see [Node Protocols](node-protocols.md)) lets you define:

- Custom rendering (`renderContent`)
- Action buttons (`getActions`)
- Copy behavior (`copyToClipboard`)
- Summary text for zoom levels (`getSummaryText`)

**Example use cases**:

- Poll nodes with voting buttons
- Chart nodes with data visualizations
- Code nodes with syntax highlighting and run buttons

### Level 2: Feature plugins

**What**: Complex workflows, slash commands, multi-step LLM operations.

**Why**: Many features require orchestrating multiple operations across time:

- Committee discussions need to manage parallel LLM calls and synthesis
- Research pipelines need to search, fetch, summarize, and combine results
- Matrix evaluation needs to create nodes, fill cells concurrently, and update UI

These workflows need:

- **State management** (tracking in-progress operations)
- **Slash commands** (entry points for workflows)
- **API access** (graph, canvas, chat, storage, modals)
- **Lifecycle hooks** (initialization and cleanup)

**How it works**: Feature plugins extend `FeaturePlugin` and receive dependency injection via `AppContext`:

```javascript
class MyFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.graph = context.graph; // Access graph API
        this.canvas = context.canvas; // Access canvas API
        this.chat = context.chat; // Access LLM API
    }

    async onLoad() {
        // Initialize feature
    }

    async handleCommand(command, args, context) {
        // Implement slash command logic
    }
}
```

**Example use cases**:

- Bookmark manager with `/bookmark` and `/bookmarks` commands
- Debate mode with `/debate` to create structured arguments
- Timer plugin with `/pomodoro` for time-boxed work sessions

### Level 3: Extension hooks

**What**: Hook into existing features to modify or extend behaviors.

**Why**: Sometimes you don't want to replace a feature, you want to augment it:

- Enhance self-healing with custom error patterns
- Add pre-processing to matrix cell prompts
- Log analytics for feature usage
- Block certain operations based on policy

Hooks provide **composable extensions** - multiple plugins can subscribe to the same hook without conflicts.

**How it works**: Features emit events at key points. Plugins subscribe to these events:

```javascript
getEventSubscriptions() {
    return {
        'selfheal:before': this.handleBeforeSelfHeal.bind(this),
        'selfheal:error': this.handleError.bind(this),
    };
}
```

**Example use cases**:

- Smart fix plugin that suggests common fixes for known errors
- Analytics plugin that logs feature usage
- Policy plugin that prevents certain operations
- Custom prompt enhancement for matrix cells

## Design decisions

### Why dependency injection?

**Problem**: Direct references to `app` create tight coupling. Plugins would depend on app.js internals, making refactoring difficult.

**Solution**: AppContext provides a **controlled API surface**. Plugins only access what they need via explicit properties. If we change app.js internals, plugins keep working as long as the API stays stable.

### Why event-driven communication?

**Problem**: Direct method calls between features create dependencies. Feature A calling `featureB.doSomething()` means A must know about B.

**Solution**: Event bus enables **loose coupling**. Features emit events, other features subscribe. A doesn't know who's listening, B doesn't know who's emitting. New plugins can subscribe without modifying existing code.

### Why priority-based command routing?

**Problem**: What if two plugins register the same slash command?

**Solution**: Priority system (BUILTIN > OFFICIAL > COMMUNITY) resolves conflicts automatically:

- Built-in features have highest priority (can't be overridden)
- Official plugins (shipped with Canvas-Chat) have medium priority
- Community plugins have lowest priority (can override each other)

If two plugins at the same priority level register the same command, registration fails with a clear error.

### Why lifecycle hooks?

**Problem**: Features need initialization (loading saved state, starting timers) and cleanup (saving state, aborting operations).

**Solution**: `onLoad()` and `onUnload()` provide predictable timing:

- `onLoad()` called after registration, before commands are available
- `onUnload()` called before unregistration, for cleanup

This prevents resource leaks and ensures features can be added/removed dynamically.

### Why backward compatibility?

**Problem**: Migrating six built-in features to plugins could break existing code paths.

**Solution**: Delegation methods in app.js preserve old APIs. Existing code calls `app.handleCommittee()`, which delegates to `committeeFeature.handleCommittee()`. No breaking changes for users.

Over time, we can migrate callers to use the plugin system directly.

## Architecture patterns

### Concurrent operation state

Feature plugins often handle multiple simultaneous operations (e.g., matrix filling multiple cells, committee consulting multiple LLMs).

**Anti-pattern**: Singleton state

```javascript
// WRONG: Only one operation can be active
this.currentNodeId = nodeId;
this.abortController = new AbortController();
```

**Pattern**: Per-instance state with Map

```javascript
// CORRECT: Multiple operations can be active
this.activeOperations = new Map();

this.activeOperations.set(nodeId, {
    abortController: new AbortController(),
    context: { ... }
});
```

Each operation gets isolated state. Operations can be controlled independently.

### Streaming state management

The `StreamingManager` centralizes streaming state for all features:

```javascript
// Register streaming operation
streamingManager.register(nodeId, {
    abortController: new AbortController(),
    featureId: 'ai',
    onContinue: async (nodeId, state) => {
        // Resume generation
    },
});

// Stop streaming (shows continue button if onContinue provided)
streamingManager.stop(nodeId);

// Continue streaming (creates new AbortController, calls onContinue)
streamingManager.continue(nodeId);
```

**Why centralized?**: Multiple features need streaming (ai, committee, matrix, research, code). Each implementing their own state management leads to bugs and inconsistency.

**Benefits**:

- Single source of truth for streaming state
- Consistent stop/continue behavior across features
- Group streaming support (committee, matrix)
- Canvas button management handled automatically

### Modal state

Modal-heavy features (committee, matrix, factcheck) need to:

1. Show a modal to gather user input
2. Wait for user to submit
3. Execute the feature with submitted data

**Pattern**: Modal callback registration

```javascript
openCommitteeModal() {
    // Register callback
    this.modalManager.setOnCommitteeSubmit((data) => {
        this.executeCommittee(data);
    });

    // Show modal
    this.modalManager.showModal('committee-config-modal');
}
```

ModalManager calls the registered callback when the user submits, keeping modal logic separate from feature logic.

## Comparison to other architectures

### WordPress plugins

**Similarities**:

- Hook-based extensibility
- Multiple levels of extension (filters, actions, widgets)
- Community contribution model

**Differences**:

- Canvas-Chat plugins are JavaScript, WordPress plugins are PHP
- Canvas-Chat uses ES modules, WordPress uses global scope
- Canvas-Chat has dependency injection, WordPress uses globals

### VSCode extensions

**Similarities**:

- Extension API with controlled surface area
- Contribution points (commands, views, keybindings)
- Isolation between extensions

**Differences**:

- VSCode extensions run in separate processes, Canvas-Chat plugins run in same context
- VSCode has marketplace, Canvas-Chat has manual installation (for now)
- VSCode extensions use Node.js APIs, Canvas-Chat plugins use browser APIs

### Babel plugins

**Similarities**:

- Transform input (Babel transforms AST, Canvas-Chat plugins transform behaviors)
- Composable (multiple plugins can run in sequence)
- Well-defined visitor pattern

**Differences**:

- Babel plugins are compile-time, Canvas-Chat plugins are runtime
- Babel has a transform pipeline, Canvas-Chat uses event bus
- Babel plugins return new AST, Canvas-Chat plugins modify state

## Migration strategy

We migrated six built-in features to plugins in phases:

1. **Phase 1**: Build core infrastructure (FeaturePlugin, FeatureRegistry, plugin-events)
2. **Phase 2**: Migrate one complex feature (CommitteeFeature) to validate the architecture
3. **Phase 3**: Migrate remaining five features in parallel
4. **Phase 4**: Centralize registration in `FeatureRegistry.registerBuiltInFeatures()`
5. **Phase 5**: Write comprehensive documentation

Each phase preserved backward compatibility through delegation methods in app.js.

### Lessons learned

**What worked**:

- Starting with the most complex feature (committee) exposed edge cases early
- AppContext dependency injection prevented tight coupling
- Priority system prevented command conflicts
- Comprehensive tests caught migration issues

**What we'd do differently**:

- Document the architecture earlier (before migration)
- Create plugin templates from the start
- Build the test harness before migrating features

## Future directions

### Plugin marketplace

A plugin marketplace would enable:

- Discovering community plugins
- One-click installation
- Version management
- Ratings and reviews

This requires:

- Plugin manifest format
- Sandboxing/security model
- Dependency resolution
- Update mechanism

### Hot reloading

Currently, adding a plugin requires refreshing the page. Hot reloading would enable:

- Faster plugin development
- Live plugin updates
- A/B testing plugins

This requires:

- Module invalidation
- State migration on reload
- Cleanup of old plugin resources

### Plugin templates

Scaffolding tools would help plugin developers:

- `npx create-canvas-plugin my-feature` generates boilerplate
- Templates for common patterns (slash commands, streaming, modals)
- Example tests using PluginTestHarness

### Cross-plugin communication

Currently, plugins communicate via events (extension hooks). Future enhancements:

- Plugin-to-plugin RPC (registered services)
- Shared state management (plugin-scoped storage)
- Plugin dependencies (declare dependencies on other plugins)

## Related documentation

- [How to Create Feature Plugins](../how-to/create-feature-plugins.md) - Step-by-step guide
- [FeaturePlugin API Reference](../reference/feature-plugin-api.md) - Complete API docs
- [Extension Hooks Reference](../reference/extension-hooks.md) - Available hooks
- [Node Protocols](node-protocols.md) - Level 1 plugin system explanation
