# Svelte Flow Migration Implementation Plan

**Created**: 2026-03-17
**Issue**: #247
**Status**: Planning
**HLD**: `/docs/high-level-design.md`
**LLDs**: `/docs/llds/` (26 LLDs covering all current components + build/deployment)
**EARS Specs**: `/docs/specs/` (137 requirements across 4 spec files)

**Current State**: The application uses vanilla JavaScript with:

- `index.html` containing all UI (toolbar, chat input, 9+ modal templates, canvas container, search overlay)
- `app.js` (~4,700 lines) orchestrating all DOM manipulation
- Custom SVG canvas (`canvas.js`) for rendering nodes and edges
- Vanilla JS ES modules for plugins

**Goal**: Migrate to Svelte + Svelte Flow to fix Safari compatibility, add MiniMap, improve touch support, and reduce maintenance burden. The backend (FastAPI) and data model (CRDTGraph) remain unchanged. All 138 EARS requirements must continue to be satisfied after migration.

**Critical constraints**: The app must deploy to Modal and distribute via `pip install canvas-chat`. Users must NOT need Node.js. The Vite build runs in CI/maintainer machines only; built assets are included in the wheel and Modal image.

## Success Criteria

1. Safari renders and interacts with all node types (0% → 80%+ functionality)
2. MiniMap component available for canvas navigation
3. All 138 EARS requirements verified passing on new implementation
4. All existing Cypress E2E tests pass with updated selectors
5. `canvas.js` removed from codebase
6. No regression in plugin system functionality
7. Modal deployment serves the complete Svelte Flow app
8. `pip install canvas-chat && canvas-chat launch` works without Node.js

## Current Architecture

The application runs on vanilla JavaScript with these components:

- **`index.html`** (~720 lines): All UI HTML — toolbar, chat input, 9+ modal templates, canvas container, search overlay, node templates
- **`app.js`** (~4,700 lines): Main orchestrator with 99+ `getElementById` calls, handles chat, canvas, modals, plugins
- **`canvas.js`** (~2,500 lines): Custom SVG canvas with pan/zoom, node/edge rendering
- **`modal-manager.js`** (~1,300 lines): Manages modal state and HTML template swapping
- **`js/` directory**: ES modules (chat.js, storage.js, crdt-graph.js, streaming-manager.js, feature plugins)

## Migration Strategy: Full Page Takeover, Phased Execution

**Core principles**:

- The backend and CRDT data model are frozen
- After migration: Svelte owns the entire page — `index.html` becomes a minimal `<div id="app">` shell
- Existing vanilla JS modules are already ESM — Svelte imports them directly (no global scope bridge)
- Window globals preserved during transition, removed progressively
- The `app.js` App class (~4,700 lines, 99 `getElementById` calls) is decomposed as sections move to Svelte

**Why full takeover, not canvas-only mount**: The App class is the bottleneck, not `canvas.js`. Canvas-only mount leaves the App class intact — you swap one canvas for another without fixing the architecture. Full takeover lets you decompose the App class naturally as you migrate each section.

**Progressive page takeover order**:

```text
Phases 1-2:  Svelte app shell renders (empty page, no visible UI)
Phase 3:     Canvas rendering → Svelte Flow replaces SVG canvas
Phases 4-5:  Node components → all 25+ node types as Svelte
Phase 6:     Feature plugin nodes → committee, research, factcheck, etc.
Phase 7a:    Chat input + toolbar → Svelte components, App class chat methods decomposed
Phase 7b:    Modals (9 total) → Svelte components replace HTML templates + modal-manager.js
Phase 7c:    Search overlay + keybindings → Svelte components
Phase 8:     Remove old App class, canvas.js, modal-manager.js
```

**Layer cake** (bottom to top, each layer built before the one above):

```text
Layer 0: Build infrastructure (Vite + npm + CI pipeline)
Layer 1: Svelte + Vite scaffold
Layer 2: Graph store (CRDT bridge)
Layer 3: Canvas rendering (Svelte Flow)
Layer 4: Node components (25+ types)
Layer 5: Plugin adapter + integration
Layer 6: UI chrome (modals, search, settings)
Layer 7: Testing
Layer 8: Deploy (Modal + pip)
```

---

## Phase 0: Build Infrastructure

**Goal**: Vite build pipeline works, CI can build Svelte, and built assets integrate with FastAPI StaticFiles.

