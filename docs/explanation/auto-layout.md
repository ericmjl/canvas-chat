# Auto-layout algorithm

This document explains the design decision for automatically arranging nodes on the canvas.

## Context

Canvas Chat represents conversations as a directed acyclic graph (DAG) where nodes are messages and edges represent reply relationships. As conversations grow and branch, manual positioning becomes tedious. Users need a way to quickly organize their canvas while preserving the logical structure of the conversation.

## Decision

We use a **topological sort + greedy placement** algorithm that:

1. Processes nodes in dependency order (parents before children)
2. Assigns horizontal layers based on depth from root nodes
3. Places nodes vertically using a greedy search for non-overlapping positions

## Algorithm overview

### Step 1: Topological sort (Kahn's algorithm)

We first sort all nodes so that parent nodes come before their children. This ensures that when we position a child node, all of its parents have already been placed.

```text
Initialize in-degree count for each node
Queue = nodes with in-degree 0 (root nodes)
While queue is not empty:
    Pop node from queue
    Add to result
    For each child of node:
        Decrement child's in-degree
        If in-degree becomes 0, add child to queue
```

Nodes at the same level are sorted by creation time for consistent ordering across layout runs.

### Step 2: Layer assignment

Each node is assigned a horizontal layer based on its depth from the roots:

- Root nodes (no parents) are assigned layer 0
- All other nodes are assigned `max(parent layers) + 1`

This ensures parents are always positioned to the left of their children, making the conversation flow visually clear (left-to-right progression).

### Step 3: Greedy Y-position placement

For each node in topological order:

1. **Calculate X position**: `START_X + layer * (NODE_WIDTH + HORIZONTAL_GAP)`
2. **Calculate ideal Y position**: Average Y of parent nodes (or `START_Y` for roots)
3. **Search for non-overlapping position**: Try the ideal Y first, then search alternating offsets up and down until a clear spot is found
4. **Fallback**: If no position found within search range, place below all existing nodes

The overlap check uses axis-aligned bounding box (AABB) collision detection with padding to ensure visual spacing.

## Alternatives considered

### Force-directed layout

Use physics simulation where nodes repel each other and edges act as springs.

**Advantages:**

- Produces aesthetically pleasing, organic layouts
- Handles complex graph structures well
- Self-organizing

**Disadvantages:**

- Computationally expensive for large graphs
- Non-deterministic (different results each run)
- Requires iterative simulation (slower)
- May not preserve left-to-right conversation flow

### Sugiyama/hierarchical layout

The classic algorithm for drawing layered DAGs with crossing minimization.

**Advantages:**

- Optimal edge crossing minimization
- Well-studied algorithm with proven results
- Produces very clean hierarchical layouts

**Disadvantages:**

- Complex to implement correctly
- Crossing minimization is NP-hard (requires heuristics)
- Overkill for our typical graph sizes (10-100 nodes)
- Heavy library dependency for full implementation

### Grid-based layout

Snap nodes to a grid based on layer and creation order.

**Advantages:**

- Very simple to implement
- Deterministic and fast
- Clean, regular appearance

**Disadvantages:**

- Wastes vertical space when branches have different depths
- Doesn't consider parent-child Y alignment
- Can create unnecessarily tall layouts

## Why topological + greedy

This approach provides the best balance for our use case:

1. **Simple implementation** - ~100 lines of straightforward code, no external dependencies
2. **Deterministic** - Same graph always produces the same layout
3. **Fast** - O(n + e) for topological sort, O(n^2) worst case for placement (acceptable for <1000 nodes)
4. **Conversation-aware** - Left-to-right flow matches natural reading order; children align vertically with parents
5. **Incremental-friendly** - Could be extended to only reposition new nodes while keeping existing positions

## Implementation notes

Key constants in `graph.js`:

```javascript
const NODE_WIDTH = 360;      // Assumed node width for spacing
const NODE_HEIGHT = 220;     // Assumed node height for spacing
const HORIZONTAL_GAP = 120;  // Gap between layers
const VERTICAL_GAP = 40;     // Minimum gap between nodes vertically
const START_X = 100;         // Left margin
const START_Y = 100;         // Top margin
```

The algorithm searches up to 20 offsets in each direction (40 total positions) before falling back to placing at the bottom. This covers most practical cases while keeping the search bounded.

## Future improvements

Potential enhancements if needed:

- **Partial layout**: Only reposition newly added nodes, keeping user-adjusted positions
- **Compaction**: After initial placement, shift nodes up to minimize total height
- **Crossing reduction**: Simple heuristic to swap same-layer nodes to reduce edge crossings
- **Animation**: Smooth transition from old positions to new positions
