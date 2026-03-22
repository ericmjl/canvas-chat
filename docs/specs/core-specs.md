# Canvas-Chat Core Specifications

**Created**: 2026-03-16
**Status**: Active
**HLD**: [High-Level Design](../high-level-design.md)

## Core Chat Specifications

### [x] CHAT-REQ-001: Send Message to LLM

**Location**: `app.js:handleSend()`

The system MUST allow users to type a message in the chat input and send it to an LLM provider. The message MUST be sent as a POST request to `/api/chat` with the message content, model selection, and API key.

### [x] CHAT-REQ-002: Stream LLM Response

**Location**: `chat.js`, `sse.js`

The system MUST stream LLM responses token-by-token using Server-Sent Events (SSE). The stream MUST update the AI node content in real-time as tokens are received.

### [x] CHAT-REQ-003: Stop/Continue Generation

**Location**: `streaming-manager.js`

The system MUST allow users to stop an in-progress LLM response mid-stream. The system MUST allow users to continue a stopped response from where it left off.

### [x] CHAT-REQ-004: Create Human Node

**Location**: `app.js:addUserNode()`

When a user sends a message, the system MUST create a `human` node containing the message content. The node MUST be persisted to the graph and rendered on the canvas.

### [x] CHAT-REQ-005: Create AI Node

**Location**: `app.js:handleSend()`

When a user sends a message, the system MUST immediately create an `ai` node (see CHAT-REQ-012). The node MUST be connected to the parent human node via a `reply` edge. The node content is populated as the LLM response streams in (see CHAT-REQ-014).

### [x] CHAT-REQ-006: Model Selection

**Location**: `app.js`, `storage.js`

The system MUST allow users to select which LLM model to use. The selected model MUST be persisted in localStorage and used for subsequent requests.

### [x] CHAT-REQ-007: API Key Management

**Location**: `storage.js`, `modal-manager.js`

The system MUST allow users to enter and store API keys for LLM providers. Keys MUST be stored in localStorage and sent with requests. Keys MUST NOT be stored on the backend. The system MUST support API keys for: OpenAI, Anthropic, Google, Groq, GitHub, and OpenRouter.

### [x] CHAT-REQ-008: Load Available Models

**Location**: `app.js:loadModels()`, `chat.js:fetchProviderModels()`

The system MUST dynamically fetch available models from configured LLM providers on startup. The system MUST populate the model picker dropdown with available models and MUST persist the user's selected model in localStorage.

### [x] CHAT-REQ-009: Slash Command Routing

**Location**: `app.js:tryHandleSlashCommand()`, `feature-registry.js`

The system MUST route slash commands (e.g., /research, /committee, /code) to registered feature plugins. Commands MUST be matched by priority (BUILTIN > OFFICIAL > COMMUNITY).

### [x] CHAT-REQ-010: Context Resolution

**Location**: `app.js:handleSend()`, `crdt-graph.js:resolveContext()`

The system MUST build conversation context by traversing parent nodes in the graph. Context MUST be formatted as an array of {role, content} messages for the LLM API.

### [x] CHAT-REQ-011: Error Display with Retry

**Location**: `app.js:showNodeError()`, `app.js:handleNodeRetry()`

The system MUST display user-friendly error messages on AI nodes. The system MUST provide retry functionality that re-executes the failed request with the same parameters.

### [x] CHAT-REQ-012: Immediate Node Appearance on Send

**Location**: `app.js:handleSend()`

When a user sends a message, the system MUST immediately create and render BOTH the human node AND the AI node on the canvas before the LLM response is received. The human node MUST contain the user's message content. The AI node MUST appear immediately with empty content.

### [x] CHAT-REQ-013: Immediate Edge Creation

**Location**: `app.js:handleSend()`

When a user sends a message, the system MUST immediately create a reply edge connecting the human node to the AI node. This edge MUST be created and rendered before streaming begins.

