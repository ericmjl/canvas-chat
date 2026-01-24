# Agents

Instructions for AI coding agents working on this project.

## Maintaining this document

**CRITICAL:** When making architectural changes to the codebase, **you MUST update this AGENTS.md file** to reflect those changes.

This includes:

- **Adding new modules** - Update the "Codebase map" tables with new files
- **Changing architecture patterns** - Update the "Architecture patterns" section
- **Adding new constants** - Update the "Key constants and their locations" table
- **Deprecating patterns** - Remove outdated information and add migration notes
- **Refactoring features** - Update file locations and purposes
- **New testing patterns** - Document in the "Testing" section
- **New development workflows** - Add to relevant sections

**Why this matters:** This document is the primary onboarding guide for AI agents. If it's outdated, agents will:

- Use deprecated APIs
- Create files in the wrong locations
- Follow obsolete patterns
- Break existing conventions

**When to update:** Before completing a PR that changes architecture, review this document and update it. Include AGENTS.md changes in your PR.

**User corrections:** If a user corrects your workflow or tool usage, add a short note here documenting the correction so future agents follow it.

- 2026-01-16: Use `pixi run python` instead of `python` for project commands.
- 2026-01-17: Always run tests after adding tests.
- 2026-01-17: Always run tests after making changes.
- 2026-01-20: NEVER deploy directly to Modal environments (`modal deploy`). Let CI handle Modal deployments via GitHub Actions. Direct deploys bypass testing and can break production.
- 2026-01-20: Fix tag removal bug - canvas uses callback properties (`canvas.onTagRemove = handler`), not event emitter. Changed app.js to set `this.canvas.onTagRemove` instead of `.on('tagRemove', ...)`. Prefer event emitter pattern for new code.
- 2026-01-24: Used `--no-verify` flag with git commit after adding pre-commit hooks (tsc + jsdoc). NEVER use this - always let pre-commit hooks run. If hooks fail, fix issues and commit normally.
- 2026-01-24: Removed TypeScript type checking from pre-commit hooks and pixi tasks. Project uses plain JavaScript with JSDoc annotations for documentation only, not strict type checking.

**Python commands:** Use `pixi run python` when running project Python commands so the pixi environment and dependencies are active.

## Codebase map

Quick reference for which files to edit for common tasks.

### Directory structure

```text
canvas-chat/
├── src/canvas_chat/          # Main Python package
│   ├── app.py                # FastAPI backend routes
│   ├── config.py             # Configuration management
│   ├── __main__.py           # CLI entry point
│   └── static/               # Frontend assets
│       ├── index.html        # Main HTML
│       ├── css/              # Stylesheets (9 files)
│       └── js/               # JavaScript modules
│           ├── app.js        # Main application orchestrator
│           ├── canvas.js    # SVG canvas rendering
│           ├── crdt-graph.js # Graph data model
│           ├── chat.js      # LLM API integration
│           ├── feature-*.js # Feature plugins
│           └── example-plugins/ # Example plugins (test, smart-fix, poll node)
├── tests/                    # Test files
├── docs/                     # Documentation (Diataxis)
├── modal_app.py              # Modal deployment config
└── pyproject.toml            # Project config (pixi)
```

### File organization principles

- **Frontend**: Vanilla JavaScript (ES modules), no frameworks
- **Backend**: Python with FastAPI
- **Styling**: Modular CSS files imported by `style.css`
- **Plugins**: Three-level architecture (node types → features → extensions)
- **Tests**: Mirror source structure in `tests/` directory

### Frontend (Vanilla JS)

#### Core modules

