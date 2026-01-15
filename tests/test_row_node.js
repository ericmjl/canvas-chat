/**
 * Tests for Row node plugin
 * Verifies that the row node plugin works correctly when loaded
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

console.log('\n=== Row Node Plugin Tests ===\n');

// Test: Row node plugin is registered
await asyncTest('Row node plugin is registered', async () => {
    // Import row-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/row-node.js');

    // Check if NodeRegistry has the row type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('row'), 'Row node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('row');
    assertTrue(protocol !== undefined, 'Row protocol class should exist');
});

// Test: RowNode protocol methods
await asyncTest('RowNode implements protocol methods', async () => {
    // Import row-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/row-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.ROW, 'Content', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Row', 'Type label should be Row');
    assertEqual(wrapped.getTypeIcon(), '↔️', 'Type icon should be ↔️');
});

// Test: RowNode isScrollable
await asyncTest('RowNode isScrollable returns true', async () => {
    await import('../src/canvas_chat/static/js/plugins/row-node.js');

    const node = { type: NodeType.ROW, content: 'Content' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'RowNode should be scrollable');
});

// Test: RowNode wrapNode integration
await asyncTest('wrapNode returns RowNode for ROW type', async () => {
    await import('../src/canvas_chat/static/js/plugins/row-node.js');

    const node = {
        type: NodeType.ROW,
        content: 'Content',
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Row', 'Should return Row node protocol');
    assertTrue(wrapped.getTypeIcon() === '↔️', 'Should have row icon');
});

console.log('\n✅ All Row node plugin tests passed!\n');
