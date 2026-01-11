# FeatureRegistry API reference

The `FeatureRegistry` manages all feature plugins, handles slash command routing, and coordinates event communication between plugins.

## Class: FeatureRegistry

Central registry for feature plugins with priority-based slash command resolution.

### Constructor

```javascript
constructor();
```

Creates a new FeatureRegistry instance.

**Usage:**

```javascript
import { FeatureRegistry, PRIORITY } from '/static/js/feature-registry.js';

const registry = new FeatureRegistry();
```

## Configuration

### setAppContext()

```javascript
setAppContext(appContext: AppContext): void
```

Set the application context for dependency injection.

**Must be called before registering any plugins.**

**Example:**

```javascript
const appContext = new AppContext(app);
registry.setAppContext(appContext);
```

## Plugin management

### register()

```javascript
async register(config: PluginConfig): Promise<void>
```

Register a feature plugin.

**Parameters:**

`config` object with:

- `id` (string, required) - Unique plugin identifier
- `feature` (Class, required) - FeaturePlugin class (not instance)
- `slashCommands` (Array, optional) - Slash command configurations
- `priority` (number, optional) - Default priority (default: `PRIORITY.BUILTIN`)

**Slash command config:**

```javascript
{
    command: string,        // e.g., '/mycommand'
    handler: string,        // Method name on feature instance
    priority: number        // Override default (optional)
}
```

**Example:**

```javascript
import { MyFeature } from './my-feature.js';
import { PRIORITY } from '/static/js/feature-registry.js';

await registry.register({
    id: 'my-feature',
    feature: MyFeature,
    slashCommands: [
        {
            command: '/mycommand',
            handler: 'handleMyCommand',
        },
        {
            command: '/other',
            handler: 'handleOther',
            priority: PRIORITY.OVERRIDE, // Higher priority than default
        },
    ],
    priority: PRIORITY.COMMUNITY,
});
```

**What happens on registration:**

1. Instantiates feature class with AppContext
2. Registers slash commands with conflict detection
3. Subscribes to events via `getEventSubscriptions()`
4. Calls `onLoad()` lifecycle hook

**Errors thrown:**

- If `id` is already registered: `"Feature \"id\" is already registered"`
- If AppContext not set: `"AppContext must be set before registering features"`
- If slash command conflict with equal priority: `"Slash command conflict: /command..."`

### unregister()

```javascript
async unregister(id: string): Promise<void>
```

Unregister a feature plugin and clean up.

**Example:**

```javascript
await registry.unregister('my-feature');
```

**What happens:**

1. Calls `onUnload()` lifecycle hook
2. Removes all slash commands owned by plugin
3. Removes event subscriptions
4. Deletes feature instance

### getFeature()

```javascript
getFeature(id: string): FeaturePlugin | undefined
```

Get a registered feature instance by ID.

**Example:**

```javascript
const committeeFeature = registry.getFeature('committee');
if (committeeFeature) {
    committeeFeature.someMethod();
}
```

## Slash command routing

### handleSlashCommand()

```javascript
async handleSlashCommand(
    command: string,
    args: string,
    context: Object
): Promise<boolean>
```

Route a slash command to the appropriate feature.

**Parameters:**

- `command` - Command string (e.g., `'/committee'`)
- `args` - Everything after the command
- `context` - Execution context (e.g., `{ text: 'selected text' }`)

**Returns:**

- `true` if command was handled
- `false` if command not found

**Example:**

```javascript
const handled = await registry.handleSlashCommand('/committee', 'What is the best approach?', {
    text: 'Some context from selected nodes',
});

if (!handled) {
    console.log('Unknown command');
}
```

**Event flow:**

1. Emits `command:before` (cancellable)
2. If not cancelled, calls handler method on feature
3. On success, emits `command:after`
4. On error, emits `command:error` and re-throws

### getSlashCommands()

```javascript
getSlashCommands(): string[]
```

Get all registered slash commands.

**Example:**

```javascript
const commands = registry.getSlashCommands();
console.log('Available:', commands);
// [''/committee', '/matrix', '/factcheck', ...]
```

## Priority system

### PRIORITY constants

```javascript
export const PRIORITY = {
    BUILTIN: 1000, // Built-in commands (default)
    OFFICIAL: 500, // Official plugins
    COMMUNITY: 100, // Third-party plugins
    OVERRIDE: 2000, // Explicit override (highest)
};
```

### Conflict resolution

When multiple plugins register the same slash command:

**Equal priority → Error:**

```javascript
// Both have PRIORITY.BUILTIN (1000)
await registry.register({
    id: 'plugin1',
    feature: Plugin1,
    slashCommands: [{ command: '/test', handler: 'handle' }],
    priority: PRIORITY.BUILTIN,
});

await registry.register({
    id: 'plugin2',
    feature: Plugin2,
    slashCommands: [{ command: '/test', handler: 'handle' }],
    priority: PRIORITY.BUILTIN,
});
// ❌ Throws: "Slash command conflict: /test..."
```

