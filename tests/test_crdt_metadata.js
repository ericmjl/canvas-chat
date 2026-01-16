/**
 * Tests for CRDT graph metadata storage.
 *
 * Guards against regression where metadata wasn't stored as Y.Map,
 * causing nested properties (like content_type) to be lost.
 */

import { test, assertTrue, assertEqual, assertNotNull, TestGraph } from './test_setup.js';

// ============================================================================
// Tests for metadata storage in CRDT graph
// ============================================================================

test('CRDTGraph stores metadata as Y.Map not plain object', () => {
    const graph = new TestGraph();

    // Add a node with metadata
    const node = {
        id: 'test-node-1',
        type: 'fetch_result',
        content: 'Test content',
        position: { x: 0, y: 0 },
        metadata: {
            content_type: 'youtube',
            video_id: 'abc123',
            language: 'en',
        },
    };

    graph.addNode(node);

    // Get the node back
    const retrieved = graph.getNode('test-node-1');

    // CRITICAL: metadata must be an object with all nested properties preserved
    assertNotNull(retrieved.metadata, 'metadata should not be null');
    assertEqual(retrieved.metadata.content_type, 'youtube', 'content_type should be preserved');
    assertEqual(retrieved.metadata.video_id, 'abc123', 'video_id should be preserved');
    assertEqual(retrieved.metadata.language, 'en', 'language should be preserved');
});

test('CRDTGraph updateNode preserves metadata', () => {
    const graph = new TestGraph();

    // Add a node without metadata first
    const node = {
        id: 'test-node-2',
        type: 'fetch_result',
        content: 'Loading...',
        position: { x: 0, y: 0 },
    };

    graph.addNode(node);

    // Update with metadata (this is what happens when fetching completes)
    graph.updateNode('test-node-2', {
        content: 'Fetched content',
        metadata: {
            content_type: 'youtube',
            video_id: 'xyz789',
        },
    });

    // Get the node back
    const retrieved = graph.getNode('test-node-2');

    // CRITICAL: metadata must be preserved after update
    assertNotNull(retrieved.metadata, 'metadata should exist after update');
    assertEqual(retrieved.metadata.content_type, 'youtube', 'content_type should be set');
    assertEqual(retrieved.metadata.video_id, 'xyz789', 'video_id should be set');
});

test('CRDTGraph metadata survives multiple updates', () => {
    const graph = new TestGraph();

    const node = {
        id: 'test-node-3',
        type: 'fetch_result',
        content: 'Content',
        position: { x: 0, y: 0 },
        metadata: {
            content_type: 'youtube',
            video_id: 'first',
        },
    };

    graph.addNode(node);

    // Update metadata multiple times
    graph.updateNode('test-node-3', {
        metadata: {
            content_type: 'youtube',
            video_id: 'second',
            new_field: 'added',
        },
    });

    const retrieved = graph.getNode('test-node-3');

    assertEqual(retrieved.metadata.video_id, 'second', 'video_id should be updated');
    assertEqual(retrieved.metadata.new_field, 'added', 'new field should be added');
    assertEqual(retrieved.metadata.content_type, 'youtube', 'content_type should persist');
});

test('CRDTGraph handles empty metadata gracefully', () => {
    const graph = new TestGraph();

    const node = {
        id: 'test-node-4',
        type: 'fetch_result',
        content: 'Content',
        position: { x: 0, y: 0 },
        metadata: {},
    };

    graph.addNode(node);

    const retrieved = graph.getNode('test-node-4');

    // Empty metadata should be an empty object, not undefined
    assertTrue(
        retrieved.metadata !== undefined,
        'metadata should not be undefined even when empty'
    );
});

test('CRDTGraph getAllNodes preserves metadata', () => {
    const graph = new TestGraph();

    // Add multiple nodes with metadata
    graph.addNode({
        id: 'node-a',
        type: 'fetch_result',
        content: 'A',
        position: { x: 0, y: 0 },
        metadata: { content_type: 'youtube', video_id: 'a' },
    });

    graph.addNode({
        id: 'node-b',
        type: 'fetch_result',
        content: 'B',
        position: { x: 100, y: 0 },
        metadata: { content_type: 'git', files: { 'README.md': {} } },
    });

    const allNodes = graph.getAllNodes();
    const nodeA = allNodes.find((n) => n.id === 'node-a');
    const nodeB = allNodes.find((n) => n.id === 'node-b');

    assertEqual(nodeA.metadata.content_type, 'youtube', 'Node A content_type preserved');
    assertEqual(nodeB.metadata.content_type, 'git', 'Node B content_type preserved');
});

// Tests are automatically collected by the test runner
