/**
 * Unit tests for Node Protocol Pattern
 * Run with: node tests/test_node_protocols.js
 *
 * Tests protocol compliance, factory dispatch, and method return values.
 */

import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock browser globals before importing modules
global.window = global;
global.document = {
    createElement: () => ({ textContent: '', innerHTML: '', id: '' }),
    head: { appendChild: () => {} },
};

// Load graph-types.js with vm (not yet converted to ES module)
const graphTypesPath = path.join(__dirname, '../src/canvas_chat/static/js/graph-types.js');
const graphTypesCode = fs.readFileSync(graphTypesPath, 'utf8');
vm.runInThisContext(graphTypesCode, { filename: graphTypesPath });

// Import ES modules - NodeRegistry and node-protocols
const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
const {
    Actions,
    BaseNode,
    HumanNode,
    AINode,
    NoteNode,
    SummaryNode,
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
    CsvNode,
    CodeNode,
    OpinionNode,
    SynthesisNode,
    ReviewNode,
    FactcheckNode,
    ImageNode,
    FlashcardNode,
    wrapNode,
    validateNodeProtocol,
} = await import('../src/canvas_chat/static/js/node-protocols.js');

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

function assertIncludes(array, item) {
    if (!array.includes(item)) {
        throw new Error(`Expected array to include ${JSON.stringify(item)}, got ${JSON.stringify(array)}`);
    }
}

// Mock canvas and app for testing
const mockCanvas = {
    escapeHtml: (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    truncate: (text, maxLength) => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength - 1) + '…';
    },
    renderMarkdown: (text) => `<div>${text}</div>`,
    showCopyFeedback: () => {},
};

// Note: mockApp is not used in these tests - protocol classes are tested directly

// ============================================================
// Protocol Compliance Tests
// ============================================================

test('validateNodeProtocol: BaseNode implements all methods', () => {
    assertTrue(validateNodeProtocol(BaseNode));
});

test('validateNodeProtocol: HumanNode implements all methods', () => {
    assertTrue(validateNodeProtocol(HumanNode));
});

test('validateNodeProtocol: AINode implements all methods', () => {
    assertTrue(validateNodeProtocol(AINode));
});

test('validateNodeProtocol: NoteNode implements all methods', () => {
    assertTrue(validateNodeProtocol(NoteNode));
});

test('validateNodeProtocol: SummaryNode implements all methods', () => {
    assertTrue(validateNodeProtocol(SummaryNode));
});

test('validateNodeProtocol: ReferenceNode implements all methods', () => {
    assertTrue(validateNodeProtocol(ReferenceNode));
});

test('validateNodeProtocol: SearchNode implements all methods', () => {
    assertTrue(validateNodeProtocol(SearchNode));
});

test('validateNodeProtocol: ResearchNode implements all methods', () => {
    assertTrue(validateNodeProtocol(ResearchNode));
});

test('validateNodeProtocol: HighlightNode implements all methods', () => {
    assertTrue(validateNodeProtocol(HighlightNode));
});

test('validateNodeProtocol: MatrixNode implements all methods', () => {
    assertTrue(validateNodeProtocol(MatrixNode));
});

test('validateNodeProtocol: CellNode implements all methods', () => {
    assertTrue(validateNodeProtocol(CellNode));
});

test('validateNodeProtocol: RowNode implements all methods', () => {
    assertTrue(validateNodeProtocol(RowNode));
});

test('validateNodeProtocol: ColumnNode implements all methods', () => {
    assertTrue(validateNodeProtocol(ColumnNode));
});

test('validateNodeProtocol: FetchResultNode implements all methods', () => {
    assertTrue(validateNodeProtocol(FetchResultNode));
});

test('validateNodeProtocol: PdfNode implements all methods', () => {
    assertTrue(validateNodeProtocol(PdfNode));
});

test('validateNodeProtocol: OpinionNode implements all methods', () => {
    assertTrue(validateNodeProtocol(OpinionNode));
});

test('validateNodeProtocol: SynthesisNode implements all methods', () => {
    assertTrue(validateNodeProtocol(SynthesisNode));
});

test('validateNodeProtocol: ReviewNode implements all methods', () => {
    assertTrue(validateNodeProtocol(ReviewNode));
});

