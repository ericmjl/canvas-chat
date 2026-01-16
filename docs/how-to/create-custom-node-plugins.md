# How to Create Custom Node Types with Plugins

This guide shows you how to extend Canvas-Chat with custom node types using the plugin system.

**For complete plugin development including feature plugins and backend handlers, see [How to Create Plugins](./create-feature-plugins.md).**

## Overview

Canvas-Chat's plugin system allows you to create custom node types with:

- Custom rendering (HTML/CSS)
- Custom actions (buttons in the node toolbar)
- Custom event handlers (click, hover, etc.)
- Custom edit modals (single or multiple fields)
- Automatic registration and loading

Plugins are JavaScript ES modules that import from Canvas-Chat's core APIs.

## Prerequisites

- Canvas-Chat with a `config.yaml` file
- Basic knowledge of JavaScript and HTML/CSS

Note: Plugins work with or without `--admin-mode`. Use whichever mode fits your deployment.

## Step 1: Create a Plugin File

Create a new JavaScript file for your plugin (e.g., `my-custom-node.js`):

```javascript
/**
 * Custom Node Plugin Example
 */

import { BaseNode, Actions } from '/static/js/node-protocols.js';
import { NodeRegistry } from '/static/js/node-registry.js';

class MyCustomNode extends BaseNode {
    /**
     * Display label shown in node header
     */
    getTypeLabel() {
        return 'My Custom Node';
    }

    /**
     * Emoji icon for the node type
     */
    getTypeIcon() {
        return '🎯';
    }

    /**
     * Render the HTML content for the node
     */
    renderContent(canvas) {
        const content = this.node.content || 'No content';
        return `
            <div class="my-custom-content">
                <p>${canvas.escapeHtml(content)}</p>
                <button class="my-button">Click Me</button>
            </div>
        `;
    }

    /**
     * Action buttons for the toolbar
     */
    getActions() {
        return [{ id: 'custom-action', label: '✨ Custom', title: 'Do something custom' }, Actions.REPLY, Actions.COPY];
    }

    /**
     * Event bindings for interactive elements
     */
    getEventBindings() {
        return [
            {
                selector: '.my-button',
                handler: (nodeId, e, canvas) => {
                    alert('Button clicked!');
                    // Emit custom events to the canvas
                    canvas.emit('myCustomEvent', nodeId);
                },
            },
        ];
    }
}

// Register the node type
NodeRegistry.register({
    type: 'my-custom',
    protocol: MyCustomNode,
    defaultSize: { width: 400, height: 300 },
    css: `
        .my-custom-content {
            padding: 16px;
        }
        .my-button {
            padding: 8px 16px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .my-button:hover {
            opacity: 0.8;
        }
    `,
});

console.log('My custom node plugin loaded');
```

## Step 2: Add Plugin to Config

Edit your `config.yaml` to include the plugin:

```yaml
models:
    - id: 'openai/gpt-4o'
      name: 'GPT-4o'
      apiKeyEnvVar: 'OPENAI_API_KEY'

plugins:
    # Format 1: Simple path (JavaScript-only)
    - path: ./plugins/my-custom-node.js
    # OR
    - js: ./plugins/my-custom-node.js

    # Format 2: Paired plugin (JavaScript + Python)
    # - id: my-plugin
    #   js: ./plugins/my-custom-node.js
    #   py: ./plugins/my_handler.py

    # Format 3: Absolute path
    # - path: /Users/you/projects/my-custom-node.js
```

**Note:** For complete plugin architecture including feature plugins and backend handlers, see [How to Create Plugins](./create-feature-plugins.md).

## Step 3: Run Canvas-Chat

Start canvas-chat with your config file:

```bash
# Normal mode (users provide their own API keys)
uvx canvas-chat launch --config config.yaml

# OR admin mode (server-side keys)
uvx canvas-chat launch --config config.yaml --admin-mode
```

You should see in the logs:

```console
Config loaded: 1 models (users provide their own keys via UI)
Loaded 1 plugin(s)
```

## Step 4: Create Nodes of Your Type

In the browser console or via the API, create nodes:

```javascript
// In browser console
const node = createNode('my-custom', 'Hello from my custom node!');
app.graph.addNode(node);
app.canvas.renderNode(node);
```

## Node Protocol API Reference

### Core Methods (Required)

Every custom node class must extend `BaseNode` and implement these core methods:

#### `getTypeLabel(): string`

Display name shown in the node header.

```javascript
getTypeLabel() {
    return 'My Node Type';
}
```

#### `getTypeIcon(): string`

Emoji or text icon shown in the node header.

```javascript
getTypeIcon() {
    return '🎯';
}
```

#### `renderContent(canvas): string`

Returns HTML for the node's content area.

```javascript
renderContent(canvas) {
    // Access node data
    const text = this.node.content;

    // Use canvas utilities
    const escaped = canvas.escapeHtml(text);
    const truncated = canvas.truncate(text, 100);

    return `<div class="content">${escaped}</div>`;
}
```

### Display Methods (Optional)

#### `getSummaryText(canvas): string`

Text shown when zoomed out. Defaults to truncated content.

```javascript
getSummaryText(canvas) {
    return canvas.truncate(this.node.title || this.node.content, 50);
}
```

#### `getActions(): Array<Action>`

Action buttons in the toolbar.

```javascript
getActions() {
    return [
        { id: 'custom', label: '✨ Custom', title: 'Custom action' },
        Actions.REPLY,
        Actions.COPY,
    ];
}
```

#### `getHeaderButtons(): Array<HeaderButton>`

Buttons in the node header (next to delete).

```javascript
getHeaderButtons() {
    const base = super.getHeaderButtons(); // Gets standard buttons
    return [
        ...base,
        {
            id: 'custom-header',
            icon: '⚙️',
            title: 'Settings',
            class: 'custom-header-btn',
        },
    ];
}
```

#### `getEventBindings(): Array<EventBinding>`

Declarative event handlers for interactive elements.

```javascript
getEventBindings() {
    return [
        // Single element
        {
            selector: '.my-button',
            handler: (nodeId, e, canvas) => {
                console.log('Button clicked', nodeId);
            },
        },
        // Multiple elements
        {
            selector: '.list-item',
            multiple: true, // Handle all matching elements
            handler: (nodeId, e, canvas) => {
                const index = e.currentTarget.dataset.index;
                console.log('Item clicked', index);
            },
        },
        // Named event (emitted by canvas)
        {
            selector: '.vote-btn',
            handler: 'pollVote', // String = event name
        },
    ];
}
```

#### `isScrollable(): boolean`

Whether the node content should scroll. Defaults to true.

```javascript
isScrollable() {
    return true;
}
```

#### `getEditFields(): Array<EditField>`

Define custom edit fields for the edit content modal. Override this to provide multiple fields (e.g., question and answer for flashcards).

**Default behavior**: Returns a single `content` field.

**EditField structure:**

```javascript
{
    id: string,           // Unique field identifier (e.g., 'content', 'back', 'title')
    label: string,        // Display label shown above the textarea
    value: string,        // Initial value from node data
    placeholder: string   // Placeholder text for the textarea
}
```

**Example - Single field (default):**

```javascript
getEditFields() {
    return [
        {
            id: 'content',
            label: 'Markdown',
            value: this.node.content || '',
            placeholder: 'Edit the fetched content...',
        },
    ];
}
```

**Example - Multiple fields (flashcard pattern):**

```javascript
getEditFields() {
    return [
        {
            id: 'content',
            label: 'Question',
            value: this.node.content || '',
            placeholder: 'Edit the question...',
        },
        {
            id: 'back',
            label: 'Answer',
            value: this.node.back || '',
            placeholder: 'Edit the answer...',
        },
    ];
}
```

#### `handleEditSave(fields, app): Object`

Handle saving edited fields. Override this to customize save behavior (e.g., save multiple fields).

**Parameters:**

- `fields`: Object mapping field IDs to values (e.g., `{ content: '...', back: '...' }`)
- `app`: App instance for graph updates

**Returns:** Object to pass to `graph.updateNode()` (e.g., `{ content: '...', back: '...' }`)

**Default behavior**: Saves the `content` field.

**Example - Single field (default):**

```javascript
handleEditSave(fields, app) {
    return {
        content: fields.content || '',
    };
}
```

**Example - Multiple fields (flashcard pattern):**

```javascript
handleEditSave(fields, app) {
    return {
        content: fields.content || '',
        back: fields.back || '',
    };
}
```

#### `renderEditPreview(fields, canvas): string`

Render preview HTML for the edit modal. Override this to show custom preview (e.g., flashcard format with question and answer).

**Parameters:**

- `fields`: Object mapping field IDs to values
- `canvas`: Canvas instance for helper methods

**Returns:** HTML string for preview

**Default behavior**: Renders markdown preview of the `content` field.

**Example - Markdown preview (default):**

```javascript
renderEditPreview(fields, canvas) {
    const content = fields.content || '';
    return canvas.renderMarkdown(content);
}
```

**Example - Custom preview (flashcard pattern):**

```javascript
renderEditPreview(fields, canvas) {
    const front = canvas.escapeHtml(fields.content || 'No question');
    const back = canvas.escapeHtml(fields.back || 'No answer');

    return `
        <div class="flashcard-container">
            <div class="flashcard-status new">New</div>
            <div class="flashcard-card">
                <div class="flashcard-front">
                    <div class="flashcard-label">Question</div>
                    <div class="flashcard-text">${front}</div>
                </div>
                <div class="flashcard-back">
                    <div class="flashcard-label">Answer</div>
                    <div class="flashcard-text">${back}</div>
                </div>
            </div>
        </div>
    `;
}
```

#### `getEditModalTitle(): string`

Get modal title for edit dialog. Override this to customize the title.

**Returns:** Modal title string

**Default behavior**: Returns "Edit Content".

**Example:**

```javascript
getEditModalTitle() {
    return 'Edit Flashcard';
}
```

### Other Optional Methods

#### `copyToClipboard(canvas, app): Promise<void>`

Custom copy behavior. Default copies text content.

```javascript
async copyToClipboard(canvas, app) {
    // Custom copy logic (e.g., format as markdown table, copy image)
    const text = this.formatForCopy();
    await navigator.clipboard.writeText(text);
    canvas.showCopyFeedback(this.node.id);
}
```

#### `supportsStopContinue(): boolean`

Whether this node type supports stop/continue buttons for streaming. Default returns `false`.

```javascript
supportsStopContinue() {
    return true; // For AI nodes that stream responses
}
```

#### `getContentClasses(): string`

Additional CSS classes for the node-content wrapper. Default returns empty string.

```javascript
getContentClasses() {
    return 'factcheck-content'; // Custom styling
}
```

## NodeRegistry.register() Options

```javascript
NodeRegistry.register({
    // Required
    type: 'my-node', // Unique type identifier
    protocol: MyNodeClass, // Class extending BaseNode

    // Optional
    defaultSize: {
        // Default dimensions
        width: 400,
        height: 300,
    },
    css: `...`, // CSS rules for this node type
    cssVariables: {
        // CSS custom properties
        '--node-my-node-bg': '#f0f0f0',
    },
});
```

## Available Utilities

### Canvas Utilities (passed to renderContent)

```javascript
canvas.escapeHtml(text); // Escape HTML entities
canvas.truncate(text, maxLength); // Truncate with ellipsis
canvas.emit(eventName, ...args); // Emit custom events
canvas.showCopyFeedback(nodeId); // Show "Copied!" feedback
```

### Built-in Actions

```javascript
import { Actions } from '/static/js/node-protocols.js';

Actions.REPLY; // Reply to node
Actions.COPY; // Copy content
Actions.SUMMARIZE; // Generate summary
Actions.EDIT_CONTENT; // Edit in modal (triggers getEditFields())
Actions.FETCH_SUMMARIZE; // Fetch and summarize URL
Actions.EDIT_CODE; // Edit code in modal
Actions.GENERATE; // Generate code
Actions.RUN_CODE; // Run Python code
Actions.ANALYZE; // Analyze CSV data
Actions.FLIP_CARD; // Flip flashcard
Actions.REVIEW_CARD; // Review flashcard
Actions.CREATE_FLASHCARDS; // Generate flashcards
```

**Note:** When `Actions.EDIT_CONTENT` is included in `getActions()`, clicking the edit button will:

1. Call `getEditFields()` to get field definitions
2. Show edit modal with fields dynamically rendered
3. Call `renderEditPreview()` for live preview
4. Call `handleEditSave()` when saving
5. Use `getEditModalTitle()` for the modal title

## Best Practices

1. **Use ES module imports**: Always import from `/static/js/` paths
2. **Escape user content**: Use `canvas.escapeHtml()` for any user-provided text
3. **Handle errors gracefully**: Wrap async operations in try-catch
4. **Keep nodes responsive**: Avoid blocking the main thread
5. **Test in different zoom levels**: Nodes should work at all zoom scales
6. **Use CSS variables**: Follow Canvas-Chat's theme system
7. **Log plugin loading**: Add `console.log()` at the end for debugging

## Complete Plugin Patterns

### Pattern 1: Simple Node with Custom Rendering

See `/static/js/example-plugins/example-poll-node.js` for a complete example with:

- Custom rendering
- Interactive voting
- Event bindings
- CSS styling
- Copy to clipboard

### Pattern 2: Node with Custom Edit Fields (Flashcard Pattern)

The flashcard node demonstrates the pattern for nodes that need multiple edit fields:

**File:** `/static/js/flashcard-node.js`

**Key features:**

- Multiple edit fields (question and answer)
- Custom preview rendering
- Custom save behavior
- Custom modal title

**Complete example:**

```javascript
import { BaseNode, Actions } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

class FlashcardNode extends BaseNode {
    getTypeLabel() {
        return 'Flashcard';
    }

    getTypeIcon() {
        return '🎴';
    }

    getSummaryText(canvas) {
        if (this.node.title) return this.node.title;
        const plainText = (this.node.content || '').replace(/[#*_`>\[\]()!]/g, '').trim();
        return canvas.truncate(plainText, 60);
    }

    renderContent(canvas) {
        const front = canvas.escapeHtml(this.node.content || 'No question');
        const back = canvas.escapeHtml(this.node.back || 'No answer');

        // SRS status logic...
        let statusClass = 'new';
        let statusText = 'New';
        // ... (status calculation)

        return `
            <div class="flashcard-container">
                <div class="flashcard-status ${statusClass}">${statusText}</div>
                <div class="flashcard-card">
                    <div class="flashcard-front">
                        <div class="flashcard-label">Question</div>
                        <div class="flashcard-text">${front}</div>
                    </div>
                    <div class="flashcard-back">
                        <div class="flashcard-label">Answer</div>
                        <div class="flashcard-text">${back}</div>
                    </div>
                </div>
            </div>
        `;
    }

    getActions() {
        return [Actions.FLIP_CARD, Actions.REVIEW_CARD, Actions.EDIT_CONTENT, Actions.COPY];
    }

    // Custom edit fields
    getEditFields() {
        return [
            {
                id: 'content',
                label: 'Question',
                value: this.node.content || '',
                placeholder: 'Edit the question...',
            },
            {
                id: 'back',
                label: 'Answer',
                value: this.node.back || '',
                placeholder: 'Edit the answer...',
            },
        ];
    }

    // Custom save behavior
    handleEditSave(fields, app) {
        return {
            content: fields.content || '',
            back: fields.back || '',
        };
    }

    // Custom preview
    renderEditPreview(fields, canvas) {
        const front = canvas.escapeHtml(fields.content || 'No question');
        const back = canvas.escapeHtml(fields.back || 'No answer');

        return `
            <div class="flashcard-container">
                <div class="flashcard-status new">New</div>
                <div class="flashcard-card">
                    <div class="flashcard-front">
                        <div class="flashcard-label">Question</div>
                        <div class="flashcard-text">${front}</div>
                    </div>
                    <div class="flashcard-back">
                        <div class="flashcard-label">Answer</div>
                        <div class="flashcard-text">${back}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Custom modal title
    getEditModalTitle() {
        return 'Edit Flashcard';
    }
}

NodeRegistry.register({
    type: 'flashcard',
    protocol: FlashcardNode,
    defaultSize: { width: 400, height: 280 },
});

export { FlashcardNode };
console.log('Flashcard node plugin loaded');
```

**When to use this pattern:**

- Node has multiple editable fields (e.g., question/answer, front/back, title/description)
- Node needs custom preview format in edit modal
- Node needs custom save logic beyond simple content update

## Troubleshooting

### Plugin not loading

Check the server logs for:

- "Plugin file not found" - Check the path in config.yaml
- "Invalid plugin entry" - Check YAML syntax
- Browser console for import errors

### Events not firing

- Ensure `getEventBindings()` returns the correct selector
- Check that the element exists in `renderContent()` output
- Use browser DevTools to inspect the DOM

### Styling issues

- Use browser DevTools to inspect CSS cascade
- Check that CSS variables are defined
- Ensure CSS is scoped to your node type (`.node.my-node {}`)

## Next Steps

- Read the [Node Protocol Reference](../reference/node-protocols.md)
- See [example-poll-node.js](../../src/canvas_chat/static/js/example-plugins/example-poll-node.js) for a complete implementation
- Learn about [Admin Mode Configuration](./deploy-admin-mode.md)
