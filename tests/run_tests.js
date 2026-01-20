#!/usr/bin/env node
/**
 * Automatic test discovery and runner for JavaScript/TypeScript tests.
 * Finds all test_*.js and test_*.ts files in the tests directory and runs them.
 */

import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testsDir = __dirname;

/**
 * Find all test files matching test_*.js or test_*.ts pattern
 */
async function discoverTestFiles(specificFile = null) {
    if (specificFile) {
        // If a specific file is provided, use it
        return [specificFile];
    }

    // Auto-discover all test_*.js and test_*.ts files (exclude setup/helper files)
    const files = await readdir(testsDir);
    const testFiles = files
        .filter(
            (file) =>
                file.startsWith('test_') && (file.endsWith('.js') || file.endsWith('.ts')) && file !== 'test_setup.js'
        )
        .map((file) => join(testsDir, file))
        .sort(); // Sort for consistent execution order

    return testFiles;
}

/**
 * Get the appropriate command and args for running a test file
 * .ts files use tsx (TypeScript runner), .js files use node
 */
function getRunCommand(filePath) {
    if (filePath.endsWith('.ts')) {
        return { cmd: 'npx', args: ['tsx', filePath] };
    }
    return { cmd: 'node', args: [filePath] };
}

/**
 * Run a single test file
 */
function runTestFile(filePath) {
    return new Promise((resolve, reject) => {
        const { cmd, args } = getRunCommand(filePath);
        const child = spawn(cmd, args, {
            stdio: 'inherit',
            shell: false,
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve({ file: filePath, passed: true });
            } else {
                resolve({ file: filePath, passed: false, code });
            }
        });

        child.on('error', (err) => {
            reject({ file: filePath, error: err });
        });
    });
}

/**
 * Main test runner
 */
async function main() {
    const specificFile = process.argv[2] || null;

    console.log('🔍 Discovering test files...\n');
    const testFiles = await discoverTestFiles(specificFile);

    if (testFiles.length === 0) {
        console.log('❌ No test files found!');
        process.exit(1);
    }

    console.log(`Found ${testFiles.length} test file(s):`);
    testFiles.forEach((file) => {
        const fileName = file.split('/').pop();
        console.log(`  - ${fileName}`);
    });
    console.log('');

    const results = [];
    for (const file of testFiles) {
        const fileName = file.split('/').pop();
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Running: ${fileName}`);
        console.log('='.repeat(60));

        try {
            const result = await runTestFile(file);
            results.push(result);
        } catch (err) {
            results.push({ file, passed: false, error: err });
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    results.forEach((result) => {
        const fileName = result.file.split('/').pop();
        const status = result.passed ? '✓' : '✗';
        console.log(`${status} ${fileName}`);
    });

    console.log(`\nTotal: ${results.length} file(s) | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
