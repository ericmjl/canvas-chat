/**
 * Matrix Plugin (Built-in)
 *
 * Provides matrix nodes for cross-product evaluation tables.
 * This is a self-contained plugin that combines:
 * - MatrixNode protocol (custom node rendering)
 * - MatrixFeature (slash command and event handling)
 */

import { FeaturePlugin } from '../feature-plugin.js';
import {
    createCellNode,
    createColumnNode,
    createEdge,
    createMatrixNode,
    createRowNode,
    DEFAULT_NODE_SIZES,
    EdgeType,
    NodeType,
} from '../graph-types.js';
import { BaseNode, HeaderButtons, wrapNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { CancellableEvent } from '../plugin-events.js';
import { streamSSEContent } from '../sse.js';
import { apiUrl, buildMessagesForApi, escapeHtmlText } from '../utils.js';

// =============================================================================
// Matrix Node Protocol
// =============================================================================

/**
 * Matrix Node Protocol Class
 * Defines how matrix nodes are rendered and what actions they support.
 */
class MatrixNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Matrix';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '📊';
    }

    /**
     * Get header buttons for this node
     * @returns {Array<string>}
     */
    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP, // For stopping cell fills
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE,
        ];
    }

    /**
     * Matrix nodes use internal actions (Edit, Fill All) instead of the standard footer
     * @returns {Array}
     */
    getActions() {
        return [];
    }

    /**
     * Matrix needs special content container styling for the scrollable table
     * @returns {string}
     */
    getContentClasses() {
        return 'matrix-table-container';
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out)
     * @param {Canvas} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        // Priority: user-set title > LLM summary > generated fallback
        if (this.node.title) return this.node.title;
        if (this.node.summary) return this.node.summary;

        // For matrix nodes, generate from context and dimensions
        const context = this.node.context || 'Matrix';
        const rows = this.node.rowItems?.length || 0;
        const cols = this.node.colItems?.length || 0;
        return `${context} (${rows}×${cols})`;
    }

    /**
     * Render matrix-specific content: context bar, table, and internal actions.
     * The standard header/summary/resize-handles are rendered by canvas.js.
     * @param {Canvas} canvas
     * @returns {string} HTML for the content portion only
     */
    renderContent(canvas) {
        const { context, rowItems, colItems, cells, indexColWidth } = this.node;

        // Build table HTML with optional custom index column width
        const styleAttr = indexColWidth ? ` style="--index-col-width: ${indexColWidth}"` : '';
        let tableHtml = `<table class="matrix-table"${styleAttr}><thead><tr>`;

        // Corner cell with context and resize handle
        tableHtml += `<th class="corner-cell" title="${canvas.escapeHtml(context)}"><span class="matrix-header-text">${canvas.escapeHtml(context)}</span><div class="index-col-resize-handle" title="Drag to resize index column"></div></th>`;

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

        // Matrix-specific content: context bar at top, table, and internal actions at bottom
        return `
            <div class="matrix-context">
                <span class="matrix-context-text">${canvas.escapeHtml(context)}</span>
                <button class="matrix-context-copy" title="Copy context">📋</button>
            </div>
            ${tableHtml}
            <div class="matrix-actions">
                <button class="matrix-edit-btn" title="Edit rows and columns">Edit</button>
                <button class="matrix-fill-all-btn" title="Fill all empty cells with concise AI evaluations (2-3 sentences each)">Fill All</button>
                <button class="matrix-clear-all-btn" title="Clear all cell contents">Clear All</button>
            </div>
        `;
    }

    /**
     * Format node content for summary generation.
     * Matrix nodes need special formatting to describe structure.
     * @returns {string}
     */
    formatForSummary() {
        const filledCells = Object.values(this.node.cells || {}).filter((c) => c.filled).length;
        const totalCells = (this.node.rowItems?.length || 0) * (this.node.colItems?.length || 0);
        return (
            `Matrix evaluation: "${this.node.context}"\n` +
            `Rows: ${this.node.rowItems?.join(', ')}\n` +
            `Columns: ${this.node.colItems?.join(', ')}\n` +
            `Progress: ${filledCells}/${totalCells} cells filled`
        );
    }

    /**
     * Format this matrix node for copying to clipboard.
     * Returns markdown table representation of the matrix.
     * @returns {string} Markdown table string
     */
    formatForClipboard() {
        const { context, rowItems, colItems, cells } = this.node;

        let text = `## ${context}\n\n`;

        // Header row
        text += '| |';
        for (const colItem of colItems) {
            text += ` ${colItem} |`;
        }
        text += '\n';

        // Separator row
        text += '|---|';
        for (let c = 0; c < colItems.length; c++) {
            text += '---|';
        }
        text += '\n';

        // Data rows
        for (let r = 0; r < rowItems.length; r++) {
            text += `| ${rowItems[r]} |`;
            for (let c = 0; c < colItems.length; c++) {
                const cellKey = `${r}-${c}`;
                const cell = cells[cellKey];
                const content = cell && cell.content ? cell.content.replace(/\n/g, ' ').replace(/\|/g, '\\|') : '';
                text += ` ${content} |`;
            }
            text += '\n';
        }

        return text;
    }

    /**
     * Update a specific cell's content (for streaming cell fills).
     * @param {string} nodeId - The node ID
     * @param {string} cellKey - Cell identifier (e.g., "row-col")
     * @param {string} content - New cell content
     * @param {boolean} isStreaming - Whether this is a streaming update
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @returns {boolean}
     */
    updateCellContent(nodeId, cellKey, content, isStreaming, canvas) {
        const wrapper = canvas.nodeElements.get(nodeId);
        if (!wrapper) return false;

        const [row, col] = cellKey.split('-').map(Number);
        const cell = wrapper.querySelector(`.matrix-cell[data-row="${row}"][data-col="${col}"]`);
        if (!cell) return false;

        if (isStreaming) {
            cell.classList.add('loading');
            cell.classList.remove('empty');
            cell.classList.add('filled');
            cell.innerHTML = `<div class="matrix-cell-content">${canvas.escapeHtml(content)}</div>`;
        } else {
            cell.classList.remove('loading');

            // Check if content is empty
            if (!content || content === '') {
                // Show empty state with "+" button
                cell.classList.add('empty');
                cell.classList.remove('filled');
                cell.innerHTML = `
                    <div class="matrix-cell-empty">
                        <button class="matrix-cell-fill" title="Fill with concise AI evaluation">+</button>
                    </div>
                `;
            } else {
                // Show filled state with content
                cell.classList.add('filled');
                cell.classList.remove('empty');
                cell.innerHTML = `<div class="matrix-cell-content">${canvas.escapeHtml(content)}</div>`;
            }
        }
        return true;
    }

    /**
     * Update node content from remote changes (for multiplayer sync).
     * @param {Object} node - Updated node object
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @returns {boolean}
     */
    updateRemoteContent(node, canvas) {
        const wrapper = canvas.nodeElements.get(node.id);
        if (!wrapper || !node.cells) return false;

        for (const [cellKey, cellData] of Object.entries(node.cells)) {
            const [row, col] = cellKey.split('-').map(Number);
            const cellEl = wrapper.querySelector(`.matrix-cell[data-row="${row}"][data-col="${col}"]`);
            if (cellEl) {
                if (cellData.content) {
                    // Cell has content - update it
                    const contentEl = cellEl.querySelector('.matrix-cell-content');
                    if (contentEl) {
                        contentEl.textContent = cellData.content;
                    } else {
                        // Create content element if it doesn't exist
                        cellEl.innerHTML = `<div class="matrix-cell-content">${canvas.escapeHtml(cellData.content)}</div>`;
                    }
                    cellEl.classList.remove('empty');
                    cellEl.classList.add('filled');
                } else {
                    // Cell is empty - show "+" button
                    cellEl.classList.add('empty');
                    cellEl.classList.remove('filled');
                    cellEl.innerHTML = `
                        <div class="matrix-cell-empty">
                            <button class="matrix-cell-fill" title="Fill with concise AI evaluation">+</button>
                        </div>
                    `;
                }
            }
        }
        return true;
    }

    /**
     * Copy node content to clipboard.
     * Matrix nodes use markdown table format for easy sharing.
     *
     * Protocol pattern: Use `this.formatForClipboard()` instead of external dependencies.
     * This ensures the method is self-contained and doesn't rely on App methods.
     *
     * @param {Canvas} canvas - Canvas instance for feedback
     * @param {App} _app - App instance (unused, kept for protocol compatibility)
     * @returns {Promise<void>}
     */
    async copyToClipboard(canvas, _app) {
        // Validate required method exists (defensive programming)
        if (typeof this.formatForClipboard !== 'function') {
            console.error(
                'MatrixNode.copyToClipboard: formatForClipboard() method not found. ' +
                'This should never happen - check MatrixNode class definition.'
            );
            return;
        }

        // Validate canvas parameter
        if (!canvas || typeof canvas.showCopyFeedback !== 'function') {
            console.error(
                'MatrixNode.copyToClipboard: canvas.showCopyFeedback is not available. ' +
                'Ensure canvas parameter is provided and has showCopyFeedback method.'
            );
            return;
        }

        try {
            const text = this.formatForClipboard();
            if (!text) {
                console.warn('MatrixNode.copyToClipboard: formatForClipboard() returned empty string');
                return;
            }
            await navigator.clipboard.writeText(text);
            canvas.showCopyFeedback(this.node.id);
        } catch (err) {
            console.error('MatrixNode.copyToClipboard: Failed to copy to clipboard:', err);
            // Don't throw - fail gracefully so UI doesn't break
        }
    }

    /**
     * Handle custom resize operations (index column resize).
     * This is called by canvas when the index column resize handle is clicked.
     * @param {MouseEvent} e - The mousedown event
     * @param {string} nodeId - The node ID
     * @param {Canvas} canvas - Canvas instance for DOM manipulation and event emission
     * @returns {boolean} True if the resize was handled
     */
    handleCustomResize(e, nodeId, canvas) {
        // Only handle index column resize (check if event target is the resize handle)
        if (!e.target || !e.target.classList.contains('index-col-resize-handle')) {
            return false;
        }

        const nodeDiv = e.target.closest('.node');
        if (!nodeDiv) return false;

        const matrixTable = this.getTableElement(nodeId, canvas);
        if (!matrixTable) return false;

        const handle = nodeDiv.querySelector('.index-col-resize-handle');
        const tableRect = matrixTable.getBoundingClientRect();
        const startX = e.clientX;

        // Get current first column width
        const firstCol = matrixTable.querySelector('th:first-child, td:first-child');
        const startWidth = firstCol ? firstCol.getBoundingClientRect().width : tableRect.width * 0.25;

        handle.classList.add('dragging');

        const onMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            let newWidth = startWidth + dx;

            // Clamp to reasonable bounds (min 50px, max 70% of table width)
            const minWidth = 50;
            const maxWidth = tableRect.width * 0.7;
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

            // Calculate percentage of table width
            const widthPercent = (newWidth / tableRect.width) * 100;

            // Apply the width via CSS variable on the table
            matrixTable.style.setProperty('--index-col-width', `${widthPercent}%`);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            handle.classList.remove('dragging');

            // Get final width percentage and persist it
            const finalWidth = matrixTable.style.getPropertyValue('--index-col-width') || '25%';

            // Emit event to persist the width in the node data
            canvas.emit('matrixIndexColResize', nodeId, finalWidth);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        return true;
    }

    /**
     * Matrix nodes should prevent height changes when resizing east (width only).
     * This prevents the table from being distorted when only width is resized.
     * @returns {boolean} True to prevent height change on east-only resize
     */
    shouldPreventHeightChangeOnEastResize() {
        return true;
    }

    /**
     * Get event bindings for matrix interactions
     * @returns {Array<Object>}
     */
    getEventBindings() {
        return [
            // Matrix cells - view filled or fill empty
            {
                selector: '.matrix-cell',
                multiple: true,
                handler: (nodeId, e, canvas) => {
                    const cell = e.currentTarget;
                    const row = parseInt(cell.dataset.row);
                    const col = parseInt(cell.dataset.col);

                    // Guard: Don't process if already filled (prevents double-generation)
                    if (cell.classList.contains('filled') && !cell.classList.contains('loading')) {
                        canvas.emit('matrixCellView', nodeId, row, col);
                        return;
                    }

                    // Guard: Don't process if currently loading (prevents double-generation)
                    if (cell.classList.contains('loading')) {
                        console.log('[Matrix] Cell is loading, ignoring click');
                        return;
                    }

                    // Cell is empty and not loading - start fill
                    canvas.emit('matrixCellFill', nodeId, row, col);
                },
            },
            // Edit button
            {
                selector: '.matrix-edit-btn',
                handler: 'matrixEdit',
            },
            // Fill all button
            {
                selector: '.matrix-fill-all-btn',
                handler: 'matrixFillAll',
            },
            // Clear all button
            {
                selector: '.matrix-clear-all-btn',
                handler: 'matrixClearAll',
            },
            // Copy context button
            {
                selector: '.matrix-context-copy',
                handler: async (nodeId, e, canvas) => {
                    const btn = e.currentTarget;
                    try {
                        const node = canvas.graph?.getNode(nodeId);
                        if (node?.context) {
                            await navigator.clipboard.writeText(node.context);
                            const originalText = btn.textContent;
                            btn.textContent = '✓';
                            setTimeout(() => {
                                btn.textContent = originalText;
                            }, 1500);
                        }
                    } catch (err) {
                        console.error('Failed to copy:', err);
                    }
                },
            },
            // Row headers - extract row
            {
                selector: '.row-header[data-row]',
                multiple: true,
                handler: (nodeId, e, canvas) => {
                    const row = parseInt(e.currentTarget.dataset.row);
                    canvas.emit('matrixRowExtract', nodeId, row);
                },
            },
            // Column headers - extract column
            {
                selector: '.col-header[data-col]',
                multiple: true,
                handler: (nodeId, e, canvas) => {
                    const col = parseInt(e.currentTarget.dataset.col);
                    canvas.emit('matrixColExtract', nodeId, col);
                },
            },
            // Index column resize handle - now handled by handleCustomResize()
            {
                selector: '.index-col-resize-handle',
                event: 'mousedown',
                handler: (nodeId, e, canvas) => {
                    const wrapped = wrapNode(canvas.graph?.getNode(nodeId));
                    if (wrapped && wrapped.handleCustomResize) {
                        wrapped.handleCustomResize(e, nodeId, canvas);
                    }
                },
            },
        ];
    }
}

