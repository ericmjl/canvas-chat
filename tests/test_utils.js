/**
 * Unit tests for concurrent state management in utils.
 * Run with: node tests/test_utils.js
 *
 * Tests the per-instance state pattern for concurrent operations.
 */

import { test, assertEqual, assertTrue, assertFalse } from './test_setup.js';

// ============================================================
// Concurrent State Management Tests
// ============================================================

// Test utilities for simulating concurrent operations
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Concurrent operations maintain separate state', async () => {
    // Simulate a class with per-instance state (correct pattern)
    class CorrectPattern {
        constructor() {
            this.operations = new Map();
        }

        async startOperation(id) {
            const controller = new AbortController();
            this.operations.set(id, { controller, status: 'running' });

            await sleep(10);

            if (this.operations.has(id)) {
                this.operations.get(id).status = 'completed';
            }
        }

        stopOperation(id) {
            if (this.operations.has(id)) {
                this.operations.get(id).controller.abort();
                this.operations.delete(id);
            }
        }

        getStatus(id) {
            return this.operations.get(id)?.status || 'not found';
        }
    }

    const manager = new CorrectPattern();

    // Start two concurrent operations
    manager.startOperation('op1');
    manager.startOperation('op2');

    // Verify both exist with correct state
    assertEqual(manager.getStatus('op1'), 'running');
    assertEqual(manager.getStatus('op2'), 'running');

    // Stop first operation
    manager.stopOperation('op1');

    // Verify first is gone, second still exists
    assertEqual(manager.getStatus('op1'), 'not found');
    assertEqual(manager.getStatus('op2'), 'running');

    // Wait for second to complete
    await sleep(15);
    assertEqual(manager.getStatus('op2'), 'completed');
});

test('Global state anti-pattern fails with concurrent operations', async () => {
    // Simulate a class with global state (wrong pattern - shown for comparison)
    class WrongPattern {
        constructor() {
            this.currentOperation = null;
            this.currentController = null;
        }

        async startOperation(id) {
            // Bug: This overwrites previous operation
            this.currentOperation = id;
            this.currentController = new AbortController();

            await sleep(10);
        }

        stopOperation(id) {
            // Bug: Can only stop the "current" operation
            if (this.currentOperation === id) {
                this.currentController?.abort();
                this.currentOperation = null;
            }
        }

        getStatus(id) {
            return this.currentOperation === id ? 'running' : 'not found';
        }
    }

    const manager = new WrongPattern();

    // Start two operations
    manager.startOperation('op1');
    manager.startOperation('op2'); // This overwrites op1!

    // Bug: op1 is lost
    assertEqual(manager.getStatus('op1'), 'not found');
    assertEqual(manager.getStatus('op2'), 'running');
});

test('Map-based state allows independent control', () => {
    const operations = new Map();

    // Add multiple operations
    operations.set('a', { value: 1 });
    operations.set('b', { value: 2 });
    operations.set('c', { value: 3 });

    // Verify all exist
    assertEqual(operations.size, 3);
    assertEqual(operations.get('a').value, 1);
    assertEqual(operations.get('b').value, 2);
    assertEqual(operations.get('c').value, 3);

    // Remove one
    operations.delete('b');

    // Verify others unchanged
    assertEqual(operations.size, 2);
    assertEqual(operations.get('a').value, 1);
    assertEqual(operations.get('c').value, 3);
    assertFalse(operations.has('b'));
});

test('AbortController per operation allows independent cancellation', () => {
    const operations = new Map();

    // Create multiple operations with controllers
    operations.set('task1', { controller: new AbortController() });
    operations.set('task2', { controller: new AbortController() });
    operations.set('task3', { controller: new AbortController() });

    // Abort only task2
    operations.get('task2').controller.abort();

    // Verify only task2 is aborted
    assertFalse(operations.get('task1').controller.signal.aborted);
    assertTrue(operations.get('task2').controller.signal.aborted);
    assertFalse(operations.get('task3').controller.signal.aborted);
});

// Export tests for the test runner
export { test };
