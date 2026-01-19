# Canvas Event Handlers Registration

Canvas event handlers are registered once per feature via `FeatureRegistry`.

## Registration Pattern

Plugins should use `getCanvasEventHandlers()` in their FeaturePlugin class:

```javascript
class MyFeature extends FeaturePlugin {
    getCanvasEventHandlers() {
        return {
            myCustomEvent: this.handleMyEvent.bind(this),
        };
    }
}
```

## Do NOT Modify app.js

Previous pattern (now deprecated):

- Adding callback property to `canvas.js` constructor
- Binding handler in `app.js`
- Modifying two files per event handler

Current pattern (recommended):

- Define `getCanvasEventHandlers()` in your plugin
- FeatureRegistry handles registration automatically
- No modifications to `app.js` or `canvas.js` needed

## Error to Avoid

The following pattern causes duplicate event handlers:

```javascript
// WRONG - This will register handlers twice
// 1. Once in feature-registry.js during plugin registration
// 2. Once in app.js via registerFeatureCanvasHandlers()

// The registerFeatureCanvasHandlers() method has been removed.
// Only use getCanvasEventHandlers() pattern.
```

## Related

- [Plugin-scoped event handlers](../architecture-patterns.md#plugin-scoped-event-handlers) in AGENTS.md
- [Feature Plugin API](feature-plugin-api.md)
- [Feature Registry API](feature-registry-api.md)
