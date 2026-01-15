/**
 * Tests for Reference node plugin
 * Verifies that the reference node plugin works correctly when loaded
 */

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

console.log('\n=== Reference Node Plugin Tests ===\n');

// Test: Reference node plugin is registered
await asyncTest('Reference node plugin is registered', async () => {
    // Import reference.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/reference.js');

    // Check if NodeRegistry has the reference type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('reference'), 'Reference node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('reference');
    assertTrue(protocol !== undefined, 'Reference protocol class should exist');
});

// Test: ReferenceNode protocol methods
await asyncTest('ReferenceNode implements protocol methods', async () => {
    // Import reference.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/reference.js');

    // Test protocol methods
    const testNode = createNode(NodeType.REFERENCE, '**[Test Title](https://example.com)**\n\nTest snippet', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Reference', 'Type label should be Reference');
    assertEqual(wrapped.getTypeIcon(), '🔗', 'Type icon should be 🔗');
});

// Test: ReferenceNode getActions
await asyncTest('ReferenceNode getActions returns correct actions in expected order', async () => {
    // Import reference.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/reference.js');

    const node = createNode(NodeType.REFERENCE, '**[Test Title](https://example.com)**\n\nTest snippet', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 3, 'Should have exactly 3 actions');

    // Check for expected actions in expected order
    assertEqual(actions[0], Actions.REPLY, 'First action should be REPLY');
    assertEqual(actions[1], Actions.FETCH_SUMMARIZE, 'Second action should be FETCH_SUMMARIZE');
    assertEqual(actions[2], Actions.COPY, 'Third action should be COPY');

    // Verify no duplicates
    const actionIds = actions.map((a) => a.id);
    const uniqueIds = new Set(actionIds);
    assertTrue(uniqueIds.size === actions.length, 'Actions should not have duplicates');
});

// Test: ReferenceNode isScrollable
await asyncTest('ReferenceNode isScrollable returns true', async () => {
    // Import reference.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/reference.js');

    const node = { type: NodeType.REFERENCE, content: '**[Test Title](https://example.com)**\n\nTest snippet' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'ReferenceNode should be scrollable');
});

// Test: ReferenceNode wrapNode integration
await asyncTest('wrapNode returns ReferenceNode for REFERENCE type', async () => {
    // Import reference.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/reference.js');

    const node = { type: NodeType.REFERENCE, content: '**[Test Title](https://example.com)**\n\nTest snippet' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Reference', 'Should return Reference node protocol');
    assertTrue(wrapped.getTypeIcon() === '🔗', 'Should have reference icon');
});

console.log('\n✅ All Reference node plugin tests passed!\n');
