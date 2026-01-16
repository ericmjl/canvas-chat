/**
 * Tests for Human node plugin
 * Verifies that the human node plugin works correctly when loaded
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

console.log('\n=== Human Node Plugin Tests ===\n');

// Test: Human node plugin is registered
await asyncTest('Human node plugin is registered', async () => {
    // Import human-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/human-node.js');

    // Check if NodeRegistry has the human type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('human'), 'Human node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('human');
    assertTrue(protocol !== undefined, 'Human protocol class should exist');
});

// Test: HumanNode protocol methods
await asyncTest('HumanNode implements protocol methods', async () => {
    // Import human-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/human-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.HUMAN, 'Hello, world!', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'You', 'Type label should be You');
    assertEqual(wrapped.getTypeIcon(), '💬', 'Type icon should be 💬');
});

// Test: HumanNode getActions (should return default BaseNode actions)
await asyncTest('HumanNode getActions returns default actions', async () => {
    // Import human-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/human-node.js');

    const node = createNode(NodeType.HUMAN, 'Hello, world!', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    // HumanNode doesn't override getActions, so it should return BaseNode defaults
    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 3, 'Should have 3 default actions (REPLY, EDIT_CONTENT, COPY)');
    assertEqual(actions[0].id, 'reply', 'First action should be REPLY');
    assertEqual(actions[1].id, 'edit-content', 'Second action should be EDIT_CONTENT');
    assertEqual(actions[2].id, 'copy', 'Third action should be COPY');

    // Verify no duplicate actions
    const actionIds = actions.map((a) => a.id);
    const uniqueIds = new Set(actionIds);
    assertTrue(actionIds.length === uniqueIds.size, 'Actions should not have duplicates');
});

// Test: HumanNode isScrollable
await asyncTest('HumanNode isScrollable returns true', async () => {
    // Import human-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/human-node.js');

    const node = { type: NodeType.HUMAN, content: 'Hello, world!' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'HumanNode should be scrollable');
});

// Test: HumanNode wrapNode integration
await asyncTest('wrapNode returns HumanNode for HUMAN type', async () => {
    // Import human-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/human-node.js');

    const node = { type: NodeType.HUMAN, content: 'Hello, world!' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'You', 'Should return Human node protocol');
    assertTrue(wrapped.getTypeIcon() === '💬', 'Should have human icon');
});

console.log('\n✅ All Human node plugin tests passed!\n');