### [x] CHAT-REQ-014: Real-time AI Node Updates

**Location**: `app.js:handleSend()`, `canvas.js:updateNodeContent()`

As tokens are received from the LLM stream, the system MUST update the AI node content in real-time. The node MUST display partial content as it streams, allowing users to see the response forming.

### [x] CHAT-REQ-015: API Key Validation Before Send

**Location**: `app.js:handleSend()`

When a user sends a message, the system MUST validate that an API key is configured for the selected model before creating nodes. If no API key is found, the system MUST display a toast notification directing the user to Settings and MUST NOT create nodes.

### [x] CHAT-REQ-016: Streaming State Management

**Location**: `app.js:handleSend()`, `streaming-manager.js`

When streaming begins, the system MUST register the stream with the StreamingManager. The StreamingManager MUST show a stop button in the AI node header. When streaming completes, the system MUST unregister the stream and hide the stop button.

### [x] CHAT-REQ-017: Automatic Summary Generation

**Location**: `app.js:generateNodeSummary()`

When an AI response completes streaming, the system MUST automatically generate a summary of the node content. The summary MUST be stored on the node for use in semantic zoom and search.

### [x] CHAT-REQ-018: Per-Provider API Key Storage

**Location**: `storage.js`

The system MUST store API keys individually per provider in localStorage under the key `canvas-chat-api-keys`. The storage format MUST be JSON with provider names as keys.

### [x] CHAT-REQ-019: Provider Detection from Model ID

**Location**: `chat.js:getApiKeyForModel()`

The system MUST extract the provider name from the model ID (e.g., `openai/gpt-4o` → `openai`) and retrieve the corresponding API key from storage.

### [x] CHAT-REQ-020: Dynamic Model Reload on API Key Save

**Location**: `modal-manager.js:saveSettings()`, `app.js:loadModels()`

When a user saves an API key in Settings, the system MUST immediately reload available models. The model picker dropdown MUST be updated to include models from the newly configured provider.

### [x] CHAT-REQ-021: Filter Models by Available API Keys

**Location**: `app.js:loadModels()`

The system MUST only display models for LLM providers that have a configured API key. Providers without keys MUST NOT appear in the model picker.

### [x] CHAT-REQ-022: Parallel Provider Model Fetching

**Location**: `app.js:loadModels()`

The system MUST fetch models from multiple providers in parallel. Each provider with a configured API key MUST have its models fetched independently. Failed provider fetches MUST NOT block other providers from loading.

### [x] CHAT-REQ-023: Model Picker UI States

**Location**: `app.js:loadModels()`

The system MUST display appropriate UI states in the model picker:

- When no API keys are configured: Show "Configure API keys in Settings ⚙️" as a disabled option
- When models are loaded: Show the list of available models

### [x] CHAT-REQ-024: Restore Last Selected Model

**Location**: `app.js:loadModels()`

When models are reloaded, the system MUST attempt to restore the user's previously selected model. If the previously selected model is still available, it MUST be selected.

### [x] CHAT-REQ-025: Custom Model Support

**Location**: `app.js:loadModels()`, `storage.js`

The system MUST allow users to define custom model endpoints. Custom models MUST be added to the model picker alongside dynamically fetched models.

## Canvas Specifications

### [x] CANV-REQ-001: Render Nodes

**Location**: `canvas.js`

The system MUST render all nodes from the graph on the SVG canvas. Each node MUST display its content, type icon, and action buttons.

### [x] CANV-REQ-002: Pan Canvas

**Location**: `canvas.js`

The system MUST allow users to pan the canvas by dragging on empty space. Panning MUST work with mouse drag and touch gestures.

### [x] CANV-REQ-003: Zoom Canvas

**Location**: `canvas.js`, `utils.js`, `storage.js`