test('validateNodeProtocol: ImageNode implements all methods', () => {
    assertTrue(validateNodeProtocol(ImageNode));
});

// ============================================================
// Factory Dispatch Tests
// ============================================================

test('wrapNode: returns HumanNode for HUMAN type', () => {
    const node = { type: NodeType.HUMAN, content: 'Hello' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof HumanNode);
});

test('wrapNode: returns AINode for AI type', () => {
    const node = { type: NodeType.AI, content: 'Response' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof AINode);
});

test('wrapNode: returns NoteNode for NOTE type', () => {
    const node = { type: NodeType.NOTE, content: 'Note' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof NoteNode);
});

test('wrapNode: returns ImageNode for IMAGE type with imageData', () => {
    const node = { type: NodeType.IMAGE, imageData: 'base64data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof ImageNode);
});

test('wrapNode: returns BaseNode for unknown type', () => {
    const node = { type: 'unknown', content: 'test' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof BaseNode);
});

test('wrapNode: imageData precedence - IMAGE type with imageData returns ImageNode', () => {
    const node = { type: NodeType.IMAGE, imageData: 'base64data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof ImageNode);
});

test('wrapNode: returns MatrixNode for MATRIX type', () => {
    const node = { type: NodeType.MATRIX, context: 'Test', rowItems: [], colItems: [], cells: {} };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof MatrixNode);
});

// ============================================================
// getTypeLabel Tests
// ============================================================

test('getTypeLabel: HumanNode returns "You"', () => {
    const node = { type: NodeType.HUMAN, content: 'Hello' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'You');
});

test('getTypeLabel: AINode returns "AI"', () => {
    const node = { type: NodeType.AI, content: 'Response' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'AI');
});

test('getTypeLabel: CellNode returns title if present', () => {
    const node = { type: NodeType.CELL, title: 'GPT-4 × Accuracy', content: '' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'GPT-4 × Accuracy');
});

test('getTypeLabel: CellNode returns "Cell" if no title', () => {
    const node = { type: NodeType.CELL, content: '' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'Cell');
});

test('getTypeLabel: ImageNode returns "Image"', () => {
    const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'Image');
});

// ============================================================
// getTypeIcon Tests
// ============================================================

test('getTypeIcon: HumanNode returns 💬', () => {
    const node = { type: NodeType.HUMAN, content: 'Hello' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeIcon(), '💬');
});

test('getTypeIcon: AINode returns 🤖', () => {
    const node = { type: NodeType.AI, content: 'Response' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeIcon(), '🤖');
});

test('getTypeIcon: ImageNode returns 🖼️', () => {
    const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeIcon(), '🖼️');
});

// ============================================================
// getSummaryText Tests
// ============================================================

test('getSummaryText: uses title if present', () => {
    const node = { type: NodeType.NOTE, title: 'My Title', content: 'Long content here' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText(mockCanvas), 'My Title');
});

test('getSummaryText: uses summary if no title', () => {
    const node = { type: NodeType.NOTE, summary: 'Auto summary', content: 'Long content here' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText(mockCanvas), 'Auto summary');
});

test('getSummaryText: MatrixNode generates from context and dimensions', () => {
    const node = {
        type: NodeType.MATRIX,
        context: 'Evaluation',
        rowItems: ['A', 'B'],
        colItems: ['X', 'Y'],
        cells: {},
    };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText(mockCanvas), 'Evaluation (2×2)');
});

test('getSummaryText: ImageNode returns "Image"', () => {
    const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText(mockCanvas), 'Image');
});

test('getSummaryText: truncates long content', () => {
    const node = { type: NodeType.NOTE, content: 'A'.repeat(100) };
    const wrapped = wrapNode(node);
    const summary = wrapped.getSummaryText(mockCanvas);
    assertTrue(summary.length <= 60);
    assertTrue(summary.endsWith('…'));
});

// ============================================================
// getActions Tests
// ============================================================

test('getActions: BaseNode returns REPLY and COPY', () => {
    const node = { type: NodeType.NOTE, content: 'Test' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.REPLY);
    assertIncludes(actions, Actions.COPY);
});

test('getActions: AINode includes SUMMARIZE', () => {
    const node = { type: NodeType.AI, content: 'Response' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.SUMMARIZE);
});

