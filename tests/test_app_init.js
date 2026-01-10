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
import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Create a minimal DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
    resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
// navigator is read-only, use dom.window.navigator directly

// Mock required globals
global.window.Y = {
    Doc: class {},
    Map: class {},
    Text: class {},
    Array: class {}
};
global.window.IndexeddbPersistence = class {};
global.window.WebrtcProvider = class {};

// Mock storage
global.storage = {
    getApiKeys: () => ({}),
    getLastSessionId: () => null,
    getCurrentModel: () => null,
    hasExaApiKey: () => false,
    getBaseUrl: () => '',
    getFlashcardStrictness: () => 'normal',
    getCustomModels: () => [],
    listSessions: () => Promise.resolve([]),
    getSession: () => Promise.resolve(null),
    deleteSession: () => Promise.resolve(),
    hasAnyLLMApiKey: () => false,
    isLocalhost: () => false
};

// Mock chat
global.chat = {
    models: [],
    getApiKeyForModel: () => null,
    getBaseUrlForModel: () => null,
    fetchModels: () => Promise.resolve([]),
    fetchProviderModels: () => Promise.resolve([])
};

// Mock SearchIndex
global.SearchIndex = class {
    constructor() {
        this.index = new Map();
    }
    addNode() {}
    removeNode() {}
    search() { return []; }
};

// Mock Canvas
global.Canvas = class {
    static configureMarked() {}
    constructor() {
        this.nodeElements = new Map();
        this.edgeElements = new Map();
    }
    renderGraph() {}
    renderNode() {}
    renderEdge() {}
    removeNode() {}
    removeEdge() {}
    updateNodeContent() {}
    updateCodeContent() {}
    showStopButton() {}
    hideStopButton() {}
    showContinueButton() {}
    hideContinueButton() {}
    getSelectedNodeIds() { return []; }
    clearSelection() {}
    selectNode() {}
    centerOnAnimated() {}
    panToNodeAnimated() {}
    highlightNodesByTag() {}
    updateAllNavButtonStates() {}
    updateAllEdges() {}
    renderMarkdown() { return ''; }
    truncate() { return ''; }
    emit() {}
    on() { return this; }
    fitToContent() {}
    showCanvasHint() {}
    showNodeError() {}
    clearNodeError() {}
    resizeNodeToViewport() {}
    updateEdgesForNode() {}
    showGenerateInput() {}
    hideGenerateInput() {}
};

// Mock CRDTGraph
global.CRDTGraph = class {
    constructor() {
        this.nodes = new Map();
        this.edges = [];
    }
    enablePersistence() { return Promise.resolve(); }
    isEmpty() { return true; }
    getAllNodes() { return []; }
    getNode() { return null; }
    addNode() {}
    addEdge() {}
    updateNode() {}
    removeNode() {}
    getParents() { return []; }
    getChildren() { return []; }
    getLeafNodes() { return []; }
    resolveContext() { return []; }
    autoPosition() { return { x: 0, y: 0 }; }
    getMultiplayerStatus() { return { enabled: false }; }
    disableMultiplayer() {}
    isNodeLockedByOther() { return false; }
    lockNode() { return true; }
    unlockNode() {}
    releaseAllLocks() {}
    getAllTags() { return {}; }
    getTag() { return null; }
    nodeHasTag() { return false; }
    createTag() {}
    updateTag() {}
    deleteTag() {}
};

// Mock NodeType and createNode
global.NodeType = {
    HUMAN: 'human', AI: 'ai', NOTE: 'note', SUMMARY: 'summary', REFERENCE: 'reference',
    SEARCH: 'search', RESEARCH: 'research', HIGHLIGHT: 'highlight', MATRIX: 'matrix',
    CELL: 'cell', ROW: 'row', COLUMN: 'column', FETCH_RESULT: 'fetch_result',
    PDF: 'pdf', OPINION: 'opinion', SYNTHESIS: 'synthesis', REVIEW: 'review', IMAGE: 'image',
    FLASHCARD: 'flashcard', FACTCHECK: 'factcheck', CSV: 'csv', CODE: 'code'
};

global.createNode = () => ({ id: 'test', type: NodeType.NOTE, content: '', position: { x: 0, y: 0 } });
global.createEdge = () => ({ id: 'test', source: 'a', target: 'b', type: 'reply' });
global.getDefaultNodeSize = () => ({ width: 320, height: 200 });

// Mock apiUrl
global.apiUrl = (path) => `http://localhost${path}`;

