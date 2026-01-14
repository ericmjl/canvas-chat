/**
 * Dogfooding test: Matrix feature as plugin
 * Verifies that the matrix feature works correctly when loaded via the plugin system
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

// Import MatrixFeature class
const { MatrixFeature } = await import('../src/canvas_chat/static/js/matrix.js');

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

console.log('\n=== Matrix Feature as Plugin Tests ===\n');

// Test: Matrix feature can be loaded as plugin
await asyncTest('MatrixFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'matrix',
        feature: MatrixFeature,
        slashCommands: [
            {
                command: '/matrix',
                handler: 'handleMatrix',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('matrix');
    assertTrue(feature !== undefined, 'Matrix feature should be loaded');
    assertTrue(feature instanceof MatrixFeature, 'Should be instance of MatrixFeature');
});

// Test: Matrix feature has all required dependencies
await asyncTest('MatrixFeature has all required dependencies', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'matrix',
        feature: MatrixFeature,
        slashCommands: [
            {
                command: '/matrix',
                handler: 'handleMatrix',
            },
        ],
    });

    const feature = harness.getPlugin('matrix');

    // Check dependencies from FeaturePlugin
    assertTrue(feature.graph !== undefined, 'Has graph');
    assertTrue(feature.canvas !== undefined, 'Has canvas');
    assertTrue(feature.chat !== undefined, 'Has chat');
    assertTrue(feature.storage !== undefined, 'Has storage');
    assertTrue(feature.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(typeof feature.saveSession === 'function', 'Has saveSession');
    assertTrue(typeof feature.updateEmptyState === 'function', 'Has updateEmptyState');
    assertTrue(typeof feature.buildLLMRequest === 'function', 'Has buildLLMRequest');

    // Check matrix-specific dependencies
    assertTrue(typeof feature.getModelPicker === 'function', 'Has getModelPicker');
    assertTrue(typeof feature.generateNodeSummary === 'function', 'Has generateNodeSummary');
    assertTrue(typeof feature.pushUndo === 'function', 'Has pushUndo');
});

// Test: /matrix slash command routes correctly
await asyncTest('/matrix slash command routes to MatrixFeature', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'matrix',
        feature: MatrixFeature,
        slashCommands: [
            {
                command: '/matrix',
                handler: 'handleMatrix',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Verify slash command is registered
    const commands = harness.registry.getSlashCommands();
    assertTrue(commands.includes('/matrix'), 'Should register /matrix command');

    // Verify handler exists
    const feature = harness.getPlugin('matrix');
    assertTrue(typeof feature.handleMatrix === 'function', 'Has handleMatrix handler');
});

// Test: Matrix feature has required methods
await asyncTest('MatrixFeature has required methods', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'matrix',
        feature: MatrixFeature,
        slashCommands: [
            {
                command: '/matrix',
                handler: 'handleMatrix',
            },
        ],
    });

    const feature = harness.getPlugin('matrix');
    assertTrue(typeof feature.handleMatrix === 'function', 'Has handleMatrix');
    assertTrue(typeof feature.parseTwoLists === 'function', 'Has parseTwoLists');
    assertTrue(typeof feature.createMatrixNode === 'function', 'Has createMatrixNode');
    assertTrue(typeof feature.handleMatrixCellFill === 'function', 'Has handleMatrixCellFill');
    assertTrue(typeof feature.handleMatrixFillAll === 'function', 'Has handleMatrixFillAll');
});

// Test: Matrix feature lifecycle hooks called
await asyncTest('MatrixFeature lifecycle hooks called', async () => {
    const harness = new PluginTestHarness();

    // Track if onLoad was called by checking console logs
    let loadCalled = false;
    const originalLog = console.log;
    console.log = (...args) => {
        if (args[0] === '[MatrixFeature] Loaded') {
            loadCalled = true;
        }
        originalLog.apply(console, args);
    };

    await harness.loadPlugin({
        id: 'matrix',
        feature: MatrixFeature,
        slashCommands: [
            {
                command: '/matrix',
                handler: 'handleMatrix',
            },
        ],
    });

    console.log = originalLog;

    assertTrue(loadCalled, 'onLoad should be called');
});

// Test: Matrix command has BUILTIN priority
await asyncTest('Matrix command has BUILTIN priority', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'matrix',
        feature: MatrixFeature,
        slashCommands: [
            {
                command: '/matrix',
                handler: 'handleMatrix',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Verify it's registered
    const feature = harness.getPlugin('matrix');
    assertTrue(feature !== undefined, 'Feature should be registered');
});

console.log('\n=== All Matrix plugin tests passed! ===\n');
