/* global _NodeType, _DEFAULT_NODE_SIZES */
/**
 * Node Protocol Pattern - Plugin Architecture for Canvas-Chat
 *
 * This module defines the protocol (interface) that all node types must implement.
 * It enables dynamic node rendering through a factory pattern with protocol dispatch.
 */

import { NodeType as _NodeType, DEFAULT_NODE_SIZES as _DEFAULT_NODE_SIZES } from './graph-types.js';
import { NodeRegistry } from './node-registry.js';

/**
 * Action button definitions for node action bars
 */
// Detect platform for keyboard shortcuts
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';
const modKeyLong = isMac ? 'Cmd' : 'Ctrl'; // For longer tooltips

const Actions = {
    REPLY: { id: 'reply', label: '↩️ Reply (r)', title: 'Reply (r)' },
    BRANCH: { id: 'branch', label: '🌿 Branch', title: 'Branch from selection' },
    FETCH_SUMMARIZE: {
        id: 'fetch-summarize',
        label: '📄 Fetch & Summarize',
        title: 'Fetch full content and summarize',
    },
    EDIT_CONTENT: {
        id: 'edit-content',
        label: '✏️ Edit (e)',
        title: `Edit content (e, save with ${modKeyLong}+Enter)`,
    },
    SUMMARIZE: { id: 'summarize', label: '📝 Summarize', title: 'Create new summary from edited content' },
    COPY: { id: 'copy', label: '📋 Copy (c)', title: 'Copy (c)' },
    FLIP_CARD: { id: 'flip-card', label: '🔄 Flip', title: 'Flip card to see answer' },
    CREATE_FLASHCARDS: { id: 'create-flashcards', label: '🎴 Flashcards', title: 'Generate flashcards from content' },
    REVIEW_CARD: { id: 'review-card', label: '📖 Review', title: 'Start review session for this card' },
    ANALYZE: { id: 'analyze', label: '🔬 Analyze (⇧A)', title: 'Generate code to analyze this data (Shift+A)' },
    EDIT_CODE: { id: 'edit-code', label: '✏️ Edit (e)', title: `Edit code (e, save with ${modKeyLong}+Enter)` },
    GENERATE: { id: 'generate', label: '✨ AI (⇧A)', title: 'Generate code with AI (Shift+A)' },
    RUN_CODE: { id: 'run-code', label: `▶️ Run (${modKey}↵)`, title: `Execute code (${modKeyLong}+Enter)` },
};

/**
 * Header button definitions for node headers
 */
const HeaderButtons = {
    NAV_PARENT: { id: 'nav-parent', label: '↑', title: 'Go to parent node' },
    NAV_CHILD: { id: 'nav-child', label: '↓', title: 'Go to child node' },
    COLLAPSE: { id: 'collapse', label: '−', title: 'Collapse children' },
    STOP: { id: 'stop', label: '⏹', title: 'Stop generating', hidden: true },
    CONTINUE: { id: 'continue', label: '▶', title: 'Continue generating', hidden: true },
    RESET_SIZE: { id: 'reset-size', label: '↺', title: 'Reset to default size' },
    FIT_VIEWPORT: { id: 'fit-viewport', label: '⤢', title: 'Fit to viewport (f)' },
    DELETE: { id: 'delete', label: '🗑️', title: 'Delete node' },
};

/**
 * Base node protocol class with default implementations
 * All node-specific classes extend this base class
 */
class BaseNode {
    /**
     *
     * @param node
     */
    constructor(node) {
        this.node = node;
    }

    /**
     * Get the display label for this node type
     * @returns {string}
     */
    getTypeLabel() {
        return this.node.type || 'Unknown';
    }

