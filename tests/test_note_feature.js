/**
 * Tests for NoteFeature plugin
 * Verifies that the note feature works correctly when loaded via the plugin system
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
import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { PRIORITY } from '../src/canvas_chat/static/js/feature-registry.js';
import { assertEqual, assertTrue, assertFalse } from './test_helpers/assertions.js';

// Import NoteFeature class
const { NoteFeature } = await import('../src/canvas_chat/static/js/plugins/note.js');

// Import node types for testing
const { NodeType, createNode } = await import('../src/canvas_chat/static/js/graph-types.js');
const { wrapNode } = await import('../src/canvas_chat/static/js/node-protocols.js');

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

console.log('\n=== Note Feature Plugin Tests ===\n');

// Test: NoteFeature can be loaded as plugin
await asyncTest('NoteFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [
            {
                command: '/note',
                handler: 'handleCommand',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('note');
    assertTrue(feature !== undefined, 'NoteFeature should be registered');
    assertTrue(feature instanceof NoteFeature, 'Registered feature should be NoteFeature instance');
});

// Test: NoteFeature registers /note slash command
await asyncTest('NoteFeature registers /note slash command', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [
            {
                command: '/note',
                handler: 'handleCommand',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const commands = harness.registry.getSlashCommands();
    assertTrue(commands.includes('/note'), 'Should register /note command');

    // Check command metadata
    const feature = harness.getPlugin('note');
    const slashCommands = feature.getSlashCommands();
    assertEqual(slashCommands.length, 1, 'Should have one slash command');
    assertEqual(slashCommands[0].command, '/note', 'Command should be /note');
    assertEqual(
        slashCommands[0].description,
        'Add a note with markdown content',
        'Description should match'
    );
});

// Test: NoteFeature handles /note command with markdown content
await asyncTest('NoteFeature creates note node from markdown content', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [
            {
                command: '/note',
                handler: 'handleCommand',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const result = await harness.executeSlashCommand('/note', 'This is a test note');

    assertTrue(result, 'Command should be handled');
    assertEqual(harness.createdNodes.length, 1, 'Should create one node');
    assertEqual(harness.createdNodes[0].type, NodeType.NOTE, 'Node type should be NOTE');
    assertEqual(harness.createdNodes[0].content, 'This is a test note', 'Content should match');
});

// Test: NoteFeature handles /note command with empty content
await asyncTest('NoteFeature shows warning for empty content', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [
            {
                command: '/note',
                handler: 'handleCommand',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const result = await harness.executeSlashCommand('/note', '');

    assertTrue(result, 'Command should be handled');
    assertEqual(harness.createdNodes.length, 0, 'Should not create node');
    assertTrue(
        harness.toasts.some((t) => t.message.includes('Please provide note content') || t.message.includes('Please provide note content or a URL')),
        'Should show warning toast'
    );
});

// Test: NoteFeature handles /note command with URL
await asyncTest('NoteFeature handles URL in /note command', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [
            {
                command: '/note',
                handler: 'handleCommand',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Mock fetch for URL handling
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            title: 'Test Page',
            content: 'Test content from URL',
        }),
    });

    const result = await harness.executeSlashCommand('/note', 'https://example.com');

    assertTrue(result, 'Command should be handled');
    // Note: URL handling creates FETCH_RESULT node, not NOTE node
    // This test verifies the command is routed correctly
});

// Test: Note node plugin is registered
await asyncTest('Note node plugin is registered', async () => {
    // Import note.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/note.js');

    // Check if NodeRegistry has the note type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('note'), 'Note node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('note');
    assertTrue(protocol !== undefined, 'Note protocol class should exist');

    // Test protocol methods
    const testNode = createNode(NodeType.NOTE, 'Test note', {});
    const nodeInstance = new protocol(testNode);
    assertEqual(nodeInstance.getTypeLabel(), 'Note', 'Type label should be Note');
    assertEqual(nodeInstance.getTypeIcon(), '📝', 'Type icon should be 📝');
});

// Test: NoteNode getActions
await asyncTest('NoteNode getActions returns correct actions', async () => {
    // Import note.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/note.js');

    const node = createNode(NodeType.NOTE, 'Test note', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 4, 'Should have 4 actions (REPLY, EDIT_CONTENT, COPY, CREATE_FLASHCARDS)');

    // Check for expected actions (defaults + additional)
    const actionIds = actions.map((a) => a.id);
    assertTrue(actionIds.includes('reply'), 'Should include REPLY action');
    assertTrue(actionIds.includes('edit-content'), 'Should include EDIT_CONTENT action');
    assertTrue(actionIds.includes('copy'), 'Should include COPY action');
    assertTrue(actionIds.includes('create-flashcards'), 'Should include CREATE_FLASHCARDS action');
    assertTrue(actionIds.includes('edit-content'), 'Should include EDIT_CONTENT action');
    assertTrue(actionIds.includes('create-flashcards'), 'Should include CREATE_FLASHCARDS action');
    assertTrue(actionIds.includes('copy'), 'Should include COPY action');
});

// Test: NoteNode wrapNode integration
await asyncTest('wrapNode returns NoteNode for NOTE type', async () => {
    // Import note.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/note.js');

    const node = { type: NodeType.NOTE, content: 'Note content' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Note', 'Should return Note node protocol');
    assertTrue(wrapped.getTypeIcon() === '📝', 'Should have note icon');
});

console.log('\n✅ All NoteFeature tests passed!\n');
