/**
 * Tests for FeaturePlugin base class and Plugin Events
 */

import { FeaturePlugin } from '../src/canvas_chat/static/js/feature-plugin.js';
import { CanvasEvent, CancellableEvent } from '../src/canvas_chat/static/js/plugin-events.js';
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

console.log('\n=== CanvasEvent Tests ===\n');

// Test: Create CanvasEvent
test('CanvasEvent can be created', () => {
    const event = new CanvasEvent('test:event', { foo: 'bar' });
    assertEqual(event.type, 'test:event', 'Event type');
    assertEqual(event.data.foo, 'bar', 'Event data');
    assertTrue(event.timestamp > 0, 'Timestamp should be set');
});

// Test: Create CancellableEvent
test('CancellableEvent can be created', () => {
    const event = new CancellableEvent('test:before', { action: 'delete' });
    assertEqual(event.type, 'test:before', 'Event type');
    assertEqual(event.data.action, 'delete', 'Event data');
    assertFalse(event.cancelled, 'Should not be cancelled initially');
    assertTrue(event.reason === null, 'Reason should be null initially');
});

// Test: CancellableEvent preventDefault
test('CancellableEvent preventDefault works', () => {
    const event = new CancellableEvent('command:before', {});
    assertFalse(event.cancelled, 'Not cancelled initially');

    event.preventDefault('User not authorized');

    assertTrue(event.cancelled, 'Should be cancelled after preventDefault');
    assertEqual(event.reason, 'User not authorized', 'Reason should be set');
});

// Test: CancellableEvent extends CanvasEvent
test('CancellableEvent extends CanvasEvent', () => {
    const event = new CancellableEvent('test:event', {});
    assertTrue(event instanceof CancellableEvent, 'Is CancellableEvent');
    assertTrue(event instanceof CanvasEvent, 'Is also CanvasEvent');
    assertTrue(event.timestamp > 0, 'Has CanvasEvent properties');
});

console.log('\n=== FeaturePlugin Tests ===\n');

// Test: FeaturePlugin receives all dependencies
await asyncTest('FeaturePlugin receives all dependencies via AppContext', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        constructor(context) {
            super(context);
        }
    }

    await harness.loadPlugin({
        id: 'test-deps',
        feature: TestPlugin,
        slashCommands: [],
    });

    const plugin = harness.getPlugin('test-deps');

    // Check all dependencies are injected
    assertTrue(plugin.graph !== undefined, 'Has graph');
    assertTrue(plugin.canvas !== undefined, 'Has canvas');
    assertTrue(plugin.chat !== undefined, 'Has chat');
    assertTrue(plugin.storage !== undefined, 'Has storage');
    assertTrue(plugin.modalManager !== undefined, 'Has modalManager');
    assertTrue(plugin.undoManager !== undefined, 'Has undoManager');
    assertTrue(plugin.searchIndex !== undefined, 'Has searchIndex');
    assertTrue(plugin.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(plugin.chatInput !== undefined, 'Has chatInput');

    // Check helper methods
    assertTrue(typeof plugin.saveSession === 'function', 'Has saveSession method');
    assertTrue(typeof plugin.updateEmptyState === 'function', 'Has updateEmptyState method');
    assertTrue(typeof plugin.buildLLMRequest === 'function', 'Has buildLLMRequest method');

    // Check streaming methods
    assertTrue(typeof plugin.registerStreaming === 'function', 'Has registerStreaming method');
    assertTrue(typeof plugin.unregisterStreaming === 'function', 'Has unregisterStreaming method');
    assertTrue(typeof plugin.getStreamingState === 'function', 'Has getStreamingState method');
});

// Test: FeaturePlugin lifecycle hooks
await asyncTest('FeaturePlugin lifecycle hooks are called', async () => {
    const harness = new PluginTestHarness();
    let loadCalled = false;
    let unloadCalled = false;

    class TestPlugin extends FeaturePlugin {
        async onLoad() {
            loadCalled = true;
        }

        async onUnload() {
            unloadCalled = true;
        }
    }

    await harness.loadPlugin({
        id: 'test-lifecycle',
        feature: TestPlugin,
        slashCommands: [],
    });

    assertTrue(loadCalled, 'onLoad should be called');
    assertFalse(unloadCalled, 'onUnload should not be called yet');

    await harness.unloadPlugin('test-lifecycle');

    assertTrue(unloadCalled, 'onUnload should be called');
});

