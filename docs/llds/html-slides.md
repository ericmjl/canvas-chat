# HTMLSlides: Single-File HTML Presentation Node

**Created**: 2026-03-16
**Status**: Implementation
**Related HLD**: [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The HTMLSlides feature provides a way to create, display, and interact with single-file HTML presentations directly on the canvas. It enables users to generate or paste HTML slide decks and view them inline within nodes, with navigation controls and the ability to open or download for sharing.

### Why This Feature Exists

HTML slide presentations are a common output format for LLM-generated content. Users often want to create quick presentations from research, meeting notes, or topic explanations without leaving the canvas-chat workflow. The design philosophy centers on three key principles:

**Seamless generation and embedding**: Users can either type a topic and have the LLM generate slides, or paste existing HTML. Both paths result in the same embedded presentation node, creating a unified experience regardless of content source.

**Self-contained presentations**: The feature specifically targets single-file HTML presentations where all CSS and JavaScript are inline. This ensures presentations work reliably when embedded via blob URLs and can be easily shared or downloaded without external dependencies.

**Interactive navigation**: Rather than treating slides as static content, the feature provides toolbar controls (Prev/Next) and leverages a postMessage bridge to enable keyboard navigation within the embedded iframe. This preserves the native presentation experience while keeping users in the canvas.

### Design Decisions

1. **Dual-path command handling**: The `/slides` command detects whether the user pasted HTML (starts with `<!` or contains `<div class="deck"`) or provided a topic. This enables both quick content embedding and LLM-assisted generation without requiring separate commands.

2. **Blob URL embedding**: Slides are embedded using blob URLs created from the stored HTML content, rather than srcdoc. This approach avoids escaping issues with long HTML content and provides consistent behavior with "Open in new tab" functionality.

3. **postMessage bridge injection**: A small script is injected into the HTML before loading it in the iframe. This bridge listens for postMessage commands (`next`, `prev`) and dispatches keyboard events that the presentation's own JavaScript responds to. This decouples the canvas from the presentation's internal implementation.

4. **HTML stored in dedicated field**: The presentation HTML is stored in `node.htmlSlidesContent` rather than the generic `node.content` field. This keeps the content separate from searchable/displayed text and allows the node to have a clean title while carrying large HTML payloads.

5. **Generation state tracking**: When generating slides via LLM, the node tracks a `generating: true` state that displays a spinner UI. Once generation completes, the field is cleared and content is populated.

## Technical Details

### Architecture Overview

The HTMLSlides feature spans two main components:

| Component        | Location                             | Responsibility                         |
| ---------------- | ------------------------------------ | -------------------------------------- |
| `html-slides.js` | `src/canvas_chat/static/js/plugins/` | Feature plugin, node protocol, helpers |
| `nodes.css`      | `src/canvas_chat/static/css/`        | Styling for slides node and toolbar    |

The feature implements both a **node protocol** (`HtmlSlidesNode`) for rendering and a **feature plugin** (`HtmlSlidesFeature`) for slash command handling. This follows the Level 2 feature plugin pattern where the plugin provides both the node appearance and the command workflow.

### The `/slides` Slash Command

The slash command is registered via `HtmlSlidesFeature.getSlashCommands()`:

```javascript
getSlashCommands() {
    return [
        {
            command: '/slides',
            description: 'Create HTML slides (topic or paste HTML)',
            placeholder: 'Topic or paste HTML...',
        },
    ];
}
```

When the user enters `/slides <args>`, the `handleCommand` method determines the content path:

**Pasted HTML path** (detected via `isPastedHtml()`):

1. Extract title from `<title>` tag or default to "Slides"
2. Create node with `htmlSlidesContent` set to the raw HTML
3. Add to graph and render immediately

**Topic generation path**:

1. Create placeholder node with `generating: true` and empty `htmlSlidesContent`
2. Send topic to LLM with system prompt instructing raw HTML output
3. On completion, strip any markdown wrapper (`stripMarkdownHtmlWrapper()`) and update node
4. Render updates the node with the embedded presentation

### Helper Functions

The module exports several pure helper functions for testing:

**`isPastedHtml(args)`**: Detects if the argument string contains pasted HTML by checking for `<!DOCTYPE` or `<div class="deck"` patterns. Used to route between the paste and generation paths.

**`stripMarkdownHtmlWrapper(text)`**: Removes common wrappers from LLM output. Handles:

- Code fences: `html ... ``` ` or ``...`
- Preamble text: Extracts from `<!DOCTYPE` or `<html>` to end of string

**`extractTitleFromHtml(html)`**: Parses the `<title>` tag from HTML to use as the node title. Falls back to "Slides" if no title exists.

**`injectPostMessageBridge(html)`**: Injects a script that listens for `postMessage('next')` and `postMessage('prev')` and dispatches corresponding keyboard events. This enables the toolbar buttons to drive navigation in presentations that use keyboard handlers.

### Node Protocol: HtmlSlidesNode

The `HtmlSlidesNode` class extends `BaseNode` and provides:

**`renderContent(canvas)`**: Renders the node body with three states:

- **Generating**: Shows spinner with "Generating slides..." text
- **Empty**: Shows placeholder with instructions
- **Content**: Renders iframe embed with toolbar

The toolbar includes four buttons: Prev, Next, Open in new tab, and Download.

**`getEventBindings()`**: Returns event handlers for:

- `.html-slides-iframe` (init): Creates blob URL from `htmlSlidesContent` and injects the postMessage bridge
- `.html-slides-prev`: Sends `postMessage('prev')` to iframe
- `.html-slides-next`: Sends `postMessage('next')` to iframe
- `.html-slides-open`: Opens blob URL in new tab
- `.html-slides-download`: Triggers download of HTML file

**`getActions()`**: Returns `[Actions.REPLY, Actions.COPY]`. The COPY action copies the raw HTML to clipboard.

**`hasOutput()`**: Returns `false` since the presentation is fully contained in the node body.

### Data Storage

Nodes of type `html_slides` store the following fields:

| Field               | Type    | Purpose                                      |
| ------------------- | ------- | -------------------------------------------- |
| `htmlSlidesContent` | string  | Full HTML presentation content               |
| `title`             | string  | Display title (from `<title>` or user topic) |
| `generating`        | boolean | True during LLM generation                   |

The `htmlSlidesContent` field is stored directly in the Yjs CRDT node map, allowing persistence across sessions.

### CSS Styling

The node styling is defined in `nodes.css` under `.html-slides-node` and related selectors:

- `.html-slides-node`: Flex container with column layout
- `.html-slides-embed`: Contains the iframe with rounded corners
- `.html-slides-iframe`: Full width/height within embed, minimum height 280px
- `.html-slides-toolbar`: Fixed height toolbar at bottom with button row

The toolbar uses secondary background color and matches the general node styling conventions.

## Single-File Presentation Embed

### Embedding Mechanism

The presentation is embedded in an iframe with an empty `src` attribute. On node initialization, the iframe's `init` event handler:

1. Retrieves the stored `htmlSlidesContent` from the node
2. Revokes any existing blob URL for this node to prevent memory leaks
3. Creates a new Blob from the HTML with `injectPostMessageBridge()` applied
4. Generates a blob URL and assigns it to `iframe.src`

This approach avoids the length and escaping limitations of srcdoc while ensuring the presentation behaves the same as when opened in a new tab.

### postMessage Bridge

The injected script runs inside the iframe:

```javascript
window.addEventListener('message', function (e) {
    if (e.data === 'next') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (e.data === 'prev') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
});
```

This allows the Prev/Next toolbar buttons to trigger keyboard-based navigation in presentations that use arrow key handlers (such as decks generated by the html-presentations skill).

### Download and Open

- **Open in new tab**: Creates a fresh blob URL from the raw HTML (without the bridge script) and opens in a new window
- **Download**: Creates a blob URL and triggers a download with a filename derived from the node title

Both operations revoke their blob URLs immediately after use to prevent memory leaks.

## Slide Navigation

### Toolbar Buttons

The toolbar provides four buttons:

| Button          | Action                                |
| --------------- | ------------------------------------- |
| Prev            | Sends `postMessage('prev')` to iframe |
| Next            | Sends `postMessage('next')` to iframe |
| Open in new tab | Opens presentation in new browser tab |
| Download        | Downloads HTML file                   |

### Keyboard Navigation

Within the embedded iframe, users can interact with the presentation's native navigation:

- **Space / Arrow Right**: Next slide (in standard html-presentations format)
- **Shift+Space / Arrow Left**: Previous slide
- **Escape**: Overview grid (when supported)

The keyboard navigation works because the injected postMessage bridge translates parent-originated messages into keyboard events that the presentation's JavaScript handles normally.

### External Navigation

The toolbar buttons communicate from the parent window to the iframe via postMessage. This architecture keeps the canvas implementation agnostic to the specific presentation format while supporting standard keyboard-based navigation.

## Open Questions & Future Decisions

### Resolved

1. ✅ Blob URL embedding - self-contained presentations
2. ✅ postMessage bridge for navigation

### Deferred

1. Presenter mode - notes and timer overlay
2. Slide number display - show current/total
3. PDF export - browser print or backend conversion
4. Multiple slide formats - detect and adapt
5. Real-time collaboration - sync slide position

## References to HLD

This feature relates to the following sections of the [High-Level Design](../high-level-design.md):

- **Section 4.3: Plugin-Extensible**: The feature uses the three-level plugin system. It is a Level 2 feature plugin that provides both a custom node type and slash command handling.
- **Section 6: Node Types**: HTML slides falls under the "Documents" category alongside PDF and PowerPoint nodes.
- **Section 8.1: Vanilla JavaScript**: The implementation uses plain JavaScript with JSDoc annotations, consistent with the project's frontend architecture.
- **Section 8.3: SVG Canvas with foreignObject**: The slides node uses the canvas's node rendering system with an iframe inside the node body.

### Related Documentation

- [How to create HTML slides](../how-to/html-slides.md) - User-facing guide for the feature
- [Feature Plugin API](../reference/feature-plugin-api.md) - API reference for the `FeaturePlugin` base class
- [Node Protocols](../explanation/node-protocols.md) - Design decisions for the node protocol system
