# Modal System

**Created**: 2026-03-16
**Status**: Design Phase

## Context and Design Philosophy

The Modal system provides a unified mechanism for displaying dialogs and interactive overlays throughout Canvas-Chat. Rather than scattering modal implementations across the codebase with inconsistent patterns, the ModalManager centralizes all modal lifecycle management, ensuring a consistent user experience and reducing maintenance burden.

Modal dialogs serve several distinct purposes within the application: configuration (Settings), navigation (Sessions), reference (Help), and inline editing (Content, Title, Code). Each category has different interaction patterns and lifecycle requirements. The ModalManager accommodates these variations through a combination of core modals defined in HTML and plugin-modals registered dynamically by feature plugins.

The design philosophy emphasizes simplicity and consistency. Modals are always single-instance per type, meaning only one Settings modal exists at a time. This contrasts with node-centric modals where multiple instances might conceptually exist (editing multiple nodes simultaneously), though the current implementation restricts editing to one node at a time through locking mechanisms.

## Architecture Overview

The ModalManager operates as a dependency injected into the App class, receiving a reference to the App instance for coordinating modal actions with other subsystems. It maintains two categories of modals: core modals defined statically in index.html and plugin modals registered dynamically at runtime.

Core modals include Settings, Help, Sessions, Edit Content, Edit Title, and Code Editor. These are always present in the DOM and are shown or hidden by manipulating their display style. Plugin modals are created on-demand when feature plugins call `registerModal()` during their `onLoad()` lifecycle hook.

The modal visibility state is managed through CSS display properties rather than adding or removing elements from the DOM. This approach preserves form state (such as partially filled inputs in the Settings modal) and simplifies the show/hide logic to a single property change.

## Core Modal Types

### Settings Modal

The Settings modal provides a tabbed interface for configuring application behavior. It follows a sidebar-content pattern where clicking a category in the sidebar shows the corresponding panel on the right. The sidebar categories include LLM providers, Search, Custom models, Proxy, Shortcuts, Features, and Plugins.

API keys entered in the Settings modal are stored in localStorage via the Storage module and are never sent to the backend. Instead, they are included in requests to LLM providers from the client-side, aligning with the bring-your-own-keys design principle documented in the HLD.

The Shortcuts panel within Settings deserves special attention because it supports key capture. When a user clicks "Change" on a shortcut row, the next key combination pressed is recorded and stored as an override. The ModalManager handles this capture state, filtering out modifier-only keys to prevent accidental bindings.

### Help Modal

The Help modal displays keyboard shortcuts in a table format. The shortcuts table is dynamically rendered from the current keybinding configuration, ensuring that custom keybindings are reflected accurately. The modal opens via the keyboard shortcut (default: ?) and closes via the Escape key or close button.

### Sessions Modal

The Sessions modal manages conversation history. It loads the list of saved sessions from IndexedDB via the Storage module and displays them in a scrollable list. Each session shows its name, creation date, and a delete button. Clicking a session loads it into the canvas, replacing the current session.

Sessions are stored with unique identifiers and include the full graph state serialized as JSON. The modal handles session deletion without confirmation since users can easily create new sessions, and the cost of accidental deletion is low.

### Edit Content Modal

The Edit Content modal provides a split-pane interface for modifying node content. The left pane contains editable text areas while the right pane shows a live preview of how the content will appear on the canvas. This design allows users to see formatting and structure changes in real-time.

The modal supports dynamic fields through the node protocol system. Different node types can expose different edit fields beyond just "content." For example, flashcard nodes expose both front and back fields, while standard message nodes have only a content field. The ModalManager queries the node's protocol class to determine which fields to render and how to handle the save operation.

When the modal opens, it attempts to acquire a lock on the node for multiplayer scenarios. If the node is locked by another user, the modal shows a toast notification instead of opening. The lock is released when the modal closes, whether through save, cancel, or explicit close.

Version history is maintained for edited content. Before applying changes, the current state is saved as a version with a timestamp. This enables future features around content history and rollback, though the current implementation only stores versions without a UI for browsing them.

### Edit Title Modal

The Edit Title modal is a simple single-input dialog for changing a node's title. Like the Edit Content modal, it supports locking for multiplayer and pushes an undo action when the title changes. The title field is optional; if left empty, the node's summary or truncated content is displayed instead.

### Code Editor Modal

The Code Editor modal provides syntax-highlighted editing for Python code nodes. It uses highlight.js for preview rendering and includes a split-pane layout with the code editor on the left and syntax-highlighted preview on the right.

When code is saved, the modal emits a `nodeCodeChange` event via the canvas event system rather than directly updating the node. This allows the CodeFeature plugin to handle the code change appropriately, clearing any previous execution state and potentially triggering re-execution.

## Plugin Modal Registration

Feature plugins can register their own modals through the ModalManager's registration API. This enables plugins to present complex configuration interfaces without modifying the core HTML.

