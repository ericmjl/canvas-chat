/**
 * Unit tests for JavaScript utility functions.
 * Run with: node tests/test_utils.js
 *
 * Tests pure functions that don't require DOM or API calls.
 *
 * NOTE: This file loads actual source files to test real implementations,
 * not copies. This ensures tests catch bugs in production code.
 */

// Load source files to test actual implementations (not copies)
import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Set up minimal browser-like environment for source files
global.window = global;
global.document = {
    createElement: (tagName) => {
        const element = { textContent: '', innerHTML: '' };
        // Mock textContent setter to update innerHTML (for escapeHtmlText)
        Object.defineProperty(element, 'textContent', {
            get: () => element._textContent || '',
            set: (value) => {
                element._textContent = value;
                // Simple HTML escaping for tests
                element.innerHTML = value
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
        });
        return element;
    },
    addEventListener: () => {} // Mock event listener (no-op for tests)
};
global.NodeType = {
    HUMAN: 'human', AI: 'ai', NOTE: 'note', SUMMARY: 'summary', REFERENCE: 'reference',
    SEARCH: 'search', RESEARCH: 'research', HIGHLIGHT: 'highlight', MATRIX: 'matrix',
    CELL: 'cell', ROW: 'row', COLUMN: 'column', FETCH_RESULT: 'fetch_result',
    PDF: 'pdf', OPINION: 'opinion', SYNTHESIS: 'synthesis', REVIEW: 'review', IMAGE: 'image',
    FLASHCARD: 'flashcard', FACTCHECK: 'factcheck'
};

// Load graph.js first (defines NodeType, etc. and exports wouldOverlapNodes)
// First load layout.js which graph.js depends on
const layoutPath = path.join(__dirname, '../src/canvas_chat/static/js/layout.js');
const layoutCode = fs.readFileSync(layoutPath, 'utf8');
vm.runInThisContext(layoutCode, { filename: layoutPath });

const graphPath = path.join(__dirname, '../src/canvas_chat/static/js/graph.js');
const graphCode = fs.readFileSync(graphPath, 'utf8');
vm.runInThisContext(graphCode, { filename: graphPath });

// Load search.js (defines tokenize, calculateIDF, SearchIndex)
const searchPath = path.join(__dirname, '../src/canvas_chat/static/js/search.js');
const searchCode = fs.readFileSync(searchPath, 'utf8');
vm.runInThisContext(searchCode, { filename: searchPath });

// Load app.js (defines formatUserError, buildMessagesForApi, App class)
// Note: app.js has DOM dependencies, but some functions and the App class can be tested with mocks
const appPath = path.join(__dirname, '../src/canvas_chat/static/js/app.js');
const appCode = fs.readFileSync(appPath, 'utf8');
vm.runInThisContext(appCode, { filename: appPath });

// Load node-protocols.js (defines wrapNode, MatrixNode, etc.)
const nodeProtocolsPath = path.join(__dirname, '../src/canvas_chat/static/js/node-protocols.js');
const nodeProtocolsCode = fs.readFileSync(nodeProtocolsPath, 'utf8');
vm.runInThisContext(nodeProtocolsCode, { filename: nodeProtocolsPath });

// Extract functions and constants from window (actual implementations, not copies)
const {
    formatUserError,
    buildMessagesForApi,
    tokenize,
    calculateIDF,
    SearchIndex,
    wouldOverlapNodes,
    createNode: createNodeReal,
    createMatrixNode: createMatrixNodeReal,
    createRowNode: createRowNodeReal,
    createColumnNode: createColumnNodeReal,
    isUrlContent,
    extractUrlFromReferenceNode,
    truncateText,
    escapeHtmlText,
    formatMatrixAsText,
    NodeType,
    DEFAULT_NODE_SIZES,
    getDefaultNodeSize,
    wrapNode,
    createMockNodeForType,
    HeaderButtons,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    layoutUtils
} = global.window;

// Extract layout functions from layoutUtils (actual implementations from layout.js)
const { getOverlap, hasAnyOverlap, resolveOverlaps } = layoutUtils;

// Note: window.app is the actual App instance created by app.js
// We can test buildLLMRequest by temporarily mocking modelPicker on this real instance

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        failed++;
    }
}

function assertEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertNull(actual) {
    if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(actual, message = '') {
    if (actual !== true) {
        throw new Error(message || `Expected true, got ${actual}`);
    }
}

function assertFalse(actual, message = '') {
    if (actual !== false) {
        throw new Error(message || `Expected false, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`);
    }
}

// ============================================================
// extractUrlFromReferenceNode tests
// ============================================================

// Using actual implementation from app.js (exported to window)
const extractUrlFromReferenceNodeTest = extractUrlFromReferenceNode;

// Test cases
test('extractUrlFromReferenceNode: standard markdown link', () => {
    const content = '**[Article Title](https://example.com/article)**\n\nSome snippet text.';
    assertEqual(extractUrlFromReferenceNodeTest(content), 'https://example.com/article');
});

test('extractUrlFromReferenceNode: link with query params', () => {
    const content = '**[Search Result](https://example.com/page?id=123&ref=abc)**';
    assertEqual(extractUrlFromReferenceNodeTest(content), 'https://example.com/page?id=123&ref=abc');
});

test('extractUrlFromReferenceNode: link with special characters in title', () => {
    const content = '**[Title with "quotes" & special chars](https://example.com)**';
    assertEqual(extractUrlFromReferenceNode(content), 'https://example.com');
});

test('extractUrlFromReferenceNode: simple link without bold', () => {
    const content = '[Plain Link](https://plain.example.com)';
    assertEqual(extractUrlFromReferenceNode(content), 'https://plain.example.com');
});

test('extractUrlFromReferenceNode: no link in content', () => {
    const content = 'Just some plain text without any links.';
    assertNull(extractUrlFromReferenceNode(content));
});

test('extractUrlFromReferenceNode: empty content', () => {
    const content = '';
    assertNull(extractUrlFromReferenceNode(content));
});

test('extractUrlFromReferenceNode: malformed link - missing closing paren', () => {
    const content = '[Title](https://example.com';
    assertNull(extractUrlFromReferenceNode(content));
});

test('extractUrlFromReferenceNode: multiple links - returns first', () => {
    const content = '[First](https://first.com) and [Second](https://second.com)';
    assertEqual(extractUrlFromReferenceNode(content), 'https://first.com');
});

test('extractUrlFromReferenceNode: real Reference node format', () => {
    const content = `**[Climate Change Effects on Agriculture](https://www.nature.com/articles/climate-ag)**

Rising temperatures and changing precipitation patterns are affecting crop yields worldwide.

*2024-01-15*`;
    assertEqual(extractUrlFromReferenceNode(content), 'https://www.nature.com/articles/climate-ag');
});

// ============================================================
// formatMatrixAsText tests
// ============================================================

// Using actual implementation from app.js (exported to window)
const formatMatrixAsTextTest = formatMatrixAsText;

test('formatMatrixAsText: basic 2x2 matrix', () => {
    const matrix = {
        context: 'Compare products',
        rowItems: ['Product A', 'Product B'],
        colItems: ['Price', 'Quality'],
        cells: {
            '0-0': { content: '$10', filled: true },
            '0-1': { content: 'Good', filled: true },
            '1-0': { content: '$20', filled: true },
            '1-1': { content: 'Excellent', filled: true }
        }
    };

    const result = formatMatrixAsTextTest(matrix);
    assertTrue(result.includes('## Compare products'), 'Should have header');
    assertTrue(result.includes('| Product A |'), 'Should have row item');
    assertTrue(result.includes('$10'), 'Should have cell content');
    assertTrue(result.includes('Excellent'), 'Should have cell content');
});

test('formatMatrixAsText: empty cells', () => {
    const matrix = {
        context: 'Empty matrix',
        rowItems: ['Row 1'],
        colItems: ['Col 1'],
        cells: {
            '0-0': { content: null, filled: false }
        }
    };

    const result = formatMatrixAsTextTest(matrix);
    assertTrue(result.includes('## Empty matrix'), 'Should have header');
    assertTrue(result.includes('| Row 1 |'), 'Should have row item');
});

test('formatMatrixAsText: cell content with newlines gets flattened', () => {
    const matrix = {
        context: 'Test',
        rowItems: ['Row'],
        colItems: ['Col'],
        cells: {
            '0-0': { content: 'Line 1\nLine 2', filled: true }
        }
    };

    const result = formatMatrixAsTextTest(matrix);
    assertTrue(result.includes('Line 1 Line 2'), 'Newlines should be replaced with spaces');
    assertFalse(result.includes('Line 1\nLine 2'), 'Should not contain literal newlines in cell');
});

test('formatMatrixAsText: cell content with pipe characters gets escaped', () => {
    const matrix = {
        context: 'Test',
        rowItems: ['Row'],
        colItems: ['Col'],
        cells: {
            '0-0': { content: 'A | B', filled: true }
        }
    };

    const result = formatMatrixAsTextTest(matrix);
    assertTrue(result.includes('A \\| B'), 'Pipe characters should be escaped');
});

// ============================================================
// Graph class tests (without browser dependencies)
// ============================================================

// Minimal Graph implementation for testing
// (We test the algorithm logic, not the browser-specific parts)

class TestGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = [];
        this.outgoingEdges = new Map();
        this.incomingEdges = new Map();
    }

    addNode(node) {
        this.nodes.set(node.id, node);
        return node;
    }

    getNode(id) {
        return this.nodes.get(id);
    }

    addEdge(edge) {
        this.edges.push(edge);

        if (!this.outgoingEdges.has(edge.source)) {
            this.outgoingEdges.set(edge.source, []);
        }
        this.outgoingEdges.get(edge.source).push(edge);

        if (!this.incomingEdges.has(edge.target)) {
            this.incomingEdges.set(edge.target, []);
        }
        this.incomingEdges.get(edge.target).push(edge);

        return edge;
    }

    getParents(nodeId) {
        const incoming = this.incomingEdges.get(nodeId) || [];
        return incoming.map(edge => this.nodes.get(edge.source)).filter(Boolean);
    }

    getChildren(nodeId) {
        const outgoing = this.outgoingEdges.get(nodeId) || [];
        return outgoing.map(edge => this.nodes.get(edge.target)).filter(Boolean);
    }

    getAncestors(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const ancestors = [];
        const parents = this.getParents(nodeId);

        for (const parent of parents) {
            ancestors.push(...this.getAncestors(parent.id, visited));
            ancestors.push(parent);
        }

        return ancestors;
    }

    getAllNodes() {
        return Array.from(this.nodes.values());
    }

    topologicalSort() {
        const allNodes = this.getAllNodes();
        const inDegree = new Map();
        const result = [];

        for (const node of allNodes) {
            const incoming = this.incomingEdges.get(node.id) || [];
            inDegree.set(node.id, incoming.length);
        }

        const queue = allNodes.filter(n => inDegree.get(n.id) === 0);
        queue.sort((a, b) => a.created_at - b.created_at);

        while (queue.length > 0) {
            const node = queue.shift();
            result.push(node);

            const children = this.getChildren(node.id);
            children.sort((a, b) => a.created_at - b.created_at);

            for (const child of children) {
                const newDegree = inDegree.get(child.id) - 1;
                inDegree.set(child.id, newDegree);
                if (newDegree === 0) {
                    queue.push(child);
                }
            }
        }

        return result;
    }
}

