/**
 * Tests for Column node plugin
 * Verifies that the column node plugin works correctly when loaded
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

console.log('\n=== Column Node Plugin Tests ===\n');

// Test: Column node plugin is registered
await asyncTest('Column node plugin is registered', async () => {
    // Import column-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/column-node.js');

    // Check if NodeRegistry has the column type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('column'), 'Column node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('column');
    assertTrue(protocol !== undefined, 'Column protocol class should exist');
});

// Test: ColumnNode protocol methods
await asyncTest('ColumnNode implements protocol methods', async () => {
    // Import column-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/column-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.COLUMN, 'Content', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Column', 'Type label should be Column');
    assertEqual(wrapped.getTypeIcon(), '↕️', 'Type icon should be ↕️');
});

// Test: ColumnNode isScrollable
await asyncTest('ColumnNode isScrollable returns true', async () => {
    await import('../src/canvas_chat/static/js/plugins/column-node.js');

    const node = { type: NodeType.COLUMN, content: 'Content' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'ColumnNode should be scrollable');
});

// Test: ColumnNode wrapNode integration
await asyncTest('wrapNode returns ColumnNode for COLUMN type', async () => {
    await import('../src/canvas_chat/static/js/plugins/column-node.js');

    const node = {
        type: NodeType.COLUMN,
        content: 'Content',
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Column', 'Should return Column node protocol');
    assertTrue(wrapped.getTypeIcon() === '↕️', 'Should have column icon');
});

console.log('\n✅ All Column node plugin tests passed!\n');