### Phase 0 Deliverables

1. **npm project setup**
    - `package.json` with `svelte`, `@xyflow/svelte`, `vite`, and dev dependencies
    - `vite.config.js` with root, build output, and dev server proxy
    - Build output: `src/canvas_chat/static/svelte-dist/` with `base: './'`
    - **Specs**: BLD-REQ-001, BLD-REQ-003

2. **FastAPI integration with built assets**
    - `index.html` references `/static/svelte-dist/assets/index-[hash].js`
    - Existing `StaticFiles` mount at `/static` serves built assets (no code change needed)
    - **Specs**: BLD-REQ-002

3. **CI build pipeline**
    - GitHub Actions runs `npm install && npm run build` before Modal deploy
    - `.github/workflows/modal-deploy.yaml` updated with Node.js setup step
    - Trigger paths include `src/canvas_chat/static/svelte/` for Svelte source changes
    - **Specs**: DEP-REQ-001

4. **pip packaging verification**
    - `pyproject.toml` hatchling config includes `svelte-dist/` in wheel
    - `pip install -e .` works and serves the built app at `localhost:7865`
    - **Specs**: DEP-REQ-002, DEP-REQ-003

### Phase 0 Testing Requirements

- **Manual**: `npm run build` produces output in `svelte-dist/`
- **Manual**: FastAPI serves the built assets at `/static/svelte-dist/`
- **Manual**: `canvas-chat launch` works after `pip install -e .`
- **CI**: GitHub Actions build step succeeds

### Phase 0 Definition of Done

- [ ] `npm run build` compiles Svelte to `svelte-dist/`
- [ ] FastAPI serves built assets at correct URL
- [ ] GitHub Actions CI runs build before Modal deploy
- [ ] `canvas-chat launch` serves complete app
- [ ] `@spec` annotations on build-related code

---

## Phase 1: Svelte Foundation

**Goal**: Blank Svelte Flow canvas renders in the browser alongside existing vanilla JS app.

### Phase 1 Deliverables

1. **Svelte + Vite scaffold**
    - Install `svelte`, `@xyflow/svelte`, `vite`
    - Create `src/canvas_chat/static/svelte/` directory
    - Vite dev server serves Svelte app
    - Build outputs to `static/svelte/dist/` for production
    - **Specs**: None (infrastructure)

2. **Svelte app entry point**
    - `svelte/App.svelte` — root component
    - Mount point in `index.html` (alongside existing vanilla JS mount)
    - **Specs**: None (infrastructure)

3. **Blank Svelte Flow canvas**
    - `svelte/CanvasFlow.svelte` — wraps `@xyflow/svelte` `SvelteFlow`
    - Renders with no nodes, no edges
    - Pan and zoom work
    - **Specs**: CANV-REQ-002, CANV-REQ-003

### Phase 1 Testing Requirements

- **Manual**: Verify blank Svelte Flow canvas renders at `http://localhost:5173`
- **Manual**: Pan with mouse drag, zoom with scroll wheel

### Phase 1 Definition of Done

- [ ] Svelte app renders blank canvas
- [ ] Vite dev server starts without errors
- [ ] Pan and zoom work on blank canvas
- [ ] Existing vanilla JS app still works (no breakage)

---

## Phase 2: Graph Store — Direct ESM Imports

**Goal**: Svelte app imports `CRDTGraph`, `storage`, and related modules directly. No adapter — just `import { CRDTGraph } from '../js/crdt-graph.js'`.

### Phase 2 Deliverables

1. **Graph store module**
    - `svelte/stores/graphStore.js`
    - Imports `CRDTGraph` directly from `../js/crdt-graph.js` (ESM)
    - Converts CRDT nodes/edges into Svelte Flow `nodes` and `edges` arrays
    - Subscribes to Yjs `observe()` events, updates Svelte state reactively
    - Exposes `addNode()`, `removeNode()`, `addEdge()`, `updateNodePosition()` etc.
    - **Specs**: GRPH-REQ-001, GRPH-REQ-002, GRPH-REQ-003, GRPH-REQ-004, GRPH-REQ-005, BLD-REQ-004

2. **Session persistence bridge**
    - Imports `storage` directly from `../js/storage.js` (ESM)
    - Reuses existing IndexedDB logic (no rewrite)
    - On Svelte app mount, load last session from IndexedDB
    - Auto-save with 500ms debounce
    - **Specs**: STOR-REQ-001, STOR-REQ-003, STOR-REQ-004