    /**
     * Get the emoji icon for this node type
     * @returns {string}
     */
    getTypeIcon() {
        return '📄';
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out)
     * @param {Canvas} canvas - Canvas instance for helper methods
     * @returns {string}
     */
    getSummaryText(canvas) {
        // Priority: user-set title > LLM summary > generated fallback
        if (this.node.title) return this.node.title;
        if (this.node.summary) return this.node.summary;

        // Default: strip markdown and truncate content
        const plainText = (this.node.content || '').replace(/[#*_`>\[\]()!]/g, '').trim();
        return canvas.truncate(plainText, 60);
    }

    /**
     * Render the HTML content for the node body
     * @param {Canvas} canvas - Canvas instance for helper methods
     * @returns {string} HTML string
     */
    renderContent(canvas) {
        // Default: render markdown content
        return canvas.renderMarkdown(this.node.content || '');
    }

    /**
     * Get action buttons for the node action bar
     * Default actions for all nodes: Reply, Edit, Copy
     * @returns {Array<{id: string, label: string, title: string}>}
     */
    getActions() {
        return [Actions.REPLY, Actions.EDIT_CONTENT, Actions.COPY];
    }

    /**
     * Override in subclasses to hide specific default actions
     * @returns {Array<string>} Array of action IDs to hide (e.g., ['edit-content'])
     */
    getHiddenActionIds() {
        return [];
    }

    /**
     * Override in subclasses to add custom actions
     * @returns {Array<{id: string, label: string, title: string}>} Additional actions to add
     */
    getAdditionalActions() {
        return [];
    }

    /**
     * Final computed actions (don't override this)
     * Combines default actions (minus hidden ones) with additional actions
     * @returns {Array<{id: string, label: string, title: string}>}
     */
    getComputedActions() {
        const hidden = new Set(this.getHiddenActionIds());
        const defaults = this.getActions().filter((a) => !hidden.has(a.id));
        return [...defaults, ...this.getAdditionalActions()];
    }

    /**
     * Get keyboard shortcuts for this node type
     * Default shortcuts: r (reply), e (edit-content), c (copy)
     * Override in subclasses to customize shortcuts
     * @returns {Object.<string, Object>} Map of key -> {action, handler, shift?, ctrl?}
     */
    getKeyboardShortcuts() {
        return {
            r: { action: 'reply', handler: 'nodeReply' },
            e: { action: 'edit-content', handler: 'nodeEditContent' },
            c: { action: 'copy', handler: 'nodeCopy' },
        };
    }

    /**
     * Get header buttons for the node header
     * @returns {Array.<Object>} Array of {id, label, title, hidden?}
     */
    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE,
        ];
    }

    /**
     * Copy node content to clipboard
     * @param {Canvas} canvas - Canvas instance
     * @param {App} _app - App instance
     * @returns {Promise<void>}
     */
    async copyToClipboard(canvas, _app) {
        const text = this.node.content || '';
        if (!text) return;
        await navigator.clipboard.writeText(text);
        canvas.showCopyFeedback(this.node.id);
    }

    /**
     * Get edit field definitions for the edit content modal.
     * Plugins can override this to customize edit behavior (e.g., multiple fields).
     * @returns {Array<{id: string, label: string, value: string, placeholder: string}>}
     */
    getEditFields() {
        // Default: single content field
        return [
            {
                id: 'content',
                label: 'Markdown',
                value: this.node.content || '',
                placeholder: 'Edit the fetched content...',
            },
        ];
    }

    /**
     * Handle saving edited fields.
     * Plugins can override this to customize save behavior (e.g., save multiple fields).
     * @param {Object} fields - Object mapping field IDs to values
     * @param {Object} _app - App instance for graph updates
     * @returns {Object} Update object to pass to graph.updateNode()
     */
    handleEditSave(fields, _app) {
        // Default: save content field
        return {
            content: fields.content || '',
        };
    }

    /**
     * Render preview HTML for edit modal.
     * Plugins can override this to show custom preview (e.g., flashcard format).
     * @param {Object} fields - Object mapping field IDs to values
     * @param {Canvas} canvas - Canvas instance for helper methods
     * @returns {string} HTML string for preview
     */
    renderEditPreview(fields, canvas) {
        // Default: render markdown preview
        const content = fields.content || '';
        return canvas.renderMarkdown(content);
    }

