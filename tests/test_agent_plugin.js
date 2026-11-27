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
import { DEFAULT_SYSTEM_PROMPT } from '../src/canvas_chat/static/js/utils.js';

const { AgentFeature, combineAgentSystemPrompt } = await import('../src/canvas_chat/static/js/plugins/agent.js');

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

await asyncTest('combineAgentSystemPrompt prepends user prompt and keeps agent instructions', async () => {
    const combined = combineAgentSystemPrompt('Be terse.', 'You are a research assistant.');
    assertTrue(combined.startsWith('## User instructions\nBe terse.\n\n## Agent instructions\n'), 'Should prepend user section');
    assertTrue(combined.includes('You are a research assistant.'), 'Should keep agent instructions');
});

await asyncTest('combineAgentSystemPrompt falls back to default for blank user prompt', async () => {
    const combined = combineAgentSystemPrompt('  ', 'Agent body');
    assertTrue(combined.includes(DEFAULT_SYSTEM_PROMPT), 'Blank user prompt should use default');
    assertTrue(combined.includes('## Agent instructions\nAgent body'), 'Agent body should remain');
});

await asyncTest('AgentFeature.buildSystemPrompt includes user system prompt', async () => {
    const feature = new AgentFeature({
        canvas: {},
        chat: {},
        storage: { getSystemPrompt: () => 'Prefer tables.' },
        modalManager: {},
        undoManager: {},
        featureRegistry: { getSlashCommandsWithMetadata: () => [] },
        streamingManager: {},
        modelPicker: {},
        chatInput: {},
        showToast: () => {},
        saveSession: () => {},
        updateEmptyState: () => {},
        updateCollapseButtonForNode: () => {},
        buildLLMRequest: () => ({ model: 'test' }),
        generateNodeSummary: () => {},
        pyodideRunner: null,
        streamingNodes: new Map(),
        apiUrl: '/api',
        adminMode: false,
        adminModels: [],
    });
    const prompt = feature.buildSystemPrompt(feature.buildAgentTools());
    assertTrue(prompt.includes('Prefer tables.'), 'Should include configured system prompt');
    assertTrue(prompt.includes('You are a research assistant on a visual canvas.'), 'Should keep agent instructions');
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
    assertTrue(typeof ctx === 'object', 'Should return an object');
    assertTrue(Array.isArray(ctx.nodes), 'Should have a nodes array');
    assertTrue(Array.isArray(ctx.available_tags), 'Should have an available_tags array');
    assertTrue(Array.isArray(ctx.available_colors), 'Should have an available_colors array');
    const toolNames = feature.buildAgentTools().map((tool) => tool.function.name);
    assertTrue(toolNames.includes('tag_node'), 'Agent tools should include tag_node');
});

console.log('\n=== All Agent Feature tests passed ===\n');
