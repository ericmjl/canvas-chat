/**
 * Tests for layout.js
 * Tests node positioning and overlap resolution functions.
 */

import {
    test,
    assertEqual,
    assertTrue,
    assertFalse,
    wouldOverlapNodes,
    getOverlap,
    hasAnyOverlap,
    resolveOverlaps,
    resolveHorizontalOverlaps,
    tests,
} from './test_setup.js';

// ============================================================
// wouldOverlap tests
// ============================================================

test('wouldOverlap: no overlap when far apart', () => {
    const nodes = [{ id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 }];

    assertFalse(wouldOverlapNodes({ x: 500, y: 500 }, 100, 100, nodes));
});

test('wouldOverlap: detects direct overlap', () => {
    const nodes = [{ id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 }];

    assertTrue(wouldOverlapNodes({ x: 50, y: 50 }, 100, 100, nodes));
});

test('wouldOverlap: detects partial overlap', () => {
    const nodes = [{ id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 }];

    assertTrue(wouldOverlapNodes({ x: 90, y: 90 }, 100, 100, nodes));
});

test('wouldOverlap: respects padding', () => {
    const nodes = [{ id: '1', position: { x: 100, y: 100 }, width: 100, height: 100 }];

    // Just outside the box but within padding (20px)
    assertTrue(wouldOverlapNodes({ x: 210, y: 100 }, 100, 100, nodes, 20));
});

test('wouldOverlap: returns false for empty nodes array', () => {
    assertFalse(wouldOverlapNodes({ x: 0, y: 0 }, 100, 100, []));
});

// ============================================================
// getOverlap tests
// ============================================================

test('getOverlap: no overlap when far apart', () => {
    const nodeA = { id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 };
    const nodeB = { id: '2', position: { x: 500, y: 500 }, width: 100, height: 100 };

    const overlap = getOverlap(nodeA, nodeB);
    assertEqual(overlap.overlapX, 0);
    assertEqual(overlap.overlapY, 0);
});

test('getOverlap: calculates overlap correctly', () => {
    const nodeA = { id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 };
    const nodeB = { id: '2', position: { x: 50, y: 50 }, width: 100, height: 100 };

    const overlap = getOverlap(nodeA, nodeB);
    assertTrue(overlap.overlapX > 0);
    assertTrue(overlap.overlapY > 0);
});

// ============================================================
// resolveOverlaps tests (using actual implementations from layout.js)
// ============================================================

test('resolveOverlaps: separates two overlapping nodes', () => {
    const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 },
        { id: '2', position: { x: 50, y: 50 }, width: 100, height: 100 },
    ];

    resolveOverlaps(nodes);

    // After resolution, nodes should not overlap
    const overlap = getOverlap(nodes[0], nodes[1]);
    assertEqual(overlap.overlapX, 0);
    assertEqual(overlap.overlapY, 0);
});

test('resolveOverlaps: handles large nodes (640x480)', () => {
    const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 640, height: 480 },
        { id: '2', position: { x: 300, y: 200 }, width: 640, height: 480 },
    ];

    resolveOverlaps(nodes);

    const overlap = getOverlap(nodes[0], nodes[1]);
    assertEqual(overlap.overlapX, 0);
    assertEqual(overlap.overlapY, 0);
});

test('resolveOverlaps: handles vertically stacked nodes (same X)', () => {
    const nodes = [
        { id: '1', position: { x: 100, y: 0 }, width: 100, height: 100 },
        { id: '2', position: { x: 100, y: 50 }, width: 100, height: 100 },
    ];

    resolveOverlaps(nodes);

    const overlap = getOverlap(nodes[0], nodes[1]);
    assertEqual(overlap.overlapX, 0);
    assertEqual(overlap.overlapY, 0);
});

test('resolveOverlaps: handles completely overlapping nodes', () => {
    const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 },
        { id: '2', position: { x: 0, y: 0 }, width: 100, height: 100 },
    ];

    resolveOverlaps(nodes);

    const overlap = getOverlap(nodes[0], nodes[1]);
    assertEqual(overlap.overlapX, 0);
    assertEqual(overlap.overlapY, 0);
});

test('resolveOverlaps: separates multiple overlapping nodes', () => {
    const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 100 },
        { id: '2', position: { x: 50, y: 50 }, width: 100, height: 100 },
        { id: '3', position: { x: 100, y: 100 }, width: 100, height: 100 },
    ];

    resolveOverlaps(nodes);

    // Check all pairs don't overlap
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const overlap = getOverlap(nodes[i], nodes[j]);
            assertEqual(overlap.overlapX, 0);
            assertEqual(overlap.overlapY, 0);
        }
    }
});

