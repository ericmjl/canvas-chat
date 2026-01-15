/**
 * Tests for Review node plugin
 * Verifies that the review node plugin works correctly when loaded
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

console.log('\n=== Review Node Plugin Tests ===\n');

// Test: Review node plugin is registered
await asyncTest('Review node plugin is registered', async () => {
    // Import review-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    // Check if NodeRegistry has the review type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('review'), 'Review node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('review');
    assertTrue(protocol !== undefined, 'Review protocol class should exist');
});

// Test: ReviewNode protocol methods
await asyncTest('ReviewNode implements protocol methods', async () => {
    // Import review-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.REVIEW, 'Review of opinions...', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Review', 'Type label should be Review');
    assertEqual(wrapped.getTypeIcon(), '🔍', 'Type icon should be 🔍');
});

// Test: ReviewNode getActions
await asyncTest('ReviewNode getActions returns correct actions in expected order', async () => {
    // Import review-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    const node = createNode(NodeType.REVIEW, 'Review of opinions...', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // ReviewNode has custom actions: REPLY, SUMMARIZE, CREATE_FLASHCARDS, COPY
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

// Test: ReviewNode supportsStopContinue
await asyncTest('ReviewNode supportsStopContinue returns true', async () => {
    // Import review-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    const node = createNode(NodeType.REVIEW, 'Review of opinions...', {});
    const wrapped = wrapNode(node);
    assertTrue(wrapped.supportsStopContinue(), 'ReviewNode should support stop/continue');
});

// Test: ReviewNode getHeaderButtons (should include STOP and CONTINUE)
await asyncTest('ReviewNode getHeaderButtons includes STOP and CONTINUE', async () => {
    // Import review-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    const node = createNode(NodeType.REVIEW, 'Review of opinions...', {});
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

// Test: ReviewNode isScrollable
await asyncTest('ReviewNode isScrollable returns true', async () => {
    // Import review-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    const node = { type: NodeType.REVIEW, content: 'Review of opinions...' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'ReviewNode should be scrollable');
});

// Test: ReviewNode wrapNode integration
await asyncTest('wrapNode returns ReviewNode for REVIEW type', async () => {
    // Import review-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    const node = { type: NodeType.REVIEW, content: 'Review of opinions...' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Review', 'Should return Review node protocol');
    assertTrue(wrapped.getTypeIcon() === '🔍', 'Should have review icon');
    assertTrue(wrapped.supportsStopContinue() === true, 'Should support stop/continue');
});

// Test: ReviewNode handles edge cases
await asyncTest('ReviewNode handles empty content', async () => {
    // Import review-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/review-node.js');

    const node = {
        type: NodeType.REVIEW,
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
    assertEqual(wrapped.getTypeLabel(), 'Review', 'Should return type label even with empty content');
    assertEqual(wrapped.getTypeIcon(), '🔍', 'Should return type icon even with empty content');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 4, 'Should return actions even with empty content');
    assertTrue(wrapped.supportsStopContinue(), 'Should support stop/continue even with empty content');
    const headerButtons = wrapped.getHeaderButtons();
    assertTrue(Array.isArray(headerButtons) && headerButtons.length > 0, 'Should return header buttons even with empty content');
});

console.log('\n✅ All Review node plugin tests passed!\n');
