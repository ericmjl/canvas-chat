/**
 * Module import regression tests
 *
 * Guards against:
 * - Using undefined window.X globals instead of proper imports
 * - Missing import statements
 * - Circular dependency issues
 * - Module loading failures
 *
 * This test catches issues like the window.layoutUtils bug where code
 * tried to access window.layoutUtils.wouldOverlapNodes without importing.
 *
 * Run with: node tests/test_module_imports.js
 */

import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = join(__dirname, '../src/canvas_chat/static/js');

// Color codes for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testCount = 0;
let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
    testCount++;
    try {
        fn();
        passedCount++;
        console.log(`${GREEN}✓${RESET} ${name}`);
    } catch (err) {
        failedCount++;
        console.log(`${RED}✗${RESET} ${name}`);
        console.log(`  ${RED}${err.message}${RESET}`);
        if (err.stack) {
            console.log(`  ${err.stack.split('\n').slice(1, 3).join('\n')}`);
        }
    }
}

/**
 * Check for dangerous window.X patterns that should be imports
 */
async function testNoUndefinedWindowGlobals() {
    const files = await readdir(srcDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    // Patterns to look for: window.X.method() or window.X.property
    // where X is not a standard browser API
    const dangerousPatterns = [
        /window\.layoutUtils\./g,
        /window\.graphTypes\./g,
        /window\.utils\./g,
        /window\.chat\./g,
        /window\.storage\./g,
        /window\.canvas\./g,
    ];

    const standardBrowserAPIs = [
        'window.location',
        'window.localStorage',
        'window.sessionStorage',
        'window.document',
        'window.navigator',
        'window.console',
        'window.fetch',
        'window.setTimeout',
        'window.setInterval',
        'window.requestAnimationFrame',
        'window.getSelection',
        'window.alert',
        'window.confirm',
        'window.prompt',
        'window.performance',
        'window.innerWidth',
        'window.innerHeight',
        'window.open',
        'window.close',
        'window.URL',
        'window.addEventListener',
        'window.removeEventListener',
    ];

    const violations = [];

    for (const file of jsFiles) {
        const content = await readFile(join(srcDir, file), 'utf-8');

        for (const pattern of dangerousPatterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                // Get line number
                const lines = content.substring(0, match.index).split('\n');
                const lineNumber = lines.length;
                const line = content.split('\n')[lineNumber - 1].trim();

                violations.push({
                    file,
                    lineNumber,
                    line,
                    pattern: pattern.source,
                });
            }
        }
    }

    test('No undefined window.X globals (should use imports)', () => {
        if (violations.length > 0) {
            const details = violations.map((v) => `\n    ${v.file}:${v.lineNumber}: ${v.line}`).join('');
            throw new Error(
                `Found ${violations.length} window.X pattern(s) that should use imports:${details}\n\n` +
                    `  Fix: Add proper import statement at top of file instead of using window.X`
            );
        }
    });
}

/**
 * Test that all core modules can be imported without errors
 */
async function testModulesCanBeImported() {
    const coreModules = [
        'graph-types.js',
        'crdt-graph.js',
        'canvas.js',
        'layout.js',
        'utils.js',
        'chat.js',
        'storage.js',
        'event-emitter.js',
        'node-protocols.js',
        'node-registry.js',
    ];

    for (const moduleName of coreModules) {
        await test(`Can import ${moduleName}`, async () => {
            try {
                const modulePath = join(srcDir, moduleName);
                // Dynamic import to catch any syntax or dependency errors
                await import(modulePath);
            } catch (err) {
                throw new Error(`Failed to import ${moduleName}: ${err.message}`);
            }
        });
    }
}

/**
 * Test that layout.js functions are properly exported
 */
async function testLayoutExports() {
    test('layout.js exports wouldOverlapNodes', async () => {
        const { wouldOverlapNodes } = await import(join(srcDir, 'layout.js'));
        if (typeof wouldOverlapNodes !== 'function') {
            throw new Error('wouldOverlapNodes is not exported as a function');
        }
    });

    test('layout.js exports resolveOverlaps', async () => {
        const { resolveOverlaps } = await import(join(srcDir, 'layout.js'));
        if (typeof resolveOverlaps !== 'function') {
            throw new Error('resolveOverlaps is not exported as a function');
        }
    });
}

/**
 * Test that crdt-graph.js properly imports layout functions
 */
async function testCrdtGraphImportsLayout() {
    test('crdt-graph.js imports layout.js (not window.layoutUtils)', async () => {
        const content = await readFile(join(srcDir, 'crdt-graph.js'), 'utf-8');

        // Check for proper import
        const hasImport = /import\s+{[^}]*wouldOverlapNodes[^}]*}\s+from\s+['"]\.\/layout\.js['"]/.test(content);
        if (!hasImport) {
            throw new Error('crdt-graph.js does not import wouldOverlapNodes from layout.js');
        }

        // Check for bad window.layoutUtils usage
        const hasWindowUsage = /window\.layoutUtils\./.test(content);
        if (hasWindowUsage) {
            throw new Error('crdt-graph.js still uses window.layoutUtils instead of direct imports');
        }
    });
}

/**
 * Test that modules don't expose to window (except for intentional backwards compatibility)
 */
async function testNoGlobalPollution() {
    test('Modules use exports, not window assignment', async () => {
        const files = await readdir(srcDir);
        const jsFiles = files.filter((f) => f.endsWith('.js'));

        const violations = [];

        for (const file of jsFiles) {
            const content = await readFile(join(srcDir, file), 'utf-8');

            // Look for window.X = ... patterns (excluding intentional ones with comments)
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Skip if it's in a comment
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
                    continue;
                }

                // Match window.X = ... but not in if (typeof window !== 'undefined') blocks
                if (/window\.\w+\s*=/.test(line)) {
                    // Check if this is in an intentional backwards compatibility block
                    const precedingLines = lines.slice(Math.max(0, i - 5), i).join('\n');
                    const isBackwardsCompat =
                        /backwards?\s+compatibility/i.test(precedingLines) ||
                        /typeof\s+window\s*!==\s*['"]undefined['"]/.test(precedingLines);

                    if (!isBackwardsCompat) {
                        violations.push({
                            file,
                            lineNumber: i + 1,
                            line: line.trim(),
                        });
                    }
                }
            }
        }

        if (violations.length > 0) {
            const details = violations.map((v) => `\n    ${v.file}:${v.lineNumber}: ${v.line}`).join('');
            throw new Error(
                `Found ${violations.length} window.X assignment(s) outside backwards compatibility blocks:${details}\n\n` +
                    `  Fix: Use export instead, or wrap in: if (typeof window !== 'undefined') { window.X = X; }`
            );
        }
    });
}

/**
 * Main test runner
 */
async function main() {
    console.log('Running module import tests...\n');

    try {
        await testNoUndefinedWindowGlobals();
        await testModulesCanBeImported();
        await testLayoutExports();
        await testCrdtGraphImportsLayout();
        await testNoGlobalPollution();
    } catch (err) {
        console.error('\n❌ Fatal error running tests:', err);
        process.exit(1);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`Tests: ${testCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
    console.log('='.repeat(60));

    if (failedCount > 0) {
        console.log(`\n${RED}❌ Some tests failed${RESET}`);
        process.exit(1);
    } else {
        console.log(`\n${GREEN}✓ All tests passed${RESET}`);
        process.exit(0);
    }
}

main();
