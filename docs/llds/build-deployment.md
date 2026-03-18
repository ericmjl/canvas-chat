# Build, Deploy, and Distribution

**Created**: 2026-03-17
**Status**: Design Phase

## Context and Design Philosophy

Canvas-Chat is both a Python package (installed via `pip`) and a serverless deployment (Modal). The frontend migration to Svelte introduces a build step that must integrate cleanly with both distribution channels. The guiding principle: **users never need Node.js**. Build artifacts are pre-built and included in the wheel and Modal image.

## Build Pipeline

### Source Structure

```text
src/canvas_chat/
├── static/
│   ├── index.html              # Minimal shell (<div id="app"> + CDN scripts)
│   ├── css/                    # Global styles (shared baseline)
│   ├── js/                     # Vanilla JS modules (ESM, consumed by Svelte via import)
│   └── svelte/                 # Svelte source
│       ├── App.svelte           # Root: toolbar + canvas + chat input
│       ├── CanvasFlow.svelte    # Svelte Flow canvas wrapper
│       ├── components/
│       │   ├── Toolbar.svelte       # Model picker, action buttons
│       │   ├── ChatInput.svelte     # Message textarea + send
│       │   ├── TagDrawer.svelte     # Tag management sidebar
│       │   ├── nodes/              # 25+ node type components
│       │   ├── modals/             # 9 modal components
│       │   │   ├── SettingsModal.svelte
│       │   │   ├── HelpModal.svelte
│       │   │   ├── SessionsModal.svelte
│       │   │   ├── EditContentModal.svelte
│       │   │   ├── EditTitleModal.svelte
│       │   │   ├── CodeEditorModal.svelte
│       │   │   ├── CopilotAuthModal.svelte
│       │   │   ├── SearchOverlay.svelte
│       │   │   └── FlashcardToast.svelte
│       │   └── SlashCommandMenu.svelte
│       ├── stores/             # Svelte stores (graph, chat state)
│       └── imports/
│           └── plugins.js      # Side-effect imports for plugin registration
├── app.py                      # FastAPI backend
├── plugins/                    # Python backend plugins
└── __main__.py                 # CLI entry point
```

### Build Configuration

**`vite.config.js`** at project root:

```javascript
export default {
    root: 'src/canvas_chat/static/svelte',
    build: {
        outDir: '../svelte-dist',
        emptyOutDir: true,
        base: './',
    },
    server: {
        proxy: {
            '/api': 'http://localhost:7865',
            '/static/js': 'http://localhost:7865',
            '/static/css': 'http://localhost:7865',
        },
    },
};
```

### HTML Ownership: Full Page Takeover (Post-Migration)

**Target (after Svelte migration)**: Svelte owns the entire page. `index.html` becomes a minimal shell. All current HTML (toolbar, chat input, 9 modal templates, canvas container, search overlay) moves into Svelte components.

**Current state**: The application uses vanilla JavaScript with all HTML in `index.html`. The Svelte migration is planned but not yet implemented.

**Target `index.html`** (post-migration):

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Canvas Chat</title>
        <!-- Base path for load balancer support (kept from current) -->
        <script>
            /* ... existing base path logic ... */
        </script>
        <!-- CDN dependencies (marked.js, KaTeX, etc.) — kept for now -->
        <!-- Global CSS -->
        <link rel="stylesheet" href="static/css/style.css" />
    </head>
    <body>
        <div id="app"></div>
        <script type="module" src="static/svelte-dist/assets/index-[hash].js"></script>
    </body>
