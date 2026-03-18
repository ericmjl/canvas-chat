# URL Fetch Feature

**Created**: 2026-03-16
**Status**: Implementation
**Related HLD**: [High-Level Design](../high-level-design.md)
**Related Design Doc**: [URL Fetching Architecture](../explanation/url-fetching.md)

## Context and Design Philosophy

The URL Fetch feature enables users to import web content directly onto the canvas as nodes. This addresses a fundamental need in the canvas-chat workflow: gathering external reference material from the web into conversations with LLMs.

### Why This Feature Exists

The URL Fetch feature supports several core user workflows:

- **Research capture**: Fetching articles, documentation, and blog posts for analysis
- **Reference gathering**: Pulling external content to cite in conversations
- **PDF reading**: Viewing PDF documents directly on the canvas with pagination
- **Multimodal content**: Supporting various content types (HTML, PDF, YouTube, GitHub)

The design philosophy follows the principle of **progressive disclosure**. New users can immediately use `/fetch` without any configuration, while power users can leverage specialized commands like `/youtube` and `/git` for enhanced experiences with those content types.

### Design Decisions

1. **Generic `/fetch` as foundation**: The `/fetch` command provides basic URL fetching for any URL type. This ensures a working solution exists even when specialized handlers are unavailable.

2. **Backend handler registry**: URL fetch handlers are registered via `UrlFetchRegistry`, allowing plugins to add specialized handling for specific URL patterns (YouTube, GitHub, etc.) without modifying core code.

3. **Markdown-only output**: All fetched content is converted to markdown before reaching the frontend. This is a deliberate security measure to prevent malicious page styles from affecting the canvas UI.

4. **Unified FetchResultNode**: All fetched content uses the `fetch_result` node type, with rendering adapted based on content type metadata. This reduces code duplication while enabling type-specific UX.

5. **Client-side PDF hydration**: PDF rendering happens in the browser using PDF.js, with text extraction on the backend. This reduces server load and provides a responsive paginated viewing experience.

## Technical Details

### Architecture Overview

The URL Fetch system spans multiple modules across frontend and backend:

| Module                        | Location                                      | Responsibility                                        |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `url-fetch.js`                | `static/js/plugins/url-fetch.js`              | Feature plugin, slash command handling, PDF hydration |
| `fetch-result-node.js`        | `static/js/plugins/fetch-result-node.js`      | Node protocol, content rendering                      |
| `pdf-viewer.js`               | `static/js/plugins/pdf-viewer.js`             | PDF.js integration, rendering, text extraction        |
| `app.py`                      | `src/canvas_chat/app.py`                      | `/api/fetch-url` endpoint, fallback fetching          |
| `url_fetch_registry.py`       | `src/canvas_chat/url_fetch_registry.py`       | Handler registration and routing                      |
| `url_fetch_handler_plugin.py` | `src/canvas_chat/url_fetch_handler_plugin.py` | Base class for custom handlers                        |

### The `/fetch` Slash Command

The `/fetch` command is handled by the `UrlFetchFeature` class in `url-fetch.js`:

```javascript
getSlashCommands() {
    return [
        {
            command: '/fetch',
            description: 'Fetch content from URL (basic fetch, no special rendering)',
            placeholder: 'https://...',
        },
    ];
}
```

When the user enters `/fetch <url>`, the following flow occurs:

1. **Command parsing**: The URL is extracted from command arguments
2. **Validation**: The URL is validated using `isUrlContent()`
3. **Placeholder node**: A placeholder node is created with "Fetching content from..." content
4. **Parent edges**: Edges are created from any selected parent nodes
5. **Backend fetch**: The URL is sent to `/api/fetch-url` for processing
6. **Node update**: The node is updated with fetched content and metadata

### Backend URL Fetching Flow

The `/api/fetch-url` endpoint (`app.py`) implements a multi-stage fetching strategy:

```text
Request: POST /api/fetch-url { url: "https://..." }
           │
           ▼
    ┌──────────────────┐
    │ UrlFetchRegistry │◄── Check for specialized handlers
    │   .find_handler  │    (YouTube, GitHub, etc.)
    └────────┬─────────┘
             │
      ┌──────┴──────┐
      │ Handler     │ Yes
      │ found?      ├─────────────┐
      └──────┬──────┘             │
             │ No                  ▼
             ▼              ┌──────────────┐
    ┌─────────────────┐     │  Handler     │
    │ GET url        │     │  .fetch_url()│
    │ (single request)     └──────────────┘
    └────────┬────────┘
             │
      ┌──────┴──────┐
      │ Content-Type│
      │ detection   │
      └──────┬──────┘
             │
    ┌────────┼────────┬─────────────┐
    │        │        │             │
    ▼        ▼        ▼             ▼
  PDF     HTML    text/*       Other
```