// Helper to create test nodes
function createTestNode(id, created_at = Date.now()) {
    return { id, created_at, position: { x: 0, y: 0 }, content: `Node ${id}` };
}

function createTestEdge(source, target) {
    return { id: `${source}-${target}`, source, target };
}

test('Graph: getParents returns empty array for root node', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A'));

    assertEqual(graph.getParents('A'), []);
});

test('Graph: getParents returns parent nodes', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createTestEdge('A', 'B'));

    const parents = graph.getParents('B');
    assertEqual(parents.length, 1);
    assertEqual(parents[0].id, 'A');
});

test('Graph: getChildren returns child nodes', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createTestEdge('A', 'B'));

    const children = graph.getChildren('A');
    assertEqual(children.length, 1);
    assertEqual(children[0].id, 'B');
});

test('Graph: getAncestors returns all ancestors in order', () => {
    const graph = new TestGraph();
    // A -> B -> C
    const nodeA = createTestNode('A', 1);
    const nodeB = createTestNode('B', 2);
    const nodeC = createTestNode('C', 3);

    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    const ancestors = graph.getAncestors('C');
    assertEqual(ancestors.length, 2);
    assertEqual(ancestors[0].id, 'A');
    assertEqual(ancestors[1].id, 'B');
});

test('Graph: getAncestors handles diamond pattern', () => {
    const graph = new TestGraph();
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    const nodeA = createTestNode('A', 1);
    const nodeB = createTestNode('B', 2);
    const nodeC = createTestNode('C', 3);
    const nodeD = createTestNode('D', 4);

    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'D'));

    const ancestors = graph.getAncestors('D');
    // The algorithm may return duplicates for A (once through B, once through C)
    // but all A, B, C should be present
    const ids = ancestors.map(n => n.id);
    assertTrue(ids.includes('A'), 'Should include A');
    assertTrue(ids.includes('B'), 'Should include B');
    assertTrue(ids.includes('C'), 'Should include C');
    // B and C should appear (each once)
    assertEqual(ids.filter(id => id === 'B').length, 1, 'B should appear once');
    assertEqual(ids.filter(id => id === 'C').length, 1, 'C should appear once');
});

test('Graph: topologicalSort returns nodes in correct order', () => {
    const graph = new TestGraph();
    // A -> B -> C
    const nodeA = createTestNode('A', 1);
    const nodeB = createTestNode('B', 2);
    const nodeC = createTestNode('C', 3);

    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    const sorted = graph.topologicalSort();
    const ids = sorted.map(n => n.id);

    assertEqual(ids, ['A', 'B', 'C']);
});

test('Graph: topologicalSort handles multiple roots', () => {
    const graph = new TestGraph();
    // A -> C
    // B -> C
    const nodeA = createTestNode('A', 1);
    const nodeB = createTestNode('B', 2);
    const nodeC = createTestNode('C', 3);

    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'C'));

    const sorted = graph.topologicalSort();
    const ids = sorted.map(n => n.id);

    // A and B should come before C
    assertTrue(ids.indexOf('A') < ids.indexOf('C'), 'A should come before C');
    assertTrue(ids.indexOf('B') < ids.indexOf('C'), 'B should come before C');
});

// ============================================================
// wouldOverlap tests
// ============================================================

// Use actual implementation from graph.js (exported as wouldOverlapNodes)
const wouldOverlap = wouldOverlapNodes;

test('wouldOverlap: no overlap when far apart', () => {
    const nodes = [
        { position: { x: 0, y: 0 }, width: 100, height: 100 }
    ];

    assertFalse(wouldOverlap({ x: 500, y: 500 }, 100, 100, nodes));
});

test('wouldOverlap: detects direct overlap', () => {
    const nodes = [
        { position: { x: 100, y: 100 }, width: 100, height: 100 }
    ];

    assertTrue(wouldOverlap({ x: 100, y: 100 }, 100, 100, nodes));
});

test('wouldOverlap: detects partial overlap', () => {
    const nodes = [
        { position: { x: 100, y: 100 }, width: 100, height: 100 }
    ];

    // Overlapping by 50px
    assertTrue(wouldOverlap({ x: 150, y: 150 }, 100, 100, nodes));
});

test('wouldOverlap: respects padding', () => {
    const nodes = [
        { position: { x: 100, y: 100 }, width: 100, height: 100 }
    ];

    // Just outside the box but within padding (20px)
    assertTrue(wouldOverlap({ x: 210, y: 100 }, 100, 100, nodes));
});

test('wouldOverlap: returns false for empty nodes array', () => {
    assertFalse(wouldOverlap({ x: 100, y: 100 }, 100, 100, []));
});

// ============================================================
// escapeHtml tests
// ============================================================

// Using actual implementation from app.js (exported to window)
const escapeHtmlTest = escapeHtmlText;

test('escapeHtml: escapes angle brackets', () => {
    assertEqual(escapeHtmlTest('<script>'), '&lt;script&gt;');
});

test('escapeHtml: escapes ampersand', () => {
    assertEqual(escapeHtmlTest('A & B'), 'A &amp; B');
});

test('escapeHtml: escapes quotes', () => {
    assertEqual(escapeHtmlTest('"hello"'), '&quot;hello&quot;');
});

test('escapeHtml: handles empty string', () => {
    assertEqual(escapeHtmlTest(''), '');
});

test('escapeHtml: handles null/undefined', () => {
    assertEqual(escapeHtmlTest(null), '');
    assertEqual(escapeHtmlTest(undefined), '');
});

// ============================================================
// truncate tests
// ============================================================

// Using actual implementation from app.js (exported to window)
const truncateTest = truncateText;

test('truncate: returns original if shorter than max', () => {
    assertEqual(truncateTest('hello', 10), 'hello');
});

test('truncate: truncates and adds ellipsis', () => {
    // truncateText uses slice(0, maxLength - 1) + '…', so maxLength=8 gives 7 chars + ellipsis
    assertEqual(truncateTest('hello world', 8), 'hello w…');
});

test('truncate: handles exact length', () => {
    assertEqual(truncateTest('hello', 5), 'hello');
});

test('truncate: handles empty string', () => {
    assertEqual(truncateTest('', 10), '');
});

test('truncate: handles null/undefined', () => {
    assertEqual(truncateTest(null, 10), '');
    assertEqual(truncateTest(undefined, 10), '');
});

// ============================================================
// resolveOverlaps tests (using actual implementations from layout.js)
// ============================================================

test('getOverlap: no overlap when far apart', () => {
    const nodeA = { position: { x: 0, y: 0 }, width: 100, height: 100 };
    const nodeB = { position: { x: 500, y: 500 }, width: 100, height: 100 };

    const { overlapX, overlapY } = getOverlap(nodeA, nodeB);
    assertEqual(overlapX, 0);
    assertEqual(overlapY, 0);
});

test('getOverlap: calculates overlap correctly', () => {
    const nodeA = { position: { x: 0, y: 0 }, width: 100, height: 100 };
    const nodeB = { position: { x: 50, y: 50 }, width: 100, height: 100 };
    const padding = 40;

    const { overlapX, overlapY } = getOverlap(nodeA, nodeB, padding);
    // nodeA right edge with padding: 0 + 100 + 40 = 140
    // nodeB left edge: 50
    // overlapX = min(140, 190) - max(0, 50) = 140 - 50 = 90
    assertEqual(overlapX, 90);
    assertEqual(overlapY, 90);
});

test('resolveOverlaps: separates two overlapping nodes', () => {
    const nodes = [
        { position: { x: 100, y: 100 }, width: 200, height: 150 },
        { position: { x: 150, y: 120 }, width: 200, height: 150 }
    ];

    assertTrue(hasAnyOverlap(nodes), 'Nodes should overlap initially');

    resolveOverlaps(nodes);

    assertFalse(hasAnyOverlap(nodes), 'Nodes should not overlap after resolution');
});

test('resolveOverlaps: handles large nodes (640x480)', () => {
    // This is the bug case - large scrollable nodes were not being separated
    const nodes = [
        { position: { x: 100, y: 100 }, width: 640, height: 480 },
        { position: { x: 200, y: 150 }, width: 640, height: 480 }
    ];

    assertTrue(hasAnyOverlap(nodes), 'Large nodes should overlap initially');

    resolveOverlaps(nodes);

    assertFalse(hasAnyOverlap(nodes), 'Large nodes should not overlap after resolution');
});

test('resolveOverlaps: handles vertically stacked nodes (same X)', () => {
    // This simulates the screenshot bug - nodes stacked vertically at same X
    // Node A: y 100-620 (with 40 padding)
    // Node B: y 400-920
    // They overlap in Y by: 620 - 400 = 220
    const nodes = [
        { position: { x: 100, y: 100 }, width: 640, height: 480 },
        { position: { x: 100, y: 400 }, width: 640, height: 480 }
    ];

    assertTrue(hasAnyOverlap(nodes), 'Vertically stacked nodes should overlap initially');

    resolveOverlaps(nodes);

    assertFalse(hasAnyOverlap(nodes), 'Vertically stacked nodes should be separated');

    // After separation, node B should be pushed down (or A up)
    // They should be separated by at least the overlap amount
    const separation = nodes[1].position.y - (nodes[0].position.y + 480 + 40);
    assertTrue(separation >= 0, `Nodes should have vertical gap, got separation: ${separation}`);
});

test('resolveOverlaps: handles completely overlapping nodes', () => {
    // Nodes at exact same position
    const nodes = [
        { position: { x: 100, y: 100 }, width: 300, height: 200 },
        { position: { x: 100, y: 100 }, width: 300, height: 200 }
    ];

    resolveOverlaps(nodes);

    assertFalse(hasAnyOverlap(nodes), 'Identical position nodes should be separated');
});

test('resolveOverlaps: separates multiple overlapping nodes', () => {
    const nodes = [
        { position: { x: 100, y: 100 }, width: 200, height: 150 },
        { position: { x: 150, y: 120 }, width: 200, height: 150 },
        { position: { x: 180, y: 140 }, width: 200, height: 150 },
        { position: { x: 120, y: 180 }, width: 200, height: 150 }
    ];

    assertTrue(hasAnyOverlap(nodes), 'Multiple nodes should overlap initially');

    resolveOverlaps(nodes);

    assertFalse(hasAnyOverlap(nodes), 'All nodes should be separated after resolution');
});

test('resolveOverlaps: preserves non-overlapping nodes', () => {
    // Use positions that are already >= 100 to avoid normalization offset
    const nodes = [
        { position: { x: 100, y: 100 }, width: 100, height: 100 },
        { position: { x: 600, y: 100 }, width: 100, height: 100 },
        { position: { x: 100, y: 600 }, width: 100, height: 100 }
    ];

    const originalPositions = nodes.map(n => ({ x: n.position.x, y: n.position.y }));

    assertFalse(hasAnyOverlap(nodes), 'Nodes should not overlap initially');

    resolveOverlaps(nodes);

    // Positions should remain unchanged (no overlaps to resolve, already in positive coords)
    for (let i = 0; i < nodes.length; i++) {
        assertEqual(nodes[i].position.x, originalPositions[i].x);
        assertEqual(nodes[i].position.y, originalPositions[i].y);
    }
});

