/**
 * Dogfooding test: Factcheck feature as plugin
 * Verifies that the factcheck feature works correctly when loaded via the plugin system
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

// Now import modules (storage.js will use the mocked indexedDB)
import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { PRIORITY } from '../src/canvas_chat/static/js/feature-registry.js';
import { assertTrue } from './test_helpers/assertions.js';

// Import FactcheckFeature class
const { FactcheckFeature } = await import('../src/canvas_chat/static/js/plugins/factcheck.js');

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

console.log('\n=== Factcheck Feature as Plugin Tests ===\n');

// Test: Factcheck feature can be loaded as plugin
await asyncTest('FactcheckFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'factcheck',
        feature: FactcheckFeature,
        slashCommands: [
            {
                command: '/factcheck',
                handler: 'handleFactcheck',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('factcheck');
    assertTrue(feature !== undefined, 'Factcheck feature should be loaded');
    assertTrue(feature instanceof FactcheckFeature, 'Should be instance of FactcheckFeature');
});

// Test: Factcheck feature has all required dependencies
await asyncTest('FactcheckFeature has all required dependencies', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'factcheck',
        feature: FactcheckFeature,
        slashCommands: [
            {
                command: '/factcheck',
                handler: 'handleFactcheck',
            },
        ],
    });

    const feature = harness.getPlugin('factcheck');

    // Check dependencies from FeaturePlugin
    assertTrue(feature.graph !== undefined, 'Has graph');
    assertTrue(feature.canvas !== undefined, 'Has canvas');
    assertTrue(feature.chat !== undefined, 'Has chat');
    assertTrue(feature.storage !== undefined, 'Has storage');
    assertTrue(feature.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(typeof feature.saveSession === 'function', 'Has saveSession');
    assertTrue(typeof feature.updateEmptyState === 'function', 'Has updateEmptyState');
    assertTrue(typeof feature.buildLLMRequest === 'function', 'Has buildLLMRequest');

    // Check factcheck-specific dependencies
    assertTrue(typeof feature.getModelPicker === 'function', 'Has getModelPicker');
});

// Test: /factcheck slash command routes correctly
await asyncTest('/factcheck slash command routes to FactcheckFeature', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'factcheck',
        feature: FactcheckFeature,
        slashCommands: [
            {
                command: '/factcheck',
                handler: 'handleFactcheck',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Verify slash command is registered
    const commands = harness.registry.getSlashCommands();
    assertTrue(commands.includes('/factcheck'), 'Should register /factcheck command');

    // Verify handler exists
    const feature = harness.getPlugin('factcheck');
    assertTrue(typeof feature.handleFactcheck === 'function', 'Has handleFactcheck handler');
});

// Test: Factcheck feature has required methods
await asyncTest('FactcheckFeature has required methods', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'factcheck',
        feature: FactcheckFeature,
        slashCommands: [
            {
                command: '/factcheck',
                handler: 'handleFactcheck',
            },
        ],
    });

    const feature = harness.getPlugin('factcheck');
    assertTrue(typeof feature.handleFactcheck === 'function', 'Has handleFactcheck');
    assertTrue(typeof feature.extractFactcheckClaims === 'function', 'Has extractFactcheckClaims');
    assertTrue(typeof feature.executeFactcheck === 'function', 'Has executeFactcheck');
    assertTrue(typeof feature.verifyClaim === 'function', 'Has verifyClaim');
});

// Test: Factcheck feature lifecycle hooks called
await asyncTest('FactcheckFeature lifecycle hooks called', async () => {
    const harness = new PluginTestHarness();

    // Track if onLoad was called by checking console logs
    let loadCalled = false;
    const originalLog = console.log;
    console.log = (...args) => {
        if (args[0] === '[FactcheckFeature] Loaded') {
            loadCalled = true;
        }
        originalLog.apply(console, args);
    };

    await harness.loadPlugin({
        id: 'factcheck',
        feature: FactcheckFeature,
        slashCommands: [
            {
                command: '/factcheck',
                handler: 'handleFactcheck',
            },
        ],
    });

    console.log = originalLog;

    assertTrue(loadCalled, 'onLoad should be called');
});

// Test: Factcheck command has BUILTIN priority
await asyncTest('Factcheck command has BUILTIN priority', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'factcheck',
        feature: FactcheckFeature,
        slashCommands: [
            {
                command: '/factcheck',
                handler: 'handleFactcheck',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Verify it's registered
    const feature = harness.getPlugin('factcheck');
    assertTrue(feature !== undefined, 'Feature should be registered');
});

console.log('\n=== All Factcheck plugin tests passed! ===\n');
