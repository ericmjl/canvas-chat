/* global NodeType, DEFAULT_NODE_SIZES */
/**
 * Node Protocol Pattern - Plugin Architecture for Canvas-Chat
 *
 * This module defines the protocol (interface) that all node types must implement.
 * It enables dynamic node rendering through a factory pattern with protocol dispatch.
 */

import { NodeType, DEFAULT_NODE_SIZES } from './graph-types.js';
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
    SUMMARIZE: { id: 'summarize', label: '📝 Summarize', title: 'Summarize' },
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
    RESUMMARIZE: { id: 'resummarize', label: '📝 Re-summarize', title: 'Create new summary from edited content' },
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
     * @returns {Array<{id: string, label: string, title: string}>}
     */
    getActions() {
        return [Actions.REPLY, Actions.COPY];
    }

    /**
     * Get header buttons for the node header
     * @returns {Array<{id: string, label: string, title: string, hidden?: boolean}>}
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
     * @param {App} app - App instance
     * @returns {Promise<void>}
     */
    async copyToClipboard(canvas, app) {
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
     * @param {Object} app - App instance for graph updates
     * @returns {Object} Update object to pass to graph.updateNode()
     */
    handleEditSave(fields, app) {
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
     * @returns {Array<{selector: string, event?: string, handler: Function|string, multiple?: boolean, getData?: Function}>}
     */
    getEventBindings() {
        // Base class has no custom bindings - common bindings handled by canvas.js
        return [];
    }

    /**
     * Update a specific cell's content (for node types with cells, like Matrix).
     * Override in subclasses that support cell-based content updates.
     * @param {string} nodeId - The node ID
     * @param {string} cellKey - Cell identifier (e.g., "row-col" for matrix)
     * @param {string} content - New cell content
     * @param {boolean} isStreaming - Whether this is a streaming update
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @returns {boolean} True if the update was handled
     */
    updateCellContent(nodeId, cellKey, content, isStreaming, canvas) {
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
     * @param {Object} node - Updated node object
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @returns {boolean} True if the update was handled
     */
    updateRemoteContent(node, canvas) {
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
 * Code node (Python code for execution with Pyodide)
 */
class CodeNode extends BaseNode {
    getTypeLabel() {
        return 'Code';
    }
    getTypeIcon() {
        return '🐍';
    }

    getSummaryText(canvas) {
        if (this.node.title) return this.node.title;
        // Show first meaningful line of code
        const code = this.node.code || this.node.content || '';
        const firstLine = code.split('\n').find((line) => line.trim() && !line.trim().startsWith('#')) || 'Python code';
        return canvas.truncate(firstLine.trim(), 50);
    }

    renderContent(canvas) {
        const code = this.node.code || this.node.content || '';
        const executionState = this.node.executionState || 'idle';
        const csvNodeIds = this.node.csvNodeIds || [];

        // Build header comment showing available data
        let dataHint = '';
        if (csvNodeIds.length === 1) {
            dataHint = `<div class="code-data-hint"># Data available as: df</div>`;
        } else if (csvNodeIds.length > 1) {
            const vars = csvNodeIds.map((_, i) => `df${i + 1}`).join(', ');
            dataHint = `<div class="code-data-hint"># Data available as: ${vars}</div>`;
        }

        // Execution state indicator
        let stateClass = '';
        let stateIndicator = '';
        const selfHealingStatus = this.node.selfHealingStatus;
        const selfHealingAttempt = this.node.selfHealingAttempt;

        if (executionState === 'running') {
            stateClass = 'code-running';
            if (selfHealingAttempt) {
                stateIndicator = `<div class="code-state-indicator code-self-healing">${selfHealingStatus === 'verifying' ? '🔍 Verifying' : '🔧 Self-healing'} (attempt ${selfHealingAttempt}/3)...</div>`;
            } else {
                stateIndicator = '<div class="code-state-indicator">Running...</div>';
            }
        } else if (executionState === 'error') {
            stateClass = 'code-error';
        } else if (selfHealingStatus === 'fixed') {
            // Show success badge if code was self-healed
            stateIndicator = '<div class="code-state-indicator code-self-healed">✅ Self-healed</div>';
        } else if (selfHealingStatus === 'failed') {
            // Show failure badge if self-healing gave up
            stateIndicator = '<div class="code-state-indicator code-self-heal-failed">⚠️ Self-healing failed</div>';
        }

        // Syntax-highlighted read-only code display (click to edit opens modal)
        // Escape HTML to prevent XSS, highlight.js will handle the rest
        const escapedCode = canvas.escapeHtml(code) || '# Click Edit to add code...';

        let html = `<div class="code-node-content ${stateClass}">`;
        html += dataHint;
        html += `<div class="code-display" data-node-id="${this.node.id}">`;
        html += `<pre><code class="language-python">${escapedCode}</code></pre>`;
        html += `</div>`;
        html += stateIndicator;

        // Show inline error if present
        if (this.node.lastError) {
            html += `<div class="code-error-output">${canvas.escapeHtml(this.node.lastError)}</div>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Check if this code node has output to display
     */
    hasOutput() {
        return !!(
            this.node.outputHtml ||
            this.node.outputText ||
            this.node.outputStdout ||
            (this.node.installProgress && this.node.installProgress.length > 0)
        );
    }

    /**
     * Render the output panel content (called by canvas for the slide-out panel)
     */
    renderOutputPanel(canvas) {
        const outputHtml = this.node.outputHtml || null;
        const outputText = this.node.outputText || null;
        const outputStdout = this.node.outputStdout || null;
        const installProgress = this.node.installProgress || null;

        let html = `<div class="code-output-panel-content">`;

        // Show installation progress if present (during running state)
        if (installProgress && installProgress.length > 0) {
            html += `<div class="code-install-progress">`;
            for (const msg of installProgress) {
                html += `<div class="install-progress-line">${canvas.escapeHtml(msg)}</div>`;
            }
            html += `</div>`;
        }

        // Show stdout first if present
        if (outputStdout) {
            html += `<pre class="code-output-stdout">${canvas.escapeHtml(outputStdout)}</pre>`;
        }

        // Show result (HTML or text)
        if (outputHtml) {
            html += `<div class="code-output-result code-output-html">${outputHtml}</div>`;
        } else if (outputText) {
            html += `<pre class="code-output-result code-output-text">${canvas.escapeHtml(outputText)}</pre>`;
        }

        html += `</div>`;
        return html;
    }

    getActions() {
        return [Actions.EDIT_CODE, Actions.GENERATE, Actions.RUN_CODE, Actions.COPY];
    }

    supportsStopContinue() {
        return true;
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.COLLAPSE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE,
        ];
    }

    /**
     * Code-specific event bindings for syntax highlighting initialization
     */
    getEventBindings() {
        return [
            // Initialize syntax highlighting after render
            {
                selector: '.code-display',
                event: 'init', // Special event: called after render, not a DOM event
                handler: (nodeId, e, canvas) => {
                    if (window.hljs) {
                        const codeEl = e.currentTarget.querySelector('code');
                        if (codeEl) {
                            window.hljs.highlightElement(codeEl);
                        }
                    }
                },
            },
        ];
    }
}

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
 * Uses NodeRegistry if available, falls back to hardcoded map for backwards compatibility.
 * Checks node.imageData first (for image highlights), then dispatches by node.type
 *
 * @param {Object} node - Node object from graph
 * @returns {BaseNode} Protocol instance for the node
 */
function wrapNode(node) {
    // Image data takes precedence (for IMAGE nodes or HIGHLIGHT nodes with images)
    // Note: ImageNode is now a plugin, but we still check imageData first for HIGHLIGHT nodes
    // The registry will handle IMAGE type nodes below
    if (node.imageData && node.type === NodeType.IMAGE) {
        // Try registry first (ImageNode is now a plugin)
        if (typeof NodeRegistry !== 'undefined' && NodeRegistry.isRegistered(node.type)) {
            const NodeClass = NodeRegistry.getProtocolClass(node.type);
            return new NodeClass(node);
        }
    }

    // Try registry first (for plugins)
    if (typeof NodeRegistry !== 'undefined' && NodeRegistry.isRegistered(node.type)) {
        const NodeClass = NodeRegistry.getProtocolClass(node.type);
        return new NodeClass(node);
    }

    // Fallback: hardcoded map for built-in types (backwards compatibility)
    const classMap = {
        // Note: HumanNode is now a plugin (human-node.js)
        // Note: AINode is now a plugin (ai-node.js)
        // Note: NoteNode is now a plugin (note.js)
        // Note: SummaryNode is now a plugin (summary.js)
        // Note: ReferenceNode is now a plugin (reference.js)
        // Note: SearchNode is now a plugin (search-node.js)
        // Note: ResearchNode is now a plugin (research-node.js)
        // Note: HighlightNode is now a plugin (highlight-node.js)
        // Note: MatrixNode is now a plugin (matrix-node.js)
        // Note: CellNode is now a plugin (cell-node.js)
        // Note: RowNode is now a plugin (row-node.js)
        // Note: ColumnNode is now a plugin (column-node.js)
        // Note: FetchResultNode is now a plugin (fetch-result-node.js)
        // Note: PdfNode is now a plugin (pdf-node.js)
        // Note: OpinionNode is now a plugin (opinion-node.js)
        // Note: SynthesisNode is now a plugin (synthesis-node.js)
        // Note: ReviewNode is now a plugin (review-node.js)
        // Note: FactcheckNode is now a plugin (factcheck-node.js)
        // Note: ImageNode is now a plugin (image-node.js)
        // Note: FlashcardNode is now a plugin (flashcard-node.js)
        // Note: CsvNode is now a plugin (csv-node.js)
        [NodeType.CODE]: CodeNode,
    };

    const NodeClass = classMap[node.type] || BaseNode;
    return new NodeClass(node);
}

/**
 * Create a type-appropriate mock node for protocol validation
 * @param {string} nodeType - The node type
 * @returns {Object} Mock node with required properties for that type
 */
function createMockNodeForType(nodeType) {
    const baseMock = { type: nodeType, content: '' };

    // Add type-specific properties that methods might access
    if (nodeType === NodeType.IMAGE) {
        return { ...baseMock, imageData: 'mockImageData', mimeType: 'image/png' };
    }
    // Note: MatrixNode is now a plugin (matrix-node.js)
    // if (nodeType === NodeType.MATRIX) {
    //     return {
    //         ...baseMock,
    //         context: 'Test Context',
    //         rowItems: ['Row1'],
    //         colItems: ['Col1'],
    //         cells: {},
    //     };
    // }
    // Note: CellNode is now a plugin (cell-node.js)
    // if (nodeType === NodeType.CELL) {
    //     return { ...baseMock, title: 'Test Cell Title' };
    // }
    if (nodeType === NodeType.HIGHLIGHT) {
        // HighlightNode can have imageData or just content
        return baseMock;
    }
    if (nodeType === NodeType.FLASHCARD) {
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
    let nodeType = NodeType.NOTE; // Default fallback
    const className = NodeClass.name;
    // Note: ImageNode is now a plugin (image-node.js)
    // if (className.includes('Image')) nodeType = NodeType.IMAGE;
    // Note: MatrixNode is now a plugin (matrix-node.js)
    // if (className.includes('Matrix')) nodeType = NodeType.MATRIX;
    // Note: CellNode is now a plugin (cell-node.js)
    // if (className.includes('Cell')) nodeType = NodeType.CELL;
    // Note: HumanNode is now a plugin (human-node.js)
    // Note: AINode is now a plugin (ai-node.js)
    if (className.includes('Note')) nodeType = NodeType.NOTE;
    else if (className.includes('Summary')) nodeType = NodeType.SUMMARY;
    // Note: ReferenceNode is now a plugin (reference.js)
    // Note: SearchNode is now a plugin (search-node.js)
    // Note: HighlightNode is now a plugin (highlight-node.js)
    // Note: FetchResultNode is now a plugin (fetch-result-node.js)
    // Note: ResearchNode is now a plugin (research-node.js)
    // Note: RowNode is now a plugin (row-node.js)
    // else if (className.includes('Row')) nodeType = NodeType.ROW;
    // Note: ColumnNode is now a plugin (column-node.js)
    // else if (className.includes('Column')) nodeType = NodeType.COLUMN;
    // Note: PdfNode is now a plugin (pdf-node.js)
    // Note: OpinionNode is now a plugin (opinion-node.js)
    // Note: SynthesisNode is now a plugin (synthesis-node.js)
    // Note: ReviewNode is now a plugin (review-node.js)
    // Note: FactcheckNode is now a plugin (factcheck-node.js)
    // else if (className.includes('Factcheck')) nodeType = NodeType.FACTCHECK;
    // Note: FlashcardNode is now a plugin (flashcard-node.js)
    // else if (className.includes('Flashcard')) nodeType = NodeType.FLASHCARD;
    // Note: CsvNode is now a plugin (csv-node.js)
    // else if (className.includes('Csv')) nodeType = NodeType.CSV;
    if (className.includes('Code')) nodeType = NodeType.CODE;

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
function registerBuiltinNodeTypes() {
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
        { type: 'code', protocol: CodeNode },
    ];

    // Get default sizes from graph-types.js if available
    const getSize = (type) => {
        if (typeof DEFAULT_NODE_SIZES !== 'undefined' && DEFAULT_NODE_SIZES[type]) {
            return DEFAULT_NODE_SIZES[type];
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
registerBuiltinNodeTypes();

// ES Module exports
export {
    // Utilities
    Actions,
    HeaderButtons,
    wrapNode,
    createMockNodeForType,
    validateNodeProtocol,
    registerBuiltinNodeTypes,
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
    CodeNode,
};
