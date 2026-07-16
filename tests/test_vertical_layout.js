/**
 * Tests for verticalTreeLayout(), vertical autoPosition(), and focusCentricLayout().
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
// focusCentricLayout tests
// ============================================================

test('focusCentricLayout: chain produces straight edges', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A', NodeType.NOTE));
    graph.updateNode('A', { position: { x: 500, y: 100 } });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 300, y: 500 } });
    graph.addNode(createTestNode('C', NodeType.AI));
    graph.updateNode('C', { position: { x: 700, y: 900 } });
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    graph.focusCentricLayout('B');

    const cx = (id) => graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2;
    const tolerance = 5;
    assertTrue(Math.abs(cx('A') - cx('B')) < tolerance, 'A→B should be straight');
    assertTrue(Math.abs(cx('B') - cx('C')) < tolerance, 'B→C should be straight');
});

test('focusCentricLayout: sibling expansion includes cousins', () => {
    const graph = new TestGraph();
    // A → (B, C), B → D, C → E
    graph.addNode(createTestNode('A', NodeType.NOTE));
    graph.updateNode('A', { position: { x: 500, y: 100 } });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 300, y: 500 } });
    graph.addNode(createTestNode('C', NodeType.HUMAN));
    graph.updateNode('C', { position: { x: 700, y: 500 } });
    graph.addNode(createTestNode('D', NodeType.AI));
    graph.updateNode('D', { position: { x: 300, y: 900 } });
    graph.addNode(createTestNode('E', NodeType.AI));
    graph.updateNode('E', { position: { x: 700, y: 900 } });
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'E'));

    graph.focusCentricLayout('B');

    // C (sibling) and E (cousin) should be repositioned, not left behind
    const bY = Math.round(graph.getNode('B').position.y);
    const cY = Math.round(graph.getNode('C').position.y);
    assertEqual(bY, cY, 'C should be at same Y as B (sibling)');

    const dY = Math.round(graph.getNode('D').position.y);
    const eY = Math.round(graph.getNode('E').position.y);
    assertEqual(dY, eY, 'E should be at same Y as D (cousin)');
});

test('focusCentricLayout: focus path A→B→D has all straight edges', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A', NodeType.NOTE));
    graph.updateNode('A', { position: { x: 500, y: 100 } });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 300, y: 500 } });
    graph.addNode(createTestNode('C', NodeType.HUMAN));
    graph.updateNode('C', { position: { x: 700, y: 500 } });
    graph.addNode(createTestNode('D', NodeType.AI));
    graph.updateNode('D', { position: { x: 300, y: 900 } });
    graph.addNode(createTestNode('E', NodeType.AI));
    graph.updateNode('E', { position: { x: 700, y: 900 } });
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'E'));

    // Navigate A → B → D
    graph.focusCentricLayout('A');
    graph.focusCentricLayout('B');
    graph.focusCentricLayout('D');

    const cx = (id) => Math.round(graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2);
    const tol = 5;
    assertTrue(Math.abs(cx('A') - cx('B')) < tol, `A→B straight: ${cx('A')} vs ${cx('B')}`);
    assertTrue(Math.abs(cx('B') - cx('D')) < tol, `B→D straight: ${cx('B')} vs ${cx('D')}`);
    assertTrue(Math.abs(cx('C') - cx('E')) < tol, `C→E straight: ${cx('C')} vs ${cx('E')}`);
});

test('focusCentricLayout: focus path A→C→E has all straight edges', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A', NodeType.NOTE));
    graph.updateNode('A', { position: { x: 500, y: 100 } });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 300, y: 500 } });
    graph.addNode(createTestNode('C', NodeType.HUMAN));
    graph.updateNode('C', { position: { x: 700, y: 500 } });
    graph.addNode(createTestNode('D', NodeType.AI));
    graph.updateNode('D', { position: { x: 300, y: 900 } });
    graph.addNode(createTestNode('E', NodeType.AI));
    graph.updateNode('E', { position: { x: 700, y: 900 } });
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'E'));

    // Navigate A → C → E
    graph.focusCentricLayout('A');
    graph.focusCentricLayout('C');
    graph.focusCentricLayout('E');

    const cx = (id) => Math.round(graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2);
    const tol = 5;
    assertTrue(Math.abs(cx('A') - cx('C')) < tol, `A→C straight: ${cx('A')} vs ${cx('C')}`);
    assertTrue(Math.abs(cx('C') - cx('E')) < tol, `C→E straight: ${cx('C')} vs ${cx('E')}`);
    assertTrue(Math.abs(cx('B') - cx('D')) < tol, `B→D straight: ${cx('B')} vs ${cx('D')}`);
});

test('focusCentricLayout: multi-parent — spine parent aligned, other is branch', () => {
    const graph = new TestGraph();
    // A → B, C → B (B has 2 parents)
    graph.addNode(createTestNode('A', NodeType.NOTE));
    graph.updateNode('A', { position: { x: 200, y: 100 } });
    graph.addNode(createTestNode('C', NodeType.NOTE));
    graph.updateNode('C', { position: { x: 800, y: 100 } });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 500, y: 500 } });
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('C', 'B'));

    // No nav history: A is oldest → A on spine
    graph.focusCentricLayout('B', new Map(), []);

    const cx = (id) => Math.round(graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2);
    const w = (id) => graph.getNode(id).width || 420;

    // One parent (A, the oldest) should be aligned with B
    assertTrue(Math.abs(cx('A') - cx('B')) < 5, `Spine parent A should match B: ${cx('A')} vs ${cx('B')}`);
    // Other parent (C) should be offset (branch)
    assertTrue(Math.abs(cx('C') - cx('B')) > 50, `Branch parent C should be offset from B: ${cx('C')} vs ${cx('B')}`);
    // No overlap between A and C
    const [left, right] = cx('A') < cx('C') ? ['A', 'C'] : ['C', 'A'];
    assertTrue(
        graph.getNode(right).position.x >= graph.getNode(left).position.x + w(left),
        'Parents should not overlap',
    );
});

test('focusCentricLayout: focus node position unchanged', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A', NodeType.NOTE));
    graph.updateNode('A', { position: { x: 500, y: 300 } });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 300, y: 700 } });
    graph.addEdge(createTestEdge('A', 'B'));

    const beforeX = graph.getNode('A').position.x;
    const beforeY = graph.getNode('A').position.y;

    graph.focusCentricLayout('A');

    const after = graph.getNode('A').position;
    assertEqual(Math.round(after.x), Math.round(beforeX), 'Focus X should not change');
    assertEqual(Math.round(after.y), Math.round(beforeY), 'Focus Y should not change');
});

test('focusCentricLayout: single node is no-op', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('A'));
    // Should not throw
    graph.focusCentricLayout('A');
    assertTrue(graph.getNode('A') !== null);
});

test('focusCentricLayout: no vertical overlap when focus taller than child', () => {
    // Regression: Y gap used child's height instead of parent's.
    // AI (480px) focus with HUMAN (200px) child caused 220px overlap.
    const graph = new TestGraph();
    graph.addNode(createTestNode('A', NodeType.HUMAN));
    graph.updateNode('A', { position: { x: 500, y: 100 } });
    graph.addNode(createTestNode('B', NodeType.AI));
    graph.updateNode('B', { position: { x: 500, y: 400 } });
    graph.addNode(createTestNode('C', NodeType.HUMAN));
    graph.updateNode('C', { position: { x: 500, y: 1000 } });
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    graph.focusCentricLayout('B');

    const b = graph.getNode('B');
    const c = graph.getNode('C');
    const bBottom = b.position.y + (b.height || 480);
    const cTop = c.position.y;
    assertTrue(cTop >= bBottom, `C top (${Math.round(cTop)}) should be >= B bottom (${Math.round(bBottom)})`);
});

test('focusCentricLayout: no vertical overlap when focus shorter than child', () => {
    // HUMAN (200px) focus with AI (480px) child
    const graph = new TestGraph();
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 500, y: 500 } });
    graph.addNode(createTestNode('C', NodeType.AI));
    graph.updateNode('C', { position: { x: 500, y: 900 } });
    graph.addEdge(createTestEdge('B', 'C'));

    graph.focusCentricLayout('B');

    const b = graph.getNode('B');
    const c = graph.getNode('C');
    const bBottom = b.position.y + (b.height || 200);
    const cTop = c.position.y;
    assertTrue(cTop >= bBottom, `C top (${Math.round(cTop)}) should be >= B bottom (${Math.round(bBottom)})`);
});

test('focusCentricLayout: no horizontal overlaps in complex DAG', () => {
    // The user's 15-node graph that exposed the overlap bug
    const graph = new TestGraph();
    const edges = [
        ['A','B'],['B','C'],['C','D'],['D','I'],['I','J'],
        ['J','K'],['K','M'],['J','L'],['L','N'],
        ['D','F'],['E','F'],['F','H'],['D','G'],['G','E'],
    ];
    const types = {
        A: NodeType.HUMAN, B: NodeType.AI, C: NodeType.HUMAN, D: NodeType.AI,
        E: NodeType.HUMAN, F: NodeType.AI, G: NodeType.HUMAN, H: NodeType.AI,
        I: NodeType.HUMAN, J: NodeType.AI, K: NodeType.HUMAN, L: NodeType.HUMAN,
        M: NodeType.AI, N: NodeType.AI,
    };
    for (const id of Object.keys(types)) {
        graph.addNode(createTestNode(id, types[id]));
        graph.updateNode(id, { position: { x: 500, y: 500 } });
    }
    for (const [s, t] of edges) graph.addEdge(createTestEdge(s, t));

    // Navigate F → E (the failing scenario)
    graph.focusCentricLayout('F');
    graph.focusCentricLayout('E');

    // Check no two nodes at the same Y layer overlap horizontally
    const allNodes = graph.getAllNodes();
    const byLayer = new Map();
    for (const node of allNodes) {
        const y = Math.round(node.position.y / 10) * 10;
        if (!byLayer.has(y)) byLayer.set(y, []);
        byLayer.get(y).push(node);
    }

    for (const [y, nodes] of byLayer) {
        const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
        for (let i = 1; i < sorted.length; i++) {
            const prevRight = sorted[i - 1].position.x + (sorted[i - 1].width || 420);
            assertTrue(
                sorted[i].position.x >= prevRight,
                `Overlap at Y=${y}: ${sorted[i - 1].id} right=${Math.round(prevRight)} vs ${sorted[i].id} left=${Math.round(sorted[i].position.x)}`,
            );
        }
    }
});

test('focusCentricLayout: subtree spreading prevents child overlaps', () => {
    // Parent with 2 children that each have wide subtrees.
    // Children should be spread by subtree width, not overlap.
    const graph = new TestGraph();
    // A → (B, C), B → D (AI 640px), C → E (AI 640px)
    graph.addNode(createTestNode('A', NodeType.NOTE));
    graph.updateNode('A', { position: { x: 500, y: 100 } });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 300, y: 500 } });
    graph.addNode(createTestNode('C', NodeType.HUMAN));
    graph.updateNode('C', { position: { x: 700, y: 500 } });
    graph.addNode(createTestNode('D', NodeType.AI));
    graph.updateNode('D', { position: { x: 300, y: 900 } });
    graph.addNode(createTestNode('E', NodeType.AI));
    graph.updateNode('E', { position: { x: 700, y: 900 } });
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'E'));

    graph.focusCentricLayout('A');

    // B and C are children of A at the same layer — they must not overlap
    const b = graph.getNode('B');
    const c = graph.getNode('C');
    const bw = b.width || 420;
    const cw = c.width || 420;
    const [left, right] = b.position.x < c.position.x ? [b, c] : [c, b];
    const leftW = left.width || 420;
    assertTrue(
        right.position.x >= left.position.x + leftW,
        `Children should not overlap: ${right.id} left=${Math.round(right.position.x)} vs ${left.id} right=${Math.round(left.position.x + leftW)}`,
    );
});

test('focusCentricLayout: spine vertical alignment on 15-node DAG', () => {
    // The user's graph: verify spine A-B-C-D-F-H is vertically aligned when navigating F→H
    const graph = new TestGraph();
    const edges = [
        ['A','B'],['B','C'],['C','D'],['D','I'],['I','J'],
        ['J','K'],['K','M'],['J','L'],['L','N'],
        ['D','F'],['E','F'],['F','H'],['D','G'],['G','E'],
    ];
    const types = {
        A: NodeType.HUMAN, B: NodeType.AI, C: NodeType.HUMAN, D: NodeType.AI,
        E: NodeType.HUMAN, F: NodeType.AI, G: NodeType.HUMAN, H: NodeType.AI,
        I: NodeType.HUMAN, J: NodeType.AI, K: NodeType.HUMAN, L: NodeType.HUMAN,
        M: NodeType.AI, N: NodeType.AI,
    };
    for (const id of Object.keys(types)) {
        graph.addNode(createTestNode(id, types[id]));
        graph.updateNode(id, { position: { x: 500, y: 500 } });
    }
    for (const [s, t] of edges) graph.addEdge(createTestEdge(s, t));

    // Navigate to F then H
    graph.focusCentricLayout('F');
    graph.focusCentricLayout('H');

    const cx = (id) => Math.round(graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2);
    const tol = 5;

    // Spine: A-B-C-D-F-H should all have the same center X
    const spineIds = ['A', 'B', 'C', 'D', 'F', 'H'];
    const spineCxs = spineIds.map(cx);
    const allAligned = spineCxs.every((c) => Math.abs(c - spineCxs[0]) < tol);
    assertTrue(allAligned, `Spine not aligned: ${spineIds.map((id, i) => id + '=' + spineCxs[i]).join(', ')}`);

    // No overlaps at any layer
    const byY = new Map();
    for (const id of Object.keys(types)) {
        const y = Math.round(graph.getNode(id).position.y / 10) * 10;
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push(id);
    }
    for (const [y, ids] of byY) {
        if (ids.length < 2) continue;
        const sorted = ids.map((id) => ({ id, x: graph.getNode(id).position.x, w: graph.getNode(id).width || 420 })).sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i++) {
            assertTrue(
                sorted[i].x >= sorted[i - 1].x + sorted[i - 1].w,
                `Overlap at Y=${y}: ${sorted[i - 1].id} & ${sorted[i].id}`,
            );
        }
    }
});

test('focusCentricLayout: navigation history determines spine parent', () => {
    // (A, B) → C. Navigating C→B→C puts B on spine; C→A→C puts A on spine.
    const graph = new TestGraph();
    graph.addNode(createTestNode('A', NodeType.HUMAN));
    graph.updateNode('A', { position: { x: 300, y: 100 }, created_at: 1000 });
    graph.addNode(createTestNode('B', NodeType.HUMAN));
    graph.updateNode('B', { position: { x: 700, y: 100 }, created_at: 2000 });
    graph.addNode(createTestNode('C', NodeType.AI));
    graph.updateNode('C', { position: { x: 500, y: 500 }, created_at: 3000 });
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'C'));

    const cx = (id) => Math.round(graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2);

    // First visit: A is oldest → A on spine
    graph.focusCentricLayout('C', new Map(), []);
    assertTrue(Math.abs(cx('A') - cx('C')) < 5, 'First visit: A (oldest) should be on spine');

    // C→B→C: B most recently visited → B on spine
    graph.focusCentricLayout('B', new Map(), ['C', 'B']);
    graph.focusCentricLayout('C', new Map(), ['C', 'B', 'C']);
    assertTrue(Math.abs(cx('B') - cx('C')) < 5, 'After C→B→C: B should be on spine');
    assertTrue(Math.abs(cx('A') - cx('C')) > 50, 'After C→B→C: A should be a branch');

    // C→A→C: A most recently visited → A on spine
    graph.focusCentricLayout('A', new Map(), ['C', 'B', 'C', 'A']);
    graph.focusCentricLayout('C', new Map(), ['C', 'B', 'C', 'A', 'C']);
    assertTrue(Math.abs(cx('A') - cx('C')) < 5, 'After C→A→C: A should be on spine');
    assertTrue(Math.abs(cx('B') - cx('C')) > 50, 'After C→A→C: B should be a branch');
});

test('focusCentricLayout: navigation history determines spine child', () => {
    // C → (D, E). Navigating C→D→C puts D on spine; C→E→C puts E on spine.
    const graph = new TestGraph();
    graph.addNode(createTestNode('C', NodeType.HUMAN));
    graph.updateNode('C', { position: { x: 500, y: 500 }, created_at: 1000 });
    graph.addNode(createTestNode('D', NodeType.AI));
    graph.updateNode('D', { position: { x: 300, y: 900 }, created_at: 2000 });
    graph.addNode(createTestNode('E', NodeType.AI));
    graph.updateNode('E', { position: { x: 700, y: 900 }, created_at: 3000 });
    graph.addEdge(createTestEdge('C', 'D'));
    graph.addEdge(createTestEdge('C', 'E'));

    const cx = (id) => Math.round(graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2);

    // First visit: D is oldest → D on spine
    graph.focusCentricLayout('C', new Map(), []);
    assertTrue(Math.abs(cx('D') - cx('C')) < 5, 'First visit: D (oldest) should be on spine');

    // C→E→C: E most recently visited → E on spine
    graph.focusCentricLayout('E', new Map(), ['C', 'E']);
    graph.focusCentricLayout('C', new Map(), ['C', 'E', 'C']);
    assertTrue(Math.abs(cx('E') - cx('C')) < 5, 'After C→E→C: E should be on spine');
    assertTrue(Math.abs(cx('D') - cx('C')) > 50, 'After C→E→C: D should be a branch');
});

test('focusCentricLayout: stable across repeated navigation', () => {
    // Navigating back and forth should not accumulate drift or introduce overlaps
    const graph = new TestGraph();
    const edges = [
        ['A','B'],['B','C'],['C','D'],['D','I'],['I','J'],
        ['J','K'],['K','M'],['J','L'],['L','N'],
        ['D','F'],['E','F'],['F','H'],['D','G'],['G','E'],
    ];
    const types = {
        A: NodeType.HUMAN, B: NodeType.AI, C: NodeType.HUMAN, D: NodeType.AI,
        E: NodeType.HUMAN, F: NodeType.AI, G: NodeType.HUMAN, H: NodeType.AI,
        I: NodeType.HUMAN, J: NodeType.AI, K: NodeType.HUMAN, L: NodeType.HUMAN,
        M: NodeType.AI, N: NodeType.AI,
    };
    for (const id of Object.keys(types)) {
        graph.addNode(createTestNode(id, types[id]));
        graph.updateNode(id, { position: { x: 500, y: 500 } });
    }
    for (const [s, t] of edges) graph.addEdge(createTestEdge(s, t));

    // 3 round-trips F→H→F→H
    for (let i = 0; i < 3; i++) {
        graph.focusCentricLayout('F');
        graph.focusCentricLayout('H');
    }

    const cx = (id) => Math.round(graph.getNode(id).position.x + (graph.getNode(id).width || 420) / 2);

    // Spine still aligned
    assertTrue(Math.abs(cx('F') - cx('H')) < 5, 'F→H should still be straight after round-trips');
    assertTrue(Math.abs(cx('D') - cx('F')) < 5, 'D→F should still be straight after round-trips');

    // No overlaps
    const byY = new Map();
    for (const id of Object.keys(types)) {
        const y = Math.round(graph.getNode(id).position.y / 10) * 10;
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push(id);
    }
    for (const [y, ids] of byY) {
        if (ids.length < 2) continue;
        const sorted = ids.map((id) => ({ id, x: graph.getNode(id).position.x, w: graph.getNode(id).width || 420 })).sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i++) {
            assertTrue(
                sorted[i].x >= sorted[i - 1].x + sorted[i - 1].w,
                `Overlap at Y=${y} after round-trips: ${sorted[i - 1].id} & ${sorted[i].id}`,
            );
        }
    }
});

test('focusCentricLayout: disconnected subgraphs do not overlap the focus component', () => {
    // Navigating to a focus node must not leave disconnected subgraphs at stale
    // positions that the rearranged focus component then overlaps.
    const graph = new TestGraph();
    const edges = [
        ['A', 'B'], ['B', 'D'], ['A', 'C'], ['C', 'E'], ['E', 'F'],
        ['F', 'G'], ['F', 'H'], ['H', 'I'], ['J', 'K'], // J->K is disconnected
    ];
    for (const id of ['A','B','C','D','E','F','G','H','I','J','K']) {
        graph.addNode(createTestNode(id, NodeType.HUMAN));
    }
    for (const [s, t] of edges) graph.addEdge(createTestEdge(s, t));
    graph.verticalTreeLayout();

    // Simulate navigating A -> C.
    graph.focusCentricLayout('C', new Map(), ['A', 'C']);

    const ids = ['A','B','C','D','E','F','G','H','I','J','K'];
    const sz = (n) => ({ w: n.width || 420, h: n.height || 200 });
    const overlap = (a, b) => {
        const sa = sz(a), sb = sz(b);
        return !(a.position.x + sa.w < b.position.x || a.position.x > b.position.x + sb.w ||
                 a.position.y + sa.h < b.position.y || a.position.y > b.position.y + sb.h);
    };
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = graph.getNode(ids[i]);
            const b = graph.getNode(ids[j]);
            assertFalse(overlap(a, b), `${ids[i]} must not overlap ${ids[j]} after focus layout`);
        }
    }
    // Disconnected J->K must keep top-down orientation (parent J above child K).
    assertTrue(
        graph.getNode('J').position.y < graph.getNode('K').position.y,
        'Disconnected parent J should be above child K',
    );
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