    /**
     * Get modal title for edit dialog.
     * Plugins can override this to customize the title.
     * @returns {string}
     */
    getEditModalTitle() {
        return 'Edit Content';
    }

    /**
     * Whether this node type has fixed scrollable dimensions.
     * All nodes now have fixed dimensions with scrollable content.
     * @returns {boolean}
     */
    isScrollable() {
        return true;
    }

    /**
     * Whether this node type supports stop/continue buttons for streaming.
     * Node types that generate content via LLM streaming should return true.
     * @returns {boolean}
     */
    supportsStopContinue() {
        return false;
    }

    /**
     * Get additional CSS classes for the node-content wrapper.
     * Override in subclasses that need custom content container styling.
     * @returns {string} Space-separated CSS class names
     */
    getContentClasses() {
        return '';
    }

    /**
     * Get custom event bindings for this node type.
     * Override in subclasses that need type-specific event handlers.
     *
     * Return format: Array of binding objects with:
     * - selector: CSS selector within the node
     * - event: Event name (default: 'click')
     * - handler: Function (nodeId, event, canvas) => void OR
     *            string event name to emit (canvas.emit(eventName, nodeId, ...args))
     * - multiple: If true, binds to all matching elements (default: false, first only)
     * - getData: Optional function (element) => extraArgs to pass to handler/emit
     *
     * @returns {Array.<Object>} Array of {selector, event?, handler, multiple?, getData?}
     */
    getEventBindings() {
        // Base class has no custom bindings - common bindings handled by canvas.js
        return [];
    }

    /**
     * Update a specific cell's content (for node types with cells, like Matrix).
     * Override in subclasses that support cell-based content updates.
     * @param {string} _nodeId - The node ID
     * @param {string} _cellKey - Cell identifier (e.g., "row-col" for matrix)
     * @param {string} _content - New cell content
     * @param {boolean} _isStreaming - Whether this is a streaming update
     * @param {Canvas} _canvas - Canvas instance for DOM manipulation
     * @returns {boolean} True if the update was handled
     */
    updateCellContent(_nodeId, _cellKey, _content, _isStreaming, _canvas) {
        // Base class doesn't support cell updates
        return false;
    }

    /**
     * Get the matrix ID if this node is associated with a matrix (e.g., CellNode).
     * Override in subclasses that are linked to matrices.
     * @returns {string|null} Matrix node ID, or null if not applicable
     */
    getMatrixId() {
        return null;
    }

    /**
     * Format node content for summary generation.
     * Override in subclasses that need custom summary formatting (e.g., Matrix).
     * @returns {string} Content string to use for LLM summary generation
     */
    formatForSummary() {
        // Default: use node content
        return this.node.content || '';
    }

    /**
     * Update node content from remote changes (for multiplayer sync).
     * Override in subclasses that need custom remote update handling (e.g., Matrix cells).
     * @param {Object} _node - Updated node object
     * @param {Canvas} _canvas - Canvas instance for DOM manipulation
     * @returns {boolean} True if the update was handled
     */
    updateRemoteContent(_node, _canvas) {
        // Base class doesn't need special remote handling
        return false;
    }

    /**
     * Get a specific DOM element within the node (for operations like resize).
     * Override in subclasses that need to expose internal elements.
     * @param {string} nodeId - The node ID
     * @param {string} selector - CSS selector for the element
     * @param {Canvas} canvas - Canvas instance for DOM access
     * @returns {HTMLElement|null} The element, or null if not found
     */
    getElement(nodeId, selector, canvas) {
        const wrapper = canvas.nodeElements.get(nodeId);
        if (!wrapper) return null;
        return wrapper.querySelector(selector);
    }

    /**
     * Check if this node has output to display (for nodes with output panels).
     * Override in subclasses that support output panels (e.g., CodeNode).
     * @returns {boolean} True if the node has output to display
     */
    hasOutput() {
        // Base class doesn't have output
        return false;
    }

