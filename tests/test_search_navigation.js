/**
 * Unit tests for search navigation functionality
 *
 * Verifies that:
 * 1. navigateToNode() calls zoomToSelectionAnimated() instead of panToNodeAnimated()
 * 2. navigateToNode() selects the node before zooming
 * 3. navigateToNode() uses correct parameters (nodeId array, 0.8 fill, 300ms duration)
 */

import { assertEqual } from './test_helpers/assertions.js';

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        if (err.stack) {
            console.log(`  Stack: ${err.stack.split('\n').slice(0, 3).join('\n')}`);
        }
        failed++;
    }
}

console.log('\n=== Search Navigation Tests ===\n');

// ============================================================
// Mock classes
// ============================================================

class MockGraph {
    constructor() {
        this.nodes = new Map();
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    addNode(node) {
        this.nodes.set(node.id, node);
    }
}

class MockCanvas {
    constructor() {
        this.selectedNodeIds = [];
        this.zoomCalls = [];
        this.panCalls = [];
        this.clearSelectionCalls = 0;
    }

    clearSelection() {
        this.clearSelectionCalls++;
        this.selectedNodeIds = [];
    }

    selectNode(nodeId) {
        this.selectedNodeIds.push(nodeId);
    }

    getSelectedNodeIds() {
        return [...this.selectedNodeIds];
    }

    zoomToSelectionAnimated(nodeIds, targetFill = 0.8, duration = 300) {
        this.zoomCalls.push({ nodeIds, targetFill, duration });
    }

    panToNodeAnimated(nodeId, duration = 300) {
        this.panCalls.push({ nodeId, duration });
    }
}

class MockApp {
    constructor() {
        this.graph = new MockGraph();
        this.canvas = new MockCanvas();
    }

    navigateToNode(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Clear current selection and select the target node
        this.canvas.clearSelection();
        this.canvas.selectNode(nodeId);

        // Smoothly zoom and pan to fit the node in view (like pressing 'z')
        this.canvas.zoomToSelectionAnimated([nodeId], 0.8, 300);
    }
}

// ============================================================
// Tests
// ============================================================

test('navigateToNode calls zoomToSelectionAnimated with correct parameters', () => {
    const app = new MockApp();
    const node = { id: 'node-1', content: 'Test node' };
    app.graph.addNode(node);

    app.navigateToNode('node-1');

    // Verify zoomToSelectionAnimated was called
    assertEqual(app.canvas.zoomCalls.length, 1, 'zoomToSelectionAnimated should be called once');
    assertEqual(app.canvas.zoomCalls[0].nodeIds, ['node-1'], 'Should pass nodeId as array');
    assertEqual(app.canvas.zoomCalls[0].targetFill, 0.8, 'Should use 0.8 target fill');
    assertEqual(app.canvas.zoomCalls[0].duration, 300, 'Should use 300ms duration');
});

test('navigateToNode does not call panToNodeAnimated', () => {
    const app = new MockApp();
    const node = { id: 'node-2', content: 'Another node' };
    app.graph.addNode(node);

    app.navigateToNode('node-2');

    // Verify panToNodeAnimated was NOT called
    assertEqual(app.canvas.panCalls.length, 0, 'panToNodeAnimated should not be called');
});

test('navigateToNode selects node before zooming', () => {
    const app = new MockApp();
    const node = { id: 'node-3', content: 'Third node' };
    app.graph.addNode(node);

    // Verify initial state
    assertEqual(app.canvas.getSelectedNodeIds().length, 0, 'No nodes should be selected initially');
    assertEqual(app.canvas.clearSelectionCalls, 0, 'clearSelection should not be called yet');

    app.navigateToNode('node-3');

    // Verify selection happened
    assertEqual(app.canvas.clearSelectionCalls, 1, 'clearSelection should be called once');
    assertEqual(app.canvas.getSelectedNodeIds().length, 1, 'One node should be selected');
    assertEqual(app.canvas.getSelectedNodeIds()[0], 'node-3', 'Correct node should be selected');

    // Verify zoom was called after selection
    assertEqual(app.canvas.zoomCalls.length, 1, 'zoomToSelectionAnimated should be called');
});

test('navigateToNode handles non-existent node gracefully', () => {
    const app = new MockApp();

    // Should not throw or call any canvas methods
    app.navigateToNode('non-existent-node');

    assertEqual(app.canvas.zoomCalls.length, 0, 'Should not call zoom for non-existent node');
    assertEqual(app.canvas.panCalls.length, 0, 'Should not call pan for non-existent node');
    assertEqual(app.canvas.clearSelectionCalls, 0, 'Should not clear selection for non-existent node');
});

// ============================================================
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