test('resolveOverlaps: preserves non-overlapping nodes', () => {
    // Use positions that are already >= 100 to avoid normalization offset
    const nodes = [
        { id: '1', position: { x: 100, y: 100 }, width: 100, height: 100 },
        { id: '2', position: { x: 600, y: 100 }, width: 100, height: 100 },
        { id: '3', position: { x: 100, y: 600 }, width: 100, height: 100 },
    ];

    const originalPositions = nodes.map((n) => ({ x: n.position.x, y: n.position.y }));

    resolveOverlaps(nodes);

    // Positions should remain unchanged (no overlaps to resolve, already in positive coords)
    for (let i = 0; i < nodes.length; i++) {
        assertEqual(nodes[i].position.x, originalPositions[i].x);
        assertEqual(nodes[i].position.y, originalPositions[i].y);
    }
});

test('resolveOverlaps: handles mixed node sizes (tall and wide)', () => {
    const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 640, height: 200 },
        { id: '2', position: { x: 300, y: 50 }, width: 200, height: 480 },
    ];

    resolveOverlaps(nodes);

    const overlap = getOverlap(nodes[0], nodes[1]);
    assertEqual(overlap.overlapX, 0);
    assertEqual(overlap.overlapY, 0);
});

test('resolveOverlaps: handles nodes at same Y with different heights', () => {
    const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 200 },
        { id: '2', position: { x: 50, y: 0 }, width: 100, height: 100 },
    ];

    resolveOverlaps(nodes);

    const overlap = getOverlap(nodes[0], nodes[1]);
    assertEqual(overlap.overlapX, 0);
    assertEqual(overlap.overlapY, 0);
});

// ============================================================
// resolveHorizontalOverlaps tests
// ============================================================

test('resolveHorizontalOverlaps: no-op for single node', () => {
    const nodes = [{ id: '1', position: { x: 100, y: 100 }, width: 100, height: 100 }];

    resolveHorizontalOverlaps(nodes, 50);

    assertEqual(nodes[0].position.x, 100);
});

test('resolveHorizontalOverlaps: pushes apart two overlapping nodes', () => {
    const nodes = [
        { id: '1', position: { x: 100, y: 100 }, width: 100, height: 100 },
        { id: '2', position: { x: 120, y: 100 }, width: 100, height: 100 },
    ];

    resolveHorizontalOverlaps(nodes, 50);

    // Node 2 should be pushed right of node 1's right edge + gap
    // prevRight = 100 + 100 + 50 = 250
    assertEqual(nodes[1].position.x, 250);
});

test('resolveHorizontalOverlaps: chain reaction for multiple nodes', () => {
    const nodes = [
        { id: '1', position: { x: 100, y: 0 }, width: 100, height: 100 },
        { id: '2', position: { x: 110, y: 0 }, width: 100, height: 100 },
        { id: '3', position: { x: 120, y: 0 }, width: 100, height: 100 },
    ];

    resolveHorizontalOverlaps(nodes, 50);

    // Each pushed right of previous: 100, 250, 400
    assertEqual(nodes[0].position.x, 100);
    assertEqual(nodes[1].position.x, 250);
    assertEqual(nodes[2].position.x, 400);
});

test('resolveHorizontalOverlaps: leaves non-overlapping nodes unchanged', () => {
    const nodes = [
        { id: '1', position: { x: 100, y: 0 }, width: 100, height: 100 },
        { id: '2', position: { x: 400, y: 0 }, width: 100, height: 100 },
    ];

    resolveHorizontalOverlaps(nodes, 50);

    assertEqual(nodes[0].position.x, 100);
    assertEqual(nodes[1].position.x, 400);
});

test('resolveHorizontalOverlaps: handles unsorted input', () => {
    const nodes = [
        { id: '2', position: { x: 120, y: 0 }, width: 100, height: 100 },
        { id: '1', position: { x: 100, y: 0 }, width: 100, height: 100 },
    ];

    resolveHorizontalOverlaps(nodes, 50);

    // After sorting, node '1' at x=100, node '2' pushed to 250
    const node1 = nodes.find((n) => n.id === '1');
    const node2 = nodes.find((n) => n.id === '2');
    assertEqual(node1.position.x, 100);
    assertEqual(node2.position.x, 250);
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
