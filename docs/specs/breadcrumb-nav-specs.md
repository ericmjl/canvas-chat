# Breadcrumb navigation — EARS specifications

**Feature prefix:** `NAV` (navigation UI / hover preview for graph context bar)

## Layout visibility

- [x] **NAV-UI-001**: While exactly one node is selected, the system shall display a breadcrumb bar below the toolbar.
- [x] **NAV-UI-002**: While no node or multiple nodes are selected, the system shall hide the breadcrumb bar.
- [x] **NAV-UI-003**: The breadcrumb shall display up to three parts: parent segment, current node segment, and child segment, separated by chevron characters between visible parts.
- [x] **NAV-UI-004**: When the selected node has 0 navigable parents, the system shall omit the parent segment and any leading chevron before the current node segment.
- [x] **NAV-UI-005**: When the selected node has 0 navigable children, the system shall omit the child segment and any trailing chevron after the current node segment.
- [x] **NAV-UI-006**: The current node segment shall display the node’s type icon, type label, and truncated title, and shall not be interactive for navigation.

## Single neighbor

- [x] **NAV-UI-010**: When a direction has exactly 1 navigable neighbor, the segment shall display that neighbor’s type icon, type label, and truncated summary text.
- [x] **NAV-UI-011**: When the user activates a single-neighbor segment, the system shall navigate to that neighbor (select and center as for existing navigation).

## Multiple neighbors

- [x] **NAV-UI-020**: When a direction has 2 or more navigable neighbors, the segment shall display a label of the form `Parents (N)` or `Children (N)` where N is the count.
- [x] **NAV-UI-021**: When the user activates a multi-neighbor segment, the system shall open the navigation popover anchored to that segment, listing each neighbor with icon, type label, and truncated summary.
- [x] **NAV-UI-022**: When the user activates an item in that popover, the system shall navigate to that neighbor and close the popover.

## Hover preview

- [x] **NAV-HOVER-001**: When the user hovers a single-neighbor segment or a navigation popover item, the system shall highlight the corresponding node on the canvas with a distinct border or glow.
- [x] **NAV-HOVER-002**: When the user stops hovering that segment or item, the system shall remove that canvas highlight.
- [x] **NAV-HOVER-003**: When the user hovers a single-neighbor segment or a navigation popover item for at least 200 ms, the system shall display a tooltip near the hover target with approximately the first 120 characters of preview text for that node.
- [x] **NAV-HOVER-004**: When the user stops hovering, the system shall hide the tooltip.

## Code locations

- Breadcrumb render and interaction: `src/canvas_chat/static/js/app.js` (`refreshRelationshipPanel`, `setupRelationshipPanel`).
- Popover and highlight: `src/canvas_chat/static/js/canvas.js` (`showNavPopover`, `hideNavPopover`, `highlightNode`, `clearHighlight`).
