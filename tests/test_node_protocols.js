/**
 * Unit tests for Node Protocol Pattern
 * Run with: node tests/test_node_protocols.js
 *
 * Tests protocol compliance, factory dispatch, and method return values.
 */

import { assertEqual, assertTrue } from './test_helpers/assertions.js';

// Mock browser globals before importing modules
global.window = global;
global.document = {
    createElement: () => ({ textContent: '', innerHTML: '', id: '' }),
    head: { appendChild: () => {} },
};
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
global.indexedDB = {
    open: () => ({ onsuccess: null, onerror: null }),
};

// Import ES modules
// Load plugins first (side-effect imports to register them)
await import('../src/canvas_chat/static/js/plugins/human-node.js');
await import('../src/canvas_chat/static/js/plugins/ai-node.js');
await import('../src/canvas_chat/static/js/plugins/reference.js');
await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');
await import('../src/canvas_chat/static/js/plugins/highlight-node.js');
await import('../src/canvas_chat/static/js/plugins/pdf-node.js');
await import('../src/canvas_chat/static/js/plugins/research-node.js');
await import('../src/canvas_chat/static/js/plugins/opinion-node.js');
await import('../src/canvas_chat/static/js/plugins/synthesis-node.js');
await import('../src/canvas_chat/static/js/plugins/review-node.js');
await import('../src/canvas_chat/static/js/plugins/image-node.js');
await import('../src/canvas_chat/static/js/plugins/csv-node.js');
await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');
await import('../src/canvas_chat/static/js/plugins/factcheck.js');
await import('../src/canvas_chat/static/js/plugins/matrix.js');
await import('../src/canvas_chat/static/js/plugins/code.js');
await import('../src/canvas_chat/static/js/plugins/cell-node.js');
await import('../src/canvas_chat/static/js/plugins/row-node.js');
await import('../src/canvas_chat/static/js/plugins/column-node.js');

const { NodeType, createNode } = await import('../src/canvas_chat/static/js/graph-types.js');
const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
const {
    Actions,
    BaseNode,
    // HumanNode is now a plugin - import from human-node.js
    // AINode is now a plugin - import from ai-node.js
    // NoteNode is now a plugin - import from note.js
    // SummaryNode is now a plugin - import from summary.js
    // ReferenceNode is now a plugin - import from reference.js
    // SearchNode is now a plugin - import from search-node.js
    // HighlightNode is now a plugin - import from highlight-node.js
    // FetchResultNode is now a plugin - import from fetch-result-node.js
    // PdfNode is now a plugin - import from pdf-node.js
    // ResearchNode is now a plugin - import from research-node.js
    // OpinionNode is now a plugin - import from opinion-node.js
    // SynthesisNode is now a plugin - import from synthesis-node.js
    // ReviewNode is now a plugin - import from review-node.js
    // ImageNode is now a plugin - import from image-node.js
    // CsvNode is now a plugin - import from csv-node.js
    // FlashcardNode is now a plugin - import from flashcard-node.js
    // FactcheckNode is now a plugin - import from factcheck-node.js
    // MatrixNode is now a plugin - import from matrix-node.js
    // CellNode is now a plugin - import from cell-node.js
    // RowNode is now a plugin - import from row-node.js
    // ColumnNode is now a plugin - import from column-node.js
    FetchResultNode,
    // CodeNode is now a plugin - import from code.js
    wrapNode,
    validateNodeProtocol,
} = await import('../src/canvas_chat/static/js/node-protocols.js');

// Import CodeNode from plugin
const { CodeNode } = await import('../src/canvas_chat/static/js/plugins/code.js');

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

// Note: HumanNode is now a plugin (human-node.js), test it separately
// test('validateNodeProtocol: HumanNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(HumanNode));
// });

// Note: AINode is now a plugin (ai-node.js), test it separately
// test('validateNodeProtocol: AINode implements all methods', () => {
//     assertTrue(validateNodeProtocol(AINode));
// });

// Note: NoteNode is now a plugin (note.js), test it separately
// test('validateNodeProtocol: NoteNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(NoteNode));
// });

