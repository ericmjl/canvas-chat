/**
 * Tests for CodeNode plugin
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
            return request;
        },
    };
}

// Now import modules
import { assertTrue, assertEqual, assertFalse } from './test_helpers/assertions.js';
import { NodeRegistry } from '../src/canvas_chat/static/js/node-registry.js';
import { wrapNode, BaseNode } from '../src/canvas_chat/static/js/node-protocols.js';
import { NodeType } from '../src/canvas_chat/static/js/graph-types.js';

// Side-effect import to register the plugin
import '../src/canvas_chat/static/js/plugins/code.js';

function test(description, fn) {
    try {
        fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        throw error;
    }
}

console.log('\n=== Code Node Plugin Tests ===\n');

test('Code node plugin is registered', () => {
    assertTrue(NodeRegistry.isRegistered(NodeType.CODE), 'CodeNode should be registered');
});

test('CodeNode implements protocol methods', () => {
    const node = {
        id: 'test-code',
        type: NodeType.CODE,
        code: 'print("hello")',
        content: 'print("hello")',
    };
    const wrapped = wrapNode(node);
    assertTrue(wrapped instanceof BaseNode, 'Should be instance of BaseNode');
    assertTrue(typeof wrapped.getTypeLabel === 'function', 'Should have getTypeLabel');
    assertTrue(typeof wrapped.getTypeIcon === 'function', 'Should have getTypeIcon');
    assertTrue(typeof wrapped.getSummaryText === 'function', 'Should have getSummaryText');
    assertTrue(typeof wrapped.renderContent === 'function', 'Should have renderContent');
    assertTrue(typeof wrapped.getActions === 'function', 'Should have getActions');
    assertTrue(typeof wrapped.getHeaderButtons === 'function', 'Should have getHeaderButtons');
    assertTrue(typeof wrapped.hasOutput === 'function', 'Should have hasOutput');
    assertTrue(typeof wrapped.renderOutputPanel === 'function', 'Should have renderOutputPanel');
    assertTrue(typeof wrapped.supportsCodeExecution === 'function', 'Should have supportsCodeExecution');
    assertTrue(typeof wrapped.getCode === 'function', 'Should have getCode');
    assertTrue(typeof wrapped.updateContent === 'function', 'Should have updateContent');
});

test('CodeNode getTypeLabel returns "Code"', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'Code');
});

test('CodeNode getTypeIcon returns snake emoji', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeIcon(), '🐍');
});

test('CodeNode getSummaryText returns title when present', () => {
    const node = { id: 'test', type: NodeType.CODE, title: 'My Code', code: '', content: '' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText({ truncate: (s) => s }), 'My Code');
});

test('CodeNode getSummaryText extracts first meaningful line', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: '# Comment\nprint("hello")\n# Another comment',
        content: '# Comment\nprint("hello")\n# Another comment',
    };
    const wrapped = wrapNode(node);
    const result = wrapped.getSummaryText({ truncate: (s) => s });
    assertTrue(result.includes('print'), 'Should include first meaningful line');
});

test('CodeNode renderContent generates code HTML', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: 'print("hello")',
        content: 'print("hello")',
        executionState: 'idle',
        csvNodeIds: [],
    };
    const wrapped = wrapNode(node);
    const canvas = {
        escapeHtml: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    };
    const html = wrapped.renderContent(canvas);
    assertTrue(html.includes('code-display'), 'Should include code display');
    assertTrue(html.includes('language-python'), 'Should include Python language class');
    assertTrue(html.includes('print'), 'Should include code content');
});

test('CodeNode renderContent shows execution state', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: 'print("hello")',
        content: 'print("hello")',
        executionState: 'running',
        csvNodeIds: [],
    };
    const wrapped = wrapNode(node);
    const canvas = {
        escapeHtml: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    };
    const html = wrapped.renderContent(canvas);
    assertTrue(html.includes('code-running'), 'Should include running class');
    assertTrue(html.includes('Running...'), 'Should include running indicator');
});

test('CodeNode renderContent shows self-healing status', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: 'print("hello")',
        content: 'print("hello")',
        executionState: 'idle',
        selfHealingStatus: 'fixed',
        csvNodeIds: [],
    };
    const wrapped = wrapNode(node);
    const canvas = {
        escapeHtml: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    };
    const html = wrapped.renderContent(canvas);
    assertTrue(html.includes('Self-healed'), 'Should include self-healed indicator');
});

test('CodeNode hasOutput returns false when no output', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: '',
        content: '',
    };
    const wrapped = wrapNode(node);
    assertFalse(wrapped.hasOutput(), 'Should return false when no output');
});

test('CodeNode hasOutput returns true when output present', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: '',
        content: '',
    };
    const wrapped = wrapNode(node);
    assertFalse(wrapped.hasOutput(), 'Should return false when no output');
});

test('CodeNode hasOutput returns true when output present', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: '',
        content: '',
        outputText: 'Result',
    };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.hasOutput(), 'Should return true when output present');
});

test('CodeNode renderOutputPanel generates output HTML', () => {
    const node = {
        id: 'test',
        type: NodeType.CODE,
        code: '',
        content: '',
        outputText: 'Hello World',
    };
    const wrapped = wrapNode(node);
    const canvas = {
        escapeHtml: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    };
    const html = wrapped.renderOutputPanel(canvas);
    assertTrue(html.includes('code-output-panel-content'), 'Should include output panel content');
    assertTrue(html.includes('Hello World'), 'Should include output text');
});

test('CodeNode supportsCodeExecution returns true', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.supportsCodeExecution(), 'Should support code execution');
});

test('CodeNode getCode returns code content', () => {
    const node = { id: 'test', type: NodeType.CODE, code: 'print("hello")', content: '' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getCode(), 'print("hello")');
});

test('CodeNode getCode falls back to content', () => {
    const node = { id: 'test', type: NodeType.CODE, code: null, content: 'print("hello")' };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getCode(), 'print("hello")');
});

test('CodeNode getComputedActions returns correct actions', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertTrue(actions.length > 0, 'Should have actions');
    const actionIds = actions.map((a) => a.id);
    assertTrue(actionIds.includes('reply'), 'Should include reply');
    assertTrue(actionIds.includes('edit-code'), 'Should include edit-code');
    assertTrue(actionIds.includes('generate'), 'Should include generate');
    assertTrue(actionIds.includes('run-code'), 'Should include run-code');
    assertTrue(actionIds.includes('copy'), 'Should include copy');
    assertFalse(actionIds.includes('edit-content'), 'Should not include edit-content');
});

test('CodeNode supportsStopContinue returns true', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.supportsStopContinue(), 'Should support stop/continue');
});

test('CodeNode getHeaderButtons includes STOP and CONTINUE', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    const buttons = wrapped.getHeaderButtons();
    const buttonIds = buttons.map((b) => b.id);
    assertTrue(buttonIds.includes('stop'), 'Should include stop button');
    assertTrue(buttonIds.includes('continue'), 'Should include continue button');
});

test('CodeNode getEventBindings returns syntax highlighting binding', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    const bindings = wrapped.getEventBindings();
    assertTrue(bindings.length > 0, 'Should have event bindings');
    const codeDisplayBinding = bindings.find((b) => b.selector === '.code-display');
    assertTrue(codeDisplayBinding !== undefined, 'Should have code-display binding');
    assertEqual(codeDisplayBinding.event, 'init', 'Should use init event');
});

test('CodeNode isScrollable returns true', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'Should be scrollable');
});

test('wrapNode returns CodeNode for CODE type', () => {
    const node = { id: 'test', type: NodeType.CODE, code: '', content: '' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.supportsCodeExecution(), 'Should be CodeNode instance');
    assertEqual(wrapped.getTypeLabel(), 'Code');
});
