/**
 * Loopback origin normalization (#293, Part A).
 *
 * Browsers partition localStorage and IndexedDB by origin (scheme + host + port).
 * `http://localhost:7865`, `http://127.0.0.1:7865` and `http://0.0.0.0:7865` are
 * therefore three different origins, and the app shows three isolated sets of
 * sessions and settings under them. This module collapses the loopback spellings
 * to `localhost`.
 *
 * Invariants (see docs/how-to/local-addresses.md):
 * - Only the loopback literals are redirected. LAN IPs, tailnet IPs and custom
 *   hostnames are never touched.
 * - Scheme, port, path, query string and hash are preserved.
 * - At most one redirect per tab (sessionStorage guard), so a machine where
 *   `localhost` does not resolve cannot produce a redirect loop.
 *
 * Pure functions only: no DOM, no storage. Callers pass what they need.
 */

/** Hostnames that all denote this machine. Brackets match `URL.hostname`. */
export const LOOPBACK_HOSTNAMES = Object.freeze([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '[::1]',
    '[0:0:0:0:0:0:0:1]',
]);

/** The one spelling every loopback URL is normalized to. */
export const CANONICAL_LOOPBACK_HOST = 'localhost';

/** sessionStorage key that records "this tab already redirected once". */
export const LOOPBACK_REDIRECT_GUARD_KEY = 'canvas-chat-loopback-redirected';

/**
 * Whether a hostname is one of the loopback literals.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLoopbackHostname(hostname) {
    return LOOPBACK_HOSTNAMES.includes(hostname);
}

/**
 * The URL to load instead of the given loopback URL, or null when no redirect applies.
 *
 * Returns null for (a) anything already on `localhost` and (b) anything that is
 * not a loopback literal (LAN IPs, tailnet IPs, custom hostnames).
 *
 * @param {string} href
 * @returns {string | null}
 */
export function normalizeLoopbackUrl(href) {
    const url = new URL(href);
    if (url.hostname === CANONICAL_LOOPBACK_HOST) return null;
    if (!isLoopbackHostname(url.hostname)) return null;
    url.hostname = CANONICAL_LOOPBACK_HOST;
    return url.toString();
}

/**
 * Outcome of {@link planLoopbackRedirect}.
 *
 * @typedef {Object} LoopbackRedirectPlan
 * @property {boolean} redirect - whether to redirect now
 * @property {string | null} target - the `localhost` URL, when one applies
 * @property {'not-applicable' | 'loop-guard' | 'redirect'} reason
 */

/**
 * Decide what to do at boot for the given page URL.
 *
 * @param {string} href
 * @param {{ getItem(key: string): string | null }} sessionStore - sessionStorage-like
 * @returns {LoopbackRedirectPlan}
 */
export function planLoopbackRedirect(href, sessionStore) {
    const target = normalizeLoopbackUrl(href);
    if (target === null) {
        return { redirect: false, target: null, reason: 'not-applicable' };
    }
    if (sessionStore.getItem(LOOPBACK_REDIRECT_GUARD_KEY)) {
        return { redirect: false, target, reason: 'loop-guard' };
    }
    return { redirect: true, target, reason: 'redirect' };
}