    /**
     * Render the output panel content (for nodes with output panels).
     * Override in subclasses that support output panels (e.g., CodeNode).
     * @param {Canvas} _canvas - Canvas instance for helper methods
     * @returns {string} HTML string for the output panel content
     */
    renderOutputPanel(_canvas) {
        // Base class doesn't have output panels
        return '';
    }

    /**
     * Update code content in-place (for code nodes during streaming).
     * Override in subclasses that need custom content updates (e.g., CodeNode).
     * @param {string} _nodeId - The node ID
     * @param {string} _content - New content
     * @param {boolean} _isStreaming - Whether this is a streaming update
     * @param {Canvas} _canvas - Canvas instance for DOM manipulation
     * @returns {boolean} True if the update was handled
     */
    updateContent(_nodeId, _content, _isStreaming, _canvas) {
        // Base class uses default updateNodeContent
        return false;
    }

    /**
     * Check if this node supports code execution operations.
     * Override in subclasses that support code execution (e.g., CodeNode).
     * @returns {boolean} True if the node supports code execution
     */
    supportsCodeExecution() {
        // Base class doesn't support code execution
        return false;
    }

    /**
     * Get the code content from this node.
     * Override in subclasses that contain code (e.g., CodeNode).
     * @returns {string|null} The code content, or null if not applicable
     */
    getCode() {
        // Base class doesn't have code
        return null;
    }

    /**
     * Show generate UI (for nodes that support AI generation, e.g., CodeNode).
     * Override in subclasses that support generation UI.
     * @param {string} _nodeId - The node ID
     * @param {Array<Object>} _models - Available model options with {id, name}
     * @param {string} _currentModel - Currently selected model ID
     * @param {Canvas} _canvas - Canvas instance for DOM manipulation and event emission
     * @param {App|null} _app - App instance (optional, can use canvas.emit() instead)
     * @returns {boolean} True if the UI was shown
     */
    showGenerateUI(_nodeId, _models, _currentModel, _canvas, _app) {
        // Base class doesn't support generate UI
        return false;
    }

    /**
     * Hide generate UI (for nodes that support AI generation).
     * Override in subclasses that support generation UI.
     * @param {string} _nodeId - The node ID
     * @param {Canvas} _canvas - Canvas instance for DOM manipulation
     * @returns {boolean} True if the UI was hidden
     */
    hideGenerateUI(_nodeId, _canvas) {
        // Base class doesn't support generate UI
        return false;
    }

    /**
     * Handle custom resize operations (for nodes with custom resize handles).
     * Override in subclasses that have custom resize handles (e.g., matrix index column).
     * @param {MouseEvent} _e - The mousedown event
     * @param {string} _nodeId - The node ID
     * @param {Canvas} _canvas - Canvas instance for DOM manipulation and event emission
     * @returns {boolean} True if the resize was handled
     */
    handleCustomResize(_e, _nodeId, _canvas) {
        // Base class doesn't support custom resize
        return false;
    }

    /**
     * Whether this node type should prevent height changes when resizing east (width only).
     * Override in subclasses that need special resize behavior (e.g., matrix nodes).
     * @returns {boolean} True to prevent height change on east-only resize
     */
    shouldPreventHeightChangeOnEastResize() {
        // Base class allows height change
        return false;
    }
}

/**
 * Note: HumanNode has been moved to human-node.js plugin (built-in)
 * This allows the human node type to be loaded as a plugin.
 */

/**
 * Note: AINode has been moved to ai-node.js plugin (built-in)
 * This allows the AI node type to be loaded as a plugin.
 */

/**
 * Note: NoteNode has been moved to note.js plugin (built-in)
 * This allows the note node type to be loaded as a plugin.
 */

/**
 * Note: SummaryNode has been moved to summary.js plugin (built-in)
 * This allows the summary node type to be loaded as a plugin.
 */

/**
 * Note: ResearchNode has been moved to research-node.js plugin (built-in)
 * This allows the research node type to be loaded as a plugin.
 */

