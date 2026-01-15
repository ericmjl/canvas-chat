/**
 * Tests for AI node plugin
 * Verifies that the AI node plugin works correctly when loaded
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

console.log('\n=== AI Node Plugin Tests ===\n');

// Test: AI node plugin is registered
await asyncTest('AI node plugin is registered', async () => {
    // Import ai-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/ai-node.js');

    // Check if NodeRegistry has the ai type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('ai'), 'AI node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('ai');
    assertTrue(protocol !== undefined, 'AI protocol class should exist');
});

// Test: AINode protocol methods
await asyncTest('AINode implements protocol methods', async () => {
    // Import ai-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/ai-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.AI, 'Hello, I am an AI assistant.', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'AI', 'Type label should be AI');
    assertEqual(wrapped.getTypeIcon(), '🤖', 'Type icon should be 🤖');
});

// Test: AINode getActions (should return custom actions)
await asyncTest('AINode getActions returns correct actions in order', async () => {
    // Import ai-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/ai-node.js');

    const node = createNode(NodeType.AI, 'Hello, I am an AI assistant.', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // AINode has custom actions: REPLY, SUMMARIZE, CREATE_FLASHCARDS, COPY
    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 4, 'Should have 4 actions');
    assertEqual(actions[0].id, 'reply', 'First action should be REPLY');
    assertEqual(actions[1].id, 'summarize', 'Second action should be SUMMARIZE');
    assertEqual(actions[2].id, 'create-flashcards', 'Third action should be CREATE_FLASHCARDS');
    assertEqual(actions[3].id, 'copy', 'Fourth action should be COPY');

    // Verify no duplicate actions
    const actionIds = actions.map((a) => a.id);
    const uniqueIds = new Set(actionIds);
    assertTrue(actionIds.length === uniqueIds.size, 'Actions should not have duplicates');
});

// Test: AINode supportsStopContinue
await asyncTest('AINode supportsStopContinue returns true', async () => {
    // Import ai-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/ai-node.js');

    const node = createNode(NodeType.AI, 'Hello, I am an AI assistant.', {});
    const wrapped = wrapNode(node);
    assertTrue(wrapped.supportsStopContinue(), 'AINode should support stop/continue');
});

// Test: AINode getHeaderButtons (should include STOP and CONTINUE)
await asyncTest('AINode getHeaderButtons includes STOP and CONTINUE', async () => {
    // Import ai-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/ai-node.js');

    const node = createNode(NodeType.AI, 'Hello, I am an AI assistant.', {});
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

// Test: AINode isScrollable
await asyncTest('AINode isScrollable returns true', async () => {
    // Import ai-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/ai-node.js');

    const node = { type: NodeType.AI, content: 'Hello, I am an AI assistant.' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'AINode should be scrollable');
});

// Test: AINode wrapNode integration
await asyncTest('wrapNode returns AINode for AI type', async () => {
    // Import ai-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/ai-node.js');

    const node = { type: NodeType.AI, content: 'Hello, I am an AI assistant.' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'AI', 'Should return AI node protocol');
    assertTrue(wrapped.getTypeIcon() === '🤖', 'Should have AI icon');
    assertTrue(wrapped.supportsStopContinue() === true, 'Should support stop/continue');
});

console.log('\n✅ All AI node plugin tests passed!\n');
