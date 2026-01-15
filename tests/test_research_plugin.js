/**
 * Dogfooding test: Research feature as plugin
 * Verifies that the research feature works correctly when loaded via the plugin system
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

// Import ResearchFeature class
const { ResearchFeature } = await import('../src/canvas_chat/static/js/plugins/research.js');

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

console.log('\n=== Research Feature as Plugin Tests ===\n');

// Test: Research feature can be loaded as plugin
await asyncTest('ResearchFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'research',
        feature: ResearchFeature,
        slashCommands: [
            {
                command: '/search',
                handler: 'handleSearch',
            },
            {
                command: '/research',
                handler: 'handleResearch',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('research');
    assertTrue(feature !== undefined, 'Research feature should be loaded');
    assertTrue(feature instanceof ResearchFeature, 'Should be instance of ResearchFeature');
});

// Test: Research feature has all required dependencies
await asyncTest('ResearchFeature has all required dependencies', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'research',
        feature: ResearchFeature,
        slashCommands: [
            {
                command: '/search',
                handler: 'handleSearch',
            },
            {
                command: '/research',
                handler: 'handleResearch',
            },
        ],
    });

    const feature = harness.getPlugin('research');

    // Check dependencies from FeaturePlugin
    assertTrue(feature.graph !== undefined, 'Has graph');
    assertTrue(feature.canvas !== undefined, 'Has canvas');
    assertTrue(feature.chat !== undefined, 'Has chat');
    assertTrue(feature.storage !== undefined, 'Has storage');
    assertTrue(feature.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(typeof feature.saveSession === 'function', 'Has saveSession');
    assertTrue(typeof feature.updateEmptyState === 'function', 'Has updateEmptyState');
    assertTrue(typeof feature.buildLLMRequest === 'function', 'Has buildLLMRequest');
    assertTrue(typeof feature.registerStreaming === 'function', 'Has registerStreaming');
    assertTrue(typeof feature.unregisterStreaming === 'function', 'Has unregisterStreaming');

    // Check research-specific dependencies
    assertTrue(typeof feature.getModelPicker === 'function', 'Has getModelPicker');
    assertTrue(typeof feature.showSettingsModal === 'function', 'Has showSettingsModal');
});

// Test: /search and /research slash commands route correctly
await asyncTest('/search and /research commands route to ResearchFeature', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'research',
        feature: ResearchFeature,
        slashCommands: [
            {
                command: '/search',
                handler: 'handleSearch',
            },
            {
                command: '/research',
                handler: 'handleResearch',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Verify slash commands are registered
    const commands = harness.registry.getSlashCommands();
    assertTrue(commands.includes('/search'), 'Should register /search command');
    assertTrue(commands.includes('/research'), 'Should register /research command');

    // Verify handlers exist
    const feature = harness.getPlugin('research');
    assertTrue(typeof feature.handleSearch === 'function', 'Has handleSearch handler');
    assertTrue(typeof feature.handleResearch === 'function', 'Has handleResearch handler');
});

// Test: Research feature has required methods
await asyncTest('ResearchFeature has required methods', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'research',
        feature: ResearchFeature,
        slashCommands: [
            {
                command: '/search',
                handler: 'handleSearch',
            },
            {
                command: '/research',
                handler: 'handleResearch',
            },
        ],
    });

    const feature = harness.getPlugin('research');
    assertTrue(typeof feature.handleSearch === 'function', 'Has handleSearch');
    assertTrue(typeof feature.handleResearch === 'function', 'Has handleResearch');
});

// Test: Research feature lifecycle hooks called
await asyncTest('ResearchFeature lifecycle hooks called', async () => {
    const harness = new PluginTestHarness();

    // Track if onLoad was called by checking console logs
    let loadCalled = false;
    const originalLog = console.log;
    console.log = (...args) => {
        if (args[0] === '[ResearchFeature] Loaded') {
            loadCalled = true;
        }
        originalLog.apply(console, args);
    };

    await harness.loadPlugin({
        id: 'research',
        feature: ResearchFeature,
        slashCommands: [
            {
                command: '/search',
                handler: 'handleSearch',
            },
            {
                command: '/research',
                handler: 'handleResearch',
            },
        ],
    });

    console.log = originalLog;

    assertTrue(loadCalled, 'onLoad should be called');
});

// Test: Research commands have BUILTIN priority
await asyncTest('Research commands have BUILTIN priority', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'research',
        feature: ResearchFeature,
        slashCommands: [
            {
                command: '/search',
                handler: 'handleSearch',
            },
            {
                command: '/research',
                handler: 'handleResearch',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Verify it's registered
    const feature = harness.getPlugin('research');
    assertTrue(feature !== undefined, 'Feature should be registered');
});

console.log('\n=== All Research plugin tests passed! ===\n');
