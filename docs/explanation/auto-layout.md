# Auto-layout algorithm

This document explains the design decisions for automatically arranging nodes on the canvas.

## Available algorithms

Canvas Chat offers three layout algorithms, selectable via the layout picker dropdown:

| Algorithm | Method | Direction | Default |
|-----------|--------|-----------|---------|
| **Top-Down Tree** | `verticalTreeLayout()` | Top-to-bottom (Y = depth) | Yes |
| **Hierarchical** | `autoLayout()` | Left-to-right (X = depth) | |
| **Force-Directed** | `forceDirectedLayout()` | Physics simulation | |

## Top-Down Tree (default)

The newest and default algorithm. Parents are vertically above, children below.

### Design principles

1. **Roots stay anchored** — root nodes keep their existing X position; the tree grows downward from them
2. **Top-down only** — children are centered under their parents; parents are never moved by children (no bottom-up pass)
3. **Center-of-mass preservation** — after layout, the entire tree is shifted so its horizontal center of mass matches the pre-layout center (prevents the tree from jumping to the left edge when switching from hierarchical)
4. **Per-layer overlap resolution** — siblings that would overlap are pushed apart horizontally via `resolveHorizontalOverlaps`

### Algorithm

1. **Layer assignment**: Each node's layer = `max(parent layers) + 1`. Roots = layer 0. Y = `layer * (max_height_in_layer + VERTICAL_GAP)`.
2. **Top-down X positioning**: Process layers top to bottom. Roots keep existing X. Non-root nodes get X = `average(parent centers) - node_width / 2`.
3. **Overlap resolution**: Within each layer, `resolveHorizontalOverlaps` sorts by X and pushes apart any overlapping siblings.
4. **Center-of-mass shift**: Shift all nodes so the post-layout center of mass matches the pre-layout center of mass. Then a final overlap resolution pass per layer.
5. **Write to CRDT**: Clamp all X to `>= START_X`, write positions.

### Why top-down only (no bottom-up pass)

An earlier version included a bottom-up centering pass that moved parents toward their children's centroid. This was **counterproductive**: when children were pushed apart by overlap resolution (shifting the children's centroid rightward), the bottom-up pass dragged the root — and the entire tree — sideways. The top-down-only approach keeps roots stable and produces straight vertical edges for chains (the most common conversation pattern).

## Hierarchical (left-to-right)

The original algorithm. Processes nodes in topological order, assigns horizontal layers (X = depth), and places vertically (Y) using greedy search for non-overlapping positions.

Key constants in `crdt-graph.js`:

```javascript
const HORIZONTAL_GAP = 120;  // Gap between layers (columns)
const VERTICAL_GAP = 40;     // Minimum gap between nodes vertically
const START_X = 100;         // Left margin
const START_Y = 100;         // Top margin
```

## Force-Directed

Physics simulation with repulsion between all node pairs and spring attraction along edges. 100 iterations. Produces organic layouts but is non-deterministic.

## Incremental positioning: autoPosition

When a new node is created (not via Apply Layout, but during normal conversation), `autoPosition(parentIds, nodeType)` determines its initial position:

- **No parents**: `(START_X, START_Y)`
- **One parent**: Centered horizontally under parent, placed below it (`parent.y + parent.height + VERTICAL_GAP`)
- **Multiple parents**: X from average of parent centers, Y below the deepest parent
- **Overlap avoidance**: If the initial position overlaps existing nodes, shifts horizontally (alternating left/right)

The `nodeType` parameter is critical for correct centering — `autoPosition` uses `getDefaultNodeSize(type)` to look up the actual width. HUMAN nodes are 420px wide, AI nodes are 640px. Using wrong dimensions causes bent edges.

## createLinkedNode

The canonical way to create a node linked to parents. `graph.createLinkedNode(type, content, parentIds, options)` creates the node, positions it via `autoPosition(parentIds, type)`, and creates REPLY/MERGE edges — all atomically. Emits `'linkedNodeCreated'` event.

This prevents the bug where node creation forgot to create edges to selected parent nodes.

## Auto-layout trigger (disabled)

`scheduleAutoLayout()` in `app.js` is an intentional no-op. Running full `verticalTreeLayout` on every node creation was counterproductive — it moved established nodes off-center. `autoPosition` in `createLinkedNode` handles incremental placement correctly. Full re-layout is available via the Apply Layout button.

## Focus-centric layout (on-navigation)

When the user navigates with j/k (or selects a node), `focusCentricLayout(focusNodeId)` dynamically reorganizes the graph around the focused node. This is NOT a full re-layout — it adjusts positions relative to the focus, with distant nodes blending partially.

### Key properties

1. **Focus stays anchored** — the focused node does not move; it's already centered by the viewport
2. **Parents above, children below** — direct parents are centered as a group above the focus; each child stays centered under its own parent for straight edges
3. **Focus-path centering** — ancestors (grandparents etc.) center on their child that leads back to the focus (the "discoverer" from BFS), producing straight vertical edges along the entire navigation path
4. **Sibling expansion** — siblings (other children of the same parent) join the layout at the same layer as the focus, with their subtrees included
5. **Subtree-aware spacing** — siblings are spaced based on their subtree half-widths (widest descendant layer), preventing child overlaps that would bend edges
6. **Distance-based blend** — layers 0-1 move fully (weight 1.0), layer 2 moves 60%, layer 3+ moves 20%. Distant nodes "subtily adjust"

### Steps

1. **BFS with sibling expansion** from focus node:
   - Parents → layer -1, -2, ...
   - Children → layer +1, +2, ...
   - Siblings (other children of same parents) → same layer
   - Track which child discovered each node (for focus-path centering)

2. **Y positioning**: focus stays at current Y. Each layer offset by `max_height_in_layer + VERTICAL_GAP`.

3. **X positioning**:
   - Layer 0: focus pinned at current X. Siblings placed left/right using subtree half-widths.
   - Upward (negative layers): each node centered on its focus-path child exclusively (if one exists), otherwise average of children.
   - Downward (positive layers): each child centered under its parent.
   - Per-layer overlap resolution via `resolveHorizontalOverlaps`.
   - Direct parents of focus re-centered as a group so their centroid matches focus center.

4. **Blend**: existing positions blended with ideal positions based on BFS distance.

### Worked example

Graph: `A → (B, C)`, `B → D`, `C → E`. Navigate `A → B → D`:

```text
Focus A:          Focus B:          Focus D:
    A                 A                 A
   / \                |                 |
  B   C              C  B               B
  |   |              |  |               |
  D   E              E  D               D
                     ^straight          ^straight
```

At each step, the navigated path has straight vertical edges. The non-navigated branch (C→E) also maintains straight edges because each child stays centered under its own parent.

## Alternatives considered

### Full Sugiyama framework

The classic algorithm for drawing layered DAGs with crossing minimization.

**Advantages**: Optimal edge crossing minimization, well-studied.

**Disadvantages**: Complex to implement, crossing minimization is NP-hard (requires heuristics), overkill for typical graph sizes (10-100 nodes).

Our top-down tree algorithm is essentially a simplified Sugiyama: layer assignment + barycenter positioning without crossing minimization. This produces good results for conversation trees where crossing minimization is rarely needed.

### Grid-based layout

**Advantages**: Very simple, deterministic, fast.

**Disadvantages**: Wastes vertical space, doesn't consider parent-child alignment, can create unnecessarily tall layouts.