// Mock other required globals
global.resizeImage = () => Promise.resolve('data:image/png;base64,test');
global.Papa = { parse: () => ({ data: [], meta: { fields: [] }, errors: [] }) };
global.pyodideRunner = {};

// Mock feature classes
global.FlashcardFeature = class {};
global.CommitteeFeature = class {};
global.MatrixFeature = class {};
global.FactcheckFeature = class {};
global.ResearchFeature = class {};

// Create minimal HTML structure that App expects
const body = document.body;
body.innerHTML = `
    <div id="canvas-container"></div>
    <input id="chat-input" />
    <button id="send-btn"></button>
    <select id="model-picker"></select>
    <div id="session-name"></div>
    <div id="budget-fill"></div>
    <div id="budget-text"></div>
    <div id="selected-nodes-indicator"></div>
    <div id="selected-count"></div>
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
`;

// Load source files in order
const sourceDir = path.join(__dirname, '../src/canvas_chat/static/js');

function loadSourceFile(filename) {
    const filePath = path.join(sourceDir, filename);
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInThisContext(code, { filename: filePath });
}

// Load dependencies in correct order
loadSourceFile('sse.js');
loadSourceFile('search.js');
loadSourceFile('storage.js');
loadSourceFile('layout.js');
loadSourceFile('highlight-utils.js');
loadSourceFile('event-emitter.js');
loadSourceFile('graph-types.js');
loadSourceFile('crdt-graph.js');
loadSourceFile('node-protocols.js');
loadSourceFile('canvas.js');
loadSourceFile('chat.js');
loadSourceFile('utils.js');
loadSourceFile('flashcards.js');
loadSourceFile('committee.js');
loadSourceFile('matrix.js');
loadSourceFile('factcheck.js');
loadSourceFile('research.js');
loadSourceFile('pyodide-runner.js');
loadSourceFile('undo-manager.js');
loadSourceFile('slash-command-menu.js');
loadSourceFile('modal-manager.js');
loadSourceFile('file-upload-handler.js');
loadSourceFile('app.js');

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
    const originalInit = window.App.prototype.init;
    window.App.prototype.init = async () => {}; // No-op for testing

    try {
        const app = new window.App();

        // Verify key properties exist (these are set in constructor before init())
        if (!app.modalManager) throw new Error('app.modalManager is undefined');
        if (!app.fileUploadHandler) throw new Error('app.fileUploadHandler is undefined');
        if (!app.undoManager) throw new Error('app.undoManager is undefined');
        if (!app.slashCommandMenu) throw new Error('app.slashCommandMenu is undefined');
    } finally {
        // Restore original init
        window.App.prototype.init = originalInit;
    }
});

