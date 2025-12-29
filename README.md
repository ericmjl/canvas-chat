# Canvas Chat

A visual, non-linear chat interface where conversations are nodes on an infinite canvas. Explore topics by branching, merging, and navigating your discussions as a directed acyclic graph (DAG).

## Features

- **Infinite Canvas**: Pan, zoom, and navigate your conversations visually
- **Branching Conversations**: Reply to any message to create a new branch
- **Highlight & Branch**: Select text within any node to create a highlight excerpt node
- **Multi-Select & Merge**: Select multiple nodes to combine context
- **Context Visualization**: See which messages are included in your context
- **Auto-Layout**: Automatically arrange nodes in a clean left-to-right hierarchy
- **Web Research**: Use `/research <topic>` to generate research reports via Exa
- **Web Search**: Use `/search <query>` to search the web via Exa
- **Multiple LLM Providers**: Support for OpenAI, Anthropic, Google, Groq, and local models via Ollama
- **Local-First**: All data stored in your browser (IndexedDB)
- **Export/Import**: Save sessions as `.canvaschat` files

## Getting Started

### Prerequisites

- Python 3.11+
- [Pixi](https://pixi.sh) (recommended) or uv

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/canvas-chat.git
cd canvas-chat

# Install with pixi
pixi install

# Or with uv
uv sync
```

### Running

```bash
# With pixi
pixi run dev

# Or directly
uv run app.py
```

Open your browser to the URL shown (usually http://127.0.0.1:8765).

### Configuration

Click the ⚙️ Settings button to add your API keys:

- **OpenAI**: Get from https://platform.openai.com/api-keys
- **Anthropic**: Get from https://console.anthropic.com/
- **Google AI**: Get from https://aistudio.google.com/
- **Groq**: Get from https://console.groq.com/
- **Exa** (for search/research): Get from https://exa.ai/

Keys are stored locally in your browser's localStorage.

## Usage

1. **Start chatting**: Type a message and press Enter
2. **Reply to a node**: Click the ↩️ Reply button or click a node then type
3. **Branch from text**: Select text within a node, then click 🌿 Branch to create a highlight node
4. **Multi-select**: Cmd/Ctrl+Click multiple nodes to respond to all at once
5. **Auto-layout**: Click 🔀 to automatically arrange all nodes
6. **Search the web**: Type `/search <query>` to search via Exa
7. **Research a topic**: Type `/research <topic>` to generate a research report
8. **Navigate**: Drag the handle (⋮⋮) to move nodes, scroll to zoom, double-click canvas to fit content
9. **Export**: Click 💾 to save your session as a `.canvaschat` file

## Tech Stack

- **Backend**: FastAPI
- **Frontend**: HTMX + vanilla JavaScript + CSS
- **LLM**: LiteLLM (multi-provider support)
- **Storage**: IndexedDB (browser-local)

## License

MIT