The system MUST allow users to zoom the canvas using scroll wheel (with Ctrl), trackpad pinch, or touch gestures. Zoom MUST be constrained between 0.1 and 3.0. Ctrl+scroll MUST use cursor-anchored zoom. Wheel deltas MUST be normalized for `deltaMode` (pixel, line, page) before applying scale. The user MUST be able to adjust zoom step size via Settings (slider persisted in localStorage). High-frequency wheel events MAY be coalesced to one update per animation frame. Touch pinch and Safari gesture zoom are unchanged by normalization.

### [x] CANV-REQ-004: Semantic Zoom

**Location**: `canvas.js`, `utils.js` (`resolveSemanticZoomBand`), `nodes.css`

The nominal bands are: full node content at scale **> 0.6**, summary text at **0.35 < scale ≤ 0.6**, minimal view at **scale ≤ 0.35**. To avoid flicker when scale oscillates near a boundary, the CSS class on the canvas container MUST use **hysteresis**: transitions between full and summary use inner thresholds **0.58** (down) and **0.62** (up); transitions between summary and mini use **0.33** (down) and **0.37** (up). On first paint or when no prior band is stored, the band MUST be derived from nominal thresholds only. Drag affordances (e.g. handle vs drag-anywhere) remain driven by **numeric scale** in `canvas.js`, not by the hysteresis band. Implementation MUST map bands to CSS classes `zoom-full`, `zoom-summary`, `zoom-mini` on the canvas container.

### [x] CANV-REQ-005: Render Edges

**Location**: `canvas.js`

The system MUST render edges connecting related nodes. Edges MUST be Bezier curves. Edges MUST be rendered after nodes to avoid z-order issues.

### [x] CANV-REQ-006: Node Selection

**Location**: `canvas.js`

The system MUST allow users to select a node by clicking. Selected nodes MUST show a visual indicator (border highlight).

### [x] CANV-REQ-007: Node Dragging

**Location**: `canvas.js`

The system MUST allow users to drag nodes to reposition them. At zoom > 0.6, dragging MUST use a handle. At zoom <= 0.6, dragging MUST work from anywhere on the node.

### [x] CANV-REQ-008: Viewport Focus

**Location**: `app.js:addUserNode()`

When a new node is added via chat, the system MUST focus the viewport to show the node. This MUST use `zoomToSelectionAnimated()` with scale 0.8.

## Graph Specifications

### [x] GRPH-REQ-001: Store Nodes

**Location**: `crdt-graph.js`

The system MUST store all nodes in a Yjs CRDT Map. Each node MUST have id, type, content, position, and metadata properties.

### [x] GRPH-REQ-002: Store Edges

**Location**: `crdt-graph.js`

The system MUST store all edges in a Yjs CRDT Array. Each edge MUST have id, source, target, and type properties.

### [x] GRPH-REQ-003: Persist to IndexedDB

**Location**: `crdt-graph.js`, `storage.js`

The system MUST persist graph data to IndexedDB. Changes MUST be auto-saved with a 500ms debounce.

### [x] GRPH-REQ-004: Load from IndexedDB

**Location**: `storage.js`

On startup, the system MUST load the last session from IndexedDB. If no session exists, create a new empty session.

### [x] GRPH-REQ-005: Graph Traversal

**Location**: `crdt-graph.js:getParents()`, `getChildren()`

The system MUST provide methods to traverse the graph: get parents (nodes that reply to), get children (nodes this node replies to), get root nodes, get leaf nodes.

## Plugin Specifications

### [x] PLUG-REQ-001: Register Feature Plugin

**Location**: `feature-registry.js`

The system MUST allow registering feature plugins via `FeatureRegistry.register()`. Plugins MUST have priority levels (OVERRIDE, BUILTIN, OFFICIAL, COMMUNITY).

### [x] PLUG-REQ-002: Slash Commands

**Location**: `feature-registry.js`, `app.js`

The system MUST route slash commands to registered features. The first matching command (by priority) MUST handle the command.

### [x] PLUG-REQ-003: Register Node Type

