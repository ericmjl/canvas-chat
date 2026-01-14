/**
 * Tests for PluginTestHarness
 * Meta-test: Testing the testing utilities themselves
 */

import {
    PluginTestHarness,
    MockApp,
    MockCanvas,
    MockChat,
    MockStorage,
} from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { FeaturePlugin } from '../src/canvas_chat/static/js/feature-plugin.js';
import { NodeType, createNode } from '../src/canvas_chat/static/js/graph-types.js';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

function test(description, fn) {
    try {
        fn();
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

function assertFalse(value, message) {
    if (value) {
        throw new Error(message || 'Expected false, got true');
    }
}

function assertThrows(fn, expectedMessage) {
    try {
        fn();
        throw new Error('Expected function to throw, but it did not');
    } catch (error) {
        if (error.message === 'Expected function to throw, but it did not') {
            throw error;
        }
        if (expectedMessage && !error.message.includes(expectedMessage)) {
            throw new Error(`Expected error message to include "${expectedMessage}", got "${error.message}"`);
        }
    }
}

console.log('\n=== Mock Classes Tests ===\n');

// Test: MockCanvas tracks rendering
test('MockCanvas tracks node rendering', () => {
    const canvas = new MockCanvas();
    const node = createNode(NodeType.TEXT, 'Test');

    canvas.renderNode(node);

    assertEqual(canvas.renderedNodes.length, 1, 'One node rendered');
    assertEqual(canvas.renderedNodes[0], node.id, 'Node ID tracked');
    assertTrue(canvas.nodes.has(node.id), 'Node stored in map');
});

// Test: MockCanvas tracks removal
test('MockCanvas tracks node removal', () => {
    const canvas = new MockCanvas();
    const node = createNode(NodeType.TEXT, 'Test');

    canvas.renderNode(node);
    canvas.removeNode(node.id);

    assertEqual(canvas.removedNodes.length, 1, 'One node removed');
    assertEqual(canvas.removedNodes[0], node.id, 'Node ID tracked');
    assertFalse(canvas.nodes.has(node.id), 'Node removed from map');
});

// Test: MockChat tracks messages
await asyncTest('MockChat tracks messages', async () => {
    const chat = new MockChat();
    let chunkReceived = false;
    let doneReceived = false;

    await chat.sendMessage(
        [{ role: 'user', content: 'Hello' }],
        'gpt-4',
        () => {
            chunkReceived = true;
        },
        () => {
            doneReceived = true;
        },
        null
    );

    assertEqual(chat.messages.length, 1, 'One message sent');
    assertTrue(chunkReceived, 'Chunk callback called');
    assertTrue(doneReceived, 'Done callback called');
});

// Test: MockStorage stores data
test('MockStorage stores and retrieves data', () => {
    const storage = new MockStorage();

    storage.setItem('test-key', 'test-value');
    const retrieved = storage.getItem('test-key');

    assertEqual(retrieved, 'test-value', 'Data retrieved correctly');
});

// Test: MockApp has all required components
test('MockApp has all required components', () => {
    const app = new MockApp();

    assertTrue(app.graph !== undefined, 'Has graph');
    assertTrue(app.canvas !== undefined, 'Has canvas');
    assertTrue(app.chat !== undefined, 'Has chat');
    assertTrue(app.storage !== undefined, 'Has storage');
    assertTrue(app.modalManager !== undefined, 'Has modalManager');
    assertTrue(app.undoManager !== undefined, 'Has undoManager');
    assertTrue(app.searchIndex !== undefined, 'Has searchIndex');
    assertTrue(app.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(app.chatInput !== undefined, 'Has chatInput');
    assertTrue(app.streamingNodes !== undefined, 'Has streamingNodes');
    assertTrue(app.methodCalls !== undefined, 'Has methodCalls tracker');
});

console.log('\n=== PluginTestHarness Tests ===\n');

// Test: Create harness
test('PluginTestHarness can be created', () => {
    const harness = new PluginTestHarness();
    assertTrue(harness instanceof PluginTestHarness, 'Harness created');
    assertTrue(harness.mockApp !== undefined, 'Has mock app');
    assertTrue(harness.appContext !== undefined, 'Has app context');
    assertTrue(harness.registry !== undefined, 'Has registry');
});

// Test: Load plugin via harness
await asyncTest('Can load plugin via harness', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {}

    await harness.loadPlugin({
        id: 'test',
        feature: TestPlugin,
        slashCommands: [],
    });

    const plugin = harness.getPlugin('test');
    assertTrue(plugin !== undefined, 'Plugin loaded');
    assertTrue(plugin instanceof TestPlugin, 'Plugin is correct type');
});

// Test: Execute command via harness
await asyncTest('Can execute command via harness', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        async handleTest(command, args, context) {
            this.executedArgs = args;
        }
    }

    await harness.loadPlugin({
        id: 'test',
        feature: TestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTest' }],
    });

    const handled = await harness.executeSlashCommand('/test', 'hello', {});
    assertTrue(handled, 'Command handled');

    const plugin = harness.getPlugin('test');
    assertEqual(plugin.executedArgs, 'hello', 'Args passed correctly');
});