test('getActions: ReferenceNode includes FETCH_SUMMARIZE', () => {
    const node = { type: NodeType.REFERENCE, content: 'Link' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.FETCH_SUMMARIZE);
});

test('getActions: FetchResultNode includes EDIT_CONTENT and RESUMMARIZE', () => {
    const node = { type: NodeType.FETCH_RESULT, content: 'Content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.EDIT_CONTENT);
    assertIncludes(actions, Actions.RESUMMARIZE);
});

test('getActions: NoteNode includes EDIT_CONTENT', () => {
    const node = { type: NodeType.NOTE, content: 'Note' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.EDIT_CONTENT);
});

// ============================================================
// getHeaderButtons Tests
// ============================================================

test('getHeaderButtons: BaseNode returns RESET_SIZE, FIT_VIEWPORT, DELETE', () => {
    const node = { type: NodeType.NOTE, content: 'Test' };
    const wrapped = wrapNode(node);
    const buttons = wrapped.getHeaderButtons();
    const buttonIds = buttons.map((b) => b.id);
    assertIncludes(buttonIds, 'reset-size');
    assertIncludes(buttonIds, 'fit-viewport');
    assertIncludes(buttonIds, 'delete');
});

test('getHeaderButtons: AINode includes STOP and CONTINUE', () => {
    const node = { type: NodeType.AI, content: 'Response' };
    const wrapped = wrapNode(node);
    const buttons = wrapped.getHeaderButtons();
    const buttonIds = buttons.map((b) => b.id);
    assertIncludes(buttonIds, 'stop');
    assertIncludes(buttonIds, 'continue');
});

test('getHeaderButtons: OpinionNode includes STOP and CONTINUE', () => {
    const node = { type: NodeType.OPINION, content: 'Opinion' };
    const wrapped = wrapNode(node);
    const buttons = wrapped.getHeaderButtons();
    const buttonIds = buttons.map((b) => b.id);
    assertIncludes(buttonIds, 'stop');
    assertIncludes(buttonIds, 'continue');
});

test('getHeaderButtons: STOP and CONTINUE buttons are hidden by default', () => {
    const node = { type: NodeType.AI, content: 'Response' };
    const wrapped = wrapNode(node);
    const buttons = wrapped.getHeaderButtons();
    const stopBtn = buttons.find((b) => b.id === 'stop');
    const continueBtn = buttons.find((b) => b.id === 'continue');
    assertTrue(stopBtn.hidden === true);
    assertTrue(continueBtn.hidden === true);
});

// ============================================================
// isScrollable Tests
// ============================================================

test('isScrollable: AINode returns true', () => {
    const node = { type: NodeType.AI, content: 'Response' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable());
});

test('isScrollable: SummaryNode returns true', () => {
    const node = { type: NodeType.SUMMARY, content: 'Summary' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable());
});

test('isScrollable: ImageNode returns true', () => {
    const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable());
});

test('isScrollable: HumanNode returns true (all nodes are scrollable)', () => {
    const node = { type: NodeType.HUMAN, content: 'Hello' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable());
});

test('isScrollable: ReferenceNode returns true (all nodes are scrollable)', () => {
    const node = { type: NodeType.REFERENCE, content: 'Link' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable());
});

// ============================================================
// renderContent Tests
// ============================================================

test('renderContent: ImageNode renders image tag', () => {
    const node = { type: NodeType.IMAGE, imageData: 'base64data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('<img'));
    assertTrue(html.includes('base64data'));
});

test('renderContent: HighlightNode with imageData renders image', () => {
    const node = { type: NodeType.HIGHLIGHT, imageData: 'base64data', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('<img'));
});

test('renderContent: HighlightNode without imageData renders markdown', () => {
    const node = { type: NodeType.HIGHLIGHT, content: 'Text content' };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('Text content'));
});

test('renderContent: MatrixNode returns full HTML structure', () => {
    const node = {
        type: NodeType.MATRIX,
        context: 'Test',
        rowItems: ['A'],
        colItems: ['X'],
        cells: {},
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('matrix-table'));
    assertTrue(html.includes('Test'));
});

// ============================================================
// CodeNode Tests (Modal-based editing)
// ============================================================

test('validateNodeProtocol: CodeNode implements all methods', () => {
    assertTrue(validateNodeProtocol(CodeNode));
});

