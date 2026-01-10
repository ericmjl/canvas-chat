# Canvas Chat

A visual, non-linear chat interface where conversations are nodes on an infinite canvas. Explore topics by branching, merging, and navigating your discussions as a directed acyclic graph (DAG).

📚 **[Documentation](https://ericmjl.github.io/canvas-chat/)**

## Try It Online

No installation required! Try Canvas Chat at
**[ericmjl--canvas-chat-fastapi-app.modal.run](https://ericmjl--canvas-chat-fastapi-app.modal.run/)**.

Bring your own API keys (configured in Settings).

## Quick Start

Run Canvas Chat instantly with no installation:

```bash
uvx canvas-chat
```

Your browser will open automatically to the local server.

## Features

- **Infinite Canvas**: Pan, zoom, and navigate your conversations visually
- **Branching Conversations**: Reply to any message to create a new branch
- **Highlight & Branch**: Select text within any node to create a highlight excerpt node
- **Multi-Select & Merge**: Select multiple nodes to combine context
- **Context Visualization**: See which messages are included in your context
- **Auto-Layout**: Automatically arrange nodes in a clean left-to-right hierarchy
- **Matrix Evaluation**: Use `/matrix <context>` to create cross-product evaluation tables
- **LLM Committee**: Use `/committee <question>` to consult multiple LLMs and synthesize answers
- **Web Research**: Use `/research <topic>` to generate research reports via Exa
- **Web Search**: Use `/search <query>` to search the web via Exa
- **Image Analysis**: Upload, paste, or drag-and-drop images for multimodal AI analysis
- **Markdown & Math Rendering**: Full markdown support with LaTeX math rendering (KaTeX) for inline `\(...\)` and display `\[...\]` math
- **Multiple LLM Providers**: Support for OpenAI, Anthropic, Google, Groq, GitHub Models, and local models via Ollama
- **Plugin System**: Extend Canvas Chat with custom node types via JavaScript plugins
- **Local-First**: All data stored in your browser (IndexedDB)
- **Export/Import**: Save sessions as `.canvaschat` files

## Configuration

Click the ⚙️ Settings button to add your API keys:

- **OpenAI**: Get from [platform.openai.com](https://platform.openai.com/api-keys)
- **Anthropic**: Get from [console.anthropic.com](https://console.anthropic.com/)
- **Google AI**: Get from [aistudio.google.com](https://aistudio.google.com/)
- **Groq**: Get from [console.groq.com](https://console.groq.com/)
- **GitHub Models**: Get from [github.com/settings/tokens](https://github.com/settings/tokens) (requires beta access)
- **Exa** (for search/research): Get from [exa.ai](https://exa.ai/)

Keys are stored locally in your browser's localStorage.

### Admin mode (enterprise)

For enterprise deployments where administrators control API keys server-side:

```bash
uvx canvas-chat launch --admin-mode --config config.yaml
```

This reads model configuration from `config.yaml` and API keys from environment variables. Users don't need to configure anything - models are pre-configured, credentials are injected server-side, and the settings UI is hidden.

For development or teams that want pre-populated models but allow individual API keys:

```bash
uvx canvas-chat launch --config config.yaml
```

This loads models and plugins from config but users provide their own API keys via the UI.

See [Admin Mode Setup](docs/how-to/admin-mode.md) for details.

### Plugin system (extensibility)

Canvas Chat supports custom node types via a plugin system. Plugins are JavaScript modules that register new node types with custom rendering and behavior.

```yaml
# config.yaml
plugins:
    - path: ./plugins/my-custom-node.js
```

```bash
# Plugins work with or without admin mode
uvx canvas-chat launch --config config.yaml
# OR
uvx canvas-chat launch --admin-mode --config config.yaml
```

Plugins can define:

- Custom node rendering (HTML/CSS)
- Node-specific actions (buttons, interactions)
- Custom data models and validation
- Integration with external APIs

See [Plugin Development Guide](docs/how-to/create-custom-node-plugins.md) for details.

## Usage

1. **Start chatting**: Type a message and press Enter
2. **Reply to a node**: Click the ↩️ Reply button or click a node then type
3. **Branch from text**: Select text within a node, then click 🌿 Branch to create a highlight node
4. **Multi-select**: Cmd/Ctrl+Click multiple nodes to respond to all at once
5. **Auto-layout**: Click 🔀 to automatically arrange all nodes
6. **Search the web**: Type `/search <query>` to search via Exa
7. **Research a topic**: Type `/research <topic>` to generate a research report
8. **Consult LLM committee**: Type `/committee <question>` to get opinions from multiple LLMs
9. **Add images**: Upload, paste (Ctrl/Cmd+V), or drag-and-drop images for AI analysis
10. **Create a matrix**: Select one or more context nodes, type `/matrix <context>` to create an evaluation table
11. **Navigate**: Drag the handle (⋮⋮) to move nodes, scroll to zoom, double-click canvas to fit content
12. **Export**: Click 💾 to save your session as a `.canvaschat` file

## Development

For contributors or local development:

### Prerequisites

- Python 3.11+
- [Pixi](https://pixi.sh) (recommended) or uv

### Setup

```bash
git clone https://github.com/ericmjl/canvas-chat.git
cd canvas-chat
pixi install
```

### Running

```bash
pixi run dev
```

Open your browser to the URL shown (usually `http://127.0.0.1:7865`).

### Testing plugin system

To test the plugin system with the example poll node:

```bash
# 1. Set an API key (for testing LLM features)
export ANTHROPIC_API_KEY=sk-ant-...

# 2. Start dev server with example config (plugins work without admin mode)
pixi run python -m canvas_chat launch --config config.example.yaml --port 7865

# 3. Open browser to http://127.0.0.1:7865

# 4. In browser console, create a poll node:
app.createAndAddNode('poll', '', {
  data: {
    question: 'What is your favorite color?',
    options: ['Red', 'Blue', 'Green', 'Yellow']
  }
})

# 5. The poll node should render with interactive voting buttons
```

This validates that:

- ✅ Config loading works (plugins section parsed correctly)
- ✅ Plugin files are served via `/api/plugins/*` endpoint
- ✅ Plugin script tags are injected into HTML
- ✅ Custom node types register successfully
- ✅ Custom rendering and interactions work

See [Plugin Development Guide](docs/how-to/create-custom-node-plugins.md) for creating your own plugins.

## Tech Stack

- **Backend**: FastAPI
- **Frontend**: HTMX + vanilla JavaScript + CSS
- **LLM**: LiteLLM (multi-provider support)
- **Storage**: IndexedDB (browser-local)

## Browser compatibility

Canvas Chat works best on **Chromium-based browsers** (Chrome, Edge, Arc, Brave, etc.). Firefox and Safari have rendering issues with the SVG canvas that prevent full functionality.

## License

MIT