// Note: SummaryNode is now a plugin (summary.js), test it separately
// test('validateNodeProtocol: SummaryNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(SummaryNode));
// });

// Note: ReferenceNode is now a plugin (reference.js) - test via wrapNode instead
// test('validateNodeProtocol: ReferenceNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(ReferenceNode));
// });

// Note: SearchNode is now a plugin (search-node.js) - test via wrapNode instead
// test('validateNodeProtocol: SearchNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(SearchNode));
// });

// Note: ResearchNode is now a plugin (research-node.js), test it separately
// test('validateNodeProtocol: ResearchNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(ResearchNode));
// });

// Note: HighlightNode is now a plugin (highlight-node.js) - test via wrapNode instead
// test('validateNodeProtocol: HighlightNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(HighlightNode));
// });

// Note: MatrixNode is now a plugin (matrix-node.js), test it separately
// test('validateNodeProtocol: MatrixNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(MatrixNode));
// });

// Note: CellNode is now a plugin (cell-node.js), test it separately
// test('validateNodeProtocol: CellNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(CellNode));
// });

// Note: RowNode is now a plugin (row-node.js), test it separately
// test('validateNodeProtocol: RowNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(RowNode));
// });

// Note: ColumnNode is now a plugin (column-node.js), test it separately
// test('validateNodeProtocol: ColumnNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(ColumnNode));
// });

// Note: FetchResultNode is now a plugin (fetch-result-node.js) - test via wrapNode instead
// test('validateNodeProtocol: FetchResultNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(FetchResultNode));
// });

// Note: PdfNode is now a plugin (pdf-node.js), test it separately
// test('validateNodeProtocol: PdfNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(PdfNode));
// });

// Note: OpinionNode is now a plugin (opinion-node.js), test it separately
// test('validateNodeProtocol: OpinionNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(OpinionNode));
// });

// Note: SynthesisNode is now a plugin (synthesis-node.js), test it separately
// test('validateNodeProtocol: SynthesisNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(SynthesisNode));
// });

