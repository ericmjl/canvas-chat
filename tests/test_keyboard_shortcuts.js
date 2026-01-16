/**
 * Unit tests for Keyboard Shortcuts (Protocol-based dispatch)
 * Run with: node tests/test_keyboard_shortcuts.js
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
const { BaseNode, Actions } = await import('../src/canvas_chat/static/js/node-protocols.js');

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
// Keyboard Shortcuts Tests
// ============================================================

test('Keyboard shortcut dispatch uses node protocol shortcuts', () => {
    // Mock node with custom shortcuts
    class TestNode extends BaseNode {
        getKeyboardShortcuts() {
            return {
                x: { action: 'custom', handler: 'customHandler' },
            };
        }
    }

    const node = { id: 'test', type: 'test', content: 'test' };
    const wrapped = new TestNode(node);
    const shortcuts = wrapped.getKeyboardShortcuts();

    assertEqual(shortcuts['x'].handler, 'customHandler');
    assertFalse('e' in shortcuts); // Default 'e' should be replaced
});

test('Shortcut with shift modifier requires shiftKey', () => {
    class TestNode extends BaseNode {
        getKeyboardShortcuts() {
            const shortcuts = super.getKeyboardShortcuts();
            shortcuts['A'] = { action: 'generate', handler: 'nodeGenerate', shift: true };
            return shortcuts;
        }
    }

    const wrapped = new TestNode({ id: 'test', type: 'test' });
    const shortcuts = wrapped.getKeyboardShortcuts();

    assertTrue(shortcuts['A'].shift);
});

test('Shortcut can override default shortcut', () => {
    class TestNode extends BaseNode {
        getKeyboardShortcuts() {
            const shortcuts = super.getKeyboardShortcuts();
            // Override 'e' to use different handler
            shortcuts['e'] = { action: 'edit-code', handler: 'nodeEditCode' };
            return shortcuts;
        }
    }

    const wrapped = new TestNode({ id: 'test', type: 'test' });
    const shortcuts = wrapped.getKeyboardShortcuts();

    assertEqual(shortcuts['e'].handler, 'nodeEditCode');
    assertEqual(shortcuts['r'].handler, 'nodeReply'); // Other defaults still work
    assertEqual(shortcuts['c'].handler, 'nodeCopy');
});

test('Shortcut can remove default shortcut', () => {
    class TestNode extends BaseNode {
        getKeyboardShortcuts() {
            const shortcuts = super.getKeyboardShortcuts();
            delete shortcuts['e']; // Remove edit shortcut
            return shortcuts;
        }
    }

    const wrapped = new TestNode({ id: 'test', type: 'test' });
    const shortcuts = wrapped.getKeyboardShortcuts();

    assertFalse('e' in shortcuts);
    assertTrue('r' in shortcuts); // Other defaults still work
    assertTrue('c' in shortcuts);
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
