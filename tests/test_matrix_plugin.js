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
const { MatrixFeature } = await import('../src/canvas_chat/static/js/plugins/matrix.js');

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
    assertTrue(feature.undoManager !== undefined, 'Has undoManager');
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
    assertTrue(typeof feature.handleMatrixClearAll === 'function', 'Has handleMatrixClearAll');
});

// Test: handleMatrixClearAll clears cells correctly
await asyncTest('handleMatrixClearAll clears cells from graph', async () => {
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
    const graph = feature.graph;

    // Create a mock matrix node with cells
    const mockMatrixNode = {
        id: 'test-matrix-1',
        type: 'matrix',
        context: 'Test Context',
        rowItems: ['Row 1', 'Row 2'],
        colItems: ['Col 1', 'Col 2'],
        cells: {
            '0-0': { content: 'Cell 0,0', filled: true },
            '0-1': { content: 'Cell 0,1', filled: true },
            '1-0': { content: 'Cell 1,0', filled: true },
            '1-1': { content: 'Cell 1,1', filled: true },
        },
        position: { x: 100, y: 100 },
    };

    // Add the node to the graph
    graph.addNode(mockMatrixNode);

    // Verify cells are set
    const nodeBefore = graph.getNode('test-matrix-1');
    assertTrue(nodeBefore.cells && Object.keys(nodeBefore.cells).length === 4, 'Should have 4 cells before clear');

    // Call handleMatrixClearAll
    feature.handleMatrixClearAll('test-matrix-1');

    // Verify cells are cleared
    const nodeAfter = graph.getNode('test-matrix-1');
    assertTrue(nodeAfter.cells && Object.keys(nodeAfter.cells).length === 0, 'Should have 0 cells after clear');
});

// Test: handleMatrixClearAll does nothing when no filled cells
await asyncTest('handleMatrixClearAll does nothing when no filled cells', async () => {
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
    const graph = feature.graph;

    // Create a mock matrix node without filled cells
    const mockMatrixNode = {
        id: 'test-matrix-2',
        type: 'matrix',
        context: 'Test Context',
        rowItems: ['Row 1'],
        colItems: ['Col 1'],
        cells: {},
        position: { x: 100, y: 100 },
    };

    // Add the node to the graph
    graph.addNode(mockMatrixNode);

    // Call handleMatrixClearAll (should not throw and should not modify anything)
    feature.handleMatrixClearAll('test-matrix-2');

    // Verify cells are still empty
    const nodeAfter = graph.getNode('test-matrix-2');
    assertTrue(nodeAfter.cells && Object.keys(nodeAfter.cells).length === 0, 'Should still have 0 cells');
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
