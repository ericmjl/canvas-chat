# Keybindings System

**Created**: 2026-03-16
**Status**: Design Phase

## Context and Design Philosophy

The keybindings system exists to provide a keyboard-driven interface for Canvas-Chat, enabling power users to navigate the canvas, manage nodes, and trigger actions without reaching for the mouse. This aligns with the broader design philosophy of treating the canvas as a workspace where keyboard efficiency matters.

The system was designed with three core principles in mind. First, defaults should be sensible out of the box, with common actions mapped to intuitive keys that follow established conventions from popular applications. Second, users should be able to customize any shortcut through a settings interface, with those preferences persisted locally. Third, the system must work seamlessly across platforms, abstracting away the difference between Ctrl on Windows/Linux and Cmd on macOS so that users on either platform get a native-feeling experience.

A key architectural decision was to separate the keybinding definition from the action dispatch. The keybindings module provides pure functions that transform key events into action identifiers, while the App class contains the actual handlers that execute those actions. This separation makes the system testable and allows node types to declare their own keyboard shortcuts through the node protocol.

## Technical Details

### Default Shortcuts

The default keybindings define a comprehensive set of actions covering global operations, navigation, and node-specific behaviors. Each action is identified by a unique actionId that corresponds to a handler in the application.

| Action ID        | Keys              | Description                             |
| ---------------- | ----------------- | --------------------------------------- |
| `search`         | Ctrl+K            | Open the search panel                   |
| `popoverConfirm` | Enter             | Confirm navigation menu selection       |
| `navigateParent` | ArrowUp, j        | Navigate to parent node                 |
| `navigateChild`  | ArrowDown, k      | Navigate to child node                  |
| `help`           | ?                 | Show help modal with all shortcuts      |
| `undo`           | Ctrl+z            | Undo last action                        |
| `redo`           | Ctrl+Shift+z      | Redo previously undone action           |
| `deleteNodes`    | Delete, Backspace | Delete selected nodes                   |
| `reply`          | r                 | Focus input to reply to selected node   |
| `copy`           | c                 | Copy selected node content to clipboard |
| `edit-content`   | e                 | Edit content of selected node           |
| `edit-code`      | e                 | Edit code in selected node              |
| `fitViewport`    | f                 | Fit selected node to viewport           |
| `collapse`       | -                 | Collapse children of selected node      |
| `expand`         | =                 | Expand children of selected node        |
| `zoomSelection`  | z                 | Zoom to selected node                   |
| `zoomFitAll`     | Shift+Z           | Zoom to fit all nodes                   |
| `runCode`        | Ctrl+Enter        | Execute code in selected node           |
| `generate`       | Shift+A           | Trigger AI generation                   |
| `analyze`        | Shift+A           | Trigger AI analysis                     |
| `flip-card`      | f                 | Flip flashcard                          |
| `prev-slide`     | ArrowLeft         | Navigate to previous slide              |
| `next-slide`     | ArrowRight        | Navigate to next slide                  |

The defaults are stored in `DEFAULT_KEYBINDINGS`, a constant in `keybindings.js`. Each action maps to an array of key specs, allowing an action to have multiple default keys. For example, `navigateParent` responds to both ArrowUp and j, while `deleteNodes` responds to both Delete and Backspace.

### Key String Format

The system uses a canonical key string format for storage and lookup. Single letter keys without modifiers are stored lowercase. Modifier combinations are formatted as "Modifier+Key", where modifiers appear in alphabetical order. The format always uses "Ctrl" rather than "Meta", treating the Command key on Mac as equivalent to Ctrl for cross-platform consistency.

```text
"k"           // single letter
"Ctrl+k"      // with Ctrl
"Shift+Z"     // with Shift
"Ctrl+Shift+z // with both
"ArrowUp"    // special key
```

The `keyAndModifiersToKeyString` function in `keybindings.js` is the single source of truth for this format. It handles the conversion from KeyboardEvent properties to the canonical string representation, ensuring consistent behavior across all parts of the system.

### Override System

Users can customize any shortcut through the Settings modal. When a user remaps a key, the override is stored in localStorage under the key `canvas-chat-keybindings`. The stored format is an object where each key is an actionId and each value is a key spec object containing `key`, optional `shift` boolean, and optional `ctrl` boolean.

```javascript
// Stored in localStorage as JSON
{
  "reply": { "key": "x" },
  "undo": { "key": "u", "ctrl": true }
}
```

Only overrides are persisted; any action not present in the stored object falls back to its default. This approach keeps the stored data small while allowing full customization. Unknown actionIds in overrides are silently ignored, preventing errors from stale or malformed override data.

The `storage.js` module provides `getKeybindings()` and `setKeybindings()` methods that wrap localStorage access with JSON parsing and error handling. These methods are called by the keybindings module to retrieve user preferences.

### Effective Keybindings Merging

When the application initializes, it merges default keybindings with user overrides to produce the "effective" keybindings that are actually active. The `mergeKeybindings` function takes the defaults and overrides as parameters and returns a new object containing the merged result.

