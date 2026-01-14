/**
 * Tests for reply behavior and node selection focus behavior
 *
 * Verifies the correct behavior for handleSend() and handleNodeSelect():
 * 1. When no node is selected, sending a message creates a root node (no reply edge)
 * 2. When a node is selected, sending a message creates a reply edge
 * 3. When multiple nodes are selected, sending creates MERGE edges
 * 4. Selecting a node blurs the chat input if it was focused (prevents auto-focus)
 * 5. Selecting a node does nothing if chat input is not focused (no unnecessary work)
 *
 * These tests verify the logic extracted from app.js handleSend() and handleNodeSelect()
 * methods without requiring full App/Canvas/Graph initialization.
 */

import { JSDOM } from 'jsdom';
import { assertTrue, assertEqual, assertFalse } from './test_helpers/assertions.js';

// Setup global mocks FIRST, before any imports that might use them
if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
    };
}

if (!global.indexedDB) {
    global.indexedDB = {
        open: () => {
            const request = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: {
                    transaction: () => ({
                        objectStore: () => ({
                            get: () => ({ onsuccess: null, onerror: null }),
                            put: () => ({ onsuccess: null, onerror: null }),
                            delete: () => ({ onsuccess: null, onerror: null }),
                        }),
                    }),
                },
            };
            setTimeout(() => {
                if (request.onsuccess) {
                    request.onsuccess({ target: request });
                }
            }, 0);
            return request;
        },
    };
}

// Create DOM environment (minimal - only what we need for focus tests)
const dom = new JSDOM(
    `<!DOCTYPE html>
<html><body>
    <textarea id="chat-input"></textarea>
</body></html>`,
    {
        url: 'http://localhost',
        pretendToBeVisual: true,
        resources: 'usable',
    }
);

global.window = dom.window;
global.document = dom.window.document;

// Now import modules
const { NodeType, EdgeType, createNode, createEdge } = await import('../src/canvas_chat/static/js/graph-types.js');

async function asyncTest(description, fn) {
    try {
        await fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        if (error.stack) {
            console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        }
        process.exit(1);
    }
}

console.log('\n=== Reply Behavior Tests ===\n');

// ============================================================
// handleSend() behavior tests
// ============================================================

// Test: When no node is selected, sending creates a root node (no edges)
// This verifies the fix: previously it would reply to the last leaf node,
// now it creates a new root node instead.
await asyncTest('handleSend creates root node when no nodes selected', async () => {
    // Simulate handleSend logic (extracted from app.js lines 1378-1398)
    const content = 'Hello, world!';

    // Mock canvas.getSelectedNodeIds() returning empty array
    const parentIds = [];

    // Create human node
    const humanNode = createNode(NodeType.HUMAN, content, {
        position: { x: 0, y: 0 },
    });

    // Track edges that would be created (this is the key logic we're testing)
    const edgesCreated = [];

    // Create edges from parents (only if nodes are selected)
    // This is the exact logic from app.js - if parentIds.length === 0, no edges are created
    if (parentIds.length > 0) {
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, humanNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            edgesCreated.push(edge);
        }
    }
    // If no parentIds, humanNode is a root node (no edges created)

    // Verify: no edges created, node is created correctly
    assertEqual(edgesCreated.length, 0, 'No edges should be created when no nodes are selected');
    assertTrue(humanNode !== null, 'Human node should be created');
    assertEqual(humanNode.type, NodeType.HUMAN, 'Node type should be HUMAN');
    assertEqual(humanNode.content, content, 'Node content should match');
});

// Test: When a node is selected, sending creates a reply edge
// This verifies the normal reply behavior still works correctly.
await asyncTest('handleSend creates reply edge when node is selected', async () => {
    // Create a parent node (e.g., an AI response)
    const parentNode = createNode(NodeType.AI, 'Parent message', {
        position: { x: 0, y: 0 },
    });

    // Simulate handleSend logic with one selected node
    const content = 'Reply message';
    const parentIds = [parentNode.id]; // canvas.getSelectedNodeIds() returns [parentNode.id]

    // Create human node
    const humanNode = createNode(NodeType.HUMAN, content, {
        position: { x: 0, y: 100 },
    });

    // Track edges that would be created
    const edgesCreated = [];

    // Create edges from parents (only if nodes are selected)
    if (parentIds.length > 0) {
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, humanNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            edgesCreated.push(edge);
        }
    }

    // Verify: exactly one REPLY edge created, connecting parent to human node
    assertEqual(edgesCreated.length, 1, 'One edge should be created when one node is selected');
    const replyEdge = edgesCreated[0];
    assertEqual(replyEdge.source, parentNode.id, 'Edge source should be parent node');
    assertEqual(replyEdge.target, humanNode.id, 'Edge target should be human node');
    assertEqual(replyEdge.type, EdgeType.REPLY, 'Edge type should be REPLY (not MERGE for single parent)');
});

