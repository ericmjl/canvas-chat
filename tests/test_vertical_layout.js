/**
 * Tests for verticalTreeLayout() and vertical autoPosition().
 * Tests the top-down tree layout algorithm (Sugiyama-lite for DAGs).
 */

import {
    test,
    assertEqual,
    assertTrue,
    assertFalse,
    NodeType,
    TestGraph,
    createTestNode,
    createTestEdge,
    tests,
} from './test_setup.js';

// ============================================================
// autoPosition: vertical (below parent) tests
// ============================================================

test('autoPosition: no parents returns origin', () => {
    const graph = new TestGraph();
    const pos = graph.autoPosition([]);
    assertEqual(pos.x, 100);
    assertEqual(pos.y, 100);
});

test('autoPosition: single parent places node below', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A'));
    graph.updateNode('A', { position: { x: 500, y: 300 } });

    const pos = graph.autoPosition(['A']);

    // Should be below parent
    assertTrue(pos.y > 300, 'Child should be below parent Y');
    // X should be centered relative to parent center
    // NOTE type default size is 640x480, so parent center = 500 + 320 = 820
    // childX = 820 - 210 (NODE_WIDTH/2) = 610
    assertEqual(pos.x, 610);
});

test('autoPosition: multiple parents averages X, uses deepest Y', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.updateNode('A', { position: { x: 200, y: 100 } });
    graph.updateNode('B', { position: { x: 600, y: 500 } });

    const pos = graph.autoPosition(['A', 'B']);

    // Y should be below the deepest parent (B at y=500 + height 480 + gap 60 = 1040)
    assertTrue(pos.y > 500, 'Child should be below deepest parent');
    // X: avgCenter = ((200 + 320) + (600 + 320)) / 2 = (520 + 920) / 2 = 720
    // childX = 720 - 210 = 510
    assertEqual(pos.x, 510);
});

test('autoPosition: type-aware centering for different-width nodes', () => {
    const graph = new TestGraph();
    // HUMAN node (420x200) as parent
    graph.addNode(createTestNode('parent', NodeType.HUMAN));
    graph.updateNode('parent', { position: { x: 500, y: 300 } });

    // Place an AI node (640x480) below the HUMAN parent
    const pos = graph.autoPosition(['parent'], NodeType.AI);

    // Parent center X = 500 + 420/2 = 710
    // AI node should be centered: pos.x = 710 - 640/2 = 710 - 320 = 390
    assertEqual(pos.x, 390);

    // Verify centers match
    const parentCenter = 500 + 420 / 2; // 710
    const childCenter = pos.x + 640 / 2; // 390 + 320 = 710
    assertEqual(childCenter, parentCenter);
});

test('autoPosition: createLinkedNode centers AI under HUMAN correctly', () => {
    const graph = new TestGraph();
    // HUMAN node at a known position
    graph.addNode(createTestNode('human', NodeType.HUMAN));
    graph.updateNode('human', { position: { x: 500, y: 300 } });

    // Create an AI node linked to the HUMAN
    const aiNode = graph.createLinkedNode(NodeType.AI, 'response', ['human']);

    // Both should have the same center X
    const humanCenter = 500 + 420 / 2; // 710
    const aiCenter = aiNode.position.x + 640 / 2;
    assertEqual(aiCenter, humanCenter);
});

// ============================================================
// verticalTreeLayout: basic structure tests
// ============================================================

test('verticalTreeLayout: simple chain has increasing Y by depth', () => {
    const graph = new TestGraph();
    // A → B → C
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.addNode(createTestNode('C'));
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    graph.verticalTreeLayout();

    const a = graph.getNode('A');
    const b = graph.getNode('B');
    const c = graph.getNode('C');

    // Parents above children
    assertTrue(a.position.y < b.position.y, 'A should be above B');
    assertTrue(b.position.y < c.position.y, 'B should be above C');
});

test('verticalTreeLayout: parent Y less than child Y for branching', () => {
    const graph = new TestGraph();
    // A → B, A → C
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.addNode(createTestNode('C'));
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));

    graph.verticalTreeLayout();

    const a = graph.getNode('A');
    const b = graph.getNode('B');
    const c = graph.getNode('C');

    // A (parent) should be above both B and C
    assertTrue(a.position.y < b.position.y, 'A should be above B');
    assertTrue(a.position.y < c.position.y, 'A should be above C');
    // B and C should be in the same layer (same Y)
    assertEqual(b.position.y, c.position.y);
});

test('verticalTreeLayout: no horizontal overlap within a layer', () => {
    const graph = new TestGraph();
    // A → B, A → C, A → D
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.addNode(createTestNode('C'));
    graph.addNode(createTestNode('D'));
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('A', 'D'));

    graph.verticalTreeLayout();

    const b = graph.getNode('B');
    const c = graph.getNode('C');
    const d = graph.getNode('D');

    const NODE_WIDTH = 420;
    const GAP = 50;

    // All at same Y
    assertEqual(b.position.y, c.position.y);
    assertEqual(c.position.y, d.position.y);

    // Sort by X and check no overlap
    const sorted = [b, c, d].sort((n1, n2) => n1.position.x - n2.position.x);
    for (let i = 1; i < sorted.length; i++) {
        const prevRight = sorted[i - 1].position.x + NODE_WIDTH;
        assertTrue(
            sorted[i].position.x >= prevRight,
            `Layer nodes should not overlap horizontally: ${sorted[i].position.x} should be >= ${prevRight}`,
        );
    }
});