#### Stage 1: Handler Lookup

The backend first checks `UrlFetchRegistry.find_handler(url)` to see if a specialized handler exists. Handlers are registered with URL patterns and priority levels:

```python
PRIORITY = {
    "BUILTIN": 100,    # YouTube, GitHub handlers
    "OFFICIAL": 50,
    "COMMUNITY": 10,
}
```

If a handler matches, it's used. If it throws an exception, the flow falls back to generic fetching.

#### Stage 2: Content-Type Detection

For non-specialized URLs, a single GET request determines the content type:

```python
response = await client.get(request.url, follow_redirects=True)
content_type = response.headers.get("content-type", "").lower()
```

The content type drives the remaining flow:

- **`application/pdf`**: Return PDF metadata; frontend handles rendering
- **`text/html` or `text/*`**: Convert to markdown using html2text
- **Other**: Fall back to Jina Reader API

#### Stage 3: Markdown Conversion

Two strategies exist for HTML-to-markdown conversion:

**Strategy A: Direct fetch + html2text** (primary fallback)

```python
def _parse_html_response(response: httpx.Response) -> tuple[str, str]:
    html = response.text
    title = extract_title_from_html(html)
    h2t = html2text.HTML2Text()
    h2t.ignore_links = False
    h2t.body_width = 0
    content = h2t.handle(html)
    return title, content
```

**Strategy B: Jina Reader API** (preferred when available)

```python
async def fetch_url_via_jina(url: str, client: httpx.AsyncClient) -> tuple[str, str]:
    jina_url = f"https://r.jina.ai/{url}"
    response = await client.get(jina_url, headers={"Accept": "text/markdown"})
    # Jina returns markdown directly with title as first # heading
    title, content = parse_jina_response(response)
    return title, content
```

The Jina path is attempted first for "other" content types, with direct fetch as fallback.

### Response Format

All URL fetch responses follow a consistent schema:

```python
class FetchUrlResult(BaseModel):
    url: str
    title: str
    content: str  # Markdown content
    metadata: dict = {}  # Optional: content_type, pdf_url, video_id, etc.
```

For PDFs, the content is empty initially (text extracted client-side after rendering):

```python
{
    "url": "https://example.com/doc.pdf",
    "title": "document",
    "content": "",  # Empty; extracted after PDF renders
    "metadata": {
        "content_type": "pdf",
        "pdf_url": "https://example.com/doc.pdf",
        "source": "url"
    }
}
```

### FetchResultNode Rendering

The `FetchResultNode` protocol class handles rendering based on content type:

```javascript
renderContent(canvas) {
    const metadata = this.node.metadata || {};
    const contentType = metadata.content_type;

    // YouTube: embedded video
    if (contentType === 'youtube' && videoId) {
        return `<iframe src="https://www.youtube.com/embed/${videoId}" ...>`;
    }

    // PDF: viewer container (lazy-loaded)
    if (contentType === 'pdf' && pdfUrl) {
        return `<div class="pdf-viewer-container" data-pdf-url="${pdfUrl}">...</div>`;
    }

    // Default: markdown content
    return canvas.renderMarkdown(this.node.content || '');
}
```

### PDF Viewer Hydration

PDF viewing uses a lazy hydration pattern. When canvas renders a node with `.pdf-viewer-container[data-pdf-hydrated="false"]`, it calls the registered hydrator:

```javascript
// In url-fetch.js
this.canvas.setPdfViewerHydrator(this.hydratePdfViewer.bind(this));

// Hydration flow:
// 1. Load PDF via PDF.js (lazy from CDN)
// 2. Render first page to canvas
// 3. Extract text from all pages
// 4. Store text in node content
// 5. Update UI with page info
// 6. Set hydrated flag
```

PDF navigation is handled via canvas event handlers:

- **Action bar buttons**: `pdf-prev-page`, `pdf-next-page`
- **Keyboard shortcuts**: ArrowLeft, ArrowRight
- **Scroll sync**: Page headings in extracted text enable scroll-to-page

### Data Flow Diagram

