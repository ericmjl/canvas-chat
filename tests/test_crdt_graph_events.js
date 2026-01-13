/**
 * Tests for CRDTGraph event emission
 * Verifies that nodeAdded, edgeAdded, nodeRemoved, and edgeRemoved events fire correctly
 */

import { test, assertTrue, assertEqual, TestGraph, createTestNode, createTestEdge } from './test_setup.js';

// ============================================================
// Event emission tests
// ============================================================

test('Graph Events: nodeAdded event fires when node is added', () => {
    const graph = new TestGraph();
    let eventFired = false;
    let capturedNode = null;

    graph.on('nodeAdded', (node) => {
        eventFired = true;
        capturedNode = node;
    });

    const node = createTestNode('test-node');
    graph.addNode(node);

    assertTrue(eventFired, 'nodeAdded event should fire');
    assertEqual(capturedNode.id, node.id);
});

test('Graph Events: edgeAdded event fires when edge is added', () => {
    const graph = new TestGraph();
    let eventFired = false;
    let capturedEdge = null;

    // Add nodes first
    const node1 = createTestNode('node1');
    const node2 = createTestNode('node2');
    graph.addNode(node1);
    graph.addNode(node2);

    graph.on('edgeAdded', (edge) => {
        eventFired = true;
        capturedEdge = edge;
    });

    const edge = createTestEdge('node1', 'node2');
    graph.addEdge(edge);

    assertTrue(eventFired, 'edgeAdded event should fire');
    assertEqual(capturedEdge.source, 'node1');
    assertEqual(capturedEdge.target, 'node2');
});

test('Graph Events: supports multiple listeners for same event', () => {
    const graph = new TestGraph();
    let listener1Fired = false;
    let listener2Fired = false;

    graph.on('nodeAdded', () => {
        listener1Fired = true;
    });
    graph.on('nodeAdded', () => {
        listener2Fired = true;
    });

    const node = createTestNode('test-node');
    graph.addNode(node);

    assertTrue(listener1Fired, 'First listener should fire');
    assertTrue(listener2Fired, 'Second listener should fire');
});

test('Graph Events: supports removing listeners', () => {
    const graph = new TestGraph();
    let fired = false;
    const listener = () => {
        fired = true;
    };

    graph.on('nodeAdded', listener);
    graph.off('nodeAdded', listener);

    const node = createTestNode('test-node');
    graph.addNode(node);

    assertTrue(!fired, 'Event should not fire after listener removed');
});

test('Graph Events: nodeRemoved event fires when node is removed', () => {
    const graph = new TestGraph();
    let eventFired = false;
    let capturedNodeId = null;

    const node = createTestNode('test-node');
    graph.addNode(node);

    graph.on('nodeRemoved', (nodeId) => {
        eventFired = true;
        capturedNodeId = nodeId;
    });

    graph.removeNode(node.id);

    assertTrue(eventFired, 'nodeRemoved event should fire');
    assertEqual(capturedNodeId, node.id);
});

test('Graph Events: edgeRemoved event fires when edge is removed', () => {
    const graph = new TestGraph();
    let eventFired = false;
    let capturedEdgeId = null;

    // Add nodes and edge
    const node1 = createTestNode('node1');
    const node2 = createTestNode('node2');
    graph.addNode(node1);
    graph.addNode(node2);

    const edge = createTestEdge('node1', 'node2');
    graph.addEdge(edge);

    graph.on('edgeRemoved', (edgeId) => {
        eventFired = true;
        capturedEdgeId = edgeId;
    });

    graph.removeEdge(edge.id);

    assertTrue(eventFired, 'edgeRemoved event should fire');
    assertEqual(capturedEdgeId, edge.id);
});