| File                                       | Purpose                                                                | Edit for...                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/canvas_chat/static/js/app.js`         | Main application, orchestrates everything                              | Slash commands, keyboard shortcuts, App class methods                                                    |
| `src/canvas_chat/static/js/canvas.js`      | SVG canvas, pan/zoom, node/edge rendering with defensive edge deferral | Node appearance, drag behavior, viewport logic, node event handlers, edge rendering, deferred edge queue |
| `src/canvas_chat/static/js/graph-types.js` | Node/edge types, factory functions                                     | Node types, edge types, createNode/createEdge utilities                                                  |
| `src/canvas_chat/static/js/crdt-graph.js`  | CRDT-backed graph (Yjs), graph traversal                               | Graph data model, node positioning, graph traversal                                                      |
| `src/canvas_chat/static/js/layout.js`      | Pure layout functions for overlap detection                            | Overlap detection, overlap resolution, node positioning algorithms                                       |
| `src/canvas_chat/static/js/chat.js`        | LLM API calls, streaming                                               | API integration, message formatting, token estimation                                                    |
| `src/canvas_chat/static/js/storage.js`     | localStorage persistence                                               | Session storage, API key storage, settings                                                               |
| `src/canvas_chat/static/js/search.js`      | Node search functionality                                              | Search UI, filtering logic                                                                               |
| `src/canvas_chat/static/js/sse.js`         | Server-sent events utilities                                           | Streaming connection handling                                                                            |
| `src/canvas_chat/static/js/utils.js`       | Pure utility functions                                                 | Image resizing, error formatting, text processing                                                        |
| `src/canvas_chat/static/js/model-utils.js` | Model utility functions                                                | Model-related utilities                                                                                  |

#### Plugin architecture modules

| File                                                      | Purpose                                 | Edit for...                                       |
| --------------------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `src/canvas_chat/static/js/feature-plugin.js`             | FeaturePlugin base class, AppContext    | Plugin base class, dependency injection           |
| `src/canvas_chat/static/js/feature-registry.js`           | Plugin registration and lifecycle       | Registering plugins, slash command routing        |
| `src/canvas_chat/static/js/plugin-events.js`              | Event system for plugin communication   | Event types, cancellable events                   |
| `src/canvas_chat/static/js/node-registry.js`              | Custom node type registration           | Registering custom node types                     |
| `src/canvas_chat/static/js/node-protocols.js`             | Node protocol classes, wrapNode utility | Node rendering, actions, protocol implementations |
| `src/canvas_chat/static/js/plugin-test-harness.js`        | Testing utilities for plugins           | Writing plugin tests                              |
| `src/canvas_chat/static/js/file-upload-handler-plugin.js` | FileUploadHandlerPlugin base class      | File upload handler plugin base class             |
| `src/canvas_chat/static/js/file-upload-registry.js`       | File upload handler registration        | Registering file upload handlers                  |

#### Feature plugins (built-in)

| File                                             | Purpose                | Edit for...                                                  |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------ |
| `src/canvas_chat/static/js/flashcards.js`        | FlashcardFeature class | Flashcard generation, spaced repetition UI                   |
| `src/canvas_chat/static/js/committee.js`         | CommitteeFeature class | Multi-LLM consultation, synthesis                            |
| `src/canvas_chat/static/js/matrix.js`            | MatrixFeature class    | Comparison matrix creation, cell filling                     |
| `src/canvas_chat/static/js/factcheck.js`         | FactcheckFeature class | Claim verification, web search integration                   |
| `src/canvas_chat/static/js/research.js`          | ResearchFeature class  | Deep research with Exa API                                   |
| `src/canvas_chat/static/js/code-feature.js`      | CodeFeature class      | Self-healing code execution                                  |
| `src/canvas_chat/static/js/plugins/git-repo.js`  | GitRepoFeature class   | Git repository fetching with file selection (`/git` command) |
| `src/canvas_chat/static/js/plugins/youtube.js`   | YouTubeFeature class   | YouTube video fetching with transcript (`/youtube` command)  |
| `src/canvas_chat/static/js/plugins/url-fetch.js` | UrlFetchFeature class  | Generic URL fetching (`/fetch` command)                      |

#### Example plugins

| File                                                               | Purpose                                | Edit for...                 |
| ------------------------------------------------------------------ | -------------------------------------- | --------------------------- |
| `src/canvas_chat/static/js/example-plugins/smart-fix-plugin.js`    | SmartFixPlugin - Enhanced self-healing | Example of extension hooks  |
| `src/canvas_chat/static/js/example-plugins/example-test-plugin.js` | Simple test plugin                     | Plugin development examples |
| `src/canvas_chat/static/js/example-plugins/example-poll-node.js`   | Example poll node custom node type     | Custom node type examples   |

#### Support modules

| File                                               | Purpose                               | Edit for...                           |
| -------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| `src/canvas_chat/static/js/streaming-manager.js`   | Concurrent streaming state management | Managing multiple LLM streams         |
| `src/canvas_chat/static/js/modal-manager.js`       | Modal lifecycle management            | Modal creation, event handling        |
| `src/canvas_chat/static/js/file-upload-handler.js` | File upload dispatcher                | Routes uploads to registered handlers |
| `src/canvas_chat/static/js/undo-manager.js`        | Undo/redo functionality               | Action history, undo operations       |
| `src/canvas_chat/static/js/slash-command-menu.js`  | Slash command autocomplete UI         | Command menu behavior                 |
| `src/canvas_chat/static/js/pyodide-runner.js`      | Python code execution (Pyodide)       | Code execution, environment setup     |
| `src/canvas_chat/static/js/highlight-utils.js`     | Text highlighting utilities           | Text selection, excerpt extraction    |
| `src/canvas_chat/static/js/scroll-utils.js`        | Scroll container detection            | Scroll event handling, DOM traversal  |
| `src/canvas_chat/static/js/event-emitter.js`       | Event emitter pattern                 | Event-driven architecture             |

### Frontend (HTML/CSS)

| File                                        | Purpose                       | Edit for...                                  |
| ------------------------------------------- | ----------------------------- | -------------------------------------------- |
| `src/canvas_chat/static/index.html`         | Main HTML, modals, templates  | New modals, toolbar buttons, HTML structure  |
| `src/canvas_chat/static/css/style.css`      | Main stylesheet (imports all) | Main CSS entry point, CSS variables          |
| `src/canvas_chat/static/css/base.css`       | Base styles, resets           | Global resets, base typography               |
| `src/canvas_chat/static/css/canvas.css`     | Canvas-specific styles        | SVG canvas, pan/zoom, viewport               |
| `src/canvas_chat/static/css/components.css` | Reusable components           | Buttons, inputs, tooltips, shared components |
| `src/canvas_chat/static/css/input.css`      | Input area styles             | Chat input, textarea, input controls         |
| `src/canvas_chat/static/css/matrix.css`     | Matrix node styles            | Matrix table, cell styling                   |
| `src/canvas_chat/static/css/modals.css`     | Modal styles                  | Modal dialogs, overlays, forms               |
| `src/canvas_chat/static/css/nodes.css`      | Node-specific styles          | Node containers, content, headers            |
| `src/canvas_chat/static/css/toolbar.css`    | Toolbar styles                | Top toolbar, buttons, controls               |

### Backend (Python/FastAPI)

| File                                            | Purpose                            | Edit for...                                          |
| ----------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `src/canvas_chat/app.py`                        | FastAPI routes, LLM proxy          | API endpoints, backend logic                         |
| `src/canvas_chat/config.py`                     | Configuration management           | Model definitions, plugins, admin mode               |
| `src/canvas_chat/__main__.py`                   | CLI entry point                    | Command-line interface, dev server                   |
| `src/canvas_chat/__init__.py`                   | Package initialization             | Package metadata, version                            |
| `src/canvas_chat/file_upload_registry.py`       | File upload handler registration   | Registering Python file upload handlers              |
| `src/canvas_chat/file_upload_handler_plugin.py` | FileUploadHandlerPlugin base class | File upload handler plugin base class                |
| `src/canvas_chat/plugins/`                      | Python plugin modules              | Backend plugins (matrix_handler, code_handler, etc.) |
| `modal_app.py`                                  | Modal deployment config            | Deployment settings                                  |

### Key constants and their locations

| Constant                            | Location                                | Purpose                                                 |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| `NodeType`                          | `graph-types.js:11-32`                  | All node type definitions                               |
| `EdgeType`                          | `graph-types.js:82-94`                  | All edge type definitions                               |
| `DEFAULT_NODE_SIZES`                | `graph-types.js:40-68`                  | Default dimensions by node type                         |
| `PRIORITY`                          | `feature-registry.js:8-12`              | Plugin priority levels (BUILTIN > OFFICIAL > COMMUNITY) |
| `PluginConfig`                      | `config.py:78-197`                      | Plugin configuration dataclass (JS/PY/paired plugins)   |
| `CANVAS_CHAT_ENABLE_GITHUB_COPILOT` | `config.py:is_github_copilot_enabled()` | Enable/disable GitHub Copilot (default: true)           |
| CSS variables                       | `style.css:10-75`                       | Colors, sizing, theming                                 |

### Zoom levels (semantic zoom)

| Scale      | Class          | Behavior                          |
| ---------- | -------------- | --------------------------------- |
| > 0.6      | `zoom-full`    | Full node content visible         |
| 0.35 - 0.6 | `zoom-summary` | Summary text shown, drag anywhere |
| <= 0.35    | `zoom-mini`    | Minimal view, drag anywhere       |

## Documentation

All documentation must follow the [Diataxis framework](https://diataxis.fr/):

- **docs/explanation/**: Design decisions, architecture rationale, "why" documents
- **docs/how-to/**: Task-oriented guides for accomplishing specific goals
- **docs/reference/**: Technical descriptions of APIs, configuration options, data structures

Do not mix documentation types. Each document should serve one purpose.

### Documentation Map

Quick reference guide for finding the right documentation based on what you need to do:

#### Plugin Development

| Task/Question                                             | Documentation                                                              | Description                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **I want to build a plugin**                              | [build-plugins.md](docs/how-to/build-plugins.md)                           | Comprehensive guide with prompt templates for all plugin types (JS-only, Python-only, paired) |
| **I want to create a feature plugin with slash commands** | [create-feature-plugins.md](docs/how-to/create-feature-plugins.md)         | Step-by-step guide for Level 2 plugins (feature plugins)                                      |
| **I want to create a custom node type**                   | [create-custom-node-plugins.md](docs/how-to/create-custom-node-plugins.md) | Guide for Level 1 plugins (custom node types)                                                 |
| **What is the plugin architecture?**                      | [plugin-architecture.md](docs/explanation/plugin-architecture.md)          | Design decisions and rationale for the three-level plugin system                              |
| **What APIs are available to plugins?**                   | [feature-plugin-api.md](docs/reference/feature-plugin-api.md)              | Complete API reference for FeaturePlugin base class                                           |
| **What is AppContext and what APIs does it provide?**     | [app-context-api.md](docs/reference/app-context-api.md)                    | Dependency injection and available Canvas-Chat APIs                                           |
| **How do I register and manage plugins?**                 | [feature-registry-api.md](docs/reference/feature-registry-api.md)          | Plugin registration, lifecycle, and management                                                |
| **How do I hook into existing features?**                 | [extension-hooks.md](docs/reference/extension-hooks.md)                    | Level 3 plugins - hooking into existing features                                              |
| **How do node protocols work?**                           | [node-protocols.md](docs/explanation/node-protocols.md)                    | Design decisions for node protocol system                                                     |

#### User Features

| Task/Question                                    | Documentation                                                    | Description                                   |
| ------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------- |
| **How does deep research work?**                 | [deep-research.md](docs/how-to/deep-research.md)                 | Using the /research command for deep research |
| **How does web search work?**                    | [web-search.md](docs/how-to/web-search.md)                       | Using the /search command for web searches    |
| **How does the committee feature work?**         | [llm-committee.md](docs/how-to/llm-committee.md)                 | Multi-LLM consultation and synthesis          |
| **How does fact-checking work?**                 | [factcheck.md](docs/how-to/factcheck.md)                         | Claim verification with web search            |
| **How do I use the matrix evaluation?**          | [use-matrix-evaluation.md](docs/how-to/use-matrix-evaluation.md) | Creating and using comparison matrices        |
| **How do I import PDFs?**                        | [import-pdfs.md](docs/how-to/import-pdfs.md)                     | Uploading and working with PDF documents      |
| **How do I use images?**                         | [use-images.md](docs/how-to/use-images.md)                       | Adding and working with images                |
| **How do I navigate nodes?**                     | [navigate-nodes.md](docs/how-to/navigate-nodes.md)               | Keyboard shortcuts and navigation             |
| **How do I highlight and branch conversations?** | [highlight-and-branch.md](docs/how-to/highlight-and-branch.md)   | Creating conversation branches                |
| **What keyboard shortcuts are available?**       | [keyboard-shortcuts.md](docs/reference/keyboard-shortcuts.md)    | Complete list of keyboard shortcuts           |

#### Architecture & Design

| Task/Question                                       | Documentation                                                           | Description                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| **Why is the plugin system designed this way?**     | [plugin-architecture.md](docs/explanation/plugin-architecture.md)       | Design rationale for three-level plugin architecture |
| **How does streaming work?**                        | [streaming-architecture.md](docs/explanation/streaming-architecture.md) | Server-sent events and streaming design              |
| **How does auto-layout work?**                      | [auto-layout.md](docs/explanation/auto-layout.md)                       | Node positioning and overlap resolution              |
| **How does the committee feature work internally?** | [committee-architecture.md](docs/explanation/committee-architecture.md) | Multi-LLM consultation design                        |
| **How does matrix evaluation work?**                | [matrix-evaluation.md](docs/explanation/matrix-evaluation.md)           | Matrix cell filling and evaluation design            |
| **How does matrix resizing work?**                  | [matrix-resize-behavior.md](docs/explanation/matrix-resize-behavior.md) | Matrix node resize behavior                          |
| **How does URL fetching work?**                     | [url-fetching.md](docs/explanation/url-fetching.md)                     | URL content extraction design                        |
| **How does WebRTC signaling work?**                 | [webrtc-signaling.md](docs/explanation/webrtc-signaling.md)             | WebRTC peer connection signaling                     |
| **What is admin mode and how is it secured?**       | [admin-mode-security.md](docs/explanation/admin-mode-security.md)       | Admin mode security design                           |

#### Configuration & Deployment

| Task/Question                   | Documentation                                 | Description                      |
| ------------------------------- | --------------------------------------------- | -------------------------------- |
| **How do I set up admin mode?** | [admin-mode.md](docs/how-to/admin-mode.md)    | Configuring server-side API keys |
| **What is the search API?**     | [search-api.md](docs/reference/search-api.md) | Search API reference             |

#### Code Reference

| Task/Question                                    | Where to Look                                                       | Description                          |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------ |
| **What methods are available on FeaturePlugin?** | [feature-plugin-api.md](docs/reference/feature-plugin-api.md)       | Complete FeaturePlugin API reference |
| **What APIs can I access via AppContext?**       | [app-context-api.md](docs/reference/app-context-api.md)             | Graph, Canvas, Chat, Storage APIs    |
| **How do I register a plugin?**                  | [feature-registry-api.md](docs/reference/feature-registry-api.md)   | FeatureRegistry registration methods |
| **What events can I subscribe to?**              | [extension-hooks.md](docs/reference/extension-hooks.md)             | Available events and hooks           |
| **What keyboard shortcuts exist?**               | [keyboard-shortcuts.md](docs/reference/keyboard-shortcuts.md)       | Complete keyboard shortcut reference |
| **How does auto-zoom work?**                     | [auto-zoom.md](docs/reference/auto-zoom.md)                         | Auto-zoom for plugin node creation   |
| **How do canvas event handlers work?**           | [canvas-event-handlers.md](docs/reference/canvas-event-handlers.md) | Event handler registration           |
| **What is the JSDoc linting setup?**             | [jsdoc-linting.md](docs/reference/jsdoc-linting.md)                 | JSDoc validation rules               |

## Code style

- Backend: Python with FastAPI, use type hints
- Frontend: Vanilla JavaScript (no frameworks), CSS, HTML
- Prefer simple, greedy algorithms over complex optimal solutions
- Local-first: no server-side user data storage

### JSDoc Documentation

JSDoc linting runs automatically via pre-commit hooks on commit. JSDoc errors will block commits.

**Note:** The project uses plain JavaScript (`.js` files) with JSDoc type annotations for documentation purposes only. TypeScript type checking is not enforced - JSDoc annotations are used to improve code documentation and IDE support, but the code remains JavaScript.

```bash
# Using pixi
pixi run jsdoc

