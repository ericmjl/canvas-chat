# Agents

Instructions for AI coding agents working on this project.

## Codebase map

Quick reference for which files to edit for common tasks:

### Frontend (Vanilla JS)

| File | Purpose | Edit for... |
|------|---------|-------------|
| `src/canvas_chat/static/js/app.js` | Main application, orchestrates everything | Slash commands, keyboard shortcuts, feature handlers, App class methods |
| `src/canvas_chat/static/js/canvas.js` | SVG canvas, pan/zoom, node rendering | Node appearance, drag behavior, viewport logic, node event handlers |
| `src/canvas_chat/static/js/graph.js` | Data model, node/edge types, layout algorithms | Node types, edge types, graph traversal, auto-positioning |
| `src/canvas_chat/static/js/chat.js` | LLM API calls, streaming | API integration, message formatting, token estimation |
| `src/canvas_chat/static/js/storage.js` | localStorage persistence | Session storage, API key storage, settings |
| `src/canvas_chat/static/js/search.js` | Node search functionality | Search UI, filtering logic |
| `src/canvas_chat/static/js/sse.js` | Server-sent events utilities | Streaming connection handling |

### Frontend (HTML/CSS)

| File | Purpose | Edit for... |
|------|---------|-------------|
| `src/canvas_chat/static/index.html` | Main HTML, modals, templates | New modals, toolbar buttons, HTML structure |
| `src/canvas_chat/static/css/style.css` | All styles | Colors, layout, node styling, animations |

### Backend (Python/FastAPI)

| File | Purpose | Edit for... |
|------|---------|-------------|
| `src/canvas_chat/app.py` | FastAPI routes, LLM proxy | API endpoints, backend logic |
| `modal_app.py` | Modal deployment config | Deployment settings |

### Key constants and their locations

| Constant | Location | Purpose |
|----------|----------|---------|
| `NodeType` | `graph.js:8-25` | All node type definitions |
| `EdgeType` | `graph.js:53-64` | All edge type definitions |
| `SCROLLABLE_NODE_TYPES` | `graph.js:31-40` | Node types with 4:3 fixed size |
| `SLASH_COMMANDS` | `app.js:77-83` | Slash command definitions |
| CSS variables | `style.css:10-80` | Colors, sizing, theming |

### Zoom levels (semantic zoom)

| Scale | Class | Behavior |
|-------|-------|----------|
| > 0.6 | `zoom-full` | Full node content visible |
| 0.35 - 0.6 | `zoom-summary` | Summary text shown, drag anywhere |
| <= 0.35 | `zoom-mini` | Minimal view, drag anywhere |

## Documentation