</html>
```

**Why full takeover, not canvas-only mount**:

The `app.js` class is the real bottleneck (~4,700 lines, 99 `getElementById` calls), not `canvas.js`. A canvas-only mount leaves the App class intact — you swap one canvas for another without fixing the architecture. Full takeover lets you decompose the App class naturally into Svelte components as you migrate each section.

**Progressive migration within full takeover**:

The architectural decision is "Svelte owns the page", but execution is phased:

| Phase | What moves to Svelte           | App class impact                               |
| ----- | ------------------------------ | ---------------------------------------------- |
| 1-2   | Blank canvas + graph store     | None yet                                       |
| 3     | Canvas rendering (Svelte Flow) | Canvas calls move to Svelte                    |
| 4-5   | Node components                | Node rendering moves to Svelte                 |
| 6     | Feature plugin nodes           | Plugin nodes move to Svelte                    |
| 7a    | Chat input + toolbar           | App.send/message methods decomposed            |
| 7b    | Modals (9 total)               | modal-manager.js replaced by Svelte components |
| 7c    | Search overlay + keybindings   | Search/keyboard logic moves to Svelte          |
| 8     | Remove old App class           | Entire `app.js` deleted                        |

During transition, the old `app.js` coexists with Svelte. Svelte components call into existing ESM modules (`chat.js`, `storage.js`) directly. As each section moves to Svelte, the corresponding `getElementById` calls in `app.js` are removed.

### Build Output (Post-Migration)

After Svelte migration, Vite compiles `.svelte` source into optimized JS/CSS bundles:

**Current state** (vanilla JS, no Svelte):

```text
src/canvas_chat/static/
├── index.html                 # All HTML (toolbar, modals, canvas container)
├── css/                      # Stylesheets
└── js/                       # Vanilla JS modules (app.js, canvas.js, etc.)
```

**Target state** (after Svelte migration):

```text
src/canvas_chat/static/
├── svelte-dist/               # BUILD OUTPUT (committed or built in CI)
│   ├── assets/
│   │   ├── index-[hash].js    # Main bundle
│   │   └── index-[hash].css    # Scoped styles
│   └── index.js                # Entry point
├── index.html                  # Minimal shell with <div id="app">
├── css/                        # Global CSS (non-Svelte)
└── js/                         # Vanilla JS modules (consumed via ESM import)
```

**Key**: `index.html` uses a script tag pointing to the built bundle. During development, the Vite dev server handles this. In production, FastAPI serves the built files.

### Build Commands

**Current** (vanilla JS, no Svelte):

```bash
pixi run dev    # FastAPI backend + serves static files at :7865
```

**After Svelte migration**:

```bash
# Development (Vite dev server with HMR)
npm run dev                    # Svelte dev server at :5173, proxies API to :7865
pixi run dev                   # FastAPI backend at :7865

# Production build
npm run build                  # Builds to src/canvas_chat/static/svelte-dist/
```

### Built Assets in Version Control

**Decision**: Built assets (`svelte-dist/`) are included in the git repository.

**Why**:

- Modal deployment uses `.add_local_dir("src/canvas_chat")` — it copies files from the local checkout, so built assets must be present
- pip wheel includes files from `src/canvas_chat/` — built assets must be present at package time
- Avoids requiring Node.js in the CI pipeline for Modal deploys (build runs separately)

**Enforcement**: Pre-commit hook or CI check verifies `svelte-dist/` is up-to-date with the Svelte source.

## Deployment to Modal

### How Modal Deployment Works

`modal_app.py` creates a Modal image and serves the FastAPI app:

1. **Image setup**: Debian slim + Python 3.11 + system packages (LibreOffice, fonts)
2. **Package copy**: `.add_local_dir("src/canvas_chat", remote_path="/app/canvas_chat")` copies the entire Python package (including `static/svelte-dist/`)
3. **Runtime**: FastAPI mounts `StaticFiles` at `/static` and serves the HTML shell + built bundles

### CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/modal-deploy.yaml`):

```text
1. Checkout repository
2. (Optional) npm install && npm run build — if svelte-dist/ is not committed
3. modal deploy modal_app.py -e test   (PRs)
   modal deploy modal_app.py           (push to main)
4. Health check: GET /health
```

**Trigger paths** (must include build output if committed):

```yaml
paths:
    - 'src/**' # Python + static files (including svelte-dist/)
    - 'modal_app.py'
    - 'pyproject.toml'
```

### Static File Serving

FastAPI serves static files at mount point `/static`:

```python
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
```

The HTML shell (`index.html`) at the root route references:

- `/static/svelte-dist/assets/index-[hash].js` — built Svelte bundle
- `/static/css/style.css` — global styles
- `/static/js/*.js` — vanilla JS modules (loaded by the Svelte app)

### Base Path Handling

Modal may deploy behind a load balancer with a non-root path (e.g., `/my-app/`). The existing base path script in `index.html` handles this by dynamically setting `<base href>`. The Vite build must use relative paths (no leading `/` in asset URLs) to work with arbitrary base paths.

```javascript
// vite.config.js
build: {
  base: './',  // Relative paths for load balancer support
}
```

## Distribution via pip

### Package Configuration