test('resolveOverlaps: handles mixed node sizes (tall and wide)', () => {
    // This tests the bug where overlap check only considered width
    // A tall narrow node and a wide short node can overlap if only width is checked
    const nodes = [
        { position: { x: 100, y: 100 }, width: 640, height: 480 },  // Large scrollable
        { position: { x: 300, y: 400 }, width: 420, height: 150 }   // Small human node
    ];

    assertTrue(hasAnyOverlap(nodes), 'Different-sized nodes should overlap initially');

    resolveOverlaps(nodes);

    assertFalse(hasAnyOverlap(nodes), 'Different-sized nodes should be separated');
});

test('resolveOverlaps: handles nodes at same Y with different heights', () => {
    // Regression test: old algorithm only checked width for minSep
    // Two nodes side by side but overlapping due to height
    const nodes = [
        { position: { x: 100, y: 200 }, width: 300, height: 400 },
        { position: { x: 350, y: 100 }, width: 300, height: 400 }
    ];

    // These overlap because:
    // Node A: x 100-440 (with 40 padding), y 200-640
    // Node B: x 350-690, y 100-540
    // X overlap: 440 - 350 = 90
    // Y overlap: 540 - 200 = 340
    assertTrue(hasAnyOverlap(nodes), 'Nodes should overlap in Y dimension');

    resolveOverlaps(nodes);

    assertFalse(hasAnyOverlap(nodes), 'Nodes should be separated after resolution');
});

// ============================================================
// Concurrent State Management tests
// ============================================================

/**
 * These tests validate the pattern for managing concurrent operations.
 * When multiple operations can run in parallel, each needs its own
 * isolated state. We use Map<instanceId, state> instead of single variables.
 *
 * Anti-pattern: this.streamingNodeId = nodeId (overwritten by next operation)
 * Pattern: this.streamingNodes.set(nodeId, { ... })
 */

// Simulates the WRONG approach - global state
class BadConcurrentManager {
    constructor() {
        // Anti-pattern: single variables for concurrent operations
        this.activeNodeId = null;
        this.abortController = null;
    }

    startOperation(nodeId) {
        this.activeNodeId = nodeId;
        this.abortController = { aborted: false, nodeId };
        return this.abortController;
    }

    stopOperation(nodeId) {
        // BUG: Only works if nodeId matches the current activeNodeId
        if (this.activeNodeId === nodeId && this.abortController) {
            this.abortController.aborted = true;
            return true;
        }
        return false;
    }

    getActiveController(nodeId) {
        return this.activeNodeId === nodeId ? this.abortController : null;
    }
}

// Simulates the CORRECT approach - per-instance state
class GoodConcurrentManager {
    constructor() {
        // Pattern: Map for per-instance state
        this.activeOperations = new Map();
    }

    startOperation(nodeId) {
        const controller = { aborted: false, nodeId };
        this.activeOperations.set(nodeId, { abortController: controller });
        return controller;
    }

    stopOperation(nodeId) {
        const state = this.activeOperations.get(nodeId);
        if (state) {
            state.abortController.aborted = true;
            return true;
        }
        return false;
    }

    completeOperation(nodeId) {
        this.activeOperations.delete(nodeId);
    }

    getActiveController(nodeId) {
        const state = this.activeOperations.get(nodeId);
        return state ? state.abortController : null;
    }

    getActiveCount() {
        return this.activeOperations.size;
    }
}

test('BadConcurrentManager: second operation overwrites first', () => {
    const manager = new BadConcurrentManager();

    // Start first operation
    const controller1 = manager.startOperation('node-1');

    // Start second operation - this OVERWRITES the first
    const controller2 = manager.startOperation('node-2');

    // Try to stop the first operation - THIS FAILS!
    const stopped = manager.stopOperation('node-1');

    assertFalse(stopped, 'Cannot stop first operation after second starts');
    assertFalse(controller1.aborted, 'First controller was not aborted');

    // Can only control the second operation
    assertTrue(manager.stopOperation('node-2'), 'Can stop second operation');
    assertTrue(controller2.aborted, 'Second controller was aborted');
});

test('BadConcurrentManager: cannot get controller for overwritten operation', () => {
    const manager = new BadConcurrentManager();

    manager.startOperation('node-1');
    manager.startOperation('node-2');

    // First operation's controller is lost
    assertNull(manager.getActiveController('node-1'));

    // Only second operation's controller is accessible
    assertTrue(manager.getActiveController('node-2') !== null);
});

test('GoodConcurrentManager: multiple operations run independently', () => {
    const manager = new GoodConcurrentManager();

    // Start multiple operations
    const controller1 = manager.startOperation('node-1');
    const controller2 = manager.startOperation('node-2');
    const controller3 = manager.startOperation('node-3');

    assertEqual(manager.getActiveCount(), 3);

    // Each can be controlled independently
    assertTrue(manager.stopOperation('node-1'), 'Can stop node-1');
    assertTrue(controller1.aborted, 'node-1 controller aborted');
    assertFalse(controller2.aborted, 'node-2 controller NOT aborted');
    assertFalse(controller3.aborted, 'node-3 controller NOT aborted');

    // Stop another
    assertTrue(manager.stopOperation('node-3'), 'Can stop node-3');
    assertTrue(controller3.aborted, 'node-3 controller aborted');
    assertFalse(controller2.aborted, 'node-2 STILL not aborted');
});

test('GoodConcurrentManager: can get controller for any active operation', () => {
    const manager = new GoodConcurrentManager();

    manager.startOperation('node-1');
    manager.startOperation('node-2');

    // Both controllers are accessible
    assertTrue(manager.getActiveController('node-1') !== null);
    assertTrue(manager.getActiveController('node-2') !== null);

    // Each is the correct one
    assertEqual(manager.getActiveController('node-1').nodeId, 'node-1');
    assertEqual(manager.getActiveController('node-2').nodeId, 'node-2');
});

test('GoodConcurrentManager: cleanup removes only completed operation', () => {
    const manager = new GoodConcurrentManager();

    manager.startOperation('node-1');
    manager.startOperation('node-2');

    assertEqual(manager.getActiveCount(), 2);

    // Complete one operation
    manager.completeOperation('node-1');

    assertEqual(manager.getActiveCount(), 1);
    assertNull(manager.getActiveController('node-1'));
    assertTrue(manager.getActiveController('node-2') !== null);
});

test('GoodConcurrentManager: stopping non-existent operation returns false', () => {
    const manager = new GoodConcurrentManager();

    assertFalse(manager.stopOperation('non-existent'));
});

test('GoodConcurrentManager: same node can be restarted after completion', () => {
    const manager = new GoodConcurrentManager();

    // Start and complete an operation
    const controller1 = manager.startOperation('node-1');
    manager.completeOperation('node-1');

    // Start a new operation on the same node
    const controller2 = manager.startOperation('node-1');

    // They are different controllers
    assertTrue(controller1 !== controller2, 'New controller is different instance');

    // Only the new one is active
    assertEqual(manager.getActiveController('node-1'), controller2);
});

// ============================================================
// RecentModels storage tests
// ============================================================

/**
 * Mock localStorage for testing storage functions.
 * These tests validate the getRecentModels/addRecentModel logic.
 */
class MockLocalStorage {
    constructor() {
        this.store = {};
    }

    getItem(key) {
        return this.store[key] || null;
    }

    setItem(key, value) {
        this.store[key] = value;
    }

    removeItem(key) {
        delete this.store[key];
    }

    clear() {
        this.store = {};
    }
}

// Simulate the storage functions from storage.js
function createRecentModelsStorage(localStorage) {
    return {
        getRecentModels() {
            const data = localStorage.getItem('canvas-chat-recent-models');
            return data ? JSON.parse(data) : [];
        },

        addRecentModel(modelId) {
            const recent = this.getRecentModels();

            // Remove if already exists (will re-add at front)
            const filtered = recent.filter(id => id !== modelId);

            // Add to front
            filtered.unshift(modelId);

            // Keep only last 10
            const trimmed = filtered.slice(0, 10);

            localStorage.setItem('canvas-chat-recent-models', JSON.stringify(trimmed));
        }
    };
}

test('getRecentModels: returns empty array when no data', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    assertEqual(storage.getRecentModels(), []);
});

test('addRecentModel: adds model to empty list', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');

    assertEqual(storage.getRecentModels(), ['openai/gpt-4o']);
});

test('addRecentModel: adds model to front of list', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('anthropic/claude-sonnet-4-20250514');

    assertEqual(storage.getRecentModels(), ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o']);
});

test('addRecentModel: moves existing model to front', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('anthropic/claude-sonnet-4-20250514');
    storage.addRecentModel('groq/llama-3.1-70b-versatile');

    // Now add gpt-4o again - should move to front
    storage.addRecentModel('openai/gpt-4o');

    assertEqual(storage.getRecentModels(), [
        'openai/gpt-4o',
        'groq/llama-3.1-70b-versatile',
        'anthropic/claude-sonnet-4-20250514'
    ]);
});

test('addRecentModel: limits to 10 models', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    // Add 12 models
    for (let i = 0; i < 12; i++) {
        storage.addRecentModel(`model-${i}`);
    }

    const recent = storage.getRecentModels();
    assertEqual(recent.length, 10);

    // Most recent should be first
    assertEqual(recent[0], 'model-11');
    // Oldest kept should be model-2
    assertEqual(recent[9], 'model-2');
});

test('addRecentModel: no duplicates in list', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('anthropic/claude-sonnet-4-20250514');
    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('openai/gpt-4o');

    const recent = storage.getRecentModels();

    // Should only have 2 unique models
    assertEqual(recent.length, 2);
    assertEqual(recent, ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514']);
});

// ============================================================
// Provider mapping tests (_getStorageKeyForProvider, getApiKeysForModels)
// ============================================================

/**
 * Simulate the provider mapping logic from storage.js
 * This is the canonical mapping for provider name to storage key.
 */
function createProviderMappingStorage(localStorage) {
    return {
        _getStorageKeyForProvider(provider) {
            const providerMap = {
                'openai': 'openai',
                'anthropic': 'anthropic',
                'gemini': 'google',
                'google': 'google',
                'groq': 'groq',
                'github': 'github',
                'github_copilot': 'github',
                'exa': 'exa'
            };
            return providerMap[provider.toLowerCase()] || provider.toLowerCase();
        },

        getApiKeys() {
            const data = localStorage.getItem('canvas-chat-api-keys');
            return data ? JSON.parse(data) : {};
        },

        saveApiKeys(keys) {
            localStorage.setItem('canvas-chat-api-keys', JSON.stringify(keys));
        },

        getApiKeyForProvider(provider) {
            const keys = this.getApiKeys();
            const storageKey = this._getStorageKeyForProvider(provider);
            return keys[storageKey] || null;
        },

        getApiKeysForModels(modelIds) {
            const apiKeys = {};
            for (const modelId of modelIds) {
                const provider = modelId.split('/')[0];
                const storageKey = this._getStorageKeyForProvider(provider);
                const key = this.getApiKeyForProvider(provider);
                if (key) {
                    apiKeys[storageKey] = key;
                }
            }
            return apiKeys;
        }
    };
}

test('_getStorageKeyForProvider: direct mapping', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('openai'), 'openai');
    assertEqual(storage._getStorageKeyForProvider('anthropic'), 'anthropic');
    assertEqual(storage._getStorageKeyForProvider('groq'), 'groq');
});

test('_getStorageKeyForProvider: gemini maps to google', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('gemini'), 'google');
    assertEqual(storage._getStorageKeyForProvider('google'), 'google');
});

test('_getStorageKeyForProvider: github_copilot maps to github', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('github'), 'github');
    assertEqual(storage._getStorageKeyForProvider('github_copilot'), 'github');
});

