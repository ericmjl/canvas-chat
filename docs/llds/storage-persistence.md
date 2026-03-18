# Storage and Persistence

**Created**: 2026-03-16
**Status**: Design Phase

## Context and Design Philosophy

Canvas-Chat is local-first. All user data stays in the browser. The storage system handles two types of data with appropriate storage mechanisms.

## Dual Storage Strategy

### IndexedDB (Sessions)

For large, structured data:

- **What**: Sessions (nodes, edges, tags, timestamps)
- **Database**: `canvas-chat`
- **Store**: `sessions`
- **Why IndexedDB**: Supports large objects, better performance for complex queries

### localStorage (Settings)

For small key-value settings:

- **What**: API keys, model preferences, keybindings
- **Why localStorage**: Simple API, synchronous access, small data

## Session Data Structure

```javascript
{
  id: "uuid",
  name: "My Conversation",
  nodes: [...],
  edges: [...],
  tags: [{name: "Important", color: "#ff0000"}],
  created_at: 1234567890,
  updated_at: 1234567890
}
```

## Settings Keys

| Key                         | Purpose                          |
| --------------------------- | -------------------------------- |
| `canvas-chat-api-keys`      | Provider API keys (JSON)         |
| `canvas-chat-model`         | Current selected model           |
| `canvas-chat-last-session`  | ID of last used session          |
| `canvas-chat-keybindings`   | User keyboard shortcut overrides |
| `canvas-chat-custom-models` | User-defined model configs       |

## Session Lifecycle

### Create

1. Generate UUID
2. Create empty session object
3. Store in IndexedDB
4. Set as last session

### Load

1. Read last session ID from localStorage
2. Fetch session from IndexedDB
3. Initialize CRDTGraph with data
4. Enable persistence

### Save

1. Debounce 500ms after changes
2. Serialize graph to session object
3. Update IndexedDB
4. Also update CRDT IndexedDB (for real-time sync)

### Export

1. Serialize session to JSON
2. Add version metadata
3. Download as `.canvaschat` file

### Import

1. Parse JSON file
2. Validate structure
3. Generate new UUID (avoid conflicts)
4. Store in IndexedDB

## CRDT Persistence

The CRDTGraph has its own persistence layer:

```text
Database: crdt-{sessionId}
```

This is separate from session JSON storage and enables:

- Real-time sync overlay
- Future multiplayer collaboration

## Open Questions & Future Decisions

### Resolved

1. ✅ Dual storage - appropriate mechanism for data type
2. ✅ Debounced saves - balance responsiveness vs performance

### Deferred

1. Session versioning/migration for schema changes?
2. Automatic cleanup of old sessions?

## References

- HLD: `/docs/high-level-design.md`
- Implementation: `src/canvas_chat/static/js/storage.js`
