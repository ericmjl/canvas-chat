/**
 * Tests for matrix-related functionality
 * Tests matrix cell tracking, concurrent updates, and MatrixNode rendering.
 */

import {
    test,
    assertEqual,
    assertTrue,
    assertFalse,
    NodeType,
    wrapNode,
    createMatrixNodeReal
} from './test_setup.js';

// ============================================================
// Matrix cell tracking tests (streamingMatrixCells)
// ============================================================

/**
 * Tests for the matrix cell fill tracking pattern.
 * When filling matrix cells (single or "Fill All"), each cell needs
 * its own AbortController tracked in a nested Map structure:
 *   streamingMatrixCells: Map<nodeId, Map<cellKey, AbortController>>
 *
 * This allows:
 * - Multiple matrices to fill simultaneously
 * - Individual cells within a matrix to be tracked/aborted
 * - Stop button to abort all cells in a matrix at once
 */
class MatrixCellTracker {
    constructor() {
        // Map<nodeId, Map<cellKey, AbortController>>
        this.streamingMatrixCells = new Map();
    }

    // Start tracking a cell fill
    startCellFill(nodeId, row, col) {
        const cellKey = `${row}-${col}`;
        const abortController = { aborted: false, cellKey };

        // Get or create the cell controllers map for this matrix
        let cellControllers = this.streamingMatrixCells.get(nodeId);
        if (!cellControllers) {
            cellControllers = new Map();
            this.streamingMatrixCells.set(nodeId, cellControllers);
        }
        cellControllers.set(cellKey, abortController);

        return abortController;
    }

    // Complete a cell fill (cleanup)
    completeCellFill(nodeId, row, col) {
        const cellKey = `${row}-${col}`;
        const cellControllers = this.streamingMatrixCells.get(nodeId);

        if (cellControllers) {
            cellControllers.delete(cellKey);
            // If no more cells are being filled, clean up the matrix entry
            if (cellControllers.size === 0) {
                this.streamingMatrixCells.delete(nodeId);
            }
        }
    }

    // Stop all cell fills for a matrix (stop button)
    stopAllCellFills(nodeId) {
        const cellControllers = this.streamingMatrixCells.get(nodeId);
        if (!cellControllers) return 0;

        let abortedCount = 0;
        for (const controller of cellControllers.values()) {
            controller.aborted = true;
            abortedCount++;
        }
        return abortedCount;
    }

    // Check if any cells are being filled for a matrix
    isMatrixFilling(nodeId) {
        const cellControllers = this.streamingMatrixCells.get(nodeId);
        return !!(cellControllers && cellControllers.size > 0);
    }

    // Get count of active cell fills for a matrix
    getActiveCellCount(nodeId) {
        const cellControllers = this.streamingMatrixCells.get(nodeId);
        return cellControllers ? cellControllers.size : 0;
    }
}

test('MatrixCellTracker: single cell fill tracking', () => {
    const tracker = new MatrixCellTracker();

    const controller = tracker.startCellFill('matrix-1', 0, 0);

    assertTrue(tracker.isMatrixFilling('matrix-1'), 'Matrix should be filling');
    assertEqual(tracker.getActiveCellCount('matrix-1'), 1);
    assertFalse(controller.aborted, 'Controller should not be aborted initially');
});

test('MatrixCellTracker: multiple cells in same matrix', () => {
    const tracker = new MatrixCellTracker();

    // Simulate "Fill All" - multiple cells starting at once
    const c00 = tracker.startCellFill('matrix-1', 0, 0);
    const c01 = tracker.startCellFill('matrix-1', 0, 1);
    const c10 = tracker.startCellFill('matrix-1', 1, 0);
    const c11 = tracker.startCellFill('matrix-1', 1, 1);

    assertEqual(tracker.getActiveCellCount('matrix-1'), 4);

    // Complete some cells
    tracker.completeCellFill('matrix-1', 0, 0);
    assertEqual(tracker.getActiveCellCount('matrix-1'), 3);

    tracker.completeCellFill('matrix-1', 1, 1);
    assertEqual(tracker.getActiveCellCount('matrix-1'), 2);
});