`pyproject.toml`:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/canvas_chat"]
# hatchling includes all files in the package by default
```

The wheel includes everything under `src/canvas_chat/`:

- Python source (app.py, plugins/, config.py, etc.)
- Static files (index.html, css/, js/)
- Built Svelte assets (svelte-dist/)

### CLI Entry Point

```toml
[project.scripts]
canvas-chat = "canvas_chat.__main__:app"
```

Users run:

```bash
pip install canvas-chat
canvas-chat launch          # Starts FastAPI at http://localhost:7865
canvas-chat launch --port 8080
canvas-chat launch --admin-mode --config config.yaml
```

The `launch` command starts uvicorn with the FastAPI app, which serves the pre-built Svelte frontend.

### What Users Don't Need

- Node.js — not a runtime dependency
- npm — not needed
- Build tools — Svelte is pre-compiled

### What Users Do Need

- Python >= 3.11
- Dependencies listed in `pyproject.toml` (fastapi, litellm, etc.)

## Development Workflow

### Local Development (two processes)

**Terminal 1 — Backend**:

```bash
pixi run dev     # FastAPI at :7865 (API + serves static in production mode)
```

**Terminal 2 — Frontend**:

```bash
npm run dev       # Vite at :5173 with HMR, proxies /api to :7865
```

Open `http://localhost:5173` for development (Vite serves Svelte with HMR).
Open `http://localhost:7865` for production-mode testing (FastAPI serves built assets).

### Vite Proxy Configuration

During development, Vite proxies backend requests to FastAPI:

- `/api/*` → `http://localhost:7865/api/*` (API endpoints)
- `/static/js/*` → `http://localhost:7865/static/js/*` (vanilla JS modules)
- `/static/css/*` → `http://localhost:7865/static/css/*` (global CSS)

This lets the Svelte dev server handle `.svelte` files while delegating API calls to FastAPI.

### Single Command for Contributors

For convenience, a single pixi task can start both:

```toml
[tool.pixi.tasks]
dev = "python -m uvicorn canvas_chat.app:app --reload --port 7865"
dev-all = "concurrently 'pixi run dev' 'npm run dev'"
```

## ESM Module Strategy

### Current State: Already ESM

The codebase is already ES modules. `app.js` is loaded as `<script type="module">` and uses `import`/`export` throughout. All core modules use ESM exports:

```javascript
// crdt-graph.js
export { CRDTGraph };

// storage.js
export { storage };

// feature-registry.js
export { FeatureRegistry };
```

Several modules also expose to `window` as a compatibility bridge:

```javascript
// node-registry.js — ESM export + global fallback
export { NodeRegistry };
if (typeof window !== 'undefined') {
    window.NodeRegistry = NodeRegistry;
}
```

Yjs is loaded via an import map (esm.sh CDN) in `index.html`, imported as an ES module, and exposed to `window`.

### Chosen Path: Direct ESM Imports (Option A)

The Svelte app imports existing ESM modules directly. No global scope bridge, no adapter for module loading.

```svelte
<!-- CanvasFlow.svelte -->
<script>
import { CRDTGraph } from '../js/crdt-graph.js';
import { storage } from '../js/storage.js';
import { chat } from '../js/chat.js';
</script>
```

**Why this works**: The modules are already ESM. Vite resolves `import` statements natively. No code transformation needed — Vite just bundles the ESM graph.

**Why not globals (Option B)**: Global scope creates fragile coupling, prevents tree-shaking, and makes testing harder. Direct imports are the standard Svelte/Vite pattern.

### Migration Path

**Phase 1 — Direct import, keep window globals**:

- Svelte app imports modules via `import { X } from '../js/x.js'`
- Existing `window.X = X` assignments remain untouched
- Plugins continue to work via globals during transition
- Zero risk of breakage

**Phase 2 — Remove window globals progressively**:

- As each module is consumed by Svelte, remove the `window.X = X` fallback
- Start with modules that are only used internally (no plugin access): `crdt-graph.js`, `storage.js`, `sse.js`, `layout.js`
- Defer modules with heavy plugin usage: `node-registry.js`, `node-protocols.js`, `streaming-manager.js`

**Phase 3 — Convert to Svelte stores (optional, future)**:

- Wrap `CRDTGraph` in a Svelte writable store for reactivity
- Wrap `storage` in a Svelte store for reactive settings
- This is optional — plain imports work fine for non-reactive data

### Yjs Import Strategy

Yjs is currently loaded via import map from esm.sh CDN. For the Svelte migration:

**Short term**: Keep the import map in `index.html`. The Svelte app imports Yjs via bare specifier (`import * as Y from 'yjs'`), which Vite resolves using the import map. `y-indexeddb` is also imported via import map to ensure a single Yjs instance.

**Long term**: Move Yjs to npm dependency (`npm install yjs y-indexeddb`). Vite bundles it natively, no CDN needed. This reduces external dependencies and improves offline behavior. This should happen after the initial migration stabilizes.

### Modules by Migration Difficulty

| Difficulty | Module                                                                              | Why                                              |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Easy       | `crdt-graph.js`, `storage.js`, `sse.js`, `layout.js`, `utils.js`, `model-utils.js`  | No DOM dependency, pure logic, no plugin access  |
| Medium     | `chat.js`, `search.js`, `web-grounding.js`, `scroll-utils.js`                       | Some DOM usage, but well-encapsulated            |
| Hard       | `node-registry.js`, `node-protocols.js`, `feature-registry.js`, `feature-plugin.js` | Plugin system — plugins reference globals        |
| Hard       | `modal-manager.js`, `slash-command-menu.js`                                         | Heavy DOM manipulation, inline HTML templates    |
| No change  | `pyodide-runner.js`                                                                 | Loaded via non-module `<script>`, self-contained |

### Plugin System Note

Plugins are imported as side-effect modules in `app.js`:

```javascript
import './plugins/code.js'; // Registers CodeFeature + CodeNode
import './plugins/committee.js'; // Registers CommitteeFeature + OpinionNode, etc.
```

Each plugin file calls `FeatureRegistry.register()` on import. The Svelte app must replicate this import chain to trigger plugin registration. This can be done by:

1. Creating a single entry point `svelte/imports/plugins.js` that re-exports all plugins as side-effect imports
2. The main Svelte `App.svelte` imports this entry point
3. Plugins register themselves into the `FeatureRegistry` singleton (same as current behavior)

## EARS vs LLD Boundary

Architecture decisions and migration strategy live in this LLD, NOT in EARS specs. EARS specs describe observable, testable behavior. The following decisions are documented here only:

- **Full page takeover** (Svelte owns entire page) — not a spec because "rendered by Svelte" is not observable from outside. The testable consequence is that `index.html` is a minimal shell (covered by DEP-REQ-001/003).
- **Phased migration order** (canvas → chat → modals) — not a spec because phasing is a plan, not behavior. Each phase has its own testable specs.
- **Window globals during transition** — not a spec because it's temporary scaffolding. Removed after migration complete.
- **CI build step before Modal deploy** — not a spec because it's pipeline config. The testable consequence is that the deployed app serves the Svelte bundle (covered by DEP-REQ-001).
- **Plugin registration via side-effect imports** — implementation detail, not independently testable.

## Open Questions & Future Decisions

### Resolved

1. Built assets committed to git — required for Modal `.add_local_dir()` and pip wheel packaging
2. Users don't need Node.js — build runs in CI/maintainer machines only
3. Vite relative paths — `base: './'` for load balancer compatibility
4. ESM module strategy — Option A: Svelte imports existing ESM modules directly (modules are already ESM, no adapter needed)
5. Window globals — Keep during transition, remove progressively as each module is consumed by Svelte
6. Plugin registration — Side-effect import chain replicated in Svelte app entry point
7. HTML ownership — Full page takeover: Svelte owns toolbar, canvas, chat input, modals, search. index.html becomes minimal `<div id="app">` shell. Progressive execution: canvas first, then chat/toolbar, then modals, then remove App class.

### Deferred

1. Should the build be enforced via pre-commit hook or CI-only? → Start with CI check, add pre-commit hook later
2. Convert modules to Svelte stores? → Optional future work; plain imports work for initial migration
3. CDN vs bundled dependencies? (marked.js, KaTeX, Pyodide) → Keep as CDN for now; evaluate bundling later
4. Yjs as npm dependency? → Move from CDN import map to npm after initial migration stabilizes

## References

- HLD: `/docs/high-level-design.md` (Section 9: Build, Deploy, and Distribution)
- Canvas Rendering LLD: `/docs/llds/canvas-rendering.md`
- Plugin System LLD: `/docs/llds/plugin-system.md`
- App Orchestrator LLD: `/docs/llds/app-orchestrator.md`
- Modal deployment: `modal_app.py`
- CI workflow: `.github/workflows/modal-deploy.yaml`
- Package config: `pyproject.toml`
