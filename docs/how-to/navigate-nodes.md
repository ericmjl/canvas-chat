# How to navigate between connected nodes

Canvas Chat allows you to quickly move between parent and child nodes
using keyboard shortcuts or navigation buttons.

## Using keyboard shortcuts

When a node is selected:

1. Press **Arrow Up** to navigate to a parent node
2. Press **Arrow Down** to navigate to a child node

### Single connection

If there's only one parent or child, you'll navigate directly to that node.

### Multiple connections

If there are multiple parents or children, a selection menu appears:

1. Use **Arrow Up/Down** to highlight different options
2. Press **Enter** to navigate to the highlighted node
3. Press **Esc** to close the menu without navigating

### No connections

If the node has no parents (root node) or no children (leaf node),
a brief message appears indicating there are no nodes to navigate to.

## Using navigation buttons

You can also use the mouse:

1. Hover over a node to reveal the navigation buttons (↑ ↓) in the header
2. Click **↑** to go to parent(s) or **↓** to go to child(ren)
3. If multiple connections exist, click an option from the menu

## Graph context breadcrumb

When **exactly one** node is selected, a **single-row breadcrumb** appears **below the toolbar**:

`[ parent context ] › [ current node ] › [ child context ]`

- **Current node** (center): type icon, type label, and truncated title—shows what you are focused on; not clickable.
- **One parent or one child**: that neighbor appears as a **button** with the same icon, type, and summary style as the navigation popover. **Click** to go there (same as ↑/↓ with a single target). **Hover** briefly to see a text tooltip and a **gold highlight** on that node on the canvas (preview before you navigate).
- **Several parents or children**: a **Parents (N)** or **Children (N)** button opens the **same list menu** as the header ↑/↓. Hovering a row in that menu also shows the tooltip and canvas highlight.
- If there are **no** parents (or no children), that side of the breadcrumb is **omitted** (no empty labels).

Neighbor lists use the same **navigable** parent/child logic as the header (↑/↓), including visibility and collapsed-node behavior.

For **keyboard** traversal, use **Arrow Up** / **Arrow Down** (or **j** / **k**) as in the rest of the app; the breadcrumb does not add separate shortcuts.

## Tips

- **Quick traversal**: Press Arrow Down repeatedly to walk down a conversation thread
- **Backtracking**: Press Arrow Up to go back up the conversation tree
- **Works with selection**: After navigating, press `R` to reply to the new node

## See also

- [Keyboard shortcuts reference](../reference/keyboard-shortcuts.md)
