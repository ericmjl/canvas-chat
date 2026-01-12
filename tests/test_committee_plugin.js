/**
 * Dogfooding test: Committee feature as plugin
 * Verifies that the committee feature works correctly when loaded via the plugin system
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

// Import CommitteeFeature class only (not the module)
const { CommitteeFeature } = await import('../src/canvas_chat/static/js/committee.js');

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

function assertTrue(value, message) {
    if (!value) {
        throw new Error(message || 'Expected true, got false');
    }
}

console.log('\n=== Committee Feature as Plugin Tests ===\n');

// Test: Committee feature can be loaded as plugin
await asyncTest('CommitteeFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'committee',
        feature: CommitteeFeature,
        slashCommands: [
            {
                command: '/committee',
                handler: 'handleCommittee',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('committee');
    assertTrue(feature !== undefined, 'Committee feature should be loaded');
    assertTrue(feature instanceof CommitteeFeature, 'Should be instance of CommitteeFeature');
});

// Test: Committee feature has all required dependencies
await asyncTest('CommitteeFeature has all required dependencies', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'committee',
        feature: CommitteeFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('committee');

    // Check dependencies from FeaturePlugin
    assertTrue(feature.graph !== undefined, 'Has graph');
    assertTrue(feature.canvas !== undefined, 'Has canvas');
    assertTrue(feature.chat !== undefined, 'Has chat');
    assertTrue(feature.storage !== undefined, 'Has storage');
    assertTrue(feature.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(feature.chatInput !== undefined, 'Has chatInput');
    assertTrue(typeof feature.saveSession === 'function', 'Has saveSession');
    assertTrue(typeof feature.updateEmptyState === 'function', 'Has updateEmptyState');
    assertTrue(typeof feature.buildLLMRequest === 'function', 'Has buildLLMRequest');

    // Check committee-specific state
    assertTrue(feature._committeeData === null, 'Committee data initialized');
    assertTrue(feature._activeCommittee === null, 'Active committee initialized');
});

// Test: /committee slash command routes correctly
await asyncTest('/committee slash command routes to CommitteeFeature', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'committee',
        feature: CommitteeFeature,
        slashCommands: [
            {
                command: '/committee',
                handler: 'handleCommittee',
            },
        ],
    });

    // Mock localStorage
    if (!global.localStorage) {
        global.localStorage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
        };
    }

    // Mock document for modal interaction
    const mockModalElements = {
        'committee-question': { value: '' },
        'committee-models-grid': { innerHTML: '', appendChild: () => {} },
        'committee-chairman': { innerHTML: '', value: '', appendChild: () => {} },
        'committee-include-review': { checked: false },
        'committee-modal': { style: { display: 'none' } },
        'committee-models-count': { textContent: '', classList: { toggle: () => {}, add: () => {}, remove: () => {} } },
        'committee-execute-btn': { disabled: false },
    };

    if (!global.document) {
        global.document = {};
    }
    global.document.getElementById = (id) => mockModalElements[id] || null;
    global.document.querySelectorAll = () => [];
    global.document.createElement = (tag) => ({
        className: '',
        value: '',
        textContent: '',
        checked: false,
        type: '',
        addEventListener: () => {},
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {} },
        closest: () => null,
    });

    const handled = await harness.executeSlashCommand('/committee', 'What is AI?', {});
    assertTrue(handled, 'Command should be handled');

    const feature = harness.getPlugin('committee');
    assertTrue(feature._committeeData !== null, 'Committee data should be set');
    assertTrue(feature._committeeData.question === 'What is AI?', 'Question should be stored');
});

// Test: Committee feature has abort method
await asyncTest('CommitteeFeature has abort() method', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'committee',
        feature: CommitteeFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('committee');
    assertTrue(typeof feature.abort === 'function', 'Has abort method');
    assertTrue(typeof feature.isActive === 'function', 'Has isActive method');
    assertTrue(typeof feature.getModelDisplayName === 'function', 'Has getModelDisplayName method');
});

// Test: Committee feature lifecycle hooks called
await asyncTest('CommitteeFeature lifecycle hooks called', async () => {
    const harness = new PluginTestHarness();

    // Track if onLoad was called by checking console logs
    let loadCalled = false;
    const originalLog = console.log;
    console.log = (...args) => {
        if (args[0] === '[CommitteeFeature] Loaded') {
            loadCalled = true;
        }
        originalLog.apply(console, args);
    };

    await harness.loadPlugin({
        id: 'committee',
        feature: CommitteeFeature,
        slashCommands: [],
    });

    console.log = originalLog;

    assertTrue(loadCalled, 'onLoad should be called');
});

// Test: Committee command priority
await asyncTest('Committee command has BUILTIN priority', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'committee',
        feature: CommitteeFeature,
        slashCommands: [
            {
                command: '/committee',
                handler: 'handleCommittee',
                priority: PRIORITY.BUILTIN,
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    // Verify it's registered
    const commands = harness.registry.getSlashCommands();
    assertTrue(commands.includes('/committee'), 'Command should be registered');
});

// Test: Multiple committee features conflict detection
await asyncTest('Multiple committee registrations with same priority throw error', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'committee1',
        feature: CommitteeFeature,
        slashCommands: [
            {
                command: '/committee',
                handler: 'handleCommittee',
                priority: 100,
            },
        ],
    });

    let errorThrown = false;
    try {
        await harness.loadPlugin({
            id: 'committee2',
            feature: CommitteeFeature,
            slashCommands: [
                {
                    command: '/committee',
                    handler: 'handleCommittee',
                    priority: 100,
                },
            ],
        });
    } catch (error) {
        errorThrown = true;
        assertTrue(error.message.includes('Slash command conflict'), 'Should mention conflict');
    }

    assertTrue(errorThrown, 'Should throw error for duplicate command');
});

console.log('\n=== All Committee plugin tests passed! ===\n');
