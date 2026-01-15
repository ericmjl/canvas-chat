# Canvas Chat

A visual, non-linear chat interface where conversations are nodes on an infinite canvas. Explore topics by branching, merging, and navigating your discussions as a directed acyclic graph (DAG).

## Try it online

No installation required! Try Canvas Chat at
**[ericmjl--canvas-chat-fastapi-app.modal.run](https://ericmjl--canvas-chat-fastapi-app.modal.run/)**.

Bring your own API keys (configured in Settings).

## Quick start

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
- **Fact-Checking**: Use `/factcheck <claims>` to verify claims with web search and LLM analysis
- **Image Analysis**: Upload, paste, or drag-and-drop images for multimodal AI analysis
- **Markdown & Math Rendering**: Full markdown support with LaTeX math rendering (KaTeX) for inline `\(...\)` and display `\[...\]` math
- **Multiple LLM Providers**: Support for OpenAI, Anthropic, Google, Groq, GitHub Models, and local models via Ollama
- **Extensible Plugin System**: Create custom node types and features with the three-level plugin architecture
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
uvx canvas-chat --admin-mode
```

This reads model configuration from `config.yaml` and API keys from environment variables. Users don't need to configure anything - models are pre-configured and credentials are injected server-side.

See [Admin Mode Setup](how-to/admin-mode.md) for details.

## Usage

1. **Start chatting**: Type a message and press Enter
2. **Reply to a node**: Click the ↩️ Reply button or click a node then type
3. **Branch from text**: Select text within a node, then click 🌿 Branch to create a highlight node
4. **Multi-select**: Cmd/Ctrl+Click multiple nodes to respond to all at once
5. **Auto-layout**: Click 🔀 to automatically arrange all nodes
6. **Search the web**: Type `/search <query>` to search via Exa
7. **Research a topic**: Type `/research <topic>` to generate a research report
8. **Fact-check claims**: Type `/factcheck <claims>` or select a node with claims to verify them
9. **Consult LLM committee**: Type `/committee <question>` to get opinions from multiple LLMs
10. **Add images**: Upload, paste (Ctrl/Cmd+V), or drag-and-drop images for AI analysis
11. **Create a matrix**: Select one or more context nodes, type `/matrix <context>` to create an evaluation table
12. **Navigate**: Drag the handle (⋮⋮) to move nodes, scroll to zoom, double-click canvas to fit content
13. **Export**: Click 💾 to save your session as a `.canvaschat` file

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

## Tech stack

- **Backend**: FastAPI
- **Frontend**: HTMX + vanilla JavaScript + CSS
- **LLM**: LiteLLM (multi-provider support)
- **Storage**: IndexedDB (browser-local)
- **Plugin System**: Three-level extensibility (custom nodes, features, extensions)

## Extensibility

Canvas-Chat supports three levels of plugins:

- **Level 1: Custom Node Types** - Add new visual node types with custom rendering and interactions
- **Level 2: Feature Plugins** - Create complex workflows, slash commands, and multi-step LLM interactions
- **Level 3: Extension Hooks** - Hook into existing features to modify or extend behaviors

Learn more:

- [How to Create Custom Node Types](how-to/create-custom-node-plugins.md)
- [How to Create Feature Plugins](how-to/create-feature-plugins.md)
- [Extension Hooks Reference](reference/extension-hooks.md)
- [FeaturePlugin API](reference/feature-plugin-api.md)
- [AppContext API](reference/app-context-api.md)
- [FeatureRegistry API](reference/feature-registry-api.md)

## Browser compatibility

Canvas Chat works best on **Chromium-based browsers** (Chrome, Edge, Arc, Brave, etc.). Firefox and Safari have rendering issues with the SVG canvas that prevent full functionality.

## License

MIT
