# Canvas-Chat integration map

Keep this file updated whenever new cross-component dependencies are discovered.

## Update cross-dependency map

- **Copilot authentication or other provider auth flows** → update model list refresh (`app.js`), storage keys (`storage.js`), backend provider endpoints (`app.py`), auto-refresh logic (`chat.js`), and settings modal wiring (`index.html`, `modal-manager.js`).
- **Admin mode credential injection** → update `app.py` injection helpers, provider-models access, and Copilot auth endpoints to enforce admin-only model policy.
- **Settings modal changes** → update `modal-manager.js` loading logic and `app.js` event bindings, plus any storage schema updates.
- **New modal APIs on ModalManager** → update `tests/test_app_init.js` method binding checks.
- **Model registry changes (`app.py`)** → update UI model picker refresh behavior and `tests/test_models.js` if request/response shapes change.
- **Plugin registration lifecycle** → update `feature-registry.js`, plugin onLoad handlers, and method binding tests.
- **Storage schema changes** → update `tests/test_storage.js` and any UI elements that load or display the data.
- **New API endpoints** → update frontend fetch calls, error handling in `chat.js`, and add tests in `tests/`.

## How to use this map

1. Identify the "thing" you just changed.
2. Scan the related bullet(s) and review the listed files.
3. Confirm all linked components are updated or explicitly not needed.
4. Add new bullets when new cross-component dependencies are discovered or when a gap is found.

## Output-panel event handler constraint

- **Output-panel drawer re-rendering** → `canvas.js` has TWO event-binding paths with asymmetric handler-type support:
  - `applyProtocolEventBindings` (~line 2593): handles BOTH **string** handlers (`this.emit(handler, node.id)`) AND **function** handlers.
  - `updateOutputPanelContent` (~line 2420): handles ONLY **function** handlers (gated by `if (typeof handler === 'function')`).
- **Consequence**: any plugin whose output-panel drawer is re-rendered via `updateOutputPanelContent` (the path used by `ensureOutputPanelContent` ← `_refreshSearchPanel` and similar refresh flows) MUST register **function handlers** (`canvas.emit('eventName', nodeId)`), NOT string handlers. String handlers are **silently lost** on drawer re-render — no error, just dead buttons.
- **Verification**: when wiring event handlers on a custom node with an output panel, check whether the drawer goes through `updateOutputPanelContent`. If yes → use function handlers. If only initial render (`applyProtocolEventBindings`) → string handlers are fine.
- **Known instance**: `SearchNode` protocol (`plugins/search-node.js`) uses function handlers for this reason. The JSDoc comment there ("We use function handlers because the output-panel binding path invokes functions only") is correct.

## Node content: display vs model update

- **Content display + model are separate** → `canvas.updateNodeContent(nodeId, content, false)` updates the **DOM/view** (node body text); `graph.updateNode(nodeId, {content})` updates the **model** (Y.Text / CRDT). **Neither auto-triggers the other.** To update BOTH the displayed body AND the persisted model, call **BOTH**.
  - Calling only `graph.updateNode({content})` → the canvas body DOM is **stale** (old text persists, survives until a re-render).
  - Calling only `canvas.updateNodeContent` → the model is **stale** (changes lost on save/reload).
- **Verify the pairing convention** by checking other call sites: `research.js` `handleSearch` pairs them (`canvas.updateNodeContent(..., false); graph.updateNode(...)`) because neither suffices alone.
- **Known bug instance**: `_searchViewContent` called `graph.updateNode({content})` to restore a node body from a transient `Fetching content…` status but never called `canvas.updateNodeContent`, so `Fetching content…` stuck on the SEARCH node body permanently after a View-content fetch. Fix: restore the DOM via `canvas.updateNodeContent(nodeId, node.content, false)` after any transient/status content staging.
- **Rule of thumb**: when updating node content, grep for existing `updateNodeContent` + `graph.updateNode` pairings and mirror **both** calls.