3. **Window globals preserved (transition)**
    - Existing `window.X = X` assignments in source modules remain untouched
    - Plugins continue to work via globals during migration
    - **Specs**: BLD-REQ-004

### Phase 2 Testing Requirements

- **Unit**: Graph store correctly converts Yjs Map to Svelte Flow nodes array
- **Unit**: Yjs observe events trigger Svelte state updates
- **Unit**: `resolveContext()` traversal works through store
- **Manual**: Load existing session (nodes appear on canvas)

### Phase 2 Definition of Done

- [ ] Graph store converts CRDT → Svelte Flow format
- [ ] Yjs changes propagate to Svelte reactively
- [ ] Session loads from IndexedDB on mount
- [ ] `@spec` annotations link to GRPH-REQ and STOR-REQ IDs

---

## Phase 3: Core Canvas — Rendering + Interaction

**Goal**: All canvas rendering and interaction specs pass on Svelte Flow.

### Phase 3 Deliverables

1. **Node rendering**
    - Svelte Flow renders all nodes from graph store
    - Default node component with header, content, actions
    - Type-specific icons and labels
    - **Specs**: CANV-REQ-001, NODE-REQ-001, NODE-REQ-002

2. **Edge rendering**
    - Bezier curve edges for reply, branch, reference, generates types
    - Edge types registered with Svelte Flow
    - **Specs**: CANV-REQ-005, EDGE-REQ-001, EDGE-REQ-002, EDGE-REQ-003, EDGE-REQ-004

3. **Node interaction**
    - Click to select (visual highlight)
    - Drag to reposition (updates CRDT)
    - At zoom > 0.6: drag via handle only
    - At zoom <= 0.6: drag from anywhere
    - **Specs**: CANV-REQ-006, CANV-REQ-007

4. **Semantic zoom**
    - CSS class changes based on zoom level (zoom-full, zoom-summary, zoom-mini)
    - Classes applied to node wrapper elements
    - **Specs**: CANV-REQ-004

5. **Viewport focus**
    - `addUserNode()` triggers `zoomToSelectionAnimated()` with scale 0.8
    - No auto-pan on programmatic node addition
    - **Specs**: CANV-REQ-008