**Different priority → Higher wins:**

```javascript
// Plugin 1: PRIORITY.COMMUNITY (100)
await registry.register({
    id: 'plugin1',
    feature: Plugin1,
    slashCommands: [{ command: '/test', handler: 'handle' }],
    priority: PRIORITY.COMMUNITY,
});

// Plugin 2: PRIORITY.OVERRIDE (2000) - higher priority
await registry.register({
    id: 'plugin2',
    feature: Plugin2,
    slashCommands: [{ command: '/test', handler: 'handle' }],
    priority: PRIORITY.OVERRIDE,
});
// ✅ Plugin2 wins, Plugin1's /test is shadowed
// Warning logged: "Command /test from \"plugin1\" (priority 100) is shadowed..."
```

## Event system

### emit()

```javascript
emit(eventName: string, event: CanvasEvent): void
```

Emit an event to all subscribed plugins.

**Example:**

```javascript
import { CanvasEvent } from '/static/js/plugin-events.js';

const event = new CanvasEvent('node:created', {
    nodeId: 'node-123',
    nodeType: 'ai',
});

registry.emit('node:created', event);
```

### on()

```javascript
on(eventName: string, handler: Function): EventEmitter
```

Subscribe to an event (for manual subscription, not typical for plugins).

**Example:**

```javascript
registry.on('command:after', (event) => {
    console.log('Command executed:', event.data.command);
});
```

**Note:** Plugins use `getEventSubscriptions()` instead of calling `on()` directly.

### getEventBus()

```javascript
getEventBus(): EventEmitter
```

Get the underlying event emitter.

**Example:**

```javascript
const eventBus = registry.getEventBus();
eventBus.emit('custom-event', data);
```

## Built-in events

Events emitted by FeatureRegistry:

| Event            | When                          | Data                             | Cancellable |
| ---------------- | ----------------------------- | -------------------------------- | ----------- |
| `command:before` | Before slash command executes | `{ command, args, context }`     | Yes         |
| `command:after`  | After successful execution    | `{ command, result: 'success' }` | No          |
| `command:error`  | On command error              | `{ command, error }`             | No          |

**Example:**

```javascript
registry.on('command:before', (event) => {
    console.log('About to execute:', event.data.command);

    // Can prevent execution
    if (someCondition) {
        event.preventDefault();
    }
});

registry.on('command:error', (event) => {
    console.error('Command failed:', event.data.command, event.data.error);
});
```

## Best practices

### Plugin registration order

Plugins execute event handlers in registration order:

```javascript
// Plugin A registered first
await registry.register({ id: 'plugin-a', feature: PluginA });

// Plugin B registered second
await registry.register({ id: 'plugin-b', feature: PluginB });

// When event fires:
// 1. PluginA's handler runs
// 2. PluginB's handler runs
```

**Tip:** Register extension plugins (Level 3) after base features (Level 2) to ensure proper hook interception.

### Priority strategy

Choose priorities based on plugin type:

- **Built-in features**: `PRIORITY.BUILTIN` (1000)
- **Official extensions**: `PRIORITY.OFFICIAL` (500)
- **Third-party plugins**: `PRIORITY.COMMUNITY` (100)
- **User overrides**: `PRIORITY.OVERRIDE` (2000)

**Example:**

```javascript
// Built-in /search command
await registry.register({
    id: 'research',
    feature: ResearchFeature,
    slashCommands: [{ command: '/search', handler: 'handleSearch' }],
    priority: PRIORITY.BUILTIN,
});

// User wants custom search behavior
await registry.register({
    id: 'my-search',
    feature: MySearchFeature,
    slashCommands: [{ command: '/search', handler: 'handleSearch' }],
    priority: PRIORITY.OVERRIDE, // Takes precedence
});
```

### Error handling

Always handle errors from `handleSlashCommand()`:

```javascript
try {
    const handled = await registry.handleSlashCommand(command, args, context);
    if (!handled) {
        showToast('Unknown command', 'warning');
    }
} catch (error) {
    console.error('Command error:', error);
    showToast(`Error: ${error.message}`, 'error');
}
```

## Testing

Mock FeatureRegistry for testing:

```javascript
class MockRegistry {
    constructor() {
        this.features = new Map();
        this.events = [];
    }

    async register(config) {
        const instance = new config.feature(mockContext);
        this.features.set(config.id, instance);
    }

    getFeature(id) {
        return this.features.get(id);
    }

    emit(eventName, event) {
        this.events.push({ eventName, event });
    }
}
```

Or use `PluginTestHarness` which includes a real FeatureRegistry.

## See also

- [FeaturePlugin API Reference](./feature-plugin-api.md)
- [AppContext API Reference](./app-context-api.md)
- [Extension Hooks Reference](./extension-hooks.md)
- [How to Create Feature Plugins](../how-to/create-feature-plugins.md)
