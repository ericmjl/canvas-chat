/**
 * Dogfooding test: Flashcard feature as plugin
 * Verifies that the flashcard feature works correctly when loaded via the plugin system
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
import { assertTrue, assertEqual } from './test_helpers/assertions.js';

// Import FlashcardFeature class
const { FlashcardFeature } = await import('../src/canvas_chat/static/js/plugins/flashcards.js');

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

console.log('\n=== Flashcard Feature as Plugin Tests ===\n');

// Test: Flashcard feature can be loaded as plugin
await asyncTest('FlashcardFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('flashcards');
    assertTrue(feature !== undefined, 'Flashcard feature should be loaded');
    assertTrue(feature instanceof FlashcardFeature, 'Should be instance of FlashcardFeature');
});

// Test: Flashcard feature has all required dependencies
await asyncTest('FlashcardFeature has all required dependencies', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('flashcards');

    // Check dependencies from FeaturePlugin
    assertTrue(feature.graph !== undefined, 'Has graph');
    assertTrue(feature.canvas !== undefined, 'Has canvas');
    assertTrue(feature.chat !== undefined, 'Has chat');
    assertTrue(feature.storage !== undefined, 'Has storage');
    assertTrue(feature.modelPicker !== undefined, 'Has modelPicker');
    assertTrue(typeof feature.saveSession === 'function', 'Has saveSession');
    assertTrue(typeof feature.updateEmptyState === 'function', 'Has updateEmptyState');
    assertTrue(typeof feature.buildLLMRequest === 'function', 'Has buildLLMRequest');

    // Check flashcard-specific state
    assertTrue(feature.reviewState === null, 'Review state initialized');
    assertTrue(feature.dueToastTimeout === null, 'Due toast timeout initialized');
});

// Test: Flashcard feature has required methods
await asyncTest('FlashcardFeature has required methods', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('flashcards');
    assertTrue(typeof feature.handleCreateFlashcards === 'function', 'Has handleCreateFlashcards');
    assertTrue(typeof feature.showReviewModal === 'function', 'Has showReviewModal');
    assertTrue(typeof feature.startFlashcardReview === 'function', 'Has startFlashcardReview');
    assertTrue(typeof feature.checkDueFlashcardsOnLoad === 'function', 'Has checkDueFlashcardsOnLoad');
    assertTrue(typeof feature.handleReviewSubmit === 'function', 'Has handleReviewSubmit');
    assertTrue(typeof feature.handleReviewNext === 'function', 'Has handleReviewNext');
    assertTrue(typeof feature.handleFlipCard === 'function', 'Has handleFlipCard');
});

// Test: Flashcard feature lifecycle hooks called
await asyncTest('FlashcardFeature lifecycle hooks called', async () => {
    const harness = new PluginTestHarness();

    // Track if onLoad was called by checking console logs
    let loadCalled = false;
    const originalLog = console.log;
    console.log = (...args) => {
        if (args[0] === '[FlashcardFeature] Loaded') {
            loadCalled = true;
        }
        originalLog.apply(console, args);
    };

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
    });

    console.log = originalLog;

    assertTrue(loadCalled, 'onLoad should be called');
});

// Test: Flashcard feature has BUILTIN priority
await asyncTest('Flashcard feature has BUILTIN priority', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
        priority: PRIORITY.BUILTIN,
    });

    // Verify it's registered
    const feature = harness.getPlugin('flashcards');
    assertTrue(feature !== undefined, 'Feature should be registered');
});

// Test: Flashcard feature doesn't register slash commands
await asyncTest('FlashcardFeature does not register slash commands', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
        priority: PRIORITY.BUILTIN,
    });

    // Verify no slash commands registered
    const commands = harness.registry.getSlashCommands();
    assertTrue(!commands.includes('/flashcards'), 'Should not register slash commands');
    assertTrue(!commands.includes('/review'), 'Should not register slash commands');
});

// Test: FlashcardFeature has correct canvas event handlers
await asyncTest('FlashcardFeature has correct canvas event handlers', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('flashcards');

    // Get canvas event handlers
    const handlers = feature.getCanvasEventHandlers();

    // Verify expected handlers exist
    assertTrue(typeof handlers.createFlashcards === 'function', 'Should have createFlashcards handler');
    assertTrue(typeof handlers.reviewCard === 'function', 'Should have reviewCard handler');
    assertTrue(typeof handlers.flipCard === 'function', 'Should have flipCard handler');
});

// Test: Flashcard handlers are registered once (regression test for duplicate handlers bug)
await asyncTest('Flashcard handlers registered exactly once (no duplicates)', async () => {
    const harness = new PluginTestHarness();

    // Track canvas.on calls for flashcard events
    const canvas = harness.mockApp.canvas;
    let createFlashcardsCount = 0;
    let reviewCardCount = 0;

    const originalOn = canvas.on.bind(canvas);
    canvas.on = (event, handler) => {
        if (event === 'createFlashcards') createFlashcardsCount++;
        if (event === 'reviewCard') reviewCardCount++;
        return originalOn(event, handler);
    };

    await harness.loadPlugin({
        id: 'flashcards',
        feature: FlashcardFeature,
        slashCommands: [],
    });

    // Each handler should be registered exactly once
    assertEqual(createFlashcardsCount, 1, 'createFlashcards should be registered once');
    assertEqual(reviewCardCount, 1, 'reviewCard should be registered once');
});

console.log('\n=== All Flashcard plugin tests passed! ===\n');
