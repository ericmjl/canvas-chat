/**
 * Tests for Synthesis node plugin
 * Verifies that the synthesis node plugin works correctly when loaded
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

console.log('\n=== Synthesis Node Plugin Tests ===\n');

// Test: Synthesis node plugin is registered
await asyncTest('Synthesis node plugin is registered', async () => {
    // Import synthesis-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    // Check if NodeRegistry has the synthesis type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('synthesis'), 'Synthesis node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('synthesis');
    assertTrue(protocol !== undefined, 'Synthesis protocol class should exist');
});

// Test: SynthesisNode protocol methods
await asyncTest('SynthesisNode implements protocol methods', async () => {
    // Import synthesis-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.SYNTHESIS, 'Synthesized answer...', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Synthesis', 'Type label should be Synthesis');
    assertEqual(wrapped.getTypeIcon(), '⚖️', 'Type icon should be ⚖️');
});

// Test: SynthesisNode getActions
await asyncTest('SynthesisNode getActions returns correct actions in expected order', async () => {
    // Import synthesis-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    const node = createNode(NodeType.SYNTHESIS, 'Synthesized answer...', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // SynthesisNode has custom actions: REPLY, SUMMARIZE, CREATE_FLASHCARDS, COPY
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

// Test: SynthesisNode supportsStopContinue
await asyncTest('SynthesisNode supportsStopContinue returns true', async () => {
    // Import synthesis-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    const node = createNode(NodeType.SYNTHESIS, 'Synthesized answer...', {});
    const wrapped = wrapNode(node);
    assertTrue(wrapped.supportsStopContinue(), 'SynthesisNode should support stop/continue');
});

// Test: SynthesisNode getHeaderButtons (should include STOP and CONTINUE)
await asyncTest('SynthesisNode getHeaderButtons includes STOP and CONTINUE', async () => {
    // Import synthesis-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    const node = createNode(NodeType.SYNTHESIS, 'Synthesized answer...', {});
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

// Test: SynthesisNode isScrollable
await asyncTest('SynthesisNode isScrollable returns true', async () => {
    // Import synthesis-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    const node = { type: NodeType.SYNTHESIS, content: 'Synthesized answer...' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'SynthesisNode should be scrollable');
});

// Test: SynthesisNode wrapNode integration
await asyncTest('wrapNode returns SynthesisNode for SYNTHESIS type', async () => {
    // Import synthesis-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    const node = { type: NodeType.SYNTHESIS, content: 'Synthesized answer...' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Synthesis', 'Should return Synthesis node protocol');
    assertTrue(wrapped.getTypeIcon() === '⚖️', 'Should have synthesis icon');
    assertTrue(wrapped.supportsStopContinue() === true, 'Should support stop/continue');
});

// Test: SynthesisNode handles edge cases
await asyncTest('SynthesisNode handles empty content', async () => {
    // Import synthesis-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');

    const node = {
        type: NodeType.SYNTHESIS,
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
    assertEqual(wrapped.getTypeLabel(), 'Synthesis', 'Should return type label even with empty content');
    assertEqual(wrapped.getTypeIcon(), '⚖️', 'Should return type icon even with empty content');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 4, 'Should return actions even with empty content');
    assertTrue(wrapped.supportsStopContinue(), 'Should support stop/continue even with empty content');
    const headerButtons = wrapped.getHeaderButtons();
    assertTrue(Array.isArray(headerButtons) && headerButtons.length > 0, 'Should return header buttons even with empty content');
});

console.log('\n✅ All Synthesis node plugin tests passed!\n');
