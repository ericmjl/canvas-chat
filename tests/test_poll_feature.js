/**
 * Tests for PollFeature plugin
 * Verifies that the poll feature works correctly when loaded via the plugin system
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
            // Return a mock IDBOpenDBRequest
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
            // Simulate successful connection asynchronously
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
import { assertTrue, assertEqual } from './test_helpers/assertions.js';
import { createNode } from '../src/canvas_chat/static/js/graph-types.js';

// Import PollFeature class
const { PollFeature } = await import('../src/canvas_chat/static/js/example-plugins/poll.js');

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

console.log('\n=== Poll Feature Plugin Tests ===\n');

// Test: PollFeature can be loaded as plugin
await asyncTest('PollFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'poll',
        feature: PollFeature,
        slashCommands: [
            {
                command: '/poll',
                handler: 'handleCommand',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('poll');
    assertTrue(feature !== undefined, 'Poll feature should be loaded');
    assertTrue(feature instanceof PollFeature, 'Should be instance of PollFeature');
});

// Test: PollFeature has canvas event handlers
await asyncTest('PollFeature registers canvas event handlers', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'poll',
        feature: PollFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('poll');
    const handlers = feature.getCanvasEventHandlers();

    assertTrue(typeof handlers.pollVote === 'function', 'Has pollVote handler');
    assertTrue(typeof handlers.pollAddOption === 'function', 'Has pollAddOption handler');
    assertTrue(typeof handlers.pollResetVotes === 'function', 'Has pollResetVotes handler');
});

// Test: PollFeature handles pollVote event
await asyncTest('PollFeature handles pollVote event', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'poll',
        feature: PollFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('poll');
    const graph = feature.graph;

    // Create a poll node
    const pollNode = createNode('poll', '', {
        question: 'Test question?',
        options: ['Option A', 'Option B'],
        votes: {},
    });
    graph.addNode(pollNode);

    // Vote on option 0
    feature.handlePollVote(pollNode.id, 0);

    // Check that vote was recorded
    const updatedNode = graph.getNode(pollNode.id);
    assertEqual(updatedNode.votes[0], 1, 'First vote should be recorded');

    // Vote again on option 0
    feature.handlePollVote(pollNode.id, 0);
    const updatedNode2 = graph.getNode(pollNode.id);
    assertEqual(updatedNode2.votes[0], 2, 'Second vote should increment count');
});

// Test: PollFeature handles adding options
await asyncTest('PollFeature handles adding poll options', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'poll',
        feature: PollFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('poll');
    const graph = feature.graph;

    // Create a poll node
    const pollNode = createNode('poll', '', {
        question: 'Test question?',
        options: ['Option A'],
        votes: {},
    });
    graph.addNode(pollNode);

    // Add a new option
    feature.addOptionToPoll(pollNode.id, 'Option B');

    // Check that option was added
    const updatedNode = graph.getNode(pollNode.id);
    assertEqual(updatedNode.options.length, 2, 'Should have 2 options');
    assertEqual(updatedNode.options[1], 'Option B', 'New option should be added');
});

// Test: PollFeature handles resetting votes
await asyncTest('PollFeature handles resetting poll votes', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'poll',
        feature: PollFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('poll');
    const graph = feature.graph;

    // Create a poll node with votes
    const pollNode = createNode('poll', '', {
        question: 'Test question?',
        options: ['Option A', 'Option B'],
        votes: { 0: 5, 1: 3 },
    });
    graph.addNode(pollNode);

    // Reset votes
    feature.resetPollVotes(pollNode.id);

    // Check that votes were cleared
    const updatedNode = graph.getNode(pollNode.id);
    const voteCount = Object.keys(updatedNode.votes || {}).length;
    assertEqual(voteCount, 0, 'All votes should be cleared');
});

// Test: PollFeature has slash command
await asyncTest('PollFeature registers /poll slash command', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'poll',
        feature: PollFeature,
        slashCommands: [
            {
                command: '/poll',
                handler: 'handleCommand',
            },
        ],
    });

    const feature = harness.getPlugin('poll');
    const commands = feature.getSlashCommands();
    assertTrue(commands.length > 0, 'Should have slash commands');
    assertEqual(commands[0].command, '/poll', 'Should register /poll command');
});

console.log('\n=== All Poll Feature Tests Passed ===\n');