test('MatrixCellTracker: stop all cells aborts all controllers', () => {
    const tracker = new MatrixCellTracker();

    const c00 = tracker.startCellFill('matrix-1', 0, 0);
    const c01 = tracker.startCellFill('matrix-1', 0, 1);
    const c10 = tracker.startCellFill('matrix-1', 1, 0);

    // Stop button pressed
    const abortedCount = tracker.stopAllCellFills('matrix-1');

    assertEqual(abortedCount, 3);
    assertTrue(c00.aborted, 'Cell 0,0 should be aborted');
    assertTrue(c01.aborted, 'Cell 0,1 should be aborted');
    assertTrue(c10.aborted, 'Cell 1,0 should be aborted');
});

test('MatrixCellTracker: cleanup removes matrix entry when all cells complete', () => {
    const tracker = new MatrixCellTracker();

    tracker.startCellFill('matrix-1', 0, 0);
    tracker.startCellFill('matrix-1', 0, 1);

    assertTrue(tracker.isMatrixFilling('matrix-1'), 'Matrix should be filling');

    // Complete all cells (simulates finally blocks running)
    tracker.completeCellFill('matrix-1', 0, 0);
    assertTrue(tracker.isMatrixFilling('matrix-1'), 'Matrix should still be filling with one cell');

    tracker.completeCellFill('matrix-1', 0, 1);

    assertFalse(tracker.isMatrixFilling('matrix-1'), 'Matrix should not be filling after all complete');
    assertEqual(tracker.streamingMatrixCells.size, 0, 'Map should be empty after cleanup');
});

test('MatrixCellTracker: multiple matrices tracked independently', () => {
    const tracker = new MatrixCellTracker();

    // Fill cells in two different matrices
    tracker.startCellFill('matrix-1', 0, 0);
    tracker.startCellFill('matrix-1', 0, 1);
    tracker.startCellFill('matrix-2', 0, 0);

    assertEqual(tracker.getActiveCellCount('matrix-1'), 2);
    assertEqual(tracker.getActiveCellCount('matrix-2'), 1);

    // Stop only matrix-1
    tracker.stopAllCellFills('matrix-1');

    // matrix-2 should still be active
    assertTrue(tracker.isMatrixFilling('matrix-2'), 'Matrix 2 should still be filling');
});

test('MatrixCellTracker: stop non-existent matrix returns 0', () => {
    const tracker = new MatrixCellTracker();

    const abortedCount = tracker.stopAllCellFills('non-existent');
    assertEqual(abortedCount, 0);
});

test('MatrixCellTracker: same cell can be restarted after completion', () => {
    const tracker = new MatrixCellTracker();

    // Fill and complete (simulates the finally block running)
    const c1 = tracker.startCellFill('matrix-1', 0, 0);
    tracker.completeCellFill('matrix-1', 0, 0);  // finally block cleanup

    assertFalse(tracker.isMatrixFilling('matrix-1'), 'Should not be filling after complete');

    const c2 = tracker.startCellFill('matrix-1', 0, 0);

    assertTrue(tracker.isMatrixFilling('matrix-1'), 'Should be filling after restart');
    assertTrue(c1 !== c2, 'New controller should be different instance');
});

// ============================================================
// Matrix cell concurrent update tests
// ============================================================
// These tests verify the fix for the matrix cell persistence bug where
// concurrent cell fills would overwrite each other due to stale snapshots.