# Direct tool (run by pre-commit hooks)
npx -y jsdoc -c .jsdoc.json
```

### Type Annotation Pattern

When adding types to JavaScript files, use JSDoc annotations that TypeScript understands:

```javascript
/**
 * @typedef {Object} NodePosition
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} Node
 * @property {string} id - Unique node identifier
 * @property {NodePosition} position - Node position
 * @property {number} [width] - Optional width override
 * @property {number} [height] - Optional height override
 */

/**
 * @param {Node & {position: NodePosition, width?: number, height?: number}} nodeA
 * @returns {{ overlapX: number, overlapY: number }}
 */
function getOverlap(nodeA, nodeB, padding = 40) {
    // ...
}
```

### Adding JSDoc Annotations

When adding JSDoc annotations to JavaScript files, focus on improving documentation and IDE support rather than strict type checking. Add annotations for:

- Function parameters and return types
- Complex data structures (using `@typedef`)
- Class properties and methods
- Important type relationships

JSDoc annotations are optional but encouraged for better code documentation. The project does not enforce TypeScript-style strict type checking.

## Post-task review

After completing a task, take a moment to review the code you've written and look for refactoring opportunities:

- Duplicated logic that could be extracted into shared functions
- Overly complex conditionals that could be simplified
- Inconsistent patterns that should be unified
- Dead code or unused variables

It's fine if there's nothing to refactor, but if improvements exist, address them before committing.

## Git workflow

### Committing changes

**ALWAYS wait for user approval before committing.** Do not commit changes automatically. Ask the user if they want to commit, or wait for explicit instruction to commit.

### Branching strategy

**NEVER push directly to main.** All changes must be made via pull request.

1. Create a feature branch for your changes
2. Make commits on the feature branch
3. Push the feature branch and create a PR
4. Merge via the PR after review/checks pass

```bash
# Create and switch to a new branch
git checkout -b fix/descriptive-name

# Make changes, commit, push
git add .
git commit -m "fix: description"
git push -u origin fix/descriptive-name

# Create PR - ALWAYS write body to /tmp file first to avoid shell parsing issues
echo "## Summary
...
## Changes Breakdown
..." > /tmp/pr_body.md
gh pr create --title "Fix: Description" --body-file /tmp/pr_body.md
```

**CRITICAL: Always write PR bodies to a `/tmp` file first.** Complex PR descriptions with special characters, quotes, or multi-line content can cause shell parsing errors. Use `--body-file` instead of `--body`:

```bash
# Write PR body to temp file
cat > /tmp/pr_body.md << 'EOF'
## Summary
Complex PR description with special characters, quotes, etc.
EOF

# Create PR using the file
gh pr create --title "Title" --body-file /tmp/pr_body.md
```

- Keep PR descriptions aligned with the actual diff before review.
- Use a detailed PR description template (Summary, Root Cause, Solution, Changes breakdown, Tests, Manual Testing if needed).
- Include concrete file references and test counts when available, and call out any doc/lockfile updates.

### Merging PRs

**NEVER use `--squash` when merging PRs.** Always use the default merge strategy to preserve commit history.

```bash
# WRONG - Never squash commits
gh pr merge 180 --squash

# CORRECT - Use default merge (preserves history)
gh pr merge 180 --delete-branch
```

**Why:** Squashing loses commit history and makes it harder to track when specific changes were introduced. We want to preserve the full commit history for debugging and attribution.

### Closing issues

**NEVER close issues directly with `gh issue close`.** Issues should only be closed via pull requests using GitHub's "Closes #N" or "Fixes #N" syntax in the PR description or commit messages.

- Use `Closes #100` in PR description to auto-close when merged
- Sub-issues for implementation tracking can be closed directly, but the main feature issue must be closed via PR
- This ensures proper traceability between code changes and issue resolution

### Pre-commit hooks

**NEVER use `--no-verify` or `-n` when committing.** Pre-commit hooks ensure code quality and must always run.

If pre-commit hooks fail:

1. Fix the issues reported by the hooks
2. Run `uvx pre-commit run --all-files` to verify fixes
3. Commit again without `--no-verify`

If hooks fail due to sandbox restrictions (e.g., `PermissionError`), use `required_permissions: ['all']` when running git commands, but still ensure hooks pass before committing.

**Example of what NOT to do:**

```bash
# WRONG - Never do this
git commit --no-verify -m "message"
```

**Example of correct workflow:**

```bash
# Fix issues first
uvx pre-commit run --all-files

# Then commit normally (hooks will run automatically)
git commit -m "message"
```

## Architecture patterns

### Plugin architecture

Canvas-Chat uses a **three-level plugin architecture** for extensibility:

1. **Level 1: Custom Node Types** - Custom rendering and visual appearance
2. **Level 2: Feature Plugins** - Complex workflows, slash commands, multi-step LLM operations
3. **Level 3: Extension Hooks** - Hook into existing features to modify behaviors

**For detailed information**, see:

- [Plugin Architecture Explanation](docs/explanation/plugin-architecture.md) - Design decisions and rationale
- [How to Build Plugins](docs/how-to/build-plugins.md) - Comprehensive guide with prompt templates for all plugin types
- [Create Feature Plugins Guide](docs/how-to/create-feature-plugins.md) - Step-by-step plugin development
- [Feature Plugin API](docs/reference/feature-plugin-api.md) - Complete API reference

**Plugin Configuration:**

Plugins can be configured in `config.yaml` with three formats:

- **JavaScript-only**: `- path: ./plugins/my-plugin.js` or `- js: ./plugins/my-plugin.js`
- **Python-only**: `- py: ./plugins/my_handler.py`
- **Paired (JS + Python)**: `- js: ./plugins/my-plugin.js, py: ./plugins/my_handler.py, id: my-plugin`

Python plugins are loaded dynamically at startup via `importlib`. JavaScript plugins are served via `/api/plugins/{name}` and injected into HTML.

#### When to use each level

**Custom Node Types** (Level 1):

- You need custom rendering (polls, charts, forms)
- You need custom action buttons on nodes
- You DON'T need slash commands or complex workflows

**Feature Plugins** (Level 2):

- You need slash commands (`/mycommand`)
- You need multi-step LLM workflows
- You need state management across operations
- You need access to graph, canvas, chat APIs

**Extension Hooks** (Level 3):

- You want to enhance existing features (not replace them)
- You need to intercept operations (logging, validation)
- Multiple plugins need to react to the same event

#### Adding a new feature plugin

1. **Create plugin file** in `src/canvas_chat/static/js/my-feature.js`:

```javascript
import { FeaturePlugin } from './feature-plugin.js';

export class MyFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.chat = context.chat;
    }

    getSlashCommands() {
        return [
            {
                command: '/mycommand',
                description: 'Does something cool',
                placeholder: 'Enter input...',
            },
        ];
    }

    async handleCommand(command, args, context) {
        // Implement command logic
    }

    getCanvasEventHandlers() {
        // Optional: Handle canvas events from custom nodes
        return {
            myCustomEvent: this.handleMyEvent.bind(this),
        };
    }

    async onLoad() {
        console.log('[MyFeature] Loaded');
    }
}
```

