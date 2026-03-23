/**
 * Keybindings module - default shortcuts and user overrides for keyboard shortcut remapping.
 * Uses pure functions for testability; getEffectiveKeybindings wires to storage.
 */

import { storage } from './storage.js';

/**
 * Build a key string from key and modifier flags (single source of truth for format).
 * Letter keys without modifier: lowercase. With Shift: key as-reported (e.g. Z).
 * Modifiers: Ctrl (never Meta), Alt (Option on Mac), Shift. Format: "Key" or "Modifier+Key".
 * @param {string} key - KeyboardEvent.key
 * @param {boolean} [shiftKey]
 * @param {boolean} [ctrlKey] - true if ctrl OR meta (Cmd on Mac)
 * @param {boolean} [altKey]
 * @returns {string} e.g. "r", "Ctrl+k", "Shift+Z", "Alt+p"
 */
function keyAndModifiersToKeyString(key, shiftKey, ctrlKey, altKey) {
    if (!key || key.length === 0) return null;
    const parts = [];
    if (ctrlKey) parts.push('Ctrl');
    if (altKey) parts.push('Alt');
    if (shiftKey) parts.push('Shift');
    let keyPart = key;
    if (key.length === 1 && key >= 'A' && key <= 'Z' && !shiftKey) keyPart = key.toLowerCase();
    if (key.length === 1 && key >= 'a' && key <= 'z' && !ctrlKey && !shiftKey && !altKey) keyPart = key;
    parts.push(keyPart);
    return parts.length === 1 ? keyPart : parts.join('+');
}

/**
 * Normalize a key event to a key string for storage and lookup.
 * Treats metaKey (Cmd on Mac) as ctrl so one binding works cross-platform.
 * @param {{ key: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} e - Event-like object
 * @returns {string|null} Normalized key string, or null for modifier-only/invalid
 */
export function eventToKeyString(e) {
    if (!e || !e.key || e.key.length === 0) return null;
    const ctrl = !!(e.ctrlKey || e.metaKey);
    const alt = !!e.altKey;
    return keyAndModifiersToKeyString(e.key, !!e.shiftKey, ctrl, alt);
}

/**
 * Convert a key event to a spec object for storage (overrides).
 * Letter keys without Shift stored lowercase.
 * @param {{ key: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} e
 * @returns {{ key: string, shift?: boolean, ctrl?: boolean, alt?: boolean }|null}
 */
export function eventToSpec(e) {
    if (!e || !e.key || e.key.length === 0) return null;
    const key =
        e.key.length === 1 && e.key >= 'A' && e.key <= 'Z' && !e.shiftKey ? e.key.toLowerCase() : e.key;
    return {
        key,
        shift: !!e.shiftKey,
        ctrl: !!(e.ctrlKey || e.metaKey),
        alt: !!e.altKey,
    };
}

/**
 * Convert a key spec to key string for buildKeyToActionMap.
 * @param {{ key: string, shift?: boolean, ctrl?: boolean, alt?: boolean }} spec
 * @returns {string}
 */
function specToKeyString(spec) {
    return keyAndModifiersToKeyString(spec.key, !!spec.shift, !!spec.ctrl, !!spec.alt);
}

/**
 * Default keybindings: actionId -> array of key specs (one action can have multiple default keys).
 * Action IDs must match node protocol getKeyboardShortcuts() action values where applicable.
 */
export const DEFAULT_KEYBINDINGS = {
    search: [{ key: 'k', ctrl: true }],
    popoverConfirm: [{ key: 'Enter' }],
    navigateParent: [{ key: 'ArrowUp' }, { key: 'j' }],
    navigateChild: [{ key: 'ArrowDown' }, { key: 'k' }],
    help: [{ key: '?' }],
    undo: [{ key: 'z', ctrl: true }],
    redo: [{ key: 'z', ctrl: true, shift: true }],
    deleteNodes: [{ key: 'Delete' }, { key: 'Backspace' }],
    reply: [{ key: 'r' }],
    copy: [{ key: 'c' }],
    'edit-content': [{ key: 'e' }],
    'edit-code': [{ key: 'e' }],
    fitViewport: [{ key: 'f' }],
    collapse: [{ key: '-' }],
    expand: [{ key: '=' }],
    zoomSelection: [{ key: 'z' }],
    zoomFitAll: [{ key: 'Z', shift: true }],
    runCode: [{ key: 'Enter', ctrl: true }],
    generate: [{ key: 'A', shift: true }],
    analyze: [{ key: 'A', shift: true }],
    'flip-card': [{ key: 'f' }],
    'prev-slide': [{ key: 'ArrowLeft' }],
    'next-slide': [{ key: 'ArrowRight' }],
};

