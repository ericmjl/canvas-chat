# JSON Canvas format reference

Canvas-Chat's `.canvaschat` file is a superset of the
[JSON Canvas](https://jsoncanvas.org/spec/1.0/) open format used by Obsidian
and other infinite-canvas tools. Canvas-Chat can also export plain `.canvas`
files and import `.canvas` files made elsewhere.

The conversion lives in `src/canvas_chat/static/js/canvas-format.js` and runs
only at the export/import boundary (`storage.js`). The internal data model
(`position.x`, `source`/`target`, Canvas-Chat node types) is unchanged.

## In the app

| Action                | Button | Result                                                                |
| --------------------- | ------ | --------------------------------------------------------------------- |
| Export                | 💾     | `.canvaschat` file, format v2 (JSON Canvas superset, lossless backup) |
| Export as JSON Canvas | 🗺️     | Plain `.canvas` file with only spec fields (lossy)                    |
| Import                | 📂     | Accepts `.canvaschat` (v1 or v2), `.canvas`, or `.json`; auto-detects |

## File format versions

| Version | Layout                                                                                   |
| ------- | ---------------------------------------------------------------------------------------- |
| v1      | Legacy: the internal session object (`position: {x, y}`, edges with `source`/`target`)   |
| v2      | JSON Canvas superset: standard fields plus a `canvasChat` namespace (written since #246) |

v1 files are still accepted on import. They already match the internal layout,
so they load as-is; exporting again writes v2.

## Superset layout (v2)

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
            "color": "#ffc9c9",
            "canvasChat": {
                "type": "ai",
                "content": "Hello world",
                "model": "openai/gpt-4o",
                "created_at": 1710000000000,
                "tags": ["#ffc9c9"]
            }
        }
    ],
    "edges": [
        {
            "id": "edge-1",
            "fromNode": "abc-123",
            "toNode": "def-456",
            "toEnd": "arrow",
            "canvasChat": { "type": "reply" }
        }
    ],
    "canvasChat": {
        "version": 2,
        "sessionId": "sess-789",
        "sessionName": "My Session",
        "created_at": 1710000000000,
        "tags": { "#ffc9c9": { "name": "Important", "color": "#ffc9c9" } },
        "exported_at": "2026-11-10T00:00:00.000Z"
    }
}
```

The node namespace holds every Canvas-Chat field except `id`, `position`,
`width`, and `height`, which are mapped to JSON Canvas fields. When a position
or size is fractional, the exact value is also kept in the namespace.

`toJsonCanvas(session, { includeExtensions: false })` drops every `canvasChat`
key and produces a spec-only file. The 🗺️ button uses this mode.

## Export mapping

| Canvas-Chat                                                 | JSON Canvas                                       |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `position.x`, `position.y`, `width`, `height`               | `x`, `y`, `width`, `height` (rounded to integers) |
| `reference`, `fetch_result`, `youtube`, `git_repo` with URL | `link` node with `url`                            |
| Every other node                                            | `text` node; `text` is the node's markdown        |
| Flashcard                                                   | `text` with question and answer                   |
| Matrix                                                      | `text` with a markdown table of the cells         |
| First tag color                                             | `color` (hex)                                     |
| Edge `source`, `target`                                     | `fromNode`, `toNode`, `toEnd: "arrow"`            |
| Edge `type`                                                 | Only in `canvasChat` (no visible label)           |

The URL of a link node comes from the node's `url` field, `metadata.url`, the
YouTube video ID, or the `[title](url)` heading that `/fetch` writes. Without
a URL the node is exported as `text`.

Edges whose endpoints are missing are dropped, since the spec requires both
nodes to exist.

### Differences from the mapping proposed in #246

| Node types                                | Proposed | Used   | Why                                                                                                          |
| ----------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| image, pdf, powerpoint, csv, excel, prism | `file`   | `text` | A JSON Canvas `file` node must point at a file in the vault; Canvas-Chat stores this data inline.            |
| youtube, git_repo                         | `file`   | `link` | These nodes are backed by a web URL, which is what a `link` node represents.                                 |
| html_slides                               | `link`   | `text` | Slides are stored as inline HTML with no URL to link to.                                                     |
| matrix                                    | `group`  | `text` | A group is an empty labelled frame; the matrix cells are not separate nodes inside it, so they would vanish. |

## Import mapping

Files that carry the `canvasChat` namespace are restored field for field. If
another tool edited a node's `text`, moved or resized it, or changed a link's
`url`, those edits win over the namespace.

Plain JSON Canvas files are mapped as follows:

| JSON Canvas | Canvas-Chat                                 |
| ----------- | ------------------------------------------- |
| `text`      | `note` with the same markdown               |
| `link`      | `reference` with `url` set (http(s) only)   |
| `file`      | `note` showing the file path (and subpath)  |
| `group`     | `note` titled with the group label          |
| Edge        | `reply` edge; a `label` is kept on the edge |

Only `http://` and `https://` URLs become links. A `link` node with any other
URL (for example `javascript:` or `data:`) is imported as a `note` showing the
URL as plain text, and a non-http(s) `url` edited into a superset file is
ignored.

Node ids must be unique. If a node repeats an earlier node's id, it gets a
fresh id and edges that use that id stay on the first node. Nodes without an
id are dropped. Edges with a missing or repeated id get a fresh id.

Obsidian nodes are often too small to show content between a Canvas-Chat
node's header and action bar (Obsidian's default text node is 250×60). On a
plain import, nodes smaller than 360×200 are enlarged to that size, and all
positions are spread by the same factor (at most 4×) so the enlarged nodes do
not overlap. Files with the `canvasChat` namespace keep their exact geometry.

A plain `.canvas` import is named after the file. Detection is automatic:
`isJsonCanvas(data)` looks for the `canvasChat` namespace, `fromNode`/`toNode`
edges, or flat `x`/`y` nodes without `position`.