1. **Register in FeatureRegistry** (`feature-registry.js`):

    ```javascript
    static registerBuiltInFeatures(app) {
        // ... existing features ...

        registry.registerFeature(new MyFeature(ctx), PRIORITY.BUILTIN);
    }
    ```

2. **Add getter in App** (`app.js`):

    ```javascript
    get myFeature() {
        return this._getFeature('my-feature', 'MyFeature');
    }
    ```

3. **Write tests** (`tests/test_my_feature.js`):

    ```javascript
    import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
    import { MyFeature } from '../src/canvas_chat/static/js/my-feature.js';

    asyncTest('MyFeature handles command', async () => {
        const harness = new PluginTestHarness();
        await harness.loadPlugin(MyFeature, 'my-feature');

        const result = await harness.executeCommand('/mycommand arg');
        assertTrue(result);
    });
    ```

#### Plugin Modal Registration

**CRITICAL:** If your plugin needs a modal, you MUST register it in the `onLoad()` lifecycle hook using `this.modalManager.registerModal()`.

**Common Error:**

```text
Error: [ModalManager] Plugin modal my-plugin:settings not registered.
Call registerModal() in onLoad().
```

**Pattern to follow:**

```javascript
export class MyFeature extends FeaturePlugin {
    async onLoad() {
        console.log('[MyFeature] Loaded');

        // Register modal with HTML template
        const modalTemplate = `
            <div id="my-feature-settings-modal" class="modal" style="display: none">
                <div class="modal-content modal-narrow">
                    <div class="modal-header">
                        <h2>My Feature Settings</h2>
                        <button class="modal-close" id="my-feature-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <!-- Your modal content here -->
                        <div class="api-key-group">
                            <label for="my-setting">Setting Name</label>
                            <input type="text" id="my-setting" class="modal-text-input" />
                        </div>

                        <div class="modal-actions">
                            <button id="my-feature-save" class="primary-btn">Save</button>
                            <button id="my-feature-cancel" class="secondary-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Register with modalManager (pluginId, modalId, htmlTemplate)
        this.modalManager.registerModal('my-feature', 'settings', modalTemplate);

        // Setup event listeners
        const closeBtn = document.getElementById('my-feature-close');
        const saveBtn = document.getElementById('my-feature-save');
        const cancelBtn = document.getElementById('my-feature-cancel');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('my-feature', 'settings');
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSave());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('my-feature', 'settings');
            });
        }
    }

    // Show modal in your command handler
    async handleCommand(command, args, context) {
        // ... your logic ...

        // Show the modal using showPluginModal(pluginId, modalId)
        this.modalManager.showPluginModal('my-feature', 'settings');
    }

    // Hide modal when done
    handleSave() {
        // Save logic...

        // Hide using hidePluginModal(pluginId, modalId)
        this.modalManager.hidePluginModal('my-feature', 'settings');
    }
}
```

**Key points:**

- ✅ Register modal in `onLoad()`, not in constructor or command handler
- ✅ Use `registerModal(pluginId, modalId, htmlTemplate)` with complete HTML
- ✅ Use `showPluginModal(pluginId, modalId)` to show (NOT `showModal`)
- ✅ Use `hidePluginModal(pluginId, modalId)` to hide (NOT `hideModal`)
- ✅ Setup event listeners in `onLoad()` after registration
- ❌ DON'T use `showModal()` or `hideModal()` - those don't exist for plugins
- ❌ DON'T use `getModals()` - that's an older pattern
- ❌ DON'T try to show modal before registering it

**Common errors to avoid:**

```javascript
// ❌ WRONG - these methods don't exist
this.modalManager.showModal('my-plugin:settings');
this.modalManager.hideModal('my-plugin:settings');

// ✅ CORRECT - use Plugin versions
this.modalManager.showPluginModal('my-plugin', 'settings');
this.modalManager.hidePluginModal('my-plugin', 'settings');
```

**Existing examples:**

- `src/canvas_chat/static/js/plugins/committee.js` - Complex modal with multiple inputs
- `src/canvas_chat/static/js/plugins/matrix.js` - Multiple modals for different actions
- `src/canvas_chat/static/js/plugins/image-generation.js` - Simple settings modal

### StreamingManager for concurrent operations

When a feature needs to manage multiple concurrent LLM streaming operations, **always use StreamingManager**.

**DO NOT** create per-feature state management for streaming. StreamingManager provides:

- Centralized stop/continue button management
- Automatic abort controller lifecycle
- Group streaming (e.g., matrix cells)
- Canvas event integration
- Feature-specific stop messages

**Example usage:**

```javascript
class MyFeature extends FeaturePlugin {
    async startGeneration(nodeId) {
        const abortController = new AbortController();

        // Register with StreamingManager
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: this.id,
            onStop: (nodeId) => this.handleStop(nodeId),
            onContinue: async (nodeId, state) => this.handleContinue(nodeId, state),
        });

        // Start streaming with abort signal
        this.chat.sendMessage(
            messages,
            model,
            (chunk) => this.handleChunk(nodeId, chunk),
            () => this.streamingManager.unregister(nodeId),
            () => this.streamingManager.unregister(nodeId),
            { signal: abortController.signal }
        );
    }
}
```

**Group streaming** (for operations like matrix cell filling):

```javascript
// Register group
const groupId = `matrix-${matrixId}`;
cellIds.forEach((cellId) => {
    this.streamingManager.register(cellId, {
        abortController: controllers.get(cellId),
        featureId: this.id,
        groupId: groupId,
    });
});

// Stop entire group at once
this.streamingManager.stopGroup(groupId);
```

### Module system

**Canvas-Chat uses ES modules exclusively.** All JavaScript code must use ES module syntax.

**Requirements:**

- **ALWAYS** use `import`/`export` syntax (never CommonJS `require`/`module.exports`)
- **ALWAYS** import dependencies explicitly at the top of files
- **NEVER** rely on global scope (`window.X`) for module dependencies
- Load in HTML with `<script type="module" src="...">`
- Tests import modules directly with `import` statements

**Correct ES module pattern:**

```javascript
// my-module.js - Exporting
export class MyClass {
    doSomething() {}
}

export function myFunction() {}

// other-module.js - Importing
import { MyClass, myFunction } from './my-module.js';

const instance = new MyClass();
myFunction();
```

**❌ NEVER do this (outdated patterns):**

```javascript
// WRONG - Don't use global scope for dependencies
window.layoutUtils.someFunction();

// WRONG - Don't use CommonJS
const MyClass = require('./my-module.js');
module.exports = { MyClass };

// WRONG - Don't rely on globals when imports are available
if (typeof MyClass === 'undefined') {
    // ...
}
```

**✅ ALWAYS do this:**

```javascript
// CORRECT - Use explicit imports
import { someFunction } from './layout.js';
someFunction();

// CORRECT - Import all dependencies at the top
import { NodeType } from './graph-types.js';
import { wouldOverlapNodes } from './layout.js';
import { EventEmitter } from './event-emitter.js';
```

**Example test:**

```javascript
// tests/test_my_module.js
import { MyClass } from '../src/canvas_chat/static/js/my-module.js';

test('MyClass works', () => {
    const instance = new MyClass();
    // ...
});
```

**When refactoring:**

If you find code using `window.X` to access another module's functionality:

1. Add an `import` statement at the top of the file
2. Replace all `window.X.method()` calls with direct `method()` calls
3. Ensure the imported module properly exports the functions/classes

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

**Note:** For plugin-scoped event handlers (recommended for new plugins), use `getCanvasEventHandlers()` in your FeaturePlugin instead of modifying `app.js`. See [Plugin-scoped event handlers](#plugin-scoped-event-handlers) below.

### Event Emitter Pattern vs Callback Properties

**Prefer event emitter pattern (`emitter.on()` / `emitter.emit()`) over callback properties.**

**Why:**

- Multiple handlers can subscribe to the same event
- Easier to test and mock
- Cleaner separation of concerns
- Follows the project's established architecture

**The old pattern (avoid):**

```javascript
// In canvas.js - callback property (NOT recommended)
this.onTagRemove = null; // Single callback
if (this.onTagRemove) this.onTagRemove(nodeId, color);

// In app.js - setting callback property
this.canvas.onTagRemove = this.handleTagRemove.bind(this);
```

**The preferred pattern (use):**

```javascript
// In canvas.js - event emitter (RECOMMENDED)
this.emit('tagRemove', nodeId, color);

// In app.js - subscribing to event
this.canvas.on('tagRemove', this.handleTagRemove.bind(this));
```

**Exception:** When adding new node actions to the Canvas class (e.g., `onNodeXxx`), prefer the event emitter pattern by using `this.emit()` in canvas.js and `this.canvas.on()` in app.js. If you must use callback properties for legacy compatibility, document the pattern mismatch.

### Plugin-scoped event handlers

**NEW:** Plugins can now register canvas event handlers directly without modifying `app.js`.

**Pattern:** Use `getCanvasEventHandlers()` in your FeaturePlugin:

```javascript
class MyFeature extends FeaturePlugin {
    getCanvasEventHandlers() {
        return {
            myCustomEvent: this.handleMyEvent.bind(this),
            anotherEvent: this.handleAnother.bind(this),
        };
    }

