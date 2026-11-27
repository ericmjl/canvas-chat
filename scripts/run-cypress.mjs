#!/usr/bin/env node
/**
 * Run the Cypress CLI with a clean Electron environment.
 *
 * Why this exists
 * ---------------
 * Electron-based hosts (T3, VS Code, Cursor) export `ELECTRON_RUN_AS_NODE=1` to
 * every child shell so their bundled Node can be used as plain Node. Cypress is
 * itself an Electron app. Under that variable its binary starts as Node and
 * exits with `bad option: --no-sandbox` and "Cypress failed to start". That
 * happens before `cypress.config.js` is ever loaded, so the variable cannot be
 * dropped from config. Child processes inherit the environment, so the one
 * reliable place to remove it is this process, which spawns the Cypress CLI.
 *
 * Usage
 * -----
 *   node scripts/run-cypress.mjs verify
 *   node scripts/run-cypress.mjs run --browser electron --headless --spec cypress/e2e/new_canvas.cy.js
 *   node scripts/run-cypress.mjs open
 *
 * Or through pixi: `pixi run cypress <args>` (see `[tool.pixi.tasks]` in
 * `pyproject.toml`).
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Path to the Cypress CLI entry (`node_modules/cypress/bin/cypress`).
 *
 * The package's `exports` map does not expose `./bin/cypress`, so resolve the
 * package root through its main entry (`<pkg>/dist/index.js`) and walk up one
 * directory.
 *
 * @returns {string} Absolute path to the CLI entry script.
 */
function resolveCypressCli() {
    let main;
    try {
        main = require.resolve('cypress');
    } catch {
        console.error('[run-cypress] The `cypress` package is not installed. Run `npm install` first.');
        process.exit(1);
    }
    const packageRoot = path.dirname(path.dirname(main));
    return path.join(packageRoot, 'bin', 'cypress');
}

// Spawn the CLI with the variable removed. Everything else is inherited as is.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(process.execPath, [resolveCypressCli(), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env,
});

if (result.error) {
    console.error('[run-cypress] Failed to start Cypress:', result.error.message);
    process.exit(1);
}
process.exit(result.status ?? 1);