// Test: FeaturePlugin getEventSubscriptions default
await asyncTest('FeaturePlugin getEventSubscriptions returns empty object by default', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {}

    await harness.loadPlugin({
        id: 'test-events-default',
        feature: TestPlugin,
        slashCommands: [],
    });

    const plugin = harness.getPlugin('test-events-default');
    const subscriptions = plugin.getEventSubscriptions();

    assertTrue(typeof subscriptions === 'object', 'Returns an object');
    assertEqual(Object.keys(subscriptions).length, 0, 'Default is empty object');
});

// Test: FeaturePlugin can subscribe to events
await asyncTest('FeaturePlugin can subscribe to events', async () => {
    const harness = new PluginTestHarness();
    const receivedEvents = [];

    class TestPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'test:event': this.handleTestEvent.bind(this),
            };
        }

        handleTestEvent(event) {
            receivedEvents.push(event);
        }
    }

    await harness.loadPlugin({
        id: 'test-event-sub',
        feature: TestPlugin,
        slashCommands: [],
    });

    // Emit an event
    const event = new CanvasEvent('test:event', { data: 'hello' });
    harness.emitEvent('test:event', event);

    assertEqual(receivedEvents.length, 1, 'Event should be received');
    assertEqual(receivedEvents[0].data.data, 'hello', 'Event data should match');
});

// Test: FeaturePlugin can access helper methods
await asyncTest('FeaturePlugin can call helper methods', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        async testHelpers() {
            this.saveSession();
            this.updateEmptyState();
            const request = this.buildLLMRequest({ messages: ['test'] });
            return request;
        }
    }

    await harness.loadPlugin({
        id: 'test-helpers',
        feature: TestPlugin,
        slashCommands: [],
    });

    const plugin = harness.getPlugin('test-helpers');
    const request = await plugin.testHelpers();

    // Check method calls were tracked
    assertEqual(harness.mockApp.methodCalls.saveSession.length, 1, 'saveSession called');
    assertEqual(harness.mockApp.methodCalls.updateEmptyState.length, 1, 'updateEmptyState called');
    assertEqual(harness.mockApp.methodCalls.buildLLMRequest.length, 1, 'buildLLMRequest called');

    // Check request structure
    assertTrue(request.messages !== undefined, 'Request has messages');
    assertTrue(request.model !== undefined, 'Request has model');
});

// Test: FeaturePlugin can manage streaming state
await asyncTest('FeaturePlugin can manage streaming state', async () => {
    const harness = new PluginTestHarness();

    class TestPlugin extends FeaturePlugin {
        async testStreaming() {
            const abortController = new AbortController();
            const nodeId = 'test-node-123';

            // Register streaming
            this.registerStreaming(nodeId, abortController, { test: 'context' });

            // Get state
            const state = this.getStreamingState(nodeId);

            // Unregister
            this.unregisterStreaming(nodeId);

            return { state, finalState: this.getStreamingState(nodeId) };
        }
    }

    await harness.loadPlugin({
        id: 'test-streaming',
        feature: TestPlugin,
        slashCommands: [],
    });

    const plugin = harness.getPlugin('test-streaming');
    const { state, finalState } = await plugin.testStreaming();

    assertTrue(state !== undefined, 'State should be retrieved');
    assertTrue(state.abortController !== undefined, 'State has abortController');
    assertEqual(state.context.test, 'context', 'State has context');
    assertTrue(finalState === undefined, 'State should be undefined after unregister');
});

// Test: AppContext encapsulates app instance properly
test('AppContext encapsulates app instance', () => {
    const harness = new PluginTestHarness();
    const appContext = harness.appContext;

    // Check that all expected properties are present
    assertTrue(appContext.graph !== undefined, 'Has graph');
    assertTrue(appContext.canvas !== undefined, 'Has canvas');
    assertTrue(appContext.chat !== undefined, 'Has chat');
    assertTrue(appContext.storage !== undefined, 'Has storage');
    assertTrue(appContext.modalManager !== undefined, 'Has modalManager');
    assertTrue(appContext.undoManager !== undefined, 'Has undoManager');
    assertTrue(appContext.searchIndex !== undefined, 'Has searchIndex');
    assertTrue(appContext.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(appContext.chatInput !== undefined, 'Has chatInput');

    // Check admin mode access
    assertFalse(appContext.adminMode, 'Admin mode is accessible');
    assertTrue(Array.isArray(appContext.adminModels), 'Admin models is accessible');
});

console.log('\n=== All FeaturePlugin and Event tests passed! ===\n');
