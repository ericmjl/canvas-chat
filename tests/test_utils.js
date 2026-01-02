/**
 * Unit tests for JavaScript utility functions.
 * Run with: node tests/test_utils.js
 *
 * Tests pure functions that don't require DOM or API calls.
 */

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

/**
 * Extract URL from Reference node content (format: **[Title](url)**)
 * This is a copy of the function from app.js for testing
 */
function extractUrlFromReferenceNode(content) {
    // Match markdown link pattern: [text](url)
    const match = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (match && match[2]) {
        return match[2];
    }
    return null;
}

// Test cases
test('extractUrlFromReferenceNode: standard markdown link', () => {
    const content = '**[Article Title](https://example.com/article)**\n\nSome snippet text.';
    assertEqual(extractUrlFromReferenceNode(content), 'https://example.com/article');
});

test('extractUrlFromReferenceNode: link with query params', () => {
    const content = '**[Search Result](https://example.com/page?id=123&ref=abc)**';
    assertEqual(extractUrlFromReferenceNode(content), 'https://example.com/page?id=123&ref=abc');
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

/**
 * Format a matrix node as a markdown table
 * Copy of function from app.js for testing
 */
function formatMatrixAsText(matrixNode) {
    const { context, rowItems, colItems, cells } = matrixNode;

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

    const result = formatMatrixAsText(matrix);
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

    const result = formatMatrixAsText(matrix);
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

    const result = formatMatrixAsText(matrix);
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

    const result = formatMatrixAsText(matrix);
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

/**
 * Check if a position would overlap with existing nodes
 * Copy of function from graph.js for testing
 */
function wouldOverlap(pos, width, height, nodes) {
    const PADDING = 20;

    for (const node of nodes) {
        const nodeWidth = node.width || 420;
        const nodeHeight = node.height || 200;

        const noOverlap =
            pos.x + width + PADDING < node.position.x ||
            pos.x > node.position.x + nodeWidth + PADDING ||
            pos.y + height + PADDING < node.position.y ||
            pos.y > node.position.y + nodeHeight + PADDING;

        if (!noOverlap) {
            return true;
        }
    }

    return false;
}

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

/**
 * Escape HTML special characters
 * Copy of function from app.js/canvas.js for testing
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = { textContent: '' };
    div.textContent = text;
    // Simulate what the browser does
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

test('escapeHtml: escapes angle brackets', () => {
    assertEqual(escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapeHtml: escapes ampersand', () => {
    assertEqual(escapeHtml('A & B'), 'A &amp; B');
});

test('escapeHtml: escapes quotes', () => {
    assertEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
});

test('escapeHtml: handles empty string', () => {
    assertEqual(escapeHtml(''), '');
});

test('escapeHtml: handles null/undefined', () => {
    assertEqual(escapeHtml(null), '');
    assertEqual(escapeHtml(undefined), '');
});

// ============================================================
// truncate tests
// ============================================================

/**
 * Truncate text to a maximum length
 * Copy of function from app.js for testing
 */
function truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

test('truncate: returns original if shorter than max', () => {
    assertEqual(truncate('hello', 10), 'hello');
});

test('truncate: truncates and adds ellipsis', () => {
    assertEqual(truncate('hello world', 8), 'hello...');
});

test('truncate: handles exact length', () => {
    assertEqual(truncate('hello', 5), 'hello');
});

test('truncate: handles empty string', () => {
    assertEqual(truncate('', 10), '');
});

test('truncate: handles null/undefined', () => {
    assertEqual(truncate(null, 10), '');
    assertEqual(truncate(undefined, 10), '');
});

// ============================================================
// resolveOverlaps tests
// ============================================================

/**
 * Calculate overlap between two nodes.
 * Copy of function from graph.js for testing
 */
function getOverlap(nodeA, nodeB, padding = 40) {
    const getNodeSize = (node) => ({
        width: node.width || 420,
        height: node.height || 220
    });

    const sizeA = getNodeSize(nodeA);
    const sizeB = getNodeSize(nodeB);

    const aLeft = nodeA.position.x;
    const aRight = nodeA.position.x + sizeA.width + padding;
    const aTop = nodeA.position.y;
    const aBottom = nodeA.position.y + sizeA.height + padding;

    const bLeft = nodeB.position.x;
    const bRight = nodeB.position.x + sizeB.width + padding;
    const bTop = nodeB.position.y;
    const bBottom = nodeB.position.y + sizeB.height + padding;

    const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
    const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

    if (overlapX > 0 && overlapY > 0) {
        return { overlapX, overlapY };
    }
    return { overlapX: 0, overlapY: 0 };
}

/**
 * Resolve overlapping nodes.
 * Copy of function from graph.js for testing
 */
function resolveOverlaps(nodes, padding = 40, maxIterations = 50) {
    const getNodeSize = (node) => ({
        width: node.width || 420,
        height: node.height || 220
    });

    for (let iter = 0; iter < maxIterations; iter++) {
        let hasOverlap = false;

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const nodeA = nodes[i];
                const nodeB = nodes[j];

                const { overlapX, overlapY } = getOverlap(nodeA, nodeB, padding);

                if (overlapX > 0 && overlapY > 0) {
                    hasOverlap = true;

                    const sizeA = getNodeSize(nodeA);
                    const sizeB = getNodeSize(nodeB);

                    const centerAx = nodeA.position.x + sizeA.width / 2;
                    const centerAy = nodeA.position.y + sizeA.height / 2;
                    const centerBx = nodeB.position.x + sizeB.width / 2;
                    const centerBy = nodeB.position.y + sizeB.height / 2;

                    if (overlapX < overlapY) {
                        const pushAmount = (overlapX / 2) + 1;
                        if (centerBx >= centerAx) {
                            nodeA.position.x -= pushAmount;
                            nodeB.position.x += pushAmount;
                        } else {
                            nodeA.position.x += pushAmount;
                            nodeB.position.x -= pushAmount;
                        }
                    } else {
                        const pushAmount = (overlapY / 2) + 1;
                        if (centerBy >= centerAy) {
                            nodeA.position.y -= pushAmount;
                            nodeB.position.y += pushAmount;
                        } else {
                            nodeA.position.y += pushAmount;
                            nodeB.position.y -= pushAmount;
                        }
                    }
                }
            }
        }

        if (!hasOverlap) break;
    }
}

/**
 * Check if any nodes in the array overlap
 */
function hasAnyOverlap(nodes, padding = 40) {
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const { overlapX, overlapY } = getOverlap(nodes[i], nodes[j], padding);
            if (overlapX > 0 && overlapY > 0) {
                return true;
            }
        }
    }
    return false;
}

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
    const nodes = [
        { position: { x: 0, y: 0 }, width: 100, height: 100 },
        { position: { x: 500, y: 0 }, width: 100, height: 100 },
        { position: { x: 0, y: 500 }, width: 100, height: 100 }
    ];

    const originalPositions = nodes.map(n => ({ x: n.position.x, y: n.position.y }));

    assertFalse(hasAnyOverlap(nodes), 'Nodes should not overlap initially');

    resolveOverlaps(nodes);

    // Positions should remain unchanged
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