// Register with NodeRegistry
NodeRegistry.register({
    type: NodeType.MATRIX,
    protocol: MatrixNode,
    defaultSize: DEFAULT_NODE_SIZES[NodeType.MATRIX],
});

// Export MatrixNode for testing
export { MatrixNode };

// =============================================================================
// Matrix Feature Plugin
// =============================================================================

/**
 * MatrixFeature - Encapsulates all matrix-related functionality.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
class MatrixFeature extends FeaturePlugin {
    /**
     * Create a MatrixFeature instance.
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);

        // Additional dependencies specific to matrix (not in base FeaturePlugin)
        this.getModelPicker = () => context.modelPicker;
        this.generateNodeSummary = context.generateNodeSummary;

        // Matrix modal state
        this._matrixData = null;
        this._editMatrixData = null;
        this._currentCellData = null;
        this._currentSliceData = null;
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     */
    async onLoad() {
        console.log('[MatrixFeature] Loaded');

        // Register undo/redo handlers
        this.undoManager?.registerActionHandler('FILL_CELL', {
            undo: this.undoFillCell.bind(this),
            redo: this.redoFillCell.bind(this),
        });

        // Register matrix creation modal
        const createModalTemplate = `
            <div id="matrix-main-modal" class="modal" style="display: none">
                <div class="modal-content modal-wide">
                    <div class="modal-header">
                        <h2>Create Matrix</h2>
                        <button class="modal-close" id="matrix-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="matrix-context-group">
                            <label for="matrix-context">Matrix Context</label>
                            <input
                                type="text"
                                id="matrix-context"
                                placeholder="e.g., evaluate ideas against criteria"
                                readonly
                            />
                        </div>

                        <div id="matrix-loading" class="matrix-loading" style="display: none">
                            <div class="loading-spinner"></div>
                            <span>Extracting rows and columns...</span>
                        </div>

                        <div class="matrix-axes">
                            <div class="matrix-axis">
                                <div class="axis-header">
                                    <h3>Rows</h3>
                                    <span class="axis-count" id="row-count">0 items</span>
                                </div>
                                <ul class="axis-items" id="row-items">
                                    <!-- Row items will be populated here -->
                                </ul>
                                <button class="axis-add-btn" id="add-row-btn">+ Add row</button>
                            </div>

                            <div class="matrix-swap">
                                <button id="swap-axes-btn" class="icon-btn" title="Swap Axes">⇄</button>
                            </div>

                            <div class="matrix-axis">
                                <div class="axis-header">
                                    <h3>Columns</h3>
                                    <span class="axis-count" id="col-count">0 items</span>
                                </div>
                                <ul class="axis-items" id="col-items">
                                    <!-- Column items will be populated here -->
                                </ul>
                                <button class="axis-add-btn" id="add-col-btn">+ Add column</button>
                            </div>
                        </div>

                        <div class="matrix-warning" id="matrix-warning" style="display: none">
                            ⚠️ Maximum 10 items per axis. Some items have been truncated.
                        </div>

                        <div class="modal-actions">
                            <button id="matrix-cancel-btn" class="secondary-btn">Cancel</button>
                            <button id="matrix-create-btn" class="primary-btn">Create Matrix</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.modalManager.registerModal('matrix', 'create', createModalTemplate);

        // Register edit matrix modal
        const editModalTemplate = `
            <div id="matrix-edit-modal" class="modal" style="display: none">
                <div class="modal-content modal-wide">
                    <div class="modal-header">
                        <h2>Edit Matrix</h2>
                        <button class="modal-close" id="edit-matrix-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="matrix-axes">
                            <div class="matrix-axis">
                                <div class="axis-header">
                                    <h3>Rows</h3>
                                    <span class="axis-count" id="edit-row-count">0 items</span>
                                </div>
                                <ul class="axis-items" id="edit-row-items"></ul>
                                <button class="axis-add-btn" id="edit-add-row-btn">+ Add row</button>
                            </div>

                            <div class="matrix-swap">
                                <button id="edit-swap-axes-btn" class="icon-btn" title="Swap Axes">⇄</button>
                            </div>

                            <div class="matrix-axis">
                                <div class="axis-header">
                                    <h3>Columns</h3>
                                    <span class="axis-count" id="edit-col-count">0 items</span>
                                </div>
                                <ul class="axis-items" id="edit-col-items"></ul>
                                <button class="axis-add-btn" id="edit-add-col-btn">+ Add column</button>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button id="edit-matrix-cancel-btn" class="secondary-btn">Cancel</button>
                            <button id="edit-matrix-save-btn" class="primary-btn">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.modalManager.registerModal('matrix', 'edit', editModalTemplate);

        // Register cell detail modal
        const cellModalTemplate = `
            <div id="matrix-cell-modal" class="modal" style="display: none">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Cell Details</h2>
                        <button class="modal-close" id="cell-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="cell-detail-row">
                            <label>Row:</label>
                            <div class="cell-detail-content" id="cell-row-item"></div>
                        </div>
                        <div class="cell-detail-row">
                            <label>Column:</label>
                            <div class="cell-detail-content" id="cell-col-item"></div>
                        </div>
                        <div class="cell-detail-row">
                            <label
                                >Evaluation:
                                <button id="cell-copy-btn" class="cell-copy-btn" title="Copy evaluation">📋</button></label
                            >
                            <div class="cell-detail-content cell-evaluation" id="cell-content"></div>
                        </div>
                        <div class="modal-actions">
                            <button id="cell-close-btn" class="secondary-btn">Close</button>
                            <button id="cell-pin-btn" class="primary-btn">📌 Pin to Canvas</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.modalManager.registerModal('matrix', 'cell', cellModalTemplate);

        // Register slice (row/column) detail modal
        const sliceModalTemplate = `
            <div id="matrix-slice-modal" class="modal" style="display: none">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="slice-title">Row Details</h2>
                        <button class="modal-close" id="slice-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="cell-detail-row">
                            <label id="slice-label">Row:</label>
                            <div class="cell-detail-content" id="slice-item"></div>
                        </div>
                        <div class="cell-detail-row">
                            <label
                                >Contents:
                                <button id="slice-copy-btn" class="cell-copy-btn" title="Copy contents">📋</button></label
                            >
                            <div class="cell-detail-content cell-evaluation slice-content" id="slice-content"></div>
                        </div>
                        <div class="modal-actions">
                            <button id="slice-close-btn" class="secondary-btn">Close</button>
                            <button id="slice-pin-btn" class="primary-btn">📌 Pin to Canvas</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.modalManager.registerModal('matrix', 'slice', sliceModalTemplate);

        // Matrix creation modal event listeners
        const createModal = this.modalManager.getPluginModal('matrix', 'create');
        const matrixCloseBtn = createModal.querySelector('#matrix-close');
        const matrixCancelBtn = createModal.querySelector('#matrix-cancel-btn');
        const swapAxesBtn = createModal.querySelector('#swap-axes-btn');
        const matrixCreateBtn = createModal.querySelector('#matrix-create-btn');
        const addRowBtn = createModal.querySelector('#add-row-btn');
        const addColBtn = createModal.querySelector('#add-col-btn');

        if (matrixCloseBtn) {
            matrixCloseBtn.addEventListener('click', () => {
                createModal.style.display = 'none';
                this._matrixData = null;
            });
        }
        if (matrixCancelBtn) {
            matrixCancelBtn.addEventListener('click', () => {
                createModal.style.display = 'none';
                this._matrixData = null;
            });
        }
        if (swapAxesBtn) {
            swapAxesBtn.addEventListener('click', () => {
                this.swapMatrixAxes();
            });
        }
        if (matrixCreateBtn) {
            matrixCreateBtn.addEventListener('click', () => {
                this.createMatrixNode();
            });
        }
        if (addRowBtn) {
            addRowBtn.addEventListener('click', () => {
                this.addAxisItem('row-items');
            });
        }
        if (addColBtn) {
            addColBtn.addEventListener('click', () => {
                this.addAxisItem('col-items');
            });
        }

        // Edit matrix modal event listeners
        const editModal = this.modalManager.getPluginModal('matrix', 'edit');
        const editMatrixCloseBtn = editModal.querySelector('#edit-matrix-close');
        const editMatrixCancelBtn = editModal.querySelector('#edit-matrix-cancel-btn');
        const editSwapAxesBtn = editModal.querySelector('#edit-swap-axes-btn');
        const editSaveBtn = editModal.querySelector('#edit-matrix-save-btn');
        const editAddRowBtn = editModal.querySelector('#edit-add-row-btn');
        const editAddColBtn = editModal.querySelector('#edit-add-col-btn');

        if (editMatrixCloseBtn) {
            editMatrixCloseBtn.addEventListener('click', () => {
                editModal.style.display = 'none';
                this._editMatrixData = null;
            });
        }
        if (editMatrixCancelBtn) {
            editMatrixCancelBtn.addEventListener('click', () => {
                editModal.style.display = 'none';
                this._editMatrixData = null;
            });
        }
        if (editSwapAxesBtn) {
            editSwapAxesBtn.addEventListener('click', () => {
                this.swapEditMatrixAxes();
            });
        }
        if (editAddRowBtn) {
            editAddRowBtn.addEventListener('click', () => {
                this.addAxisItem('edit-row-items');
            });
        }
        if (editAddColBtn) {
            editAddColBtn.addEventListener('click', () => {
                this.addAxisItem('edit-col-items');
            });
        }
        if (editSaveBtn) {
            editSaveBtn.addEventListener('click', () => {
                this.saveMatrixEdits();
            });
        }

        // Cell detail modal event listeners
        const cellModal = this.modalManager.getPluginModal('matrix', 'cell');
        const cellCloseBtn = cellModal.querySelector('#cell-close');
        const cellCloseBtn2 = cellModal.querySelector('#cell-close-btn');
        const cellPinBtn = cellModal.querySelector('#cell-pin-btn');
        const cellCopyBtn = cellModal.querySelector('#cell-copy-btn');

        if (cellCloseBtn) {
            cellCloseBtn.addEventListener('click', () => {
                cellModal.style.display = 'none';
            });
        }
        if (cellCloseBtn2) {
            cellCloseBtn2.addEventListener('click', () => {
                cellModal.style.display = 'none';
            });
        }
        if (cellPinBtn) {
            cellPinBtn.addEventListener('click', () => {
                this.pinCellToCanvas();
            });
        }
        if (cellCopyBtn) {
            cellCopyBtn.addEventListener('click', async () => {
                const content = document.getElementById('cell-content').textContent;
                const btn = document.getElementById('cell-copy-btn');
                try {
                    await navigator.clipboard.writeText(content);
                    const originalText = btn.textContent;
                    btn.textContent = '✓';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 1500);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        }

        // Slice detail modal event listeners
        const sliceModal = this.modalManager.getPluginModal('matrix', 'slice');
        const sliceCloseBtn = sliceModal.querySelector('#slice-close');
        const sliceCloseBtn2 = sliceModal.querySelector('#slice-close-btn');
        const slicePinBtn = sliceModal.querySelector('#slice-pin-btn');
        const sliceCopyBtn = sliceModal.querySelector('#slice-copy-btn');

        if (sliceCloseBtn) {
            sliceCloseBtn.addEventListener('click', () => {
                sliceModal.style.display = 'none';
                this._currentSliceData = null;
            });
        }
        if (sliceCloseBtn2) {
            sliceCloseBtn2.addEventListener('click', () => {
                sliceModal.style.display = 'none';
                this._currentSliceData = null;
            });
        }
        if (slicePinBtn) {
            slicePinBtn.addEventListener('click', () => {
                this.pinSliceToCanvas();
            });
        }
        if (sliceCopyBtn) {
            sliceCopyBtn.addEventListener('click', async () => {
                const content = document.getElementById('slice-content').textContent;
                const btn = document.getElementById('slice-copy-btn');
                try {
                    await navigator.clipboard.writeText(content);
                    const originalText = btn.textContent;
                    btn.textContent = '✓';
                    setTimeout(() => {
                        btn.textContent = originalText;
                    }, 1500);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        }
    }

    /**
     * Get slash commands for this feature
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/matrix',
                description: 'Create a matrix for cross-product evaluation',
                placeholder: 'Enter matrix context (e.g., "Compare programming languages by performance")',
            },
        ];
    }

    /**
     * Handle the /matrix command - parse context and show modal
     * @param {string} command - The slash command (e.g., '/matrix')
     * @param {string} args - Text after the command
     * @param {Object} context - Additional context (e.g., { text: selectedNodesContent })
     */
    async handleMatrix(command, args, context) {
        // Use args as the matrix context (text after /matrix)
        const matrixContext = args.trim();

        // Get selected nodes (optional - used as additional context if present)
        const selectedIds = this.canvas.getSelectedNodeIds();
        console.log('handleMatrix called with:', { command, args, context });
        console.log('Matrix context:', matrixContext);
        console.log('Selected node IDs:', selectedIds);

        const model = this.getModelPicker().value;

        // Clear previous data and show loading state
        this._matrixData = null;
        document.getElementById('row-items').innerHTML = '';
        document.getElementById('col-items').innerHTML = '';
        document.getElementById('row-count').textContent = '0 items';
        document.getElementById('col-count').textContent = '0 items';
        document.getElementById('matrix-warning').style.display = 'none';

        // Show modal with loading indicator
        const loadingModal = this.modalManager.getPluginModal('matrix', 'create');
        console.log('Matrix modal element:', loadingModal);
        loadingModal.querySelector('#matrix-context').value = matrixContext;
        loadingModal.querySelector('#matrix-loading').style.display = 'flex';
        loadingModal.querySelector('#matrix-create-btn').disabled = true;
        this.modalManager.showPluginModal('matrix', 'create');
        console.log('Modal should now be visible');

        try {
            // Gather content from selected nodes (if any) for additional context
            const contents = selectedIds
                .map((id) => {
                    const node = this.graph.getNode(id);
                    return node ? node.content : '';
                })
                .filter((c) => c);

            // If no selected nodes, use the matrix context itself as the content to parse
            if (contents.length === 0) {
                contents.push(matrixContext);
            }

            // Parse two lists from context (either from selected nodes or command text)
            const result = await this.parseTwoLists(contents, matrixContext, model);

            console.log('[Matrix] Parsed result:', result);

            const rowItems = result.rows;
            const colItems = result.columns;

            console.log('[Matrix] Row items:', rowItems);
            console.log('[Matrix] Column items:', colItems);

            // Hide loading indicator
            const modal = this.modalManager.getPluginModal('matrix', 'create');
            modal.querySelector('#matrix-loading').style.display = 'none';
            modal.querySelector('#matrix-create-btn').disabled = false;

            // Check for max items warning
            const hasWarning = rowItems.length > 10 || colItems.length > 10;
            modal.querySelector('#matrix-warning').style.display = hasWarning ? 'block' : 'none';

            // Store parsed data for modal
            this._matrixData = {
                context: matrixContext,
                contextNodeIds: selectedIds,
                rowItems: rowItems.slice(0, 10),
                colItems: colItems.slice(0, 10),
            };

            // Populate axis items in modal
            this.populateAxisItems('row-items', this._matrixData.rowItems);
            this.populateAxisItems('col-items', this._matrixData.colItems);

            document.getElementById('row-count').textContent = `${this._matrixData.rowItems.length} items`;
            document.getElementById('col-count').textContent = `${this._matrixData.colItems.length} items`;
        } catch (err) {
            const modal = this.modalManager.getPluginModal('matrix', 'create');
            modal.querySelector('#matrix-loading').style.display = 'none';
            alert(`Failed to parse list items: ${err.message}`);
            this.modalManager.hidePluginModal('matrix', 'create');
        }
    }

    /**
     * Parse two lists into matrix structure
     * @param {Array<string>} contents
     * @param {string} context
     * @param {string} _model
     * @returns {Promise<Object>}
     */
    async parseTwoLists(contents, context, _model) {
        const requestBody = this.buildLLMRequest({
            contents,
            context,
        });

        console.log('[Matrix] Parsing request:', {
            contentsCount: contents.length,
            context: context,
            model: requestBody.model,
        });

        const response = await fetch(apiUrl('/api/parse-two-lists'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Matrix] Parse error:', response.status, errorText);
            throw new Error(`Failed to parse lists: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('[Matrix] Parse result:', result);
        return result;
    }

    /**
     * Get the data source and element IDs for a given axis container.
     * Supports both create modal (row-items, col-items) and edit modal (edit-row-items, edit-col-items).
     * @param {string} containerId
     * @returns {Object}
     */
    getAxisConfig(containerId) {
        const isEdit = containerId.startsWith('edit-');
        const isRow = containerId.includes('row');
        const dataSource = isEdit ? this._editMatrixData : this._matrixData;
        const countId = isEdit ? (isRow ? 'edit-row-count' : 'edit-col-count') : isRow ? 'row-count' : 'col-count';
        const items = dataSource ? (isRow ? dataSource.rowItems : dataSource.colItems) : null;
        return { dataSource, items, countId, isRow };
    }

    /**
     *
     * @param containerId
     * @param items
     */
    populateAxisItems(containerId, items) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'axis-item';
            li.dataset.index = index;

            li.innerHTML = `
                <input type="text" class="axis-item-input" value="${escapeHtmlText(item)}" title="${escapeHtmlText(item)}">
                <button class="axis-item-remove" title="Remove">×</button>
            `;

            // Edit handler - update data on change
            li.querySelector('.axis-item-input').addEventListener('change', (e) => {
                this.updateAxisItem(containerId, index, e.target.value);
            });

            // Remove button handler
            li.querySelector('.axis-item-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeAxisItem(containerId, index);
            });

            container.appendChild(li);
        });
    }

    /**
     *
     * @param containerId
     * @param index
     */
    removeAxisItem(containerId, index) {
        const { items, countId } = this.getAxisConfig(containerId);
        if (!items) return;

        items.splice(index, 1);
        this.populateAxisItems(containerId, items);
        document.getElementById(countId).textContent = `${items.length} items`;
    }

    /**
     *
     * @param containerId
     * @param index
     * @param newValue
     */
    updateAxisItem(containerId, index, newValue) {
        const { items } = this.getAxisConfig(containerId);
        if (!items || !newValue.trim()) return;

        items[index] = newValue.trim();
    }

    /**
     *
     * @param containerId
     */
    addAxisItem(containerId) {
        const { items, countId } = this.getAxisConfig(containerId);
        if (!items) return;

        if (items.length >= 10) {
            alert('Maximum 10 items per axis');
            return;
        }

        items.push('New item');
        this.populateAxisItems(containerId, items);
        document.getElementById(countId).textContent = `${items.length} items`;

        // Focus the new item's input
        const container = document.getElementById(containerId);
        const lastInput = container.querySelector('.axis-item:last-child .axis-item-input');
        if (lastInput) {
            lastInput.focus();
            lastInput.select();
        }
    }

    /**
     *
     */
    swapMatrixAxes() {
        if (!this._matrixData) return;

        // Swap row and column data
        const temp = {
            nodeId: this._matrixData.rowNodeId,
            items: this._matrixData.rowItems,
        };

        this._matrixData.rowNodeId = this._matrixData.colNodeId;
        this._matrixData.rowItems = this._matrixData.colItems;
        this._matrixData.colNodeId = temp.nodeId;
        this._matrixData.colItems = temp.items;

        // Re-populate UI
        this.populateAxisItems('row-items', this._matrixData.rowItems);
        this.populateAxisItems('col-items', this._matrixData.colItems);

        document.getElementById('row-count').textContent = `${this._matrixData.rowItems.length} items`;
        document.getElementById('col-count').textContent = `${this._matrixData.colItems.length} items`;
    }

    /**
     *
     */
    swapEditMatrixAxes() {
        if (!this._editMatrixData) return;

        const temp = this._editMatrixData.rowItems;
        this._editMatrixData.rowItems = this._editMatrixData.colItems;
        this._editMatrixData.colItems = temp;

        this.populateAxisItems('edit-row-items', this._editMatrixData.rowItems);
        this.populateAxisItems('edit-col-items', this._editMatrixData.colItems);
        document.getElementById('edit-row-count').textContent = `${this._editMatrixData.rowItems.length} items`;
        document.getElementById('edit-col-count').textContent = `${this._editMatrixData.colItems.length} items`;
    }

    /**
     *
     */
    createMatrixNode() {
        if (!this._matrixData) return;

        const { context, contextNodeIds, rowItems, colItems } = this._matrixData;

        if (rowItems.length === 0 || colItems.length === 0) {
            alert('Both rows and columns must have at least one item');
            return;
        }

        // Get context nodes for positioning (optional)
        const contextNodes = contextNodeIds.map((id) => this.graph.getNode(id)).filter(Boolean);

        // Determine position: near context nodes if they exist, otherwise at viewport center
        let position;
        if (contextNodes.length > 0) {
            // Position matrix to the right of all context nodes, centered vertically
            const maxX = Math.max(...contextNodes.map((n) => n.position.x));
            const avgY = contextNodes.reduce((sum, n) => sum + n.position.y, 0) / contextNodes.length;
            position = {
                x: maxX + 450,
                y: avgY,
            };
        } else {
            // No context nodes - position at viewport center
            const viewportCenter = this.canvas.getViewportCenter();
            position = {
                x: viewportCenter.x - 200, // Offset slightly left of center
                y: viewportCenter.y - 150, // Offset slightly above center
            };
        }

        // Create matrix node
        const matrixNode = createMatrixNode(context, contextNodeIds, rowItems, colItems, { position });

        this.graph.addNode(matrixNode);

        // Create edges from context nodes to matrix (only if context nodes exist)
        for (const contextNode of contextNodes) {
            const edge = createEdge(contextNode.id, matrixNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        // Close modal and clean up
        this.modalManager.hidePluginModal('matrix', 'create');
        this._matrixData = null;

        // Clear selection
        this.canvas.clearSelection();

        // Generate summary async (don't await)
        this.generateNodeSummary(matrixNode.id);

        this.saveSession();
        this.updateEmptyState();
    }

    // --- Matrix Cell Handlers ---

    /**
     * Fill a single matrix cell with AI-generated content.
     * @param {string} nodeId - Matrix node ID
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @param {AbortController} [abortController] - Optional abort controller for cancellation
     */
    async handleMatrixCellFill(nodeId, row, col, abortController = null) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        // Guard: Check if cell is already being filled
        const cellKey = `${row}-${col}`;
        const groupId = `matrix-${nodeId}`;
        const cellNodeId = `${nodeId}:cell:${cellKey}`;
        const groupNodes = this.streamingManager.getGroupNodes(groupId);
        if (groupNodes.has(cellNodeId)) {
            console.log(`[MatrixFeature] Cell (${row}, ${col}) is already being filled, skipping`);
            return;
        }

        const rowItem = matrixNode.rowItems[row];
        const colItem = matrixNode.colItems[col];
        const context = matrixNode.context;

        // Get DAG history for context
        const messages = this.graph.resolveContext([nodeId]);

        // Register this cell fill with StreamingManager
        // Use virtual cell nodeId for tracking, but don't auto-show button on virtual ID
        const beforeEvent = new CancellableEvent('matrix:before:fill', {
            nodeId,
            row,
            col,
            rowItem,
            colItem,
            context,
            messages,
        });
        this.emit('matrix:before:fill', beforeEvent);

        // Check if a plugin prevented the fill
        if (beforeEvent.defaultPrevented) {
            console.log('[MatrixFeature] Cell fill prevented by plugin');
            return;
        }

        // Create abort controller for this cell
        abortController = abortController || new AbortController();

        // Register this cell fill with StreamingManager
        // Use virtual cell nodeId for tracking, but don't auto-show button on virtual ID
        this.streamingManager.register(cellNodeId, {
            abortController,
            featureId: 'matrix',
            groupId,
            context: { nodeId, row, col, rowItem, colItem },
            showStopButton: false, // We manage the button on parent matrix node manually
            onStop: () => {
                // Custom stop handler - no need to update content (cell is in matrix)
                console.log(`[MatrixFeature] Cell fill stopped: ${cellKey}`);
            },
        });

        // Show stop button on parent matrix node (not the virtual cell ID)
        // Only show if this is the first cell in the group
        if (groupNodes.size === 1) {
            // First cell - show stop button on parent matrix node
            this.canvas.showStopButton(nodeId);
        }

        try {
            // Extension hook: matrix:cell:prompt - allow plugins to customize the prompt/request
            const promptEvent = new CancellableEvent('matrix:cell:prompt', {
                nodeId,
                row,
                col,
                rowItem,
                colItem,
                context,
                messages: buildMessagesForApi(messages),
                customPrompt: null, // Plugins can set this to override the default prompt
            });
            this.emit('matrix:cell:prompt', promptEvent);

            // Build request body, using custom prompt if provided by a plugin
            let requestBody;
            if (promptEvent.data.customPrompt) {
                requestBody = this.buildLLMRequest({
                    custom_prompt: promptEvent.data.customPrompt,
                    messages: promptEvent.data.messages,
                });
            } else {
                requestBody = this.buildLLMRequest({
                    row_item: rowItem,
                    col_item: colItem,
                    context: context,
                    messages: promptEvent.data.messages,
                });
            }

            // Prepare fetch options with optional abort signal
            const fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            };

            if (abortController) {
                fetchOptions.signal = abortController.signal;
            }

            // Start streaming fill
            const response = await fetch(apiUrl('/api/matrix/fill'), fetchOptions);

            if (!response.ok) {
                throw new Error(`Failed to fill cell: ${response.statusText}`);
            }

            // Stream the response using shared SSE utility
            let cellContent = '';
            // Throttle state for streaming sync
            let lastStreamSync = 0;
            const streamSyncInterval = 50; // Sync every 50ms during streaming

            // Get protocol instance for cell updates
            const matrixNode = this.graph.getNode(nodeId);
            const wrapped = wrapNode(matrixNode);

            await streamSSEContent(response, {
                onContent: (chunk, fullContent) => {
                    cellContent = fullContent;
                    wrapped.updateCellContent(nodeId, cellKey, cellContent, true, this.canvas);

                    // Sync streaming content to peers (throttled)
                    const now = Date.now();
                    if (now - lastStreamSync >= streamSyncInterval) {
                        lastStreamSync = now;
                        // Re-read node to get current state (avoid race condition with parallel fills)
                        const currentNode = this.graph.getNode(nodeId);
                        const currentCells = currentNode?.cells || {};
                        const streamingCells = { ...currentCells, [cellKey]: { content: cellContent, filled: false } };
                        this.graph.updateNode(nodeId, { cells: streamingCells });
                    }
                },
                onDone: (normalizedContent) => {
                    cellContent = normalizedContent;
                    wrapped.updateCellContent(nodeId, cellKey, cellContent, false, this.canvas);
                },
                onError: (err) => {
                    throw err;
                },
            });

            // Update the graph data - re-read node to get current state
            // (avoid race condition with parallel fills where stale matrixNode.cells
            // would overwrite cells filled by concurrent operations)
            const currentNode = this.graph.getNode(nodeId);
            const currentCells = currentNode?.cells || {};
            const oldCell = currentCells[cellKey] ? { ...currentCells[cellKey] } : { content: null, filled: false };
            const newCell = { content: cellContent, filled: true };
            const updatedCells = { ...currentCells, [cellKey]: newCell };
            this.graph.updateNode(nodeId, { cells: updatedCells });

            // Push undo action for cell fill
            this.undoManager.push({
                type: 'FILL_CELL',
                nodeId,
                row,
                col,
                oldCell,
                newCell,
            });

            this.saveSession();

            // Extension hook: matrix:after:fill - notify plugins that cell fill completed
            this.emit('matrix:after:fill', {
                nodeId,
                row,
                col,
                rowItem,
                colItem,
                content: cellContent,
                success: true,
            });
        } catch (err) {
            // Don't log abort errors as failures
            if (err.name === 'AbortError') {
                console.log(`Cell fill aborted: (${row}, ${col})`);
                return;
            }
            console.error('Failed to fill matrix cell:', err);
            alert(`Failed to fill cell: ${err.message}`);

            // Extension hook: matrix:after:fill with error
            this.emit('matrix:after:fill', {
                nodeId,
                row,
                col,
                rowItem,
                colItem,
                content: null,
                success: false,
                error: err.message,
            });
        } finally {
            // Unregister from StreamingManager (don't auto-hide since we manage parent button)
            const cellNodeId = `${nodeId}:cell:${cellKey}`;
            this.streamingManager.unregister(cellNodeId, { hideButtons: false });

            // Hide stop button on parent matrix node when last cell completes
            // (StreamingManager can't auto-hide because cells use virtual IDs)
            const groupNodes = this.streamingManager.getGroupNodes(`matrix-${nodeId}`);
            if (groupNodes.size === 0) {
                this.canvas.hideStopButton(nodeId);
            }
        }
    }

    /**
     *
     * @param nodeId
     * @param row
     * @param col
     */
    handleMatrixCellView(nodeId, row, col) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        const rowItem = matrixNode.rowItems[row];
        const colItem = matrixNode.colItems[col];
        const cellKey = `${row}-${col}`;
        const cell = matrixNode.cells[cellKey];

        if (!cell || !cell.content) return;

        // Store current cell info for pinning
        this._currentCellData = {
            matrixId: nodeId,
            row,
            col,
            rowItem,
            colItem,
            content: cell.content,
        };

        // Populate and show modal
        const cellModal = this.modalManager.getPluginModal('matrix', 'cell');
        cellModal.querySelector('#cell-row-item').textContent = rowItem;
        cellModal.querySelector('#cell-col-item').textContent = colItem;
        cellModal.querySelector('#cell-content').textContent = cell.content;
        this.modalManager.showPluginModal('matrix', 'cell');
    }

    /**
     * Undo a matrix cell fill
     * @param {Object} action - The FILL_CELL action
     */
    undoFillCell(action) {
        const matrixNode = this.graph.getNode(action.nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        const wrapped = wrapNode(matrixNode);
        const cellKey = `${action.row}-${action.col}`;
        const updatedCells = { ...matrixNode.cells, [cellKey]: { ...action.oldCell } };

        // Update graph
        this.graph.updateNode(action.nodeId, { cells: updatedCells });

        // Update UI
        wrapped.updateCellContent(
            action.nodeId,
            cellKey,
            action.oldCell.filled ? action.oldCell.content : '',
            false,
            this.canvas
        );

        console.log(`[MatrixFeature] Undid cell fill: node=${action.nodeId}, row=${action.row}, col=${action.col}`);
    }

    /**
     * Redo a matrix cell fill
     * @param {Object} action - The FILL_CELL action
     */
    redoFillCell(action) {
        const matrixNode = this.graph.getNode(action.nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        const wrapped = wrapNode(matrixNode);
        const cellKey = `${action.row}-${action.col}`;
        const updatedCells = { ...matrixNode.cells, [cellKey]: { ...action.newCell } };

        // Update graph
        this.graph.updateNode(action.nodeId, { cells: updatedCells });

        // Update UI
        wrapped.updateCellContent(action.nodeId, cellKey, action.newCell.content || '', false, this.canvas);

        console.log(`[MatrixFeature] Redid cell fill: node=${action.nodeId}, row=${action.row}, col=${action.col}`);
    }

    /**
     *
     * @param nodeId
     */
    async handleMatrixFillAll(nodeId) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        const { rowItems, colItems, cells } = matrixNode;

        // Find all empty cells
        const emptyCells = [];
        for (let r = 0; r < rowItems.length; r++) {
            for (let c = 0; c < colItems.length; c++) {
                const cellKey = `${r}-${c}`;
                const cell = cells[cellKey];
                if (!cell || !cell.filled) {
                    emptyCells.push({ row: r, col: c });
                }
            }
        }

        if (emptyCells.length === 0) {
            // All cells filled - no action needed
            return;
        }

        // Fill all cells in parallel - each cell handles its own tracking/cleanup
        const fillPromises = emptyCells.map(({ row, col }) => {
            return this.handleMatrixCellFill(nodeId, row, col).catch((err) => {
                if (err.name !== 'AbortError') {
                    console.error(`Failed to fill cell (${row}, ${col}):`, err);
                }
            });
        });

        await Promise.all(fillPromises);
    }

    /**
     * Clear all filled cells in a matrix.
     * @param {string} nodeId - Matrix node ID
     */
    handleMatrixClearAll(nodeId) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        // Check if there are any filled cells
        const { cells } = matrixNode;
        const hasFilledCells = Object.values(cells).some((cell) => cell && cell.filled);

        if (!hasFilledCells) {
            // No cells to clear
            return;
        }

        // Clear all cells
        const emptyCells = {};
        this.graph.updateNode(nodeId, { cells: emptyCells });

        // Re-render the node to show empty cells
        this.canvas.renderNode(this.graph.getNode(nodeId));

        this.saveSession();
    }

    /**
     * Handle editing matrix rows and columns
     * @param nodeId
     */
    handleMatrixEdit(nodeId) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        // Store edit data
        this._editMatrixData = {
            nodeId,
            rowItems: [...matrixNode.rowItems],
            colItems: [...matrixNode.colItems],
        };

        // Populate the edit modal (reuses unified populateAxisItems)
        const editModal = this.modalManager.getPluginModal('matrix', 'edit');
        this.populateAxisItems('edit-row-items', this._editMatrixData.rowItems);
        this.populateAxisItems('edit-col-items', this._editMatrixData.colItems);
        editModal.querySelector('#edit-row-count').textContent = `${this._editMatrixData.rowItems.length} items`;
        editModal.querySelector('#edit-col-count').textContent = `${this._editMatrixData.colItems.length} items`;

        this.modalManager.showPluginModal('matrix', 'edit');
    }

    /**
     * Handle index column resize in matrix nodes
     * @param {string} nodeId - The matrix node ID
     * @param {string} width - The new width as a CSS percentage (e.g., "30%")
     */
    handleMatrixIndexColResize(nodeId, width) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        // Update the node with the new index column width
        this.graph.updateNode(nodeId, { indexColWidth: width });

        // Save session to persist the change
        this.saveSession();
    }

    /**
     *
     */
    saveMatrixEdits() {
        if (!this._editMatrixData) return;

        const { nodeId, rowItems, colItems } = this._editMatrixData;

        if (rowItems.length === 0 || colItems.length === 0) {
            alert('Both rows and columns must have at least one item');
            return;
        }

        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode) return;

        // Update node data - need to handle cell mapping if items changed
        const oldRowItems = matrixNode.rowItems;
        const oldColItems = matrixNode.colItems;
        const oldCells = matrixNode.cells;

        // Remap cells based on item names (if items were reordered or some removed)
        const newCells = {};
        for (let r = 0; r < rowItems.length; r++) {
            const oldRowIndex = oldRowItems.indexOf(rowItems[r]);
            for (let c = 0; c < colItems.length; c++) {
                const oldColIndex = oldColItems.indexOf(colItems[c]);
                if (oldRowIndex !== -1 && oldColIndex !== -1) {
                    const oldKey = `${oldRowIndex}-${oldColIndex}`;
                    const newKey = `${r}-${c}`;
                    if (oldCells[oldKey]) {
                        newCells[newKey] = oldCells[oldKey];
                    }
                }
            }
        }

        // Update the matrix node
        this.graph.updateNode(nodeId, {
            rowItems,
            colItems,
            cells: newCells,
        });

        // Re-render the node
        this.canvas.renderNode(this.graph.getNode(nodeId));

        // Close modal
        this.modalManager.hidePluginModal('matrix', 'edit');
        this._editMatrixData = null;

        this.saveSession();
    }

    /**
     *
     */
    pinCellToCanvas() {
        if (!this._currentCellData) return;

        const { matrixId, row, col, rowItem, colItem, content } = this._currentCellData;
        const matrixNode = this.graph.getNode(matrixId);
        if (!matrixNode) return;

        // Create cell node with title combining row and column names
        const cellTitle = `${rowItem} x ${colItem}`;
        const cellNode = createCellNode(matrixId, row, col, rowItem, colItem, content, {
            position: {
                x: matrixNode.position.x + (matrixNode.width || 500) + 50,
                y: matrixNode.position.y + row * 60,
            },
            title: cellTitle,
        });

        // Update matrix node's cells property directly
        const currentNode = this.graph.getNode(matrixId);
        if (currentNode) {
            const cells = currentNode.cells || {};
            const cellKey = `${row}-${col}`;
            cells[cellKey] = { content, filled: true };
            this.graph.updateNode(matrixId, { cells });
        }

        // Create edge from matrix to cell (arrow points to the pinned cell)
        const edge = createEdge(matrixId, cellNode.id, EdgeType.MATRIX_CELL);
        this.graph.addEdge(edge);

        // Close modal
        this.modalManager.hidePluginModal('matrix', 'cell');
        this._currentCellData = null;

        // Select the new cell node
        this.canvas.clearSelection();
        this.canvas.selectNode(cellNode.id);

        // Generate summary async (don't await)
        this.generateNodeSummary(cellNode.id);

        this.saveSession();
        this.updateEmptyState();
    }

    /**
     * Handle extracting a row from a matrix - show preview modal
     * @param nodeId
     * @param rowIndex
     */
    handleMatrixRowExtract(nodeId, rowIndex) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        const { rowItems, colItems, cells } = matrixNode;
        const rowItem = rowItems[rowIndex];

        // Collect cell contents for this row
        const cellContents = [];
        for (let c = 0; c < colItems.length; c++) {
            const cellKey = `${rowIndex}-${c}`;
            const cell = cells[cellKey];
            cellContents.push(cell && cell.content ? cell.content : null);
        }

        // Format content for display
        let displayContent = '';
        for (let c = 0; c < colItems.length; c++) {
            const content = cellContents[c];
            displayContent += `${colItems[c]}:\n${content || '(empty)'}\n\n`;
        }

        // Store slice data for pinning
        this._currentSliceData = {
            type: 'row',
            matrixId: nodeId,
            index: rowIndex,
            item: rowItem,
            otherAxisItems: colItems,
            cellContents: cellContents,
        };

        // Populate and show modal
        const sliceModal = this.modalManager.getPluginModal('matrix', 'slice');
        sliceModal.querySelector('#slice-title').textContent = 'Row Details';
        sliceModal.querySelector('#slice-label').textContent = 'Row:';
        sliceModal.querySelector('#slice-item').textContent = rowItem;
        sliceModal.querySelector('#slice-content').textContent = displayContent.trim();
        this.modalManager.showPluginModal('matrix', 'slice');
    }

    /**
     * Handle extracting a column from a matrix - show preview modal
     * @param nodeId
     * @param colIndex
     */
    handleMatrixColExtract(nodeId, colIndex) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        const { rowItems, colItems, cells } = matrixNode;
        const colItem = colItems[colIndex];

        // Collect cell contents for this column
        const cellContents = [];
        for (let r = 0; r < rowItems.length; r++) {
            const cellKey = `${r}-${colIndex}`;
            const cell = cells[cellKey];
            cellContents.push(cell && cell.content ? cell.content : null);
        }

        // Format content for display
        let displayContent = '';
        for (let r = 0; r < rowItems.length; r++) {
            const content = cellContents[r];
            displayContent += `${rowItems[r]}:\n${content || '(empty)'}\n\n`;
        }

        // Store slice data for pinning
        this._currentSliceData = {
            type: 'column',
            matrixId: nodeId,
            index: colIndex,
            item: colItem,
            otherAxisItems: rowItems,
            cellContents: cellContents,
        };

        // Populate and show modal
        document.getElementById('slice-title').textContent = 'Column Details';
        document.getElementById('slice-label').textContent = 'Column:';
        document.getElementById('slice-item').textContent = colItem;
        document.getElementById('slice-content').textContent = displayContent.trim();
        document.getElementById('slice-modal').style.display = 'flex';
    }

    /**
     * Pin the currently viewed row/column slice to the canvas
     */
    pinSliceToCanvas() {
        if (!this._currentSliceData) return;

        const { type, matrixId, index, item, otherAxisItems, cellContents } = this._currentSliceData;
        const matrixNode = this.graph.getNode(matrixId);
        if (!matrixNode) return;

        let sliceNode;
        if (type === 'row') {
            sliceNode = createRowNode(matrixId, index, item, otherAxisItems, cellContents, {
                position: {
                    x: matrixNode.position.x + (matrixNode.width || 500) + 50,
                    y: matrixNode.position.y + index * 60,
                },
                title: item,
            });
        } else {
            sliceNode = createColumnNode(matrixId, index, item, otherAxisItems, cellContents, {
                position: {
                    x: matrixNode.position.x + (matrixNode.width || 500) + 50,
                    y: matrixNode.position.y + index * 60,
                },
                title: item,
            });
        }

        this.graph.addNode(sliceNode);

        // Create edge from matrix to slice node
        const edge = createEdge(matrixId, sliceNode.id, EdgeType.MATRIX_CELL);
        this.graph.addEdge(edge);

        // Close modal
        this.modalManager.hidePluginModal('matrix', 'slice');
        this._currentSliceData = null;

        // Select the new node
        this.canvas.clearSelection();
        this.canvas.selectNode(sliceNode.id);

        // Generate summary async
        this.generateNodeSummary(sliceNode.id);

        this.saveSession();
        this.updateEmptyState();
    }

    /**
     * Stop all streaming cell fills for a matrix node
     * @param {string} nodeId - The matrix node ID
     * @returns {boolean} True if any cells were stopped
     */
    stopAllCellFills(nodeId) {
        // Use StreamingManager to stop all cells in this matrix's group
        const groupId = `matrix-${nodeId}`;
        return this.streamingManager.stopGroup(groupId);
    }

    /**
     * Check if any cells are being filled for a matrix node
     * @param {string} nodeId - The matrix node ID
     * @returns {boolean} True if cells are being filled
     */
    isFillingCells(nodeId) {
        const groupId = `matrix-${nodeId}`;
        const groupNodes = this.streamingManager.getGroupNodes(groupId);
        return groupNodes.size > 0;
    }

    /**
     * Clear all state when switching graphs
     */
    reset() {
        this._matrixData = null;
        this._editMatrixData = null;
        this._currentCellData = null;
        this._currentSliceData = null;
        // StreamingManager handles cleanup via clear() when session changes
    }

    /**
     * Get canvas event handlers for matrix functionality.
     * @returns {Object} Event name -> handler function mapping
     */
    getCanvasEventHandlers() {
        return {
            matrixCellFill: this.handleMatrixCellFill.bind(this),
            matrixCellView: this.handleMatrixCellView.bind(this),
            matrixFillAll: this.handleMatrixFillAll.bind(this),
            matrixClearAll: this.handleMatrixClearAll.bind(this),
            matrixRowExtract: this.handleMatrixRowExtract.bind(this),
            matrixColExtract: this.handleMatrixColExtract.bind(this),
            matrixEdit: this.handleMatrixEdit.bind(this),
            matrixIndexColResize: this.handleMatrixIndexColResize.bind(this),
            nodeSelect: this.handleNodeSelect.bind(this),
            nodeDeselect: this.handleNodeDeselect.bind(this),
        };
    }

    /**
     * Handle node selection - clear matrix cell highlights, highlight if cell node selected
     * @param {string[]} selectedIds
     */
    handleNodeSelect(selectedIds) {
        this.canvas.clearMatrixCellHighlights();

        if (selectedIds.length === 1) {
            const node = this.graph.getNode(selectedIds[0]);
            if (node) {
                const wrapped = wrapNode(node);
                const matrixId = wrapped.getMatrixId();
                if (matrixId && node.rowIndex !== undefined && node.colIndex !== undefined) {
                    this.canvas.highlightMatrixCell(matrixId, node.rowIndex, node.colIndex);
                }
            }
        }
    }

    /**
     * Handle node deselection - clear matrix cell highlights
     * @param {string[]} _selectedIds
     */
    handleNodeDeselect(_selectedIds) {
        this.canvas.clearMatrixCellHighlights();
    }
}

export { MatrixFeature };