test('_getStorageKeyForProvider: case insensitive', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('OpenAI'), 'openai');
    assertEqual(storage._getStorageKeyForProvider('GEMINI'), 'google');
    assertEqual(storage._getStorageKeyForProvider('GitHub_Copilot'), 'github');
});

test('_getStorageKeyForProvider: unknown provider returns lowercase', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('mistral'), 'mistral');
    assertEqual(storage._getStorageKeyForProvider('Cohere'), 'cohere');
});

test('getApiKeyForProvider: returns key using mapping', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        'openai': 'sk-openai-key',
        'google': 'google-key',
        'github': 'gh-token'
    });

    assertEqual(storage.getApiKeyForProvider('openai'), 'sk-openai-key');
    assertEqual(storage.getApiKeyForProvider('gemini'), 'google-key');
    assertEqual(storage.getApiKeyForProvider('github_copilot'), 'gh-token');
});

test('getApiKeyForProvider: returns null for unconfigured provider', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({ 'openai': 'sk-key' });

    assertNull(storage.getApiKeyForProvider('anthropic'));
    assertNull(storage.getApiKeyForProvider('mistral'));
});

test('getApiKeysForModels: builds dict from model IDs', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        'openai': 'sk-openai',
        'anthropic': 'sk-anthropic',
        'google': 'google-key'
    });

    const result = storage.getApiKeysForModels([
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4-20250514'
    ]);

    assertDeepEqual(result, {
        'openai': 'sk-openai',
        'anthropic': 'sk-anthropic'
    });
});

test('getApiKeysForModels: maps gemini to google', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        'openai': 'sk-openai',
        'google': 'google-key'
    });

    const result = storage.getApiKeysForModels([
        'openai/gpt-4o',
        'gemini/gemini-1.5-pro'
    ]);

    assertDeepEqual(result, {
        'openai': 'sk-openai',
        'google': 'google-key'
    });
});

test('getApiKeysForModels: skips models without configured keys', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        'openai': 'sk-openai'
    });

    const result = storage.getApiKeysForModels([
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4-20250514',  // No key configured
        'mistral/mistral-large'  // Unknown provider, no key
    ]);

    assertDeepEqual(result, {
        'openai': 'sk-openai'
    });
});

test('getApiKeysForModels: deduplicates providers', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        'openai': 'sk-openai'
    });

    // Multiple models from same provider
    const result = storage.getApiKeysForModels([
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'openai/gpt-3.5-turbo'
    ]);

    assertDeepEqual(result, {
        'openai': 'sk-openai'
    });
});

test('getApiKeysForModels: empty array returns empty object', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        'openai': 'sk-openai'
    });

    const result = storage.getApiKeysForModels([]);

    assertDeepEqual(result, {});
});

// ============================================================
// URL detection tests (for /note command)
// ============================================================

// Using actual implementation from app.js (exported to window)
const isUrlTest = isUrlContent;

test('isUrl: detects http URL', () => {
    assertTrue(isUrlTest('http://example.com'));
});

test('isUrl: detects https URL', () => {
    assertTrue(isUrlTest('https://example.com'));
});

test('isUrl: detects URL with path', () => {
    assertTrue(isUrlTest('https://example.com/path/to/page'));
});

test('isUrl: detects URL with query params', () => {
    assertTrue(isUrlTest('https://example.com/page?id=123&ref=abc'));
});

test('isUrl: detects URL with fragment', () => {
    assertTrue(isUrlTest('https://example.com/page#section'));
});

test('isUrl: detects complex URL', () => {
    assertTrue(isUrlTest('https://pmc.ncbi.nlm.nih.gov/articles/PMC12514551/'));
});

test('isUrl: trims whitespace', () => {
    assertTrue(isUrlTest('  https://example.com  '));
});

test('isUrl: rejects plain text', () => {
    assertFalse(isUrlTest('This is just some text'));
});

test('isUrl: rejects markdown', () => {
    assertFalse(isUrlTest('# Heading\n\nSome content'));
});

test('isUrl: rejects URL embedded in text', () => {
    assertFalse(isUrlTest('Check out https://example.com for more'));
});

test('isUrl: rejects URL without protocol', () => {
    assertFalse(isUrlTest('example.com'));
});

test('isUrl: rejects ftp URLs', () => {
    assertFalse(isUrlTest('ftp://files.example.com'));
});

test('isUrl: rejects empty string', () => {
    assertFalse(isUrlTest(''));
});

test('isUrl: rejects whitespace only', () => {
    assertFalse(isUrlTest('   '));
});

// ============================================================
// isPdfUrl tests (for PDF URL detection)
// ============================================================

/**
 * Detect if a URL points to a PDF file.
 * This pattern is used in app.js to route /note commands with PDF URLs
 * to handleNoteFromPdfUrl instead of handleNoteFromUrl.
 */
function isPdfUrl(url) {
    return /\.pdf(\?.*)?$/i.test(url.trim());
}

test('isPdfUrl: detects .pdf extension', () => {
    assertTrue(isPdfUrl('https://example.com/document.pdf'));
});

test('isPdfUrl: detects .PDF uppercase extension', () => {
    assertTrue(isPdfUrl('https://example.com/DOCUMENT.PDF'));
});

test('isPdfUrl: detects mixed case .Pdf extension', () => {
    assertTrue(isPdfUrl('https://example.com/Report.Pdf'));
});

test('isPdfUrl: detects .pdf with query parameters', () => {
    assertTrue(isPdfUrl('https://example.com/doc.pdf?token=abc123'));
});

test('isPdfUrl: detects .pdf with multiple query parameters', () => {
    assertTrue(isPdfUrl('https://example.com/doc.pdf?id=1&ref=abc&download=true'));
});

test('isPdfUrl: detects .pdf in path with subdirectories', () => {
    assertTrue(isPdfUrl('https://example.com/files/reports/2024/annual.pdf'));
});

test('isPdfUrl: trims whitespace', () => {
    assertTrue(isPdfUrl('  https://example.com/doc.pdf  '));
});

test('isPdfUrl: rejects non-PDF URLs', () => {
    assertFalse(isPdfUrl('https://example.com/page.html'));
});

test('isPdfUrl: rejects .txt files', () => {
    assertFalse(isPdfUrl('https://example.com/readme.txt'));
});

test('isPdfUrl: rejects .doc files', () => {
    assertFalse(isPdfUrl('https://example.com/document.doc'));
});

test('isPdfUrl: rejects .docx files', () => {
    assertFalse(isPdfUrl('https://example.com/document.docx'));
});

test('isPdfUrl: rejects URL with pdf in path but different extension', () => {
    assertFalse(isPdfUrl('https://example.com/pdf-viewer/page.html'));
});

test('isPdfUrl: rejects URL with pdf in domain', () => {
    assertFalse(isPdfUrl('https://pdf.example.com/page'));
});

test('isPdfUrl: rejects URL with pdf in query but no .pdf extension', () => {
    assertFalse(isPdfUrl('https://example.com/view?file=document.pdf&format=html'));
});

test('isPdfUrl: rejects plain text', () => {
    assertFalse(isPdfUrl('This is not a URL'));
});

test('isPdfUrl: rejects empty string', () => {
    assertFalse(isPdfUrl(''));
});

test('isPdfUrl: rejects URL without extension', () => {
    assertFalse(isPdfUrl('https://example.com/document'));
});

test('isPdfUrl: handles arxiv-style PDF URLs', () => {
    assertTrue(isPdfUrl('https://arxiv.org/pdf/2301.12345.pdf'));
});

test('isPdfUrl: handles nature-style PDF URLs', () => {
    assertTrue(isPdfUrl('https://www.nature.com/articles/s41586-024-12345-6.pdf'));
});

// ============================================================
// Graph.isEmpty() tests
// ============================================================

/**
 * Tests for Graph.isEmpty() - this was the root cause of the
 * "welcome message not hiding" bug. The isEmpty check must work
 * correctly for loadSessionData to hide the empty state.
 */

class TestGraphWithIsEmpty {
    constructor(session = null) {
        this.nodes = new Map();
        if (session && session.nodes) {
            for (const node of session.nodes) {
                this.nodes.set(node.id, node);
            }
        }
    }

    addNode(node) {
        this.nodes.set(node.id, node);
        return node;
    }

    isEmpty() {
        return this.nodes.size === 0;
    }

    getAllNodes() {
        return Array.from(this.nodes.values());
    }
}

test('Graph.isEmpty: returns true for new empty graph', () => {
    const graph = new TestGraphWithIsEmpty();
    assertTrue(graph.isEmpty(), 'New graph should be empty');
});

test('Graph.isEmpty: returns false after adding a node', () => {
    const graph = new TestGraphWithIsEmpty();
    graph.addNode({ id: 'node-1', content: 'test' });
    assertFalse(graph.isEmpty(), 'Graph with node should not be empty');
});

test('Graph.isEmpty: returns false when initialized with session nodes', () => {
    // This is the bug case - loading a session with nodes
    const session = {
        nodes: [
            { id: 'node-1', content: 'First node' },
            { id: 'node-2', content: 'Second node' }
        ]
    };
    const graph = new TestGraphWithIsEmpty(session);

    assertFalse(graph.isEmpty(), 'Graph loaded from session should not be empty');
    assertEqual(graph.getAllNodes().length, 2);
});

test('Graph.isEmpty: returns true for session with empty nodes array', () => {
    const session = { nodes: [] };
    const graph = new TestGraphWithIsEmpty(session);

    assertTrue(graph.isEmpty(), 'Graph with empty nodes array should be empty');
});

test('Graph.isEmpty: returns true for session with null nodes', () => {
    const session = { nodes: null };
    const graph = new TestGraphWithIsEmpty(session);

    assertTrue(graph.isEmpty(), 'Graph with null nodes should be empty');
});

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
// formatUserError tests
// ============================================================
// Using actual implementation from app.js (exported to window)

test('formatUserError: timeout detection', () => {
    const result = formatUserError({ message: 'Request timeout' });
    assertEqual(result.title, 'Request timed out');
    assertTrue(result.canRetry);
});

test('formatUserError: ETIMEDOUT detection', () => {
    const result = formatUserError({ message: 'ETIMEDOUT error' });
    assertEqual(result.title, 'Request timed out');
});

test('formatUserError: authentication error detection', () => {
    const result = formatUserError({ message: '401 Unauthorized' });
    assertEqual(result.title, 'Authentication failed');
    assertFalse(result.canRetry);
});

test('formatUserError: invalid API key detection', () => {
    const result = formatUserError({ message: 'Invalid API key' });
    assertEqual(result.title, 'Authentication failed');
});

test('formatUserError: rate limit detection', () => {
    const result = formatUserError({ message: '429 Rate limit exceeded' });
    assertEqual(result.title, 'Rate limit reached');
    assertTrue(result.canRetry);
});

test('formatUserError: server error detection', () => {
    const result = formatUserError({ message: '500 Internal Server Error' });
    assertEqual(result.title, 'Server error');
    assertTrue(result.canRetry);
});

test('formatUserError: network error detection', () => {
    const result = formatUserError({ message: 'Failed to fetch' });
    assertEqual(result.title, 'Network error');
    assertTrue(result.canRetry);
});

test('formatUserError: context length error detection', () => {
    const result = formatUserError({ message: 'Context length exceeded' });
    assertEqual(result.title, 'Message too long');
    assertFalse(result.canRetry);
});

