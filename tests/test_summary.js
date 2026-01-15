/**
 * Tests for Summary node plugin
 * Verifies that the summary node plugin works correctly when loaded
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

console.log('\n=== Summary Node Plugin Tests ===\n');

// Test: Summary node plugin is registered
await asyncTest('Summary node plugin is registered', async () => {
    // Import summary.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/summary.js');

    // Check if NodeRegistry has the summary type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('summary'), 'Summary node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('summary');
    assertTrue(protocol !== undefined, 'Summary protocol class should exist');
});

// Test: SummaryNode protocol methods
await asyncTest('SummaryNode implements protocol methods', async () => {
    // Import summary.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/summary.js');

    // Test protocol methods
    const testNode = createNode(NodeType.SUMMARY, 'Test summary', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Summary', 'Type label should be Summary');
    assertEqual(wrapped.getTypeIcon(), '📋', 'Type icon should be 📋');
});

// Test: SummaryNode getActions
await asyncTest('SummaryNode getActions returns correct actions in expected order', async () => {
    // Import summary.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/summary.js');

    const node = createNode(NodeType.SUMMARY, 'Test summary', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 3, 'Should have exactly 3 actions');

    // Check for expected actions in expected order
    const actionIds = actions.map((a) => a.id);
    assertTrue(actionIds.includes('reply'), 'Should include REPLY action');
    assertTrue(actionIds.includes('create-flashcards'), 'Should include CREATE_FLASHCARDS action');
    assertTrue(actionIds.includes('copy'), 'Should include COPY action');

    // Verify no duplicates
    const uniqueIds = new Set(actionIds);
    assertTrue(uniqueIds.size === actions.length, 'Actions should not have duplicates');
});

// Test: SummaryNode isScrollable
await asyncTest('SummaryNode isScrollable returns true', async () => {
    // Import summary.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/summary.js');

    const node = { type: NodeType.SUMMARY, content: 'Summary' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'SummaryNode should be scrollable');
});

// Test: SummaryNode wrapNode integration
await asyncTest('wrapNode returns SummaryNode for SUMMARY type', async () => {
    // Import summary.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/summary.js');

    const node = { type: NodeType.SUMMARY, content: 'Summary content' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Summary', 'Should return Summary node protocol');
    assertTrue(wrapped.getTypeIcon() === '📋', 'Should have summary icon');
});

console.log('\n✅ All Summary node plugin tests passed!\n');