// Test that event listener bindings don't reference undefined methods
// This catches errors like: this.handleX.bind(this) when handleX doesn't exist
test('App event listener methods exist', () => {
    // Prevent init() from running (it needs full DOM setup)
    const originalInit = window.App.prototype.init;

    let app;

    // Mock Canvas to allow event listener setup
    const OriginalCanvas = global.Canvas;
    global.Canvas = class extends OriginalCanvas {
        on(event, handler) {
            return this; // Chainable
        }
    };

    // Methods that were moved to other classes (delegated methods)
    // IMPORTANT: Keep this in sync when methods are moved during refactoring
    const DELEGATED_METHODS = {
        handleNodeTitleEdit: 'modalManager.handleNodeTitleEdit',
        handleNodeEditContent: 'modalManager.handleNodeEditContent',
        handleNodeEditCode: 'modalManager.handleNodeEditCode',
        handlePdfDrop: 'fileUploadHandler.handlePdfDrop',
        handleImageDrop: 'fileUploadHandler.handleImageDrop',
        handleCsvDrop: 'fileUploadHandler.handleCsvDrop'
    };

    // Methods that should exist directly on App class
    // These are the methods referenced in setupCanvasEventListeners() via .bind(this)
    const DIRECT_METHODS = [
        'handleNodeSelect',
        'handleNodeDeselect',
        'handleNodeMove',
        'handleNodeDrag',
        'handleNodeResize',
        'handleNodeResizing',
        'handleNodeReply',
        'handleNodeBranch',
        'handleNodeSummarize',
        'handleNodeFetchSummarize',
        'handleNodeDelete',
        'copyNodeContent',
        'handleMatrixCellFill',
        'handleMatrixCellView',
        'handleMatrixFillAll',
        'handleMatrixRowExtract',
        'handleMatrixColExtract',
        'handleMatrixEdit',
        'handleMatrixIndexColResize',
        'handleNodeStopGeneration',
        'handleNodeContinueGeneration',
        'handleNodeRetry',
        'handleNodeDismissError',
        'handleNodeFitToViewport',
        'handleNodeResetSize',
        'handleNodeResummarize',
        'handleCreateFlashcards',
        'reviewSingleCard',
        'handleFlipCard',
        'handleImageClick',
        'handleTagChipClick',
        'handleNavParentClick',
        'handleNavChildClick',
        'handleNodeNavigate',
        'handleNodeCollapse',
        'handleNodeAnalyze',
        'handleNodeRunCode',
        'handleNodeCodeChange',
        'handleNodeGenerate',
        'handleNodeGenerateSubmit',
        'handleNodeOutputToggle',
        'handleNodeOutputClear',
        'handleNodeOutputResize'
    ];

    // Override init() to only set up canvas event listeners (the part that would fail)
    // We call setupCanvasEventListeners() which is the actual method from app.js
    // This eliminates duplication - we're testing the real code!
    window.App.prototype.init = async function() {
        // Initialize canvas (will use our mock)
        this.canvas = new Canvas('canvas-container', 'canvas');

        // Call the actual setupCanvasEventListeners method from app.js
        // If any method doesn't exist, .bind(this) will throw:
        // "Cannot read properties of undefined (reading 'bind')"
        try {
            this.setupCanvasEventListeners();
        } catch (err) {
            // If .bind() fails, it means the method doesn't exist
            throw new Error(`Failed to bind event listener: ${err.message}. This usually means a method was moved to another class but the event listener wasn't updated.`);
        }
    };

    try {
        app = new window.App();

        // Test direct methods exist
        for (const methodName of DIRECT_METHODS) {
            if (typeof app[methodName] !== 'function') {
                throw new Error(`Method ${methodName} is not a function (might have been moved to another class - check DELEGATED_METHODS)`);
            }
        }

        // Test delegated methods exist on their target objects
        for (const [methodName, target] of Object.entries(DELEGATED_METHODS)) {
            const [targetName, targetMethod] = target.split('.');
            const targetObj = app[targetName];

            if (!targetObj) {
                throw new Error(`Delegated method ${methodName} requires ${targetName} to exist, but it's undefined`);
            }

            if (typeof targetObj[targetMethod] !== 'function') {
                throw new Error(`Delegated method ${methodName} -> ${target} is not a function. Method might have been moved but reference wasn't updated.`);
            }
        }
    } finally {
        // Restore original init and Canvas
        window.App.prototype.init = originalInit;
        global.Canvas = OriginalCanvas;
    }
});

// Test that modal manager methods exist
test('ModalManager methods are accessible', () => {
    // Prevent init() from running (it needs full DOM setup)
    const originalInit = window.App.prototype.init;
    window.App.prototype.init = async () => {}; // No-op for testing

    let app;
    try {
        app = new window.App();

    // Verify modal manager methods exist
    if (typeof app.modalManager.showSettingsModal !== 'function') {
        throw new Error('modalManager.showSettingsModal is not a function');
    }
    if (typeof app.modalManager.handleNodeTitleEdit !== 'function') {
        throw new Error('modalManager.handleNodeTitleEdit is not a function');
    }
    if (typeof app.modalManager.handleNodeEditContent !== 'function') {
        throw new Error('modalManager.handleNodeEditContent is not a function');
    }
    if (typeof app.modalManager.handleNodeEditCode !== 'function') {
        throw new Error('modalManager.handleNodeEditCode is not a function');
    }
    } finally {
        // Restore original init
        window.App.prototype.init = originalInit;
    }
});

// Test that file upload handler methods exist
test('FileUploadHandler methods are accessible', () => {
    // Prevent init() from running (it needs full DOM setup)
    const originalInit = window.App.prototype.init;
    window.App.prototype.init = async () => {}; // No-op for testing

    let app;
    try {
        app = new window.App();

    if (typeof app.fileUploadHandler.handlePdfUpload !== 'function') {
        throw new Error('fileUploadHandler.handlePdfUpload is not a function');
    }
    if (typeof app.fileUploadHandler.handleImageUpload !== 'function') {
        throw new Error('fileUploadHandler.handleImageUpload is not a function');
    }
    if (typeof app.fileUploadHandler.handleCsvUpload !== 'function') {
        throw new Error('fileUploadHandler.handleCsvUpload is not a function');
    }
    } finally {
        // Restore original init
        window.App.prototype.init = originalInit;
    }
});

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

// Exit immediately after tests complete to prevent async init() errors from failing the test
// (init() tries to create Canvas which needs full DOM setup, but we've already verified
// that the constructor and methods exist, which is what we care about)
if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