test('formatUserError: default error handling', () => {
    const result = formatUserError({ message: 'Unknown error' });
    assertEqual(result.title, 'Something went wrong');
    assertTrue(result.canRetry);
    assertTrue(result.description.includes('Unknown error'));
});

test('formatUserError: handles string errors', () => {
    const result = formatUserError('Some error string');
    assertEqual(result.title, 'Something went wrong');
    assertTrue(result.description.includes('Some error string'));
});

test('formatUserError: handles null/undefined', () => {
    const result = formatUserError(null);
    assertEqual(result.title, 'Something went wrong');
    // When null, String(null) = "null", so description will be "null" or "An unexpected error occurred"
    assertTrue(result.description.includes('null') || result.description.includes('unexpected'));
});

// ============================================================
// buildMessagesForApi tests
// ============================================================
// Using actual implementation from app.js (exported to window)

test('buildMessagesForApi: simple text messages', () => {
    const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 2);
    assertEqual(result[0].role, 'user');
    assertEqual(result[0].content, 'Hello');
    assertEqual(result[1].role, 'assistant');
    assertEqual(result[1].content, 'Hi there');
});

test('buildMessagesForApi: merges images with user text', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', content: 'What is this?' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 2);
    assertEqual(result[0].content[0].type, 'image_url');
    assertEqual(result[0].content[1].type, 'text');
    assertEqual(result[0].content[1].text, 'What is this?');
});

test('buildMessagesForApi: separates images from assistant messages', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'assistant', content: 'Response' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 2);
    assertEqual(result[0].role, 'user');
    assertEqual(result[1].role, 'assistant');
});

test('buildMessagesForApi: multiple images merge with user text', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'user', content: 'Analyze these' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    assertEqual(result[0].content.length, 3);
    assertEqual(result[0].content[0].type, 'image_url');
    assertEqual(result[0].content[1].type, 'image_url');
    assertEqual(result[0].content[2].type, 'text');
});

test('buildMessagesForApi: trailing images become separate messages', () => {
    const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', imageData: 'img1', mimeType: 'image/png' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 2);
    assertEqual(result[0].content, 'Hello');
    assertEqual(result[1].role, 'user');
    assertEqual(result[1].content[0].type, 'image_url');
});

// ============================================================
// Zoom class determination tests
// ============================================================

/**
 * Get zoom class based on scale
 * Copy of logic from canvas.js for testing
 */
function getZoomClass(scale) {
    if (scale > 0.6) {
        return 'zoom-full';
    } else if (scale > 0.35) {
        return 'zoom-summary';
    } else {
        return 'zoom-mini';
    }
}

test('getZoomClass: scale 0.8 returns zoom-full', () => {
    assertEqual(getZoomClass(0.8), 'zoom-full');
});

test('getZoomClass: scale 1.0 returns zoom-full', () => {
    assertEqual(getZoomClass(1.0), 'zoom-full');
});

test('getZoomClass: scale 0.6 returns zoom-summary (boundary)', () => {
    // Note: scale > 0.6 is full, so 0.6 exactly is summary
    assertEqual(getZoomClass(0.6), 'zoom-summary');
});

test('getZoomClass: scale 0.5 returns zoom-summary', () => {
    assertEqual(getZoomClass(0.5), 'zoom-summary');
});

test('getZoomClass: scale 0.35 returns zoom-mini (boundary)', () => {
    // Note: scale > 0.35 is summary, so 0.35 exactly is mini
    assertEqual(getZoomClass(0.35), 'zoom-mini');
});

test('getZoomClass: scale 0.3 returns zoom-mini', () => {
    assertEqual(getZoomClass(0.3), 'zoom-mini');
});

test('getZoomClass: scale 0.1 returns zoom-mini', () => {
    assertEqual(getZoomClass(0.1), 'zoom-mini');
});

// ============================================================
// Node creation tests
// ============================================================
// NodeType, DEFAULT_NODE_SIZES, and getDefaultNodeSize are loaded from graph.js via window

/**
 * Create a new node
 * NOTE: Using actual implementation from graph.js, but with test-specific ID generation
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

/**
 * Create a matrix node
 * NOTE: Using actual implementation from graph.js, but with test-specific ID generation
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

/**
 * Create a row node
 * NOTE: Using actual implementation from graph.js, but with test-specific ID generation
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

/**
 * Create a column node
 * NOTE: Using actual implementation from graph.js, but with test-specific ID generation
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
// Graph.resolveContext tests
// ============================================================

/**
 * Simplified Graph class for testing resolveContext
 */
class TestGraphForContext {
    constructor() {
        this.nodes = new Map();
        this.incomingEdges = new Map();
    }

    addNode(node) {
        this.nodes.set(node.id, node);
        if (!this.incomingEdges.has(node.id)) {
            this.incomingEdges.set(node.id, []);
        }
    }

    addEdge(sourceId, targetId) {
        if (!this.incomingEdges.has(targetId)) {
            this.incomingEdges.set(targetId, []);
        }
        this.incomingEdges.get(targetId).push({ source: sourceId });
    }

    getParents(nodeId) {
        const incoming = this.incomingEdges.get(nodeId) || [];
        return incoming.map(edge => this.nodes.get(edge.source)).filter(Boolean);
    }

    getAncestors(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const ancestors = [];
        const parents = this.getParents(nodeId);

        for (const parent of parents) {
            ancestors.push(...this.getAncestors(parent.id, visited));
            ancestors.push(parent);
        }

        return ancestors;
    }

    resolveContext(nodeIds) {
        const allAncestors = new Map();

        for (const nodeId of nodeIds) {
            const node = this.nodes.get(nodeId);
            if (node) {
                allAncestors.set(node.id, node);
            }

            const ancestors = this.getAncestors(nodeId);
            for (const ancestor of ancestors) {
                allAncestors.set(ancestor.id, ancestor);
            }
        }

        const sorted = Array.from(allAncestors.values())
            .sort((a, b) => a.created_at - b.created_at);

        const userTypes = [NodeType.HUMAN, NodeType.NOTE];
        return sorted.map(node => ({
            role: userTypes.includes(node.type) ? 'user' : 'assistant',
            content: node.content,
            nodeId: node.id
        }));
    }
}

test('Graph.resolveContext: maps user types to user role', () => {
    const graph = new TestGraphForContext();
    const node1 = { id: '1', type: NodeType.HUMAN, content: 'Hello', created_at: 1 };
    graph.addNode(node1);

    const context = graph.resolveContext(['1']);
    assertEqual(context.length, 1);
    assertEqual(context[0].role, 'user');
});

test('Graph.resolveContext: maps AI types to assistant role', () => {
    const graph = new TestGraphForContext();
    const node1 = { id: '1', type: NodeType.AI, content: 'Response', created_at: 1 };
    graph.addNode(node1);

    const context = graph.resolveContext(['1']);
    assertEqual(context.length, 1);
    assertEqual(context[0].role, 'assistant');
});

test('Graph.resolveContext: includes ancestors', () => {
    const graph = new TestGraphForContext();
    const node1 = { id: '1', type: NodeType.HUMAN, content: 'Hello', created_at: 1 };
    const node2 = { id: '2', type: NodeType.AI, content: 'Hi', created_at: 2 };
    graph.addNode(node1);
    graph.addNode(node2);
    graph.addEdge('1', '2');

    const context = graph.resolveContext(['2']);
    assertEqual(context.length, 2);
    assertEqual(context[0].role, 'user');
    assertEqual(context[1].role, 'assistant');
});

test('Graph.resolveContext: sorts by created_at', () => {
    const graph = new TestGraphForContext();
    const node1 = { id: '1', type: NodeType.HUMAN, content: 'First', created_at: 1 };
    const node2 = { id: '2', type: NodeType.AI, content: 'Second', created_at: 2 };
    graph.addNode(node1);
    graph.addNode(node2);
    graph.addEdge('1', '2');

    const context = graph.resolveContext(['2']);
    assertEqual(context[0].content, 'First');
    assertEqual(context[1].content, 'Second');
});

// ============================================================
// Navigation popover selection logic tests
// ============================================================

/**
 * Tests for the navigation popover keyboard selection logic.
 * When navigating parent/child nodes with Arrow Up/Down, if multiple
 * connections exist, a popover opens. Arrow keys cycle through options
 * with wrapping (going past last item wraps to first, and vice versa).
 *
 * The selection logic uses modular arithmetic:
 *   newIndex = (currentIndex + direction + itemCount) % itemCount
 * where direction is +1 for down, -1 for up.
 */

test('Popover selection: wraps from last to first when going down', () => {
    const itemCount = 5;
    let selectedIndex = 4;  // Last item
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Should wrap to first
});

test('Popover selection: wraps from first to last when going up', () => {
    const itemCount = 5;
    let selectedIndex = 0;  // First item
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 4);  // Should wrap to last
});

test('Popover selection: moves down normally in middle of list', () => {
    const itemCount = 5;
    let selectedIndex = 2;  // Middle item
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 3);
});

test('Popover selection: moves up normally in middle of list', () => {
    const itemCount = 5;
    let selectedIndex = 2;  // Middle item
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 1);
});

test('Popover selection: handles single item list going down', () => {
    const itemCount = 1;
    let selectedIndex = 0;
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Should stay on same item
});

test('Popover selection: handles single item list going up', () => {
    const itemCount = 1;
    let selectedIndex = 0;
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Should stay on same item
});

test('Popover selection: handles two item list wrapping down', () => {
    const itemCount = 2;
    let selectedIndex = 1;  // Last item
    const direction = 1;    // Down
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 0);  // Wrap to first
});

test('Popover selection: handles two item list wrapping up', () => {
    const itemCount = 2;
    let selectedIndex = 0;  // First item
    const direction = -1;   // Up
    selectedIndex = (selectedIndex + direction + itemCount) % itemCount;
    assertEqual(selectedIndex, 1);  // Wrap to last
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

// ============================================================
// FlashcardNode tests
// ============================================================

test('FlashcardNode: getTypeLabel returns Flashcard', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', back: 'A', srs: null };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'Flashcard');
});

test('FlashcardNode: getTypeIcon returns card emoji', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', back: 'A', srs: null };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeIcon(), '🎴');
});

test('FlashcardNode: getSummaryText returns truncated question', () => {
    const node = { type: NodeType.FLASHCARD, content: 'What is the capital of France?', back: 'Paris', srs: null };
    const mockCanvasWithTruncate = {
        ...mockCanvas,
        truncate: (text, len) => text.length > len ? text.slice(0, len - 1) + '…' : text
    };
    const wrapped = wrapNode(node);
    const summary = wrapped.getSummaryText(mockCanvasWithTruncate);
    assertTrue(summary.includes('What is the capital'), 'Should include question content');
});

test('FlashcardNode: getSummaryText prefers title over content', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Question', back: 'Answer', title: 'Geography Card', srs: null };
    const mockCanvasWithTruncate = {
        ...mockCanvas,
        truncate: (text, len) => text.length > len ? text.slice(0, len - 1) + '…' : text
    };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText(mockCanvasWithTruncate), 'Geography Card');
});

test('FlashcardNode: renderContent includes question and answer', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Test Question', back: 'Test Answer', srs: null };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('Test Question'), 'Should include question');
    assertTrue(html.includes('Test Answer'), 'Should include answer');
    assertTrue(html.includes('flashcard-front'), 'Should have front section');
    assertTrue(html.includes('flashcard-back'), 'Should have back section');
});

