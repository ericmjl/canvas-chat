/**
 * Boot-time loopback normalization flow (#293, Part A).
 *
 * Runs before the App initializes. Three outcomes:
 *
 * 1. Not a loopback alias → nothing happens; the app boots normally.
 * 2. Loopback alias with no data under this origin → redirect to `localhost` now.
 * 3. Loopback alias with data present → show the migration modal first. The user
 *    can export their sessions before leaving an origin that `localhost` cannot
 *    read (storage is partitioned per origin, so the old data is unreachable
 *    after the redirect).
 *
 * Every dependency is injected so the flow runs under JSDOM in unit tests.
 */

import {
    LOOPBACK_REDIRECT_GUARD_KEY,
    planLoopbackRedirect,
} from './origin-normalization.js';

/** Element ids in index.html. */
export const MIGRATION_MODAL_ID = 'loopback-migration-modal';
export const MIGRATION_ORIGIN_ID = 'loopback-migration-origin';
export const MIGRATION_COUNT_ID = 'loopback-migration-count';
export const MIGRATION_EXPORT_ID = 'loopback-migration-export';
export const MIGRATION_CONTINUE_ID = 'loopback-migration-continue';

/**
 * Count what is stored under the current origin.
 *
 * Session JSON lives in the `canvas-chat` database; each session's Yjs document
 * lives in its own `crdt-<sessionId>` database. `indexedDB.databases()` is
 * Chromium-only, so `crdtDatabases` is null where it is unavailable.
 *
 * @param {{ listSessions(): Promise<object[]> }} storage
 * @param {IDBFactory | undefined} indexedDB
 * @returns {Promise<{ sessions: number, crdtDatabases: number | null, total: number }>}
 */
export async function countLocalData(storage, indexedDB) {
    let sessions = 0;
    try {
        const list = await storage.listSessions();
        sessions = Array.isArray(list) ? list.length : 0;
    } catch {
        sessions = 0;
    }

    let crdtDatabases = null;
    if (indexedDB && typeof indexedDB.databases === 'function') {
        try {
            const databases = await indexedDB.databases();
            crdtDatabases = databases.filter(
                (db) => typeof db.name === 'string' && db.name.startsWith('crdt-'),
            ).length;
        } catch {
            crdtDatabases = null;
        }
    }

    return { sessions, crdtDatabases, total: sessions + (crdtDatabases ?? 0) };
}

/**
 * Human-readable description of what was found, e.g. "3 sessions" or
 * "3 sessions and 2 unsaved drafts". CRDT databases without a matching session
 * are in-flight edits that were never saved as a session.
 *
 * @param {{ sessions: number, crdtDatabases: number | null }} data
 * @returns {string}
 */
export function describeLocalData(data) {
    const parts = [];
    if (data.sessions > 0) {
        parts.push(`${data.sessions} session${data.sessions === 1 ? '' : 's'}`);
    }
    if (data.crdtDatabases !== null && data.crdtDatabases > data.sessions) {
        const orphaned = data.crdtDatabases - data.sessions;
        parts.push(`${orphaned} unsaved draft${orphaned === 1 ? '' : 's'}`);
    }
    return parts.join(' and ') || 'no saved data';
}

/**
 * Set the loop guard and navigate.
 *
 * @param {{ setItem(key: string, value: string): void }} sessionStore
 * @param {string} target
 * @param {(url: string) => void} redirect
 */
export function guardedRedirect(sessionStore, target, redirect) {
    sessionStore.setItem(LOOPBACK_REDIRECT_GUARD_KEY, String(Date.now()));
    redirect(target);
}

/**
 * Show the migration modal and wire its two buttons.
 *
 * "Export" downloads one bundle of every session and keeps the modal open.
 * "Continue" (and the close button) sets the guard and redirects.
 *
 * @param {Object} options
 * @param {Document} options.document
 * @param {string} options.href - current page URL, for the origin label
 * @param {{ sessions: number, crdtDatabases: number | null }} options.data
 * @param {string} options.target - the `localhost` URL to continue to
 * @param {{ setItem(key: string, value: string): void }} options.sessionStore
 * @param {(url: string) => void} options.redirect
 * @param {() => Promise<void> | void} options.onExport
 */
export function showMigrationModal(options) {
    const { document, href, data, target, sessionStore, redirect, onExport } = options;
    const modal = document.getElementById(MIGRATION_MODAL_ID);
    if (!modal) {
        // No modal in the DOM (unexpected): fall back to a plain redirect.
        guardedRedirect(sessionStore, target, redirect);
        return;
    }

    const originLabel = document.getElementById(MIGRATION_ORIGIN_ID);
    if (originLabel) originLabel.textContent = new URL(href).host;

    const countLabel = document.getElementById(MIGRATION_COUNT_ID);
    if (countLabel) countLabel.textContent = describeLocalData(data);

    const continueBtn = document.getElementById(MIGRATION_CONTINUE_ID);
    const exportBtn = document.getElementById(MIGRATION_EXPORT_ID);
    const closeBtn = modal.querySelector('.modal-close');

    const proceed = () => {
        modal.style.display = 'none';
        guardedRedirect(sessionStore, target, redirect);
    };

    if (continueBtn) continueBtn.addEventListener('click', proceed);
    if (closeBtn) closeBtn.addEventListener('click', proceed);
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting…';
            try {
                await onExport();
                exportBtn.textContent = 'Exported ✓';
            } catch (err) {
                console.error('[LoopbackMigration] Export failed', err);
                exportBtn.disabled = false;
                exportBtn.textContent = 'Export failed — retry';
            }
        });
    }

    modal.style.display = 'flex';
}

/**
 * Run the whole flow. Call this as the first statement of app boot, before the
 * App is constructed. When `result.handled` is true the caller must NOT boot the
 * App: the page is either navigating away or waiting on the modal.
 *
 * @param {Object} deps
 * @param {string} deps.href
 * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} deps.sessionStore
 * @param {{ listSessions(): Promise<object[]> }} deps.storage
 * @param {IDBFactory | undefined} deps.indexedDB
 * @param {Document} deps.document
 * @param {(url: string) => void} deps.redirect - e.g. `(url) => { window.location.href = url; }`
 * @param {() => Promise<void> | void} deps.onExport - download the sessions bundle
 * @returns {Promise<{ handled: boolean, outcome: 'none' | 'redirected' | 'modal' }>}
 */
export async function runLoopbackNormalization(deps) {
    const { href, sessionStore, storage, indexedDB, document, redirect, onExport } = deps;

    const plan = planLoopbackRedirect(href, sessionStore);
    if (!plan.redirect || plan.target === null) {
        return { handled: false, outcome: 'none' };
    }

    const data = await countLocalData(storage, indexedDB);
    if (data.total === 0) {
        guardedRedirect(sessionStore, plan.target, redirect);
        return { handled: true, outcome: 'redirected' };
    }

    showMigrationModal({
        document,
        href,
        data,
        target: plan.target,
        sessionStore,
        redirect,
        onExport,
    });
    return { handled: true, outcome: 'modal' };
}