// Mock Graph class for testing (since CRDTGraph requires Yjs which needs browser)
class Graph {
    constructor(data = {}) {
        this.nodes = new Map();
        this.edges = [];
        this.tags = {};
        this.outgoingEdges = new Map();
        this.incomingEdges = new Map();

        if (data.nodes) {
            for (const node of data.nodes) {
                if (!node.tags) node.tags = [];
                this.nodes.set(node.id, node);
            }
        }
        if (data.edges) {
            for (const edge of data.edges) {
                this.addEdgeToIndex(edge);
            }
            this.edges = data.edges;
        }
        if (data.tags) {
            this.tags = data.tags;
        }
    }

    addEdgeToIndex(edge) {
        if (!this.outgoingEdges.has(edge.source)) {
            this.outgoingEdges.set(edge.source, []);
        }
        this.outgoingEdges.get(edge.source).push(edge);

        if (!this.incomingEdges.has(edge.target)) {
            this.incomingEdges.set(edge.target, []);
        }
        this.incomingEdges.get(edge.target).push(edge);
    }

    addNode(node) {
        this.nodes.set(node.id, node);
        return node;
    }

    getNode(id) {
        return this.nodes.get(id);
    }

    updateNode(id, updates) {
        const node = this.nodes.get(id);
        if (node) {
            Object.assign(node, updates);
        }
        return node;
    }
}

test('Matrix cells: sequential updates preserve all cells', () => {
    // Setup: Create a graph with a matrix node
    const graph = new Graph();
    const matrix = createMatrixNodeReal(
        'Test matrix',
        ['id1'],
        ['Row A', 'Row B'],
        ['Col 1', 'Col 2']
    );
    graph.addNode(matrix);

    // Simulate sequential cell fills (no race condition)
    // Fill cell 0-0
    let currentNode = graph.getNode(matrix.id);
    let updatedCells = { ...currentNode.cells, '0-0': { content: 'A1', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCells });

    // Fill cell 0-1
    currentNode = graph.getNode(matrix.id);
    updatedCells = { ...currentNode.cells, '0-1': { content: 'A2', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCells });

    // Fill cell 1-0
    currentNode = graph.getNode(matrix.id);
    updatedCells = { ...currentNode.cells, '1-0': { content: 'B1', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCells });

    // Verify all cells are preserved
    const finalNode = graph.getNode(matrix.id);
    assertEqual(finalNode.cells['0-0'].content, 'A1');
    assertEqual(finalNode.cells['0-1'].content, 'A2');
    assertEqual(finalNode.cells['1-0'].content, 'B1');
});

test('Matrix cells: stale cells snapshot causes data loss (demonstrates the bug)', () => {
    // This test demonstrates the BUG that was fixed.
    // The issue: spreading cells from a stale snapshot (before other cells were filled)
    // causes filled cells to be overwritten with empty/stale versions.

    const graph = new Graph();
    const matrix = createMatrixNodeReal(
        'Test matrix',
        ['id1'],
        ['Row A', 'Row B'],
        ['Col 1', 'Col 2']
    );
    graph.addNode(matrix);

    // Simulate the BUG: two concurrent fills both capture cells snapshot at start
    // This mimics what happened in the old code where matrixNode was captured once
    // and matrixNode.cells was spread later
    const staleCellsA = { ...graph.getNode(matrix.id).cells };  // All cells empty/unfilled
    const staleCellsB = { ...graph.getNode(matrix.id).cells };  // All cells empty/unfilled

    // Cell A completes and writes its filled content
    const updatedCellsA = { ...staleCellsA, '0-0': { content: 'A1', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCellsA });

    // Verify cell A was written and is filled
    assertEqual(graph.getNode(matrix.id).cells['0-0'].content, 'A1');
    assertTrue(graph.getNode(matrix.id).cells['0-0'].filled, 'Cell 0-0 should be filled');

    // Cell B completes and writes using ITS stale snapshot (the bug!)
    // staleCellsB was captured BEFORE cell A was filled, so it has the old empty version
    const updatedCellsB = { ...staleCellsB, '0-1': { content: 'A2', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCellsB });

    // Verify the bug: cell 0-0's filled content was lost!
    const finalNode = graph.getNode(matrix.id);
    // Cell 0-0 was reverted to empty because staleCellsB had the old unfilled version
    assertFalse(finalNode.cells['0-0'].filled, 'BUG: Cell 0-0 should have been overwritten to unfilled');
    assertEqual(finalNode.cells['0-0'].content, null); // Lost the 'A1' content
    assertEqual(finalNode.cells['0-1'].content, 'A2'); // Cell B exists
    assertTrue(finalNode.cells['0-1'].filled, 'Cell 0-1 should be filled');
});

