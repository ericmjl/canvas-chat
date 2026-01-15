/**
 * Matrix Node Plugin (Built-in)
 *
 * Provides matrix nodes for cross-product evaluation tables.
 * Matrix nodes display interactive tables with cells that can be filled with AI evaluations.
 */
import { BaseNode, HeaderButtons } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from './graph-types.js';

class MatrixNode extends BaseNode {
    getTypeLabel() {
        return 'Matrix';
    }

    getTypeIcon() {
        return '📊';
    }

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
            </div>
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

    /**
     * Matrix-specific event bindings for cells, headers, and actions
     */
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
            cell.classList.add('filled');
            cell.classList.remove('empty');
            cell.innerHTML = `<div class="matrix-cell-content">${canvas.escapeHtml(content)}</div>`;
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
                const contentEl = cellEl.querySelector('.matrix-cell-content');
                if (contentEl && cellData.content) {
                    contentEl.textContent = cellData.content;
                    cellEl.classList.remove('empty');
                    cellEl.classList.add('filled');
                } else if (!cellData.content) {
                    cellEl.classList.add('empty');
                    cellEl.classList.remove('filled');
                }
            }
        }
        return true;
    }

    /**
     * Get the table element for resize operations.
     * @param {string} nodeId - The node ID
     * @param {Canvas} canvas - Canvas instance
     * @returns {HTMLElement|null}
     */
    getTableElement(nodeId, canvas) {
        return this.getElement(nodeId, '.matrix-table', canvas);
    }

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
                    if (cell.classList.contains('filled')) {
                        canvas.emit('matrixCellView', nodeId, row, col);
                    } else {
                        canvas.emit('matrixCellFill', nodeId, row, col);
                    }
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
            // Index column resize handle
            {
                selector: '.index-col-resize-handle',
                event: 'mousedown',
                handler: (nodeId, e, canvas) => {
                    const div = e.currentTarget.closest('.node');
                    canvas.startIndexColResize(e, nodeId, div);
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