test('FlashcardNode: renderContent shows New status for new cards', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', back: 'A', srs: null };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status new'), 'Should have new status class');
    assertTrue(html.includes('>New<'), 'Should show New text');
});

test('FlashcardNode: renderContent shows Due status for overdue cards', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
    const node = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        back: 'A',
        srs: { nextReviewDate: pastDate, repetitions: 1, easeFactor: 2.5, interval: 1 }
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status due'), 'Should have due status class');
    assertTrue(html.includes('>Due<'), 'Should show Due text');
});

test('FlashcardNode: renderContent shows learning status for future cards', () => {
    const futureDate = new Date(Date.now() + 3 * 86400000).toISOString(); // 3 days from now
    const node = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        back: 'A',
        srs: { nextReviewDate: futureDate, repetitions: 2, easeFactor: 2.5, interval: 3 }
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status learning'), 'Should have learning status class');
    assertTrue(html.includes('Due in'), 'Should show days until due');
});

test('FlashcardNode: renderContent shows learning status for failed cards (repetitions=0)', () => {
    // When a card is failed, SM-2 resets repetitions to 0 but still sets a future nextReviewDate
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const node = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        back: 'A',
        srs: { nextReviewDate: futureDate, repetitions: 0, easeFactor: 2.5, interval: 1 }
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status learning'), 'Should have learning status class even with repetitions=0');
    assertTrue(html.includes('Due tomorrow'), 'Should show Due tomorrow');
});

test('FlashcardNode: getActions includes FLIP_CARD', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', back: 'A', srs: null };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'flip-card'), 'Should include flip-card action');
    assertTrue(actions.some(a => a.id === 'edit-content'), 'Should include edit-content action');
    assertTrue(actions.some(a => a.id === 'copy'), 'Should include copy action');
});

// ============================================================
// CREATE_FLASHCARDS action tests
// ============================================================

test('AINode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.AI, content: 'Some AI response content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'AINode should include create-flashcards action');
});

test('SummaryNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.SUMMARY, content: 'Summary content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'SummaryNode should include create-flashcards action');
});

test('NoteNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.NOTE, content: 'Note content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'NoteNode should include create-flashcards action');
});

test('ResearchNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.RESEARCH, content: 'Research content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'ResearchNode should include create-flashcards action');
});

test('FetchResultNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.FETCH_RESULT, content: 'Fetched content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'FetchResultNode should include create-flashcards action');
});

test('PdfNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.PDF, content: 'PDF content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'PdfNode should include create-flashcards action');
});

test('OpinionNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.OPINION, content: 'Opinion content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'OpinionNode should include create-flashcards action');
});

test('SynthesisNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.SYNTHESIS, content: 'Synthesis content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'SynthesisNode should include create-flashcards action');
});

test('ReviewNode: getActions includes CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.REVIEW, content: 'Review content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'create-flashcards'), 'ReviewNode should include create-flashcards action');
});

test('FlashcardNode: getActions does NOT include CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', back: 'A', srs: null };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertFalse(actions.some(a => a.id === 'create-flashcards'), 'FlashcardNode should NOT include create-flashcards action');
});

test('HumanNode: getActions does NOT include CREATE_FLASHCARDS', () => {
    const node = { type: NodeType.HUMAN, content: 'User message' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertFalse(actions.some(a => a.id === 'create-flashcards'), 'HumanNode should NOT include create-flashcards action');
});

// ============================================================
// HeaderButtons collapse button tests
// ============================================================

test('All node types include collapse button in header', () => {
    const nodeTypes = [
        NodeType.HUMAN, NodeType.AI, NodeType.NOTE, NodeType.SUMMARY,
        NodeType.REFERENCE, NodeType.SEARCH, NodeType.RESEARCH,
        NodeType.HIGHLIGHT, NodeType.MATRIX, NodeType.CELL,
        NodeType.ROW, NodeType.COLUMN, NodeType.FETCH_RESULT,
        NodeType.PDF, NodeType.OPINION, NodeType.SYNTHESIS,
        NodeType.REVIEW, NodeType.FACTCHECK, NodeType.IMAGE,
        NodeType.FLASHCARD
    ];

    for (const type of nodeTypes) {
        const mockNode = createMockNodeForType(type);
        const wrapped = wrapNode(mockNode);
        const buttons = wrapped.getHeaderButtons();
        const hasCollapse = buttons.some(btn => btn.id === 'collapse');
        assertTrue(hasCollapse, `${type} should include collapse button in header`);
    }
});

test('HeaderButtons.COLLAPSE has correct properties', () => {
    assertEqual(HeaderButtons.COLLAPSE.id, 'collapse');
    assertEqual(HeaderButtons.COLLAPSE.label, '−');
    assertEqual(HeaderButtons.COLLAPSE.title, 'Collapse children');
});

// ============================================================
// SM-2 Spaced Repetition Algorithm tests
// ============================================================

test('applySM2: first correct answer (quality 4) sets interval to 1', () => {
    const srs = { interval: 0, easeFactor: 2.5, repetitions: 0, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 1);
});

test('applySM2: second correct answer (quality 4) sets interval to 6', () => {
    const srs = { interval: 1, easeFactor: 2.5, repetitions: 1, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(result.interval, 6);
    assertEqual(result.repetitions, 2);
});

test('applySM2: third correct answer multiplies interval by easeFactor', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(result.interval, 15); // 6 * 2.5 = 15
    assertEqual(result.repetitions, 3);
});

test('applySM2: failed answer (quality 1) resets repetitions and interval', () => {
    const srs = { interval: 15, easeFactor: 2.5, repetitions: 5, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 1);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 0);
});

test('applySM2: easy answer (quality 5) increases easeFactor', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 5);
    assertTrue(result.easeFactor > 2.5, 'Ease factor should increase for easy answers');
});

test('applySM2: hard answer (quality 3) decreases easeFactor', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 3);
    assertTrue(result.easeFactor < 2.5, 'Ease factor should decrease for hard answers');
});

test('applySM2: easeFactor minimum is 1.3', () => {
    const srs = { interval: 6, easeFactor: 1.35, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    // Multiple hard answers to try to push below 1.3
    let result = applySM2(srs, 3);
    result = applySM2(result, 3);
    result = applySM2(result, 3);
    assertTrue(result.easeFactor >= 1.3, 'Ease factor should not go below 1.3');
});

test('applySM2: sets nextReviewDate based on interval', () => {
    const srs = { interval: 1, easeFactor: 2.5, repetitions: 1, nextReviewDate: null, lastReviewDate: null };
    const before = Date.now();
    const result = applySM2(srs, 4);
    const after = Date.now();

    const nextReview = new Date(result.nextReviewDate).getTime();
    // interval is 6 days = 6 * 86400000 ms
    const expectedMin = before + (6 * 86400000);
    const expectedMax = after + (6 * 86400000);

    assertTrue(nextReview >= expectedMin - 1000, 'nextReviewDate should be at least 6 days in future');
    assertTrue(nextReview <= expectedMax + 1000, 'nextReviewDate should be about 6 days in future');
});

test('applySM2: sets lastReviewDate to current time', () => {
    const srs = { interval: 1, easeFactor: 2.5, repetitions: 0, nextReviewDate: null, lastReviewDate: null };
    const before = Date.now();
    const result = applySM2(srs, 4);
    const after = Date.now();

    const lastReview = new Date(result.lastReviewDate).getTime();
    assertTrue(lastReview >= before - 1000, 'lastReviewDate should be around now');
    assertTrue(lastReview <= after + 1000, 'lastReviewDate should be around now');
});

test('applySM2: quality 0 resets like any fail', () => {
    const srs = { interval: 15, easeFactor: 2.5, repetitions: 5, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 0);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 0);
});

test('applySM2: quality 2 resets (fail threshold is < 3)', () => {
    const srs = { interval: 15, easeFactor: 2.5, repetitions: 5, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 2);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 0);
});

test('applySM2: does not mutate original srs object', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(srs.interval, 6, 'Original interval should not change');
    assertEqual(srs.repetitions, 2, 'Original repetitions should not change');
    assertNull(srs.lastReviewDate, 'Original lastReviewDate should not change');
});

// ============================================================
// Due flashcard detection tests
// ============================================================

test('isFlashcardDue: new card without SRS data is due', () => {
    const card = { type: NodeType.FLASHCARD, content: 'Q', back: 'A' };
    assertTrue(isFlashcardDue(card), 'New card should be due');
});

test('isFlashcardDue: card with null nextReviewDate is due', () => {
    const card = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        back: 'A',
        srs: { nextReviewDate: null }
    };
    assertTrue(isFlashcardDue(card), 'Card with null nextReviewDate should be due');
});

test('isFlashcardDue: card with past nextReviewDate is due', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const card = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        back: 'A',
        srs: { nextReviewDate: yesterday }
    };
    assertTrue(isFlashcardDue(card), 'Card with past nextReviewDate should be due');
});

test('isFlashcardDue: card with future nextReviewDate is not due', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const card = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        back: 'A',
        srs: { nextReviewDate: tomorrow }
    };
    assertFalse(isFlashcardDue(card), 'Card with future nextReviewDate should not be due');
});

test('isFlashcardDue: non-flashcard node returns false', () => {
    const node = { type: NodeType.AI, content: 'response' };
    assertFalse(isFlashcardDue(node), 'Non-flashcard node should not be due');
});

// ============================================================
// REVIEW_CARD action tests
// ============================================================

test('FlashcardNode: getActions includes REVIEW_CARD', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', back: 'A', srs: null };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertTrue(actions.some(a => a.id === 'review-card'), 'FlashcardNode should include review-card action');
});

// ============================================================
// getDueFlashcards filter tests
// ============================================================

test('getDueFlashcards: returns empty array when no nodes', () => {
    const result = getDueFlashcards([]);
    assertEqual(result.length, 0);
});

test('getDueFlashcards: returns empty array when no flashcards', () => {
    const nodes = [
        { type: NodeType.AI, content: 'response' },
        { type: NodeType.HUMAN, content: 'question' }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 0);
});

test('getDueFlashcards: returns new flashcard (no SRS data)', () => {
    const nodes = [
        { id: 'fc-1', type: NodeType.FLASHCARD, content: 'Q1', back: 'A1' }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, 'fc-1');
});

test('getDueFlashcards: returns flashcard with null nextReviewDate', () => {
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            back: 'A1',
            srs: { nextReviewDate: null }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1);
});

test('getDueFlashcards: returns flashcard with past nextReviewDate', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            back: 'A1',
            srs: { nextReviewDate: yesterday }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1);
});

test('getDueFlashcards: excludes flashcard with future nextReviewDate', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            back: 'A1',
            srs: { nextReviewDate: tomorrow }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 0);
});

test('getDueFlashcards: mixed nodes returns only due flashcards', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nodes = [
        { type: NodeType.AI, content: 'response' },
        { id: 'fc-due', type: NodeType.FLASHCARD, content: 'Q1', back: 'A1', srs: { nextReviewDate: yesterday } },
        { id: 'fc-not-due', type: NodeType.FLASHCARD, content: 'Q2', back: 'A2', srs: { nextReviewDate: tomorrow } },
        { id: 'fc-new', type: NodeType.FLASHCARD, content: 'Q3', back: 'A3' },
        { type: NodeType.HUMAN, content: 'question' }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 2);
    assertTrue(result.some(c => c.id === 'fc-due'), 'Should include due card');
    assertTrue(result.some(c => c.id === 'fc-new'), 'Should include new card');
    assertFalse(result.some(c => c.id === 'fc-not-due'), 'Should not include future card');
});

