# High-Level Design: Canvas-Chat

**Project:** Canvas-Chat
**Issue:** N/A (comprehensive HLD for entire application)
**Status:** Draft
**Created:** 2026-03-16
**Updated:** 2026-03-17 (added build pipeline, Modal deployment, pip distribution); 2026-03-28 (linked LLM backend LLD/EARS; research activity output panel and arrow-of-intent links to NODE-REQ-019 / RSCH-REQ-005)

## Related design documents

- **[LLM backend (llamabot)](./designs/llamabot-backend-proxy/LLD.md)** — Low-level design for migrating text completions to llamabot while keeping API contracts stable.
- **[LLM proxy EARS](./designs/llamabot-backend-proxy/llm-proxy-EARS.md)** — Requirements for parity, SimpleBot/StructuredBot usage, and retained LiteLLM utilities.
- **[Research feature](./llds/research-feature.md)** — `/search` and `/research`, streaming, and the research node activity output panel.

## 1. What Is This Project?

Canvas-Chat is a **chat with LLMs application** that visualizes conversation history as a graph canvas. Instead of a linear chat interface (like ChatGPT or Claude), messages appear as nodes on an infinite 2D canvas, connected by edges that show conversation flow.

**The core metaphor**: Think of it as a whiteboard where every message you send and receive gets written as a sticky note. You can reply to any message, branch conversations, highlight important text, and explore your chat history spatially.

## 2. Core Concept: Chat-First, Visual Second

The primary interaction is **chatting with LLMs**. The visual canvas is how that chat is presented, not the primary abstraction.

- **You chat with LLMs** - Type prompts, get responses, iterate
- **Chat history becomes visual** - Each message is a node on the canvas
- **Edges show reply relationships** - When you reply to a message, an edge connects them
- **Branching is natural** - Select any text in any message and branch a new conversation from it

## 3. Why This Design?

### 3.1 Non-Linear LLM Workflows

Traditional chat interfaces are linear. You send a message, get a response, send another. But LLM interactions often need to:

- **Branch** - Try multiple approaches from one response
- **Reference** - Pull in content from earlier in the conversation
- **Extract** - Highlight and save important snippets
- **Iterate** - Go back and refine earlier responses

A visual canvas naturally supports all of these. You're not locked into a single conversation thread.

### 3.2 Visual Chat History

When conversations get long (hundreds of messages), a linear list becomes hard to navigate. The canvas lets you:

- See the structure of your conversation at a glance
- Zoom out to see high-level flow
- Zoom in to read details
- Drag related conversations closer together

### 3.3 Rich LLM Features

The app isn't just chat - it's a toolkit for working with LLMs:

- **Code execution** - Run Python directly in the conversation
- **Research** - Deep research on topics with web search
- **Committee** - Ask multiple LLMs and see their different perspectives
- **Fact-checking** - Verify claims against web sources
- **Flashcards** - Generate spaced-repetition cards from content
- **Matrix evaluation** - Compare options across multiple criteria
- **Instant AI Response** - Auto-trigger AI response as you type

All of these are plugins that extend the core chat experience.

## 4. Key Design Principles

### 4.1 Local-First

All data stays in the browser. No server-side storage of user conversations.

- **Sessions** stored in browser IndexedDB
- **Settings** stored in localStorage
- **Portable** - Export sessions as files

### 4.2 Bring Your Own Keys

Users provide their own API keys. The server never sees them.

- Keys stored in browser localStorage
- Sent directly to LLM providers (or through a proxy)
- Admin mode available for server-side keys (enterprise)

### 4.3 Plugin-Extensible

The app grows through a three-level plugin system:

1. **Node types** - Custom visual representations (matrix, code, PDF)
2. **Features** - Complex workflows with slash commands (research, committee)
3. **Extensions** - Hook into existing features (logging, validation)

### 4.4 Streaming-First

All LLM responses stream in real-time.

- See responses token-by-token as they're generated
- Stop generation mid-stream
- Continue stopped generations
- **Intermediate activity** — For long-running streams (for example deep research), the UI SHOULD show what the system is doing in a dedicated place without crowding the main report. Research nodes use the same **slide-out output panel** pattern as code nodes and Git file selection: a chronological activity log (status lines and, for the DuckDuckGo fallback, per-source lines) while the node body shows the growing or final synthesized content. Requirements are specified in [NODE-REQ-019](./specs/node-types-specs.md) and [RSCH-REQ-005](./specs/feature-plugins-specs.md); design detail is in the [research LLD](./llds/research-feature.md).

### 4.5 Explicit Viewport Focus

The canvas doesn't auto-pan when you add nodes (except when explicitly replying). This prevents disorienting jumps when bulk operations happen.

### 4.6 Instant AI Response (Copilot Mode)

When API keys are configured, users can enable an "Instant AI Response" mode (similar to GitHub Copilot). In this mode:

- As the user types in the chat input, an AI suggestion appears in real-time
- The suggestion shows as a ghost/pending AI node on the canvas
- User presses Tab to accept the suggestion, or continues typing to ignore it
- This provides a "Fluid conversation" experience where AI assistance feels immediate

This is an opt-in feature, off by default. Users who prefer explicit send can continue using the traditional flow.

## 5. Architecture at a Glance

### 5.1 Frontend: Three Main Parts

### The Chat Input

- Text area at the bottom
- Model selector in toolbar
- Send button

### The Canvas

- Infinite 2D space
- Nodes placed automatically (new messages below current)
- Pan and zoom to navigate
- Semantic zoom shows more/less detail at different scales

### The Graph

- Tracks all nodes and their positions
- Edges connect messages (reply relationships)
- Persists to IndexedDB

### 5.2 Backend: LLM Proxy

The FastAPI backend primarily proxies requests to LLM providers:

- **Chat endpoint** - Streams LLM responses
- **Search/Research** - Web search integration (Exa)
- **File processing** - PDF, PowerPoint, images
- **Multi-LLM committee** - Query multiple models, synthesize responses

No user data is stored. It's a thin orchestration layer.

### 5.3 Data Flow

```text
[Chat Input] → [App] → [LLM via Backend] → [Stream back]
                                              ↓
                              [Create Node] → [Canvas renders]
                                              ↓
                              [Add to Graph] → [IndexedDB persists]
```

## 6. Node Types

Messages are the core node type, but the system supports many others:

| Category      | Purpose                                          |
| ------------- | ------------------------------------------------ |
| **Messages**  | Human messages, AI responses                     |
| **Reference** | Links to URLs, highlighted text from other nodes |
| **Data**      | Matrices for evaluation, tables from CSV/Excel   |
| **Documents** | PDFs, PowerPoint, YouTube transcripts            |
| **Code**      | Executable Python with output panels             |
| **Research**  | Deep research reports with an optional activity log in the output panel |
| **Multi-LLM** | Committee opinions, synthesis                    |

## 7. Edge Types

Edges represent relationships between nodes:

| Type          | Meaning                                 |
| ------------- | --------------------------------------- |
| **Reply**     | Direct response to a message            |
| **Branch**    | Conversation forked from text selection |
| **Reference** | Content linked from another node        |
| **Highlight** | Excerpt extracted from source           |

## 8. Design Decisions

### 8.1 Current Architecture: Vanilla JavaScript + Custom SVG Canvas

The application currently uses vanilla JavaScript with a custom SVG canvas (`canvas.js`, ~4,700 lines).

**What exists today**:

- `index.html` contains all UI: toolbar, chat input, 9+ modal templates, canvas container, search overlay
- `app.js` (~4,700 lines) orchestrates all DOM manipulation via `getElementById`
- Custom SVG canvas renders nodes and edges
- Vanilla JS ES modules for plugins (feature plugins, node protocols)

### 8.2 Planned: Svelte + Svelte Flow Migration (issue #247)

**Planned migration** from vanilla JavaScript + custom SVG canvas to Svelte + Svelte Flow.

- **Why**: Safari is completely broken with SVG foreignObject; Svelte Flow uses HTML/CSS. Svelte Flow provides MiniMap, better touch, and saves ~4,700 lines of custom canvas code.
- **After migration**: `index.html` becomes a minimal `<div id="app">` shell. Svelte owns the entire page.
- **Trade-off**: Adds a build step (Vite); introduces framework dependency; existing vanilla JS plugins need adapter pattern.

### 8.3 CRDT for Data Model

Using Yjs (Conflict-free Replicated Data Type) for the graph.

- **Why**: Enables future multiplayer, handles conflicts gracefully
- **Trade-off**: More complex than simple JSON storage

### 8.4 LiteLLM for LLM Abstraction

Using LiteLLM as the backend proxy.

- **Why**: Single API works with OpenAI, Anthropic, Google, and many others
- **Trade-off**: Another dependency to maintain

### 8.5 Vite Build Pipeline

**Current**: Static JS/CSS served directly by FastAPI's StaticFiles.

**After Svelte migration**: Svelte source is compiled by Vite into static JS/CSS bundles.

- **Why**: Svelte requires compilation; Vite provides fast HMR for development and optimized builds for production.
- **Trade-off**: Adds Node.js as a build dependency; CI must run build before deploy.

## 9. Build, Deploy, and Distribution

### 9.1 Build Pipeline

The frontend has a compile step. Svelte source files are not directly served — they must be built first.

```text
Svelte source (.svelte) → Vite build → Static JS/CSS → FastAPI StaticFiles → Browser
```

**Build output location**: `src/canvas_chat/static/svelte-dist/`

- Built assets live inside the Python package so that FastAPI's `StaticFiles(directory=STATIC_DIR)` serves them at `/static/svelte-dist/`.
- `index.html` references the built bundle(s).