The registration process follows a specific pattern. During the plugin's `onLoad()` method, it constructs an HTML template string containing the modal markup and calls `this.modalManager.registerModal(pluginId, modalId, htmlTemplate)`. The pluginId should match the plugin's identifier, and modalId should describe the specific modal within that plugin.

After registration, the modal element can be retrieved via `getPluginModal(pluginId, modalId)` for adding event listeners or manipulating its contents. The modal is shown and hidden using `showPluginModal(pluginId, modalId)` and `hidePluginModal(pluginId, modalId)`.

The registration enforces a naming convention where the modal's id attribute should follow the pattern `{pluginId}-{modalId}-modal`. If the provided HTML lacks an id attribute, the ModalManager assigns one automatically. This convention ensures consistent DOM traversal patterns throughout the codebase.

Several plugins already use this pattern. The Committee plugin registers a main modal for configuring multi-LLM consultations. The Matrix plugin registers four modals: create (new matrix), edit (matrix properties), cell (individual cell editing), and slice (row/column configuration). Flashcards registers generation and review modals. Factcheck registers a main modal for claim verification workflows.

## Event Handling

The ModalManager participates in the canvas event system through several mechanisms. It registers canvas event listeners for modal-triggering events, such as the `nodeEditCode` event that opens the code editor modal when users click edit on a code node.

Global keyboard shortcuts also route through the ModalManager. The Escape key triggers `closeAnyOpenModal()`, which checks modals in a priority order: plugin modals first (since they are most specific), then core app modals. This ordering ensures that if multiple modals are somehow open simultaneously, the most specific one closes first.

The shortcut capture feature in the Settings modal requires dedicated keyboard event handling. When capturing a new keybinding, the ModalManager intercepts keydown events and records the key combination, filtering out modifier-only presses to prevent incomplete bindings.

Modal close handlers also coordinate with the graph's locking mechanism. When closing edit modals (content or title), the ModalManager releases any node lock held by the current session, ensuring other users can edit the node afterward.

## Technical Implementation Details

The ModalManager maintains a Map data structure for plugin modals, keyed by a compound string combining pluginId and modalId. This allows O(1) lookup when showing or hiding plugin modals. Core modals are retrieved via `document.getElementById()` since they have fixed IDs in the HTML.

The edit content modal's dynamic field rendering builds DOM elements programmatically based on the protocol's `getEditFields()` method. Each field consists of a label and textarea pair. The first field with id "content" reuses the existing textarea from the HTML template to maintain any user input already entered.

Preview rendering delegates to the node protocol's `renderEditPreview()` method, which returns HTML strings. For flashcard nodes, the preview supports flip animation by updating CSS classes rather than replacing the DOM, preserving transition state during live editing.

The code editor modal uses highlight.js for syntax highlighting. When the textarea content changes, the preview updates by replacing the code element's text content and re-running highlight.js. This provides real-time syntax highlighting without the overhead of a full code editor component.

## Dependency Injection

The ModalManager receives the App instance through its constructor, enabling it to coordinate with other subsystems. It accesses the graph (for node locking and updates), canvas (for rendering and event emission), storage (for persisting settings), and feature registry (for plugin access).

This design allows the ModalManager to remain focused on modal lifecycle while delegating domain-specific operations to appropriate modules. For example, when saving edited content, the ModalManager uses the graph's `updateNode()` method to persist changes, which triggers CRDT synchronization for multiplayer scenarios.

## Open Questions & Future Decisions

### Resolved

1. Modal single-instance per type: The current design enforces one modal instance per type, simplifying state management and ensuring consistent behavior.

2. Dynamic fields for edit modal: Node protocols determine which fields to display, enabling flexibility without ModalManager knowing specific node type details.

3. Plugin modal registration timing: Registration must occur during `onLoad()` to ensure modals exist before slash commands or other triggers attempt to show them.

### Deferred

1. Modal stacking: Currently, only one modal displays at a time. Future enhancements could allow multiple modals to stack with proper z-index management.

2. Modal resize: The current modal sizes are fixed. Future iterations could support drag-to-resize for modals like the Edit Content modal where variable heights are useful.

3. Modal keyboard navigation: While Escape closes modals, full keyboard navigation (Tab through form fields, Enter to submit) could improve accessibility.

4. Version history UI: The version history stored during content edits currently has no user-facing interface. A future enhancement could display a version list allowing users to browse and restore previous content.

## References

- HLD: `/docs/high-level-design.md`
- Implementation: `src/canvas_chat/static/js/modal-manager.js`
- HTML Templates: `src/canvas_chat/static/index.html`
- Plugin Usage: `src/canvas_chat/static/js/plugins/committee.js`, `src/canvas_chat/static/js/plugins/matrix.js`
- Node Protocols: `src/canvas_chat/static/js/node-protocols.js`
- Keybindings: `src/canvas_chat/static/js/keybindings.js`
