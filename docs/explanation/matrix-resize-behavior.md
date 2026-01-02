# Matrix Node Resize Behavior

This document explains the design decisions behind how matrix nodes resize and how cell content dynamically truncates.

## The Problem

Matrix nodes contain a table with rows and columns of content. When users resize the node, we need sensible behavior for how the table and its content adapt to the new size.

### What We Don't Want

1. **Fixed truncation** - Showing the same number of lines regardless of available space wastes space when large and clips content when small.

2. **Scrolling within the table** - This hides rows entirely, making it hard to see the full matrix structure at a glance.

3. **Rows getting cut off** - When the node shrinks, having bottom rows disappear entirely loses important information.

### What We Do Want

**All rows should always remain visible, but cell content should dynamically truncate/fade based on available space per row.**

This means:

- When you make the node taller, each row gets more height and shows more content
- When you make the node shorter, each row gets less height and content fades out
- You always see the full matrix structure (all rows and columns)
- Content gracefully degrades with a fade effect indicating "there's more"

## The Solution

### Why This Is Hard

HTML tables don't naturally support this behavior. Tables size based on their content - they grow to fit text, not shrink to fit a container. Making a table respect a fixed height while distributing that height equally among rows requires breaking out of normal table layout.

### The CSS Approach

We use **flexbox on table elements** to override normal table sizing:

```css
.matrix-table {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;  /* Critical: allows shrinking below content size */
}

.matrix-table tbody {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.matrix-table tbody tr {
    display: flex;
    flex: 1;        /* Each row gets equal share of space */
    min-height: 0;
}

.matrix-table th,
.matrix-table td {
    flex: 1;        /* Columns share width equally */
    min-height: 0;
    overflow: hidden;
}
```

Key points:

1. **`display: flex` on table/tbody/tr** - Overrides table layout algorithm
2. **`flex: 1` on rows** - Distributes available height equally among all rows
3. **`min-height: 0`** - This is critical! Flex items default to `min-height: auto` which prevents shrinking below content size. Setting it to 0 allows rows to shrink.
4. **`overflow: hidden`** - Clips content that doesn't fit

### Cell Content Fade Effect

To indicate truncation gracefully, cell content uses a gradient fade:

```css
.matrix-cell-content {
    height: 100%;           /* Fill the cell */
    overflow: hidden;       /* Clip overflow */
    position: relative;     /* For the pseudo-element */
}

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

This creates a white gradient at the bottom of each cell, visually indicating "there's more content below" rather than having text abruptly cut off.

### JavaScript Considerations

Matrix nodes also need special handling during resize:

1. **No auto-height adjustment** - When resizing width only (dragging the right handle), non-matrix nodes auto-adjust height based on content. Matrix nodes skip this to preserve explicit height.

2. **Fixed height mode** - Matrix node divs use `height: 100%` instead of `min-height: 100%`, forcing them to respect the wrapper's dimensions rather than expanding to content.

```javascript
if (isMatrix) {
    div.style.height = '100%';
    div.style.overflow = 'hidden';
} else {
    div.style.minHeight = '100%';
}
```

## Container Hierarchy

The full hierarchy for height to flow correctly:

```text
foreignObject (wrapper) - explicit width/height from resize
└── .node.matrix - height: 100%
    └── .node-header - fixed height
    └── .node-content - flex: 1 (fills remaining)
        └── .matrix-table-container - flex: 1
            └── .matrix-table - flex column
                └── thead - flex-shrink: 0 (keeps natural height)
                └── tbody - flex: 1 (fills remaining)
                    └── tr - flex: 1 (equal distribution)
                        └── td - flex: 1, overflow: hidden
                            └── .matrix-cell-content - height: 100%
```

Each level must have:

- Explicit height or `flex: 1` to fill parent
- `min-height: 0` to allow shrinking
- `overflow: hidden` to clip content

## Testing Resize Behavior

To verify the behavior works correctly:

1. Create a matrix node with several rows of content
2. Drag the **bottom handle up** - all rows should remain visible but show less content each, with fade effect
3. Drag the **bottom handle down** - rows expand and show more content
4. Drag the **right handle** - width changes but height stays fixed (for matrix nodes)
5. Drag the **corner handle** - both dimensions change, content adapts

## Summary

The key insight is using flexbox to override table layout, combined with `min-height: 0` to allow shrinking and `flex: 1` for equal distribution. The fade effect provides a graceful visual indicator of truncation.
