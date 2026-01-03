/**
 * Node Protocol Pattern
 *
 * Implements sklearn-style protocol classes where each node type defines its behaviors
 * in a single class. This centralizes node-type-specific logic that was previously
 * scattered across canvas.js and app.js with if (node.type === ...) checks.
 */

/**
 * Action button definitions for node action bars
 */
const Actions = {
    REPLY: { id: 'reply', label: '↩️ Reply (r)', title: 'Reply (r)' },
    BRANCH: { id: 'branch', label: '🌿 Branch', title: 'Branch from selection' },
    SUMMARIZE: { id: 'summarize', label: '📝 Summarize', title: 'Summarize' },
    FETCH_SUMMARIZE: { id: 'fetch-summarize', label: '📄 Fetch & Summarize', title: 'Fetch full content and summarize' },
    EDIT_CONTENT: { id: 'edit-content', label: '✏️ Edit', title: 'Edit content' },
    RESUMMARIZE: { id: 'resummarize', label: '📝 Re-summarize', title: 'Create new summary from edited content' },
    COPY: { id: 'copy', label: '📋 Copy (c)', title: 'Copy (c)' }
};

/**
 * Header button definitions for node headers
 */
const HeaderButtons = {
    NAV_PARENT: { id: 'nav-parent', label: '↑', title: 'Go to parent node' },
    NAV_CHILD: { id: 'nav-child', label: '↓', title: 'Go to child node' },
    STOP: { id: 'stop', label: '⏹', title: 'Stop generating', hidden: true },
    CONTINUE: { id: 'continue', label: '▶', title: 'Continue generating', hidden: true },
    RESET_SIZE: { id: 'reset-size', label: '↺', title: 'Reset to default size' },
    FIT_VIEWPORT: { id: 'fit-viewport', label: '⤢', title: 'Fit to viewport (f)' },
    DELETE: { id: 'delete', label: '🗑️', title: 'Delete node' }
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
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
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
     * Whether this node type has fixed scrollable dimensions.
     * All nodes now have fixed dimensions with scrollable content.
     * @returns {boolean}
     */
    isScrollable() {
        return true;
    }
}

/**
 * Human message node
 */
class HumanNode extends BaseNode {
    getTypeLabel() { return 'You'; }
    getTypeIcon() { return '💬'; }
}

/**
 * AI response node
 */
