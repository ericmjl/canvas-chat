/**
 * Tests for Cell node plugin
 * Verifies that the cell node plugin works correctly when loaded
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

console.log('\n=== Cell Node Plugin Tests ===\n');

// Test: Cell node plugin is registered
await asyncTest('Cell node plugin is registered', async () => {
    // Import cell-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/cell-node.js');

    // Check if NodeRegistry has the cell type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('cell'), 'Cell node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('cell');
    assertTrue(protocol !== undefined, 'Cell protocol class should exist');
});

// Test: CellNode protocol methods
await asyncTest('CellNode implements protocol methods', async () => {
    // Import cell-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/cell-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.CELL, 'Content', {
        title: 'Test Cell',
    });
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Test Cell', 'Type label should use title');
    assertEqual(wrapped.getTypeIcon(), '📦', 'Type icon should be 📦');
});

// Test: CellNode getTypeLabel with title
await asyncTest('CellNode getTypeLabel returns title when present', async () => {
    await import('../src/canvas_chat/static/js/plugins/cell-node.js');

    const node = createNode(NodeType.CELL, 'Content', {
        title: 'GPT-4 × Accuracy',
    });
    const wrapped = wrapNode(node);

    assertEqual(wrapped.getTypeLabel(), 'GPT-4 × Accuracy', 'Should return title when present');
});

// Test: CellNode getTypeLabel without title
await asyncTest('CellNode getTypeLabel returns "Cell" when no title', async () => {
    await import('../src/canvas_chat/static/js/plugins/cell-node.js');

    const node = createNode(NodeType.CELL, 'Content', {});
    const wrapped = wrapNode(node);

    assertEqual(wrapped.getTypeLabel(), 'Cell', 'Should return "Cell" when no title');
});

// Test: CellNode isScrollable
await asyncTest('CellNode isScrollable returns true', async () => {
    await import('../src/canvas_chat/static/js/plugins/cell-node.js');

    const node = { type: NodeType.CELL, content: 'Content' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'CellNode should be scrollable');
});

// Test: CellNode wrapNode integration
await asyncTest('wrapNode returns CellNode for CELL type', async () => {
    await import('../src/canvas_chat/static/js/plugins/cell-node.js');

    const node = {
        type: NodeType.CELL,
        content: 'Content',
        title: 'Test Cell',
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Test Cell', 'Should return Cell node protocol');
    assertTrue(wrapped.getTypeIcon() === '📦', 'Should have cell icon');
});

console.log('\n✅ All Cell node plugin tests passed!\n');
