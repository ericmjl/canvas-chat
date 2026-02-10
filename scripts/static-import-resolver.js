/**
 * Node ESM loader that resolves browser-style /static/js/... imports to the
 * project's src/canvas_chat/static/js/ directory. Used when running JS tests
 * that load example plugins (e.g. smart-fix-plugin, poll) which use absolute
 * paths for browser compatibility.
 *
 * Usage: node --experimental-loader=./scripts/static-import-resolver.js <file>
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const STATIC_JS_PREFIX = '/static/js/';
const STATIC_JS_DIR = join(process.cwd(), 'src', 'canvas_chat', 'static', 'js');

export async function resolve(specifier, context, nextResolve) {
    const norm = specifier.replace(/^file:\/\//, '');
    if (norm.startsWith(STATIC_JS_PREFIX) || norm === '/static/js') {
        const subpath = norm.slice(STATIC_JS_PREFIX.length) || '';
        const fullPath = join(STATIC_JS_DIR, subpath);
        if (existsSync(fullPath)) {
            const url = pathToFileURL(fullPath).href;
            return { url, shortCircuit: true };
        }
    }
    return nextResolve(specifier, context);
}
