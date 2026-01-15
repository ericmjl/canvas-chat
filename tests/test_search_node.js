/**
 * Tests for Search node plugin
 * Verifies that the search node plugin works correctly when loaded
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
import { wrapNode } from '../src/canvas_chat/static/js/node-protocols.js';

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

console.log('\n=== Search Node Plugin Tests ===\n');

// Test: Search node plugin is registered
await asyncTest('Search node plugin is registered', async () => {
    // Import search-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/search-node.js');

    // Check if NodeRegistry has the search type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('search'), 'Search node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('search');
    assertTrue(protocol !== undefined, 'Search protocol class should exist');
});

// Test: SearchNode protocol methods
await asyncTest('SearchNode implements protocol methods', async () => {
    // Import search-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/search-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.SEARCH, 'Searching: "test query"', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Search', 'Type label should be Search');
    assertEqual(wrapped.getTypeIcon(), '🔍', 'Type icon should be 🔍');
});

// Test: SearchNode getActions (should return empty array or default actions)
await asyncTest('SearchNode getActions returns default actions', async () => {
    // Import search-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/search-node.js');

    const node = createNode(NodeType.SEARCH, 'Searching: "test query"', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // SearchNode doesn't override getActions, so it should return BaseNode default (empty array)
    assertTrue(Array.isArray(actions), 'Actions should be an array');
});

// Test: SearchNode isScrollable
await asyncTest('SearchNode isScrollable returns true', async () => {
    // Import search-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/search-node.js');

    const node = { type: NodeType.SEARCH, content: 'Searching: "test query"' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'SearchNode should be scrollable');
});

// Test: SearchNode wrapNode integration
await asyncTest('wrapNode returns SearchNode for SEARCH type', async () => {
    // Import search-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/search-node.js');

    const node = { type: NodeType.SEARCH, content: 'Searching: "test query"' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Search', 'Should return Search node protocol');
    assertTrue(wrapped.getTypeIcon() === '🔍', 'Should have search icon');
});

console.log('\n✅ All Search node plugin tests passed!\n');
