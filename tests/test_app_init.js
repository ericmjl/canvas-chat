/**
 * Integration test to verify App class initializes without errors.
 *
 * This test catches issues like:
 * - Undefined method references (e.g., this.handleX.bind(this) when handleX doesn't exist)
 * - Missing dependencies
 * - Initialization errors
 *
 * Run with: node tests/test_app_init.js
 */

import { JSDOM } from 'jsdom';

// Create a minimal DOM environment
const dom = new JSDOM(
    `<!DOCTYPE html>
<html><body>
    <svg id="canvas-svg">
        <g id="edges-layer"></g>
        <g id="nodes-layer"></g>
    </svg>
    <div id="canvas-container"></div>
    <input id="chat-input" />
    <div id="model-picker"></div>
    <button id="clear-btn"></button>
    <button id="search-btn"></button>
    <button id="settings-btn"></button>
    <button id="help-btn"></button>
    <button id="sessions-btn"></button>
    <button id="undo-btn"></button>
    <button id="redo-btn"></button>
    <div id="settings-modal" style="display: none;"></div>
    <div id="help-modal" style="display: none;"></div>
    <div id="session-modal" style="display: none;"></div>
    <div id="edit-content-modal" style="display: none;"></div>
    <div id="edit-title-modal" style="display: none;"></div>
    <div id="code-editor-modal" style="display: none;"></div>
</body></html>`,
    {
        url: 'http://localhost',
        pretendToBeVisual: true,
        resources: 'usable',
    }
);

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
};
global.indexedDB = {
    open: () => ({
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
    }),
};

// Mock Yjs
global.Y = {
    Doc: class {
        constructor() {
            this.clientID = 1;
        }
        getMap() {
            return new Map();
        }
        getText() {
            return { toString: () => '' };
        }
    },
    Map: class extends Map {},
    Text: class {
        toString() {
            return '';
        }
    },
    Array: class extends Array {},
};
global.IndexeddbPersistence = class {};
global.WebrtcProvider = class {};

// Mock Papa (CSV parser)
global.Papa = {
    parse: () => ({ data: [], errors: [] }),
};

// Mock pyodideRunner
global.pyodideRunner = {
    runPython: () => Promise.resolve({ result: '', output: '', error: null }),
};

// Mock marked
global.marked = {
    parse: (text) => text,
    use: () => {},
};

// Import all modules using ES imports
const { App } = await import('../src/canvas_chat/static/js/app.js');

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        if (err.stack) {
            console.log(`  Stack: ${err.stack.split('\n').slice(0, 3).join('\n')}`);
        }
        failed++;
    }
}

// Test that App class can be instantiated without errors
test('App class can be instantiated', () => {
    // This will fail if:
    // - Methods are undefined (e.g., this.handleX.bind(this) when handleX doesn't exist)
    // - Dependencies are missing
    // - Constructor throws errors

    // Prevent init() from running (it needs full DOM setup)
    // We only want to test that the constructor doesn't throw
    const originalInit = App.prototype.init;
    App.prototype.init = async () => {}; // No-op for testing

    try {
        const app = new App();

        // Verify key properties exist (these are set in constructor before init())
        if (!app.modalManager) throw new Error('app.modalManager is undefined');
        if (!app.fileUploadHandler) throw new Error('app.fileUploadHandler is undefined');
        if (!app.undoManager) throw new Error('app.undoManager is undefined');
        if (!app.slashCommandMenu) throw new Error('app.slashCommandMenu is undefined');
    } finally {
        // Restore original init
        App.prototype.init = originalInit;
    }
});

