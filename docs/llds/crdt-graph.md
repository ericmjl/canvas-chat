# CRDTGraph: Chat History Data Model

**Created**: 2026-03-16
**Status**: Design Phase

## Context and Design Philosophy

The graph data model stores chat conversation history. Every message, its position on canvas, and relationships to other messages (replies, branches) are tracked here. Using CRDT (Conflict-free Replicated Data Type) enables future multiplayer collaboration and handles conflict resolution gracefully.

## Yjs Integration

### CRDT Structures

```javascript
yNodes; // Y.Map - nodeId → node properties
yEdges; // Y.Array - array of edge objects
yTags; // Y.Map - tag color → {name, color}
```

### Value Handling

Different node properties use different Yjs types:

| Property         | Yjs Type  | Why                                  |
| ---------------- | --------- | ------------------------------------ |
| `content`        | `Y.Text`  | Collaborative editing, delta updates |
| `position`       | `Y.Map`   | x, y coordinates                     |
| `tags`           | `Y.Array` | List of tag colors                   |
| `cells` (matrix) | `Y.Map`   | Nested object structure              |
| `metadata`       | `Y.Map`   | Generic nested, recursively handled  |

### Duck Typing

The graph uses duck typing instead of `instanceof` to check Yjs types. This avoids issues with Yjs object duplication after IndexedDB round-trips.

## Persistence

### IndexedDB

Data persists to browser IndexedDB via `y-indexeddb`:

```text
Database: crdt-{sessionId}
```

### Legacy Data Fallback

On load:

1. Load from IndexedDB (CRDT)
2. Also load from legacy IndexedDB (simple JSON)
3. CRDT data overlays on legacy
4. This ensures backward compatibility

## Graph Traversal

### Relationships

- **Parents**: Nodes that this node replies to
- **Children**: Nodes that reply to this node
- **Descendants**: All children, recursively
- **Ancestors**: All parents, recursively

### Useful Queries

| Method                | Returns                                |
| --------------------- | -------------------------------------- |
| `getParents(nodeId)`  | Nodes with edges pointing to this node |
| `getChildren(nodeId)` | Nodes this node points to              |
| `getRootNodes()`      | Nodes with no parents                  |
| `getLeafNodes()`      | Nodes with no children                 |
| `topologicalSort()`   | Nodes in dependency order              |

## Events

The graph emits events when data changes:

| Event                        | When                |
| ---------------------------- | ------------------- |
| `nodeAdded`                  | Node added to graph |
| `nodeRemoved`                | Node removed        |
| `nodeUpdated`                | Properties changed  |
| `edgeAdded`                  | Edge created        |
| `edgeRemoved`                | Edge removed        |
| `tagCreated/Updated/Deleted` | Tag changes         |

These events let the Canvas know to re-render.

## Multiplayer (Optional)

WebRTC provider enables peer-to-peer sync:

- **Signaling**: Current host + `/signal` endpoint
- **Awareness**: See other users' cursors, lock nodes during edit

This is optional - single-user mode works without it.

## Open Questions & Future Decisions

### Resolved

1. ✅ CRDT chosen over OT or simple JSON - better conflict resolution for multiplayer
2. ✅ Legacy data as source of truth - ensures consistency during migration

### Deferred

1. How to handle very large graphs? Virtualization?
2. Sync conflicts in multiplayer - need UX for resolution

## References

- HLD: `/docs/high-level-design.md`
- Implementation: `src/canvas_chat/static/js/crdt-graph.js`
