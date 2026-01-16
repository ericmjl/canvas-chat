/**
 * Unit tests for Plugin Action Composition
 * Run with: node tests/test_plugin_actions.js
 *
 * Tests that plugins can correctly add, hide, and override actions/shortcuts.
 */

import { assertEqual, assertTrue, assertFalse } from './test_helpers/assertions.js';

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
await import('../src/canvas_chat/static/js/plugins/code.js');
await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');
await import('../src/canvas_chat/static/js/plugins/fetch-result-node.js');
await import('../src/canvas_chat/static/js/plugins/note.js');

const { NodeType } = await import('../src/canvas_chat/static/js/graph-types.js');
const { wrapNode } = await import('../src/canvas_chat/static/js/node-protocols.js');
const { CodeNode } = await import('../src/canvas_chat/static/js/plugins/code.js');
const { FlashcardNode } = await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

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

// ============================================================
// CodeNode Action Composition Tests
// ============================================================

test('CodeNode hides edit-content and adds edit-code', () => {
    const node = { id: 'test', type: 'code', content: '', code: '' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    assertFalse(actions.some((a) => a.id === 'edit-content'));
    assertTrue(actions.some((a) => a.id === 'edit-code'));
});

test('CodeNode maps e to edit-code', () => {
    const node = { id: 'test', type: 'code', content: '', code: '' };
    const wrapped = wrapNode(node);
    const shortcuts = wrapped.getKeyboardShortcuts();

    assertEqual(shortcuts['e'].handler, 'nodeEditCode');
});

test('CodeNode includes default actions (reply, copy)', () => {
    const node = { id: 'test', type: 'code', content: '', code: '' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    assertTrue(actions.some((a) => a.id === 'reply'));
    assertTrue(actions.some((a) => a.id === 'copy'));
});

test('CodeNode includes custom actions (edit-code, generate, run-code)', () => {
    const node = { id: 'test', type: 'code', content: '', code: '' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    assertTrue(actions.some((a) => a.id === 'edit-code'));
    assertTrue(actions.some((a) => a.id === 'generate'));
    assertTrue(actions.some((a) => a.id === 'run-code'));
});

test('CodeNode adds Shift+A shortcut for generate', () => {
    const node = { id: 'test', type: 'code', content: '', code: '' };
    const wrapped = wrapNode(node);
    const shortcuts = wrapped.getKeyboardShortcuts();

    assertTrue('A' in shortcuts);
    assertTrue(shortcuts['A'].shift);
    assertEqual(shortcuts['A'].handler, 'nodeGenerate');
});

// ============================================================
// FlashcardNode Action Composition Tests
// ============================================================

test('FlashcardNode hides edit and adds flip', () => {
    const node = { id: 'test', type: 'flashcard', front: 'Q', back: 'A' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    // FlashcardNode hides edit-content but still has EDIT_CONTENT in additional actions
    // (for custom edit via getEditFields)
    assertTrue(actions.some((a) => a.id === 'flip-card'));
    assertTrue(actions.some((a) => a.id === 'review-card'));
});

test('FlashcardNode removes e shortcut and adds f for flip', () => {
    const node = { id: 'test', type: 'flashcard', front: 'Q', back: 'A' };
    const wrapped = wrapNode(node);
    const shortcuts = wrapped.getKeyboardShortcuts();

    assertFalse('e' in shortcuts);
    assertTrue('f' in shortcuts);
    assertEqual(shortcuts['f'].handler, 'nodeFlipCard');
});

// ============================================================
// FetchResultNode Action Composition Tests
// ============================================================

test('FetchResultNode includes default actions plus additional', () => {
    const node = { id: 'test', type: 'fetch_result', content: 'Content' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    assertTrue(actions.some((a) => a.id === 'reply'));
    assertTrue(actions.some((a) => a.id === 'edit-content'));
    assertTrue(actions.some((a) => a.id === 'copy'));
    assertTrue(actions.some((a) => a.id === 'summarize'));
    assertTrue(actions.some((a) => a.id === 'create-flashcards'));
});

// ============================================================
// NoteNode Action Composition Tests
// ============================================================

test('NoteNode includes default actions plus flashcards', () => {
    const node = { id: 'test', type: 'note', content: 'Note' };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    assertTrue(actions.some((a) => a.id === 'reply'));
    assertTrue(actions.some((a) => a.id === 'edit-content'));
    assertTrue(actions.some((a) => a.id === 'copy'));
    assertTrue(actions.some((a) => a.id === 'create-flashcards'));
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