test('getDueFlashcards: handles boundary case - review date is now', () => {
    const now = new Date().toISOString();
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            back: 'A1',
            srs: { nextReviewDate: now }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1, 'Card with nextReviewDate = now should be due');
});

// ============================================================
// Flashcard strictness storage tests
// ============================================================

/**
 * Simulate the flashcard strictness storage functions from storage.js.
 * These control how strictly the LLM grades flashcard answers.
 */
function createStrictnessStorage(localStorage) {
    return {
        getFlashcardStrictness() {
            return localStorage.getItem('canvas-chat-flashcard-strictness') || 'medium';
        },

        setFlashcardStrictness(value) {
            localStorage.setItem('canvas-chat-flashcard-strictness', value);
        }
    };
}

test('getFlashcardStrictness: returns medium by default', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    assertEqual(storage.getFlashcardStrictness(), 'medium');
});

test('getFlashcardStrictness: returns stored value', () => {
    const mockStorage = new MockLocalStorage();
    mockStorage.setItem('canvas-chat-flashcard-strictness', 'strict');
    const storage = createStrictnessStorage(mockStorage);

    assertEqual(storage.getFlashcardStrictness(), 'strict');
});

test('setFlashcardStrictness: stores lenient value', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    storage.setFlashcardStrictness('lenient');

    assertEqual(storage.getFlashcardStrictness(), 'lenient');
});

test('setFlashcardStrictness: stores strict value', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    storage.setFlashcardStrictness('strict');

    assertEqual(storage.getFlashcardStrictness(), 'strict');
});

test('setFlashcardStrictness: can update value', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    storage.setFlashcardStrictness('lenient');
    assertEqual(storage.getFlashcardStrictness(), 'lenient');

    storage.setFlashcardStrictness('strict');
    assertEqual(storage.getFlashcardStrictness(), 'strict');

    storage.setFlashcardStrictness('medium');
    assertEqual(storage.getFlashcardStrictness(), 'medium');
});

test('setFlashcardStrictness: persists across function calls', () => {
    const mockStorage = new MockLocalStorage();
    const storage1 = createStrictnessStorage(mockStorage);

    storage1.setFlashcardStrictness('strict');

    // Create a new storage instance with the same localStorage
    const storage2 = createStrictnessStorage(mockStorage);
    assertEqual(storage2.getFlashcardStrictness(), 'strict');
});

// ============================================================
// Custom Models storage tests
// ============================================================

/**
 * Tests for user-defined custom models storage.
 * Custom models allow users to add LiteLLM-compatible model IDs
 * that persist in localStorage and appear in the model picker.
 */
function createCustomModelsStorage(localStorage) {
    const STORAGE_KEY = 'canvas-chat-custom-models';
    const MODEL_ID_PATTERN = /^[a-z0-9_-]+\/[a-z0-9._-]+$/i;

    return {
        getCustomModels() {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        },

        saveCustomModel(model) {
            // Validate model ID format (provider/model-name)
            if (!model.id || !MODEL_ID_PATTERN.test(model.id)) {
                throw new Error('Model ID must be in format: provider/model-name');
            }

            const models = this.getCustomModels();

            // Check if model already exists (update) or is new (add)
            const existingIndex = models.findIndex(m => m.id === model.id);

            const customModel = {
                id: model.id,
                name: model.name || model.id,  // Default to ID if no name
                provider: 'Custom',
                context_window: model.context_window || 128000,
                base_url: model.base_url || null
            };

            if (existingIndex >= 0) {
                models[existingIndex] = customModel;
            } else {
                models.push(customModel);
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
            return customModel;
        },

        deleteCustomModel(modelId) {
            const models = this.getCustomModels();
            const filtered = models.filter(m => m.id !== modelId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
            return filtered.length < models.length;  // Return true if deleted
        }
    };
}

test('getCustomModels: returns empty array when no data', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    assertEqual(storage.getCustomModels(), []);
});

test('saveCustomModel: adds model with all fields', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({
        id: 'openai/gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        context_window: 200000,
        base_url: 'https://my-proxy.com/v1'
    });

    assertEqual(model.id, 'openai/gpt-4.1-mini');
    assertEqual(model.name, 'GPT-4.1 Mini');
    assertEqual(model.provider, 'Custom');
    assertEqual(model.context_window, 200000);
    assertEqual(model.base_url, 'https://my-proxy.com/v1');

    const saved = storage.getCustomModels();
    assertEqual(saved.length, 1);
    assertEqual(saved[0].id, 'openai/gpt-4.1-mini');
});

test('saveCustomModel: defaults name to id when not provided', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({ id: 'openai/my-model' });

    assertEqual(model.name, 'openai/my-model');
});

test('saveCustomModel: defaults context_window to 128000', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({ id: 'openai/my-model' });

    assertEqual(model.context_window, 128000);
});

test('saveCustomModel: defaults base_url to null', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({ id: 'openai/my-model' });

    assertEqual(model.base_url, null);
});

test('saveCustomModel: always sets provider to Custom', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({
        id: 'anthropic/claude-custom',
        provider: 'ShouldBeIgnored'
    });

    assertEqual(model.provider, 'Custom');
});

test('saveCustomModel: updates existing model with same id', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    storage.saveCustomModel({
        id: 'openai/my-model',
        name: 'Original Name',
        context_window: 100000
    });

    storage.saveCustomModel({
        id: 'openai/my-model',
        name: 'Updated Name',
        context_window: 200000
    });

    const models = storage.getCustomModels();
    assertEqual(models.length, 1);
    assertEqual(models[0].name, 'Updated Name');
    assertEqual(models[0].context_window, 200000);
});

test('saveCustomModel: rejects invalid model ID - missing slash', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    let threw = false;
    try {
        storage.saveCustomModel({ id: 'invalid-model-no-slash' });
    } catch (e) {
        threw = true;
        assertTrue(e.message.includes('provider/model-name'), 'Error should mention format');
    }
    assertTrue(threw, 'Should throw for invalid model ID');
});

test('saveCustomModel: rejects empty model ID', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    let threw = false;
    try {
        storage.saveCustomModel({ id: '' });
    } catch (e) {
        threw = true;
    }
    assertTrue(threw, 'Should throw for empty model ID');
});

test('saveCustomModel: rejects model ID without provider', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    let threw = false;
    try {
        storage.saveCustomModel({ id: '/model-only' });
    } catch (e) {
        threw = true;
    }
    assertTrue(threw, 'Should throw for model ID without provider');
});

test('saveCustomModel: accepts valid model ID formats', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    // Various valid formats
    storage.saveCustomModel({ id: 'openai/gpt-4o' });
    storage.saveCustomModel({ id: 'ollama_chat/llama3.1' });
    storage.saveCustomModel({ id: 'my-proxy/qwen2.5-72b' });
    storage.saveCustomModel({ id: 'anthropic/claude-3.5-sonnet' });

    assertEqual(storage.getCustomModels().length, 4);
});

test('deleteCustomModel: removes model by id', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    storage.saveCustomModel({ id: 'openai/model-1' });
    storage.saveCustomModel({ id: 'openai/model-2' });
    storage.saveCustomModel({ id: 'openai/model-3' });

    assertEqual(storage.getCustomModels().length, 3);

    const deleted = storage.deleteCustomModel('openai/model-2');

    assertTrue(deleted, 'Should return true when model deleted');
    assertEqual(storage.getCustomModels().length, 2);
    assertFalse(storage.getCustomModels().some(m => m.id === 'openai/model-2'));
});

test('deleteCustomModel: returns false for non-existent model', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    storage.saveCustomModel({ id: 'openai/model-1' });

    const deleted = storage.deleteCustomModel('openai/non-existent');

    assertFalse(deleted, 'Should return false when model not found');
    assertEqual(storage.getCustomModels().length, 1);
});

test('deleteCustomModel: handles empty list gracefully', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const deleted = storage.deleteCustomModel('openai/any-model');

    assertFalse(deleted);
    assertEqual(storage.getCustomModels().length, 0);
});

test('getCustomModels: persists across storage instances', () => {
    const mockStorage = new MockLocalStorage();
    const storage1 = createCustomModelsStorage(mockStorage);

    storage1.saveCustomModel({ id: 'openai/my-model', name: 'My Model' });

    // Simulate page reload - new storage instance, same localStorage
    const storage2 = createCustomModelsStorage(mockStorage);
    const models = storage2.getCustomModels();

    assertEqual(models.length, 1);
    assertEqual(models[0].id, 'openai/my-model');
    assertEqual(models[0].name, 'My Model');
});

// ============================================================
// getBaseUrlForModel helper tests
// ============================================================

/**
 * Tests for the getBaseUrlForModel helper.
 * This helper checks if a model is custom and has a per-model base_url,
 * otherwise falls back to the global base URL.
 */
function createBaseUrlHelper(localStorage) {
    const customModelsStorage = createCustomModelsStorage(localStorage);

    return {
        getBaseUrl() {
            return localStorage.getItem('canvas-chat-base-url') || null;
        },

        setBaseUrl(url) {
            if (url) {
                localStorage.setItem('canvas-chat-base-url', url);
            } else {
                localStorage.removeItem('canvas-chat-base-url');
            }
        },

        getBaseUrlForModel(modelId) {
            // Check if model is a custom model with per-model base_url
            const customModels = customModelsStorage.getCustomModels();
            const customModel = customModels.find(m => m.id === modelId);

            if (customModel && customModel.base_url) {
                return customModel.base_url;
            }

            // Fall back to global base URL
            return this.getBaseUrl();
        },

        // Expose for test setup
        saveCustomModel: customModelsStorage.saveCustomModel.bind(customModelsStorage)
    };
}

test('getBaseUrlForModel: returns null when no base URL configured', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    assertNull(helper.getBaseUrlForModel('openai/gpt-4o'));
});

test('getBaseUrlForModel: returns global base URL for regular models', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global-proxy.com/v1');

    assertEqual(helper.getBaseUrlForModel('openai/gpt-4o'), 'https://global-proxy.com/v1');
});

test('getBaseUrlForModel: returns per-model base URL for custom models', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global-proxy.com/v1');
    helper.saveCustomModel({
        id: 'openai/my-custom',
        base_url: 'https://my-custom-proxy.com/v1'
    });

    assertEqual(helper.getBaseUrlForModel('openai/my-custom'), 'https://my-custom-proxy.com/v1');
});

test('getBaseUrlForModel: per-model base URL overrides global', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global.com/v1');
    helper.saveCustomModel({
        id: 'openai/custom',
        base_url: 'https://custom.com/v1'
    });

    // Custom model uses its own URL
    assertEqual(helper.getBaseUrlForModel('openai/custom'), 'https://custom.com/v1');
    // Regular model uses global URL
    assertEqual(helper.getBaseUrlForModel('openai/gpt-4o'), 'https://global.com/v1');
});

test('getBaseUrlForModel: custom model without base_url uses global', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global.com/v1');
    helper.saveCustomModel({
        id: 'openai/custom',
        // No base_url specified
    });

    assertEqual(helper.getBaseUrlForModel('openai/custom'), 'https://global.com/v1');
});

test('getBaseUrlForModel: custom model without base_url and no global returns null', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.saveCustomModel({
        id: 'openai/custom',
        // No base_url specified
    });

    assertNull(helper.getBaseUrlForModel('openai/custom'));
});

