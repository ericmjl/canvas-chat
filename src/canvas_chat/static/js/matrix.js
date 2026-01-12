/**
 * Matrix Feature Module
 * Handles matrix node creation, cell filling, editing, and slice extraction.
 */

import {
    NodeType,
    EdgeType,
    createMatrixNode,
    createCellNode,
    createRowNode,
    createColumnNode,
    createEdge,
} from './graph-types.js';
import { streamSSEContent } from './sse.js';
import { apiUrl, escapeHtmlText, buildMessagesForApi } from './utils.js';
import { FeaturePlugin } from './feature-plugin.js';
import { CancellableEvent } from './plugin-events.js';

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
        this.pushUndo = context.pushUndo || (() => {});

        // Matrix modal state
        this._matrixData = null;
        this._editMatrixData = null;
        this._currentCellData = null;
        this._currentSliceData = null;

        // Legacy streaming state - kept for backwards compatibility during migration
        // TODO: Remove after StreamingManager migration is complete
        this.streamingMatrixCells = new Map();
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     */
    async onLoad() {
        console.log('[MatrixFeature] Loaded');
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
        const loadingModal = document.getElementById('matrix-modal');
        console.log('Matrix modal element:', loadingModal);
        document.getElementById('matrix-context').value = matrixContext;
        document.getElementById('matrix-loading').style.display = 'flex';
        document.getElementById('matrix-create-btn').disabled = true;
        loadingModal.style.display = 'flex';
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
            document.getElementById('matrix-loading').style.display = 'none';
            document.getElementById('matrix-create-btn').disabled = false;

            // Check for max items warning
            const hasWarning = rowItems.length > 10 || colItems.length > 10;
            document.getElementById('matrix-warning').style.display = hasWarning ? 'block' : 'none';

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
            document.getElementById('matrix-loading').style.display = 'none';
            alert(`Failed to parse list items: ${err.message}`);
            document.getElementById('matrix-modal').style.display = 'none';
        }
    }

    async parseTwoLists(contents, context, model) {
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
     */
    getAxisConfig(containerId) {
        const isEdit = containerId.startsWith('edit-');
        const isRow = containerId.includes('row');
        const dataSource = isEdit ? this._editMatrixData : this._matrixData;
        const countId = isEdit ? (isRow ? 'edit-row-count' : 'edit-col-count') : isRow ? 'row-count' : 'col-count';
        const items = dataSource ? (isRow ? dataSource.rowItems : dataSource.colItems) : null;
        return { dataSource, items, countId, isRow };
    }

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

    removeAxisItem(containerId, index) {
        const { items, countId } = this.getAxisConfig(containerId);
        if (!items) return;

        items.splice(index, 1);
        this.populateAxisItems(containerId, items);
        document.getElementById(countId).textContent = `${items.length} items`;
    }

    updateAxisItem(containerId, index, newValue) {
        const { items } = this.getAxisConfig(containerId);
        if (!items || !newValue.trim()) return;

        items[index] = newValue.trim();
    }

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
        this.canvas.renderNode(matrixNode);

        // Create edges from context nodes to matrix (only if context nodes exist)
        for (const contextNode of contextNodes) {
            const edge = createEdge(contextNode.id, matrixNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, contextNode.position, matrixNode.position);
        }

        // Close modal and clean up
        document.getElementById('matrix-modal').style.display = 'none';
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

        const rowItem = matrixNode.rowItems[row];
        const colItem = matrixNode.colItems[col];
        const context = matrixNode.context;

        // Get DAG history for context
        const messages = this.graph.resolveContext([nodeId]);

        // Track this cell fill for stop button support
        const cellKey = `${row}-${col}`;
        // Use a unique virtual nodeId for each cell to allow individual tracking
        const cellNodeId = `${nodeId}:cell:${cellKey}`;
        // Group all cells in this matrix together so stopping one stops all
        const groupId = `matrix-${nodeId}`;

        // Create abort controller for this cell
        abortController = abortController || new AbortController();

        // Extension hook: matrix:before:fill - allow plugins to prevent or modify cell fill
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
        const groupNodes = this.streamingManager.getGroupNodes(groupId);
        if (groupNodes.size === 1) {
            // First cell - show stop button on parent matrix node
            this.canvas.showStopButton(nodeId);
        }

        // Legacy tracking for backwards compatibility
        let cellControllers = this.streamingMatrixCells.get(nodeId);
        if (!cellControllers) {
            cellControllers = new Map();
            this.streamingMatrixCells.set(nodeId, cellControllers);
        }
        cellControllers.set(cellKey, abortController);

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

            await streamSSEContent(response, {
                onContent: (chunk, fullContent) => {
                    cellContent = fullContent;
                    this.canvas.updateMatrixCell(nodeId, row, col, cellContent, true);

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
                    this.canvas.updateMatrixCell(nodeId, row, col, cellContent, false);
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
            this.pushUndo({
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

            // Legacy cleanup
            const controllers = this.streamingMatrixCells.get(nodeId);
            if (controllers) {
                controllers.delete(cellKey);
                if (controllers.size === 0) {
                    this.streamingMatrixCells.delete(nodeId);
                }
            }
        }
    }

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
        document.getElementById('cell-row-item').textContent = rowItem;
        document.getElementById('cell-col-item').textContent = colItem;
        document.getElementById('cell-content').textContent = cell.content;
        document.getElementById('cell-modal').style.display = 'flex';
    }

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
            // All cells filled - no action needed, button tooltip already indicates this
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
     * Handle editing matrix rows and columns
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
        this.populateAxisItems('edit-row-items', this._editMatrixData.rowItems);
        this.populateAxisItems('edit-col-items', this._editMatrixData.colItems);
        document.getElementById('edit-row-count').textContent = `${this._editMatrixData.rowItems.length} items`;
        document.getElementById('edit-col-count').textContent = `${this._editMatrixData.colItems.length} items`;

        document.getElementById('edit-matrix-modal').style.display = 'flex';
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
        document.getElementById('edit-matrix-modal').style.display = 'none';
        this._editMatrixData = null;

        this.saveSession();
    }

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

        this.graph.addNode(cellNode);
        this.canvas.renderNode(cellNode);

        // Create edge from matrix to cell (arrow points to the pinned cell)
        const edge = createEdge(matrixId, cellNode.id, EdgeType.MATRIX_CELL);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, matrixNode.position, cellNode.position);

        // Close modal
        document.getElementById('cell-modal').style.display = 'none';
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
        document.getElementById('slice-title').textContent = 'Row Details';
        document.getElementById('slice-label').textContent = 'Row:';
        document.getElementById('slice-item').textContent = rowItem;
        document.getElementById('slice-content').textContent = displayContent.trim();
        document.getElementById('slice-modal').style.display = 'flex';
    }

    /**
     * Handle extracting a column from a matrix - show preview modal
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
        this.canvas.renderNode(sliceNode);

        // Create edge from matrix to slice node
        const edge = createEdge(matrixId, sliceNode.id, EdgeType.MATRIX_CELL);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, matrixNode.position, sliceNode.position);

        // Close modal
        document.getElementById('slice-modal').style.display = 'none';
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
        this.streamingMatrixCells.clear();
    }
}

export { MatrixFeature };
