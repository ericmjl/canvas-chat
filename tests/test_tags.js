/**
 * Tests for tag system functionality
 * Covers tag creation, editing, removal, and toggling on nodes
 */

import { test, TestGraph, createNode, NodeType, TAG_COLORS } from './test_setup.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// Test helper to create a test graph
function createTestGraph() {
    return new TestGraph();
}

console.log('\n=== Tag Creation Tests ===\n');

test('Can create a tag', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'Important');

    const tag = graph.getTag(color);
    assert(tag !== null, 'Tag should exist');
    assert(tag.name === 'Important', 'Tag name should match');
    assert(tag.color === color, 'Tag color should match');
});

test('Creating tag with same color updates existing tag', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'First Name');
    graph.createTag(color, 'Updated Name');

    const tag = graph.getTag(color);
    assert(tag.name === 'Updated Name', 'Tag should be updated');

    const allTags = graph.getAllTags();
    const tagCount = Object.keys(allTags).filter((c) => allTags[c]).length;
    assert(tagCount === 1, 'Should only have one tag');
});

test('Can delete a tag', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'Temporary');
    assert(graph.getTag(color) !== null, 'Tag should exist before deletion');

    graph.deleteTag(color);
    assert(graph.getTag(color) === null, 'Tag should be deleted');
});

test('Deleting tag removes it from nodes', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    // Create tag and node
    graph.createTag(color, 'Test Tag');
    const node = createNode(NodeType.NOTE, 'Test content');
    graph.addNode(node);

    // Add tag to node
    graph.addTagToNode(node.id, color);
    assert(graph.nodeHasTag(node.id, color), 'Node should have tag');

    // Delete tag
    graph.deleteTag(color);

    // Tag should be removed from node
    assert(!graph.nodeHasTag(node.id, color), 'Tag should be removed from node');
    const updatedNode = graph.getNode(node.id);
    assert(!updatedNode.tags || !updatedNode.tags.includes(color), 'Node tags array should not contain deleted tag');
});

console.log('\n=== Tag Assignment Tests ===\n');

test('Can add tag to node', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'Important');
    const node = createNode(NodeType.NOTE, 'Test content');
    graph.addNode(node);

    graph.addTagToNode(node.id, color);

    assert(graph.nodeHasTag(node.id, color), 'Node should have tag');
    const updatedNode = graph.getNode(node.id);
    assert(updatedNode.tags.includes(color), 'Node tags array should contain color');
});

test('Adding same tag twice is idempotent', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'Important');
    const node = createNode(NodeType.NOTE, 'Test content');
    graph.addNode(node);

    graph.addTagToNode(node.id, color);
    graph.addTagToNode(node.id, color);

    const updatedNode = graph.getNode(node.id);
    const tagCount = updatedNode.tags.filter((c) => c === color).length;
    assert(tagCount === 1, 'Tag should only appear once');
});

test('Can add multiple tags to same node', () => {
    const graph = createTestGraph();
    const color1 = TAG_COLORS[0];
    const color2 = TAG_COLORS[1];

    graph.createTag(color1, 'Tag 1');
    graph.createTag(color2, 'Tag 2');
    const node = createNode(NodeType.NOTE, 'Test content');
    graph.addNode(node);

    graph.addTagToNode(node.id, color1);
    graph.addTagToNode(node.id, color2);

    assert(graph.nodeHasTag(node.id, color1), 'Node should have tag 1');
    assert(graph.nodeHasTag(node.id, color2), 'Node should have tag 2');
});

test('Can remove tag from node', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'Important');
    const node = createNode(NodeType.NOTE, 'Test content');
    graph.addNode(node);

    graph.addTagToNode(node.id, color);
    assert(graph.nodeHasTag(node.id, color), 'Node should have tag initially');

    graph.removeTagFromNode(node.id, color);
    assert(!graph.nodeHasTag(node.id, color), 'Node should not have tag after removal');
});

test('Removing non-existent tag from node is safe', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];
    const node = createNode(NodeType.NOTE, 'Test content');
    graph.addNode(node);

    // Should not throw
    graph.removeTagFromNode(node.id, color);
    assert(!graph.nodeHasTag(node.id, color), 'Node should not have tag');
});

test('Removing tag from non-existent node is safe', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    // Should not throw
    graph.removeTagFromNode('non-existent-id', color);
});

console.log('\n=== Tag Query Tests ===\n');

test('getAllTags returns all created tags', () => {
    const graph = createTestGraph();
    const color1 = TAG_COLORS[0];
    const color2 = TAG_COLORS[1];

    graph.createTag(color1, 'Tag 1');
    graph.createTag(color2, 'Tag 2');

    const allTags = graph.getAllTags();
    assert(allTags[color1]?.name === 'Tag 1', 'Should have tag 1');
    assert(allTags[color2]?.name === 'Tag 2', 'Should have tag 2');
});

test('getNodesWithTag finds all nodes with specific tag', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'Important');

    const node1 = createNode(NodeType.NOTE, 'Content 1');
    const node2 = createNode(NodeType.NOTE, 'Content 2');
    const node3 = createNode(NodeType.NOTE, 'Content 3');

    graph.addNode(node1);
    graph.addNode(node2);
    graph.addNode(node3);

    // Tag only node1 and node3
    graph.addTagToNode(node1.id, color);
    graph.addTagToNode(node3.id, color);

    const nodesWithTag = graph.getNodesWithTag(color);
    assert(nodesWithTag.length === 2, 'Should find 2 nodes with tag');
    assert(
        nodesWithTag.some((n) => n.id === node1.id),
        'Should include node1'
    );
    assert(
        nodesWithTag.some((n) => n.id === node3.id),
        'Should include node3'
    );
    assert(!nodesWithTag.some((n) => n.id === node2.id), 'Should not include node2');
});

test('nodeHasTag returns correct boolean', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    graph.createTag(color, 'Important');
    const node = createNode(NodeType.NOTE, 'Test content');
    graph.addNode(node);

    assert(!graph.nodeHasTag(node.id, color), 'Node should not have tag initially');

    graph.addTagToNode(node.id, color);
    assert(graph.nodeHasTag(node.id, color), 'Node should have tag after adding');

    graph.removeTagFromNode(node.id, color);
    assert(!graph.nodeHasTag(node.id, color), 'Node should not have tag after removing');
});

console.log('\n=== Tag Edge Cases ===\n');

test('Node without tags property handles tag operations gracefully', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];
    const node = createNode(NodeType.NOTE, 'Test content');

    // Ensure tags property doesn't exist
    delete node.tags;
    graph.addNode(node);

    // Should not throw
    assert(!graph.nodeHasTag(node.id, color), 'Node without tags should return false');

    graph.addTagToNode(node.id, color);
    assert(graph.nodeHasTag(node.id, color), 'Tag should be added successfully');
});

test('Can retrieve tag colors', () => {
    assert(Array.isArray(TAG_COLORS), 'TAG_COLORS should be an array');
    assert(TAG_COLORS.length > 0, 'Should have at least one tag color');
    assert(TAG_COLORS[0].startsWith('#'), 'Tag colors should be in hex format');
});

test('Empty tag name is allowed', () => {
    const graph = createTestGraph();
    const color = TAG_COLORS[0];

    // Empty name should be allowed (user can create placeholder tags)
    graph.createTag(color, '');

    const tag = graph.getTag(color);
    assert(tag !== null, 'Tag with empty name should exist');
    assert(tag.name === '', 'Tag name should be empty string');
});

console.log('\n=== All tag tests passed! ===\n');