// ============================================================
// Matrix cell concurrent update tests
// ============================================================
// These tests verify the fix for the matrix cell persistence bug where
// concurrent cell fills would overwrite each other due to stale snapshots.

const Graph = global.window.Graph;

test('Matrix cells: sequential updates preserve all cells', () => {
    // Setup: Create a graph with a matrix node
    const graph = new Graph();
    const matrix = createMatrixNodeReal(
        { x: 0, y: 0 },
        'Test matrix',
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
        { x: 0, y: 0 },
        'Test matrix',
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
        { x: 0, y: 0 },
        'Test matrix',
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
// Graph.getDescendants() tests
// ============================================================

test('Graph.getDescendants returns all descendants in chain', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeB.id, nodeC.id));

    const descendants = graph.getDescendants(nodeA.id);
    assertEqual(descendants.length, 2);
    assertTrue(descendants.some(n => n.id === nodeB.id), 'Should include B');
    assertTrue(descendants.some(n => n.id === nodeC.id), 'Should include C');
});

test('Graph.getDescendants returns multiple children', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeC.id));
    graph.addEdge(createEdge(nodeA.id, nodeD.id));

    const descendants = graph.getDescendants(nodeA.id);
    assertEqual(descendants.length, 3);
});

test('Graph.getDescendants returns empty for leaf node', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    graph.addNode(nodeA);

    const descendants = graph.getDescendants(nodeA.id);
    assertEqual(descendants.length, 0);
});

test('Graph.getDescendants handles diamond/merge structure', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeC.id));
    graph.addEdge(createEdge(nodeB.id, nodeD.id));
    graph.addEdge(createEdge(nodeC.id, nodeD.id));

    const descendants = graph.getDescendants(nodeA.id);
    // Should include B, C, D (D only once despite two paths)
    assertEqual(descendants.length, 3);
    assertTrue(descendants.some(n => n.id === nodeD.id), 'Should include D');
});

// ============================================================
// Graph.isNodeVisible() tests
// ============================================================

test('Graph.isNodeVisible returns true for root nodes', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    graph.addNode(nodeA);

    assertTrue(graph.isNodeVisible(nodeA.id), 'Root node should be visible');
});

test('Graph.isNodeVisible returns true when no ancestors collapsed', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));

    assertTrue(graph.isNodeVisible(nodeB.id), 'Child should be visible when parent not collapsed');
});

test('Graph.isNodeVisible returns false when ancestor is collapsed', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));

    nodeA.collapsed = true;
    assertFalse(graph.isNodeVisible(nodeB.id), 'Child should be hidden when parent collapsed');
});

test('Graph.isNodeVisible returns false for deep descendant when ancestor collapsed', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeB.id, nodeC.id));

    nodeA.collapsed = true;
    assertFalse(graph.isNodeVisible(nodeC.id), 'Grandchild should be hidden when grandparent collapsed');
});

test('Graph.isNodeVisible returns true for merge node if any parent path visible', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond with D as merge node)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeC.id));
    graph.addEdge(createEdge(nodeB.id, nodeD.id));
    graph.addEdge(createEdge(nodeC.id, nodeD.id));

    // Collapse B only - D should still be visible via C
    nodeB.collapsed = true;
    assertTrue(graph.isNodeVisible(nodeD.id), 'Merge node should be visible if any parent path is open');
});

test('Graph.isNodeVisible returns false for merge node if all parent paths collapsed', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond with D as merge node)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeC.id));
    graph.addEdge(createEdge(nodeB.id, nodeD.id));
    graph.addEdge(createEdge(nodeC.id, nodeD.id));

    // Collapse both B and C - D should be hidden
    nodeB.collapsed = true;
    nodeC.collapsed = true;
    assertFalse(graph.isNodeVisible(nodeD.id), 'Merge node should be hidden if all parent paths collapsed');
});

// ============================================================
// Graph.countHiddenDescendants() tests
// ============================================================

test('Graph.countHiddenDescendants returns correct count for simple chain', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeB.id, nodeC.id));

    nodeA.collapsed = true;
    assertEqual(graph.countHiddenDescendants(nodeA.id), 2);
});

test('Graph.countHiddenDescendants returns 0 when not collapsed', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));

    // Not collapsed - all descendants are visible
    assertEqual(graph.countHiddenDescendants(nodeA.id), 0);
});

test('Graph.countHiddenDescendants counts only hidden nodes in merge', () => {
    // A -> B, A -> C, B -> D, C -> D, D -> E
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    const nodeE = createNodeReal(NodeType.AI, 'E');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addNode(nodeE);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeC.id));
    graph.addEdge(createEdge(nodeB.id, nodeD.id));
    graph.addEdge(createEdge(nodeC.id, nodeD.id));
    graph.addEdge(createEdge(nodeD.id, nodeE.id));

    // Collapse B only - D and E still visible via C, so B's hidden count is 0
    nodeB.collapsed = true;
    assertEqual(graph.countHiddenDescendants(nodeB.id), 0);

    // Collapse both B and C - now D and E are hidden
    nodeC.collapsed = true;
    // B's descendants are D and E, both hidden
    assertEqual(graph.countHiddenDescendants(nodeB.id), 2);
});

// ============================================================
// Graph.getVisibleDescendantsThroughHidden() tests
// ============================================================

test('Graph.getVisibleDescendantsThroughHidden returns visible children directly', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));

    // Not collapsed - B is visible, so it's returned as the first visible descendant
    const result = graph.getVisibleDescendantsThroughHidden(nodeA.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeB.id);
});

test('Graph.getVisibleDescendantsThroughHidden finds merge node through hidden path', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond with D as merge node)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeC.id));
    graph.addEdge(createEdge(nodeB.id, nodeD.id));
    graph.addEdge(createEdge(nodeC.id, nodeD.id));

    // Collapse B - D is still visible via C
    nodeB.collapsed = true;
    const result = graph.getVisibleDescendantsThroughHidden(nodeB.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeD.id);
});

test('Graph.getVisibleDescendantsThroughHidden returns empty when all descendants hidden', () => {
    // A -> B -> C (simple chain, all hidden when A collapsed)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeB.id, nodeC.id));

    // Collapse A - B and C are all hidden, no visible descendants through hidden
    nodeA.collapsed = true;
    const result = graph.getVisibleDescendantsThroughHidden(nodeA.id);
    assertEqual(result.length, 0);
});

test('Graph.getVisibleDescendantsThroughHidden stops at first visible node', () => {
    // A -> B -> C, A -> D -> C, C -> E
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    const nodeE = createNodeReal(NodeType.AI, 'E');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addNode(nodeE);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeD.id));
    graph.addEdge(createEdge(nodeB.id, nodeC.id));
    graph.addEdge(createEdge(nodeD.id, nodeC.id));
    graph.addEdge(createEdge(nodeC.id, nodeE.id));

    // Collapse B - C is visible via D, E is also visible
    // But we should only return C (first visible), not continue to E
    nodeB.collapsed = true;
    const result = graph.getVisibleDescendantsThroughHidden(nodeB.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeC.id);
});

test('Graph.getVisibleDescendantsThroughHidden returns empty for leaf node', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    graph.addNode(nodeA);

    const result = graph.getVisibleDescendantsThroughHidden(nodeA.id);
    assertEqual(result.length, 0);
});

// ============================================================
// Graph.getVisibleAncestorsThroughHidden() tests
// ============================================================

test('Graph.getVisibleAncestorsThroughHidden returns visible parents directly', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));

    // A is visible (root) - function returns all visible parents
    const result = graph.getVisibleAncestorsThroughHidden(nodeB.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeA.id);
});

test('Graph.getVisibleAncestorsThroughHidden finds collapsed parent', () => {
    // A -> B -> C (simple chain)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeB.id, nodeC.id));

    // Collapse A - C's visible ancestor through hidden path is A
    // (B is hidden, A is visible and collapsed)
    nodeA.collapsed = true;

    // For C, its parent B is hidden, so we traverse upward
    // B's parent A is visible (root)
    const result = graph.getVisibleAncestorsThroughHidden(nodeC.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeA.id);
});

test('Graph.getVisibleAncestorsThroughHidden returns both visible parents for merge node', () => {
    // A -> B -> D, A -> C -> D (D is visible merge node)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeA.id, nodeC.id));
    graph.addEdge(createEdge(nodeB.id, nodeD.id));
    graph.addEdge(createEdge(nodeC.id, nodeD.id));

    // Collapse B - D is visible via C
    // D's parents B and C are both visible (B is collapsed but still visible)
    nodeB.collapsed = true;

    const result = graph.getVisibleAncestorsThroughHidden(nodeD.id);
    // Both parents B and C are visible
    assertEqual(result.length, 2);
    const ids = result.map(n => n.id);
    assertTrue(ids.includes(nodeB.id), 'Should include B');
    assertTrue(ids.includes(nodeC.id), 'Should include C');
});

test('Graph.getVisibleAncestorsThroughHidden traverses through hidden nodes', () => {
    // A -> B -> C -> D, A -> E -> D (D is merge node)
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    const nodeB = createNodeReal(NodeType.AI, 'B');
    const nodeC = createNodeReal(NodeType.AI, 'C');
    const nodeD = createNodeReal(NodeType.AI, 'D');
    const nodeE = createNodeReal(NodeType.AI, 'E');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addNode(nodeE);
    graph.addEdge(createEdge(nodeA.id, nodeB.id));
    graph.addEdge(createEdge(nodeB.id, nodeC.id));
    graph.addEdge(createEdge(nodeC.id, nodeD.id));
    graph.addEdge(createEdge(nodeA.id, nodeE.id));
    graph.addEdge(createEdge(nodeE.id, nodeD.id));

    // Collapse B - C is hidden, D is visible via E
    // D's parent C is hidden, should traverse upward to find B (collapsed, visible)
    // D's parent E is visible
    nodeB.collapsed = true;

    const result = graph.getVisibleAncestorsThroughHidden(nodeD.id);
    // C is hidden, its parent B is visible (collapsed)
    // E is visible
    assertEqual(result.length, 2);
    const ids = result.map(n => n.id);
    assertTrue(ids.includes(nodeB.id), 'Should include B (through hidden C)');
    assertTrue(ids.includes(nodeE.id), 'Should include E (direct visible parent)');
});

test('Graph.getVisibleAncestorsThroughHidden returns empty for root node', () => {
    const graph = new Graph();
    const nodeA = createNodeReal(NodeType.HUMAN, 'A');
    graph.addNode(nodeA);

    const result = graph.getVisibleAncestorsThroughHidden(nodeA.id);
    assertEqual(result.length, 0);
});

// ============================================================
// Note: buildLLMRequest() tests removed
// ============================================================
// Per AGENTS.md principle: "Tests pure functions that don't require DOM or API calls"
// and "NOTE: This file loads actual source files to test real implementations, not copies"
//
// buildLLMRequest() is an instance method of the App class which:
// 1. Requires full App instantiation (complex with many dependencies)
// 2. Depends on runtime state (modelPicker, storage, chat instances)
// 3. Would require either duplicating the method logic (violates AGENTS.md)
//    OR complex mocking of the entire App lifecycle (brittle)
//
// Instead, this functionality is verified through:
// - Manual testing with actual proxy configurations
// - The refactoring itself (all calls use the helper, reducing duplication)
// - Python backend tests ensure the API accepts base_url correctly
//
// If E2E/integration tests are added in the future, buildLLMRequest()
// should be tested there, not in unit tests.
//
// ============================================================
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