    handleMyEvent(nodeId, ...args) {
        // Handle event - receives arguments directly from canvas.emit()
        const node = this.graph.getNode(nodeId);
        // Update node, re-render, etc.
    }
}
```

**Benefits:**

- Self-contained plugins (no `app.js` modifications needed)
- Automatic registration/unregistration during plugin lifecycle
- Cleaner architecture (handlers live with plugin code)

**Example:** See `poll.js` for a complete implementation with LLM generation and event handling.

### Slash commands

Slash commands are registered via FeaturePlugin's `getSlashCommands()` method and routed by FeatureRegistry.

**Built-in slash commands:**

- `/fetch` - Generic URL fetching (basic FETCH_RESULT nodes, no special rendering)
- `/git` - Git repository fetching with file selection (enhanced UX with file tree drawer)
- `/youtube` - YouTube video fetching with transcript and video embedding (enhanced UX)
- `/note` - Add markdown note
- `/search` - Web search
- `/research` - Deep research
- `/committee` - Multi-LLM consultation
- `/matrix` - Create comparison matrix
- `/factcheck` - Verify claims

**Note:** `/fetch <url>` creates basic FETCH_RESULT nodes for any URL. For enhanced UX (file selection, video embedding), use specific commands like `/git` or `/youtube`.

**To add a new slash command:**

1. Create a FeaturePlugin class
2. Implement `getSlashCommands()` method returning command definitions
3. Implement `handleCommand(command, args, contextObj)` method
4. Register feature in `FeatureRegistry.registerBuiltInFeatures()`

The `contextObj` parameter provides surrounding text for contextual commands (e.g., selected text).
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
this.streamingNodeId = anotherNodeId; // First operation's state is lost!
this.abortController = new AbortController(); // Can't abort first operation anymore

// CORRECT: Per-instance state - many operations can run in parallel
this.streamingNodes = new Map(); // In constructor

// Each operation gets isolated state:
this.streamingNodes.set(nodeId, {
    abortController: new AbortController(),
    context: { messages, model },
});

// Second operation doesn't affect the first:
this.streamingNodes.set(anotherNodeId, {
    abortController: new AbortController(),
    context: { messages, model },
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

### Edge rendering with fresh positions

**CRITICAL:** When rendering edges after async operations (LLM calls, fetches, etc.), **always fetch fresh node positions from the graph** to avoid stale position bugs.

**The problem:** If you cache node positions and then render edges after an async operation, the positions may be stale if layout changed in the meantime.

**The pattern:** Use `canvas.renderEdge(edge, graph)` (recommended signature) or manually fetch fresh positions.

```javascript
// WRONG: Using cached positions after async operation
const searchNode = createNode(...);
this.graph.addNode(searchNode);

// ... async search operation happens here ...
const results = await fetch(...);

for (const result of results) {
    const resultNode = createNode(...);
    this.graph.addNode(resultNode);
    const edge = createEdge(searchNode.id, resultNode.id, EdgeType.SEARCH_RESULT);
    this.graph.addEdge(edge);

    // BUG: searchNode.position may be stale if layout changed during search
    this.canvas.renderEdge(edge, searchNode.position, resultNode.position);
}

// CORRECT: Use renderEdge with graph (preferred - automatically fetches fresh positions)
const edge = createEdge(searchNode.id, resultNode.id, EdgeType.SEARCH_RESULT);
this.graph.addEdge(edge);
this.canvas.renderEdge(edge, this.graph);

// CORRECT: Manually fetch fresh positions
const edge = createEdge(searchNode.id, resultNode.id, EdgeType.SEARCH_RESULT);
this.graph.addEdge(edge);
const currentSearchNode = this.graph.getNode(searchNode.id);
const currentResultNode = this.graph.getNode(resultNode.id);
this.canvas.renderEdge(edge, currentSearchNode.position, currentResultNode.position);
```

**When to use this pattern:**

- Edges rendered after any async operation (LLM streaming, API calls, fetches)
- Edges rendered in loops that process results from async operations
- Edges connecting nodes created at different times

**Safe cases (no need for fresh positions):**

- Edges rendered immediately after both nodes are created (synchronous)
- Edges where both nodes are created in the same function before any async calls

**Example of safe synchronous pattern:**

```javascript
// Safe: Both nodes created, edge rendered immediately (no async gap)
const humanNode = createNode(NodeType.HUMAN, content, {...});
this.graph.addNode(humanNode);
this.canvas.renderNode(humanNode);

const aiNode = createNode(NodeType.AI, '', {...});
this.graph.addNode(aiNode);
this.canvas.renderNode(aiNode);

const edge = createEdge(humanNode.id, aiNode.id, EdgeType.REPLY);
this.graph.addEdge(edge);
// Safe to use cached positions - no async operation happened
this.canvas.renderEdge(edge, humanNode.position, aiNode.position);

// NOW async operation starts (won't affect already-rendered edge)
await this.chat.sendMessage(...);
```

### Event-driven rendering with defensive edge deferral

**CRITICAL:** The canvas uses event-driven rendering. DO NOT manually call `canvas.renderNode()` or `canvas.renderEdge()` unless you have a specific reason.

**How it works:**

```javascript
// In app.js (lines 154-166), event listeners automatically render:
graph.on('nodeAdded', (node) => {
    canvas.renderNode(node); // Automatic!
});

graph.on('edgeAdded', (edge) => {
    canvas.renderEdge(edge, graph); // Automatic!
});
```

**In your feature code, just use the graph:**

```javascript
// CORRECT: Let events handle rendering
const node = createNode('human', 'Hello', { position: { x: 0, y: 0 } });
graph.addNode(node); // Event fires → canvas.renderNode() called automatically

const edge = createEdge(node1.id, node2.id, 'reply');
graph.addEdge(edge); // Event fires → canvas.renderEdge() called automatically
```

**Defensive edge rendering:**

The canvas has **defensive edge rendering** that handles timing issues automatically:

- If you add an edge when nodes aren't rendered yet, the edge is **deferred** to a queue
- When nodes finish rendering, deferred edges **automatically retry** and render
- This prevents "invisible edge" bugs in rapid node+edge creation scenarios

**Implementation details (canvas.js):**

```javascript
// When renderEdge() is called via event:
renderEdge(edge, graph) {
    // Get nodes from graph
    const sourceNode = graph.getNode(edge.source);
    const targetNode = graph.getNode(edge.target);

    // Check if nodes are in DOM
    const sourceWrapper = this.nodeElements.get(edge.source);
    const targetWrapper = this.nodeElements.get(edge.target);

    if (!sourceWrapper || !targetWrapper) {
        // Defensive: Defer edge until nodes render
        this.deferredEdges.set(edge.id, { edge, graph });
        this._addNodeRenderCallback(edge.source, () => this._retryDeferredEdge(edge.id));
        return null;
    }

    // Both nodes ready → render edge normally
}
```

**When nodes finish rendering:**

```javascript
renderNode(node) {
    // ... create DOM element ...

    this.nodeElements.set(node.id, wrapper);

    // Notify any edges waiting for this node
    this._notifyNodeRendered(node.id);  // Triggers deferred edge retry
}
```

**When to manually call renderNode():**

Rarely! But acceptable cases:

- **Testing**: When events aren't set up (unit tests, mocks)
- **Legacy code**: Using the old pattern (but refactor to events when possible)
- **Explicit control**: You need rendering to happen at a specific time (document why!)

**When to manually call renderEdge():**

Only when using the **legacy signature** with explicit positions:

```javascript
// Legacy signature: renderEdge(edge, sourcePos, targetPos)
// Used when you have positions but nodes might not be in graph yet
canvas.renderEdge(edge, { x: 10, y: 10 }, { x: 100, y: 100 });
```

**Why this matters:**

- **Committee feature**: Creates multiple opinion nodes + edges rapidly
- **Without defensive rendering**: Edges try to render before nodes are in DOM → invisible edges
- **With defensive rendering**: Edges automatically defer and retry → everything appears correctly

**Example: Committee pattern (works automatically):**

```javascript
// Create human node
const humanNode = createNode('human', question, { position });
graph.addNode(humanNode); // Event → renderNode() → node in DOM

// Create opinion nodes + edges rapidly
for (const member of members) {
    const opinionNode = createNode('opinion', 'Waiting...', { position });
    graph.addNode(opinionNode); // Event → renderNode() → node in DOM

    const edge = createEdge(humanNode.id, opinionNode.id, 'opinion');
    graph.addEdge(edge); // Event → renderEdge() → might defer if node not ready yet
}

// Result: All nodes appear immediately, edges render as soon as nodes are ready
```

**No manual rendering needed!** The event system + defensive deferral handles everything.

### Event-Driven vs Imperative Patterns

**Default to event-driven (emitter/subscriber) when:**

- Multiple components need to react to the same state change
- You need to add/remove handlers dynamically
- The action is a side effect of a state mutation
- Future features might want to react to the same event

**Use imperative calls when:**

- One-shot operations with exactly one handler
- User-triggered actions (clicks, drags, keyboard shortcuts)
- No other component should ever react to this action

#### Anti-pattern: Flag-based side effects

```javascript
// WRONG: Hidden global state for side effects
// In feature-plugin.js:
this.graph.addNode = (n) => {
    this._userNodeCreation = n; // Hidden flag!
    const result = originalAddNode(n);
    this._userNodeCreation = null;
    return result;
};

