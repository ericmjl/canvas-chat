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