**Location**: `node-registry.js`

The system MUST allow registering custom node types. Each node type MUST provide a protocol with rendering, actions, and keyboard shortcuts.

### [x] PLUG-REQ-004: AppContext Injection

**Location**: `feature-plugin.js`

Feature plugins MUST receive an AppContext with access to graph, canvas, chat, storage, and modalManager.

## Storage Specifications

### [x] STOR-REQ-001: Session Storage

**Location**: `storage.js`

Sessions MUST be stored in IndexedDB with nodes, edges, tags, created_at, and updated_at fields.

### [x] STOR-REQ-002: Settings Storage

**Location**: `storage.js`

Settings (API keys, model selection, keybinding overrides) MUST be stored in localStorage.

### [x] STOR-REQ-003: Export Session

**Location**: `storage.js`

The system MUST allow exporting a session as a `.canvaschat` JSON file containing all nodes, edges, and metadata.

### [x] STOR-REQ-004: Import Session

**Location**: `storage.js`

The system MUST allow importing a session from a `.canvaschat` file. Imported sessions MUST get a new UUID.

## Search Specifications

### [x] SCH-REQ-001: BM25 Search

**Location**: `search.js`

The system MUST implement BM25 search with K1=1.2 and B=0.75. Search MUST index node content and be triggered via Ctrl+K.

### [x] SCH-REQ-002: Search Results

**Location**: `search.js`, `app.js`

Search results MUST display top 15 matches with snippets containing highlighted terms. Users MUST be able to navigate results with keyboard arrows.

## File Upload Specifications

### [x] UP-REQ-001: PDF Upload

**Location**: `file-upload-registry.js`

The system MUST handle PDF file uploads. Uploaded PDFs MUST be stored in IndexedDB and rendered in a PdfNode with pagination.

### [x] UP-REQ-002: Image Upload

**Location**: `file-upload-registry.js`

The system MUST handle image file uploads (png, jpg, gif, webp). Uploaded images MUST be stored as base64 and displayed in an ImageNode.

### [x] UP-REQ-003: CSV Upload

**Location**: `file-upload-registry.js`

The system MUST handle CSV file uploads. CSV data MUST be parsed and stored as csvData on the node for use with /code.

## Keybinding Specifications

### [x] KEY-REQ-001: Default Shortcuts

**Location**: `keybindings.js`

The system MUST provide default keyboard shortcuts: Ctrl+k (search), Ctrl+z (undo), Ctrl+Shift+z (redo), Delete/Backspace (delete), e (edit), r (reply).

### [x] KEY-REQ-002: Override Shortcuts

**Location**: `keybindings.js`

The system MUST allow users to override default shortcuts. Overrides MUST be stored in localStorage and merged with defaults at runtime.

### [x] KEY-REQ-003: Cross-Platform Handling

**Location**: `keybindings.js`

The system MUST normalize Cmd (Mac) to Ctrl (Windows/Linux) for consistent shortcut behavior across platforms.

## Modal Specifications

### [x] MOD-REQ-001: Settings Modal

**Location**: `modal-manager.js`

The system MUST provide a Settings modal for configuring API keys, model selection, and keyboard shortcuts.

### [x] MOD-REQ-002: Help Modal

**Location**: `modal-manager.js`

The system MUST provide a Help modal showing all keyboard shortcuts.

### [x] MOD-REQ-003: Sessions Modal

**Location**: `modal-manager.js`

The system MUST provide a Sessions modal for loading, saving, and deleting sessions.

### [x] MOD-REQ-004: Edit Content Modal

**Location**: `modal-manager.js`

The system MUST provide an Edit Content modal for editing node markdown content with live preview.

## Build Specifications

### [x] BLD-REQ-001: Build Produces Static Bundle

**Location**: `vite.config.js`, `package.json`

When `npm run build` is executed, the system MUST produce a JS bundle and a CSS file in `src/canvas_chat/static/svelte-dist/assets/`. The Vite config MUST set `base: './'` so that asset URLs in the built HTML are relative paths.

