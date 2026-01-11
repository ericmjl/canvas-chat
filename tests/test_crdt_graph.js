/**
 * Tests for crdt-graph.js
 * Tests graph traversal, visibility, and context resolution.
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
} from './test_setup.js';

// ============================================================
// Basic graph operations tests
// ============================================================

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
    const ids = ancestors.map((n) => n.id);
    assertTrue(ids.includes('A'), 'Should include A');
    assertTrue(ids.includes('B'), 'Should include B');
    assertTrue(ids.includes('C'), 'Should include C');
    // B and C should appear (each once)
    assertEqual(ids.filter((id) => id === 'B').length, 1, 'B should appear once');
    assertEqual(ids.filter((id) => id === 'C').length, 1, 'C should appear once');
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
    const ids = sorted.map((n) => n.id);

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
    const ids = sorted.map((n) => n.id);

    // A and B should come before C
    assertTrue(ids.indexOf('A') < ids.indexOf('C'), 'A should come before C');
    assertTrue(ids.indexOf('B') < ids.indexOf('C'), 'B should come before C');
});

// ============================================================
// Graph.isEmpty() tests
// ============================================================

test('Graph.isEmpty: returns true for new empty graph', () => {
    const graph = new TestGraph();
    assertTrue(graph.isEmpty(), 'New graph should be empty');
});

test('Graph.isEmpty: returns false after adding a node', () => {
    const graph = new TestGraph();
    graph.addNode(createTestNode('node-1'));
    assertFalse(graph.isEmpty(), 'Graph with node should not be empty');
});

// ============================================================
// Graph.resolveContext tests
// ============================================================

test('Graph.resolveContext: maps user types to user role', () => {
    const graph = new TestGraph();
    const node1 = { id: '1', type: NodeType.HUMAN, content: 'Hello', created_at: 1 };
    graph.addNode(node1);

    const context = graph.resolveContext(['1']);
    assertEqual(context.length, 1);
    assertEqual(context[0].role, 'user');
});

test('Graph.resolveContext: maps AI types to assistant role', () => {
    const graph = new TestGraph();
    const node1 = { id: '1', type: NodeType.AI, content: 'Response', created_at: 1 };
    graph.addNode(node1);

    const context = graph.resolveContext(['1']);
    assertEqual(context.length, 1);
    assertEqual(context[0].role, 'assistant');
});

test('Graph.resolveContext: includes ancestors', () => {
    const graph = new TestGraph();
    const node1 = { id: '1', type: NodeType.HUMAN, content: 'Hello', created_at: 1 };
    const node2 = { id: '2', type: NodeType.AI, content: 'Hi', created_at: 2 };
    graph.addNode(node1);
    graph.addNode(node2);
    graph.addEdge(createTestEdge('1', '2'));

    const context = graph.resolveContext(['2']);
    assertEqual(context.length, 2);
    assertEqual(context[0].role, 'user');
    assertEqual(context[1].role, 'assistant');
});

test('Graph.resolveContext: sorts by created_at', () => {
    const graph = new TestGraph();
    const node1 = { id: '1', type: NodeType.HUMAN, content: 'First', created_at: 1 };
    const node2 = { id: '2', type: NodeType.AI, content: 'Second', created_at: 2 };
    graph.addNode(node1);
    graph.addNode(node2);
    graph.addEdge(createTestEdge('1', '2'));

    const context = graph.resolveContext(['2']);
    assertEqual(context[0].content, 'First');
    assertEqual(context[1].content, 'Second');
});

test('Graph.resolveContext: includes PDF nodes as user role', () => {
    const graph = new TestGraph();
    const pdfNode = { id: '1', type: NodeType.PDF, content: 'PDF content...', created_at: 1 };
    const codeNode = { id: '2', type: NodeType.CODE, content: '# code', created_at: 2 };
    graph.addNode(pdfNode);
    graph.addNode(codeNode);
    graph.addEdge(createTestEdge('1', '2'));

    const context = graph.resolveContext(['2']);
    assertEqual(context.length, 2);
    assertEqual(context[0].role, 'user', 'PDF node should be mapped to user role');
    assertEqual(context[0].content, 'PDF content...');
    assertEqual(context[1].role, 'assistant', 'CODE node should be mapped to assistant role');
});

// ============================================================
// Graph.getDescendants() tests
// ============================================================

test('Graph.getDescendants returns all descendants in chain', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    const descendants = graph.getDescendants('A');
    assertEqual(descendants.length, 2);
    assertTrue(
        descendants.some((n) => n.id === 'B'),
        'Should include B'
    );
    assertTrue(
        descendants.some((n) => n.id === 'C'),
        'Should include C'
    );
});

test('Graph.getDescendants returns multiple children', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('A', 'D'));

    const descendants = graph.getDescendants('A');
    assertEqual(descendants.length, 3);
});

test('Graph.getDescendants returns empty for leaf node', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    graph.addNode(nodeA);

    const descendants = graph.getDescendants('A');
    assertEqual(descendants.length, 0);
});

test('Graph.getDescendants handles diamond/merge structure', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond)
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'D'));

    const descendants = graph.getDescendants('A');
    // Should include B, C, D (D only once despite two paths)
    assertEqual(descendants.length, 3);
    assertTrue(
        descendants.some((n) => n.id === 'D'),
        'Should include D'
    );
});

// ============================================================
// Graph.isNodeVisible() tests
// ============================================================

test('Graph.isNodeVisible returns true for root nodes', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    graph.addNode(nodeA);

    assertTrue(graph.isNodeVisible(nodeA.id), 'Root node should be visible');
});

test('Graph.isNodeVisible returns true when no ancestors collapsed', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createTestEdge('A', 'B'));

    assertTrue(graph.isNodeVisible(nodeB.id), 'Child should be visible when parent not collapsed');
});

test('Graph.isNodeVisible returns false when ancestor is collapsed', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createTestEdge('A', 'B'));

    nodeA.collapsed = true;
    assertFalse(graph.isNodeVisible(nodeB.id), 'Child should be hidden when parent collapsed');
});

test('Graph.isNodeVisible returns false for deep descendant when ancestor collapsed', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    nodeA.collapsed = true;
    assertFalse(graph.isNodeVisible(nodeC.id), 'Grandchild should be hidden when grandparent collapsed');
});

test('Graph.isNodeVisible returns true for merge node if any parent path visible', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond with D as merge node)
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'D'));

    // Collapse B only - D should still be visible via C
    nodeB.collapsed = true;
    assertTrue(graph.isNodeVisible(nodeD.id), 'Merge node should be visible if any parent path is open');
});

test('Graph.isNodeVisible returns false for merge node if all parent paths collapsed', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond with D as merge node)
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'D'));

    // Collapse both B and C - D should be hidden
    nodeB.collapsed = true;
    nodeC.collapsed = true;
    assertFalse(graph.isNodeVisible(nodeD.id), 'Merge node should be hidden if all parent paths collapsed');
});

// ============================================================
// Graph.countHiddenDescendants() tests
// ============================================================

test('Graph.countHiddenDescendants returns correct count for simple chain', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    nodeA.collapsed = true;
    assertEqual(graph.countHiddenDescendants(nodeA.id), 2);
});

test('Graph.countHiddenDescendants returns 0 when not collapsed', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createTestEdge('A', 'B'));

    // Not collapsed - all descendants are visible
    assertEqual(graph.countHiddenDescendants(nodeA.id), 0);
});

test('Graph.countHiddenDescendants counts only hidden nodes in merge', () => {
    // A -> B, A -> C, B -> D, C -> D, D -> E
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    const nodeE = createTestNode('E');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addNode(nodeE);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'D'));
    graph.addEdge(createTestEdge('D', 'E'));

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
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createTestEdge('A', 'B'));

    // Not collapsed - B is visible, so it's returned as the first visible descendant
    const result = graph.getVisibleDescendantsThroughHidden(nodeA.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeB.id);
});

test('Graph.getVisibleDescendantsThroughHidden finds merge node through hidden path', () => {
    // A -> B, A -> C, B -> D, C -> D (diamond with D as merge node)
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'D'));

    // Collapse B - D is still visible via C
    nodeB.collapsed = true;
    const result = graph.getVisibleDescendantsThroughHidden(nodeB.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeD.id);
});

test('Graph.getVisibleDescendantsThroughHidden returns empty when all descendants hidden', () => {
    // A -> B -> C (simple chain, all hidden when A collapsed)
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

    // Collapse A - B and C are all hidden, no visible descendants through hidden
    nodeA.collapsed = true;
    const result = graph.getVisibleDescendantsThroughHidden(nodeA.id);
    assertEqual(result.length, 0);
});

test('Graph.getVisibleDescendantsThroughHidden stops at first visible node', () => {
    // A -> B -> C, A -> D -> C, C -> E
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    const nodeE = createTestNode('E');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addNode(nodeE);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'D'));
    graph.addEdge(createTestEdge('B', 'C'));
    graph.addEdge(createTestEdge('D', 'C'));
    graph.addEdge(createTestEdge('C', 'E'));

    // Collapse B - C is visible via D, E is also visible
    // But we should only return C (first visible), not continue to E
    nodeB.collapsed = true;
    const result = graph.getVisibleDescendantsThroughHidden(nodeB.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeC.id);
});

test('Graph.getVisibleDescendantsThroughHidden returns empty for leaf node', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    graph.addNode(nodeA);

    const result = graph.getVisibleDescendantsThroughHidden(nodeA.id);
    assertEqual(result.length, 0);
});

// ============================================================
// Graph.getVisibleAncestorsThroughHidden() tests
// ============================================================

test('Graph.getVisibleAncestorsThroughHidden returns visible parents directly', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(createTestEdge('A', 'B'));

    // A is visible (root) - function returns all visible parents
    const result = graph.getVisibleAncestorsThroughHidden(nodeB.id);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, nodeA.id);
});

test('Graph.getVisibleAncestorsThroughHidden finds collapsed parent', () => {
    // A -> B -> C (simple chain)
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));

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
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('A', 'C'));
    graph.addEdge(createTestEdge('B', 'D'));
    graph.addEdge(createTestEdge('C', 'D'));

    // Collapse B - D is visible via C
    // D's parents B and C are both visible (B is collapsed but still visible)
    nodeB.collapsed = true;

    const result = graph.getVisibleAncestorsThroughHidden(nodeD.id);
    // Both parents B and C are visible
    assertEqual(result.length, 2);
    const ids = result.map((n) => n.id);
    assertTrue(ids.includes(nodeB.id), 'Should include B');
    assertTrue(ids.includes(nodeC.id), 'Should include C');
});

test('Graph.getVisibleAncestorsThroughHidden traverses through hidden nodes', () => {
    // A -> B -> C -> D, A -> E -> D (D is merge node)
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    const nodeB = createTestNode('B');
    const nodeC = createTestNode('C');
    const nodeD = createTestNode('D');
    const nodeE = createTestNode('E');
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addNode(nodeD);
    graph.addNode(nodeE);
    graph.addEdge(createTestEdge('A', 'B'));
    graph.addEdge(createTestEdge('B', 'C'));
    graph.addEdge(createTestEdge('C', 'D'));
    graph.addEdge(createTestEdge('A', 'E'));
    graph.addEdge(createTestEdge('E', 'D'));

    // Collapse B - C is hidden, D is visible via E
    // D's parent C is hidden, should traverse upward to find B (collapsed, visible)
    // D's parent E is visible
    nodeB.collapsed = true;

    const result = graph.getVisibleAncestorsThroughHidden(nodeD.id);
    // C is hidden, its parent B is visible (collapsed)
    // E is visible
    assertEqual(result.length, 2);
    const ids = result.map((n) => n.id);
    assertTrue(ids.includes(nodeB.id), 'Should include B (through hidden C)');
    assertTrue(ids.includes(nodeE.id), 'Should include E (direct visible parent)');
});

test('Graph.getVisibleAncestorsThroughHidden returns empty for root node', () => {
    const graph = new TestGraph();
    const nodeA = createTestNode('A');
    graph.addNode(nodeA);

    const result = graph.getVisibleAncestorsThroughHidden(nodeA.id);
    assertEqual(result.length, 0);
});
