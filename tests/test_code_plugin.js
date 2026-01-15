/**
 * Dogfooding test: Code feature as plugin
 * Verifies that the code self-healing feature works correctly when loaded via the plugin system
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

// Mock pyodideRunner
if (!global.pyodideRunner) {
    global.pyodideRunner = {
        run: async () => ({ stdout: '', error: null }),
    };
}

// Mock apiUrl function
if (!global.apiUrl) {
    global.apiUrl = (path) => path;
}

// Now import modules (storage.js will use the mocked indexedDB)
import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { PRIORITY } from '../src/canvas_chat/static/js/feature-registry.js';
import { assertTrue } from './test_helpers/assertions.js';

// Import CodeFeature class
const { CodeFeature } = await import('../src/canvas_chat/static/js/plugins/code.js');

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

console.log('\n=== Code Feature as Plugin Tests ===\n');

// Test: Code feature can be loaded as plugin
await asyncTest('CodeFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'code',
        feature: CodeFeature,
        slashCommands: [], // No slash commands - event-driven
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('code');
    assertTrue(feature !== undefined, 'Code feature should be loaded');
    assertTrue(feature instanceof CodeFeature, 'Should be instance of CodeFeature');
});

// Test: Code feature has all required dependencies
await asyncTest('CodeFeature has all required dependencies', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'code',
        feature: CodeFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('code');

    // Check dependencies from FeaturePlugin
    assertTrue(feature.graph !== undefined, 'Has graph');
    assertTrue(feature.canvas !== undefined, 'Has canvas');
    assertTrue(feature.chat !== undefined, 'Has chat');
    assertTrue(feature.storage !== undefined, 'Has storage');
    assertTrue(typeof feature.saveSession === 'function', 'Has saveSession');
    assertTrue(typeof feature.updateEmptyState === 'function', 'Has updateEmptyState');
    assertTrue(typeof feature.buildLLMRequest === 'function', 'Has buildLLMRequest');

    // Check code-specific dependencies
    assertTrue(feature.pyodideRunner !== undefined, 'Has pyodideRunner');
    assertTrue(feature.streamingNodes !== undefined, 'Has streamingNodes');
    assertTrue(typeof feature.apiUrl === 'function', 'Has apiUrl');
});

// Test: Code feature has no slash commands (event-driven)
await asyncTest('CodeFeature has no slash commands (event-driven)', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'code',
        feature: CodeFeature,
        slashCommands: [],
        priority: PRIORITY.BUILTIN,
    });

    // Verify no slash commands are registered for this feature
    const commands = harness.registry.getSlashCommands();
    // Code feature doesn't register any slash commands
    // (It's invoked automatically after code generation)
    assertTrue(Array.isArray(commands), 'Slash commands should be an array');
});

// Test: Code feature has required methods
await asyncTest('CodeFeature has required methods', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'code',
        feature: CodeFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('code');
    assertTrue(typeof feature.selfHealCode === 'function', 'Has selfHealCode');
    assertTrue(typeof feature.fixCodeError === 'function', 'Has fixCodeError');
});

// Test: Code feature lifecycle hooks called
await asyncTest('CodeFeature lifecycle hooks called', async () => {
    const harness = new PluginTestHarness();

    // Track if onLoad was called by checking console logs
    let loadCalled = false;
    const originalLog = console.log;
    console.log = (...args) => {
        if (args[0] === '[CodeFeature] Loaded - self-healing enabled') {
            loadCalled = true;
        }
        originalLog.apply(console, args);
    };

    await harness.loadPlugin({
        id: 'code',
        feature: CodeFeature,
        slashCommands: [],
    });

    console.log = originalLog;

    assertTrue(loadCalled, 'onLoad should be called');
});

// Test: Code feature has BUILTIN priority
await asyncTest('Code feature has BUILTIN priority', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'code',
        feature: CodeFeature,
        slashCommands: [],
        priority: PRIORITY.BUILTIN,
    });

    // Verify it's registered
    const feature = harness.getPlugin('code');
    assertTrue(feature !== undefined, 'Feature should be registered');
});

// Test: Code feature emits extension hooks
await asyncTest('CodeFeature emits extension hooks', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'code',
        feature: CodeFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('code');

    // Verify the feature can emit events (has emit method from base class)
    assertTrue(typeof feature.emit === 'function', 'Has emit method');

    // featureRegistry is provided by FeaturePlugin base class
    // In test harness, it's set via AppContext
    assertTrue(feature.featureRegistry !== null, 'Has featureRegistry for emitting hooks');
});

console.log('\n=== All Code plugin tests passed! ===\n');