**Test**: Run `npm run build`, assert `svelte-dist/assets/index-*.js` and `svelte-dist/assets/index-*.css` exist. Assert built JS contains no leading `/` in import paths.

### [x] BLD-REQ-002: FastAPI Serves Built Bundle

**Location**: `app.py` (StaticFiles mount), `index.html`

When the FastAPI server is running, a GET request to `/static/svelte-dist/assets/index-[hash].js` MUST return HTTP 200 with JavaScript content. The HTML at `/` MUST contain a `<script>` tag referencing `/static/svelte-dist/assets/index-[hash].js`.

**Test**: Start server, GET `/`, assert HTML contains `<script src="./static/svelte-dist/assets/index-` substring.

### [ ] BLD-REQ-003: Dev Server Proxies API Requests

**Location**: `vite.config.js` (server.proxy)

When the Vite dev server is running, a GET request to `/health` MUST return HTTP 200. A GET request to `/static/js/crdt-graph.js` MUST return HTTP 200 with JavaScript content.

**Test**: Start Vite dev server (`npm run dev`) with FastAPI backend running, GET `/health` returns 200, GET `/static/js/crdt-graph.js` returns 200.

### [ ] BLD-REQ-004: Svelte App Loads Without Import Errors

**Location**: `svelte/App.svelte`

The Svelte app MUST import `CRDTGraph` from `../js/crdt-graph.js` and `storage` from `../js/storage.js` via ES module `import` statements. The app MUST load in the browser without import resolution errors.

**Test**: Build and serve the app, open browser console, assert no `Failed to resolve module` or `Uncaught SyntaxError` errors.

### [ ] BLD-REQ-005: Canvas Adapter Preserves App Class Interface

**Location**: `svelte/CanvasFlow.svelte` (or canvas.js adapter)

During the transition period, a canvas adapter MUST export a `Canvas` class with the same constructor signature (`new Canvas(containerId, svgId)`) and method interface as the current `canvas.js`. The App class MUST instantiate and call methods on this adapter without modification. `node --check` MUST pass on `app.js` without errors throughout the migration.

**Test**: During Phases 3-6, `node --check src/canvas_chat/static/js/app.js` must pass. All existing plugin files must load without errors when the adapter is active.

## Deployment Specifications

### [ ] DEP-REQ-001: Deployed App Serves Svelte Bundle

**Location**: `modal_app.py`, production URL

When the app is deployed to the production Modal URL, a GET request to `/` MUST return HTML containing a `<script>` tag referencing `svelte-dist/assets/index-`. A GET request to `/health` MUST return HTTP 200.

**Test**: Deploy to production, GET `/`, assert response HTML contains `svelte-dist/assets/index-`. GET `/health` returns 200.

### [ ] DEP-REQ-002: pip Wheel Contains Built Assets

**Location**: `pyproject.toml` (hatchling config)

When the Python wheel is built (`python -m build`), the wheel MUST contain the directory `canvas_chat/static/svelte-dist/assets/` with at least one `.js` file. The wheel MUST NOT require Node.js as an install dependency.

**Test**: Build wheel, extract it, assert `canvas_chat/static/svelte-dist/assets/index-*.js` exists. Assert `package.json` is not in the wheel's `requires-dist` metadata.

### [ ] DEP-REQ-003: canvas-chat Launch Serves App

**Location**: `__main__.py`

When `canvas-chat launch` is executed, the CLI MUST start a server that responds to GET `/` with HTTP 200 and HTML content. The response MUST contain the string `svelte-dist`.

**Test**: Run `canvas-chat launch --port 9876`, GET `http://localhost:9876/`, assert HTTP 200 and body contains `svelte-dist`.

## Status Key

- `[ ]` Active requirement
- `[x]` Implemented requirement
- `[D]` Deferred requirement
