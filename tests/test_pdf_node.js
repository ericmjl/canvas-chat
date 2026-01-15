/**
 * Tests for PDF node plugin
 * Verifies that the PDF node plugin works correctly when loaded
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

console.log('\n=== PDF Node Plugin Tests ===\n');

// Test: PDF node plugin is registered
await asyncTest('PDF node plugin is registered', async () => {
    // Import pdf-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/pdf-node.js');

    // Check if NodeRegistry has the pdf type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('pdf'), 'PDF node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('pdf');
    assertTrue(protocol !== undefined, 'PDF protocol class should exist');
});

// Test: PdfNode protocol methods
await asyncTest('PdfNode implements protocol methods', async () => {
    // Import pdf-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/pdf-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.PDF, 'PDF document content', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'PDF', 'Type label should be PDF');
    assertEqual(wrapped.getTypeIcon(), '📑', 'Type icon should be 📑');
});

// Test: PdfNode getActions
await asyncTest('PdfNode getActions returns correct actions in expected order', async () => {
    // Import pdf-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/pdf-node.js');

    const node = createNode(NodeType.PDF, 'PDF document content', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // PdfNode has custom actions: REPLY, SUMMARIZE, CREATE_FLASHCARDS, COPY
    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 4, 'Should have exactly 4 actions');

    // Check for expected actions in expected order
    assertEqual(actions[0], Actions.REPLY, 'First action should be REPLY');
    assertEqual(actions[1], Actions.SUMMARIZE, 'Second action should be SUMMARIZE');
    assertEqual(actions[2], Actions.CREATE_FLASHCARDS, 'Third action should be CREATE_FLASHCARDS');
    assertEqual(actions[3], Actions.COPY, 'Fourth action should be COPY');

    // Verify no duplicates
    const actionIds = actions.map((a) => a.id);
    const uniqueIds = new Set(actionIds);
    assertTrue(uniqueIds.size === actions.length, 'Actions should not have duplicates');
});

// Test: PdfNode isScrollable
await asyncTest('PdfNode isScrollable returns true', async () => {
    // Import pdf-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/pdf-node.js');

    const node = { type: NodeType.PDF, content: 'PDF document content' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'PdfNode should be scrollable');
});

// Test: PdfNode wrapNode integration
await asyncTest('wrapNode returns PdfNode for PDF type', async () => {
    // Import pdf-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/pdf-node.js');

    const node = { type: NodeType.PDF, content: 'PDF document content' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'PDF', 'Should return PDF node protocol');
    assertTrue(wrapped.getTypeIcon() === '📑', 'Should have PDF icon');
});

// Test: PdfNode handles edge cases
await asyncTest('PdfNode handles empty content', async () => {
    // Import pdf-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/pdf-node.js');

    const node = {
        type: NodeType.PDF,
        content: '',
        id: 'test',
        position: { x: 0, y: 0 },
        width: 640,
        height: 480,
        created_at: Date.now(),
        tags: [],
    };
    const wrapped = wrapNode(node);

    // Should still work with empty content
    assertEqual(wrapped.getTypeLabel(), 'PDF', 'Should return type label even with empty content');
    assertEqual(wrapped.getTypeIcon(), '📑', 'Should return type icon even with empty content');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 4, 'Should return actions even with empty content');
    assertTrue(wrapped.isScrollable(), 'Should be scrollable even with empty content');
});

console.log('\n✅ All PDF node plugin tests passed!\n');
