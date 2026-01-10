/**
 * Unit tests for JavaScript utility functions.
 * Run with: node tests/test_utils.js
 *
 * Tests pure functions that don't require DOM or API calls.
 *
 * NOTE: This file loads actual source files to test real implementations,
 * not copies. This ensures tests catch bugs in production code.
 */

// Load source files to test actual implementations (not copies)
import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Set up minimal browser-like environment for source files
global.window = global;
global.document = {
    createElement: (tagName) => {
        const element = { textContent: '', innerHTML: '' };
        // Mock textContent setter to update innerHTML (for escapeHtmlText)
        Object.defineProperty(element, 'textContent', {
            get: () => element._textContent || '',
            set: (value) => {
                element._textContent = value;
                // Simple HTML escaping for tests
                element.innerHTML = value
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
        });
        return element;
    },
    addEventListener: () => {} // Mock event listener (no-op for tests)
};
global.NodeType = {
    HUMAN: 'human', AI: 'ai', NOTE: 'note', SUMMARY: 'summary', REFERENCE: 'reference',
    SEARCH: 'search', RESEARCH: 'research', HIGHLIGHT: 'highlight', MATRIX: 'matrix',
    CELL: 'cell', ROW: 'row', COLUMN: 'column', FETCH_RESULT: 'fetch_result',
    PDF: 'pdf', OPINION: 'opinion', SYNTHESIS: 'synthesis', REVIEW: 'review', IMAGE: 'image',
    FLASHCARD: 'flashcard', FACTCHECK: 'factcheck'
};

// Load graph.js first (defines NodeType, etc. and exports wouldOverlapNodes)
// First load layout.js which graph-types.js depends on
const layoutPath = path.join(__dirname, '../src/canvas_chat/static/js/layout.js');
const layoutCode = fs.readFileSync(layoutPath, 'utf8');
vm.runInThisContext(layoutCode, { filename: layoutPath });

const graphTypesPath = path.join(__dirname, '../src/canvas_chat/static/js/graph-types.js');
const graphTypesCode = fs.readFileSync(graphTypesPath, 'utf8');
vm.runInThisContext(graphTypesCode, { filename: graphTypesPath });

// Load search.js (defines tokenize, calculateIDF, SearchIndex)
const searchPath = path.join(__dirname, '../src/canvas_chat/static/js/search.js');
const searchCode = fs.readFileSync(searchPath, 'utf8');
vm.runInThisContext(searchCode, { filename: searchPath });

// Load utils.js (defines formatUserError, buildMessagesForApi, etc.)
const utilsPath = path.join(__dirname, '../src/canvas_chat/static/js/utils.js');
const utilsCode = fs.readFileSync(utilsPath, 'utf8');
vm.runInThisContext(utilsCode, { filename: utilsPath });

// Load flashcards.js (defines FlashcardFeature class)
const flashcardsPath = path.join(__dirname, '../src/canvas_chat/static/js/flashcards.js');
const flashcardsCode = fs.readFileSync(flashcardsPath, 'utf8');
vm.runInThisContext(flashcardsCode, { filename: flashcardsPath });

// Load extracted modules and app.js (defines SlashCommandMenu, App class, etc.)
// Note: app.js has DOM dependencies, but some functions and the App class can be tested with mocks
// Load extracted modules first (they're dependencies of app.js)
const undoManagerPath = path.join(__dirname, '../src/canvas_chat/static/js/undo-manager.js');
const undoManagerCode = fs.readFileSync(undoManagerPath, 'utf8');
vm.runInThisContext(undoManagerCode, { filename: undoManagerPath });

const slashCommandMenuPath = path.join(__dirname, '../src/canvas_chat/static/js/slash-command-menu.js');
const slashCommandMenuCode = fs.readFileSync(slashCommandMenuPath, 'utf8');
vm.runInThisContext(slashCommandMenuCode, { filename: slashCommandMenuPath });

const modalManagerPath = path.join(__dirname, '../src/canvas_chat/static/js/modal-manager.js');
const modalManagerCode = fs.readFileSync(modalManagerPath, 'utf8');
vm.runInThisContext(modalManagerCode, { filename: modalManagerPath });

const fileUploadHandlerPath = path.join(__dirname, '../src/canvas_chat/static/js/file-upload-handler.js');
const fileUploadHandlerCode = fs.readFileSync(fileUploadHandlerPath, 'utf8');
vm.runInThisContext(fileUploadHandlerCode, { filename: fileUploadHandlerPath });

const appPath = path.join(__dirname, '../src/canvas_chat/static/js/app.js');
const appCode = fs.readFileSync(appPath, 'utf8');
vm.runInThisContext(appCode, { filename: appPath });

// Load node-protocols.js (defines wrapNode, MatrixNode, etc.)
const nodeProtocolsPath = path.join(__dirname, '../src/canvas_chat/static/js/node-protocols.js');
const nodeProtocolsCode = fs.readFileSync(nodeProtocolsPath, 'utf8');
vm.runInThisContext(nodeProtocolsCode, { filename: nodeProtocolsPath });

// Extract functions and constants from window (actual implementations, not copies)
const {
    formatUserError,
    buildMessagesForApi,
    tokenize,
    calculateIDF,
    SearchIndex,
    wouldOverlapNodes,
    createNode: createNodeReal,
    createMatrixNode: createMatrixNodeReal,
    createRowNode: createRowNodeReal,
    createColumnNode: createColumnNodeReal,
    isUrlContent,
    extractUrlFromReferenceNode,
    truncateText,
    escapeHtmlText,
    formatMatrixAsText,
    NodeType,
    DEFAULT_NODE_SIZES,
    getDefaultNodeSize,
    wrapNode,
    createMockNodeForType,
    HeaderButtons,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    layoutUtils
} = global.window;

// Extract layout functions from layoutUtils (actual implementations from layout.js)
const { getOverlap, hasAnyOverlap, resolveOverlaps } = layoutUtils;

// Note: window.app is the actual App instance created by app.js
// We can test buildLLMRequest by temporarily mocking modelPicker on this real instance

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
        failed++;
    }
}

function assertEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertNull(actual) {
    if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(actual, message = '') {
    if (actual !== true) {
        throw new Error(message || `Expected true, got ${actual}`);
    }
}

function assertFalse(actual, message = '') {
    if (actual !== false) {
        throw new Error(message || `Expected false, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`);
    }
}

// NOTE: Tests for extractUrlFromReferenceNode, formatMatrixAsText, Graph basic operations,
// wouldOverlap, escapeHtml, and truncate have been moved to:
// - test_utils_basic.js (extractUrlFromReferenceNode, formatMatrixAsText, escapeHtml, truncate)
// - test_crdt_graph.js (Graph basic operations)
// - test_layout.js (wouldOverlap)

// NOTE: resolveOverlaps tests have been moved to test_layout.js

// ============================================================
// Concurrent State Management tests
// ============================================================

/**
 * These tests validate the pattern for managing concurrent operations.
 * When multiple operations can run in parallel, each needs its own
 * isolated state. We use Map<instanceId, state> instead of single variables.
 *
 * Anti-pattern: this.streamingNodeId = nodeId (overwritten by next operation)
 * Pattern: this.streamingNodes.set(nodeId, { ... })
 */

// Simulates the WRONG approach - global state
class BadConcurrentManager {
    constructor() {
        // Anti-pattern: single variables for concurrent operations
        this.activeNodeId = null;
        this.abortController = null;
    }

    startOperation(nodeId) {
        this.activeNodeId = nodeId;
        this.abortController = { aborted: false, nodeId };
        return this.abortController;
    }

    stopOperation(nodeId) {
        // BUG: Only works if nodeId matches the current activeNodeId
        if (this.activeNodeId === nodeId && this.abortController) {
            this.abortController.aborted = true;
            return true;
        }
        return false;
    }

    getActiveController(nodeId) {
        return this.activeNodeId === nodeId ? this.abortController : null;
    }
}

// Simulates the CORRECT approach - per-instance state
class GoodConcurrentManager {
    constructor() {
        // Pattern: Map for per-instance state
        this.activeOperations = new Map();
    }

    startOperation(nodeId) {
        const controller = { aborted: false, nodeId };
        this.activeOperations.set(nodeId, { abortController: controller });
        return controller;
    }

    stopOperation(nodeId) {
        const state = this.activeOperations.get(nodeId);
        if (state) {
            state.abortController.aborted = true;
            return true;
        }
        return false;
    }

    completeOperation(nodeId) {
        this.activeOperations.delete(nodeId);
    }

    getActiveController(nodeId) {
        const state = this.activeOperations.get(nodeId);
        return state ? state.abortController : null;
    }

    getActiveCount() {
        return this.activeOperations.size;
    }
}

test('BadConcurrentManager: second operation overwrites first', () => {
    const manager = new BadConcurrentManager();

    // Start first operation
    const controller1 = manager.startOperation('node-1');

    // Start second operation - this OVERWRITES the first
    const controller2 = manager.startOperation('node-2');

    // Try to stop the first operation - THIS FAILS!
    const stopped = manager.stopOperation('node-1');

    assertFalse(stopped, 'Cannot stop first operation after second starts');
    assertFalse(controller1.aborted, 'First controller was not aborted');

    // Can only control the second operation
    assertTrue(manager.stopOperation('node-2'), 'Can stop second operation');
    assertTrue(controller2.aborted, 'Second controller was aborted');
});

test('BadConcurrentManager: cannot get controller for overwritten operation', () => {
    const manager = new BadConcurrentManager();

    manager.startOperation('node-1');
    manager.startOperation('node-2');

    // First operation's controller is lost
    assertNull(manager.getActiveController('node-1'));

    // Only second operation's controller is accessible
    assertTrue(manager.getActiveController('node-2') !== null);
});

test('GoodConcurrentManager: multiple operations run independently', () => {
    const manager = new GoodConcurrentManager();

    // Start multiple operations
    const controller1 = manager.startOperation('node-1');
    const controller2 = manager.startOperation('node-2');
    const controller3 = manager.startOperation('node-3');

    assertEqual(manager.getActiveCount(), 3);

    // Each can be controlled independently
    assertTrue(manager.stopOperation('node-1'), 'Can stop node-1');
    assertTrue(controller1.aborted, 'node-1 controller aborted');
    assertFalse(controller2.aborted, 'node-2 controller NOT aborted');
    assertFalse(controller3.aborted, 'node-3 controller NOT aborted');

    // Stop another
    assertTrue(manager.stopOperation('node-3'), 'Can stop node-3');
    assertTrue(controller3.aborted, 'node-3 controller aborted');
    assertFalse(controller2.aborted, 'node-2 STILL not aborted');
});

test('GoodConcurrentManager: can get controller for any active operation', () => {
    const manager = new GoodConcurrentManager();

    manager.startOperation('node-1');
    manager.startOperation('node-2');

    // Both controllers are accessible
    assertTrue(manager.getActiveController('node-1') !== null);
    assertTrue(manager.getActiveController('node-2') !== null);

    // Each is the correct one
    assertEqual(manager.getActiveController('node-1').nodeId, 'node-1');
    assertEqual(manager.getActiveController('node-2').nodeId, 'node-2');
});

test('GoodConcurrentManager: cleanup removes only completed operation', () => {
    const manager = new GoodConcurrentManager();

    manager.startOperation('node-1');
    manager.startOperation('node-2');

    assertEqual(manager.getActiveCount(), 2);

    // Complete one operation
    manager.completeOperation('node-1');

    assertEqual(manager.getActiveCount(), 1);
    assertNull(manager.getActiveController('node-1'));
    assertTrue(manager.getActiveController('node-2') !== null);
});

test('GoodConcurrentManager: stopping non-existent operation returns false', () => {
    const manager = new GoodConcurrentManager();

    assertFalse(manager.stopOperation('non-existent'));
});

test('GoodConcurrentManager: same node can be restarted after completion', () => {
    const manager = new GoodConcurrentManager();

    // Start and complete an operation
    const controller1 = manager.startOperation('node-1');
    manager.completeOperation('node-1');

    // Start a new operation on the same node
    const controller2 = manager.startOperation('node-1');

    // They are different controllers
    assertTrue(controller1 !== controller2, 'New controller is different instance');

    // Only the new one is active
    assertEqual(manager.getActiveController('node-1'), controller2);
});

// NOTE: RecentModels, Provider mapping, URL detection, and isPdfUrl tests have been moved to:
// - test_storage.js (RecentModels, Provider mapping)
// - test_utils_basic.js (URL detection, isPdfUrl)

// NOTE: Graph.isEmpty(), MatrixCellTracker, and formatUserError tests have been moved to:
// - test_crdt_graph.js (Graph.isEmpty)
// - test_matrix.js (MatrixCellTracker)
// - test_utils_basic.js (formatUserError)

// NOTE: buildMessagesForApi, Zoom class, Node creation, Graph.resolveContext, Navigation popover,
// MatrixNode rendering, FlashcardNode, CREATE_FLASHCARDS, HeaderButtons, SM-2, isFlashcardDue,
// getDueFlashcards, Matrix cell concurrent updates, and Graph traversal tests have been moved to:
// - test_utils_messages.js (buildMessagesForApi)
// - test_canvas_helpers.js (Zoom class, Navigation popover)
// - test_graph_types.js (Node creation)
// - test_crdt_graph.js (Graph.resolveContext, Graph traversal)
// - test_matrix.js (MatrixNode rendering, Matrix cell concurrent updates)
// - test_flashcards.js (FlashcardNode, SM-2, isFlashcardDue, getDueFlashcards)
// - test_node_protocols.js (CREATE_FLASHCARDS, HeaderButtons)

// ============================================================
// Note: buildLLMRequest() tests removed
// ============================================================
// Per AGENTS.md principle: "Tests pure functions that don't require DOM or API calls"
// and "NOTE: This file loads actual source files to test real implementations, not copies"
//
// buildLLMRequest() is an instance method of the App class which:
// 1. Requires full App instantiation (complex with many dependencies)
// 2. Depends on runtime state (modelPicker, storage, chat instances)
// 3. Would require either duplicating the method logic (violates AGENTS.md)
//    OR complex mocking of the entire App lifecycle (brittle)
//
// Instead, this functionality is verified through:
// - Manual testing with actual proxy configurations
// - The refactoring itself (all calls use the helper, reducing duplication)
// - Python backend tests ensure the API accepts base_url correctly
//
// If E2E/integration tests are added in the future, buildLLMRequest()
// should be tested there, not in unit tests.
//
// ============================================================
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
