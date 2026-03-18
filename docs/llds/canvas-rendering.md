# Canvas: Visual Chat History

**Created**: 2026-03-16
**Updated**: 2026-03-17 (migrated to Svelte Flow)
**Status**: Design Phase

## Context and Design Philosophy

The Canvas renders the visual representation of chat history. Each message (human or AI) appears as a node on an infinite 2D space. The canvas handles pan, zoom, and interaction - letting users explore their conversation spatially.

**Migration (issue #247)**: The canvas is migrating from a custom SVG implementation (`canvas.js`, ~4,700 lines) to Svelte Flow (`@xyflow/svelte`). See `/docs/llds/build-deployment.md` for the build pipeline that compiles Svelte source into static assets.

## Rendering Strategy

### Svelte Flow (Target — issue #247)

Nodes are rendered as Svelte components. Svelte Flow uses HTML/CSS transforms instead of SVG foreignObject:

```svelte
<!-- CanvasFlow.svelte -->
<SvelteFlow :nodes :edges :onNodesChange :onEdgesChange>
  <HumanNode type="human" />
  <AiNode type="ai" />
  <NoteNode type="note" />
  <!-- 25+ custom node types -->
  <MiniMap />
  <Controls />
</SvelteFlow>
```

**Why Svelte Flow**: HTML/CSS rendering (no Safari foreignObject issues), built-in MiniMap/Controls, active maintenance, saves ~4,700 lines of custom code.

**Trade-off**: Adds build step (Vite), framework dependency, adapter pattern for vanilla JS plugins.

### Node Structure

Each node has:

- **Header**: Type icon, model name, delete button, stop/continue (AI nodes)
- **Content**: Rendered markdown/code/images
- **Actions**: Copy, edit, branch buttons
- **Resize handle**: Drag to resize (complex nodes)

### Edge Rendering

Edges are Bezier curves connecting nodes. Svelte Flow handles edge rendering with custom edge types.

**Edge types**: `reply`, `branch`, `reference`, `generates` — each registered as a Svelte Flow edge type.

### Pan and Zoom

Svelte Flow provides built-in pan and zoom. Configuration:

```javascript
const panOnDrag = [1]; // Left mouse button
const minZoom = 0.1;
const maxZoom = 3.0;
const defaultZoom = 1.0;
```

### Input Methods

| Input                        | Action             |
| ---------------------------- | ------------------ |
| Mouse drag (on empty canvas) | Pan                |
| Ctrl + Scroll wheel          | Zoom toward cursor |
| Trackpad pinch               | Zoom               |
| Touch drag (single finger)   | Pan                |
| Touch pinch (two fingers)    | Zoom               |

## Semantic Zoom

Three levels of detail based on zoom scale:

| Scale    | Class          | Shows               |
| -------- | -------------- | ------------------- |
| > 0.6    | `zoom-full`    | Full content        |
| 0.35-0.6 | `zoom-summary` | Summary text only   |
| ≤ 0.35   | `zoom-mini`    | Just icon and title |

This lets users see conversation structure at different scales.

## Interactions

### Selection

- **Click**: Select single node
- **Ctrl+Click**: Toggle node in selection
- **Drag on selection**: Move multiple nodes

### Dragging

- **Zoomed in**: Drag via handle only
- **Zoomed out** (≤0.6): Drag from anywhere on node

### Text Selection

When user selects text in node content:

1. Detect via `selectionchange` event
2. Show "Reply" tooltip near selection
3. Store selected text for reply context

## Node Protocol Pattern

The canvas uses a protocol pattern to get node-type-specific behavior:

```javascript
wrapped = wrapNode(node); // Returns BaseNode or custom protocol

wrapped.getTypeIcon(); // Node type emoji
wrapped.getSummaryText(); // For semantic zoom
wrapped.renderContent(); // HTML content
wrapped.getActions(); // Available buttons
```

This allows custom node types to control their rendering without modifying canvas code.

## Canvas Adapter Strategy (Phases 3-6)

During the transition period, `app.js` (~4,700 lines) and all plugins continue to call `canvas.X()` methods. The old `canvas.js` is **rewritten as a thin adapter** that delegates to Svelte Flow instead of manipulating SVG DOM. The App class and plugins require zero changes.

### Why an adapter instead of refactoring the App class

The App class has 169 calls to 65 unique canvas methods. Plugins add another ~150 calls to the same surface. Refactoring both `app.js` and all plugins to call Svelte Flow directly would change thousands of lines simultaneously — high risk, hard to verify incrementally.

The adapter lets us swap the rendering engine (SVG → Svelte Flow) while keeping all callers unchanged. Phase 8 then deletes the adapter, App class, and `canvas.js` together.

### Method surface analysis

65 unique methods called across `app.js`, `feature-registry.js`, and 25+ plugin files:

#### Category 1: Rendering — become no-ops (16 methods)

Svelte Flow auto-renders when the graph store changes. These methods currently manipulate SVG DOM directly. In the adapter, they update the graph store (or do nothing).

| Method                            | Current behavior                          | Adapter behavior                              |
| --------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `renderNode(node)`                | Creates SVG group, appends to DOM         | `graph.updateNode(node)` → Svelte Flow reacts |
| `updateNodeContent(id, html)`     | Sets innerHTML on node element            | `graph.updateNode(id, { content: html })`     |
| `removeNode(id)`                  | Removes SVG group from DOM                | `graph.removeNode(id)` → Svelte Flow reacts   |
| `removeEdge(id)`                  | Removes SVG path from DOM                 | `graph.removeEdge(id)` → Svelte Flow reacts   |
| `renderEdge(edge, ...)`           | Creates SVG Bezier path                   | No-op (Svelte Flow auto-renders edges)        |
| `renderGraph(graph)`              | Renders all nodes + edges                 | No-op (Svelte Flow reacts to store)           |
| `clear()`                         | Removes all SVG elements                  | `graph.clear()`                               |
| `updateEdgeState(id, state)`      | Sets edge data attributes                 | `graph.updateEdge(id, state)`                 |
| `updateEdgesForNode(id, pos)`     | Recalculates connected edges              | No-op                                         |
| `updateAllEdges()`                | Iterates all edges, recalculates          | No-op                                         |
| `updateNodeSummary(id)`           | Updates summary text element              | `graph.updateNode(id, ...)`                   |
| `updateNodeVisibility(id)`        | Shows/hides node based on collapsed state | `graph.updateNode(id, ...)`                   |
| `updateCollapseButton(id)`        | Updates expand/collapse button            | No-op (Svelte node component handles)         |
| `showNodeError(id, msg)`          | Adds error class + message to node        | `graph.updateNode(id, { error: msg })`        |
| `clearNodeError(id)`              | Removes error class from node             | `graph.updateNode(id, { error: null })`       |
| `updateAllNavButtonStates(graph)` | Iterates nodes, updates nav buttons       | No-op (node components handle internally)     |

#### Category 2: Viewport — thin wrappers (8 methods)

Delegate to Svelte Flow's `fitView()`, `setViewport()`, etc.

| Method                                          | Adapter implementation                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| `zoomToSelectionAnimated(ids, scale, duration)` | Svelte Flow `fitView({ nodes: ids, padding, duration })` |
| `fitToContent()`                                | Svelte Flow `fitView()`                                  |
| `fitToContentAnimated(duration)`                | Svelte Flow `fitView({ duration })`                      |
| `centerOnAnimated(nodeId)`                      | Svelte Flow `setViewport({ x, y })`                      |
| `panToNodeAnimated(nodeId)`                     | Svelte Flow `setViewport({ x, y })`                      |
| `resizeNodeToViewport(nodeId)`                  | Svelte Flow `setViewport({ zoom })` + update node size   |
| `animateToLayout(positions)`                    | Svelte Flow `setViewport({ x, y })` for each position    |
| `getViewportCenter()`                           | Svelte Flow `getViewport()` → calculate center           |

#### Category 3: Selection — read/write Svelte Flow state (3 methods)

| Method                    | Adapter implementation                                                       |
| ------------------------- | ---------------------------------------------------------------------------- |
| `getSelectedNodeIds()`    | Return `nodes.filter(n => n.selected).map(n => n.id)` from Svelte Flow state |
| `clearSelection()`        | `setNodes(nodes.map(n => ({ ...n, selected: false })))`                      |
| `selectNode(id, isMulti)` | Update node's `selected` property in Svelte Flow state                       |

#### Category 4: Events — EventEmitter (4 methods)

Reuse the existing `EventEmitter` class. Same as current canvas.js behavior.

| Method                                                     | Adapter implementation                            |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `on(event, listener)`                                      | `events.on(event, listener)`                      |
| `off(event, listener)`                                     | `events.off(event, listener)`                     |
| `emit(event, ...args)`                                     | `events.emit(event, ...args)`                     |
| Callback properties (`onNodeSelect`, `onNodeDelete`, etc.) | Store in adapter, fire via EventEmitter on events |

#### Category 5: State reads — map to Svelte Flow (8 methods)

These are **the hardest**. Plugins read DOM state that doesn't exist in Svelte Flow.

| Method                       | Problem                                                                     | Adapter approach                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeElements` (Map)         | Plugins read positions (5 calls) AND do complex DOM manipulation (15 calls) | Hybrid DOM Proxy: intercept `getAttribute('x')`/`('y')`/`('width')`/`('height')` from Svelte Flow store; forward all other access (`querySelector`, `classList`, `textContent`, `innerHTML`) to real Svelte Flow DOM element via `document.querySelector('[data-id="${id}"]')`. See "Strategy: Hybrid DOM Proxy" below. |
| `edgeElements` (Map)         | Plugins iterate edges for orphan cleanup (5 calls, all simple)              | Hybrid DOM Proxy: intercept `getAttribute('data-source')`/`('data-target')` from Svelte Flow edge store; forward other access to real DOM.                                                                                                                                                                              |
| `graph` (property)           | Plugins access the CRDT graph instance                                      | Direct reference to the same CRDTGraph instance                                                                                                                                                                                                                                                                         |
| `getViewportCenter()`        | Returns viewport center coordinates                                         | Read from Svelte Flow `getViewport()`                                                                                                                                                                                                                                                                                   |
| `getNodeDimensions(id)`      | Reads DOM `getBoundingClientRect()`                                         | Approximate from Svelte Flow node data (`width`, `height`, `position`)                                                                                                                                                                                                                                                  |
| `getNavButton(nodeId, type)` | Reads DOM element                                                           | Return null or delegate to Svelte node component                                                                                                                                                                                                                                                                        |
| `getReplyTooltipInput()`     | Reads reply tooltip input element                                           | Return null (reply tooltip becomes Svelte component)                                                                                                                                                                                                                                                                    |
| `pendingSelectedText`        | Stores selected text state                                                  | Simple property on adapter                                                                                                                                                                                                                                                                                              |

#### Category 6: Utility functions — delegate to correct modules (10 methods)

These are utility functions that live on canvas.js for historical reasons but belong elsewhere.

| Method                            | Adapter delegates to                                            |
| --------------------------------- | --------------------------------------------------------------- |
| `escapeHtml(text)`                | `escapeHtmlText()` from `utils.js` (already exists)             |
| `renderMarkdown(text)`            | `marked.parse(text)` (already used internally)                  |
| `truncate(text, max)`             | `truncateText()` from `utils.js` (already exists)               |
| `saveSession()`                   | `storage.saveSession()`                                         |
| `copyImageToClipboard(...)`       | Standalone function using Canvas API                            |
| `highlightTextInNode(...)`        | Highlight utility (post-render DOM manipulation — special case) |
| `highlightTextInOutputPanel(...)` | Highlight utility (post-render DOM manipulation — special case) |
| `rerenderNodeContent(id)`         | `graph.updateNode(id, ...)` → Svelte reacts                     |

#### Category 7: Node-internal UI — move to Svelte components (10 methods)

These manage UI elements inside node components. They don't belong on a canvas class. The adapter stubs them; the real implementation lives in Svelte node components.

| Method                                                                 | Notes                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| `showCopyFeedback(msg, nodeId)`                                        | Toast notification — move to Svelte component or utility      |
| `showStopButton(nodeId)` / `hideStopButton(nodeId)`                    | Node-internal UI — Svelte node component                      |
| `updateOutputPanelContent(nodeId, html)`                               | Code node output panel — Svelte node component                |
| `clearMatrixCellHighlights()` / `highlightMatrixCell(row, col, color)` | Matrix node UI — Svelte node component                        |
| `showImageTooltip(...)` / `hideImageTooltip()`                         | Image preview — Svelte component                              |
| `setPdfViewerHydrator(fn)`                                             | PDF node callback — store on adapter                          |
| `getContext()`                                                         | SVG 2D context — return null (Svelte Flow doesn't use canvas) |
| `canvas.width` / `canvas.height`                                       | SVG dimensions — return container dimensions                  |

#### Category 8: Navigation popover — remove or move to Svelte (11 methods)

These implement the parent/child navigation popover UI that is specific to the old SVG canvas. Svelte Flow has different UX patterns for navigation.

| Method                          | Notes                                      |
| ------------------------------- | ------------------------------------------ |
| `isNavPopoverOpen()`            | Nav popover — evaluate if needed in Svelte |
| `hideNavPopover()`              | Same                                       |
| `navigatePopoverSelection(dir)` | Same                                       |
| `confirmPopoverSelection()`     | Same                                       |
| `showNavPopover(...)`           | Same                                       |
| `handleNavButtonClick(...)`     | Same                                       |
| `updateNavButtonState(...)`     | Same                                       |
| `showNavToast(...)`             | Toast — utility                            |
| `getNavButton(...)`             | Nav UI — Svelte component                  |
| `clearSourceTextHighlights()`   | Highlight utility                          |
| `highlightContext(...)`         | Node highlighting                          |

### Adapter size estimate

| Category                    | Methods | Lines (est.) |
| --------------------------- | ------- | ------------ |
| 1. Rendering (no-ops)       | 16      | ~50          |
| 2. Viewport (wrappers)      | 8       | ~60          |
| 3. Selection (state)        | 3       | ~20          |
| 4. Events (EventEmitter)    | 4       | ~30          |
| 5. State reads (Proxy Map)  | 8       | ~120         |
| 6. Utility delegation       | 10      | ~40          |
| 7. Node-internal UI (stubs) | 10      | ~50          |
| 8. Nav popover (stubs)      | 11      | ~50          |
| Constructor + init          | 1       | ~30          |
| **Total**                   | **~71** | **~450**     |

### nodeElements / edgeElements access audit (COMPLETE)

All direct `nodeElements` and `edgeElements` accesses catalogued. Two access patterns emerge:

#### Pattern A: Position/size reads via `getAttribute` (5 calls)

| Location | Lines                  | Accesses                                                                                    |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `app.js` | 2111-2122              | `wrapper.getAttribute('x')`, `getAttribute('y')`                                            |
| `app.js` | 2144-2156              | Same (collapsed path edges)                                                                 |
| `app.js` | 3710-3715              | `getAttribute('x')`, `getAttribute('y')`, `getAttribute('width')`, `getAttribute('height')` |
| `app.js` | 3697                   | `this.canvas.nodeElements.keys()` (existence check)                                         |
| `app.js` | 5 `edgeElements` calls | `path.getAttribute('data-source')`, `path.getAttribute('data-target')`                      |

#### Pattern B: Complex DOM manipulation via `querySelector` + mutation (15 calls)

| Location              | Lines     | Operation                                                                                       |
| --------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `app.js`              | 2967-2989 | `querySelector('.node')` + `classList.add` + `setAttribute('width')` + `setAttribute('height')` |
| `app.js`              | 3446-3451 | `querySelector('.summary-text')` + `.textContent =`                                             |
| `app.js`              | 3898-3908 | `wrapper.classList.remove/add` (zoom class changes)                                             |
| `app.js`              | 3977-3981 | `wrapper.setAttribute('x')` + `setAttribute('y')` (position writes)                             |
| `app.js`              | 3989-3998 | `querySelector('.summary-text')` + `.textContent =`                                             |
| `app.js`              | 4056-4060 | `wrapper.setAttribute('x')` + `setAttribute('y')`                                               |
| `app.js`              | 4068-4077 | `querySelector('.summary-text')` + `.textContent =`                                             |
| `code.js`             | 178       | `querySelector('.code-display code')` + highlight.js                                            |
| `code.js`             | 271       | `querySelector('.node')` + `querySelector('.code-node-content')` + innerHTML                    |
| `code.js`             | 348       | `querySelector('.code-generate-input')` + `.remove()`                                           |
| `matrix.js`           | 332       | `querySelector('.matrix-cell[data-row=...]')` + classList                                       |
| `matrix.js`           | 374       | `querySelector('.matrix-cell[data-row=...]')` + content update                                  |
| `powerpoint-node.js`  | 865       | `querySelector('.node')` + `querySelector('.node-content')` + `querySelector('.pptx-node')`     |
| `image-generation.js` | 209, 302  | `querySelector('.image-node-content')` + innerHTML                                              |
| `flashcards.js`       | 990       | `querySelector('.node')` + `classList.toggle('flashcard-flipped')`                              |

### Strategy: Hybrid DOM Proxy

A simple Proxy Map that only intercepts `getAttribute` is insufficient — only 5 of 20 calls use that pattern. The adapter uses a **Hybrid DOM Proxy** that:

1. **Intercepts `getAttribute('x'|'y'|'width'|'height')`** → reads from Svelte Flow node store (position/dimensions). This replaces SVG attribute reads with reactive store reads.
2. **Forwards everything else** → delegates to the actual Svelte Flow DOM element. `querySelector`, `classList`, `textContent`, `innerHTML` all work because they operate on real DOM rendered by Svelte Flow.

```javascript
createNodeProxy(nodeId) {
    const handler = {
        get(target, prop) {
            if (prop === 'getAttribute') {
                return (attr) => {
                    const node = getNodeFromStore(nodeId);
                    if (attr === 'x') return String(node.position.x);
                    if (attr === 'y') return String(node.position.y);
                    if (attr === 'width') return String(node.measured?.width ?? node.width ?? 0);
                    if (attr === 'height') return String(node.measured?.height ?? node.height ?? 0);
                    return getRealElement(nodeId)?.getAttribute(attr);
                };
            }
            const el = getRealElement(nodeId);
            if (el && prop in el) return el[prop];
            return undefined;
        }
    };
    return new Proxy({}, handler);
}
```

`getRealElement(nodeId)` uses `document.querySelector('[data-id="${nodeId}"]')` — Svelte Flow's standard data attribute for node elements.

For `edgeElements`: same pattern, intercepting `getAttribute('data-source'|'data-target')` from Svelte Flow edge store.

**Risks and mitigations:**

| Risk                                                                              | Mitigation                                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| DOM element doesn't exist yet when plugin calls `nodeElements.get()`              | Return a Proxy that returns `null` for DOM operations; queue position reads until node mounts |
| `querySelector('.summary-text')` depends on Svelte component internal class names | Custom node components use the same CSS class names as current SVG rendering                  |
| `wrapper.setAttribute('x')` (position writes in app.js:3977-4081)                 | Intercept `setAttribute` for x/y to write to Svelte Flow store instead of DOM attribute       |
| `wrapper.classList.add/remove` for zoom classes                                   | Forward to real DOM — Svelte node components already have these classes from current CSS      |

### Phase plan for adapter

- **Phase 2**: Create `canvas.js` adapter with categories 1-4 (rendering, viewport, selection, events). Stub categories 5-8. Verify App class still works.
- **Phase 3**: Complete category 5 (state reads with Proxy Map). Verify plugins still work.
- **Phase 4-6**: Incrementally move category 6-7 methods to Svelte node components as each node type is migrated.
- **Phase 8**: Delete adapter, App class, and all remaining category 8 stubs.

## Open Questions & Future Decisions

### Resolved

1. Svelte Flow chosen over React Flow — Svelte fits the lightweight philosophy; no JSX build chain
2. Semantic zoom is CSS-based — classes applied to node wrapper elements based on zoom store
3. foreignObject replaced by Svelte Flow's HTML-based rendering — fixes Safari (issue #247)

### Deferred

1. Auto-layout algorithm? Currently manual placement
2. Custom Svelte Flow themes? Use default for initial migration

## References

- HLD: `/docs/high-level-design.md`
- Build & Deploy LLD: `/docs/llds/build-deployment.md`
- Implementation (current): `src/canvas_chat/static/js/canvas.js`
- Implementation (target): `src/canvas_chat/static/svelte/CanvasFlow.svelte`