// In canvas.js:
if (this._userNodeCreation) {
    this.panToNodeAnimated(this._userNodeCreation.id);
}
```

#### Correct pattern: Explicit events

```javascript
// In graph.js (state mutation):
addNode(node) {
    const result = this._yMap.set(node.id, node);
    this.emit('nodeCreated', node);  // Explicit event
    return result;
}

// In canvas.js (reaction to state change):
graph.on('nodeCreated', (node) => {
    if (isUserCreated(node)) {
        this.panToNodeAnimated(node.id);
    }
});
```

**Why explicit events are better:**

1. **Traceable** - Events are visible in code; flags are hidden
2. **Extensible** - New handlers can subscribe without modifying emitters
3. **Testable** - Events are easy to mock and verify
4. **Decoupled** - Emitter doesn't need to know about handlers

#### Real example: Auto-zoom

Instead of setting a `_userNodeCreation` flag:

```javascript
// In graph.js:
addNode(node) {
    const result = this._yMap.set(node.id, node);
    const isUserCreated = node.metadata?.createdBy === 'user';
    this.emit('nodeCreated', { node, isUserCreated });
    return result;
}

// In canvas.js:
graph.on('nodeCreated', ({ node, isUserCreated }) => {
    if (isUserCreated) {
        this.panToNodeAnimated(node.id);
    }
});
```

### Feature instance access (plugin architecture)

**CRITICAL:** All feature instances MUST be accessed through the FeatureRegistry using `this.featureRegistry.getFeature(id)` directly.

**The problem:** Direct instantiation creates duplicate instances with separate state:

- Instance #1: Created by FeatureRegistry (handles slash commands)
- Instance #2: Created by lazy getter (handles modal buttons)
- Result: Modal state lives in instance #1, but buttons call methods on instance #2

**The pattern:** Always use `this.featureRegistry.getFeature(id)` directly:

```javascript
// WRONG: Old pattern with typed getters
get committeeFeature() {
    return this._getFeature('committee', 'CommitteeFeature');
}

// CORRECT: Direct access via FeatureRegistry
this.featureRegistry.getFeature('committee').handleCommittee(...);
```

**Why this matters:**

- Ensures single instance per feature (singleton pattern)
- Prevents state desynchronization between slash commands and UI
- Fails fast with clear error if initialization order is wrong
- Forces correct architecture (no backwards compatibility trap)
- App.js stays small - no typed getters needed for each feature
- Features are self-contained - no tight coupling to App class

**When adding new features:**

1. Register feature in `FeatureRegistry.registerBuiltInFeatures()`
2. Never instantiate the feature class directly in app.js
3. Never create private `_featureName` instance variables

### Node protocol action methods

**Pattern for tight coupling between node types:**

Some node types have tight coupling that's by design (e.g., CSV→Code via Analyze button). Handle this via **node protocol methods**:

```javascript
// CSV node protocol handles creating Code nodes to analyze CSV data
class CsvNode extends BaseNode {
    analyze(nodeId, canvas, graph) {
        // Create Code node from CSV data
        // Access graph, canvas via parameters
        // Return when done
    }
}

// In app.js, when canvas emits 'nodeAnalyze' event:
.on('nodeAnalyze', (nodeId) => {
    const node = this.graph.getNode(nodeId);
    if (node) {
        const wrapped = wrapNode(node);
        if (typeof wrapped.analyze === 'function') {
            wrapped.analyze(nodeId, this.canvas, this.graph);
        }
    }
})
```

**Why use node protocol methods:**

- Self-contained - node type owns its coupling logic
- Testable - protocol can be tested in isolation
- No app.js bloat - tight coupling lives in node protocol file

**When to use this pattern:**

- CSV→Code, PDF→Code, etc. (desirable tight coupling)
- Analyze, Edit, and other node-type-specific operations
- Any operation that only makes sense for that node type

**When NOT to use this pattern:**

- Global UI handlers (toolbar buttons, keyboard shortcuts)
- File upload handlers
- Multi-node operations (bulk delete, export, etc.)

**Note:** When adding/removing methods in app.js, update `tests/test_app_init.js`:

- Add removed methods to delegatedMethods list with comments
- Add new methods to requiredMethods or delegatedMethods lists

**Note:** When adding/removing methods in app.js, update `tests/test_app_init.js`:

- Add removed methods to delegatedMethods list with comments
- Add new methods to requiredMethods or delegatedMethods lists

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

| Wrong (doesn't exist)       | Correct alternative                                       |
| --------------------------- | --------------------------------------------------------- |
| `chat.streamChat()`         | Use `chat.sendMessage()` with callbacks                   |
| `canvas.setNodeStreaming()` | Use `canvas.showStopButton()` / `canvas.hideStopButton()` |
| `canvas.getSelectedNodes()` | Use `canvas.getSelectedNodeIds()`                         |
| `storage.getApiKey()`       | Use `chat.getApiKeyForModel(model)`                       |

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
- `selectGitRepoFile(nodeId, filePath)` - Select a file in a git repo node and open drawer

`storage.js`:

- `getApiKeys()` - Get all stored API keys object
- `getApiKeyForProvider(provider)` - Get key for specific provider
- `getExaApiKey()` - Get Exa search API key
- `saveSession(session)` / `getSession(id)` - Session persistence

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

### Node tags

Tags are rendered as a **fundamental property of all nodes**, not inside node-type-specific templates.
This ensures tags work consistently across all node types without duplication.

**Architecture:** In `renderNode()`, after setting `div.innerHTML` for the specific node type,
tags are inserted using `insertAdjacentHTML('afterbegin', tagsHtml)`:

```javascript
// After setting div.innerHTML for matrix or non-matrix nodes:
const tagsHtml = this.renderNodeTags(node);
if (tagsHtml) {
    div.insertAdjacentHTML('afterbegin', tagsHtml);
}
```

**Important CSS considerations:**

- Tags are positioned with `position: absolute; right: 100%` (outside the left edge of the node)
- The `.node` container must NOT have `overflow: hidden` or tags will be clipped
- Inner containers (`.node-content`, `.matrix-table-container`) handle their own overflow for scrolling

**When adding new node types:** You don't need to add tag rendering - it's automatic.
Just ensure the new node type's container doesn't set `overflow: hidden` on the `.node` div.

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

### User dialogs and confirmations

**NEVER use browser `alert()`, `confirm()`, or `prompt()`.** These block the UI and feel jarring.
Always use in-app modals for user interactions that require confirmation or input.

- For simple notifications, use toast messages or inline feedback
- For confirmations, create a modal with Cancel/Confirm buttons
- For complex input, create a modal with form fields (see committee modal as example)

## Testing

**CRITICAL:** Always run unit tests after making code changes to ensure nothing is broken.

```bash
pixi run test      # Python tests
pixi run test-js   # JavaScript tests
```

Run both test suites before committing changes. If tests fail, fix the issues before proceeding.

Run the dev server with `pixi run dev` before testing UI changes.

**Important:** Never kill the dev server process. The developer runs it in reload mode,
so code changes are automatically picked up. Just make your edits and the server will reload.

### Unit tests

Write unit tests for logic that does not require API calls:

- **Python**: Test pure functions, data transformations, parsing logic
- **JavaScript**: Test graph algorithms, node/edge operations, utility functions, DOM manipulation

**JavaScript test files:**

- `tests/test_setup.js` - Shared test environment setup and module loading
- `tests/run_tests.js` - Automatic test discovery runner (similar to pytest)
- `tests/test_app_init.js` - Integration test to verify App class initializes without errors (catches undefined method references)
- `tests/test_utils.js` - Concurrent state management tests
- `tests/test_utils_basic.js` - Basic utility functions (extractUrlFromReferenceNode, formatMatrixAsText, formatUserError, etc.)
- `tests/test_utils_messages.js` - buildMessagesForApi edge cases
- `tests/test_layout.js` - Layout and overlap resolution functions
- `tests/test_graph_types.js` - Node creation functions and default node sizes
- `tests/test_crdt_graph.js` - Graph traversal and visibility functions
- `tests/test_matrix.js` - Matrix rendering and concurrent cell updates
- `tests/test_flashcards.js` - SM-2 algorithm and flashcard logic
- `tests/test_storage.js` - localStorage functions
- `tests/test_canvas_helpers.js` - Zoom class and popover selection logic
- `tests/test_search.js` - BM25 search algorithm tests
- `tests/test_ui.js` - DOM manipulation tests using jsdom simulation
- `tests/test_node_protocols.js` - Node protocol implementations
- `tests/test_node_registry.js` - Custom node type registration
- `tests/test_tags.js` - Tag system (creation, assignment, queries)
- `tests/test_streaming_manager.js` - Concurrent streaming state management

**Plugin system tests:**

- `tests/test_feature_plugin.js` - FeaturePlugin base class and lifecycle
- `tests/test_feature_registry.js` - Plugin registration and conflict resolution
- `tests/test_plugin_harness.js` - PluginTestHarness testing utilities
- `tests/test_plugin_registration.js` - Custom node type registration patterns
- `tests/test_extension_hooks.js` - Extension hooks system
- `tests/test_code_plugin.js` - CodeFeature plugin tests
- `tests/test_committee_plugin.js` - CommitteeFeature plugin tests
- `tests/test_factcheck_plugin.js` - FactcheckFeature plugin tests
- `tests/test_flashcards_plugin.js` - FlashcardFeature plugin tests
- `tests/test_matrix_plugin.js` - MatrixFeature plugin tests
- `tests/test_research_plugin.js` - ResearchFeature plugin tests

Do not write tests that require external API calls (LLM, Exa, etc.) - these are tested manually.

### Never copy implementations into tests

**NEVER copy function implementations from source files into test files.**

This is a critical anti-pattern that causes tests to pass while production code is broken.
When you copy an implementation:

1. The test validates the copied code, not the actual source
2. Changes to the source file don't affect tests (false confidence)
3. Bugs in production go undetected

**The correct approach:**

1. Extract testable logic into pure functions in separate modules (e.g., `layout.js`, `highlight-utils.js`)
2. Import those functions in both the source files that need them AND the test files
3. Tests validate the actual implementation that runs in production

```javascript
// WRONG: Copying implementation into test file
function resolveOverlaps(nodes) {
    /* copied from graph.js */
}
test('resolveOverlaps works', () => {
    resolveOverlaps(testNodes); // Tests the COPY, not the real code!
});

