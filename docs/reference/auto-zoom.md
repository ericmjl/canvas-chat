# Auto-Zoom for Plugins

Plugins can now create nodes that automatically zoom the canvas to the newly created node.

## How It Works

When a plugin calls `this.graph.addNode()` (wrapped in AppContext), the canvas automatically pans and zooms to center the new node.

## Usage

Plugins no longer need to explicitly call any zoom method. Simply add the node:

```javascript
// In your feature plugin
async handleCommand(command, args, context) {
    const node = createNode(NodeType.MY_TYPE, content, { position });
    this.graph.addNode(node);  // Auto-zoom happens automatically
}
```

## Implementation Details

The auto-zoom is implemented in `feature-plugin.js` through a wrapped `graph.addNode()` method:

```javascript
// AppContext wraps graph.addNode() to set auto-zoom flag
addNode(node) {
    const originalAddNode = this.graph.addNode.bind(this.graph);
    this.graph.addNode = (n) => {
        this._userNodeCreation = n;  // Set flag for auto-zoom
        const result = originalAddNode(n);
        this._userNodeCreation = null;  // Clear flag
        return result;
    };
}
```

The canvas listens for node additions and zooms when `_userNodeCreation` is set.

## Requirements

- The plugin must be instantiated via `FeatureRegistry` (uses AppContext)
- Nodes must be created via `this.graph.addNode()` in the plugin
- Works for all node types

## Related

- [Feature Plugin API](feature-plugin-api.md)
- [App Context API](app-context-api.md)
