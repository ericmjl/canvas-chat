# Canvas zoom reference

## Scale limits

Canvas scale is clamped between **0.1** and **3.0** (see CANV-REQ-003).

## Ctrl+scroll and trackpad pinch

With **Ctrl** (Windows/Linux) or **Cmd** (macOS) held, the mouse wheel or trackpad pinch adjusts zoom. The focal point stays under the pointer (cursor-anchored zoom).

Wheel events use **normalized deltas** (`deltaMode` line/page converted to pixel-equivalent) so mouse wheels and trackpads feel consistent. High-frequency wheel input is **coalesced** to at most one zoom update per animation frame.

## Settings

**Settings → Canvas → Zoom sensitivity** (0–100, default 50) scales the zoom step size. **50** matches the step strength that used to be the **right end** of the slider (5.0× on the internal multiplier); **0** is **0.2×**; **100** is **10.0×** (extra headroom). Changing the slider applies **immediately** and is persisted; you do not need to press **Save Settings** for this control.

Stored in **localStorage** as `canvas-chat-zoom-wheel-sensitivity`.

## Semantic zoom (display modes)

CSS classes on the canvas container (`zoom-full`, `zoom-summary`, `zoom-mini`) control how much node content is shown. **Nominal** scale bands:

| Band      | Nominal scale | Class (typical) |
| --------- | ------------- | --------------- |
| Full      | > 0.6         | `zoom-full`     |
| Summary   | 0.35 – 0.6    | `zoom-summary`  |
| Mini      | ≤ 0.35        | `zoom-mini`     |

To reduce flicker when zoom oscillates near a boundary, the implementation uses **hysteresis** (see CANV-REQ-004): full ↔ summary uses **0.58** (enter summary when zooming out) and **0.62** (return to full when zooming in); summary ↔ mini uses **0.33** and **0.37**.

Node **drag** affordances (handle vs drag anywhere) are based on **numeric `scale`** in code, not on the hysteresis band.

## Related

- [Keyboard shortcuts](keyboard-shortcuts.md) (navigation and zoom shortcuts such as `z`, `Shift+Z`)
- [CANV-REQ-003 / CANV-REQ-004](../specs/core-specs.md) in core specs