/**
 * Note: MatrixNode is now a plugin (matrix-node.js)
 * Note: CellNode is now a plugin (cell-node.js)
 * Note: RowNode is now a plugin (row-node.js)
 * Note: ColumnNode is now a plugin (column-node.js)
 */

/**
 * Note: PdfNode has been moved to pdf-node.js plugin (built-in)
 * This allows the PDF node type to be loaded as a plugin.
 */

/**
 * Note: CsvNode has been moved to csv-node.js plugin (built-in)
 * This allows the CSV node type to be loaded as a plugin.
 */

/**
 * Note: CodeNode has been moved to code-node.js plugin (built-in)
 * This allows the code node type to be loaded as a plugin.
 */

/**
 * Note: OpinionNode has been moved to opinion-node.js plugin (built-in)
 * This allows the opinion node type to be loaded as a plugin.
 */

/**
 * Note: SynthesisNode has been moved to synthesis-node.js plugin (built-in)
 * This allows the synthesis node type to be loaded as a plugin.
 */

/**
 * Note: ReviewNode has been moved to review-node.js plugin (built-in)
 * This allows the review node type to be loaded as a plugin.
 */

/**
 * Note: FactcheckNode has been moved to factcheck-node.js plugin (built-in)
 * This allows the factcheck node type to be loaded as a plugin.
 */

/**
 * Note: ImageNode has been moved to image-node.js plugin (built-in)
 * This allows the image node type to be loaded as a plugin.
 */

/**
 * Note: FlashcardNode has been moved to flashcard-node.js plugin (built-in)
 * This allows the flashcard node type to be loaded as a plugin.
 */

/**
 * Factory function to wrap a node with its protocol class
 * All node types are now plugins registered with NodeRegistry.
 * Checks node.imageData first (for image highlights), then dispatches by node.type
 *
 * @param {Object} node - Node object from graph
 * @returns {BaseNode} Protocol instance for the node
 */
function wrapNode(node) {
    // Image data takes precedence (for IMAGE nodes or HIGHLIGHT nodes with images)
    // Note: ImageNode is now a plugin, but we still check imageData first for HIGHLIGHT nodes
    // The registry will handle IMAGE type nodes below
    if (node.imageData && node.type === _NodeType.IMAGE) {
        // Try registry (ImageNode is now a plugin)
        if (typeof NodeRegistry !== 'undefined' && NodeRegistry.isRegistered(node.type)) {
            const NodeClass = NodeRegistry.getProtocolClass(node.type);
            return new NodeClass(node);
        }
    }

    // All node types are plugins - use registry
    if (typeof NodeRegistry !== 'undefined' && NodeRegistry.isRegistered(node.type)) {
        const NodeClass = NodeRegistry.getProtocolClass(node.type);
        return new NodeClass(node);
    }

    // Fallback to BaseNode if type not registered (should not happen in production)
    console.warn(`wrapNode: Node type "${node.type}" not registered in NodeRegistry, using BaseNode`);
    return new BaseNode(node);
}

/**
 * Create a type-appropriate mock node for protocol validation
 * @param {string} nodeType - The node type
 * @returns {Object} Mock node with required properties for that type
 */
function createMockNodeForType(nodeType) {
    const baseMock = { type: nodeType, content: '' };

    // Add type-specific properties that methods might access
    if (nodeType === _NodeType.IMAGE) {
        return { ...baseMock, imageData: 'mockImageData', mimeType: 'image/png' };
    }
    // Note: MatrixNode is now a plugin (matrix-node.js)
    // if (nodeType === _NodeType.MATRIX) {
    //     return {
    //         ...baseMock,
    //         context: 'Test Context',
    //         rowItems: ['Row1'],
    //         colItems: ['Col1'],
    //         cells: {},
    //     };
    // }
    // Note: CellNode is now a plugin (cell-node.js)
    // if (nodeType === _NodeType.CELL) {
    //     return { ...baseMock, title: 'Test Cell Title' };
    // }
    if (nodeType === _NodeType.HIGHLIGHT) {
        // HighlightNode can have imageData or just content
        return baseMock;
    }
    if (nodeType === _NodeType.FLASHCARD) {
        return { ...baseMock, content: 'Test question', back: 'Test answer', srs: null };
    }

    return baseMock;
}