All documentation must follow the [Diataxis framework](https://diataxis.fr/):

- **docs/explanation/**: Design decisions, architecture rationale, "why" documents
- **docs/how-to/**: Task-oriented guides for accomplishing specific goals
- **docs/reference/**: Technical descriptions of APIs, configuration options, data structures

Do not mix documentation types. Each document should serve one purpose.

## Code style

- Backend: Python with FastAPI, use type hints
- Frontend: Vanilla JavaScript (no frameworks), CSS, HTML
- Prefer simple, greedy algorithms over complex optimal solutions
- Local-first: no server-side user data storage

## Post-task review

After completing a task, take a moment to review the code you've written and look for refactoring opportunities:

- Duplicated logic that could be extracted into shared functions
- Overly complex conditionals that could be simplified
- Inconsistent patterns that should be unified
- Dead code or unused variables

It's fine if there's nothing to refactor, but if improvements exist, address them before committing.

## Architecture patterns

### API key access

Always use `chat.getApiKeyForModel(model)` to get API keys for LLM calls.
Do NOT use `storage.getApiKey()` - it doesn't exist.

```javascript
const model = this.modelPicker.value;
const apiKey = chat.getApiKeyForModel(model);
```

For Exa API key specifically, use `storage.getExaApiKey()`.

### Canvas callbacks

The Canvas class uses a callback pattern for node interactions.
To add a new node action:

1. Add callback property in `canvas.js` constructor: `this.onNodeXxx = null;`
2. Add button in `renderNode()` template (conditionally by node type if needed)
3. Add event listener in `setupNodeEvents()` that calls `this.onNodeXxx`
4. Bind handler in `app.js`: `this.canvas.onNodeXxx = this.handleNodeXxx.bind(this);`
5. Implement `handleNodeXxx(nodeId)` method in App class

### Slash commands

Slash commands are defined in `SLASH_COMMANDS` array and handled by `tryHandleSlashCommand()`.

To add a new slash command:

1. Add to `SLASH_COMMANDS` array with `command`, `description`, `placeholder`
2. Add handler check in `tryHandleSlashCommand(content, context)`
3. Implement `handleXxx()` method

The `context` parameter provides surrounding text for contextual commands (e.g., selected text).
This enables the LLM to resolve vague references like "how does this work?" into specific queries.

### Variable naming in handleSend

The `handleSend()` method uses `context` for LLM conversation context (line ~748).
If you need a variable for slash command context, use `slashContext` to avoid collision.

### Canvas selection state

To get selected nodes, use `this.canvas.getSelectedNodeIds()` (returns array of node IDs).
Do NOT use `getSelectedNodes()` - it doesn't exist.

```javascript
const selectedNodeIds = this.canvas.getSelectedNodeIds();
if (selectedNodeIds.length > 0) {
    // Do something with selected nodes
}
```

### Concurrent operation state

When multiple instances of an operation can run simultaneously, **never use global/singleton state**.
Each instance must have its own isolated state.

**The pattern:** Use `Map<instanceId, state>` instead of single variables.

```javascript
// WRONG: Global state - only one operation can be active
this.streamingNodeId = nodeId;
this.abortController = new AbortController();

// Later, when second operation starts, it overwrites the first:
this.streamingNodeId = anotherNodeId;  // First operation's state is lost!
this.abortController = new AbortController();  // Can't abort first operation anymore

// CORRECT: Per-instance state - many operations can run in parallel
this.streamingNodes = new Map();  // In constructor

// Each operation gets isolated state:
this.streamingNodes.set(nodeId, {
    abortController: new AbortController(),
    context: { messages, model }
});

// Second operation doesn't affect the first:
this.streamingNodes.set(anotherNodeId, {
    abortController: new AbortController(),
    context: { messages, model }
});

// Each can be controlled independently:
this.streamingNodes.get(nodeId).abortController.abort();
```

**When to apply this pattern:**

- LLM streaming responses (multiple nodes can generate simultaneously)
- Async fetch operations that can overlap
- Any cancellable operation where the user might trigger multiple instances

**Cleanup:** Always remove entries from the Map when the operation completes or errors:

```javascript
// In onDone/onError callbacks:
this.streamingNodes.delete(nodeId);
```

### Node content updates

Nodes have two text displays that must stay in sync:

1. **`.node-content`** - Full content shown when zoomed in
2. **`.node-summary .summary-text`** - Truncated preview shown when zoomed out

When updating node content, always use `canvas.updateNodeContent(nodeId, content, isStreaming)`.
This method updates both displays automatically (summary text updates when `isStreaming=false`).

**Common mistake:** Creating a node with placeholder text (e.g., "Loading...") and forgetting
that the summary text won't update unless `updateNodeContent` is called with `isStreaming=false`
after the real content arrives.

```javascript
// Wrong: Summary stays stuck on "Loading..." when zoomed out
const node = createNode(NodeType.SUMMARY, 'Loading...');
// ... later ...
this.graph.updateNode(node.id, { content: realContent }); // Only updates graph, not display!

// Correct: Both content and summary update properly
const node = createNode(NodeType.SUMMARY, 'Loading...');
// ... later ...
this.canvas.updateNodeContent(node.id, realContent, false); // Updates both displays
this.graph.updateNode(node.id, { content: realContent });
```

## Design standards

- New features must be coherent with existing design patterns and visual language
- User interactions should be seamless and elegant
- Follow the Excalidraw-inspired aesthetic: clean, minimal, hand-drawn feel
- Use existing CSS variables for colors, spacing, shadows, and typography
- Prefer keyboard shortcuts for power users (document them in tooltips)
- Animations should be subtle and purposeful (0.15s-0.3s transitions)

### Streaming controls placement

Stop/Continue buttons for LLM generation are placed in the **node header next to the delete button**,
not in the scrolling action bar. This design choice supports parallel generations:

- Multiple AI nodes can stream responses simultaneously
- Each node needs its own accessible stop control
- The button must not move as content streams in (would be hard to click)
- Placing controls in a fixed location (like the chat input) wouldn't work because
  it's ambiguous which generation should be stopped

### Text selection interactions

When showing tooltips or popups near text selections, **never auto-focus input fields**.
Focusing an input clears the browser's text selection. Instead:

- Store the selected text immediately when the tooltip appears
- Let the user click into input fields manually
- Use the stored text when processing the action

## Testing

Run the dev server with `pixi run dev` before testing UI changes.

**Important:** Never kill the dev server process. The developer runs it in reload mode,
so code changes are automatically picked up. Just make your edits and the server will reload.

### Unit tests

Write unit tests for logic that does not require API calls:

- **Python**: Test pure functions, data transformations, parsing logic
- **JavaScript**: Test graph algorithms, node/edge operations, utility functions

Do not write tests that require external API calls (LLM, Exa, etc.) - these are tested manually.

Run tests with:

```bash
pixi run test      # Python tests
pixi run test-js   # JavaScript tests
```

### Syntax checking

Always check JavaScript for syntax errors before considering a change complete:

```bash
node --check static/js/app.js
```

Common issues to watch for:
- Variable name collisions (e.g., reusing `context` in different scopes)
- Missing imports or incorrect function names

### Verify APIs exist before using them

**Before calling any method on `chat`, `canvas`, `storage`, or `graph` objects, verify the method exists.**

AI agents often hallucinate plausible-sounding method names that don't exist. This causes runtime errors
that are hard to debug because they only appear when the code path is triggered.

**Verification steps:**

1. Search for the method definition in the source file:
   ```bash
   grep -n "methodName\s*(" static/js/chat.js
   ```

2. If the method doesn't exist, look for similar methods that do exist, or implement the functionality
   using methods that are documented below.

**Common mistakes (do NOT use these - they don't exist):**

| Wrong (doesn't exist) | Correct alternative |
|-----------------------|---------------------|
| `chat.streamChat()` | Use `chat.sendMessage()` with callbacks |
| `canvas.setNodeStreaming()` | Use `canvas.showStopButton()` / `canvas.hideStopButton()` |
| `canvas.getSelectedNodes()` | Use `canvas.getSelectedNodeIds()` |
| `storage.getApiKey()` | Use `chat.getApiKeyForModel(model)` |

**Key methods that DO exist:**

`chat.js`:
- `getApiKeyForModel(model)` - Get API key for a model
- `sendMessage(messages, model, onChunk, onDone, onError)` - Stream LLM response
- `summarize(messages, model)` - Get a summary (non-streaming)
- `estimateTokens(text, model)` - Estimate token count

`canvas.js`:
- `getSelectedNodeIds()` - Get array of selected node IDs
- `updateNodeContent(nodeId, content, isStreaming)` - Update node text
- `showStopButton(nodeId)` / `hideStopButton(nodeId)` - Streaming controls
- `showContinueButton(nodeId)` / `hideContinueButton(nodeId)` - Resume controls
- `renderNode(node)` / `removeNode(nodeId)` - Node lifecycle
- `panToNodeAnimated(nodeId)` - Navigate to a node

`storage.js`:
- `getApiKeys()` - Get all stored API keys object
- `getApiKeyForProvider(provider)` - Get key for specific provider
- `getExaApiKey()` - Get Exa search API key
- `saveSession(session)` / `getSession(id)` - Session persistence

## Modal Deployment

### Architecture: Bring Your Own Keys

This app uses a **local-first architecture** where users provide their own API keys
via the settings panel in the UI. Keys are stored in the browser's localStorage and
sent with each request. **No server-side secrets are required for deployment.**

### Automatic Deployment (CI/CD)

The app is automatically deployed to Modal on every push to `main` via GitHub Actions.
The workflow is defined in `.github/workflows/modal-deploy.yaml`.

### GitHub Actions Secrets Required

The CI/CD workflow requires these secrets in GitHub Actions:

- `MODAL_TOKEN_ID` - Modal token ID
- `MODAL_TOKEN_SECRET` - Modal token secret

Set them using the GitHub CLI:

```bash
gh secret set MODAL_TOKEN_ID --body "$MODAL_TOKEN_ID"
gh secret set MODAL_TOKEN_SECRET --body "$MODAL_TOKEN_SECRET"
```

### Important: API Keys Policy

**Do NOT store API keys in Modal secrets for this app.**
Users bring their own keys via the UI settings panel. This design:

- Prevents unauthorized usage of personal API quotas
- Keeps the deployment simple (no secrets to manage)
- Gives users full control over their API usage

### Manual Deployment

For local testing or manual deployment:

```bash
# Test locally with live reload
pixi run modal serve modal_app.py

# Deploy to Modal
pixi run modal deploy modal_app.py
```
