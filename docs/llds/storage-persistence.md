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

File layouts and field mapping are described in the
[JSON Canvas format reference](../reference/json-canvas-format.md).

**💾 Export (`exportSession`)**

1. Convert the session with `toJsonCanvas(session)` (`canvas-format.js`): JSON Canvas nodes and edges plus a `canvasChat` namespace on each node, edge, and the document
2. Stamp format version 2 and `exported_at` in the document-level `canvasChat` namespace
3. Download as `.canvaschat` file

**🗺️ Export as JSON Canvas (`exportSessionAsJsonCanvas`)**

1. Convert with `toJsonCanvas(session, { includeExtensions: false })`: spec fields only, no `canvasChat` namespace (lossy)
2. Download as `.canvas` file

### Import

1. Reject files over 50 MB (`checkImportFileSize`), then parse the JSON file (`.canvaschat`, `.canvas`, or `.json`)
2. Detect the format in `parseImportData`:
    - **JSON Canvas** (v2 `.canvaschat` or plain `.canvas`, detected by `isJsonCanvas`): convert with `fromJsonCanvas`. The `canvasChat` namespace restores every field; plain files are mapped to note/reference nodes. Only http(s) link URLs become links, duplicate node ids and missing or duplicate edge ids get fresh ids, and plain files are named after the file
    - **Legacy v1 `.canvaschat`** (internal session layout): validate that `nodes` and `edges` are arrays and load as-is
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
