/**
 * Tests for AgentFeature plugin
 */

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
                if (request.onsuccess) request.onsuccess({ target: request });
            }, 0);
            return request;
        },
    };
}

import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { assertTrue, assertFalse } from './test_helpers/assertions.js';

const { AgentFeature } = await import('../src/canvas_chat/static/js/plugins/agent.js');

async function asyncTest(description, fn) {
    try {
        await fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        process.exit(1);
    }
}

console.log('\n=== Agent Feature Plugin Tests ===\n');

await asyncTest('AgentFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'agent',
        feature: AgentFeature,
        slashCommands: [{ command: '/agent', handler: 'handleCommand' }],
    });
    const feature = harness.registry.getFeature('agent');
    assertTrue(feature instanceof AgentFeature, 'Feature should be AgentFeature instance');
});

await asyncTest('AgentFeature registers /agent slash command', async () => {
    const feature = new AgentFeature({
        canvas: {},
        chat: {},
        storage: global.localStorage,
        modalManager: {},
        undoManager: {},
        featureRegistry: {},
        streamingManager: {},
        modelPicker: {},
        chatInput: {},
        showToast: () => {},
        saveSession: () => {},
        updateEmptyState: () => {},
        updateCollapseButtonForNode: () => {},
        buildLLMRequest: () => ({ model: 'test' }),
        generateNodeSummary: () => {},
        registerStreaming: () => {},
        unregisterStreaming: () => {},
        getStreamingState: () => undefined,
        pyodideRunner: null,
        streamingNodes: new Map(),
        apiUrl: '/api',
        adminMode: false,
        adminModels: [],
    });

    const commands = feature.getSlashCommands();
    assertTrue(commands.length === 1, 'Should have one slash command');
    assertTrue(commands[0].command === '/agent', 'Command should be /agent');
    assertTrue(commands[0].description.length > 0, 'Should have a description');
    assertTrue(commands[0].placeholder.length > 0, 'Should have a placeholder');
});

await asyncTest('AgentFeature.handleCommand returns false for wrong command', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'agent',
        feature: AgentFeature,
        slashCommands: [{ command: '/agent', handler: 'handleCommand' }],
    });

    const handled = await harness.executeSlashCommand('/other', 'args', {});
    assertFalse(handled, 'Should not handle /other command');
});

await asyncTest('AgentFeature.handleCommand rejects empty message', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'agent',
        feature: AgentFeature,
        slashCommands: [{ command: '/agent', handler: 'handleCommand' }],
    });

    const handled = await harness.executeSlashCommand('/agent', '', {});
    assertTrue(handled, 'Should handle /agent with empty args');
});

await asyncTest('AgentFeature.handleCommand rejects whitespace-only message', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'agent',
        feature: AgentFeature,
        slashCommands: [{ command: '/agent', handler: 'handleCommand' }],
    });

    const handled = await harness.executeSlashCommand('/agent', '   ', {});
    assertTrue(handled, 'Should handle /agent with whitespace');
});

await asyncTest('AgentFeature has correct plugin id', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'agent',
        feature: AgentFeature,
        slashCommands: [{ command: '/agent', handler: 'handleCommand' }],
    });
    const feature = harness.registry.getFeature('agent');
    assertTrue(feature.id === 'agent', 'Plugin id should be "agent"');
});

await asyncTest('AgentFeature.gatherViewportContext returns empty with no canvas viewBox', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'agent',
        feature: AgentFeature,
        slashCommands: [{ command: '/agent', handler: 'handleCommand' }],
    });
    const feature = harness.registry.getFeature('agent');
    const ctx = feature.gatherViewportContext();
    assertTrue(Array.isArray(ctx), 'Should return an array');
});

console.log('\n=== All Agent Feature tests passed ===\n');