6. **MiniMap component**
    - `@xyflow/svelte` `MiniMap` added to canvas
    - Configurable node colors by type
    - **Specs**: None new (enhancement from #247)

### Phase 3 Testing Requirements

- **Unit**: Node rendering with correct type icon/label
- **Unit**: Edge Bezier curves connect correct ports
- **Unit**: Semantic zoom classes applied at correct thresholds
- **E2E**: Click selects node, drag repositions node
- **E2E**: Pan canvas, zoom with scroll wheel
- **Manual**: MiniMap shows node positions and allows click navigation

### Phase 3 Definition of Done

- [ ] All CANV-REQ specs pass on Svelte Flow
- [ ] Pan, zoom, select, drag all work
- [ ] Semantic zoom classes applied correctly
- [ ] MiniMap renders and is interactive
- [ ] All `@spec` annotations present

---

## Phase 4: Simple Node Types

**Goal**: All non-complex node types render correctly as Svelte components.

### Phase 4 Deliverables

1. **Message nodes**
    - `svelte/components/nodes/HumanNode.svelte`
    - `svelte/components/nodes/AiNode.svelte`
    - Streaming content update (token-by-token via store)
    - Model name display, stop/continue buttons in header
    - **Specs**: NODE-REQ-001, NODE-REQ-002, CHAT-REQ-004, CHAT-REQ-005

2. **Content nodes**
    - `svelte/components/nodes/NoteNode.svelte` — editable markdown
    - `svelte/components/nodes/ReferenceNode.svelte` — URL link
    - `svelte/components/nodes/SearchNode.svelte` — search results list
    - `svelte/components/nodes/ImageNode.svelte` — image display
    - `svelte/components/nodes/SummaryNode.svelte` — summary text
    - **Specs**: NODE-REQ-003, NODE-REQ-004, NODE-REQ-005, NODE-REQ-009

3. **Highlight/Branch nodes**
    - `svelte/components/nodes/HighlightNode.svelte` — excerpt from source
    - **Specs**: NODE-REQ-003 (partial, branch behavior)

4. **Node protocol bridge**
    - Map existing `node-protocols.js` `wrapNode()` to Svelte component selection
    - Svelte Flow `nodeTypes` registry maps node type → Svelte component
    - **Specs**: PROT-REQ-001 through PROT-REQ-006

### Phase 4 Testing Requirements

- **Unit**: Each node component renders correct content
- **Unit**: Node type registry maps to correct Svelte component
- **E2E**: Human message creates HumanNode on canvas
- **E2E**: AI response creates AiNode with streaming

### Phase 4 Definition of Done

- [ ] All simple node types render on canvas
- [ ] Node type registry maps correctly
- [ ] Streaming content updates work for AI nodes
- [ ] Node protocols (getSummaryText, getActions, etc.) bridged
- [ ] `@spec` annotations on all node components

---

## Phase 5: Complex Node Types

**Goal**: Nodes with interactive internals (drawers, viewers, tables) render correctly.

### Phase 5 Deliverables

1. **CodeNode with output panel**
    - `svelte/components/nodes/CodeNode.svelte`
    - Code editor (Monaco/CodeMirror) + output panel
    - Run button triggers Pyodide execution
    - Self-healing loop (up to 3 attempts)
    - Code generation via LLM
    - **Specs**: NODE-REQ-007, CODE-REQ-001, CODE-REQ-002, CODE-REQ-003, CODE-REQ-004, CODE-REQ-005

2. **MatrixNode with interactive cells**
    - `svelte/components/nodes/MatrixNode.svelte`
    - Table with editable cells
    - Click cell to fill via LLM
    - Fill All with parallel streaming
    - Row/column extraction
    - **Specs**: NODE-REQ-006, MAT-REQ-001, MAT-REQ-002, MAT-REQ-003, MAT-REQ-004

3. **PDFNode with pagination**
    - `svelte/components/nodes/PdfNode.svelte`
    - PDF.js rendering in Svelte context
    - Prev/Next page navigation
    - **Specs**: NODE-REQ-008, UP-REQ-001

4. **PowerPointNode with slide navigation**
    - `svelte/components/nodes/PowerPointNode.svelte`
    - Slide images with drawer
    - Per-slide captioning
    - **Specs**: NODE-REQ-014

5. **HtmlSlidesNode with embed**
    - `svelte/components/nodes/HtmlSlidesNode.svelte`
    - Blob URL iframe embed
    - Prev/Next navigation
    - **Specs**: NODE-REQ-017, SLID-REQ-001, SLID-REQ-002, SLID-REQ-003

6. **Data import nodes**
    - `svelte/components/nodes/CsvNode.svelte`
    - `svelte/components/nodes/ExcelNode.svelte`
    - `svelte/components/nodes/PrismNode.svelte`
    - Each provides csvData for /code integration
    - **Specs**: NODE-REQ-016, UP-REQ-003

### Phase 5 Testing Requirements

- **Unit**: CodeNode renders editor + output panel
- **Unit**: MatrixNode renders table with correct dimensions
- **Unit**: PDFNode renders PDF.js viewer
- **E2E**: Code execution produces output
- **E2E**: Matrix cell fill works
- **E2E**: PDF page navigation works

### Phase 5 Definition of Done

- [ ] All complex node types render and interact correctly
- [ ] Code execution works via Pyodide
- [ ] Self-healing code works (3 retries)
- [ ] Matrix fill cell + fill all work
- [ ] PDF pagination works
- [ ] `@spec` annotations on all complex node components

---

## Phase 6: Multi-LLM and Feature Plugin Nodes

**Goal**: Committee, research, factcheck, flashcard, and image generation nodes work.

### Phase 6 Deliverables

1. **Committee nodes**
    - `svelte/components/nodes/OpinionNode.svelte`
    - `svelte/components/nodes/ReviewNode.svelte`
    - `svelte/components/nodes/SynthesisNode.svelte`
    - Parallel streaming per opinion node
    - **Specs**: NODE-REQ-012, COMM-REQ-001 through COMM-REQ-005

2. **Research node**
    - `svelte/components/nodes/ResearchNode.svelte`
    - Synthesized findings + sources display
    - **Specs**: NODE-REQ-018, RSCH-REQ-001 through RSCH-REQ-004

3. **Factcheck node**
    - `svelte/components/nodes/FactcheckNode.svelte`
    - Claims, verdicts, source links
    - Read-only (not editable)
    - **Specs**: NODE-REQ-013, FACT-REQ-001 through FACT-REQ-004

4. **Flashcard node**
    - `svelte/components/nodes/FlashcardNode.svelte`
    - Question/answer with flip interaction
    - **Specs**: NODE-REQ-011, FLAS-REQ-001, FLAS-REQ-004

5. **Image generation node**
    - `svelte/components/nodes/ImageNode.svelte` (reuse, add generation support)
    - Generated image display with prompt reference
    - **Specs**: IMG-REQ-001 through IMG-REQ-003

6. **YouTube and GitRepo nodes**
    - `svelte/components/nodes/YouTubeNode.svelte`
    - `svelte/components/nodes/GitRepoNode.svelte`
    - **Specs**: NODE-REQ-010, NODE-REQ-015

### Phase 6 Testing Requirements

- **E2E**: `/committee` creates opinion + synthesis nodes with streaming
- **E2E**: `/research` creates research node with sources
- **E2E**: `/factcheck` creates factcheck node with verdicts
- **E2E**: Flashcard flip interaction works

### Phase 6 Definition of Done

- [ ] All multi-LLM nodes render correctly
- [ ] `/committee` command works end-to-end
- [ ] `/research` command works end-to-end
- [ ] `/factcheck` command works end-to-end
- [ ] Flashcard flip works
- [ ] `/image` command works end-to-end

---

## Phase 7: UI Chrome — Progressive Page Takeover

**Goal**: Svelte takes over chat input, toolbar, modals, search, and keybindings. The App class is decomposed. `modal-manager.js` and `app.js` DOM manipulation is replaced by Svelte components.

### Phase 7a: Plugin Integration + Chat Input + Toolbar

**Goal**: Plugins register and work. Chat input and toolbar become Svelte components. The App class's chat methods decompose into Svelte state.

### Phase 7a Deliverables

1. **Plugin registration entry point**
    - `svelte/imports/plugins.js` — side-effect imports of all plugins
    - Replicates the import chain from `app.js` (each plugin registers itself on import)
    - `App.svelte` imports this entry point to trigger registration
    - **Specs**: PLUG-REQ-001, PLUG-REQ-002, PLUG-REQ-003, PLUG-REQ-004, BLD-REQ-004

2. **AppContext for plugins**
    - `svelte/stores/appContext.js` wraps Svelte graph store, canvas API, chat, storage into an `AppContext` object
    - Feature plugins receive this context (same shape as current `AppContext`)
    - Plugin methods call through to Svelte reactive state
    - **Specs**: PLUG-REQ-004

3. **ChatInput.svelte + Toolbar.svelte**
    - Chat input sends messages, creates human + AI nodes
    - Streaming updates AI node content via graph store
    - Toolbar: model picker, action buttons, tag drawer
    - Slash command menu (`SlashCommandMenu.svelte`)
    - Model selection + API key management (via `storage` import)
    - **Specs**: CHAT-REQ-001 through CHAT-REQ-011

4. **Remove App class chat methods**
    - `handleSend()`, `streamWithAbort()`, `addUserNode()` decomposed into Svelte components
    - Remaining App class methods reduced (only non-chat methods survive until Phase 8)
    - Window globals for chat removed

### Phase 7a Testing Requirements

- **Unit**: Plugin adapter provides correct context to plugins
- **Unit**: Slash commands route to correct handlers
- **E2E**: Send chat message → human node + AI node created
- **E2E**: Model selection changes persisted

### Phase 7a Definition of Done

- [ ] All plugins register via side-effect imports
- [ ] Chat send → stream → node creation works via Svelte
- [ ] Toolbar renders in Svelte with model picker
- [ ] All slash commands functional
- [ ] App class chat methods removed

---

### Phase 7b: Modals (9 total)

**Goal**: All 9 modal HTML templates move from `index.html` into Svelte components. `modal-manager.js` is replaced.

### Phase 7b Deliverables

1. **SettingsModal.svelte**
    - API key entry per provider
    - Model selection dropdown
    - Keybinding overrides
    - Search provider config
    - Sidebar categories (LLM, Search, Custom models, Proxy, Features, Plugins)
    - **Specs**: MOD-REQ-001, CHAT-REQ-006, CHAT-REQ-007, CHAT-REQ-008

2. **HelpModal.svelte**
    - Keyboard shortcuts display
    - **Specs**: MOD-REQ-002

3. **SessionsModal.svelte**
    - Load, save, delete sessions
    - Export/import
    - **Specs**: MOD-REQ-003, STOR-REQ-002, STOR-REQ-003, STOR-REQ-004

4. **EditContentModal.svelte + EditTitleModal.svelte**
    - Markdown editor with live preview
    - Respects `isContentEditable()` protocol
    - **Specs**: MOD-REQ-004, PROT-REQ-006

5. **CodeEditorModal.svelte**
    - Code editor with syntax highlighting
    - **Specs**: CODE-REQ-002

6. **CopilotAuthModal.svelte**
    - GitHub Copilot authentication
    - **Specs**: CANV-CHAT-ENABLE-GITHUB-COPILOT (config.py)

7. **SearchOverlay.svelte + FlashcardToast.svelte**
    - Search results overlay with BM25 snippets
    - Flashcard due notification toast
    - **Specs**: SCH-REQ-001, SCH-REQ-002, FLAS-REQ-003

8. **Remove modal-manager.js and modal HTML templates**
    - `modal-manager.js` (52 `getElementById` calls) deleted
    - All 9 modal `<div>` blocks removed from `index.html`
    - App class modal-related methods removed

### Phase 7b Testing Requirements

- **E2E**: Settings modal opens, API key saved, persists on reload
- **E2E**: Help modal displays keyboard shortcuts
- **E2E**: Sessions modal saves/loads/deletes sessions
- **E2E**: Edit content modal opens for editable node types
- **Cypress**: `settings_modal.cy.js`, `help_modal.cy.js` pass

### Phase 7b Definition of Done

- [ ] All 9 modals render as Svelte components
- [ ] `modal-manager.js` deleted
- [ ] Modal HTML templates removed from `index.html`
- [ ] All modal-related Cypress tests pass

---

### Phase 7c: Search + Keybindings

**Goal**: BM25 search and keyboard shortcuts become Svelte-managed.

### Phase 7c Deliverables

1. **SearchOverlay.svelte integration**
    - BM25 search with K1=1.2, B=0.75 (import `SearchIndex` from `../js/search.js`)
    - Results with highlighted snippets
    - Keyboard arrow navigation
    - **Specs**: SCH-REQ-001, SCH-REQ-002

2. **Keybinding management in Svelte**
    - Default shortcuts (Ctrl+K, Ctrl+Z, Delete, E, R)
    - User overrides from localStorage (import from `../js/storage.js`)
    - Cross-platform Cmd/Ctrl normalization (import from `../js/keybindings.js`)
    - **Specs**: KEY-REQ-001, KEY-REQ-002, KEY-REQ-003

3. **Remove App class search + keyboard methods**
    - Search-related methods removed from App class
    - Keybinding event listeners moved to Svelte `onMount`

### Phase 7c Testing Requirements

- **E2E**: Ctrl+K opens search, results display, arrow keys navigate
- **E2E**: Keyboard shortcuts work (Ctrl+Z undo, Delete node, E edit, R reply)
- **Cypress**: `search.cy.js`, `keyboard_interactions.cy.js`, `slash_command_menu.cy.js` pass

### Phase 7c Definition of Done

- [ ] Search works with BM25 via Svelte component
- [ ] All keybindings functional
- [ ] App class search/keyboard methods removed

---

## Phase 8: Testing + Cutover

**Goal**: Full test coverage, Safari verification, and removal of all legacy code.

### Phase 8 Deliverables

1. **Cypress test updates**
    - Update selectors for Svelte-rendered nodes (SVG → HTML elements)
    - All existing E2E tests pass
    - New tests for MiniMap, Safari-specific behavior
    - **Specs**: All 139 EARS requirements

2. **Safari verification**
    - Test all node types render on Safari
    - Test pan/zoom/interact on Safari
    - Test streaming on Safari
    - Document any remaining issues

3. **Performance testing**
    - Compare render performance: old canvas.js vs Svelte Flow
    - Measure with 100+ nodes on canvas
    - Verify no memory leaks with session load/save cycles

4. **Feature flag cutover**
    - Add feature flag to switch between old UI and Svelte
    - Test both paths work during transition
    - Remove flag, delete legacy code

5. **Remove legacy code**
    - Delete `app.js` (~4,700 lines) — fully decomposed into Svelte components
    - Delete `modal-manager.js` — replaced by Svelte modal components
    - Delete `canvas.js` (~4,700 lines) — replaced by Svelte Flow
    - Delete `slash-command-menu.js` — replaced by `SlashCommandMenu.svelte`
    - Remove modal HTML templates from `index.html` (9 modals, ~460 lines)
    - Remove toolbar HTML from `index.html` (~110 lines)
    - Remove chat input HTML from `index.html` (~28 lines)
    - `index.html` is now the minimal `<div id="app">` shell
    - Remove window global assignments from consumed modules
    - Update AGENTS.md with new file map

### Phase 8 Testing Requirements

- **E2E**: All 17 existing Cypress test files pass
- **Manual**: Safari smoke test (all node types, pan/zoom, streaming)
- **Performance**: 100-node canvas renders in < 2s
- **Performance**: No memory leak over 10 session load/save cycles

### Phase 8 Definition of Done

- [ ] All Cypress tests pass with updated selectors
- [ ] Safari renders all node types
- [ ] Performance benchmarks acceptable
- [ ] `canvas.js` removed from codebase
- [ ] AGENTS.md updated with new architecture
- [ ] Feature flag removed
- [ ] All 138 EARS requirements verified passing

---

## Phase 9: Deploy + Distribution

**Goal**: Modal deployment and pip distribution work correctly with the Svelte Flow app.

### Phase 9 Deliverables

1. **Modal deployment update**
    - `modal_app.py` — verify `.add_local_dir("src/canvas_chat")` includes `svelte-dist/`
    - Modal image size acceptable (built assets should be small — tree-shaken)
    - **Specs**: DEP-REQ-001

2. **CI/CD pipeline update**
    - GitHub Actions runs `npm install && npm run build` before `modal deploy`
    - Modal deploy succeeds on push to `main`
    - Test deployments work on PRs
    - Health check passes after deploy
    - **Specs**: DEP-REQ-001

3. **pip wheel packaging**
    - `python -m build` produces wheel with `svelte-dist/` included
    - `pip install dist/canvas-chat-*.whl` installs successfully
    - `canvas-chat launch` starts and serves complete app
    - No Node.js required at install or runtime
    - **Specs**: DEP-REQ-002, DEP-REQ-003

4. **Release process documentation**
    - Document the release workflow: build → test → bump version → publish to PyPI → deploy to Modal
    - Update AGENTS.md with deployment sections

### Phase 9 Testing Requirements

- **CI**: Full GitHub Actions pipeline passes (build + deploy + health check)
- **Manual**: Fresh `pip install` in a clean environment works
- **Manual**: Modal deployment serves complete app at production URL
- **Manual**: `canvas-chat launch --admin-mode --config config.yaml` works

### Phase 9 Definition of Done

- [ ] Modal deployment serves Svelte Flow app
- [ ] CI/CD pipeline builds Svelte before deploy
- [ ] `pip install canvas-chat` includes built assets
- [ ] `canvas-chat launch` works without Node.js
- [ ] Release process documented

---

## Requirements Traceability

### Phase 0 (Build Infrastructure)

- Build: BLD-REQ-001, BLD-REQ-002, BLD-REQ-003, BLD-REQ-004, BLD-REQ-005
- Deploy: DEP-REQ-002, DEP-REQ-003

### Phase 1 (Foundation)

- Canvas: CANV-REQ-002, CANV-REQ-003

### Phase 2 (Graph Store + Canvas Adapter)

- Graph: GRPH-REQ-001 through GRPH-REQ-005
- Storage: STOR-REQ-001, STOR-REQ-003, STOR-REQ-004
- Build: BLD-REQ-004, BLD-REQ-005

### Phase 3 (Core Canvas)

- Canvas: CANV-REQ-001, CANV-REQ-004, CANV-REQ-005, CANV-REQ-006, CANV-REQ-007, CANV-REQ-008

### Phase 4 (Simple Nodes)

- Chat: CHAT-REQ-004, CHAT-REQ-005
- Nodes: NODE-REQ-001 through NODE-REQ-005, NODE-REQ-009
- Protocols: PROT-REQ-001 through PROT-REQ-006

### Phase 5 (Complex Nodes)

- Nodes: NODE-REQ-006 through NODE-REQ-008, NODE-REQ-014, NODE-REQ-016, NODE-REQ-017
- Code: CODE-REQ-001 through CODE-REQ-005
- Matrix: MAT-REQ-001 through MAT-REQ-004
- Uploads: UP-REQ-001, UP-REQ-003
- Slides: SLID-REQ-001 through SLID-REQ-003

### Phase 6 (Multi-LLM + Feature Nodes)

- Nodes: NODE-REQ-010 through NODE-REQ-013, NODE-REQ-015, NODE-REQ-018
- Committee: COMM-REQ-001 through COMM-REQ-005
- Research: RSCH-REQ-001 through RSCH-REQ-004
- Factcheck: FACT-REQ-001 through FACT-REQ-004
- Flashcards: FLAS-REQ-001, FLAS-REQ-004
- Image: IMG-REQ-001 through IMG-REQ-003

### Phase 7a (Plugin Integration + Chat + Toolbar)

- Chat: CHAT-REQ-001 through CHAT-REQ-011
- Plugin: PLUG-REQ-001 through PLUG-REQ-004
- Build: BLD-REQ-004

### Phase 7b (Modals)

- Modal: MOD-REQ-001 through MOD-REQ-004
- Storage: STOR-REQ-002 through STOR-REQ-004
- Code: CODE-REQ-002
- Flashcards: FLAS-REQ-003

### Phase 7c (Search + Keybindings)

- Search: SCH-REQ-001, SCH-REQ-002
- Keybindings: KEY-REQ-001 through KEY-REQ-003

### Phase 8 (Testing + Cutover)

- All 139 requirements verified

### Phase 9 (Deploy + Distribution)

- Deploy: DEP-REQ-001, DEP-REQ-002, DEP-REQ-003

**Total**: 138 EARS requirements across 10 phases (0-9)

## Risk Assessment

### High Risk

1. **Plugin adapter complexity**
    - Vanilla JS plugins expect DOM APIs, event emitters, global state
    - Svelte's reactivity model may conflict with imperative plugin code
    - **Mitigation**: Adapter pattern with thin wrapper; test each plugin individually in Phase 7

2. **CRDT ↔ Svelte Flow synchronization**
    - Yjs observe events must correctly map to Svelte state updates
    - Bidirectional sync (user drags node → update CRDT → persist) is complex
    - **Mitigation**: Unidirectional data flow (CRDT → Svelte state → Svelte Flow); writes go through CRDT API

### Medium Risk

1. **Safari partial compatibility**
    - Svelte Flow uses CSS transforms (better than SVG foreignObject) but Safari may still have quirks
    - **Mitigation**: Test early (Phase 1), document issues, plan workarounds

2. **Performance with 100+ nodes**
    - Svelte Flow is performant but rendering 25+ custom node types with complex internals may lag
    - **Mitigation**: Svelte Flow's built-in viewport culling; semantic zoom already limits rendered content

3. **Vite build integration with existing FastAPI**
    - Current app serves static files directly from `src/canvas_chat/static/`
    - Vite build output must integrate into existing static file serving
    - **Mitigation**: Build to existing static directory; configure Vite output paths

### Low Risk

1. **MiniMap styling**
    - MiniMap node colors may need customization per node type
    - **Mitigation**: Svelte Flow MiniMap supports custom node color function

2. **Existing tests break during migration**
    - Cypress selectors will change as DOM structure changes
    - **Mitigation**: Phase 8 dedicated to test updates; run tests after each phase

## References

- Issue: `#247` (Migrate to Svelte Flow)
- HLD: `/docs/high-level-design.md` (Section 9: Build, Deploy, and Distribution)
- Build & Deploy LLD: `/docs/llds/build-deployment.md`
- Canvas LLD: `/docs/llds/canvas-rendering.md`
- Plugin System LLD: `/docs/llds/plugin-system.md`
- App Orchestrator LLD: `/docs/llds/app-orchestrator.md`
- CRDT Graph LLD: `/docs/llds/crdt-graph.md`
- Modal deployment: `modal_app.py`
- CI workflow: `.github/workflows/modal-deploy.yaml`
- Package config: `pyproject.toml`
- Core Specs: `/docs/specs/core-specs.md`
- Node Type Specs: `/docs/specs/node-types-specs.md`
- Feature Plugin Specs: `/docs/specs/feature-plugins-specs.md`
- Backend API Specs: `/docs/specs/backend-api-specs.md`
