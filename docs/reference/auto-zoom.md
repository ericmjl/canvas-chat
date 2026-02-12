# Viewport focus when creating nodes

Viewport focus is **always explicit**. Adding nodes does not move the viewport unless the caller requests focus.

## Rule

- **Creation does not imply focus.** Use the focus API when you want the view to move.
- **Core:** For the common "add one node and show it" case, use `app.addUserNode(node)`. It adds the node and calls `canvas.zoomToSelectionAnimated([node.id], 0.8, 300)`.
- **Plugins:** When a plugin adds node(s) and wants them in view, call `this.canvas.zoomToSelectionAnimated(nodeIds, 0.8, 300)` or `this.canvas.panToNodeAnimated(nodeId)` after adding.

## Usage

### Core (single node + focus)

```javascript
// In app.js flows: chat, summarize, image extract, highlight reply, etc.
this.addUserNode(node);
// Node is added and viewport zooms to it
```

### Plugins (add then focus when desired)

```javascript
// In a feature plugin: add nodes, then focus if you want
this.graph.addNode(node);
// No zoom yet

// When you want the view to show the new node(s):
this.canvas.zoomToSelectionAnimated([node.id], 0.8, 300);
// Or for multiple nodes (e.g. committee):
this.graph.addNode(node1);
this.graph.addNode(node2);
// ... layout ...
this.canvas.zoomToSelectionAnimated([node1.id, node2.id], 0.8, 300);
```

## nodeAdded behavior

The graph emits `nodeAdded` when a node is added. The app's handler only:

- Renders the new node
- Updates empty state

It does **not** pan or zoom. Focus is always requested explicitly by the code that adds the node (via `addUserNode` or a direct call to `zoomToSelectionAnimated` / `panToNodeAnimated`).

## Related

- [Feature Plugin API](feature-plugin-api.md)
- [App Context API](app-context-api.md)
- AGENTS.md § Design standards → Viewport focus
