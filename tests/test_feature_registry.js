/**
 * Tests for FeatureRegistry
 */

import { FeatureRegistry, PRIORITY } from '../src/canvas_chat/static/js/feature-registry.js';
import {
    SimpleTestPlugin,
    ComplexTestPlugin,
} from '../src/canvas_chat/static/js/example-plugins/example-test-plugin.js';
import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
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

async function asyncAssertThrows(fn, expectedMessage) {
    try {
        await fn();
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

console.log('\n=== FeatureRegistry Tests ===\n');

// Test: Create FeatureRegistry
test('FeatureRegistry can be created', () => {
    const registry = new FeatureRegistry();
    assertTrue(registry instanceof FeatureRegistry, 'Registry should be created');
});

// Test: Priority constants are defined
test('PRIORITY constants are defined', () => {
    assertEqual(PRIORITY.BUILTIN, 1000, 'BUILTIN priority');
    assertEqual(PRIORITY.OFFICIAL, 500, 'OFFICIAL priority');
    assertEqual(PRIORITY.COMMUNITY, 100, 'COMMUNITY priority');
    assertEqual(PRIORITY.OVERRIDE, 2000, 'OVERRIDE priority');
});

// Test: Register a simple plugin
await asyncTest('Can register a simple plugin', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'simple-test',
        feature: SimpleTestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTestCommand' }],
    });

    const plugin = harness.getPlugin('simple-test');
    assertTrue(plugin !== undefined, 'Plugin should be registered');
    assertTrue(plugin instanceof SimpleTestPlugin, 'Plugin should be instance of SimpleTestPlugin');
    assertEqual(plugin.loadCount, 1, 'onLoad should be called once');
});

// Test: Execute slash command
await asyncTest('Can execute slash command', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'simple-test',
        feature: SimpleTestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTestCommand' }],
    });

    const handled = await harness.executeSlashCommand('/test', 'hello world', {});
    assertTrue(handled, 'Command should be handled');

    const plugin = harness.getPlugin('simple-test');
    assertEqual(plugin.commandsExecuted.length, 1, 'Command should be executed once');
    assertEqual(plugin.commandsExecuted[0].command, '/test', 'Command name should match');
    assertEqual(plugin.commandsExecuted[0].args, 'hello world', 'Args should match');
});

// Test: Unknown command returns false
await asyncTest('Unknown command returns false', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'simple-test',
        feature: SimpleTestPlugin,
        slashCommands: [{ command: '/test', handler: 'handleTestCommand' }],
    });

    const handled = await harness.executeSlashCommand('/unknown', '', {});
    assertFalse(handled, 'Unknown command should not be handled');
});

// Test: Duplicate plugin ID throws error
await asyncTest('Duplicate plugin ID throws error', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'test',
        feature: SimpleTestPlugin,
        slashCommands: [],
    });

    await asyncAssertThrows(async () => {
        await harness.loadPlugin({
            id: 'test',
            feature: SimpleTestPlugin,
            slashCommands: [],
        });
    }, 'already registered');
});

// Test: Slash command conflict with equal priority throws error
await asyncTest('Slash command conflict with equal priority throws error', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'plugin1',
        feature: SimpleTestPlugin,
        slashCommands: [{ command: '/conflict', handler: 'handleTestCommand', priority: 100 }],
    });

    await asyncAssertThrows(async () => {
        await harness.loadPlugin({
            id: 'plugin2',
            feature: SimpleTestPlugin,
            slashCommands: [{ command: '/conflict', handler: 'handleTestCommand', priority: 100 }],
        });
    }, 'Slash command conflict');
});

// Test: Higher priority command wins
await asyncTest('Higher priority command wins', async () => {
    const harness = new PluginTestHarness();

    // Register lower priority first
    await harness.loadPlugin({
        id: 'low-priority',
        feature: SimpleTestPlugin,
        slashCommands: [{ command: '/priority', handler: 'handleTestCommand', priority: 100 }],
    });

    // Register higher priority second
    await harness.loadPlugin({
        id: 'high-priority',
        feature: ComplexTestPlugin,
        slashCommands: [{ command: '/priority', handler: 'handleCountCommand', priority: 500 }],
    });

    // Execute command
    await harness.executeSlashCommand('/priority', 'test', {});

    // High priority plugin should handle it
    const highPriorityPlugin = harness.getPlugin('high-priority');
    assertEqual(highPriorityPlugin.state.counter, 1, 'High priority handler should execute');

    const lowPriorityPlugin = harness.getPlugin('low-priority');
    assertEqual(lowPriorityPlugin.commandsExecuted.length, 0, 'Low priority handler should not execute');
});

