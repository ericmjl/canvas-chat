# YouTubeNode: YouTube Video Transcript Node

**Created**: 2026-03-16
**Status**: Implementation
**Related HLD**: [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The YouTubeNode provides a visual interface for embedding YouTube videos with their transcripts directly on the canvas. It addresses a core need for multimodal content integration, enabling users to discuss video content with LLMs.

### Why This Node Type Exists

YouTube video support was added to support several user workflows:

- **Video research**: Importing talks, tutorials, and presentations for discussion with LLMs
- **Content analysis**: Analyzing video transcripts for key points, quotes, and themes
- **Multimodal learning**: Combining video viewing with AI-assisted note-taking and questioning
- **Citation workflows**: Using video content as references in conversations

The design philosophy emphasizes **seamless integration** between video playback and transcript access. Users should be able to watch the video while simultaneously interacting with its transcript for search, highlighting, and branching conversations.

### Design Decisions

1. **Unified with FetchResultNode**: YouTube nodes share the same underlying node type (`fetch_result`) as URL-fetched content. This ensures consistent behavior and reduces code duplication.

2. **Transcript-first approach**: The transcript is stored as node content (for LLM context and searchability), while the video embed is rendered in the main content area. This separates the "what" (transcript) from the "how" (video playback).

3. **Output panel for transcript**: The transcript appears in a collapsible output panel below the video embed. This keeps the main content area clean while providing easy access to searchable, selectable text.

4. **Backend transcript fetching**: Transcript extraction happens server-side using `youtube-transcript-api`. This handles authentication, rate limiting, and transcript availability checks that would be difficult or unreliable client-side.

5. **Video ID stored in metadata**: The YouTube video ID is stored in the node's metadata, not embedded in the content. This allows the video embed to be rendered independently of the transcript text.

## Technical Details

### Architecture Overview

The YouTube video system spans three main modules:

| Module               | Location                     | Responsibility                         |
| -------------------- | ---------------------------- | -------------------------------------- |
| `youtube.js`         | `plugins/youtube.js`         | Feature plugin, slash command handling |
| `youtube-node.js`    | `plugins/youtube-node.js`    | Node protocol, video embed rendering   |
| `youtube_handler.py` | `plugins/youtube_handler.py` | Backend transcript fetching            |

### The `/youtube` Slash Command

The `/youtube` slash command is handled by the `YouTubeFeature` class in `youtube.js`:

```javascript
getSlashCommands() {
    return [
        {
            command: '/youtube',
            description: 'Fetch YouTube video with transcript',
            placeholder: 'https://youtube.com/watch?v=...',
        },
    ];
}
```

When the user enters `/youtube <url>`, the following flow occurs:

1. **Command parsing**: The URL is extracted from the command arguments
2. **Validation**: The URL is validated as a proper URL format
3. **Placeholder node**: A placeholder node is created with "Fetching YouTube video..." content
4. **Parent edges**: Edges are created from any selected parent nodes
5. **Backend fetch**: The URL is sent to `/api/fetch-url` for processing
6. **Node update**: The node is updated with the transcript content and video metadata

### YouTube Transcript Fetching

The backend `YouTubeHandler` class (`youtube_handler.py`) handles transcript extraction:

```python
class YouTubeHandler(UrlFetchHandlerPlugin):
    async def fetch_url(self, url: str) -> dict[str, Any]:
        video_id = self._extract_video_id(url)
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        transcript = transcript_list.find_transcript(["en"])
        fetched_transcript = transcript.fetch()
```

**Supported URL patterns:**

```python
url_patterns=[
    r"^https?://(www\.)?youtube\.com/watch\?v=[\w-]+",
    r"^https?://(www\.)?youtube\.com/embed/[\w-]+",
    r"^https?://youtu\.be/[\w-]+",
    r"^https?://(www\.)?youtube\.com/watch\?.*v=[\w-]+",
]
```

**Transcript extraction strategy:**

1. **Primary**: Try to fetch English transcript (`find_transcript(["en"])`)
2. **Fallback**: If English unavailable, try any available language
3. **Manual preference**: Prefer manually-created transcripts over auto-generated ones
4. **Error handling**: Raise descriptive errors if transcripts are disabled or unavailable

The handler returns:

```python
{
    "title": "YouTube Video: {video_id}",
    "content": "# YouTube Video Transcript\n\n**Video ID:** `{video_id}`\n\n**URL:** {url}\n\n**Language:** {lang}\n\n---\n\n**[{timestamp}]** {transcript_text}\n...",
    "metadata": {
        "content_type": "youtube",
        "video_id": video_id,
        "language": language_code,
        "is_generated": is_generated,
    },
}
```

### Video Player Embed

The `YouTubeNode` protocol class (`youtube-node.js`) renders the video embed:

```javascript
renderContent() {
    const videoId = this.node.metadata?.video_id || this.node.youtubeVideoId;
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
```

**Embed URL format:** `https://www.youtube.com/embed/{video_id}`

**Iframe permissions:**

- `accelerometer`: Device orientation (rarely needed)
- `autoplay`: Allow auto-play (user may need to unmute)
- `clipboard-write`: Clipboard access
- `encrypted-media`: DRM content
- `gyroscope`: Device orientation
- `picture-in-picture`: PiP mode
- `allowfullscreen`: Fullscreen mode

### Transcript Panel Rendering

The transcript is rendered in the output panel:

```javascript
hasOutput() {
    return true; // Always show transcript in drawer
}

renderOutputPanel() {
    return `
        <div class="youtube-transcript-content">
            ${this.renderMarkdown(this.node.content)}
        </div>
    `;
}
```

The transcript is stored in `node.content` and formatted as markdown with timestamps:

```text
**[{timestamp}]** {text}
**[{timestamp}]** {text}
...
```

### CSS Styling

YouTube-specific styles in `nodes.css`:

```css
.youtube-embed-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
}

.youtube-embed-main {
    min-height: 400px;
    max-height: 100%;
}

.youtube-embed-iframe {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: 16 / 9;
}
```

### Data Flow Diagram

```text
User enters: /youtube https://youtube.com/watch?v=xxx
        |
        v
YouTubeFeature.handleCommand()
        |
        |-- Creates placeholder node
        |-- POST /api/fetch-url {url}
        |
        v
app.py /api/fetch-url
        |
        |-- Finds YouTubeHandler via UrlFetchRegistry
        |
        v
YouTubeHandler.fetch_url()
        |
        |-- Extracts video_id from URL
        |-- Calls YouTubeTranscriptApi
        |-- Formats transcript as markdown
        |
        v
Returns: {title, content, metadata}
        |
        v
YouTubeFeature updates node:
        - content = transcript
        - metadata = {content_type, video_id, language, is_generated}
        - outputExpanded = true (open drawer)
        |
        v
YouTubeNode renders:
        - renderContent() = YouTube iframe
        - renderOutputPanel() = transcript markdown
```

### Node Properties

| Property                | Source             | Purpose                           |
| ----------------------- | ------------------ | --------------------------------- |
| `type`                  | `NodeType.YOUTUBE` | Node type identifier              |
| `content`               | Backend response   | Transcript text (markdown)        |
| `metadata.video_id`     | Backend response   | YouTube video ID for embed        |
| `metadata.content_type` | Backend response   | Always "youtube"                  |
| `metadata.language`     | Backend response   | Transcript language code          |
| `metadata.is_generated` | Backend response   | Whether auto-generated            |
| `outputExpanded`        | Feature plugin     | Show transcript drawer by default |

## Open Questions and Future Decisions

### Resolved

1. ✅ youtube-transcript-api for fetching
2. ✅ Prefer English, fallback to any available

### Deferred

1. Video title fetching - use oEmbed endpoint (no API key)
2. Transcript language selection - user-specified preference
3. Video chapter navigation - parse timestamps from transcript
4. Playback synchronization - click timestamp to seek
5. Caption download capability
6. Handle videos without transcripts

**Trade-off**: Requires parsing chapter markers from video description or transcript. Additional complexity for marginal benefit.

### Playback Synchronization

Currently, the video and transcript are independent. Clicking a transcript timestamp could seek the video to that position.

**Trade-off**: Requires iframe API integration (YouTube IFrame API). Significant complexity for a niche use case.

### Caption Download

Users might want to download the transcript as a file (SRT, VTT, or plain text) for offline use.

**Trade-off**: Requires export functionality. Lower priority than core viewing.

### Handling Videos Without Transcripts

Some videos have captions disabled or no captions available. The current error message is descriptive but doesn't offer alternatives.

**Future**: Could suggest using YouTube's auto-translate feature or provide a manual transcription workflow.

## References to HLD

This design implements several principles from the [High-Level Design](../high-level-design.md):

### Node Types (Section 6)

YouTube nodes fall under the "Documents" category in the HLD's node type taxonomy:

| Category  | Node Types                            |
| --------- | ------------------------------------- |
| Documents | PDFs, PowerPoint, YouTube transcripts |

### Plugin-Extensible (Section 4.3)

The YouTube node follows the three-level plugin architecture:

1. **Level 1**: Custom node type (`YouTubeNode` protocol class)
2. **Level 2**: Feature plugin (`YouTubeFeature` with `/youtube` slash command)
3. **Level 3**: URL fetch handler backend (`YouTubeHandler`)

### Local-First (Section 4.1)

Video and transcript data are stored in the browser's IndexedDB (for the graph). No server-side storage of video content.

### Streaming-First (Section 4.5)

While not streaming in the LLM sense, the progressive loading (placeholder -> loading -> video + transcript) follows the same philosophy of showing feedback immediately.

### Vanilla JavaScript (Section 8.1)

The YouTube node implementation uses plain JavaScript with no framework dependencies. Backend handling uses the existing `youtube-transcript-api` library.

### URL Fetching Design (from docs)

The YouTube handler follows the URL fetching design documented in [url-fetching.md](../explanation/url-fetching.md):

- Uses URL pattern matching to route YouTube URLs to a specialized handler
- Falls back to generic fetching if the handler fails
- Returns structured metadata for the frontend to render appropriately