test('wrapNode: returns CodeNode for CODE type', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof CodeNode);
});

test('getTypeLabel: CodeNode returns "Code"', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'Code');
});

test('getTypeIcon: CodeNode returns code icon', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeIcon(), '🐍');
});

test('getActions: CodeNode includes EDIT_CODE action', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.EDIT_CODE);
});

test('getActions: CodeNode includes GENERATE action', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.GENERATE);
});

test('getActions: CodeNode includes RUN_CODE action', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.RUN_CODE);
});

test('getActions: CodeNode includes COPY action', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.COPY);
});

test('getActions: CodeNode action order is EDIT_CODE, GENERATE, RUN_CODE, COPY', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertEqual(actions.length, 4);
    assertEqual(actions[0], Actions.EDIT_CODE);
    assertEqual(actions[1], Actions.GENERATE);
    assertEqual(actions[2], Actions.RUN_CODE);
    assertEqual(actions[3], Actions.COPY);
});

test('renderContent: CodeNode renders code-display with code block', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('code-display'));
    assertTrue(html.includes('language-python'));
    assertTrue(html.includes('print'));
});

test('renderContent: CodeNode shows placeholder when no code', () => {
    const node = { type: NodeType.CODE, code: '' };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('Click Edit to add code'));
});

test('renderContent: CodeNode shows data hint for single CSV', () => {
    const node = { type: NodeType.CODE, code: '', csvNodeIds: ['csv1'] };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('code-data-hint'));
    assertTrue(html.includes('df'));
});

test('renderContent: CodeNode shows data hint for multiple CSVs', () => {
    const node = { type: NodeType.CODE, code: '', csvNodeIds: ['csv1', 'csv2', 'csv3'] };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('df1, df2, df3'));
});

test('renderContent: CodeNode shows running indicator', () => {
    const node = { type: NodeType.CODE, code: 'x = 1', executionState: 'running' };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('code-running'));
    assertTrue(html.includes('Running...'));
});

test('renderContent: CodeNode shows error state', () => {
    const node = { type: NodeType.CODE, code: 'x = 1', executionState: 'error', lastError: 'SyntaxError' };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('code-error'));
    assertTrue(html.includes('SyntaxError'));
});

test('getSummaryText: CodeNode shows first non-comment line', () => {
    const node = { type: NodeType.CODE, code: '# Comment\nprint("hello world")' };
    const wrapped = wrapNode(node);
    const summary = wrapped.getSummaryText(mockCanvas);
    assertTrue(summary.includes('print'));
});

test('getHeaderButtons: CodeNode includes STOP and CONTINUE buttons', () => {
    const node = { type: NodeType.CODE, code: 'x = 1' };
    const wrapped = wrapNode(node);
    const buttons = wrapped.getHeaderButtons();
    const buttonIds = buttons.map((b) => b.id);
    assertIncludes(buttonIds, 'stop');
    assertIncludes(buttonIds, 'continue');
});

// ============================================================
// Actions definitions tests
// ============================================================

test('Actions.EDIT_CODE: has correct id and label', () => {
    assertEqual(Actions.EDIT_CODE.id, 'edit-code');
    assertTrue(Actions.EDIT_CODE.label.includes('Edit'));
});

test('Actions: all code-related actions are defined', () => {
    assertTrue(Actions.EDIT_CODE !== undefined, 'EDIT_CODE should be defined');
    assertTrue(Actions.GENERATE !== undefined, 'GENERATE should be defined');
    assertTrue(Actions.RUN_CODE !== undefined, 'RUN_CODE should be defined');
    assertTrue(Actions.ANALYZE !== undefined, 'ANALYZE should be defined');
});

// ============================================================
// CsvNode Tests
// ============================================================

test('validateNodeProtocol: CsvNode implements all methods', () => {
    assertTrue(validateNodeProtocol(CsvNode));
});

test('wrapNode: returns CsvNode for CSV type', () => {
    const node = { type: NodeType.CSV, content: 'a,b\n1,2' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof CsvNode);
});

test('getActions: CsvNode includes ANALYZE action', () => {
    const node = { type: NodeType.CSV, content: 'a,b\n1,2' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.ANALYZE);
});

// ============================================================
// Summary
// ============================================================

console.log('\n========================================');
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
    process.exit(1);
}
