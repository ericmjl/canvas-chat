/**
 * Simple tests for defensive edge rendering logic
 * Tests the deferred edge queue without requiring full Canvas/DOM setup
 */

import { test, assertTrue, assertEqual } from './test_setup.js';

console.log('\n=== Canvas Defensive Edge Rendering Tests ===\n');

// Test that the defensive edge rendering infrastructure exists
test('Canvas: has deferredEdges Map', async () => {
    // Setup minimal DOM mocks
    if (!global.document) {
        const mockElement = {
            setAttribute: () => {},
            getAttribute: () => null,
            style: {},
            classList: { add: () => {}, remove: () => {} },
            appendChild: () => {},
            addEventListener: () => {},
            querySelector: () => mockElement,
            querySelectorAll: () => [],
        };
        global.document = {
            createElementNS: () => mockElement,
            createElement: () => mockElement,
            getElementById: () => mockElement,
            body: mockElement,
        };
    }

    const { Canvas } = await import('../src/canvas_chat/static/js/canvas.js');
    const canvas = new Canvas(document.body);

    assertTrue(canvas.deferredEdges instanceof Map, 'Canvas should have deferredEdges Map');
    assertTrue(canvas.nodeRenderCallbacks instanceof Map, 'Canvas should have nodeRenderCallbacks Map');
});

test('Canvas: has defensive edge rendering methods', async () => {
    const { Canvas } = await import('../src/canvas_chat/static/js/canvas.js');
    const canvas = new Canvas(document.body);

    assertTrue(typeof canvas._addNodeRenderCallback === 'function', 'Should have _addNodeRenderCallback method');
    assertTrue(typeof canvas._retryDeferredEdge === 'function', 'Should have _retryDeferredEdge method');
    assertTrue(typeof canvas._notifyNodeRendered === 'function', 'Should have _notifyNodeRendered method');
});

test('Canvas: _addNodeRenderCallback registers callback', async () => {
    const { Canvas } = await import('../src/canvas_chat/static/js/canvas.js');
    const canvas = new Canvas(document.body);

    let callbackFired = false;
    canvas._addNodeRenderCallback('test-node', () => {
        callbackFired = true;
    });

    assertTrue(canvas.nodeRenderCallbacks.has('test-node'), 'Should register node callback');
    assertEqual(canvas.nodeRenderCallbacks.get('test-node').length, 1);

    // Fire the callback
    canvas._notifyNodeRendered('test-node');

    assertTrue(callbackFired, 'Callback should fire when node rendered');
    assertTrue(!canvas.nodeRenderCallbacks.has('test-node'), 'Should clean up callbacks after firing');
});

test('Canvas: _notifyNodeRendered fires multiple callbacks', async () => {
    const { Canvas } = await import('../src/canvas_chat/static/js/canvas.js');
    const canvas = new Canvas(document.body);

    let callback1Fired = false;
    let callback2Fired = false;

    canvas._addNodeRenderCallback('test-node', () => {
        callback1Fired = true;
    });
    canvas._addNodeRenderCallback('test-node', () => {
        callback2Fired = true;
    });

    assertEqual(canvas.nodeRenderCallbacks.get('test-node').length, 2);

    canvas._notifyNodeRendered('test-node');

    assertTrue(callback1Fired, 'First callback should fire');
    assertTrue(callback2Fired, 'Second callback should fire');
});

console.log('✓ All defensive edge rendering tests passed\n');