class AINode extends BaseNode {
    getTypeLabel() { return 'AI'; }
    getTypeIcon() { return '🤖'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Note node
 */
class NoteNode extends BaseNode {
    getTypeLabel() { return 'Note'; }
    getTypeIcon() { return '📝'; }

    getActions() {
        return [Actions.REPLY, Actions.EDIT_CONTENT, Actions.COPY];
    }
}

/**
 * Summary node
 */
class SummaryNode extends BaseNode {
    getTypeLabel() { return 'Summary'; }
    getTypeIcon() { return '📋'; }
}

/**
 * Reference node (link to external content)
 */
class ReferenceNode extends BaseNode {
    getTypeLabel() { return 'Reference'; }
    getTypeIcon() { return '🔗'; }

    getActions() {
        return [Actions.REPLY, Actions.FETCH_SUMMARIZE, Actions.COPY];
    }
}

/**
 * Search query node
 */
class SearchNode extends BaseNode {
    getTypeLabel() { return 'Search'; }
    getTypeIcon() { return '🔍'; }
}

/**
 * Research node (deep research with multiple sources)
 */
class ResearchNode extends BaseNode {
    getTypeLabel() { return 'Research'; }
    getTypeIcon() { return '📚'; }
}

/**
 * Highlight node (excerpted text or image from another node)
 */
class HighlightNode extends BaseNode {
    getTypeLabel() { return 'Highlight'; }
    getTypeIcon() { return '✨'; }

    renderContent(canvas) {
        // If has image data, render image; otherwise render markdown
        if (this.node.imageData) {
            const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
            return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
        }
        return canvas.renderMarkdown(this.node.content || '');
    }
}

/**
 * Matrix node (cross-product evaluation table)
 */
class MatrixNode extends BaseNode {
    getTypeLabel() { return 'Matrix'; }
    getTypeIcon() { return '📊'; }

    getSummaryText(canvas) {
        // Priority: user-set title > LLM summary > generated fallback
        if (this.node.title) return this.node.title;
        if (this.node.summary) return this.node.summary;

        // For matrix nodes, generate from context and dimensions
        const context = this.node.context || 'Matrix';
        const rows = this.node.rowItems?.length || 0;
        const cols = this.node.colItems?.length || 0;
        return `${context} (${rows}×${cols})`;
    }

    renderContent(canvas) {
        const { context, rowItems, colItems, cells } = this.node;

        // Get summary text for semantic zoom
        const summaryText = this.getSummaryText(canvas);
        const typeIcon = this.getTypeIcon();

        // Build table HTML
        let tableHtml = '<table class="matrix-table"><thead><tr>';

        // Corner cell with context
        tableHtml += `<th class="corner-cell" title="${canvas.escapeHtml(context)}"><span class="matrix-header-text">${canvas.escapeHtml(context)}</span></th>`;

        // Column headers - clickable to extract column
        for (let c = 0; c < colItems.length; c++) {
            const colItem = colItems[c];
            tableHtml += `<th class="col-header" data-col="${c}" title="Click to extract column: ${canvas.escapeHtml(colItem)}">
                <span class="matrix-header-text">${canvas.escapeHtml(colItem)}</span>
            </th>`;
        }
        tableHtml += '</tr></thead><tbody>';

        // Data rows
        for (let r = 0; r < rowItems.length; r++) {
            const rowItem = rowItems[r];
            tableHtml += '<tr>';

            // Row header - clickable to extract row
            tableHtml += `<td class="row-header" data-row="${r}" title="Click to extract row: ${canvas.escapeHtml(rowItem)}">
                <span class="matrix-header-text">${canvas.escapeHtml(rowItem)}</span>
            </td>`;

            // Cells
            for (let c = 0; c < colItems.length; c++) {
                const cellKey = `${r}-${c}`;
                const cell = cells[cellKey];
                const isFilled = cell && cell.filled && cell.content;

                if (isFilled) {
                    tableHtml += `<td class="matrix-cell filled" data-row="${r}" data-col="${c}" title="Click to view details">
                        <div class="matrix-cell-content">${canvas.escapeHtml(cell.content)}</div>
                    </td>`;
                } else {
                    tableHtml += `<td class="matrix-cell empty" data-row="${r}" data-col="${c}">
                        <div class="matrix-cell-empty">
                            <button class="matrix-cell-fill" title="Fill with concise AI evaluation">+</button>
                        </div>
                    </td>`;
                }
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';

        return `
            <div class="node-summary" title="Double-click to edit title">
                <span class="node-type-icon">${typeIcon}</span>
                <span class="summary-text">${canvas.escapeHtml(summaryText)}</span>
            </div>
            <div class="node-header">
                <div class="drag-handle" title="Drag to move">
                    <span class="grip-dot"></span><span class="grip-dot"></span>
                    <span class="grip-dot"></span><span class="grip-dot"></span>
                    <span class="grip-dot"></span><span class="grip-dot"></span>
                </div>
                <span class="node-type">Matrix</span>
                <button class="header-btn stop-btn" title="Stop filling cells" style="display:none;">⏹</button>
                <button class="header-btn reset-size-btn" title="Reset to default size">↺</button>
                <button class="header-btn fit-viewport-btn" title="Fit to viewport (f)">⤢</button>
                <button class="node-action delete-btn" title="Delete node">🗑️</button>
            </div>
            <div class="matrix-context">
                <span class="matrix-context-text">${canvas.escapeHtml(context)}</span>
                <button class="matrix-context-copy" title="Copy context">📋</button>
            </div>
            <div class="node-content matrix-table-container">
                ${tableHtml}
            </div>
            <div class="matrix-actions">
                <button class="matrix-edit-btn" title="Edit rows and columns">Edit</button>
                <button class="matrix-fill-all-btn" title="Fill all empty cells with concise AI evaluations (2-3 sentences each)">Fill All</button>
            </div>
            <div class="resize-handle resize-e" data-resize="e"></div>
            <div class="resize-handle resize-s" data-resize="s"></div>
            <div class="resize-handle resize-se" data-resize="se"></div>
        `;
    }

    async copyToClipboard(canvas, app) {
        // Format matrix as markdown table
        if (!app?.formatMatrixAsText) {
            console.error('MatrixNode.copyToClipboard: app.formatMatrixAsText is not available');
            return;
        }
        const text = app.formatMatrixAsText(this.node);
        if (!text) return;
        await navigator.clipboard.writeText(text);
        canvas.showCopyFeedback(this.node.id);
    }
}

/**
 * Cell node (pinned cell from a matrix)
 */
class CellNode extends BaseNode {
    getTypeLabel() {
        // For contextual labels like "GPT-4 × Accuracy"
        return this.node.title || 'Cell';
    }
    getTypeIcon() { return '📦'; }
}

/**
 * Row node (extracted row from a matrix)
 */
class RowNode extends BaseNode {
    getTypeLabel() { return 'Row'; }
    getTypeIcon() { return '↔️'; }
}

/**
 * Column node (extracted column from a matrix)
 */
class ColumnNode extends BaseNode {
    getTypeLabel() { return 'Column'; }
    getTypeIcon() { return '↕️'; }
}

/**
 * Fetch result node (fetched content from URL via Exa)
 */
class FetchResultNode extends BaseNode {
    getTypeLabel() { return 'Fetched Content'; }
    getTypeIcon() { return '📄'; }

    getActions() {
        return [Actions.REPLY, Actions.EDIT_CONTENT, Actions.RESUMMARIZE, Actions.COPY];
    }
}

/**
 * PDF node (imported PDF document)
 */
class PdfNode extends BaseNode {
    getTypeLabel() { return 'PDF'; }
    getTypeIcon() { return '📑'; }
}

/**
 * Opinion node (committee member's opinion)
 */
class OpinionNode extends BaseNode {
    getTypeLabel() { return 'Opinion'; }
    getTypeIcon() { return '🗣️'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Synthesis node (chairman's synthesized answer)
 */
class SynthesisNode extends BaseNode {
    getTypeLabel() { return 'Synthesis'; }
    getTypeIcon() { return '⚖️'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Review node (committee member's review of other opinions)
 */
class ReviewNode extends BaseNode {
    getTypeLabel() { return 'Review'; }
    getTypeIcon() { return '🔍'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Image node (uploaded image for analysis)
 */
class ImageNode extends BaseNode {
    getTypeLabel() { return 'Image'; }
    getTypeIcon() { return '🖼️'; }

    getSummaryText(canvas) {
        return 'Image';
    }

    renderContent(canvas) {
        const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
        return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
    }

    async copyToClipboard(canvas, app) {
        if (!canvas?.copyImageToClipboard) {
            console.error('ImageNode.copyToClipboard: canvas.copyImageToClipboard is not available');
            return;
        }
        await canvas.copyImageToClipboard(this.node.imageData, this.node.mimeType);
        canvas.showCopyFeedback(this.node.id);
    }
}

/**
 * Factory function to wrap a node with its protocol class
 * Checks node.imageData first (for image highlights), then dispatches by node.type
 *
 * @param {Object} node - Node object from graph
 * @returns {BaseNode} Protocol instance for the node
 */
function wrapNode(node) {
    // Image data takes precedence (for IMAGE nodes or HIGHLIGHT nodes with images)
    if (node.imageData && node.type === NodeType.IMAGE) {
        return new ImageNode(node);
    }

    // Dispatch by node type
    const classMap = {
        [NodeType.HUMAN]: HumanNode,
        [NodeType.AI]: AINode,
        [NodeType.NOTE]: NoteNode,
        [NodeType.SUMMARY]: SummaryNode,
        [NodeType.REFERENCE]: ReferenceNode,
        [NodeType.SEARCH]: SearchNode,
        [NodeType.RESEARCH]: ResearchNode,
        [NodeType.HIGHLIGHT]: HighlightNode,
        [NodeType.MATRIX]: MatrixNode,
        [NodeType.CELL]: CellNode,
        [NodeType.ROW]: RowNode,
        [NodeType.COLUMN]: ColumnNode,
        [NodeType.FETCH_RESULT]: FetchResultNode,
        [NodeType.PDF]: PdfNode,
        [NodeType.OPINION]: OpinionNode,
        [NodeType.SYNTHESIS]: SynthesisNode,
        [NodeType.REVIEW]: ReviewNode,
        [NodeType.IMAGE]: ImageNode
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
    if (nodeType === NodeType.MATRIX) {
        return {
            ...baseMock,
            context: 'Test Context',
            rowItems: ['Row1'],
            colItems: ['Col1'],
            cells: {}
        };
    }
    if (nodeType === NodeType.CELL) {
        return { ...baseMock, title: 'Test Cell Title' };
    }
    if (nodeType === NodeType.HIGHLIGHT) {
        // HighlightNode can have imageData or just content
        return baseMock;
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
        'isScrollable'
    ];

    // Try to determine the node type from the class name
    // This is a heuristic - class names should match node types
    let nodeType = NodeType.NOTE; // Default fallback
    const className = NodeClass.name;
    if (className.includes('Image')) nodeType = NodeType.IMAGE;
    else if (className.includes('Matrix')) nodeType = NodeType.MATRIX;
    else if (className.includes('Cell')) nodeType = NodeType.CELL;
    else if (className.includes('Human')) nodeType = NodeType.HUMAN;
    else if (className.includes('AI') && !className.includes('Human')) nodeType = NodeType.AI;
    else if (className.includes('Note')) nodeType = NodeType.NOTE;
    else if (className.includes('Summary')) nodeType = NodeType.SUMMARY;
    else if (className.includes('Reference')) nodeType = NodeType.REFERENCE;
    else if (className.includes('Search')) nodeType = NodeType.SEARCH;
    else if (className.includes('Research')) nodeType = NodeType.RESEARCH;
    else if (className.includes('Highlight')) nodeType = NodeType.HIGHLIGHT;
    else if (className.includes('Row')) nodeType = NodeType.ROW;
    else if (className.includes('Column')) nodeType = NodeType.COLUMN;
    else if (className.includes('FetchResult')) nodeType = NodeType.FETCH_RESULT;
    else if (className.includes('Pdf')) nodeType = NodeType.PDF;
    else if (className.includes('Opinion')) nodeType = NodeType.OPINION;
    else if (className.includes('Synthesis')) nodeType = NodeType.SYNTHESIS;
    else if (className.includes('Review')) nodeType = NodeType.REVIEW;

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
window.wrapNode = wrapNode;
window.validateNodeProtocol = validateNodeProtocol;
window.Actions = Actions;
window.HeaderButtons = HeaderButtons;

// Export classes for testing
window.BaseNode = BaseNode;
window.HumanNode = HumanNode;
window.AINode = AINode;
window.NoteNode = NoteNode;
window.SummaryNode = SummaryNode;
window.ReferenceNode = ReferenceNode;
window.SearchNode = SearchNode;
window.ResearchNode = ResearchNode;
window.HighlightNode = HighlightNode;
window.MatrixNode = MatrixNode;
window.CellNode = CellNode;
window.RowNode = RowNode;
window.ColumnNode = ColumnNode;
window.FetchResultNode = FetchResultNode;
window.PdfNode = PdfNode;
window.OpinionNode = OpinionNode;
window.SynthesisNode = SynthesisNode;
window.ReviewNode = ReviewNode;
window.ImageNode = ImageNode;
