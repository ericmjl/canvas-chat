/**
 * Tests for Research node plugin
 * Verifies that the research node plugin works correctly when loaded
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
import { createNode, NodeType } from '../src/canvas_chat/static/js/graph-types.js';
import { Actions, wrapNode } from '../src/canvas_chat/static/js/node-protocols.js';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

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

console.log('\n=== Research Node Plugin Tests ===\n');

// Test: Research node plugin is registered
await asyncTest('Research node plugin is registered', async () => {
    // Import research-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/research-node.js');

    // Check if NodeRegistry has the research type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('research'), 'Research node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('research');
    assertTrue(protocol !== undefined, 'Research protocol class should exist');
});

// Test: ResearchNode protocol methods
await asyncTest('ResearchNode implements protocol methods', async () => {
    // Import research-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/research-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.RESEARCH, 'Researching topic...', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Research', 'Type label should be Research');
    assertEqual(wrapped.getTypeIcon(), '📚', 'Type icon should be 📚');
});

// Test: ResearchNode getActions
await asyncTest('ResearchNode getActions returns correct actions in expected order', async () => {
    // Import research-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/research-node.js');

    const node = createNode(NodeType.RESEARCH, 'Researching topic...', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // ResearchNode has custom actions: REPLY, CREATE_FLASHCARDS, COPY
    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 3, 'Should have exactly 3 actions');

    // Check for expected actions in expected order
    assertEqual(actions[0], Actions.REPLY, 'First action should be REPLY');
    assertEqual(actions[1], Actions.CREATE_FLASHCARDS, 'Second action should be CREATE_FLASHCARDS');
    assertEqual(actions[2], Actions.COPY, 'Third action should be COPY');

    // Verify no duplicates
    const actionIds = actions.map((a) => a.id);
    const uniqueIds = new Set(actionIds);
    assertTrue(uniqueIds.size === actions.length, 'Actions should not have duplicates');
});

// Test: ResearchNode getHeaderButtons (should include STOP and CONTINUE)
await asyncTest('ResearchNode getHeaderButtons includes STOP and CONTINUE', async () => {
    // Import research-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/research-node.js');

    const node = createNode(NodeType.RESEARCH, 'Researching topic...', {});
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

// Test: ResearchNode isScrollable
await asyncTest('ResearchNode isScrollable returns true', async () => {
    // Import research-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/research-node.js');

    const node = { type: NodeType.RESEARCH, content: 'Researching topic...' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'ResearchNode should be scrollable');
});

// Test: ResearchNode wrapNode integration
await asyncTest('wrapNode returns ResearchNode for RESEARCH type', async () => {
    // Import research-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/research-node.js');

    const node = { type: NodeType.RESEARCH, content: 'Researching topic...' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Research', 'Should return Research node protocol');
    assertTrue(wrapped.getTypeIcon() === '📚', 'Should have research icon');
});

// Test: ResearchNode handles edge cases
await asyncTest('ResearchNode handles empty content', async () => {
    // Import research-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/research-node.js');

    const node = {
        type: NodeType.RESEARCH,
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
    assertEqual(wrapped.getTypeLabel(), 'Research', 'Should return type label even with empty content');
    assertEqual(wrapped.getTypeIcon(), '📚', 'Should return type icon even with empty content');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 3, 'Should return actions even with empty content');
    const headerButtons = wrapped.getHeaderButtons();
    assertTrue(Array.isArray(headerButtons) && headerButtons.length > 0, 'Should return header buttons even with empty content');
});

console.log('\n✅ All Research node plugin tests passed!\n');