// Note: ReviewNode is now a plugin (review-node.js), test it separately
// test('validateNodeProtocol: ReviewNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(ReviewNode));
// });

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('validateNodeProtocol: ImageNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(ImageNode));
// });

// ============================================================
// Factory Dispatch Tests
// ============================================================

// Note: HumanNode is now a plugin (human-node.js), test it separately
// wrapNode will use the plugin via NodeRegistry, so behavior tests below still work
// test('wrapNode: returns HumanNode for HUMAN type', () => {
//     const node = { type: NodeType.HUMAN, content: 'Hello' };
//     const wrapped = wrapNode(node);
//     assertTrue(wrapped instanceof HumanNode);
// });

// Note: AINode is now a plugin (ai-node.js), test it separately
// wrapNode will use the plugin via NodeRegistry, so behavior tests below still work
// test('wrapNode: returns AINode for AI type', () => {
//     const node = { type: NodeType.AI, content: 'Response' };
//     const wrapped = wrapNode(node);
//     assertTrue(wrapped instanceof AINode);
// });

// Note: NoteNode is now a plugin - test via NodeRegistry
test('wrapNode: returns NoteNode for NOTE type (via plugin)', async () => {
    // Import note.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/note.js');

    const node = { type: NodeType.NOTE, content: 'Note' };
    const wrapped = wrapNode(node);
    // NoteNode is now loaded as plugin, so we check protocol methods instead of instanceof
    assertTrue(wrapped.getTypeLabel() === 'Note', 'Should return Note node protocol');
    assertTrue(wrapped.getTypeIcon() === '📝', 'Should have note icon');
});

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('wrapNode: returns ImageNode for IMAGE type with imageData', () => {
//     const node = { type: NodeType.IMAGE, imageData: 'base64data', mimeType: 'image/png' };
//     const wrapped = wrapNode(node);
//     assertTrue(wrapped instanceof ImageNode);
// });

test('wrapNode: returns BaseNode for unknown type', () => {
    const node = { type: 'unknown', content: 'test' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof BaseNode);
});

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('wrapNode: imageData precedence - IMAGE type with imageData returns ImageNode', () => {
//     const node = { type: NodeType.IMAGE, imageData: 'base64data', mimeType: 'image/png' };
//     const wrapped = wrapNode(node);
//     assertTrue(wrapped instanceof ImageNode);
// });

// Note: MatrixNode is now a plugin (matrix-node.js), test it separately
// test('wrapNode: returns MatrixNode for MATRIX type', () => {
//     const node = { type: NodeType.MATRIX, context: 'Test', rowItems: [], colItems: [], cells: {} };
//     const wrapped = wrapNode(node);
//     assertTrue(wrapped instanceof MatrixNode);
// });

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

// Note: CellNode is now a plugin (cell-node.js), test it separately
// test('getTypeLabel: CellNode returns title if present', () => {
//     const node = { type: NodeType.CELL, title: 'GPT-4 × Accuracy', content: '' };
//     const wrapped = wrapNode(node);
//     assertEqual(wrapped.getTypeLabel(), 'GPT-4 × Accuracy');
// });

// test('getTypeLabel: CellNode returns "Cell" if no title', () => {
//     const node = { type: NodeType.CELL, content: '' };
//     const wrapped = wrapNode(node);
//     assertEqual(wrapped.getTypeLabel(), 'Cell');
// });

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('getTypeLabel: ImageNode returns "Image"', () => {
//     const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
//     const wrapped = wrapNode(node);
//     assertEqual(wrapped.getTypeLabel(), 'Image');
// });

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

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('getTypeIcon: ImageNode returns 🖼️', () => {
//     const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
//     const wrapped = wrapNode(node);
//     assertEqual(wrapped.getTypeIcon(), '🖼️');
// });

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

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('getSummaryText: ImageNode returns "Image"', () => {
//     const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
//     const wrapped = wrapNode(node);
//     assertEqual(wrapped.getSummaryText(mockCanvas), 'Image');
// });

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

test('getActions: BaseNode returns REPLY, EDIT_CONTENT, and COPY', () => {
    const node = { type: NodeType.NOTE, content: 'Test' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();
    assertIncludes(actions, Actions.REPLY);
    assertIncludes(actions, Actions.EDIT_CONTENT);
    assertIncludes(actions, Actions.COPY);
});

test('getComputedActions: BaseNode returns default actions', () => {
    const node = { type: NodeType.NOTE, content: 'Test' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertTrue(actions.some((a) => a.id === 'reply'));
    assertTrue(actions.some((a) => a.id === 'edit-content'));
    assertTrue(actions.some((a) => a.id === 'copy'));
});

test('getKeyboardShortcuts: BaseNode returns default shortcuts', () => {
    const node = { type: NodeType.NOTE, content: 'Test' };
    const wrapped = wrapNode(node);
    const shortcuts = wrapped.getKeyboardShortcuts();
    assertEqual(shortcuts['r'].handler, 'nodeReply');
    assertEqual(shortcuts['e'].handler, 'nodeEditContent');
    assertEqual(shortcuts['c'].handler, 'nodeCopy');
});

test('getHiddenActionIds: filters out actions from getComputedActions', () => {
    // Create a custom protocol that hides 'edit-content'
    class TestNode extends BaseNode {
        getHiddenActionIds() {
            return ['edit-content'];
        }
    }

    const node = { id: 'test', type: 'test', content: 'test' };
    const wrapped = new TestNode(node);
    const actions = wrapped.getComputedActions();

    assertTrue(actions.some((a) => a.id === 'reply'));
    assertTrue(!actions.some((a) => a.id === 'edit-content'));
    assertTrue(actions.some((a) => a.id === 'copy'));
});

test('getAdditionalActions: adds custom actions', () => {
    class TestNode extends BaseNode {
        getAdditionalActions() {
            return [{ id: 'custom', label: 'Custom', title: 'Custom action' }];
        }
    }

    const node = { id: 'test', type: 'test', content: 'test' };
    const wrapped = new TestNode(node);
    const actions = wrapped.getComputedActions();

    assertTrue(actions.some((a) => a.id === 'custom'));
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

test('getComputedActions: FetchResultNode includes EDIT_CONTENT and SUMMARIZE', () => {
    const node = { type: NodeType.FETCH_RESULT, content: 'Content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertIncludes(actions, Actions.EDIT_CONTENT);
    assertIncludes(actions, Actions.SUMMARIZE);
});

// Note: NoteNode is now a plugin - test via NodeRegistry
test('getComputedActions: NoteNode includes EDIT_CONTENT and CREATE_FLASHCARDS (via plugin)', async () => {
    // Import note.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/note.js');
    const node = { type: NodeType.NOTE, content: 'Note' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertIncludes(actions, Actions.EDIT_CONTENT);
    assertIncludes(actions, Actions.CREATE_FLASHCARDS);
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

// Note: SummaryNode is now a plugin (summary.js), test it separately
test('isScrollable: SummaryNode returns true (via plugin)', async () => {
    // Import summary.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/summary.js');
    const node = { type: NodeType.SUMMARY, content: 'Summary' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable());
});

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('isScrollable: ImageNode returns true', () => {
//     const node = { type: NodeType.IMAGE, imageData: 'data', mimeType: 'image/png' };
//     const wrapped = wrapNode(node);
//     assertTrue(wrapped.isScrollable());
// });

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

// Note: ImageNode is now a plugin (image-node.js), test it separately
// test('renderContent: ImageNode renders image tag', () => {
//     const node = { type: NodeType.IMAGE, imageData: 'base64data', mimeType: 'image/png' };
//     const wrapped = wrapNode(node);
//     const html = wrapped.renderContent(mockCanvas);
//     assertTrue(html.includes('<img'));
//     assertTrue(html.includes('base64data'));
// });

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

test('getComputedActions: CodeNode hides edit-content and includes edit-code', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertTrue(!actions.some((a) => a.id === 'edit-content'));
    assertIncludes(actions, Actions.EDIT_CODE);
});

test('getComputedActions: CodeNode includes GENERATE action', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertIncludes(actions, Actions.GENERATE);
});

test('getComputedActions: CodeNode includes RUN_CODE action', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertIncludes(actions, Actions.RUN_CODE);
});

test('getComputedActions: CodeNode includes COPY action', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertIncludes(actions, Actions.COPY);
});

test('getComputedActions: CodeNode includes REPLY, EDIT_CODE, GENERATE, RUN_CODE, COPY', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertTrue(actions.some((a) => a.id === 'reply'));
    assertTrue(actions.some((a) => a.id === 'edit-code'));
    assertTrue(actions.some((a) => a.id === 'generate'));
    assertTrue(actions.some((a) => a.id === 'run-code'));
    assertTrue(actions.some((a) => a.id === 'copy'));
});

test('getKeyboardShortcuts: CodeNode maps e to edit-code', () => {
    const node = { type: NodeType.CODE, code: 'print("hello")' };
    const wrapped = wrapNode(node);
    const shortcuts = wrapped.getKeyboardShortcuts();
    assertEqual(shortcuts['e'].handler, 'nodeEditCode');
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

// Note: CsvNode is now a plugin (csv-node.js), test it separately
// test('validateNodeProtocol: CsvNode implements all methods', () => {
//     assertTrue(validateNodeProtocol(CsvNode));
// });

// test('wrapNode: returns CsvNode for CSV type', () => {
//     const node = { type: NodeType.CSV, content: 'a,b\n1,2' };
//     const wrapped = wrapNode(node);
//     assertTrue(wrapped instanceof CsvNode);
// });

// test('getActions: CsvNode includes ANALYZE action', () => {
//     const node = { type: NodeType.CSV, content: 'a,b\n1,2' };
//     const wrapped = wrapNode(node);
//     const actions = wrapped.getActions();
//     assertIncludes(actions, Actions.ANALYZE);
// });

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