/**
 * Validate that a node protocol class implements all required methods
 * Used for testing protocol compliance
 *
 * @param {Function} NodeClass - Node class constructor
 * @returns {boolean} True if all methods are implemented
 */
function validateNodeProtocol(NodeClass) {
    const requiredMethods = [
        'getTypeLabel',
        'getTypeIcon',
        'getSummaryText',
        'renderContent',
        'getActions',
        'getHeaderButtons',
        'copyToClipboard',
        'isScrollable',
        'supportsStopContinue',
    ];

    // Try to determine the node type from the class name
    // This is a heuristic - class names should match node types
    let nodeType = _NodeType.NOTE; // Default fallback
    const className = NodeClass.name;
    // Note: ImageNode is now a plugin (image-node.js)
    // if (className.includes('Image')) nodeType = _NodeType.IMAGE;
    // Note: MatrixNode is now a plugin (matrix-node.js)
    // if (className.includes('Matrix')) nodeType = _NodeType.MATRIX;
    // Note: CellNode is now a plugin (cell-node.js)
    // if (className.includes('Cell')) nodeType = _NodeType.CELL;
    // Note: HumanNode is now a plugin (human-node.js)
    // Note: AINode is now a plugin (ai-node.js)
    if (className.includes('Note')) nodeType = _NodeType.NOTE;
    else if (className.includes('Summary')) nodeType = _NodeType.SUMMARY;
    // Note: ReferenceNode is now a plugin (reference.js)
    // Note: SearchNode is now a plugin (search-node.js)
    // Note: HighlightNode is now a plugin (highlight-node.js)
    // Note: FetchResultNode is now a plugin (fetch-result-node.js)
    // Note: ResearchNode is now a plugin (research-node.js)
    // Note: RowNode is now a plugin (row-node.js)
    // else if (className.includes('Row')) nodeType = _NodeType.ROW;
    // Note: ColumnNode is now a plugin (column-node.js)
    // else if (className.includes('Column')) nodeType = _NodeType.COLUMN;
    // Note: PdfNode is now a plugin (pdf-node.js)
    // Note: OpinionNode is now a plugin (opinion-node.js)
    // Note: SynthesisNode is now a plugin (synthesis-node.js)
    // Note: ReviewNode is now a plugin (review-node.js)
    // Note: FactcheckNode is now a plugin (factcheck-node.js)
    // else if (className.includes('Factcheck')) nodeType = _NodeType.FACTCHECK;
    // Note: FlashcardNode is now a plugin (flashcard-node.js)
    // else if (className.includes('Flashcard')) nodeType = _NodeType.FLASHCARD;
    // Note: CsvNode is now a plugin (csv-node.js)
    // else if (className.includes('Csv')) nodeType = _NodeType.CSV;
    // Note: CodeNode is now a plugin (code-node.js)
    // if (className.includes('Code')) nodeType = _NodeType.CODE;

    // Create a type-appropriate mock node
    const mockNode = createMockNodeForType(nodeType);
    const instance = new NodeClass(mockNode);

    for (const method of requiredMethods) {
        if (typeof instance[method] !== 'function') {
            return false;
        }
    }

    return true;
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.wrapNode = wrapNode;
    window.validateNodeProtocol = validateNodeProtocol;
    window.Actions = Actions;
    window.HeaderButtons = HeaderButtons;
}

// Export classes for testing
// =============================================================================
// Register built-in node types with NodeRegistry
// =============================================================================

/**
 * Register all built-in node types with the NodeRegistry.
 * This allows the plugin system to treat built-in types the same as plugins.
 */
