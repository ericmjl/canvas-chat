# MatrixNode Low-Level Design

**Project:** Canvas-Chat
**Created:** 2026-03-16
**Status:** Implementation
**Related HLD:** `/docs/high-level-design.md`

## Context and Design Philosophy

The MatrixNode exists to solve a specific user pain point in LLM-assisted ideation: systematic cross-product evaluation. When users explore multiple options against multiple criteria, doing this manually creates either a flood of individual nodes (losing structure) or a flat markdown table (losing interactivity).

The design philosophy centers on three principles:

1. **Structured visualization** - Rows and columns create a visual grid that makes comparison natural. Users can scan across rows to see how one option performs across all criteria, or down columns to see how all options compare on one criterion.

2. **Incremental evaluation** - Unlike generating an entire table at once, users can fill cells individually, row-by-row, column-by-column, or all at once. This supports iterative refinement where users might evaluate a few options first, decide to add or remove criteria, then continue filling.

3. **Integration with the conversation DAG** - Each cell evaluation includes the full DAG context (ancestor nodes), meaning evaluations are informed by prior conversation. Pinned cells become first-class nodes that can be replied to, branched from, or used as context for follow-up questions.

This node type directly supports the "Rich LLM Features" principle from the HLD: "Matrix evaluation - Compare options across multiple criteria."

## Technical Details

### Node Data Structure

Matrix nodes store their state in the graph's Yjs CRDT. The structure is:

```javascript
{
    id: string,                    // UUID
    type: 'matrix',
    context: string,               // User-provided evaluation goal (e.g., "evaluate languages")
    contextNodeIds: string[],      // Source node IDs used for context
    rowItems: string[],            // Row labels (max 10)
    colItems: string[],            // Column labels (max 10)
    cells: {                       // Object keyed by "rowIdx-colIdx"
        [cellKey: string]: {
            content: string | null,
            filled: boolean,
            filling: boolean       // True during streaming generation
        }
    },
    groundWithWeb: boolean,        // Whether to use web search grounding
    webSearchResults: Array<{      // Cached web search results
        title: string,
        url: string,
        snippet: string,
        content?: string           // Full page content if fetched
    }>,
    indexColWidth: string,         // CSS percentage for row header width
    position: { x: number, y: number },
    width: number,
    height: number,
    created_at: number,
    tags: string[],
    title: string | null,
    summary: string | null,
    model: string | null,
    selection: any,
    outputExpanded: boolean,       // Sources drawer state
    outputPanelHeight: number      // Sources drawer height
}
```

### Two-Component Architecture

The matrix feature combines two distinct plugin concepts:

1. **MatrixNode** (Level 1 - Custom Node Type): Extends `BaseNode` protocol. Handles rendering, event bindings, cell updates, and clipboard formatting. Registered with `NodeRegistry`.

2. **MatrixFeature** (Level 2 - Feature Plugin): Extends `FeaturePlugin`. Handles slash command processing, modal management, cell filling, web grounding, and undo/redo. Registered with `FeatureRegistry`.

This separation follows the plugin architecture guidelines: node rendering logic stays with the node type, while complex workflows (creation, filling, extraction) stay with the feature.

### Rendering Pipeline

The matrix renders through several layers:

1. **Canvas** detects a `matrix` type node and wraps it with `wrapNode()` to get the `MatrixNode` protocol
2. **MatrixNode.renderContent()** generates the HTML for:
    - Context bar (evaluation goal text + copy button)
    - Table with `<thead>` for columns, `<tbody>` for rows
    - Action buttons (Edit, Fill All, Clear All)
3. **CSS flexbox** overrides table layout to enable:
    - Equal row height distribution (`flex: 1` on `<tr>`)
    - Dynamic content truncation with fade effect
    - Scroll-free visibility of all rows
4. **Event bindings** connect cell clicks, button clicks, and header clicks to canvas events

### CSS Architecture for Dynamic Sizing

The matrix uses a specialized CSS approach to handle variable content heights within fixed node dimensions:

```css
.matrix-table {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0; /* Critical: allows shrinking below content size */
}

.matrix-table tbody {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.matrix-table tbody tr {
    display: flex;
    flex: 1; /* Equal distribution of available height */
    min-height: 0;
}
```

The fade effect uses a gradient pseudo-element at the bottom of filled cells:

```css
.matrix-cell-content::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1.4em;
    background: linear-gradient(transparent, white);
    pointer-events: none;
}
```

This creates visual feedback that content extends beyond what's visible, rather than abruptly cutting off text.

### Index Column Resize

The row headers (first column) have a draggable resize handle in the corner cell. The flow:

1. User mousedowns on `.index-col-resize-handle`
2. `MatrixNode.handleCustomResize()` captures the event
3. Mouse move calculates new width as percentage of table width
4. CSS variable `--index-col-width` updates the column width
5. On mouseup, the final width is persisted to the node via `graph.updateNode()`

## Cell Filling with LLM

### Single Cell Fill

When a user clicks an empty cell (the `+` button), this flow executes:

1. **UI Update**: Cell immediately shows a spinner with "Filling..." text
2. **Context Gathering**: The system collects:
    - Matrix context (user's evaluation goal)
    - Row item name and column item name
    - Full DAG history (all ancestor nodes via `graph.resolveContext()`)
3. **Optional Web Grounding**: If `groundWithWeb` is enabled:
    - Web search is performed using the matrix context as query
    - Search results are enriched with full page content
    - A map-reduce pipeline summarizes relevant sources for this specific cell
4. **LLM Request**: POST to `/api/matrix/fill` with:

    ```json
    {
        "row_item": "Python",
        "col_item": "Ease of Learning",
        "context": "evaluate programming languages",
        "messages": [...],
        "model": "openai/gpt-4o-mini"
    }
    ```

5. **Streaming Response**: The backend streams tokens via SSE. The frontend:
    - Updates cell content in real-time (throttled to 50ms intervals)
    - Syncs to CRDT periodically to enable multiplayer sync
    - Shows final content when `done` event arrives
6. **Completion**: Cell state updates to `{ content: "...", filled: true, filling: false }`, undo action is pushed, session saves

### Fill All

The "Fill All" button fills every empty cell in sequence:

1. All empty cells immediately show spinners
2. If web grounding is enabled, search runs once before any cells fill
3. Cells fill in parallel using `Promise.all()` - each cell handles its own streaming
4. The stop button on the matrix node can cancel all in-progress fills

### Web Grounding Pipeline

When `groundWithWeb` is enabled, the system performs a sophisticated grounding operation:

1. **Query Derivation**: An LLM call derives a search query from the matrix context
2. **Search Execution**: Web search (Exa or DuckDuckGo) returns URLs and snippets
3. **Content Enrichment**: Each URL is fetched and full page content extracted
4. **Cell-Specific Summarization**: For each cell:
    - An LLM generates a summarization prompt specific to that row×column
    - Each source is summarized against that prompt in parallel
    - Summaries are formatted and injected into the cell's context

This is a map-reduce pattern: map (parallel source summarization) → reduce (final synthesis into cell content).

### Backend Endpoint: `/api/matrix/fill`

The backend uses litellm to proxy to the configured LLM:

```python
system_prompt = """You are evaluating items in a matrix.
Matrix context: {request.context}

You will be given a row item and a column item. Evaluate or analyze the row
item against the column item. Be concise (2-3 sentences). Focus on the specific
intersection of these two items."""

# Messages include DAG history + final user message:
# "Row item: {row_item}\nColumn item: {col_item}"
```

The response streams via SSE with events: `message` (content chunks), `done` (completion), `error` (failures).

## Row/Column Extraction

### Slice Modal

Clicking a row header or column header opens a "slice" modal showing:

- The row or column label
- All cell contents for that slice, formatted as:

    ```text
    Column1:
    [cell content or "(empty)"]

    Column2:
    [cell content or "(empty)"]
    ```

This allows users to review an entire row or column in isolation before pinning.

### Pin to Canvas

From either the cell detail modal or the slice modal, users can "Pin to Canvas":

1. A new node is created (`CellNode`, `RowNode`, or `ColumnNode` type)
2. The node is positioned to the right of the matrix
3. An edge connects the matrix to the new node (MATRIX_CELL edge type)
4. The new node becomes selected and can be:
    - Replied to directly
    - Branched from (select text and create new conversation)
    - Used as context for future matrix fills or questions

This bridges the structured matrix world with the freeform conversation DAG.

## Modal System

The MatrixFeature registers four modals:

1. **Create Modal** (`matrix:create`):
    - Context input (readonly, shows parsed context)
    - Two-axis editor with add/remove/swap controls
    - "Ground with web search" checkbox
    - Warning when >10 items per axis

2. **Edit Modal** (`matrix:edit`):
    - Same axis editing as create
    - Cell preservation when items reordered/removed
    - Web grounding toggle

3. **Cell Detail Modal** (`matrix:cell`):
    - Row label, column label, full evaluation text
    - Copy button, Pin to Canvas button

4. **Slice Modal** (`matrix:slice`):
    - Row or column label, all cell contents
    - Copy button, Pin to Canvas button

All modals follow the standard plugin modal registration pattern via `modalManager.registerModal()`.

## Undo/Redo Support

The matrix registers custom undo/redo handlers for cell fills:

```javascript
this.undoManager.registerActionHandler('FILL_CELL', {
    undo: this.undoFillCell.bind(this),
    redo: this.redoFillCell.bind(this),
});
```

The action stores: `nodeId`, `row`, `col`, `oldCell`, `newCell`. Undo restores the previous cell state; redo re-applies the fill.

## Streaming Manager Integration

Matrix cell fills integrate with the app's `StreamingManager` for concurrent streaming management:

- Each cell fill registers with group ID `matrix-{nodeId}`
- The stop button on the matrix node stops all fills in its group
- Fill state (spinner vs content) is tracked per-cell

This enables:

- Parallel cell fills without UI jank
- Single stop button to cancel all in-progress fills
- Proper cleanup when fills complete or abort

## Extension Hooks

The matrix emits events that other plugins can intercept:

- `matrix:before:fill` - Cancellable, fires before cell fill starts
- `matrix:cell:prompt` - Cancellable, allows custom prompt injection
- `matrix:after:fill` - Notification after fill completes (success or failure)

Plugins can use these to:

- Log all cell fills for analytics
- Validate or modify prompts before generation
- Trigger side effects after completion

## Limits and Constraints

| Limit                 | Value                   | Rationale                                                                     |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| Items per axis        | 10 max (100 cells)      | Prevents overwhelming API costs, UI performance issues, unreadable tables     |
| Cell content length   | Truncated in table view | Full content in modal; table shows preview with fade                          |
| Fill All processing   | Sequential per cell     | Parallel fills could exceed rate limits; sequential provides visible progress |
| Web grounding sources | All results cached      | Avoids redundant search per cell; map-reduce summarization is expensive       |

## Open Questions & Future Decisions

### Resolved (Implementation Complete)

1. ✅ **Cell editing after fill** - Currently cells are read-only after generation. Future could allow manual edits.
2. ✅ **Row/column reordering** - Edit modal supports this with cell remapping.
3. ✅ **Export to CSV** - Not implemented; could use clipboard copy of markdown table.
4. ✅ **Re-fill cells** - Not implemented; would replace existing content.

### Deferred / Future Considerations

1. **Sort/filter rows based on column values** - Could rank rows by scores in a specific column. Requires structured cell content (e.g., numerical scores).

2. **Conditional formatting** - Highlight cells based on content (e.g., "good" = green, "poor" = red). Requires content analysis or structured output.

3. **Multi-dimensional matrices** - More than 2 axes (e.g., 3D cube). Current 2D design would need significant extension.

4. **Bulk row/column fill** - Fill entire row or column with one click. UI exists for single cell and "Fill All" - intermediate option.

5. **Cell formulas** - Simple computed cells (e.g., average of other cells). Current implementation is pure LLM output.

6. **Offline caching of web results** - Currently web results persist in session. Could persist across sessions in IndexedDB for offline access.

## References

### High-Level Design

- `/docs/high-level-design.md` - Core canvas-chat architecture, node types, plugin system

### Explanation Documents

- `/docs/explanation/matrix-evaluation.md` - Design decision rationale for matrix feature
- `/docs/explanation/matrix-resize-behavior.md` - Detailed CSS approach for dynamic cell sizing

### User Guides

- `/docs/how-to/use-matrix-evaluation.md` - End-user documentation for matrix feature

### Implementation

**Frontend:**

- `src/canvas_chat/static/js/plugins/matrix.js` - Complete implementation (MatrixNode protocol + MatrixFeature)
- `src/canvas_chat/static/js/graph-types.js` - `createMatrixNode()`, `createCellNode()`, `createRowNode()`, `createColumnNode()` factory functions
- `src/canvas_chat/static/js/node-protocols.js` - `BaseNode` protocol class
- `src/canvas_chat/static/css/matrix.css` - Matrix-specific styles

**Backend:**

- `src/canvas_chat/plugins/matrix_handler.py` - `/api/parse-two-lists` and `/api/matrix/fill` endpoints

**Tests:**

- `tests/test_matrix.js` - Matrix rendering and state tests
- `tests/test_matrix_plugin.js` - MatrixFeature plugin tests
- `cypress/e2e/matrix.cy.js` - E2E matrix creation and interaction tests
- `cypress/e2e/matrix_fill_all_spinners.cy.js` - Fill All with mocked streaming
- `cypress/e2e/matrix_row_column_click.cy.js` - Row/column extraction modal tests

### Related Features

- Web grounding: `src/canvas_chat/static/js/web-grounding.js`
- Streaming: `src/canvas_chat/static/js/streaming-manager.js`
- Undo/Redo: `src/canvas_chat/static/js/undo-manager.js`
