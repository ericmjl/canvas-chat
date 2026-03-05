/**
 * Unit tests for keybindings.js (keyboard shortcut remapping).
 * TDD: run with pixi run test-js or node tests/test_keybindings.js
 */

import {
    test,
    assertEqual,
    assertTrue,
    assertFalse,
    tests,
} from './test_setup.js';
import {
    eventToKeyString,
    mergeKeybindings,
    buildKeyToActionMap,
    getActionForKey,
    DEFAULT_KEYBINDINGS,
    getActionList,
    getEffectiveKeybindings,
} from '../src/canvas_chat/static/js/keybindings.js';

// ============================================================
// eventToKeyString
// ============================================================

test('eventToKeyString: single letter key', () => {
    assertEqual(eventToKeyString({ key: 'k' }), 'k');
    assertEqual(eventToKeyString({ key: 'r' }), 'r');
});

test('eventToKeyString: with Shift', () => {
    assertEqual(eventToKeyString({ key: 'Z', shiftKey: true }), 'Shift+Z');
});

test('eventToKeyString: with Ctrl', () => {
    assertEqual(eventToKeyString({ key: 'k', ctrlKey: true }), 'Ctrl+k');
});

test('eventToKeyString: with Meta (Cmd) normalizes to Ctrl', () => {
    assertEqual(eventToKeyString({ key: 'k', metaKey: true }), 'Ctrl+k');
});

test('eventToKeyString: special keys', () => {
    assertEqual(eventToKeyString({ key: 'ArrowUp' }), 'ArrowUp');
    assertEqual(eventToKeyString({ key: 'Escape' }), 'Escape');
    assertEqual(eventToKeyString({ key: 'Backspace' }), 'Backspace');
    assertEqual(eventToKeyString({ key: 'Enter' }), 'Enter');
});

test('eventToKeyString: modifier-only or empty key returns null', () => {
    assertEqual(eventToKeyString({ key: '', shiftKey: false }), null);
});

// ============================================================
// mergeKeybindings
// ============================================================

test('mergeKeybindings: empty overrides returns defaults', () => {
    const defaults = { reply: [{ key: 'r' }], undo: [{ key: 'z', ctrl: true }] };
    const merged = mergeKeybindings(defaults, {});
    assertEqual(merged.reply.length, 1);
    assertEqual(merged.reply[0].key, 'r');
    assertEqual(merged.undo[0].key, 'z');
    assertTrue(merged.undo[0].ctrl);
});

test('mergeKeybindings: override one action', () => {
    const defaults = { reply: [{ key: 'r' }], copy: [{ key: 'c' }] };
    const overrides = { reply: { key: 'x' } };
    const merged = mergeKeybindings(defaults, overrides);
    assertEqual(merged.reply.length, 1);
    assertEqual(merged.reply[0].key, 'x');
    assertEqual(merged.copy[0].key, 'c');
});

test('mergeKeybindings: override with modifiers', () => {
    const defaults = { undo: [{ key: 'z', ctrl: true }] };
    const overrides = { undo: { key: 'u', ctrl: true } };
    const merged = mergeKeybindings(defaults, overrides);
    assertEqual(merged.undo.length, 1);
    assertEqual(merged.undo[0].key, 'u');
    assertTrue(merged.undo[0].ctrl);
});

test('mergeKeybindings: unknown actionId in overrides ignored', () => {
    const defaults = { reply: [{ key: 'r' }] };
    const overrides = { unknownAction: { key: 'x' } };
    const merged = mergeKeybindings(defaults, overrides);
    assertFalse('unknownAction' in merged);
    assertEqual(merged.reply[0].key, 'r');
});

// ============================================================
// buildKeyToActionMap
// ============================================================

test('buildKeyToActionMap: default keys map to actions', () => {
    const effective = {
        reply: [{ key: 'r' }],
        navigateParent: [{ key: 'ArrowUp' }, { key: 'j' }],
        undo: [{ key: 'z', ctrl: true }],
    };
    const map = buildKeyToActionMap(effective);
    assertEqual(map['r'], 'reply');
    assertEqual(map['ArrowUp'], 'navigateParent');
    assertEqual(map['j'], 'navigateParent');
    assertEqual(map['Ctrl+z'], 'undo');
});

test('buildKeyToActionMap: duplicate key last wins', () => {
    const effective = {
        reply: [{ key: 'x' }],
        copy: [{ key: 'x' }],
    };
    const map = buildKeyToActionMap(effective);
    assertEqual(map['x'], 'copy');
});

// ============================================================
// getActionForKey
// ============================================================

test('getActionForKey: returns action for key', () => {
    const map = { r: 'reply', 'Ctrl+k': 'search' };
    assertEqual(getActionForKey({ key: 'r' }, map), 'reply');
    assertEqual(getActionForKey({ key: 'k', ctrlKey: true }, map), 'search');
});

test('getActionForKey: returns null for unmapped key', () => {
    const map = { r: 'reply' };
    assertEqual(getActionForKey({ key: 'x' }, map), null);
});

// ============================================================
// DEFAULT_KEYBINDINGS and getActionList
// ============================================================

test('getActionList: returns array with actionId and label', () => {
    const list = getActionList();
    assertTrue(Array.isArray(list));
    assertTrue(list.length > 0);
    list.forEach((item) => {
        assertTrue('actionId' in item);
        assertTrue('label' in item);
        assertTrue(item.label.length > 0);
    });
});

test('getActionList: every DEFAULT_KEYBINDINGS action has entry', () => {
    const list = getActionList();
    const ids = new Set(list.map((item) => item.actionId));
    Object.keys(DEFAULT_KEYBINDINGS).forEach((actionId) => {
        assertTrue(ids.has(actionId), `Missing actionId in getActionList: ${actionId}`);
    });
});

// ============================================================
// getEffectiveKeybindings
// ============================================================

test('getEffectiveKeybindings: with no overrides returns defaults', () => {
    const effective = getEffectiveKeybindings(() => ({}));
    assertTrue('reply' in effective);
    assertTrue(Array.isArray(effective.reply));
});

test('getEffectiveKeybindings: with overrides merges', () => {
    const effective = getEffectiveKeybindings(() => ({ reply: { key: 'x' } }));
    assertEqual(effective.reply.length, 1);
    assertEqual(effective.reply[0].key, 'x');
});

// ============================================================
// Runner (test_setup collects tests; run them here)
// ============================================================
let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.error(`  ${err.message}`);
        failed++;
    }
}
console.log(`\n========================================`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('========================================\n');
process.exit(failed > 0 ? 1 : 0);