**Build runs in CI**, not on user machines. Users who `pip install canvas-chat` get pre-built assets in the wheel — no Node.js required.

### 9.2 Deployment to Modal

Canvas-Chat deploys to Modal as a serverless ASGI app via `modal_app.py`.

**How it works**:

1. `modal_app.py` defines a Docker-like image with Python + system deps (LibreOffice, fonts)
2. `.add_local_dir("src/canvas_chat")` copies the entire Python package (including built Svelte assets) into the Modal image
3. The FastAPI app serves HTML at `/` and static assets at `/static/`
4. LLM proxy endpoints handle chat, search, committee, etc.

**CI/CD**: GitHub Actions builds Svelte assets (if needed), then runs `modal deploy modal_app.py` on push to `main`. Test deployments run on PRs.

**Key constraint**: The Svelte build must complete before Modal deployment. CI runs `npm run build` (or equivalent) before `modal deploy`, and the built output is part of `src/canvas_chat/static/` which gets copied into the Modal image.

### 9.3 Distribution via pip

Canvas-Chat is distributed as a Python package via pip.

**How it works**:

1. `pyproject.toml` defines the package with hatchling as the build backend
2. `hatchling` packages `src/canvas_chat/` (including `static/svelte-dist/` with built assets)
3. Users install with `pip install canvas-chat`
4. Users run with `canvas-chat launch` (typer CLI entry point)
5. FastAPI serves the built Svelte app at `http://localhost:7865`

**Key constraint**: The pip wheel must include pre-built Svelte assets. Users should NOT need Node.js. The build happens in CI (or locally by maintainers before release), and the output is committed or included in the wheel.

**Current package structure (target)**:

```text
canvas-chat-0.x.x/
└── canvas_chat/
    ├── app.py              # FastAPI backend
    ├── __main__.py         # CLI entry point (canvas-chat launch)
    ├── config.py           # Configuration
    ├── plugins/            # Python backend plugins
    └── static/
        ├── index.html      # HTML shell (references built bundle)
        ├── css/            # Stylesheets
        └── svelte-dist/    # Built Svelte bundle (JS/CSS)
            ├── assets/
            └── index.js
```

### 9.4 Development Workflow

**Local development** uses Vite dev server for fast HMR on the Svelte frontend, alongside FastAPI for the backend:

1. `pixi run dev` starts FastAPI (backend API + serves static files)
2. `npm run dev` (Vite) starts Svelte dev server with HMR at `http://localhost:5173`
3. Vite proxies API requests to FastAPI
4. Changes to `.svelte` files hot-reload instantly

**Production** uses only FastAPI serving pre-built static assets. No Vite dev server.

## 10. What's Out of Scope

- **Real-time multiplayer** - WebRTC signaling exists but is optional
- **Server-side storage** - All data local
- **TypeScript** - Plain JavaScript with JSDoc for documentation (Svelte components use Svelte 5 runes)
- **Node.js as runtime dependency** - Build only; users never need Node.js

## 11. Risks

| Risk                 | Impact | Mitigation                                   |
| -------------------- | ------ | -------------------------------------------- |
| Safari compatibility | High   | Issue #247: migrate to Svelte Flow           |
| Canvas performance   | Medium | Semantic zoom, visibility culling            |
| Plugin conflicts     | Medium | Priority system, event cancellation          |
| Build complexity     | Medium | Vite build in CI only; users get pre-built   |
| Modal image size     | Low    | Built assets are small (tree-shaken by Vite) |

## 12. Summary

Canvas-Chat is a chat app that visualizes your LLM conversations as a graph. The key insight is that LLM workflows are non-linear - you branch, iterate, reference, and extract. A visual canvas naturally supports this, while still being fundamentally about chatting with LLMs.

## 13. Breadcrumb graph context (single-node navigation)

**Added:** 2026-03-22

### Problem

When exactly one node is selected, the app showed a two-row strip (Parents / Children) with truncated text chips, while the node header offered a navigation popover with icon, type label, and summary. Those surfaces duplicated information at different fidelity and did not give a clear sense of **position** in the graph or **preview before navigating**.

### Goals

- Replace the two-row chip strip with a **single-row breadcrumb**: `[ parent context ] > [ current node ] > [ child context ]`, using the same navigable-neighbor logic as header navigation.
- **Match popover fidelity** for neighbor choices: icon + type label + truncated summary for a single neighbor; a count label (`Parents (N)` / `Children (N)`) that opens the existing nav popover when there are multiple neighbors.
- **Preview before navigate**: on hover of a single-neighbor segment or a nav popover item, show a short text tooltip and **highlight the target node on the canvas** so the user can see where they would jump.

### Non-goals

- Full tree or minimap of the graph; grandchildren-only views; keyboard-only chords dedicated to the breadcrumb (global Arrow Up/Down / j/k remain the primary keyboard navigation).
- Replacing the node-header ↑/↓ buttons or their popover behavior beyond shared preview-on-hover for popover items.
