/**
 * Tests for graph-types.js
 * Tests node/edge creation functions and type definitions.
 */

import {
    test,
    assertEqual,
    assertTrue,
    assertFalse,
    NodeType,
    DEFAULT_NODE_SIZES,
    getDefaultNodeSize,
    createNodeReal,
    createMatrixNodeReal,
    createRowNodeReal,
    createColumnNodeReal
} from './test_setup.js';

// ============================================================
// Node creation tests
// ============================================================

/**
 * Create a new node for testing
 * NOTE: Using actual implementation from graph-types.js, but with test-specific ID generation
 * for predictable test IDs. The real createNode uses crypto.randomUUID() which is harder to test.
 */
function createNode(type, content, options = {}) {
    // Use real implementation but override ID generation for tests
    const realNode = createNodeReal(type, content, options);
    // Override ID with test-specific format for easier test assertions
    realNode.id = 'test-id-' + Math.random().toString(36).substr(2, 9);
    return realNode;
}

test('createNode: basic node creation', () => {
    const node = createNode(NodeType.HUMAN, 'Hello');
    assertEqual(node.type, NodeType.HUMAN);
    assertEqual(node.content, 'Hello');
    assertEqual(node.position.x, 0);
    assertEqual(node.position.y, 0);
    assertTrue(node.id.startsWith('test-id-'));
});

test('createNode: scrollable node types get fixed size', () => {
    const node = createNode(NodeType.AI, 'Response');
    assertEqual(node.width, 640);
    assertEqual(node.height, 480);
});

test('createNode: all node types have default sizes', () => {
    // All nodes now have fixed dimensions (no more undefined)
    const node = createNode(NodeType.HUMAN, 'Hello');
    assertEqual(node.width, 420);  // Small node default
    assertEqual(node.height, 200);
});

test('createNode: custom position', () => {
    const node = createNode(NodeType.HUMAN, 'Hello', { position: { x: 100, y: 200 } });
    assertEqual(node.position.x, 100);
    assertEqual(node.position.y, 200);
});

test('createNode: custom width/height override defaults', () => {
    const node = createNode(NodeType.AI, 'Response', { width: 800, height: 600 });
    assertEqual(node.width, 800);
    assertEqual(node.height, 600);
});

test('createNode: tags array initialized', () => {
    const node = createNode(NodeType.HUMAN, 'Hello');
    assertTrue(Array.isArray(node.tags));
    assertEqual(node.tags.length, 0);
});

test('createNode: custom tags', () => {
    const node = createNode(NodeType.HUMAN, 'Hello', { tags: ['red', 'blue'] });
    assertEqual(node.tags.length, 2);
    assertEqual(node.tags[0], 'red');
});

// ============================================================
// Matrix node creation tests
// ============================================================

/**
 * Create a matrix node for testing
 * NOTE: Using actual implementation from graph-types.js, but with test-specific ID generation
 */
function createMatrixNode(context, contextNodeIds, rowItems, colItems, options = {}) {
    const realNode = createMatrixNodeReal(context, contextNodeIds, rowItems, colItems, options);
    // Override ID with test-specific format for easier test assertions
    realNode.id = 'test-id-' + Math.random().toString(36).substr(2, 9);
    return realNode;
}

test('createMatrixNode: creates matrix with cells', () => {
    const matrix = createMatrixNode('Compare products', ['id1'], ['Product A', 'Product B'], ['Price', 'Quality']);
    assertEqual(matrix.type, NodeType.MATRIX);
    assertEqual(matrix.context, 'Compare products');
    assertEqual(matrix.rowItems.length, 2);
    assertEqual(matrix.colItems.length, 2);
    assertEqual(Object.keys(matrix.cells).length, 4);
    assertEqual(matrix.cells['0-0'].filled, false);
});

test('createMatrixNode: initializes all cells as empty', () => {
    const matrix = createMatrixNode('Test', ['id1'], ['Row1', 'Row2'], ['Col1', 'Col2', 'Col3']);
    assertEqual(Object.keys(matrix.cells).length, 6);
    for (const cell of Object.values(matrix.cells)) {
        assertEqual(cell.content, null);
        assertFalse(cell.filled);
    }
});

// ============================================================
// Row node creation tests
// ============================================================

/**
 * Create a row node for testing
 * NOTE: Using actual implementation from graph-types.js, but with test-specific ID generation
 */
function createRowNode(matrixId, rowIndex, rowItem, colItems, cellContents, options = {}) {
    const realNode = createRowNodeReal(matrixId, rowIndex, rowItem, colItems, cellContents, options);
    // Override ID with test-specific format for easier test assertions
    realNode.id = 'test-id-' + Math.random().toString(36).substr(2, 9);
    return realNode;
}

test('createRowNode: formats row content correctly', () => {
    const row = createRowNode('matrix-1', 0, 'Product A', ['Price', 'Quality'], ['$10', 'Good']);
    assertEqual(row.type, NodeType.ROW);
    assertEqual(row.rowItem, 'Product A');
    assertTrue(row.content.includes('**Row: Product A**'));
    assertTrue(row.content.includes('### Price'));
    assertTrue(row.content.includes('$10'));
});

test('createRowNode: handles empty cells', () => {
    const row = createRowNode('matrix-1', 0, 'Product A', ['Price', 'Quality'], ['$10', null]);
    assertTrue(row.content.includes('*(empty)*'));
});

// ============================================================
// Column node creation tests
// ============================================================

/**
 * Create a column node for testing
 * NOTE: Using actual implementation from graph-types.js, but with test-specific ID generation
 */
function createColumnNode(matrixId, colIndex, colItem, rowItems, cellContents, options = {}) {
    const realNode = createColumnNodeReal(matrixId, colIndex, colItem, rowItems, cellContents, options);
    // Override ID with test-specific format for easier test assertions
    realNode.id = 'test-id-' + Math.random().toString(36).substr(2, 9);
    return realNode;
}

test('createColumnNode: formats column content correctly', () => {
    const col = createColumnNode('matrix-1', 0, 'Price', ['Product A', 'Product B'], ['$10', '$20']);
    assertEqual(col.type, NodeType.COLUMN);
    assertEqual(col.colItem, 'Price');
    assertTrue(col.content.includes('**Column: Price**'));
    assertTrue(col.content.includes('### Product A'));
    assertTrue(col.content.includes('$10'));
});

// ============================================================
// getDefaultNodeSize tests
// ============================================================

test('getDefaultNodeSize: returns correct size for AI node', () => {
    const size = getDefaultNodeSize(NodeType.AI);
    assertEqual(size.width, 640);
    assertEqual(size.height, 480);
});

test('getDefaultNodeSize: returns correct size for HUMAN node', () => {
    const size = getDefaultNodeSize(NodeType.HUMAN);
    assertEqual(size.width, 420);
    assertEqual(size.height, 200);
});

test('getDefaultNodeSize: returns default for unknown type', () => {
    const size = getDefaultNodeSize('unknown');
    assertEqual(size.width, 420);
    assertEqual(size.height, 200);
});