test('verticalTreeLayout: first child centered under parent (top-down)', () => {
    const graph = new TestGraph();
    // A → B, A → C
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.addNode(createTestNode('C'));
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));

    graph.verticalTreeLayout();

    const a = graph.getNode('A');
    const b = graph.getNode('B');
    const c = graph.getNode('C');

    // Top-down-only: parent stays at its position, first child aligns under it
    const aw = a.width || 420;
    const bw = b.width || 420;
    const aCenter = a.position.x + aw / 2;

    // Sort children by X — the first (leftmost) should be centered under parent
    const [first, second] = [b, c].sort((n1, n2) => n1.position.x - n2.position.x);
    const firstCenter = first.position.x + (first.width || 420) / 2;

    assertTrue(
        Math.abs(aCenter - firstCenter) < 10,
        `First child center (${firstCenter}) should align with parent center (${aCenter})`,
    );

    // Second child should be to the right (no overlap)
    const firstRight = first.position.x + bw + 50;
    assertTrue(second.position.x >= firstRight, 'Second child should not overlap first');
});

test('verticalTreeLayout: handles DAG (node with 2 parents)', () => {
    const graph = new TestGraph();
    // A → C, B → C (C has 2 parents)
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.addNode(createTestNode('C'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'C'));

    graph.verticalTreeLayout();

    const a = graph.getNode('A');
    const b = graph.getNode('B');
    const c = graph.getNode('C');

    // A and B at layer 0, C at layer 1
    assertEqual(a.position.y, b.position.y);
    assertTrue(c.position.y > a.position.y, 'C should be below A and B');

    // C's X center should be between A and B's centers
    const aCenter = a.position.x + 210;
    const bCenter = b.position.x + 210;
    const cCenter = c.position.x + 210;

    const minParentCenter = Math.min(aCenter, bCenter);
    const maxParentCenter = Math.max(aCenter, bCenter);

    assertTrue(
        cCenter >= minParentCenter - 50 && cCenter <= maxParentCenter + 50,
        `C center (${cCenter}) should be between parent centers [${minParentCenter}, ${maxParentCenter}]`,
    );
});

test('verticalTreeLayout: empty graph is no-op', () => {
    const graph = new TestGraph();
    // Should not throw
    graph.verticalTreeLayout();
    assertTrue(graph.isEmpty());
});

test('verticalTreeLayout: single node stays at start position', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A'));

    graph.verticalTreeLayout();

    const a = graph.getNode('A');
    // Root at layer 0, Y = START_Y = 100
    assertEqual(a.position.y, 100);
    // X should be START_X = 100
    assertEqual(a.position.x, 100);
});

test('verticalTreeLayout: deeper tree has consistent layer spacing', () => {
    const graph = new TestGraph();
    // A → B → C → D (4-layer chain)
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.addNode(createTestNode('C'));
    graph.addNode(createTestNode('D'));
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));
    graph.addEdge(createTestEdge('C', 'D'));

    graph.verticalTreeLayout();

    const ys = ['A', 'B', 'C', 'D'].map((id) => graph.getNode(id).position.y);

    // Y should be strictly increasing
    for (let i = 1; i < ys.length; i++) {
        assertTrue(ys[i] > ys[i - 1], `Layer ${i} Y (${ys[i]}) should be > layer ${i - 1} Y (${ys[i - 1]})`);
    }

    // Layer gaps should be roughly equal (DEFAULT_HEIGHT + VERTICAL_GAP = 220 + 60 = 280)
    const gap1 = ys[1] - ys[0];
    const gap2 = ys[2] - ys[1];
    const gap3 = ys[3] - ys[2];

    assertTrue(Math.abs(gap1 - gap2) < 5, `Layer gaps should be consistent: ${gap1} vs ${gap2}`);
    assertTrue(Math.abs(gap2 - gap3) < 5, `Layer gaps should be consistent: ${gap2} vs ${gap3}`);
});

test('verticalTreeLayout: all positions are positive', () => {
    const graph = new TestGraph();
    // Create a more complex graph
    graph.addNode(createTestNode('R'));
    graph.addNode(createTestNode('A'));
    graph.addNode(createTestNode('B'));
    graph.addNode(createTestNode('C'));
    graph.addNode(createTestNode('D'));
    graph.addEdge(createTestEdge('R', 'A'));
    graph.addEdge(createTestEdge('R', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));

    graph.verticalTreeLayout();

    for (const id of ['R', 'A', 'B', 'C', 'D']) {
        const node = graph.getNode(id);
        assertTrue(node.position.x >= 100, `Node ${id} X should be >= 100, got ${node.position.x}`);
        assertTrue(node.position.y >= 100, `Node ${id} Y should be >= 100, got ${node.position.y}`);
    }
});

// ============================================================
// Runner (test_setup collects tests; run them here)
// ============================================================
let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.error(`  ${err.message}`);
        failed++;
    }
}
console.log(`\n========================================`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('========================================\n');
process.exit(failed > 0 ? 1 : 0);
