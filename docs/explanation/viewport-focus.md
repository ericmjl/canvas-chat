# Viewport focus when creating nodes

This document explains why viewport focus is **explicit** (callers request focus when they want it) rather than **reactive** (e.g. "on every nodeAdded, pan to the new node"). Do not revert to a reactive/flag-based design without re-reading this rationale.

## Rule

**Viewport focus is always explicit.** Adding nodes does not move the viewport unless the caller explicitly requests focus (via `addUserNode`, `panToNodeAnimated`, or `zoomToSelectionAnimated`).

## Why we don't "always pan on nodeAdded"

A reactive rule like "whenever a node is added, pan to it" would be simple and centralized, but it cannot apply to all adds. We must not pan in these cases:

1. **Undo/redo** — `executeUndo` and `executeRedo` call `graph.addNode(node)` to restore state. Panning would move the viewport every time the user undoes or redoes; that would be wrong.

2. **Session load** — Loading a session adds many nodes at once. Panning to each would cause a storm of viewport moves and bad UX.

3. **Batch creation** — Features like committee add several nodes in sequence (human, opinion1, opinion2, …, synthesis). If we pan on every `nodeAdded`, we get one pan per node (N+1 pans), then the feature often does its own final zoom-to-fit. That was the original problem: noisy, redundant viewport movement.

So the reactive rule cannot be "always pan." It would have to be "pan only when this add is a user/plugin-initiated creation we want to focus." That in turn requires a way to distinguish "this add should trigger pan" from "this add should not."

## Why we don't use a flag or wrapper for that

We previously had a global flag `_userNodeCreation` and a plugin wrapper that set it before every `graph.addNode`. That led to:

- **Plugins:** Every plugin `addNode` set the flag, so every new node triggered a pan. Batch creators (e.g. committee) got one zoom per node plus their own final zoom.
- **One boolean can't express "batch" vs "single."** So we'd need extra machinery (batch API, "only first node," etc.) and special cases.

We removed the flag and wrapper so that viewport behavior is predictable: no hidden side effects, no difference between core and plugins.

## Why explicit focus at the call site

- **Single rule:** Creation does not imply focus. When you want the view to move, you call the focus API. Same rule for core and plugins.
- **No global state:** No flag, no wrapper. Call sites that want focus add one line; call sites that don't (undo, load, batch middle steps) don't.
- **Traceable:** When you see `graph.addNode(node); this.canvas.panToNodeAnimated(node.id);` you know exactly what happens. When pan is in a listener elsewhere, the side effect is hidden.
- **Scales to batches:** Committee (and similar features) add several nodes then call `zoomToSelectionAnimated(committeeNodeIds)` once. No per-node pan storm.

## Summary

Do **not** reintroduce:

- Pan/zoom inside the `nodeAdded` handler (unless we also introduce a reliable way to suppress it for undo, load, and batch middle steps).
- A global flag or plugin wrapper that makes "every add" trigger pan.

Do keep:

- `nodeAdded`: only render and update empty state.
- `addUserNode(node)`: add then `zoomToSelectionAnimated([node.id], 0.8, 300)` for core single-node flows.
- Plugins: call `panToNodeAnimated(nodeId)` or `zoomToSelectionAnimated(nodeIds)` after adding when they want the new node(s) in view.

See also: [Viewport focus (reference)](../reference/auto-zoom.md), AGENTS.md § Design standards → Viewport focus.