test('Matrix cells: re-read pattern preserves concurrent updates (the fix)', () => {
    // This test verifies the FIX: always re-read node state before writing.

    const graph = new Graph();
    const matrix = createMatrixNodeReal(
        'Test matrix',
        ['id1'],
        ['Row A', 'Row B'],
        ['Col 1', 'Col 2']
    );
    graph.addNode(matrix);

    // Simulate parallel fills - each re-reads current state before writing (the fix)

    // Cell A completes
    let currentNode = graph.getNode(matrix.id);
    let currentCells = currentNode?.cells || {};
    let updatedCells = { ...currentCells, '0-0': { content: 'A1', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCells });

    // Cell B completes - re-reads current state (includes cell A now)
    currentNode = graph.getNode(matrix.id);
    currentCells = currentNode?.cells || {};
    updatedCells = { ...currentCells, '0-1': { content: 'A2', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCells });

    // Cell C completes - re-reads current state (includes cells A and B)
    currentNode = graph.getNode(matrix.id);
    currentCells = currentNode?.cells || {};
    updatedCells = { ...currentCells, '1-0': { content: 'B1', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCells });

    // Cell D completes - re-reads current state (includes all previous)
    currentNode = graph.getNode(matrix.id);
    currentCells = currentNode?.cells || {};
    updatedCells = { ...currentCells, '1-1': { content: 'B2', filled: true } };
    graph.updateNode(matrix.id, { cells: updatedCells });

    // Verify ALL cells are preserved
    const finalNode = graph.getNode(matrix.id);
    assertEqual(finalNode.cells['0-0'].content, 'A1');
    assertEqual(finalNode.cells['0-1'].content, 'A2');
    assertEqual(finalNode.cells['1-0'].content, 'B1');
    assertEqual(finalNode.cells['1-1'].content, 'B2');
    assertTrue(Object.keys(finalNode.cells).length === 4, 'All 4 cells should exist');
});

// ============================================================
// MatrixNode Rendering Tests (index column resize feature)
// ============================================================

// Mock canvas for testing renderContent
const mockCanvas = {
    escapeHtml: (text) => {
        if (text == null) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

test('MatrixNode renderContent: includes resize handle', () => {
    const node = {
        type: NodeType.MATRIX,
        context: 'Test Context',
        rowItems: ['Row1'],
        colItems: ['Col1'],
        cells: {}
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('index-col-resize-handle'), 'Should include resize handle div');
    assertTrue(html.includes('corner-cell'), 'Should have corner cell');
});

test('MatrixNode renderContent: applies indexColWidth when set', () => {
    const node = {
        type: NodeType.MATRIX,
        context: 'Test',
        rowItems: ['A'],
        colItems: ['X'],
        cells: {},
        indexColWidth: '35%'
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('--index-col-width: 35%'), 'Should include CSS variable with width');
    assertTrue(html.includes('style="--index-col-width: 35%"'), 'Should have style attribute on table');
});

test('MatrixNode renderContent: no style attr when indexColWidth not set', () => {
    const node = {
        type: NodeType.MATRIX,
        context: 'Test',
        rowItems: ['A'],
        colItems: ['X'],
        cells: {}
        // No indexColWidth set
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertFalse(html.includes('--index-col-width'), 'Should not include CSS variable');
    // The table should start without a style attribute
    assertTrue(html.includes('<table class="matrix-table"><thead>'), 'Table should have no style attr');
});
