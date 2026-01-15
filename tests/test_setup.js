/**
 * Shared test setup for JavaScript tests.
 * Loads source files and sets up the test environment using ES modules.
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up minimal browser-like environment for source files
global.window = global;
global.window.addEventListener = () => {}; // Mock window.addEventListener
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
};
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
global.document = {
    createElement: (tagName) => {
        const element = { textContent: '', innerHTML: '', id: '' };
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
            },
        });
        return element;
    },
    addEventListener: () => {}, // Mock event listener (no-op for tests)
    head: {
        appendChild: () => {}, // Mock for node-registry.js CSS injection
    },
};

// Import all ES modules
const {
    NodeType,
    EdgeType,
    TAG_COLORS,
    DEFAULT_NODE_SIZES,
    getDefaultNodeSize,
    createNode,
    createEdge,
    createMatrixNode,
    createCellNode,
    createRowNode,
    createColumnNode,
    createFlashcardNode,
} = await import('../src/canvas_chat/static/js/graph-types.js');
const {
    wouldOverlapNodes,
    getOverlap,
    hasAnyOverlap,
    resolveOverlaps,
    getNodeSize,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_PADDING,
} = await import('../src/canvas_chat/static/js/layout.js');
const {
    formatUserError,
    buildMessagesForApi,
    isUrlContent,
    extractUrlFromReferenceNode,
    truncateText,
    escapeHtmlText,
    formatMatrixAsText,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    resizeImage,
    apiUrl,
    getBasePath,
} = await import('../src/canvas_chat/static/js/utils.js');
const { SearchIndex, tokenize, calculateIDF, getNodeTypeIcon, NODE_TYPE_ICONS, BM25_K1, BM25_B } =
    await import('../src/canvas_chat/static/js/search.js');
const { FlashcardFeature } = await import('../src/canvas_chat/static/js/plugins/flashcards.js');
const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
const {
    wrapNode,
    validateNodeProtocol,
    Actions,
    HeaderButtons,
    BaseNode,
    HumanNode,
    AINode,
    NoteNode,
    // SummaryNode is now a plugin - import from summary.js if needed
    ReferenceNode,
    SearchNode,
    ResearchNode,
    HighlightNode,
    MatrixNode,
    CellNode,
    RowNode,
    ColumnNode,
    FetchResultNode,
    PdfNode,
    OpinionNode,
    SynthesisNode,
    ReviewNode,
    FactcheckNode,
    ImageNode,
    FlashcardNode,
    CsvNode,
    CodeNode,
} = await import('../src/canvas_chat/static/js/node-protocols.js');

// Import CRDTGraph for test utilities
const { CRDTGraph } = await import('../src/canvas_chat/static/js/crdt-graph.js');

// Create mock function for createMockNodeForType (if tests need it)
function createMockNodeForType(type) {
    return createNode(type, 'Test content', { position: { x: 0, y: 0 } });
}

// Test utilities for graph tests
class TestGraph extends CRDTGraph {
    constructor() {
        super();
        // Disable persistence for tests
        this.enablePersistence = () => Promise.resolve();
    }
}

function createTestNode(id, type = NodeType.NOTE, content = 'Test content') {
    return createNode(type, content, {
        id: id,
        position: { x: 0, y: 0 },
    });
}

function createTestEdge(fromId, toId, type = 'reference') {
    return createEdge(fromId, toId, type);
}

// Add assertion aliases
function assertTrue(condition, message) {
    if (!condition) {
        throw new Error(message || 'Expected true but got false');
    }
}

function assertFalse(condition, message) {
    if (condition) {
        throw new Error(message || 'Expected false but got true');
    }
}

function assertNull(value, message) {
    if (value !== null) {
        throw new Error(message || `Expected null but got ${value}`);
    }
}

function assertNotNull(value, message) {
    if (value === null) {
        throw new Error(message || 'Expected non-null value but got null');
    }
}

// Test assertion helpers
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

assert.equal = (actual, expected, message) => {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected} but got ${actual}`);
    }
};

assert.deepEqual = (actual, expected, message) => {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(message || `Expected ${expectedStr} but got ${actualStr}`);
    }
};

assert.throws = (fn, message) => {
    try {
        fn();
        throw new Error(message || 'Expected function to throw');
    } catch (e) {
        // Success - function threw
    }
};

// Aliases for compatibility
const assertEqual = assert.equal;
const assertDeepEqual = assert.deepEqual;
const assertThrows = assert.throws;

// Test runner
const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

// Export everything tests might need
export {
    test,
    assert,
    assertEqual,
    assertDeepEqual,
    assertThrows,
    assertTrue,
    assertFalse,
    assertNull,
    assertNotNull,
    TestGraph,
    createTestNode,
    createTestEdge,
    NodeType,
    EdgeType,
    TAG_COLORS,
    DEFAULT_NODE_SIZES,
    getDefaultNodeSize,
    createNode,
    createEdge,
    createMatrixNode,
    createCellNode,
    createRowNode,
    createColumnNode,
    createFlashcardNode,
    createNode as createNodeReal,
    createMatrixNode as createMatrixNodeReal,
    createRowNode as createRowNodeReal,
    createColumnNode as createColumnNodeReal,
    wouldOverlapNodes,
    getOverlap,
    hasAnyOverlap,
    resolveOverlaps,
    getNodeSize,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_PADDING,
    formatUserError,
    buildMessagesForApi,
    isUrlContent,
    extractUrlFromReferenceNode,
    truncateText,
    escapeHtmlText,
    formatMatrixAsText,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    resizeImage,
    apiUrl,
    getBasePath,
    SearchIndex,
    tokenize,
    calculateIDF,
    getNodeTypeIcon,
    NODE_TYPE_ICONS,
    BM25_K1,
    BM25_B,
    FlashcardFeature,
    NodeRegistry,
    wrapNode,
    validateNodeProtocol,
    Actions,
    HeaderButtons,
    BaseNode,
    HumanNode,
    AINode,
    NoteNode,
    // SummaryNode is now a plugin - import from summary.js if needed
    ReferenceNode,
    SearchNode,
    ResearchNode,
    HighlightNode,
    MatrixNode as MatrixNodeProtocol,
    CellNode,
    RowNode,
    ColumnNode,
    FetchResultNode,
    PdfNode,
    OpinionNode,
    SynthesisNode,
    ReviewNode,
    FactcheckNode,
    ImageNode,
    FlashcardNode as FlashcardNodeProtocol,
    CsvNode,
    CodeNode,
    createMockNodeForType,
    tests,
};
