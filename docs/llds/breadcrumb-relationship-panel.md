# Breadcrumb relationship panel (LLD)

**Created:** 2026-03-22
**Status:** Design
**Supersedes:** Two-row mini relationship strip (`Parents` / `Children` chip rows)

## Context

When exactly one node is selected, the app shows a bar below the toolbar that situates the user in the reply graph: what lies upstream (parents), the current node, and what lies downstream (children). This document specifies layout, interaction, and component boundaries. Implementation status is tracked in [breadcrumb-nav-specs.md](../specs/breadcrumb-nav-specs.md).

## Visual layout

Single horizontal row:

```text
[ parent segment ]  >  [ current node ]  >  [ child segment ]
```

Chevrons (`>`) appear only between visible segments. Omitted directions do not leave a gap.

## Segment rules

| Parents count | Segment |
|---------------|---------|
| 0 | Omit segment; no leading chevron before current. |
| 1 | Inline: icon + type label + truncated summary; click navigates. |
| 2+ | Label `Parents (N)`; click opens nav popover anchored to the segment. |

| Children count | Segment |
|----------------|---------|
| 0 | Omit segment; no trailing chevron after current. |
| 1 | Inline: icon + type label + truncated summary; click navigates. |
| 2+ | Label `Children (N)`; click opens nav popover anchored to the segment. |

**Current node** (center): always shown when one node is selected. Icon + type label + truncated title. Not clickable.

## Hover preview

Applies to:

- Inline single-neighbor breadcrumb segments.
- Items in the navigation popover (same list as header ↑/↓ when multiple neighbors).

Behavior:

1. **Canvas highlight:** On `mouseenter`, add a temporary highlight class to the target node’s DOM wrapper. On `mouseleave`, remove it.
2. **Tooltip:** After a dwell of approximately 200 ms, show a floating tooltip near the pointer/anchor with roughly the first 120 characters of preview text (summary/title-derived). Clear on `mouseleave`.

Multi-neighbor count segments do not preview a specific node until the user opens the popover; then popover items behave as above.

## Popover reuse

`Canvas.showNavPopover(direction, nodes, position)` builds the same list as today. It is positioned from the breadcrumb segment’s bounding rect when opened from the breadcrumb. Hover preview (highlight + tooltip) is wired for popover list items via canvas events consumed by `App`.

## Component responsibilities

| Area | Responsibility |
|------|------------------|
| `app.js` | Build breadcrumb DOM; delegated click/hover; tooltip element lifecycle; call `handleNodeNavigate` / `handleNavButtonClick`. |
| `canvas.js` | `highlightNode` / `clearHighlight`; extend `showNavPopover` item hover to highlight + emit preview events; `hideNavPopover` clears highlight and notifies preview teardown. |
| `toolbar.css` | Breadcrumb layout and segment styles. |
| `nodes.css` | `.node.preview-highlight` style. |
| `base.css` | `--relationship-panel-height` / size for a single compact row. |

## References

- [High-level design: section 13](../high-level-design.md)
- [EARS: breadcrumb-nav-specs.md](../specs/breadcrumb-nav-specs.md)
