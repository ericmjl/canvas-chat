/**
 * Unit tests for the boot-time loopback migration flow (#293 Part A).
 *
 * Every dependency (document, sessionStorage, storage, indexedDB, redirect) is
 * injected, so these run under JSDOM with no real navigation or IndexedDB.
 */

import { JSDOM } from 'jsdom';

import {
    assertEqual,
    assertFalse,
    assertNotNull,
    assertNull,
    assertTrue,
    test,
} from './test_setup.js';
import {
    LOOPBACK_REDIRECT_GUARD_KEY,
} from '../src/canvas_chat/static/js/origin-normalization.js';
import {
    MIGRATION_CONTINUE_ID,
    MIGRATION_EXPORT_ID,
    countLocalData,
    describeLocalData,
    runLoopbackNormalization,
} from '../src/canvas_chat/static/js/loopback-migration.js';

/** Same ids as index.html so the selectors in loopback-migration.js are exercised. */
const MODAL_HTML = `
<div id="loopback-migration-modal" class="modal" style="display: none">
  <div class="modal-content modal-narrow">
    <div class="modal-header">
      <h2>Move to localhost?</h2>
      <button class="modal-close" id="loopback-migration-close">&times;</button>
    </div>
    <div class="modal-body">
      <p>Opened as <code id="loopback-migration-origin"></code>.</p>
      <p>Found <strong id="loopback-migration-count"></strong> saved.</p>
    </div>
    <div class="modal-actions">
      <button class="secondary-btn" id="loopback-migration-export">Export sessions</button>
      <button class="primary-btn" id="loopback-migration-continue">Continue to localhost</button>
    </div>
  </div>
</div>`;

/** Build an injected dependency bundle plus spies. */
function makeHarness({ href, sessions = [], withGuard = false, indexedDB, withModal = true, exportImpl } = {}) {
    const dom = new JSDOM(`<!DOCTYPE html><body>${withModal ? MODAL_HTML : ''}</body>`);
    const document = dom.window.document;

    const store = new Map();
    if (withGuard) store.set(LOOPBACK_REDIRECT_GUARD_KEY, '1');
    const sessionStore = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
    };

    const redirects = [];
    const listed = { calls: 0 };

    const deps = {
        href,
        sessionStore,
        storage: {
            async listSessions() {
                listed.calls += 1;
                return sessions;
            },
        },
        indexedDB,
        document,
        redirect: (url) => redirects.push(url),
        onExport: exportImpl ?? (async () => {}),
    };

    return { deps, redirects, listed, store, document };
}

// =============================================================================
// describeLocalData
// =============================================================================

test('describeLocalData: pluralizes sessions', () => {
    assertEqual(describeLocalData({ sessions: 1, crdtDatabases: null }), '1 session');
    assertEqual(describeLocalData({ sessions: 3, crdtDatabases: null }), '3 sessions');
});

test('describeLocalData: CRDT databases beyond sessions are unsaved drafts', () => {
    assertEqual(describeLocalData({ sessions: 3, crdtDatabases: 5 }), '3 sessions and 2 unsaved drafts');
    assertEqual(describeLocalData({ sessions: 2, crdtDatabases: 2 }), '2 sessions');
});

test('describeLocalData: drafts only, and nothing at all', () => {
    assertEqual(describeLocalData({ sessions: 0, crdtDatabases: 1 }), '1 unsaved draft');
    assertEqual(describeLocalData({ sessions: 0, crdtDatabases: null }), 'no saved data');
});

// =============================================================================
// countLocalData
// =============================================================================

test('countLocalData: counts sessions; crdtDatabases is null without indexedDB.databases', async () => {
    const data = await countLocalData({ listSessions: async () => [{}, {}] }, undefined);
    assertEqual(data.sessions, 2);
    assertNull(data.crdtDatabases);
    assertEqual(data.total, 2);
});

test('countLocalData: counts only crdt-* databases', async () => {
    const indexedDB = {
        async databases() {
            return [{ name: 'canvas-chat' }, { name: 'crdt-a' }, { name: 'crdt-b' }, { name: 'other' }, {}];
        },
    };
    const data = await countLocalData({ listSessions: async () => [{}, {}, {}] }, indexedDB);
    assertEqual(data.sessions, 3);
    assertEqual(data.crdtDatabases, 2);
    assertEqual(data.total, 5);
});

test('countLocalData: a failing listSessions counts as zero, not an error', async () => {
    const data = await countLocalData(
        { listSessions: async () => { throw new Error('db closed'); } },
        undefined,
    );
    assertEqual(data.sessions, 0);
    assertEqual(data.total, 0);
});

// =============================================================================
// runLoopbackNormalization — when it does nothing
// =============================================================================

test('run: non-loopback page is ignored and storage is never touched', async () => {
    const h = makeHarness({ href: 'http://192.168.1.20:7865/' });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.handled, false);
    assertEqual(result.outcome, 'none');
    assertEqual(h.redirects.length, 0);
    assertEqual(h.listed.calls, 0);
});

test('run: localhost page is ignored', async () => {
    const h = makeHarness({ href: 'http://localhost:7865/' });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.handled, false);
    assertEqual(h.redirects.length, 0);
});

