# Keyboard Shortcuts Reference

Canvas Chat provides keyboard shortcuts for common operations to improve efficiency.

## Global Shortcuts

These work anywhere in the application:

| Shortcut | Action | Notes |
| -------- | ------ | ----- |
| `Cmd/Ctrl + K` | Open search | Search for nodes by content |
| `Cmd/Ctrl + Z` | Undo | Undo last action |
| `Cmd/Ctrl + Shift + Z` | Redo | Redo previously undone action |
| `?` | Show help modal | Display keyboard shortcuts help |
| `Esc` | Close modal/search | Closes whatever is currently open |

**Note:** `Cmd` refers to the Command key on macOS, `Ctrl` refers to the Control key on Windows/Linux.

## Node Selection & Editing

These shortcuts work when nodes are selected or when the canvas has focus:

| Shortcut | Action | Notes |
| -------- | ------ | ----- |
| `Cmd/Ctrl + Click` | Multi-select nodes | Add/remove nodes from selection |
| `Delete` or `Backspace` | Delete selected nodes | Only when not typing in an input |
| `R` | Focus reply input | When a node is selected |
| `C` | Center view on content | Centers viewport on all nodes |
| `Arrow Up` | Navigate to parent | Shows menu if multiple parents; message if none |
| `Arrow Down` | Navigate to child | Shows menu if multiple children; message if none |

## Chat Input

These shortcuts work when the chat input field is focused:

| Shortcut | Action | Notes |
| -------- | ------ | ----- |
| `Enter` | Send message | Send current message |
| `Shift + Enter` | New line | Add line break without sending |
| `/` | Trigger slash commands | Start typing a slash command |
| `Tab` | Navigate slash menu | Cycle through command suggestions |
| `Arrow Up/Down` | Navigate slash menu | When slash command menu is visible |
| `Esc` | Close slash menu | Close command suggestions |

## Search Panel

These shortcuts work when the search panel is open (`Cmd/Ctrl + K`):

| Shortcut | Action | Notes |
| -------- | ------ | ----- |
| `Arrow Up/Down` | Navigate results | Move through search results |
| `Enter` | Select result | Jump to selected node |
| `Esc` | Close search | Close the search panel |

## Modal Dialogs

All modal dialogs support:

| Shortcut | Action | Notes |
| -------- | ------ | ----- |
| `Esc` | Close modal | Works for settings, help, etc. |
| `Enter` | Confirm action | When editing text fields |

## Navigation Popover

When navigating to a node with multiple parents or children, a selection menu appears:

| Shortcut | Action | Notes |
| -------- | ------ | ----- |
| `Arrow Up` | Select previous | Wraps from first to last |
| `Arrow Down` | Select next | Wraps from last to first |
| `Enter` | Confirm selection | Navigates to highlighted node |
| `Esc` | Close menu | Returns focus to selected node |

## Canvas Navigation

Mouse/trackpad actions on the canvas:

| Action | Result | Notes |
| ------ | ------ | ----- |
| Click + Drag canvas | Pan viewport | Move around the canvas |
| Scroll wheel | Zoom in/out | Centered on cursor position |
| Double-click canvas | Fit content | Centers and zooms to show all nodes |
| Drag node handle (⋮⋮) | Move node | Reposition individual nodes |

## Slash Commands Quick Reference

Type these in the chat input to trigger special commands:

| Command | Description | Example |
| ------- | ----------- | ------- |
| `/note` | Add note or fetch URL | `/note https://example.com` |
| `/search` | Web search via Exa | `/search quantum computing` |
| `/research` | Deep research report | `/research CRISPR applications` |
| `/factcheck` | Verify claims with web search | `/factcheck verify these` |
| `/matrix` | Create comparison table | `/matrix compare options` |
| `/committee` | Multi-LLM consultation | `/committee should we use X?` |

See [How to use web search](../how-to/web-search.md), [How to conduct deep research](../how-to/deep-research.md), [How to fact-check claims](../how-to/factcheck.md), and [How to use the LLM committee](../how-to/llm-committee.md) for details.

## Undo/Redo Actions

The following actions can be undone with `Cmd/Ctrl + Z`:

- Creating nodes (message sent, note added, etc.)
- Deleting nodes
- Moving nodes
- Editing node titles
- Creating edges (replies, branches, etc.)

**Note:** Some actions cannot be undone:

- Changing settings
- Importing/exporting sessions
- API calls already in progress

## Tips for Power Users

### Workflow: Fast node creation and reply

1. Type message, press `Enter` (creates node)
2. Press `R` immediately (focuses reply input)
3. Type reply, press `Enter`
4. Repeat from step 2

No mouse needed!

### Workflow: Multi-node operations

1. `Cmd/Ctrl + Click` to select multiple nodes
2. Type in chat input (uses all as context)
3. Or press `Delete` to remove all selected
4. `Cmd/Ctrl + Z` to undo if needed

### Workflow: Search and navigate

1. `Cmd/Ctrl + K` to open search
2. Type search query
3. `Arrow Down` to navigate results
4. `Enter` to jump to node
5. `R` to start replying

### Slash command speed

1. Type `/` to trigger autocomplete
2. Type first few letters (`/se` → shows `/search`)
3. `Tab` or `Arrow Down` to select
4. `Enter` to insert command
5. Type your query and `Enter`

## Customization

Currently, keyboard shortcuts are not customizable. If you need different bindings, please open an issue on GitHub.

## Accessibility

Canvas Chat aims to be keyboard-accessible. If you find operations that require a mouse and shouldn't, please report them as accessibility issues.

Current limitations:

- Resizing nodes requires mouse drag (no keyboard alternative)
- Some tooltips only appear on mouse hover
- Canvas panning requires mouse or trackpad (keyboard pan not implemented)

## Browser Conflicts

Some shortcuts may conflict with browser defaults:

| Shortcut | Conflict | Solution |
| -------- | -------- | -------- |
| `Cmd + K` | Browser search on some browsers | Canvas Chat captures this; use browser menu if needed |
| `Ctrl + K` | Browser search on Chrome/Edge | Same as above |
| `Cmd + Z` | Browser undo | Canvas Chat's undo takes precedence when app has focus |

If a shortcut doesn't work, check that:

1. The canvas or an input field has focus (click on it first)
2. You're not typing in a text editor where the shortcut means something else
3. No browser extension is intercepting the shortcut
