/**
 * Tests for Opinion node plugin
 * Verifies that the opinion node plugin works correctly when loaded
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
import { wrapNode, Actions, HeaderButtons } from '../src/canvas_chat/static/js/node-protocols.js';

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

console.log('\n=== Opinion Node Plugin Tests ===\n');

// Test: Opinion node plugin is registered
await asyncTest('Opinion node plugin is registered', async () => {
    // Import opinion-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    // Check if NodeRegistry has the opinion type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('opinion'), 'Opinion node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('opinion');
    assertTrue(protocol !== undefined, 'Opinion protocol class should exist');
});

// Test: OpinionNode protocol methods
await asyncTest('OpinionNode implements protocol methods', async () => {
    // Import opinion-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.OPINION, 'Committee member opinion...', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Opinion', 'Type label should be Opinion');
    assertEqual(wrapped.getTypeIcon(), '🗣️', 'Type icon should be 🗣️');
});

// Test: OpinionNode getActions
await asyncTest('OpinionNode getActions returns correct actions in expected order', async () => {
    // Import opinion-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    const node = createNode(NodeType.OPINION, 'Committee member opinion...', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // OpinionNode has custom actions: REPLY, SUMMARIZE, CREATE_FLASHCARDS, COPY
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

// Test: OpinionNode supportsStopContinue
await asyncTest('OpinionNode supportsStopContinue returns true', async () => {
    // Import opinion-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    const node = createNode(NodeType.OPINION, 'Committee member opinion...', {});
    const wrapped = wrapNode(node);
    assertTrue(wrapped.supportsStopContinue(), 'OpinionNode should support stop/continue');
});

// Test: OpinionNode getHeaderButtons (should include STOP and CONTINUE)
await asyncTest('OpinionNode getHeaderButtons includes STOP and CONTINUE', async () => {
    // Import opinion-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    const node = createNode(NodeType.OPINION, 'Committee member opinion...', {});
    const wrapped = wrapNode(node);
    const headerButtons = wrapped.getHeaderButtons();

    assertTrue(Array.isArray(headerButtons), 'Header buttons should be an array');

    // Check that STOP and CONTINUE buttons are present
    const buttonIds = headerButtons.map((b) => b.id);
    assertTrue(buttonIds.includes('stop'), 'Header buttons should include STOP');
    assertTrue(buttonIds.includes('continue'), 'Header buttons should include CONTINUE');

    // Verify STOP and CONTINUE are hidden by default
    const stopButton = headerButtons.find((b) => b.id === 'stop');
    const continueButton = headerButtons.find((b) => b.id === 'continue');
    assertTrue(stopButton.hidden === true, 'STOP button should be hidden by default');
    assertTrue(continueButton.hidden === true, 'CONTINUE button should be hidden by default');
});

// Test: OpinionNode isScrollable
await asyncTest('OpinionNode isScrollable returns true', async () => {
    // Import opinion-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    const node = { type: NodeType.OPINION, content: 'Committee member opinion...' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'OpinionNode should be scrollable');
});

// Test: OpinionNode wrapNode integration
await asyncTest('wrapNode returns OpinionNode for OPINION type', async () => {
    // Import opinion-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    const node = { type: NodeType.OPINION, content: 'Committee member opinion...' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Opinion', 'Should return Opinion node protocol');
    assertTrue(wrapped.getTypeIcon() === '🗣️', 'Should have opinion icon');
    assertTrue(wrapped.supportsStopContinue() === true, 'Should support stop/continue');
});

// Test: OpinionNode handles edge cases
await asyncTest('OpinionNode handles empty content', async () => {
    // Import opinion-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/opinion-node.js');

    const node = {
        type: NodeType.OPINION,
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
    assertEqual(wrapped.getTypeLabel(), 'Opinion', 'Should return type label even with empty content');
    assertEqual(wrapped.getTypeIcon(), '🗣️', 'Should return type icon even with empty content');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 4, 'Should return actions even with empty content');
    assertTrue(wrapped.supportsStopContinue(), 'Should support stop/continue even with empty content');
    const headerButtons = wrapped.getHeaderButtons();
    assertTrue(Array.isArray(headerButtons) && headerButtons.length > 0, 'Should return header buttons even with empty content');
});

console.log('\n✅ All Opinion node plugin tests passed!\n');