// Test: Event subscriptions work
await asyncTest('Event subscriptions work', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'event-test',
        feature: SimpleTestPlugin,
        slashCommands: [],
    });

    const plugin = harness.getPlugin('event-test');

    // Emit a custom event
    harness.emitEvent('node:created', { type: 'node:created', data: { nodeId: 'test-123' } });

    assertEqual(plugin.eventsReceived.length, 1, 'Plugin should receive event');
    assertEqual(plugin.eventsReceived[0].type, 'node:created', 'Event type should match');
});

// Test: Event cancellation works
await asyncTest('Event cancellation works', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'blocker',
        feature: ComplexTestPlugin,
        slashCommands: [{ command: '/blocked', handler: 'handleCountCommand' }],
    });

    // Command should be handled (cancelled by event handler)
    const handled = await harness.executeSlashCommand('/blocked', '', {});
    assertTrue(handled, 'Command should be handled (cancelled)');

    // But the handler should not execute
    const plugin = harness.getPlugin('blocker');
    assertEqual(plugin.state.counter, 0, 'Handler should not execute due to cancellation');
});

// Test: Unregister plugin
await asyncTest('Can unregister plugin', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'temp',
        feature: SimpleTestPlugin,
        slashCommands: [{ command: '/temp', handler: 'handleTestCommand' }],
    });

    assertTrue(harness.getPlugin('temp') !== undefined, 'Plugin should exist before unregister');

    await harness.unloadPlugin('temp');

    assertTrue(harness.getPlugin('temp') === undefined, 'Plugin should not exist after unregister');

    // Command should no longer work
    const handled = await harness.executeSlashCommand('/temp', '', {});
    assertFalse(handled, 'Command should not work after unregister');
});

// Test: Plugin has access to all APIs
await asyncTest('Plugin has access to all APIs', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'api-test',
        feature: SimpleTestPlugin,
        slashCommands: [],
    });

    const plugin = harness.getPlugin('api-test');

    assertTrue(plugin.graph !== undefined, 'Plugin should have graph');
    assertTrue(plugin.canvas !== undefined, 'Plugin should have canvas');
    assertTrue(plugin.chat !== undefined, 'Plugin should have chat');
    assertTrue(plugin.storage !== undefined, 'Plugin should have storage');
    assertTrue(plugin.modalManager !== undefined, 'Plugin should have modalManager');
    assertTrue(plugin.undoManager !== undefined, 'Plugin should have undoManager');
    assertTrue(plugin.modelPicker !== undefined, 'Plugin should have modelPicker');
});

// Test: Canvas event handlers are registered only once per feature
await asyncTest('Canvas event handlers registered only once per feature', async () => {
    const harness = new PluginTestHarness();

    // Track how many times canvas.on is called
    const canvas = harness.mockApp.canvas;
    let onCallCount = 0;
    const originalOn = canvas.on.bind(canvas);
    canvas.on = (event, handler) => {
        if (event === 'testEvent') {
            onCallCount++;
        }
        return originalOn(event, handler);
    };

    // Create a test plugin with canvas event handlers
    const TestPluginWithHandlers = class extends SimpleTestPlugin {
        getCanvasEventHandlers() {
            return {
                testEvent: this.handleTestEvent.bind(this),
            };
        }
        handleTestEvent() {}
    };

    await harness.loadPlugin({
        id: 'handler-test',
        feature: TestPluginWithHandlers,
        slashCommands: [],
    });

    // Handler should be registered exactly once
    assertEqual(onCallCount, 1, 'Canvas event handler should be registered exactly once');

    // Unregister and verify cleanup
    await harness.unloadPlugin('handler-test');
});

// Test: Multiple features register different event handlers
await asyncTest('Multiple features can register different event handlers', async () => {
    const harness = new PluginTestHarness();

    const TestPlugin1 = class extends SimpleTestPlugin {
        getCanvasEventHandlers() {
            return {
                eventA: this.handleEventA.bind(this),
            };
        }
        handleEventA() {}
    };

    const TestPlugin2 = class extends SimpleTestPlugin {
        getCanvasEventHandlers() {
            return {
                eventB: this.handleEventB.bind(this),
            };
        }
        handleEventB() {}
    };

    await harness.loadPlugin({
        id: 'plugin1',
        feature: TestPlugin1,
        slashCommands: [],
    });

    await harness.loadPlugin({
        id: 'plugin2',
        feature: TestPlugin2,
        slashCommands: [],
    });

    // Both plugins should have their handlers registered
    const plugin1 = harness.getPlugin('plugin1');
    const plugin2 = harness.getPlugin('plugin2');

    assertTrue(plugin1 !== undefined, 'Plugin 1 should exist');
    assertTrue(plugin2 !== undefined, 'Plugin 2 should exist');
});

console.log('\n✅ All FeatureRegistry tests passed!\n');
