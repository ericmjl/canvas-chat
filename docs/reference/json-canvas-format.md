# JSON Canvas format reference

Canvas-Chat can export sessions to, and import sessions from, the
[JSON Canvas](https://jsoncanvas.org/spec/1.0/) open format used by Obsidian
and other infinite-canvas tools.

The conversion lives in `src/canvas_chat/static/js/canvas-format.js`. It only
runs at the export/import boundary; the internal data model (`position.x`,
`source`/`target`, Canvas-Chat node types) is unchanged.

## In the app

| Action                | Button | Result                                                     |
| --------------------- | ------ | ---------------------------------------------------------- |
| Export                | 💾     | Full `.canvaschat` backup (unchanged)                      |
| Export as JSON Canvas | 🗺️     | Plain `.canvas` file that opens in Obsidian (lossy)        |
| Import                | 📂     | Accepts `.canvaschat`, `.canvas`, or `.json`; auto-detects |

## Superset format

`toJsonCanvas(session)` writes every standard JSON Canvas field, plus a
`canvasChat` namespace on each node, each edge, and the document. Tools that
only know JSON Canvas ignore the namespace; Canvas-Chat uses it to restore the
session exactly.

```json
{
    "nodes": [
        {
            "id": "abc-123",
            "type": "text",
            "x": 100,
            "y": 200,
            "width": 640,
            "height": 480,
            "text": "Hello world",
            "color": "#a5d8ff",
            "canvasChat": { "type": "ai", "content": "Hello world", "model": "openai/gpt-4o", "tags": ["#a5d8ff"] }
        }
    ],
    "edges": [{ "id": "edge-1", "fromNode": "abc-123", "toNode": "def-456", "canvasChat": { "type": "reply" } }],
    "canvasChat": { "version": 1, "session": { "id": "sess-789", "name": "My Session" } }
}
```

`toJsonCanvas(session, { includeExtensions: false })` drops every `canvasChat`
key and produces a spec-only file. The 🗺️ button uses this mode.

## Export mapping

| Canvas-Chat                                                   | JSON Canvas                                       |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `position.x`, `position.y`, `width`, `height`                 | `x`, `y`, `width`, `height` (rounded to integers) |
| `reference`, `fetch_result`, `youtube`, `git_repo` with a URL | `link` node with `url`                            |
| Every other node                                              | `text` node; `text` is the node's markdown        |
| Flashcard                                                     | `text` with question and answer                   |
| Matrix                                                        | `text` with a markdown table of the cells         |
| First tag color                                               | `color` (hex)                                     |
| Edge `source`, `target`                                       | `fromNode`, `toNode` (default arrow end)          |
| Edge `type`                                                   | Only in `canvasChat` (no visible label)           |

File-based nodes (images, PDFs, spreadsheets) are exported as `text` rather
than `file`, because JSON Canvas `file` nodes must point at a file in the
vault, and Canvas-Chat stores that data inline. Edges whose endpoints are
missing are dropped, since the spec requires both nodes to exist.

## Import mapping

Files that carry the `canvasChat` namespace are restored field for field. If
another tool edited a node's `text`, moved it, or changed a link's `url`, those
edits win.

Plain JSON Canvas files are mapped as follows:

| JSON Canvas | Canvas-Chat                                 |
| ----------- | ------------------------------------------- |
| `text`      | `note` with the same markdown               |
| `link`      | `reference` with `url` set                  |
| `file`      | `note` showing the file path (and subpath)  |
| `group`     | `note` titled with the group label          |
| Edge        | `reply` edge; a `label` is kept on the edge |

The session is named after the imported file. Detection is automatic:
`isJsonCanvas(data)` looks for the `canvasChat` namespace, `fromNode`/`toNode`
edges, or flat `x`/`y` nodes without `position`.