// Test: Emit event via harness
await asyncTest('Can emit event via harness', async () => {
    const harness = new PluginTestHarness();
    const receivedEvents = [];

    harness.on('test:event', (event) => {
        receivedEvents.push(event);
    });

    harness.emitEvent('test:event', { type: 'test:event', data: { test: 'data' } });

    assertEqual(receivedEvents.length, 1, 'Event received');
    assertEqual(receivedEvents[0].data.test, 'data', 'Event data correct');
});

// Test: assertNoSideEffects detects nodes
await asyncTest('assertNoSideEffects detects node creation', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        async handleTest(command, args, context) {
            const node = createNode(NodeType.TEXT, 'Side effect!');
            this.graph.addNode(node);
        }
    }

    await harness.loadPlugin({
        id: 'test',
        feature: TestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTest' }],
    });

    await harness.executeSlashCommand('/test', '', {});

    assertThrows(() => {
        harness.assertNoSideEffects();
    }, 'Graph has 1 nodes');
});

// Test: assertNoSideEffects detects toasts
await asyncTest('assertNoSideEffects detects toast calls', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        async handleTest(command, args, context) {
            this.showToast('Hello!', 'info');
        }
    }

    await harness.loadPlugin({
        id: 'test',
        feature: TestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTest' }],
    });

    await harness.executeSlashCommand('/test', '', {});

    assertThrows(() => {
        harness.assertNoSideEffects();
    }, 'showToast called 1 times');
});

// Test: assertNoSideEffects passes when no side effects
await asyncTest('assertNoSideEffects passes with no side effects', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        async handleTest(command, args, context) {
            // Do nothing
        }
    }

    await harness.loadPlugin({
        id: 'test',
        feature: TestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTest' }],
    });

    await harness.executeSlashCommand('/test', '', {});

    // Should not throw
    harness.assertNoSideEffects();
});

// Test: Reset harness state
await asyncTest('Can reset harness state', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        async handleTest(command, args, context) {
            const node = createNode(NodeType.TEXT, 'Test');
            this.graph.addNode(node);
            this.showToast('Test', 'info');
        }
    }

    await harness.loadPlugin({
        id: 'test',
        feature: TestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTest' }],
    });

    await harness.executeSlashCommand('/test', '', {});

    // Verify side effects exist
    assertEqual(harness.mockApp.graph.getNodes().length, 1, 'Node created');
    assertEqual(harness.mockApp.methodCalls.showToast.length, 1, 'Toast called');

    // Reset
    harness.reset();

    // Verify state cleared
    assertEqual(harness.mockApp.graph.getNodes().length, 0, 'Graph cleared');
    assertEqual(harness.mockApp.methodCalls.showToast.length, 0, 'Method calls cleared');
});

// Test: Unload plugin via harness
await asyncTest('Can unload plugin via harness', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {}

    await harness.loadPlugin({
        id: 'test',
        feature: TestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTest' }],
    });

    assertTrue(harness.getPlugin('test') !== undefined, 'Plugin exists');

    await harness.unloadPlugin('test');

    assertTrue(harness.getPlugin('test') === undefined, 'Plugin unloaded');
    const handled = await harness.executeSlashCommand('/test', '', {});
    assertFalse(handled, 'Command no longer works');
});

console.log('\n=== All PluginTestHarness tests passed! ===\n');
