# Node Protocol Pattern

## Problem

Node-type-specific behaviors were scattered throughout the codebase with `if (node.type === ...)` and `if (node.imageData)` checks in multiple places:

- `canvas.js`: `renderNode()`, `setupNodeEvents()`, `getNodeTypeLabel()`, `getNodeTypeIcon()`, `getNodeSummaryText()`
- `app.js`: `copyNodeContent()`

This made it difficult to:

1. **Add new node types** - Required updating multiple files with scattered conditionals
2. **Understand node behavior** - Logic for a single node type was spread across the codebase
3. **Maintain consistency** - Easy to miss a check when adding features

## Solution

Implemented sklearn-style protocol classes where each node type defines its behaviors in a single class. This centralizes all node-type-specific logic in `node-protocols.js`.

## Protocol Interface

Every node wrapper class implements core methods, with optional methods for advanced customization:

### `getTypeLabel()` returns string

Returns the display label for the node type (e.g., "You", "AI", "Note", "Matrix").

### `getTypeIcon()` returns string

Returns the emoji icon for the node type (e.g., "💬", "🤖", "📊").

### `getSummaryText(canvas)` returns string

Returns text shown when zoomed out (semantic zoom). Priority: user-set title > LLM summary > generated fallback.

### `renderContent(canvas)` returns string

Returns HTML content for the node body. For most nodes, this renders markdown. Matrix nodes return the full HTML structure including header and actions.

### `getActions()` returns Array<{id, label, title}>

Returns action buttons for the node action bar (e.g., Reply, Summarize, Copy, Edit).

### `getHeaderButtons()` returns Array<{id, label, title, hidden?}>

Returns header buttons (e.g., Stop, Continue, Reset Size, Fit Viewport, Delete). Some buttons can be hidden by default (e.g., Stop/Continue for streaming nodes).

### `copyToClipboard(canvas, app)` returns `Promise<void>`

Handles copying node content to clipboard. For text nodes, copies text. For image nodes, copies image. For matrix nodes, formats as markdown table.

### `isScrollable()` returns boolean

Whether this node type has fixed scrollable dimensions (nodes with long streaming content).

### `getEditFields()` returns Array of EditField objects

Defines custom edit fields for the edit content modal. Plugins can override this to provide multiple fields (e.g., question and answer for flashcards). Default returns a single `content` field.

**EditField structure:**

```javascript
{
    id: string,           // Unique field identifier
    label: string,        // Display label
    value: string,        // Initial value from node
    placeholder: string   // Placeholder text
}
```

### `handleEditSave(fields, app)` returns Object

Handles saving edited fields. Plugins can override this to customize save behavior (e.g., save multiple fields). Default saves the `content` field. Returns an object to pass to `graph.updateNode()`.

### `renderEditPreview(fields, canvas)` returns string

Renders preview HTML for the edit modal. Plugins can override this to show custom preview (e.g., flashcard format). Default renders markdown preview of the `content` field.

### `getEditModalTitle()` returns string

Returns modal title for edit dialog. Plugins can override this to customize the title. Default returns "Edit Content".

## Edit Modal Integration

The edit modal system is fully plugin-driven. When a node includes `Actions.EDIT_CONTENT` in its `getActions()`, the modal manager:

1. Calls `getEditFields()` to get field definitions
2. Dynamically renders textareas for each field
3. Calls `renderEditPreview()` for live preview updates
4. Calls `handleEditSave()` when saving
5. Uses `getEditModalTitle()` for the modal title

This allows plugins to fully control their editing experience without any hardcoded logic in the core system. See the [Flashcard Node](../../src/canvas_chat/static/js/flashcard-node.js) for a complete example of multi-field editing.

## Implementation

### BaseNode Class

All node classes extend `BaseNode`, which provides default implementations for all methods. Node-specific classes override only the methods that differ from defaults.

**Core methods** (required for all nodes):

- `getTypeLabel()`, `getTypeIcon()`, `renderContent()`, `getActions()`, `getHeaderButtons()`, `isScrollable()`

**Optional methods** (with sensible defaults):

- `getSummaryText()`, `copyToClipboard()`, `supportsStopContinue()`, `getContentClasses()`, `getEventBindings()`

**Edit modal methods** (for custom editing):

- `getEditFields()`, `handleEditSave()`, `renderEditPreview()`, `getEditModalTitle()`

### Node Classes

17 node-specific classes:

- `HumanNode` - User messages
- `AINode` - AI responses (includes Stop/Continue buttons)
- `NoteNode` - User-created notes (includes Edit action)
- `SummaryNode` - LLM-generated summaries
- `ReferenceNode` - Links to external content (includes Fetch & Summarize action)
- `SearchNode` - Web search queries
- `ResearchNode` - Deep research with multiple sources
- `HighlightNode` - Excerpted text or images from other nodes
- `MatrixNode` - Cross-product evaluation tables (custom rendering)
- `CellNode` - Pinned cells from matrices (can have contextual titles)
- `RowNode` - Extracted rows from matrices
- `ColumnNode` - Extracted columns from matrices
- `FetchResultNode` - Fetched content from URLs (includes Edit and Summarize actions)
- `PdfNode` - Imported PDF documents
- `OpinionNode` - Committee member opinions (includes Stop/Continue buttons)
- `SynthesisNode` - Chairman's synthesized answers (includes Stop/Continue buttons)
- `ReviewNode` - Committee member reviews (includes Stop/Continue buttons)
- `ImageNode` - Uploaded images for analysis
- `CsvNode` - CSV data with metadata
- `FlashcardNode` - Spaced repetition cards with question/answer (demonstrates multi-field editing)
- `FactcheckNode` - Claim verification with accordion UI

### Factory Function

`wrapNode(node)` dispatches to the correct protocol class:

1. Checks `node.imageData` first (for IMAGE nodes or HIGHLIGHT nodes with images)
2. Dispatches by `node.type` using a class map
3. Falls back to `BaseNode` for unknown types

### Usage in Canvas

`canvas.js` uses the protocol in `renderNode()`:

```javascript
const wrapped = wrapNode(node);
const summaryText = wrapped.getSummaryText(this);
const typeIcon = wrapped.getTypeIcon();
const contentHtml = wrapped.renderContent(this);
const actions = wrapped.getActions();
const headerButtons = wrapped.getHeaderButtons();
```

### Usage in App

`app.js` uses the protocol in `copyNodeContent()`:

```javascript
const wrapped = wrapNode(node);
await wrapped.copyToClipboard(this.canvas, this);
```

## Adding a New Node Type

To add a new node type:

1. **Add node type constant** in `graph.js`:

   ```javascript
   const NodeType = {
       // ... existing types
       NEW_TYPE: 'new_type'
   };
   ```

2. **Create protocol class** in `node-protocols.js`:

   ```javascript
   class NewTypeNode extends BaseNode {
       getTypeLabel() { return 'New Type'; }
       getTypeIcon() { return '🔷'; }

       // Override other methods as needed
       getActions() {
           return [Actions.REPLY, Actions.COPY];
       }
   }
   ```

3. **Add to factory** in `wrapNode()`:

   ```javascript
   const classMap = {
       // ... existing mappings
       [NodeType.NEW_TYPE]: NewTypeNode
   };
   ```

That's it! The protocol pattern handles rendering, actions, copying, and all other behaviors automatically.

## Design Decisions

### Flat Inheritance

All classes extend `BaseNode` directly (no deep hierarchy). This keeps the structure simple and makes it easy to understand what each node type does.

### Actions as Objects

`getActions()` returns `[{id, label, title}]` arrays for self-contained rendering. This makes it easy to add new actions without modifying rendering code.

### imageData Precedence

`wrapNode()` checks `node.imageData` first, regardless of `node.type`. This ensures IMAGE nodes and HIGHLIGHT nodes with images are handled correctly.

### CellNode.getTypeLabel()

Returns `node.title` if present, else 'Cell'. This supports contextual labels like "GPT-4 × Accuracy" for pinned matrix cells.

### Error Handling

Kept as state overlay (not a node class). Errors are transient states that can appear on any node type, so they don't need their own protocol class.

### Matrix Node Special Case

Matrix nodes return full HTML structure from `renderContent()` (including header and actions) because they have a complex custom layout. Other nodes return only the content body.

## Alternatives Considered

### Multiple Dispatch

Could have used a dispatch table with `(nodeType, methodName)` keys. Rejected because:

- Less object-oriented
- Harder to see all behaviors for a node type in one place
- More verbose

### Dispatch Objects

Could have used plain objects with methods instead of classes. Rejected because:

- Classes provide better inheritance
- Easier to validate protocol compliance
- More familiar pattern for JavaScript developers

### TypeScript Interfaces

Could have used TypeScript interfaces for protocol enforcement. Rejected because:

- Codebase is vanilla JavaScript
- Runtime validation with `validateNodeProtocol()` provides similar benefits
- No build step required

## Benefits

- **Single source of truth** - All node behavior in one file
- **Easy to extend** - Add new node types in 3 steps
- **Type safety** - Protocol compliance validated by tests
- **Maintainability** - Clear separation of concerns
- **Testability** - Each protocol class can be tested independently