/**
 * Labels and optional category for each action (single source of truth with DEFAULT_KEYBINDINGS).
 */
const ACTION_LABELS = {
    search: { label: 'Search nodes', category: 'global' },
    popoverConfirm: { label: 'Confirm navigation menu', category: 'global' },
    navigateParent: { label: 'Navigate to parent', category: 'navigation' },
    navigateChild: { label: 'Navigate to child', category: 'navigation' },
    help: { label: 'Show help', category: 'global' },
    undo: { label: 'Undo', category: 'global' },
    redo: { label: 'Redo', category: 'global' },
    deleteNodes: { label: 'Delete selected nodes', category: 'global' },
    reply: { label: 'Reply (focus input)', category: 'node' },
    copy: { label: 'Copy node content', category: 'node' },
    'edit-content': { label: 'Edit content', category: 'node' },
    'edit-code': { label: 'Edit code', category: 'node' },
    fitViewport: { label: 'Fit node to viewport', category: 'node' },
    collapse: { label: 'Collapse children', category: 'node' },
    expand: { label: 'Expand children', category: 'node' },
    zoomSelection: { label: 'Zoom to selection', category: 'node' },
    zoomFitAll: { label: 'Zoom to fit all', category: 'global' },
    runCode: { label: 'Run code', category: 'node' },
    generate: { label: 'Generate (AI)', category: 'node' },
    analyze: { label: 'Analyze (AI)', category: 'node' },
    'flip-card': { label: 'Flip flashcard', category: 'node' },
    'prev-slide': { label: 'Previous slide', category: 'node' },
    'next-slide': { label: 'Next slide', category: 'node' },
};

/**
 * Merge default keybindings with user overrides.
 * Overrides replace the default keys for that action; unknown actionIds in overrides are ignored.
 * @param {Object.<string, Array<{key: string, shift?: boolean, ctrl?: boolean, alt?: boolean}>>} defaults
 * @param {Object.<string, {key: string, shift?: boolean, ctrl?: boolean, alt?: boolean}>} overrides
 * @returns {Object.<string, Array<{key: string, shift?: boolean, ctrl?: boolean, alt?: boolean}>>}
 */
export function mergeKeybindings(defaults, overrides) {
    const result = {};
    for (const [actionId, specs] of Object.entries(defaults)) {
        result[actionId] = Array.isArray(specs) ? specs.map((s) => ({ ...s })) : [{ ...specs }];
    }
    if (overrides && typeof overrides === 'object') {
        for (const [actionId, spec] of Object.entries(overrides)) {
            if (actionId in result && spec && typeof spec === 'object' && spec.key) {
                result[actionId] = [
                    {
                        key: spec.key,
                        shift: !!spec.shift,
                        ctrl: !!spec.ctrl,
                        alt: !!spec.alt,
                    },
                ];
            }
        }
    }
    return result;
}

/**
 * Build a key string -> actionId map from effective keybindings.
 * Multiple keys can map to the same actionId; if one key maps to two actions, last wins.
 * @param {Object.<string, Array<{key: string, shift?: boolean, ctrl?: boolean, alt?: boolean}>>} effectiveKeybindings
 * @returns {Object.<string, string>} keyString -> actionId
 */
export function buildKeyToActionMap(effectiveKeybindings) {
    const map = {};
    for (const [actionId, specs] of Object.entries(effectiveKeybindings)) {
        for (const spec of specs) {
            const keyString = specToKeyString(spec);
            if (keyString) map[keyString] = actionId;
        }
    }
    return map;
}

