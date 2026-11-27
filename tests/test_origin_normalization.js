/**
 * Unit tests for loopback origin normalization (#293 Part A).
 * Pure functions in origin-normalization.js: no DOM, no storage.
 */

import { assertEqual, assertFalse, assertNotNull, assertNull, test } from './test_setup.js';
import {
    CANONICAL_LOOPBACK_HOST,
    LOOPBACK_REDIRECT_GUARD_KEY,
    isLoopbackHostname,
    normalizeLoopbackUrl,
    planLoopbackRedirect,
} from '../src/canvas_chat/static/js/origin-normalization.js';

/** Minimal sessionStorage-like store. */
function makeSessionStore(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        _map: map,
    };
}

// =============================================================================
// isLoopbackHostname
// =============================================================================

test('isLoopbackHostname: true for every loopback literal', () => {
    for (const host of ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '[0:0:0:0:0:0:0:1]']) {
        assertTrue(isLoopbackHostname(host), `expected ${host} to be loopback`);
    }
});

test('isLoopbackHostname: false for LAN, tailnet, public and empty hosts', () => {
    for (const host of ['192.168.1.20', '10.0.0.3', '172.16.4.4', 'mybox.tailnet.ts.net', 'myhost.local', 'ericmjl--canvas-chat-fastapi-app.modal.run', '']) {
        assertFalse(isLoopbackHostname(host), `expected ${host} NOT to be loopback`);
    }
});

// =============================================================================
// normalizeLoopbackUrl
// =============================================================================

test('normalizeLoopbackUrl: 127.0.0.1 → localhost, scheme/port/path/query preserved', () => {
    assertEqual(normalizeLoopbackUrl('http://127.0.0.1:7865/'), 'http://localhost:7865/');
    assertEqual(
        normalizeLoopbackUrl('http://127.0.0.1:7865/canvas?session=abc&multiplayer=true'),
        'http://localhost:7865/canvas?session=abc&multiplayer=true',
    );
});

test('normalizeLoopbackUrl: 0.0.0.0 → localhost', () => {
    assertEqual(normalizeLoopbackUrl('http://0.0.0.0:7865/'), 'http://localhost:7865/');
});

test('normalizeLoopbackUrl: IPv6 loopback spellings → localhost', () => {
    assertEqual(normalizeLoopbackUrl('http://[::1]:7865/'), 'http://localhost:7865/');
    assertEqual(normalizeLoopbackUrl('http://[0:0:0:0:0:0:0:1]:7865/'), 'http://localhost:7865/');
});

test('normalizeLoopbackUrl: TLS scheme is preserved (no downgrade to http)', () => {
    assertEqual(
        normalizeLoopbackUrl('https://127.0.0.1:8443/path/prefix#frag'),
        'https://localhost:8443/path/prefix#frag',
    );
});

test('normalizeLoopbackUrl: already on localhost → null', () => {
    assertNull(normalizeLoopbackUrl('http://localhost:7865/'));
    assertNull(normalizeLoopbackUrl('http://localhost:7865/?session=abc'));
});

test('normalizeLoopbackUrl: LAN, tailnet and public hosts are never rewritten → null', () => {
    assertNull(normalizeLoopbackUrl('http://192.168.1.20:7865/'));
    assertNull(normalizeLoopbackUrl('http://10.0.0.3:7865/app'));
    assertNull(normalizeLoopbackUrl('http://mybox.tailnet.ts.net:7865/'));
    assertNull(normalizeLoopbackUrl('https://ericmjl--canvas-chat-fastapi-app.modal.run/'));
});

// =============================================================================
// planLoopbackRedirect
// =============================================================================

test('planLoopbackRedirect: non-loopback page → not-applicable, no target', () => {
    const plan = planLoopbackRedirect('http://192.168.1.20:7865/', makeSessionStore());
    assertEqual(plan.redirect, false);
    assertEqual(plan.reason, 'not-applicable');
    assertNull(plan.target);
});

test('planLoopbackRedirect: localhost page → not-applicable (never re-redirects)', () => {
    const plan = planLoopbackRedirect('http://localhost:7865/', makeSessionStore());
    assertEqual(plan.redirect, false);
    assertEqual(plan.reason, 'not-applicable');
    assertNull(plan.target);
});

test('planLoopbackRedirect: 127.0.0.1 with no guard → redirect with localhost target', () => {
    const plan = planLoopbackRedirect('http://127.0.0.1:7865/?session=abc', makeSessionStore());
    assertEqual(plan.redirect, true);
    assertEqual(plan.reason, 'redirect');
    assertEqual(plan.target, 'http://localhost:7865/?session=abc');
});

test('planLoopbackRedirect: guard already set → loop-guard, redirect suppressed', () => {
    const store = makeSessionStore({ [LOOPBACK_REDIRECT_GUARD_KEY]: '123' });
    const plan = planLoopbackRedirect('http://127.0.0.1:7865/', store);
    assertEqual(plan.redirect, false);
    assertEqual(plan.reason, 'loop-guard');
    assertNotNull(plan.target);
    assertEqual(plan.target, `http://${CANONICAL_LOOPBACK_HOST}:7865/`);
});
