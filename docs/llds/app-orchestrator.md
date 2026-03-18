# Chat Input and App Orchestrator

**Created**: 2026-03-16
**Status**: Design Phase

## Context and Design Philosophy

The App class is the central orchestrator for Canvas-Chat. It handles the primary user interaction: chatting with LLMs. The chat input is the entry point for all AI interactions - messages typed here flow through to the LLM, and responses become nodes on the canvas.

## Primary Flow: Chat to Node

### User Sends Message

1. User types in chat input and presses Enter (or clicks Send)
2. App creates a `human` node with the message content
3. App sends message to LLM via chat module
4. LLM response streams back token-by-token
5. App creates an `ai` node that updates as response streams
6. Canvas renders both nodes; edge connects them (reply relationship)

### Branching from Selection

When user selects text in any node:

- A tooltip appears with "Reply" option
- Selecting it focuses chat input with context
- The resulting AI response branches from that node (edge type: `branch`)

## Event Routing

The App sits between several subsystems and routes events:

```text
Canvas Events (nodeSelect, nodeMove, etc.)
    ↓
App.handleXxx() methods
    ↓
Graph updates (CRDTGraph)
    ↓
Canvas re-renders
```

Similarly for Graph events and Feature plugin events.

## Key Methods

| Method              | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `handleSend()`      | Process chat input, create nodes, call LLM      |
| `addUserNode(node)` | Add node to graph and canvas, focus viewport    |
| `streamWithAbort()` | Handle streaming LLM response with stop support |

## Session Management

- **Load**: On startup, check last session in localStorage, load from IndexedDB
- **Create**: New session gets UUID, empty graph
- **Save**: Debounced auto-save (500ms) after any graph change

## Dependencies

The App coordinates these modules:

- `Canvas` - Rendering
- `CRDTGraph` - Data model
- `Chat` - LLM API calls
- `Storage` - Persistence
- `FeatureRegistry` - Plugin system
- `ModalManager` - UI dialogs

## Open Questions & Future Decisions

### Resolved

1. ✅ Chat input always at bottom - keeps interaction model consistent with familiar chat apps

### Deferred

1. How to handle very long conversations? Pagination? Archival?
2. Should there be multiple chat threads in one session?

## References

- HLD: `/docs/high-level-design.md`
- Implementation: `src/canvas_chat/static/js/app.js`