function registerBuiltin_NodeTypes() {
    if (typeof NodeRegistry === 'undefined') {
        console.debug('NodeRegistry not available, skipping built-in registration');
        return;
    }

    // Built-in type configurations
    // Note: CSS is not included here because built-in styles are in nodes.css
    const builtinTypes = [
        // Note: 'human' is now a plugin (human-node.js)
        // Note: 'ai' is now a plugin (ai-node.js)
        // Note: 'note' is now a plugin (note.js)
        // Note: 'summary' is now a plugin (summary.js)
        // Note: 'reference' is now a plugin (reference.js)
        // Note: 'search' is now a plugin (search-node.js)
        // Note: 'highlight' is now a plugin (highlight-node.js)
        // Note: 'fetch_result' is now a plugin (fetch-result-node.js)
        // Note: 'research' is now a plugin (research-node.js)
        // Note: 'matrix' is now a plugin (matrix-node.js)
        // Note: 'cell' is now a plugin (cell-node.js)
        // Note: 'row' is now a plugin (row-node.js)
        // Note: 'column' is now a plugin (column-node.js)
        // Note: 'pdf' is now a plugin (pdf-node.js)
        // Note: 'opinion' is now a plugin (opinion-node.js)
        // Note: 'synthesis' is now a plugin (synthesis-node.js)
        // Note: 'review' is now a plugin (review-node.js)
        // Note: 'factcheck' is now a plugin (factcheck-node.js)
        // Note: 'image' is now a plugin (image-node.js)
        // Note: 'flashcard' is now a plugin (flashcard-node.js)
        // Note: 'csv' is now a plugin (csv-node.js)
        // Note: 'code' is now a plugin (code-node.js)
    ];

    // Get default sizes from graph-types.js if available
    const getSize = (type) => {
        if (typeof _DEFAULT_NODE_SIZES !== 'undefined' && _DEFAULT_NODE_SIZES[type]) {
            return _DEFAULT_NODE_SIZES[type];
        }
        return { width: 420, height: 200 };
    };

    for (const config of builtinTypes) {
        NodeRegistry.register({
            type: config.type,
            protocol: config.protocol,
            defaultSize: getSize(config.type),
            // Built-in CSS is in nodes.css, not injected
            css: '',
            cssVariables: {},
        });
    }

    console.debug(`NodeRegistry: Registered ${builtinTypes.length} built-in node types`);
}

// Auto-register built-in types when this script loads
registerBuiltin_NodeTypes();

// ES Module exports
export {
    // Utilities
    Actions,
    HeaderButtons,
    wrapNode,
    createMockNodeForType,
    validateNodeProtocol,
    registerBuiltin_NodeTypes,
    // Base class
    BaseNode,
    // Node type classes
    // HumanNode is now exported from human-node.js plugin
    // AINode is now exported from ai-node.js plugin
    // NoteNode is now exported from note.js plugin
    // SummaryNode is now exported from summary.js plugin
    // ReferenceNode is now exported from reference.js plugin
    // SearchNode is now exported from search-node.js plugin
    // HighlightNode is now exported from highlight-node.js plugin
    // FetchResultNode is now exported from fetch-result-node.js plugin
    // ResearchNode is now exported from research-node.js plugin
    // MatrixNode is now exported from matrix-node.js plugin
    // CellNode is now exported from cell-node.js plugin
    // RowNode is now exported from row-node.js plugin
    // ColumnNode is now exported from column-node.js plugin
    // PdfNode is now exported from pdf-node.js plugin
    // OpinionNode is now exported from opinion-node.js plugin
    // SynthesisNode is now exported from synthesis-node.js plugin
    // ReviewNode is now exported from review-node.js plugin
    // CsvNode is now exported from csv-node.js plugin
    // ImageNode is now exported from image-node.js plugin
    // FlashcardNode is now exported from flashcard-node.js plugin
    // FactcheckNode is now exported from factcheck-node.js plugin
    // CodeNode is now exported from code-node.js plugin
};