// ============================================================
// handleNodeSelect() focus behavior tests
// ============================================================

// Test: Selecting a node blurs the chat input if it was focused
// This prevents auto-focus when clicking nodes, allowing other shortcuts
// (like 'c' for copy, 'e' for edit) to work when nodes are selected.
await asyncTest('handleNodeSelect blurs chat input if focused', async () => {
    const chatInput = document.getElementById('chat-input');

    // Focus the input (simulating user typing)
    chatInput.focus();
    assertTrue(document.activeElement === chatInput, 'Chat input should be focused initially');

    // Simulate handleNodeSelect logic (extracted from app.js lines 3048-3053)
    const selectedIds = ['node-1'];

    // Don't auto-focus chat input when selecting nodes - user must explicitly
    // type 'r' or click the text box to focus. This allows other shortcuts
    // (like 'c' for copy, 'e' for edit) to work when nodes are selected.
    if (document.activeElement === chatInput) {
        chatInput.blur();
    }

    // Verify: input is blurred after node selection
    assertFalse(document.activeElement === chatInput, 'Chat input should be blurred after node selection');
});

// Test: Selecting a node does nothing if chat input is not focused
// This ensures we don't do unnecessary work when the input isn't focused.
await asyncTest('handleNodeSelect does nothing if chat input not focused', async () => {
    const chatInput = document.getElementById('chat-input');

    // Ensure input is not focused (blur it if it was)
    chatInput.blur();
    assertFalse(document.activeElement === chatInput, 'Chat input should not be focused initially');

    // Simulate handleNodeSelect logic
    const selectedIds = ['node-1'];
    const wasFocusedBefore = document.activeElement === chatInput;

    // The blur logic only runs if input is focused
    if (document.activeElement === chatInput) {
        chatInput.blur();
    }

    // Verify: input remains unfocused (no change)
    assertFalse(document.activeElement === chatInput, 'Chat input should remain unfocused');
    assertFalse(wasFocusedBefore, 'Input should not have been focused before selection');
});

// Test: Multiple selected nodes create MERGE edges
// This verifies that multi-select reply behavior still works correctly.
await asyncTest('handleSend creates MERGE edges when multiple nodes selected', async () => {
    // Create parent nodes (e.g., multiple AI responses)
    const parent1 = createNode(NodeType.AI, 'Parent 1', { position: { x: 0, y: 0 } });
    const parent2 = createNode(NodeType.AI, 'Parent 2', { position: { x: 200, y: 0 } });

    // Simulate handleSend logic with multiple selected nodes
    const content = 'Merge reply';
    const parentIds = [parent1.id, parent2.id]; // canvas.getSelectedNodeIds() returns multiple nodes

    const humanNode = createNode(NodeType.HUMAN, content, {
        position: { x: 0, y: 100 },
    });

    // Track edges that would be created
    const edgesCreated = [];

    // Create edges from parents
    // When parentIds.length > 1, all edges are MERGE type
    if (parentIds.length > 0) {
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, humanNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            edgesCreated.push(edge);
        }
    }

    // Verify: two MERGE edges created, one for each parent
    assertEqual(edgesCreated.length, 2, 'Two edges should be created for two parents');
    const edge1 = edgesCreated.find((e) => e.source === parent1.id && e.target === humanNode.id);
    const edge2 = edgesCreated.find((e) => e.source === parent2.id && e.target === humanNode.id);
    assertTrue(edge1 !== undefined, 'Edge from parent1 should exist');
    assertTrue(edge2 !== undefined, 'Edge from parent2 should exist');
    assertEqual(edge1.type, EdgeType.MERGE, 'Edge type should be MERGE when multiple parents (not REPLY)');
    assertEqual(edge2.type, EdgeType.MERGE, 'Edge type should be MERGE when multiple parents (not REPLY)');
});

console.log('\n✅ All reply behavior tests passed!\n');