/**
 * Get the actionId for a key event from the key->action map, or null.
 * @param {{ key: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} keyEvent
 * @param {Object.<string, string>} keyToActionMap
 * @returns {string|null}
 */
export function getActionForKey(keyEvent, keyToActionMap) {
    const keyString = eventToKeyString(keyEvent);
    if (!keyString) return null;
    return keyToActionMap[keyString] ?? null;
}

/**
 * Get all actionIds that are bound to a given key string (for node actions that share a key).
 * @param {string} keyString
 * @param {Object.<string, Array<{key: string, shift?: boolean, ctrl?: boolean, alt?: boolean}>>} effectiveKeybindings
 * @returns {string[]}
 */
export function getActionIdsForKey(keyString, effectiveKeybindings) {
    const ids = [];
    for (const [actionId, specs] of Object.entries(effectiveKeybindings)) {
        for (const spec of specs) {
            if (specToKeyString(spec) === keyString) {
                ids.push(actionId);
                break;
            }
        }
    }
    return ids;
}

/**
 * Get effective keybindings (defaults merged with overrides).
 * @param {() => Object} [getOverrides] - Defaults to () => storage.getKeybindings()
 * @returns {Object.<string, Array<{key: string, shift?: boolean, ctrl?: boolean, alt?: boolean}>>}
 */
export function getEffectiveKeybindings(getOverrides) {
    const overrides = getOverrides ? getOverrides() : storage.getKeybindings();
    return mergeKeybindings(DEFAULT_KEYBINDINGS, overrides);
}

/**
 * Get list of actions with labels and category for Settings/Help UI.
 * Derived from DEFAULT_KEYBINDINGS so there is a single source of truth.
 * @returns {Array<{actionId: string, label: string, category?: string}>}
 */
export function getActionList() {
    return Object.keys(DEFAULT_KEYBINDINGS).map((actionId) => ({
        actionId,
        label: (ACTION_LABELS[actionId] && ACTION_LABELS[actionId].label) || actionId,
        category: (ACTION_LABELS[actionId] && ACTION_LABELS[actionId].category) || 'global',
    }));
}

/**
 * Get display string for an action's key from effective keybindings (e.g. "⌘K").
 * @param {string} actionId
 * @param {Object.<string, Array<{key: string, shift?: boolean, ctrl?: boolean, alt?: boolean}>>} effectiveKeybindings
 * @returns {string}
 */
export function getKeyDisplayForAction(actionId, effectiveKeybindings) {
    const specs = effectiveKeybindings[actionId];
    if (!specs || specs.length === 0) return '—';
    const first = specs[0];
    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
    const sep = isMac ? '' : '+';
    const modParts = [];
    if (first.ctrl) modParts.push(isMac ? '⌘' : 'Ctrl');
    if (first.alt) modParts.push(isMac ? '⌥' : 'Alt');
    if (first.shift) modParts.push(isMac ? '⇧' : 'Shift');
    const keyLabel = formatKeyLabelForDisplay(first.key, isMac);
    return [...modParts, keyLabel].join(sep);
}

/**
 * Format a single key name for display (brackets, arrows).
 * @param {string} key
 * @param {boolean} isMac
 * @returns {string}
 */
function formatKeyLabelForDisplay(key, isMac) {
    if (key === 'BracketLeft') return isMac ? '[' : '[';
    if (key === 'BracketRight') return isMac ? ']' : ']';
    if (key === 'ArrowUp') return '↑';
    if (key === 'ArrowDown') return '↓';
    if (key === 'ArrowLeft') return '←';
    if (key === 'ArrowRight') return '→';
    return key;
}

/**
 * Format a key string for display (e.g. show Cmd on Mac instead of Ctrl).
 * @param {string} keyString
 * @param {boolean} [isMac] - Defaults to navigator.platform when in browser
 * @returns {string}
 */
export function formatKeyForDisplay(keyString, isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)) {
    if (!keyString) return '';
    if (isMac && keyString.startsWith('Ctrl+')) {
        return '⌘' + keyString.slice(5);
    }
    return keyString;
}