/**
 * Detect if content is a URL (used by handleNote to route to handleNoteFromUrl)
 * This is a copy of the logic from app.js for testing
 */
function isUrl(content) {
    const urlPattern = /^https?:\/\/[^\s]+$/;
    return urlPattern.test(content.trim());
}

test('isUrl: detects http URL', () => {
    assertTrue(isUrl('http://example.com'));
});

test('isUrl: detects https URL', () => {
    assertTrue(isUrl('https://example.com'));
});

test('isUrl: detects URL with path', () => {
    assertTrue(isUrl('https://example.com/path/to/page'));
});

test('isUrl: detects URL with query params', () => {
    assertTrue(isUrl('https://example.com/page?id=123&ref=abc'));
});

test('isUrl: detects URL with fragment', () => {
    assertTrue(isUrl('https://example.com/page#section'));
});

test('isUrl: detects complex URL', () => {
    assertTrue(isUrl('https://pmc.ncbi.nlm.nih.gov/articles/PMC12514551/'));
});

test('isUrl: trims whitespace', () => {
    assertTrue(isUrl('  https://example.com  '));
});

test('isUrl: rejects plain text', () => {
    assertFalse(isUrl('This is just some text'));
});

test('isUrl: rejects markdown', () => {
    assertFalse(isUrl('# Heading\n\nSome content'));
});

test('isUrl: rejects URL embedded in text', () => {
    assertFalse(isUrl('Check out https://example.com for more'));
});

test('isUrl: rejects URL without protocol', () => {
    assertFalse(isUrl('example.com'));
});

test('isUrl: rejects ftp URLs', () => {
    assertFalse(isUrl('ftp://files.example.com'));
});

test('isUrl: rejects empty string', () => {
    assertFalse(isUrl(''));
});

test('isUrl: rejects whitespace only', () => {
    assertFalse(isUrl('   '));
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
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