test('run: guard already set → no redirect, no storage read (loop guard)', async () => {
    const h = makeHarness({ href: 'http://127.0.0.1:7865/', withGuard: true });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.handled, false);
    assertEqual(result.outcome, 'none');
    assertEqual(h.redirects.length, 0);
    assertEqual(h.listed.calls, 0);
});

// =============================================================================
// runLoopbackNormalization — redirect path
// =============================================================================

test('run: loopback page with no data → guard set, redirect to localhost with query intact', async () => {
    const h = makeHarness({ href: 'http://127.0.0.1:7865/?session=abc&multiplayer=true', sessions: [] });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.handled, true);
    assertEqual(result.outcome, 'redirected');
    assertEqual(h.redirects, ['http://localhost:7865/?session=abc&multiplayer=true']);
    assertNotNull(h.store.get(LOOPBACK_REDIRECT_GUARD_KEY));
});

test('run: 0.0.0.0 with no data → redirects; modal stays hidden', async () => {
    const h = makeHarness({ href: 'http://0.0.0.0:7865/', sessions: [] });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.outcome, 'redirected');
    assertEqual(h.redirects, ['http://localhost:7865/']);
    assertEqual(h.document.getElementById('loopback-migration-modal').style.display, 'none');
});

// =============================================================================
// runLoopbackNormalization — modal path
// =============================================================================

test('run: loopback page with sessions → modal shown with origin + count, no redirect yet', async () => {
    const h = makeHarness({ href: 'http://127.0.0.1:7865/', sessions: [{}, {}, {}] });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.handled, true);
    assertEqual(result.outcome, 'modal');
    assertEqual(h.redirects.length, 0);
    assertTrue(!h.store.has(LOOPBACK_REDIRECT_GUARD_KEY));

    const modal = h.document.getElementById('loopback-migration-modal');
    assertEqual(modal.style.display, 'flex');
    assertEqual(h.document.getElementById('loopback-migration-origin').textContent, '127.0.0.1:7865');
    assertEqual(h.document.getElementById('loopback-migration-count').textContent, '3 sessions');
});

test('run: modal Continue → guard set, modal hidden, redirect', async () => {
    const h = makeHarness({ href: 'http://127.0.0.1:7865/', sessions: [{}] });
    await runLoopbackNormalization(h.deps);

    h.document.getElementById(MIGRATION_CONTINUE_ID).click();
    await Promise.resolve();

    assertEqual(h.redirects, ['http://localhost:7865/']);
    assertNotNull(h.store.get(LOOPBACK_REDIRECT_GUARD_KEY));
    assertEqual(h.document.getElementById('loopback-migration-modal').style.display, 'none');
});

test('run: modal close (×) behaves like Continue', async () => {
    const h = makeHarness({ href: 'http://127.0.0.1:7865/', sessions: [{}] });
    await runLoopbackNormalization(h.deps);

    h.document.querySelector('#loopback-migration-modal .modal-close').click();
    await Promise.resolve();

    assertEqual(h.redirects, ['http://localhost:7865/']);
});

test('run: modal Export → calls onExport once, marks button, does NOT redirect', async () => {
    let exported = 0;
    const h = makeHarness({ href: 'http://127.0.0.1:7865/', sessions: [{}, {}], exportImpl: async () => { exported += 1; } });
    await runLoopbackNormalization(h.deps);

    const exportBtn = h.document.getElementById(MIGRATION_EXPORT_ID);
    exportBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    assertEqual(exported, 1);
    assertEqual(exportBtn.disabled, true);
    assertEqual(exportBtn.textContent, 'Exported ✓');
    assertEqual(h.redirects.length, 0);
    assertTrue(!h.store.has(LOOPBACK_REDIRECT_GUARD_KEY));
});

test('run: modal Export failure → button re-enabled with retry label, still no redirect', async () => {
    const h = makeHarness({
        href: 'http://127.0.0.1:7865/',
        sessions: [{}],
        exportImpl: async () => { throw new Error('disk full'); },
    });
    const originalError = console.error;
    console.error = () => {};
    try {
        await runLoopbackNormalization(h.deps);
        const exportBtn = h.document.getElementById(MIGRATION_EXPORT_ID);
        exportBtn.click();
        await new Promise((r) => setTimeout(r, 0));

        assertEqual(exportBtn.disabled, false);
        assertEqual(exportBtn.textContent, 'Export failed — retry');
        assertEqual(h.redirects.length, 0);
    } finally {
        console.error = originalError;
    }
});

test('run: data present but modal missing from DOM → falls back to guarded redirect', async () => {
    const h = makeHarness({ href: 'http://127.0.0.1:7865/', sessions: [{}], withModal: false });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.outcome, 'modal');
    assertEqual(h.redirects, ['http://localhost:7865/']);
    assertNotNull(h.store.get(LOOPBACK_REDIRECT_GUARD_KEY));
});

test('run: only unsaved CRDT drafts (no sessions) still triggers the modal', async () => {
    const indexedDB = { async databases() { return [{ name: 'crdt-x' }]; } };
    const h = makeHarness({ href: 'http://[::1]:7865/', sessions: [], indexedDB });
    const result = await runLoopbackNormalization(h.deps);
    assertEqual(result.outcome, 'modal');
    assertEqual(h.document.getElementById('loopback-migration-count').textContent, '1 unsaved draft');
    assertFalse(h.redirects.length > 0);
});