The merge strategy is straightforward: for each actionId in the defaults, copy its key specs to the result. Then, for each actionId present in overrides, replace the result's array with a single-element array containing the override spec. This means overrides completely replace the default keys rather than adding to them.

After merging, the effective keybindings are converted into a lookup map using `buildKeyToActionMap`. This map goes from key strings to actionIds, enabling fast O(1) lookup when processing keyboard events. If two actions somehow end up mapped to the same key, the last one in the iteration wins.

```javascript
// Internal flow
const defaults = DEFAULT_KEYBINDINGS;
const overrides = storage.getKeybindings();
const effective = mergeKeybindings(defaults, overrides);
const keyToActionMap = buildKeyToActionMap(effective);
```

The `getEffectiveKeybindings` function encapsulates this flow, accepting an optional custom overrides getter for testing purposes. By default, it calls `storage.getKeybindings()` to retrieve the user's overrides.

### Cross-Platform Handling

Cross-platform support is critical for a web application that may be used on Windows, Linux, or macOS. The keybindings system handles this through normalization at two points: event capture and display.

When a keyboard event arrives, the `eventToKeyString` function normalizes it by treating `metaKey` (the Command key on Mac) as equivalent to `ctrlKey`. This means a user pressing Cmd+K on Mac produces the same key string as a user pressing Ctrl+K on Windows. Users can bind their preferred platform's key, and it will work on both.

```javascript
// In eventToKeyString
const ctrl = !!(e.ctrlKey || e.metaKey);
return keyAndModifiersToKeyString(e.key, !!e.shiftKey, ctrl);
```

For display purposes, the `formatKeyForDisplay` function detects the platform using `navigator.platform` and transforms key strings for presentation. On Mac, it replaces "Ctrl+" with the Cmd symbol (⌘), showing users their native key notation.

```javascript
// On Mac: "Ctrl+k" becomes "⌘k"
// On Windows: "Ctrl+k" stays "Ctrl+k"
```

This normalization happens only in the display layer; internally, all key strings consistently use "Ctrl" regardless of platform.

### Event Flow

When the user presses a key, the following sequence occurs in the App class:

1. The document-level `keydown` listener fires with the KeyboardEvent.
2. If the Settings modal is in "shortcut capture" mode, it handles the event specially.
3. If the user is typing in an input field (textarea or input), keyboard shortcuts are disabled to avoid interfering with typing.
4. Escape is always handled first as a special case, since it should never be remappable.
5. The event is converted to a key string using `eventToKeyString`.
6. The key string is looked up in the `keyToActionMap` to get an actionId.
7. The actionId is dispatched to the appropriate handler in App.

```javascript
// Simplified flow from app.js
document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;

    const effective = getEffectiveKeybindings();
    const keyToActionMap = buildKeyToActionMap(effective);
    const actionId = getActionForKey(e, keyToActionMap);

    if (actionId === 'search') this.openSearch();
    if (actionId === 'undo') this.undo();
    // ... other actions
});
```

### Node-Specific Shortcuts

Beyond global shortcuts, individual node types can declare their own keyboard shortcuts through the node protocol. The `getKeyboardShortcuts()` method on node protocols returns an array of shortcuts specific to that node type. When a node is selected, these shortcuts are merged with the global keybindings to produce the complete set of active shortcuts.

For example, code nodes support `runCode` (Ctrl+Enter) and `edit-code` (e), while flashcard nodes support `flip-card` (f). This allows the same key to have different meanings depending on context, with the selected node's shortcuts taking precedence.

## Open Questions & Future Decisions

### Resolved

1. ✅ Cross-platform handling - Meta (Cmd) normalized to Ctrl
2. ✅ Override system - localStorage with merge logic

### Deferred

1. Multiple override keys - add vs replace
2. Conflict detection in Settings UI
3. Import/export keybinding configurations
4. Per-session override profiles

## References to HLD

This document describes the implementation of keyboard shortcut functionality as outlined in the High-Level Design. The keybindings system supports the design principle that users should be able to navigate and interact with the canvas efficiently using keyboard shortcuts.

The HLD establishes that Canvas-Chat is a local-first application where all data stays in the browser. Keybinding overrides are stored in localStorage alongside other user preferences like API keys and model selections, consistent with the dual storage strategy (localStorage for settings, IndexedDB for session data).

The plugin architecture described in the HLD influences how node-specific shortcuts work. Node types declare their keyboard capabilities through the node protocol, allowing the core system to remain unaware of specific node types while still supporting their interaction needs.

## Implementation Reference

| File                                          | Purpose                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| `src/canvas_chat/static/js/keybindings.js`    | Core keybindings module with defaults, merging, and lookup |
| `src/canvas_chat/static/js/storage.js`        | localStorage wrapper for keybinding overrides              |
| `src/canvas_chat/static/js/app.js`            | Event handling and action dispatch                         |
| `src/canvas_chat/static/js/node-protocols.js` | Node protocol for declaring node-specific shortcuts        |
| `tests/test_keybindings.js`                   | Unit tests for keybindings module                          |
