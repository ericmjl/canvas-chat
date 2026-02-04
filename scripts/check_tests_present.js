#!/usr/bin/env node

import { execSync } from 'node:child_process';

function getChangedFiles(baseRef) {
    const diffRange = `${baseRef}...HEAD`;
    const output = execSync(`git diff --name-only ${diffRange}`, { encoding: 'utf8' });
    return output.split(/\r?\n/).filter(Boolean);
}

function hasPathPrefix(files, prefixes) {
    return files.some((file) => prefixes.some((prefix) => file.startsWith(prefix)));
}

function main() {
    const baseRefName = process.env.GITHUB_BASE_REF;
    if (!baseRefName) {
        console.log('[check_tests_present] No GITHUB_BASE_REF detected. Skipping test enforcement.');
        return;
    }

    const baseRef = `origin/${baseRefName}`;
    let changedFiles;
    try {
        changedFiles = getChangedFiles(baseRef);
    } catch (error) {
        console.warn(`[check_tests_present] Failed to diff against ${baseRef}:`, error.message);
        return;
    }

    if (changedFiles.length === 0) {
        console.log('[check_tests_present] No changed files detected.');
        return;
    }

    const frontendPrefixes = ['src/canvas_chat/static/'];
    const backendPrefixes = ['src/canvas_chat/'];
    const testPrefixes = ['tests/', 'cypress/e2e/', 'cypress/support/'];
    const storyPrefixes = ['specs/user-stories/'];

    const frontendChanged = hasPathPrefix(changedFiles, frontendPrefixes);
    const backendChanged = changedFiles.some(
        (file) => file.startsWith('src/canvas_chat/') && !file.startsWith('src/canvas_chat/static/')
    );

    const testChanged = hasPathPrefix(changedFiles, testPrefixes) || hasPathPrefix(changedFiles, storyPrefixes);
    const uiTestChanged =
        hasPathPrefix(changedFiles, ['cypress/e2e/', 'cypress/support/', 'specs/user-stories/']) ||
        changedFiles.some((file) => file.endsWith('.feature'));
    const backendTestChanged = hasPathPrefix(changedFiles, ['tests/']);

    const failures = [];

    if (frontendChanged && !uiTestChanged) {
        failures.push('UI changes detected without Cypress feature/step/test updates.');
    }

    if (backendChanged && !backendTestChanged) {
        failures.push('Backend changes detected without Python test updates in tests/.');
    }

    if ((frontendChanged || backendChanged) && !testChanged) {
        failures.push('Code changes detected without any test/spec updates.');
    }

    if (failures.length > 0) {
        console.error('[check_tests_present] Test enforcement failed:');
        for (const failure of failures) {
            console.error(`- ${failure}`);
        }
        process.exit(1);
    }

    console.log('[check_tests_present] Test enforcement passed.');
}

try {
    main();
} catch (error) {
    console.error('[check_tests_present] Failed:', error);
    process.exit(1);
}