// Test that event listener bindings don't reference undefined methods
// This catches errors like: this.handleX.bind(this) when handleX doesn't exist
test('App event listener methods exist', () => {
    // Create a mock app instance
    const app = new App();

    // Direct methods that should exist on App instance
    const requiredMethods = [
        'handleNodeSelect',
        'handleNodeDelete',
        // Note: handleNodeStopGeneration and handleNodeContinueGeneration migrated
        // These methods are now handled by StreamingManager via canvas events
        // Note: handleNodeAnalyze migrated to CSV node protocol
        // CSV nodes now handle "Analyze" button via CsvNode.analyze()
        'handleNodeCollapse',
        'handleCreateFlashcards',
        'handleFlipCard',
        'reviewSingleCard',
        'handleNodeRunCode',
        'handleNodeCodeChange',
        'handleCode',
        'handleSend',
        'undo',
        'redo',
        'handleSearch',
        // Note: selfHealCode and fixCodeError migrated to CodeFeature
        // These methods are now accessed via this.featureRegistry.getFeature('code')
    ];

    for (const methodName of requiredMethods) {
        if (typeof app[methodName] !== 'function') {
            throw new Error(`Method ${methodName} is not a function on App instance`);
        }
    }

    // Delegated methods (moved to other classes) - verify they exist on the target
    const delegatedMethods = {
        handleNodeTitleEdit: 'modalManager.handleNodeTitleEdit',
        handleNodeEditContent: 'modalManager.handleNodeEditContent',
        handleNodeEditCode: 'modalManager.handleNodeEditCode',
        handlePdfDrop: 'fileUploadHandler.handlePdfDrop',
        handleImageDrop: 'fileUploadHandler.handleImageDrop',
        handleCsvDrop: 'fileUploadHandler.handleCsvDrop',
    };

    for (const [methodName, target] of Object.entries(delegatedMethods)) {
        const [targetName, targetMethod] = target.split('.');
        if (typeof app[targetName]?.[targetMethod] !== 'function') {
            throw new Error(`Delegated method ${methodName} -> ${target} is not a function`);
        }
    }
});

// Test: Setup canvas event listeners doesn't reference undefined methods
test('setupCanvasEventListeners .bind(this) references exist', async () => {
    // Read the app.js source code using dynamic import
    const fs = await import('fs');
    const appSource = fs.readFileSync('src/canvas_chat/static/js/app.js', 'utf-8');

    // Find the setupCanvasEventListeners method
    const methodMatch = appSource.match(/setupCanvasEventListeners\(\)[^{]*\{([^]*?)\n    \/\*\*[^]*?\n    \/\/ \*\//);
    if (!methodMatch) {
        throw new Error('Could not find setupCanvasEventListeners method');
    }

    const methodBody = methodMatch[1];

    // Find all .bind(this) calls
    const bindMatches = methodBody.match(/this\.(\w+)\.bind\(this\)/g);

    if (bindMatches) {
        for (const match of bindMatches) {
            const methodName = match.match(/this\.(\w+)\.bind/)[1];
            if (typeof app[methodName] !== 'function') {
                throw new Error(`setupCanvasEventListeners references undefined method: ${methodName}`);
            }
        }
    }
});

// Test: Verify registerFeatureCanvasHandlers was removed (prevent duplicate handler registration)
test('registerFeatureCanvasHandlers method removed (fixes duplicate handlers)', async () => {
    // Read the app.js source code
    const fs = await import('fs');
    const appSource = fs.readFileSync('src/canvas_chat/static/js/app.js', 'utf-8');

    // Verify the method doesn't exist
    if (appSource.includes('registerFeatureCanvasHandlers')) {
        throw new Error(
            'registerFeatureCanvasHandlers should be removed to prevent duplicate canvas event handler registration'
        );
    }

    // Also verify initializePluginSystem doesn't call it
    const initMatch = appSource.match(/async initializePluginSystem\(\)[^{]*\{([^]*?)\n    \}/);
    if (initMatch) {
        const initBody = initMatch[1];
        if (initBody.includes('registerFeatureCanvasHandlers')) {
            throw new Error('initializePluginSystem should not call registerFeatureCanvasHandlers');
        }
    }
});

// Print results
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
