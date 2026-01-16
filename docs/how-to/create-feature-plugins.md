# How to Create Plugins for Canvas-Chat

This comprehensive guide shows you how to extend Canvas-Chat with custom plugins. Canvas-Chat supports three levels of plugins, and you can create plugins using JavaScript, Python, or both.

## Table of Contents

- [Plugin Architecture Overview](#plugin-architecture-overview)
- [Configuration in config.yaml](#configuration-in-configyaml)
- [Level 1: Custom Node Types](#level-1-custom-node-types)
- [Level 2: Feature Plugins](#level-2-feature-plugins)
- [Level 3: Backend URL Fetch Handlers](#level-3-backend-url-fetch-handlers)
- [Complete Examples](#complete-examples)
- [AI Prompts for Plugin Creation](#ai-prompts-for-plugin-creation)

## Plugin Architecture Overview

Canvas-Chat uses a **three-level plugin architecture**:

| Level | Type | Files | Purpose | Example |
|-------|------|-------|---------|---------|
| **Level 1** | Custom Node Types | `.js` | Custom rendering, simple interactions | Poll nodes, flashcard nodes |
| **Level 2** | Feature Plugins | `.js` | Slash commands, multi-step workflows | `/git`, `/youtube`, `/committee` |
| **Level 3** | Backend Handlers | `.py` | Backend URL fetching, API integration | Git repo handler, YouTube handler |

**Key concepts:**

- **JavaScript plugins** (`.js`): Frontend plugins that run in the browser
- **Python plugins** (`.py`): Backend plugins that run on the server
- **Paired plugins**: JavaScript + Python working together (e.g., `/git` command + git repo handler)
- **CSS**: Injected dynamically via `injectCSS()` or included in static files

## Configuration in config.yaml

Plugins are configured in `config.yaml` using one of three formats:

### Format 1: JavaScript-only (simple)

```yaml
plugins:
  - path: ./plugins/my-plugin.js
  # OR
  - js: ./plugins/my-plugin.js
```

### Format 2: Python-only

```yaml
plugins:
  - py: ./plugins/my_handler.py
```

### Format 3: Paired (JavaScript + Python)

```yaml
plugins:
  - id: my-plugin
    js: ./plugins/my-plugin.js
    py: ./plugins/my_handler.py
```

**Path resolution:**

- Relative paths are resolved from the `config.yaml` file location
- Absolute paths are supported: `/absolute/path/to/plugin.js`
- File extensions determine plugin type: `.js` = JavaScript, `.py` = Python

**How files are loaded:**

1. **JavaScript plugins**: Served via `/api/plugins/{filename}` and injected into HTML as `<script type="module">` tags
2. **Python plugins**: Loaded dynamically at startup via `importlib` (module-level code executes)
3. **CSS files**: Injected via `FeaturePlugin.injectCSS()` or `injectCSSFromURL()`, or included in main CSS

## Level 1: Custom Node Types

Custom node types provide custom rendering and simple interactions. See [Create Custom Node Types](./create-custom-node-plugins.md) for complete documentation.

**Quick example:**

```javascript
import { BaseNode, Actions } from '/static/js/node-protocols.js';
import { NodeRegistry } from '/static/js/node-registry.js';

class MyNode extends BaseNode {
    getTypeLabel() { return 'My Node'; }
    getTypeIcon() { return '🎯'; }
    renderContent(canvas) {
        return `<div>${canvas.escapeHtml(this.node.content)}</div>`;
    }
}

NodeRegistry.register({
    type: 'my-node',
    protocol: MyNode,
    defaultSize: { width: 400, height: 300 },
    css: `.node.my-node { background: #f0f0f0; }`
});
```

## Level 2: Feature Plugins

Feature plugins enable slash commands, multi-step workflows, and access to Canvas-Chat APIs.

### Basic Structure

```javascript
import { FeaturePlugin } from '/static/js/feature-plugin.js';
import { createNode, NodeType } from '/static/js/graph-types.js';

export class MyFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
        // Access APIs via context:
        // this.graph, this.canvas, this.chat, this.storage, etc.
    }

    async onLoad() {
        console.log('[MyFeature] Loaded');
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
        // Handle slash command
    }
}
```

### Registration

Feature plugins must be registered in `FeatureRegistry`. For built-in features, this happens in `feature-registry.js`:

```javascript
// In feature-registry.js
import { MyFeature } from './plugins/my-feature.js';

await featureRegistry.register({
    id: 'my-feature',
    feature: MyFeature,
    slashCommands: [
        {
            command: '/mycommand',
            handler: 'handleCommand',
        },
    ],
    priority: PRIORITY.BUILTIN,
});
```

For external plugins loaded from config, registration happens automatically when the module loads (side-effect import).

### Available APIs

Via `AppContext` (injected in constructor):

| API | Description | Common Methods |
|-----|-------------|----------------|
| `graph` | Graph data structure | `addNode()`, `getNode()`, `addEdge()`, `autoPosition()` |
| `canvas` | Visual canvas | `renderNode()`, `updateNodeContent()`, `getSelectedNodeIds()` |
| `chat` | LLM communication | `sendMessage()`, `getApiKeyForModel()`, `summarize()` |
| `storage` | LocalStorage wrapper | `getSession()`, `saveSession()`, `getApiKeys()` |
| `modalManager` | Modal dialogs | `showPluginModal()`, `hidePluginModal()` |
| `showToast()` | Toast notifications | `this.showToast(msg, type)` |

### CSS Injection

Feature plugins can inject CSS dynamically:

```javascript
async onLoad() {
    // Option 1: Inject CSS string
    this.injectCSS(`
        .my-feature-content { padding: 16px; }
        .my-feature-button { background: var(--accent-primary); }
    `, 'my-feature-styles');

    // Option 2: Inject CSS from URL
    this.injectCSSFromURL('/static/css/my-feature.css', 'my-feature-styles');
}
```

## Level 3: Backend URL Fetch Handlers

Backend handlers process URLs on the server (e.g., fetching git repos, YouTube videos).

### Handler Structure

```python
from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin
from canvas_chat.url_fetch_registry import UrlFetchRegistry, PRIORITY

class MyUrlHandler(UrlFetchHandlerPlugin):
    async def fetch_url(self, url: str) -> dict:
        """Fetch URL content.

        Returns:
            dict with keys: title, content, metadata (optional)
        """
        # Fetch and process URL
        return {
            "title": "Page Title",
            "content": "Page content...",
            "metadata": {"custom": "data"}
        }

# Register at module level (executes when plugin loads)
UrlFetchRegistry.register(
    id="my-handler",
    url_patterns=[
        r"^https?://example\.com/.*$",
    ],
    handler=MyUrlHandler,
    priority=PRIORITY.BUILTIN,
)
```

### Handler Methods

```python
class MyUrlHandler(UrlFetchHandlerPlugin):
    async def fetch_url(self, url: str) -> dict:
        """Required: Fetch URL content."""
        pass

    async def list_files(self, url: str, git_credentials: dict = None) -> dict:
        """Optional: List files (for git repos, etc.)."""
        pass
```

## Complete Examples

### Example 1: YouTube Plugin (Feature Plugin + Backend Handler)

**Frontend (`youtube.js`):**

```javascript
import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';

export class YouTubeFeature extends FeaturePlugin {
    getSlashCommands() {
        return [{
            command: '/youtube',
            description: 'Fetch YouTube video with transcript',
            placeholder: 'https://youtube.com/watch?v=...',
        }];
    }

    async handleCommand(command, args, context) {
        const url = args.trim();
        if (!url) {
            this.showToast?.('Please provide a YouTube URL', 'warning');
            return;
        }

        // Create placeholder node
        const node = createNode(NodeType.YOUTUBE, 'Fetching...', {
            position: this.graph.autoPosition(this.canvas.getSelectedNodeIds()),
        });
        this.graph.addNode(node);
        this.canvas.renderNode(node);

        // Fetch via backend
        const response = await fetch(apiUrl('/api/fetch-url'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();
        const metadata = data.metadata || {};

        // Update node with video data
        this.graph.updateNode(node.id, {
            content: data.content, // Transcript
            metadata: metadata,
            youtubeVideoId: metadata.video_id,
        });

        this.canvas.renderNode(this.graph.getNode(node.id));
        this.saveSession?.();
    }
}
```

**Backend (`youtube_handler.py`):**

```python
from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin
from canvas_chat.url_fetch_registry import UrlFetchRegistry, PRIORITY
from youtube_transcript_api import YouTubeTranscriptApi

class YouTubeHandler(UrlFetchHandlerPlugin):
    def _extract_video_id(self, url: str) -> str | None:
        # Extract video ID from various YouTube URL formats
        # ... (implementation)
        return video_id

    async def fetch_url(self, url: str) -> dict:
        video_id = self._extract_video_id(url)
        if not video_id:
            raise ValueError("Invalid YouTube URL")

        # Fetch transcript
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        transcript_text = " ".join([t["text"] for t in transcript_list])

        return {
            "title": f"YouTube Video {video_id}",
            "content": transcript_text,
            "metadata": {
                "content_type": "youtube",
                "video_id": video_id,
            },
        }

# Register handler
UrlFetchRegistry.register(
    id="youtube",
    url_patterns=[
        r"^https?://(www\.)?(youtube\.com|youtu\.be)/.*$",
    ],
    handler=YouTubeHandler,
    priority=PRIORITY.BUILTIN,
)
```

**Node Protocol (`youtube-node.js`):**

```javascript
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType } from '../graph-types.js';

class YouTubeNode extends BaseNode {
    getTypeLabel() { return 'YouTube Video'; }
    getTypeIcon() { return '▶️'; }

    getSummaryText(canvas) {
        if (this.node.title) return this.node.title;
        const videoTitle = this.node.metadata?.title;
        return videoTitle || 'YouTube Video';
    }

    renderContent() {
        const videoId = this.node.metadata?.video_id || this.node.youtubeVideoId;
        if (!videoId) return this.renderMarkdown(this.node.content);

        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        return `
            <div class="youtube-embed-container youtube-embed-main">
                <iframe
                    src="${embedUrl}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    class="youtube-embed-iframe"
                ></iframe>
            </div>
        `;
    }

    hasOutput() { return true; }

    renderOutputPanel() {
        return `
            <div class="youtube-transcript-content">
                ${this.renderMarkdown(this.node.content)}
            </div>
        `;
    }
}

NodeRegistry.register({
    type: NodeType.YOUTUBE,
    protocol: YouTubeNode,
});
```

**Config (`config.yaml`):**

```yaml
plugins:
  # YouTube plugin (built-in, but shown for example)
  - id: youtube
    js: ./src/canvas_chat/static/js/plugins/youtube.js
    py: ./src/canvas_chat/plugins/youtube_handler.py
```

### Example 2: Git Repo Plugin (Full Stack)

**Frontend (`git-repo.js`):**

```javascript
import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

// Feature plugin for slash command
export class GitRepoFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
    }

    async onLoad() {
        // Inject CSS dynamically
        await this.injectPluginCSS();
    }

    async injectPluginCSS() {
        const cssUrl = apiUrl('/static/css/git-repo.css');
        const response = await fetch(cssUrl);
        const css = await response.text();
        this.injectCSS(css, 'git-repo-plugin-styles');
    }

    getSlashCommands() {
        return [{
            command: '/git',
            description: 'Fetch git repository with file selection',
            placeholder: 'https://github.com/user/repo',
        }];
    }

    async handleCommand(command, args, context) {
        const url = args.trim();
        // ... validation ...

        // Show file selection modal
        await this.showFileSelectionModal(url);
    }

    async showFileSelectionModal(url) {
        // Create modal, fetch file tree, handle selection
        // ... (see git-repo.js for full implementation)
    }
}

// Node protocol for rendering
class GitRepoProtocol extends BaseNode {
    getTypeLabel() { return 'Git Repository'; }
    getTypeIcon() { return '📦'; }

    renderContent() {
        // Render file tree
        // ... (see git-repo.js for full implementation)
    }

    hasOutput() {
        return !!this.node.selectedFilePath;
    }

    renderOutputPanel() {
        // Render selected file content in drawer
        // ... (see git-repo.js for full implementation)
    }
}

NodeRegistry.register({
    type: NodeType.GIT_REPO,
    protocol: GitRepoProtocol,
});
```

**Backend (`git_repo_handler.py`):**

```python
from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin
from canvas_chat.url_fetch_registry import UrlFetchRegistry, PRIORITY
import subprocess
import tempfile
from pathlib import Path

class GitRepoHandler(UrlFetchHandlerPlugin):
    async def fetch_url(self, url: str, file_paths: list[str] = None,
                       git_credentials: dict = None) -> dict:
        """Fetch git repository files."""
        repo_name = self._extract_repo_name(url)

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir) / repo_name
            self._clone_repository(url, repo_path, git_credentials)

            # Fetch selected files
            files_data = {}
            for file_path in file_paths or []:
                file_content = (repo_path / file_path).read_text()
                files_data[file_path] = {
                    "content": file_content,
                    "lang": Path(file_path).suffix.lstrip("."),
                    "status": "success",
                }

            return {
                "title": repo_name,
                "content": self._format_content(files_data),
                "metadata": {
                    "content_type": "git_repo",
                    "url": url,
                    "files": files_data,
                },
            }

    async def list_files(self, url: str, git_credentials: dict = None) -> dict:
        """List files in repository."""
        # ... implementation ...
        return {"files": file_tree}

# Register handler
UrlFetchRegistry.register(
    id="git-repo",
    url_patterns=[
        r"^https?://(github|gitlab|bitbucket)\.com/.*$",
        r"^git@.*:.*/.*\.git$",
    ],
    handler=GitRepoHandler,
    priority=PRIORITY.BUILTIN,
)

# Register FastAPI endpoints
def register_endpoints(app):
    @app.post("/api/url-fetch/list-files")
    async def list_files(request: ListFilesRequest):
        # ... endpoint implementation ...
        pass

    @app.post("/api/url-fetch/fetch-files")
    async def fetch_files(request: FetchFilesRequest):
        # ... endpoint implementation ...
        pass
```

**CSS (`git-repo.css`):**

```css
.git-repo-file-tree {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
}

.git-repo-file-tree-item {
    padding: 2px 0;
    display: block;
}

.git-repo-file-fetched {
    font-weight: bold;
}
```

**Config (`config.yaml`):**

```yaml
plugins:
  - id: git-repo
    js: ./src/canvas_chat/static/js/plugins/git-repo.js
    py: ./src/canvas_chat/plugins/git_repo_handler.py
```

## AI Prompts for Plugin Creation

Use these prompts with AI assistants to create plugins:

### Prompt 1: Simple Feature Plugin

```text
Create a Canvas-Chat feature plugin that adds a /bookmark slash command.

Requirements:
- Command: /bookmark
- When executed, saves the currently selected nodes to a bookmark list
- Shows a toast notification with count of bookmarked nodes
- Stores bookmarks in localStorage
- Use FeaturePlugin base class
- Register in getSlashCommands() method
- Include error handling and user feedback
```

### Prompt 2: Feature Plugin with Custom Node Type

```text
Create a Canvas-Chat plugin that adds a /todo slash command.

Requirements:
- Command: /todo
- Creates a custom "todo" node type with:
  - Checkbox to mark items as complete
  - Strikethrough styling for completed items
  - Custom node protocol extending BaseNode
- Register both the feature plugin and node protocol
- Include CSS for styling
- Use NodeRegistry.register() for the node type
```

### Prompt 3: Backend URL Fetch Handler

```text
Create a Canvas-Chat backend URL fetch handler for Wikipedia articles.

Requirements:
- Python plugin extending UrlFetchHandlerPlugin
- Handles URLs matching: https://en.wikipedia.org/wiki/*
- Fetches article content using Wikipedia API
- Returns title, content, and metadata
- Registers with UrlFetchRegistry
- Includes error handling for missing articles
```

### Prompt 4: Full-Stack Plugin (Frontend + Backend)

```text
Create a Canvas-Chat plugin for fetching Reddit posts with comments.

Requirements:
- Frontend: Feature plugin with /reddit slash command
- Backend: Python handler for reddit.com URLs
- Custom node type: "reddit" with:
  - Post title and content in main area
  - Comments in expandable drawer
  - Upvote/downvote display
- CSS styling for Reddit-like appearance
- Register all components properly
- Include error handling throughout
```

### Prompt 5: Plugin with Modal Interaction

```text
Create a Canvas-Chat plugin that adds a /configure slash command.

Requirements:
- Shows a modal with configuration form:
  - Text input for API key
  - Dropdown for model selection
  - Checkbox for options
- Saves configuration to localStorage
- Validates input before saving
- Uses ModalManager API
- Shows success/error toasts
```

### Prompt 6: Plugin with LLM Integration

```text
Create a Canvas-Chat plugin that adds a /summarize-multiple slash command.

Requirements:
- Takes multiple selected nodes
- Sends their content to LLM for summarization
- Creates a new SUMMARY node with the result
- Uses chat.sendMessage() for LLM calls
- Shows streaming progress
- Handles errors gracefully
- Uses StreamingManager for concurrent operations
```

## Best Practices

### File Organization

```text
my-plugin/
├── my-plugin.js          # Frontend feature plugin
├── my_handler.py         # Backend handler (optional)
├── my-plugin.css         # CSS styles (optional)
└── README.md            # Documentation
```

### Code Style

- **JavaScript**: Use ES modules, async/await, proper error handling
- **Python**: Follow PEP 8, use type hints, proper logging
- **CSS**: Use CSS variables from Canvas-Chat theme system
- **Naming**: Use kebab-case for file names, PascalCase for classes

### Error Handling

```javascript
async handleCommand(command, args, context) {
    try {
        // Your logic
    } catch (err) {
        console.error('[MyFeature] Error:', err);
        this.showToast?.('Operation failed: ' + err.message, 'error');
    }
}
```

### Testing

- Test in browser console for frontend plugins
- Test with real URLs for backend handlers
- Verify CSS injection works
- Test error cases (invalid input, network failures)

### Documentation

- Document all public methods
- Include usage examples
- Explain configuration requirements
- List dependencies

## Troubleshooting

### Plugin not loading

- Check browser console for import errors
- Verify file paths in config.yaml are correct
- Ensure file extensions are `.js` or `.py`
- Check server logs for Python plugin errors

### Slash command not appearing

- Verify `getSlashCommands()` returns correct format
- Check feature is registered in FeatureRegistry
- Ensure handler method exists and is named correctly
- Check priority doesn't conflict with other commands

### CSS not applying

- Verify `injectCSS()` is called in `onLoad()`
- Check CSS selectors match your HTML structure
- Use browser DevTools to inspect injected styles
- Ensure CSS is scoped (e.g., `.my-plugin .content`)

### Backend handler not matching URLs

- Verify URL patterns in `UrlFetchRegistry.register()`
- Test regex patterns independently
- Check priority (higher priority = checked first)
- Ensure handler class extends `UrlFetchHandlerPlugin`

## Next Steps

- Read [Create Custom Node Types](./create-custom-node-plugins.md) for Level 1 plugins
- Read [Feature Plugin API Reference](../reference/feature-plugin-api.md) for complete API docs
- Study built-in plugins: `youtube.js`, `git-repo.js`, `committee.js`
- Check [Plugin Architecture Explanation](../explanation/plugin-architecture.md) for design rationale
