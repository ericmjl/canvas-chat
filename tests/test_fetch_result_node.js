/**
 * Tests for Fetch Result node plugin
 * Verifies that the fetch result node plugin works correctly when loaded
 */

// Setup global mocks FIRST, before any imports that might use them
// Must set window before any module imports that reference it
global.window = global;
global.window.addEventListener = () => {}; // Mock window.addEventListener
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
};
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

// Now import modules
import { assertTrue, assertEqual } from './test_helpers/assertions.js';
import { createNode, NodeType } from '../src/canvas_chat/static/js/graph-types.js';
import { wrapNode, Actions } from '../src/canvas_chat/static/js/node-protocols.js';

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

function assertIncludes(array, item) {
    if (!array.includes(item)) {
        throw new Error(`Expected array to include ${JSON.stringify(item)}, got ${JSON.stringify(array)}`);
    }
}

console.log('\n=== Fetch Result Node Plugin Tests ===\n');

// Test: Fetch result node plugin is registered
await asyncTest('Fetch result node plugin is registered', async () => {
    // Import fetch-result-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');

    // Check if NodeRegistry has the fetch_result type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('fetch_result'), 'Fetch result node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('fetch_result');
    assertTrue(protocol !== undefined, 'Fetch result protocol class should exist');
});

// Test: FetchResultNode protocol methods
await asyncTest('FetchResultNode implements protocol methods', async () => {
    // Import fetch-result-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.FETCH_RESULT, 'Fetched content...', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Fetched Content', 'Type label should be "Fetched Content"');
    assertEqual(wrapped.getTypeIcon(), '📄', 'Type icon should be 📄');
});

// Test: FetchResultNode getActions
await asyncTest('FetchResultNode getActions returns correct actions in expected order', async () => {
    // Import fetch-result-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');

    const node = createNode(NodeType.FETCH_RESULT, 'Fetched content...', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 5, 'Should have exactly 5 actions');

    // Check for expected actions in expected order
    assertEqual(actions[0], Actions.REPLY, 'First action should be REPLY');
    assertEqual(actions[1], Actions.EDIT_CONTENT, 'Second action should be EDIT_CONTENT');
    assertEqual(actions[2], Actions.RESUMMARIZE, 'Third action should be RESUMMARIZE');
    assertEqual(actions[3], Actions.CREATE_FLASHCARDS, 'Fourth action should be CREATE_FLASHCARDS');
    assertEqual(actions[4], Actions.COPY, 'Fifth action should be COPY');

    // Verify no duplicates
    const actionIds = actions.map((a) => a.id);
    const uniqueIds = new Set(actionIds);
    assertTrue(uniqueIds.size === actions.length, 'Actions should not have duplicates');
});

// Test: FetchResultNode isScrollable
await asyncTest('FetchResultNode isScrollable returns true', async () => {
    // Import fetch-result-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');

    const node = { type: NodeType.FETCH_RESULT, content: 'Fetched content...' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'FetchResultNode should be scrollable');
});

// Test: FetchResultNode wrapNode integration
await asyncTest('wrapNode returns FetchResultNode for FETCH_RESULT type', async () => {
    // Import fetch-result-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');

    const node = { type: NodeType.FETCH_RESULT, content: 'Fetched content...' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Fetched Content', 'Should return Fetch result node protocol');
    assertTrue(wrapped.getTypeIcon() === '📄', 'Should have fetch result icon');
});

// Test: FetchResultNode handles edge cases
await asyncTest('FetchResultNode handles empty content', async () => {
    // Import fetch-result-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');

    const node = { type: NodeType.FETCH_RESULT, content: '', id: 'test', position: { x: 0, y: 0 }, width: 640, height: 480, created_at: Date.now(), tags: [] };
    const wrapped = wrapNode(node);

    // Should still work with empty content
    assertEqual(wrapped.getTypeLabel(), 'Fetched Content', 'Should return type label even with empty content');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 5, 'Should return actions even with empty content');
});

console.log('\n✅ All Fetch Result node plugin tests passed!\n');