// CORRECT: Import the actual implementation
const { resolveOverlaps } = require('../src/canvas_chat/static/js/layout.js');
test('resolveOverlaps works', () => {
    resolveOverlaps(testNodes); // Tests the REAL code
});
```

If a function is tightly coupled to a class and hard to test, that's a design smell.
Refactor to extract pure functions that can be imported and tested directly.

### Testing DOM-dependent code with JSDOM

**CRITICAL:** Always use JSDOM for testing code that manipulates the DOM (Canvas, UI elements, node rendering, etc.)

The project has JSDOM as a dependency specifically for this purpose. Many tests already use this pattern successfully.

**IMPORTANT:** Before running tests that use JSDOM, ensure jsdom is installed via npm:

```bash
npm install  # or pixi run npm install
```

If JSDOM tests fail with `Cannot find package 'jsdom'`, this indicates the node_modules are not installed. JSDOM is listed in package.json but must be installed before tests can run.

**Pattern to follow:**

```javascript
/**
 * Tests for Canvas defensive edge rendering
 */

import { JSDOM } from 'jsdom';

// Setup global DOM BEFORE importing modules that use DOM APIs
const dom = new JSDOM('<!DOCTYPE html><div id="canvas-container"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.SVGElement = dom.window.SVGElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// NOW import Canvas after globals are set
const { Canvas } = await import('../src/canvas_chat/static/js/canvas.js');

// Test using actual DOM APIs
test('Canvas creates SVG elements', () => {
    const container = document.getElementById('canvas-container');
    const canvas = new Canvas(container);

    // Canvas is real, DOM is real, test behavior is real
    assertTrue(canvas.svg !== null);
});
```

**Why this pattern?**

1. **Tests real code** - Not mocks, not stubs, actual Canvas class with actual DOM
2. **Catches regressions** - DOM API changes, SVG issues, element creation problems
3. **Fast execution** - JSDOM is fast enough for unit tests
4. **No browser needed** - Runs in CI/CD, on any machine

**Existing examples to follow:**

- `tests/test_ui.js` - DOM manipulation tests
- `tests/test_canvas_output_panel_animation.js` - Canvas-specific tests
- `tests/test_canvas_edge_positioning.js` - SVG edge rendering
- `tests/test_find_scrollable_container.js` - DOM traversal

**What to test with JSDOM:**

- ✅ Canvas rendering (nodes, edges, SVG elements)
- ✅ DOM manipulation (createElement, appendChild, setAttribute)
- ✅ Event listeners (click, mousemove, etc.)
- ✅ CSS class manipulation
- ✅ Element queries (querySelector, getElementById)

**What NOT to test with JSDOM:**

- ❌ Visual layout (getBoundingClientRect is mocked, not real)
- ❌ CSS styling (JSDOM doesn't compute styles)
- ❌ Animation timing (requestAnimationFrame is mocked)
- ❌ Actual rendering to screen

**Anti-pattern to avoid:**

```javascript
// WRONG: Mock DOM instead of using JSDOM
global.document = {
    createElement: () => ({ setAttribute: () => {} }), // Fake!
    getElementById: () => null, // Broken!
};

// This "test" passes but doesn't test real behavior
```

**If you're tempted to mock the DOM, use JSDOM instead.**

### When to use jsdom for testing

**CRITICAL:** Don't skip jsdom because tests "seem complex."

In this session, we initially skipped `readSSEStream` tests because mocking Fetch Response seemed hard. This was a mistake - we should have set up jsdom immediately.

**Signs you need jsdom:**

- Code uses `fetch()` or `Response`
- Code uses `TextEncoder`/`TextDecoder`
- Code reads from `ReadableStream` or `response.body`
- Code uses `window.location`, `document`, etc.

**Common mistake to avoid:**

```javascript
// WRONG: Skipping tests because "mocking is hard"
console.log('(readSSEStream tests require jsdom setup - skipped for now)');
// ... later you discover a bug that would have been caught by tests ...
```

**Correct approach:**

```javascript
// RIGHT: Set up jsdom even for complex tests
import { JSDOM } from 'jsdom';
import { TextEncoder, TextDecoder } from 'util';

// Setup jsdom
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.TextEncoder = TextEncoder; // Node.js native
global.TextDecoder = TextDecoder;

// Create mock response with real TextEncoder
function createMockResponse(chunks) {
    const encoder = new TextEncoder();
    const encodedChunks = chunks.map((chunk) => encoder.encode(chunk));
    let chunkIndex = 0;

    return {
        body: {
            async getReader() {
                return {
                    async read() {
                        if (chunkIndex >= encodedChunks.length) {
                            return { done: true };
                        }
                        return { done: false, value: encodedChunks[chunkIndex++] };
                    },
                };
            },
        },
    };
}

// Now test works with real code
test('readSSEStream works', async () => {
    const mockResponse = createMockResponse(['data: hello\n\n']);
    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            /* ... */
        },
        onDone: () => {
            /* ... */
        },
    });
});
```

**Lesson learned:** The initial effort to set up jsdom pays off when tests catch real bugs (like `normalizeText` not handling spaces after apostrophes).

### When NOT to write unit tests

**Not all code needs unit tests.** Some code is better tested through integration tests, E2E tests, or manual QA.

**Don't write unit tests for:**

1. **Complex instance methods** that require full class instantiation with many dependencies
    - Example: `App.buildLLMRequest()` requires App constructor, modelPicker, storage, chat instances
    - Why: Would require either duplicating logic (violates "never copy" rule) or brittle mocking
    - Instead: Test through integration tests or manual QA with real configurations

2. **Methods with runtime state dependencies**
    - Methods that depend on DOM state, user interactions, or async operations in progress
    - Why: Mocking the entire runtime environment is fragile and doesn't test real behavior
    - Instead: Test the pure functions they call, verify behavior manually in the UI

3. **Code already covered by structural guarantees**
    - Example: Helper function that's the ONLY way to build requests (prevents bugs structurally)
    - Why: The refactoring itself ensures correct usage
    - Instead: Code review + manual testing of the happy path

**When in doubt, ask:**

- Would I need to duplicate code to test this? → Don't test it
- Would I need complex mocking of multiple systems? → Don't test it
- Is this already guaranteed by the structure of the code? → Don't test it
- Is this a pure function with no dependencies? → Test it!

**Example from PR #98:**

- ❌ `App.buildLLMRequest()` - Complex instance method, requires mocking
- ✅ `extract_provider()` - Pure function, easily testable
- ✅ Refactoring that makes `base_url` impossible to forget - Structural guarantee

### Testing method bindings after refactoring

When refactoring large files or moving methods between classes, use the method binding test pattern to catch undefined method references.

**The problem:** When methods are moved (e.g., from `App` to `ModalManager`), event listeners or callbacks might still reference the old location, causing runtime errors like `Cannot read properties of undefined (reading 'bind')`.

**The solution:** Create integration tests that verify method bindings **before** they're used. This catches errors at test time, not runtime.

#### Patterns to Test

##### 1. Event Listener Bindings

Pattern: `.on('event', this.method.bind(this))`

When it breaks: Method moved to another class but event listener not updated.

```javascript
test('Event listeners can be set up', () => {
    const instance = new MyClass();

    // Actually execute the binding - this will throw if method doesn't exist
    instance.emitter
        .on('event1', instance.handleEvent1.bind(instance))
        .on('event2', instance.handleEvent2.bind(instance));
});
```

##### 2. Delegated Methods

Pattern: `this.manager.handleX()` when method moved to manager.

When it breaks: Method moved but reference not updated.

```javascript
test('Delegated methods exist', () => {
    const instance = new MyClass();

    const delegated = {
        handleX: 'manager.handleX',
        handleY: 'manager.handleY',
    };

    for (const [methodName, target] of Object.entries(delegated)) {
        const [targetName, targetMethod] = target.split('.');
        if (typeof instance[targetName][targetMethod] !== 'function') {
            throw new Error(`${methodName} -> ${target} is not a function`);
        }
    }
});
```

##### 3. Callback Assignments

Pattern: `this.canvas.onNodeXxx = this.handleXxx.bind(this)`

When it breaks: Method moved but callback assignment not updated.

```javascript
test('Callbacks can be assigned', () => {
    const canvas = new Canvas();
    const app = new App();

    // This will throw if method doesn't exist
    canvas.onNodeSelect = app.handleNodeSelect.bind(app);
    canvas.onNodeDelete = app.handleNodeDelete.bind(app);
});
```

#### Complete Example

See `tests/test_app_init.js` for a complete example that tests:

- Direct methods on App class
- Delegated methods (moved to ModalManager, FileUploadHandler)
- Event listener setup (actually executes .bind() calls)

```javascript
test('App event listener methods exist', () => {
    const app = new App();

    // Test direct methods
    const requiredMethods = ['handleNodeSelect', 'handleNodeDelete', ...];
    for (const methodName of requiredMethods) {
        if (typeof app[methodName] !== 'function') {
            throw new Error(`Method ${methodName} is not a function`);
        }
    }

    // Test delegated methods (moved to other classes)
    const delegatedMethods = {
        handleNodeTitleEdit: 'modalManager.handleNodeTitleEdit',
        handlePdfDrop: 'fileUploadHandler.handlePdfDrop'
    };
    for (const [methodName, target] of Object.entries(delegatedMethods)) {
        const [targetName, targetMethod] = target.split('.');
        if (typeof app[targetName][targetMethod] !== 'function') {
            throw new Error(`Delegated method ${methodName} -> ${target} is not a function`);
        }
    }

    // Test event listener setup (actually executes .bind() calls)
    app.canvas
        .on('nodeSelect', app.handleNodeSelect.bind(app))  // Would throw if method doesn't exist
        .on('nodeDelete', app.handleNodeDelete.bind(app));
});
```

#### When to Use This Pattern

- **Before major refactoring** - Establish baseline
- **After extracting modules** - Verify nothing broke
- **When moving methods** - Catch missed references
- **When adding new features** - Ensure event listeners work

#### Reusable Helpers

For future ESM conversion, see `tests/test_helpers/method-binding-test.js` for reusable utilities:

- `testMethodBindings(instance, methodNames, options)` - Test that methods exist before they're bound
- `testCallbackAssignments(instance, callbackAssignments, options)` - Test callback pattern assignments
- `testEventListenerSetup(setupFunction, options)` - Test event listener setup by executing binding code
- `createMockEventEmitter()` - Create a mock EventEmitter for testing

For now, inline the pattern as shown in `test_app_init.js`.

### Testing DOM-dependent functions

For functions that require DOM APIs (document, TreeWalker, etc.), follow this pattern:

1. **Extract to a utility module** (e.g., `highlight-utils.js`) that takes `document` as a parameter
2. **Use ES module exports** for modern module support:

    ```javascript
    // At end of file - ES module export
    export { myFunction };

    // Also expose to global scope for backwards compatibility
    if (typeof window !== 'undefined') {
        window.myFunction = myFunction;
    }
    ```

3. **Add script tag** in `index.html` with `type="module"` if it's an ES module, or regular script tag if it uses global scope
4. **In tests**, use ES module imports:

    ```javascript
    import { myFunction } from '../src/canvas_chat/static/js/my-utils.js';
    import { JSDOM } from 'jsdom';

    test('myFunction works', () => {
        const dom = new JSDOM('<!DOCTYPE html><div></div>');
        const result = myFunction(dom.window.document, '<p>test</p>', 'test');
        // assertions...
    });
    ```

    Or if the module exposes to global scope, import it for side effects then access via global:

    ```javascript
    await import('../src/canvas_chat/static/js/my-utils.js');
    const { myFunction } = global.window;
    ```

**Existing utility modules:**

- `layout.js` - Pure layout/positioning functions (no DOM needed, global scope)
- `highlight-utils.js` - Text highlighting functions (DOM needed, takes document param, global scope)
- `node-registry.js` - Plugin system registry (ES module with global scope fallback)
- `node-protocols.js` - Node protocol classes (ES module with global scope fallback)

Run tests with:

```bash
pixi run test      # Python tests
pixi run test-js   # JavaScript tests (runs all JS test files)
```

**Note:** Before running JavaScript tests, ensure npm dependencies are installed:

```bash
pixi run npm install  # Installs jsdom for DOM simulation tests
```

### Test command source of truth

**pixi (`pyproject.toml`) is the single source of truth for test commands.**

- Test commands are defined in `[tool.pixi.tasks]` in `pyproject.toml`
- `package.json` scripts delegate to pixi (e.g., `"test": "pixi run test-js"`)
- When modifying test commands, update `pyproject.toml`, not `package.json`
- This ensures consistency across all environments (local, CI/CD, pixi users, npm users)

### Syntax checking

Always check JavaScript for syntax errors before considering a change complete:

```bash
node --check static/js/app.js
```

Common issues to watch for:

- Variable name collisions (e.g., reusing `context` in different scopes)
- Missing imports or incorrect function names

### Debugging meta-loop: Always verify fixes work

**CRITICAL:** When fixing bugs, especially after editing JavaScript files, always:

1. **Test the fix immediately** - Don't assume it works
2. **Check browser console** - Look for errors or warnings
3. **Verify data structures match** - When passing data between frontend/backend or between functions, ensure:
    - Key names match exactly (case-sensitive)
    - Data formats match (e.g., `filePath` vs `file_path`)
    - Object structures are preserved (e.g., nested objects, arrays)
4. **Add defensive checks** - If data might not match exactly, add fallback logic:
    - Case-insensitive matching
    - Partial path matching
    - Logging available keys when lookup fails
5. **Add debug logging** - When debugging data flow issues, add console.log statements at key points:
    - When data is received from backend
    - When data is stored in node
    - When data is retrieved from node
    - When data is used in operations
6. **Document learnings in AGENTS.md** - After solving a bug, add notes about:
    - What the issue was
    - Why it happened (data format mismatch, timing issue, CRDT storage, etc.)
    - How to prevent it in the future
    - Similar patterns to watch for

**Example pattern:** File path mismatches between backend (normalized paths) and frontend (display paths) - always normalize or match flexibly.

**Meta-reminder:** After solving any bug, update this section with what you learned, and remember to follow this meta-loop for future bugs!

### Common debugging patterns

**File path mismatches:**

- Backend may normalize paths (remove leading slashes, normalize separators)
- Frontend may use display paths (from file tree structure)
- **Solution:** Always try exact match first, then case-insensitive, then filename-only match
- **Example:** `selectGitRepoFile()` in `canvas.js` handles path mismatches between tree display paths and backend file keys

**Data structure mismatches:**

- Backend returns data in one format (e.g., `metadata.files`)
- Frontend expects it in another (e.g., `gitRepoData.files`)
- **Solution:** Check where data is transformed and ensure keys match exactly
- **Example:** Git repo files stored in `metadata.files` but accessed via `gitRepoData.files` - ensure transformation preserves all keys

**CRDT nested object storage:**

- Nested objects must be stored as `Y.Map` in CRDT to preserve nested properties
- If stored as primitives, nested properties are lost on save/load
- **Solution:** CRDT now handles ALL nested objects generically (not just specific ones like `metadata`)
- **Pattern:** Any plain object (`value.constructor === Object`) is recursively converted to `Y.Map`
- **Why generic:** Follows pluginification principle - plugins can add nested objects without core changes
- **Special cases:** `position`, `cells`, `metadata` have explicit handling for backward compatibility, but generic handler covers all other nested objects
- **When to apply:** No action needed - generic handler automatically preserves any nested object structure

## Modal Deployment

### Production URL

The app is deployed at: **[ericmjl--canvas-chat-fastapi-app.modal.run](https://ericmjl--canvas-chat-fastapi-app.modal.run/)**

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

### Deprecated: registerFeatureCanvasHandlers()

**The `registerFeatureCanvasHandlers()` method in `app.js` has been removed.**

**Old pattern (deprecated):**

- Call `app.registerFeatureCanvasHandlers()` to register canvas event handlers
- Required modifying both `app.js` and the plugin file

**Current pattern (required):**

- Use `getCanvasEventHandlers()` in your FeaturePlugin class
- FeatureRegistry handles registration automatically
- No `app.js` modifications needed

```javascript
// DEPRECATED - Do NOT do this
app.registerFeatureCanvasHandlers();

// CORRECT - Use getCanvasEventHandlers() in your plugin
class MyFeature extends FeaturePlugin {
    getCanvasEventHandlers() {
        return {
            myEvent: this.handleMyEvent.bind(this),
        };
    }
}
```

See [Canvas Event Handlers Registration](docs/reference/canvas-event-handlers.md) for details.