```text
Frontend                              Backend
    │                                     │
    │  POST /api/fetch-url {url}         │
    ├────────────────────────────────────►│
    │                                     │
    │  1. Find handler (URL pattern)     │
    │  2. GET url → Content-Type         │
    │  3. Convert to markdown            │
    │                                     │
    │  {title, content, metadata}        │
    ◄─────────────────────────────────────┤
    │                                     │
    │  Create FETCH_RESULT node          │
    │  ┌─────────────────────────────┐    │
    │  │ title: "Article Title"      │    │
    │  │ content: "**Title**\n\n..." │    │
    │  │ metadata: {content_type}    │    │
    │  └─────────────────────────────┘    │
    │                                     │
    │  Render via FetchResultNode         │
    │  - PDF → viewer container          │
    │  - YouTube → iframe embed           │
    │  - Other → markdown HTML           │
```

## Markdown Extraction

### Why Markdown, Not HTML

The URL fetch system deliberately converts all content to markdown before sending to the frontend. This is a security measure:

- **Style isolation**: Node content renders in the main document (not an iframe). Raw HTML with `<style>` tags could modify app styles, hide toolbars, or break layout.
- **Consistency**: Markdown renders uniformly regardless of source page structure.
- **LLM context**: Markdown is better structured for LLM analysis than raw HTML.

### Conversion Strategies

| Source      | Strategy               | Notes                                          |
| ----------- | ---------------------- | ---------------------------------------------- |
| Jina Reader | Native markdown        | `Accept: text/markdown` returns clean markdown |
| Direct HTML | html2text              | Python library, configurable options           |
| PDF         | PDF.js text extraction | Per-page extraction with "## Page N" markers   |
| YouTube     | youtube-transcript-api | Server-side, language fallback                 |

### Title Extraction

Titles are extracted from different sources depending on the strategy:

- **Jina**: First markdown heading (`# Title`)
- **Direct fetch**: `<title>` tag via regex
- **PDF**: Derived from URL filename (`/doc.pdf` → "doc")
- **YouTube**: Video metadata from API

## Open Questions & Future Decisions

### Resolved

1. ✅ Multi-stage fetch strategy - try handlers first, then generic
2. ✅ Markdown-only output - security consideration

### Deferred

1. PDF text extraction reliability - scanned PDFs need OCR?
2. Large PDF handling - pagination, compression, limits
3. Jina API reliability - caching, user-configurable method
4. Handler error handling - propagate or fallback silently?

### Future Enhancements

1. Summarize action on FetchResultNode - client-side option
2. Image extraction - fetch and display
3. Link scraping - extract links as reference nodes
4. Caching layer - avoid redundant fetches
5. Custom handler UI - beyond base protocol

- **Caching layer**: Cache fetched content to avoid redundant requests.
- **Custom handler UI**: Allow handlers to provide custom node rendering beyond the base protocol.

## References

### Related Documentation

- [High-Level Design](../high-level-design.md) - Overall application architecture
- [URL Fetching Architecture](../explanation/url-fetching.md) - Design rationale and trade-offs
- [YouTubeNode LLD](youtube-node.md) - Specialized YouTube handling (uses same infrastructure)
- [GitRepoNode LLD](git-repo-node.md) - Specialized GitHub handling (uses same infrastructure)
- [PDF Node LLD](pdf-node.md) - PDF handling details
- [Feature Plugin API](../reference/feature-plugin-api.md) - Plugin base class
- [Plugin Architecture](../explanation/plugin-architecture.md) - Three-level plugin system

### API Endpoints

| Endpoint                     | Method | Purpose                              |
| ---------------------------- | ------ | ------------------------------------ |
| `/api/fetch-url`             | POST   | Fetch URL content (main entry point) |
| `/api/url-fetch/list-files`  | POST   | GitHub: list repository files        |
| `/api/url-fetch/fetch-files` | POST   | GitHub: fetch file contents          |

### Key Files

- Frontend: `src/canvas_chat/static/js/plugins/url-fetch.js`
- Frontend: `src/canvas_chat/static/js/plugins/fetch-result-node.js`
- Frontend: `src/canvas_chat/static/js/plugins/pdf-viewer.js`
- Backend: `src/canvas_chat/app.py` (lines ~2169-2337)
- Backend: `src/canvas_chat/url_fetch_registry.py`
- Backend: `src/canvas_chat/url_fetch_handler_plugin.py`
