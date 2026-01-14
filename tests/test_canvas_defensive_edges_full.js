/**
 * Tests for Canvas defensive edge rendering with JSDOM
 * Verifies that edges are deferred when nodes aren't rendered, then auto-render when nodes appear
 */

import { JSDOM } from 'jsdom';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

// Setup global DOM before importing Canvas
const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
        <body>
            <div id="canvas-container">
                <svg id="canvas-svg" width="1000" height="800">
                    <g id="edges-layer"></g>
                    <g id="nodes-layer"></g>
                </svg>
            </div>
        </body>
    </html>
`);
global.window = dom.window;
global.document = dom.window.document;
global.SVGElement = dom.window.SVGElement;
global.Element = dom.window.Element;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Now import Canvas after globals are set
const { Canvas } = await import('../src/canvas_chat/static/js/canvas.js');

// Simple test helpers
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
            console.log(`  ${err.stack.split('\n').slice(1, 3).join('\n  ')}`);
        }
        failed++;
    }
}

// Mock graph for testing
class MockGraph {
    constructor() {
        this.nodes = new Map();
    }
    getNode(id) {
        return this.nodes.get(id);
    }
    setNode(id, node) {
        this.nodes.set(id, node);
    }
}

console.log('\n=== Canvas Defensive Edge Rendering Tests ===\n');

// Test 1: Canvas has defensive infrastructure
test('Canvas has deferredEdges and nodeRenderCallbacks Maps', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');

    assertTrue(canvas.deferredEdges instanceof Map, 'Should have deferredEdges Map');
    assertTrue(canvas.nodeRenderCallbacks instanceof Map, 'Should have nodeRenderCallbacks Map');
});

// Test 2: Canvas has defensive methods
test('Canvas has defensive edge rendering methods', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');

    assertTrue(typeof canvas._addNodeRenderCallback === 'function', 'Should have _addNodeRenderCallback');
    assertTrue(typeof canvas._retryDeferredEdge === 'function', 'Should have _retryDeferredEdge');
    assertTrue(typeof canvas._notifyNodeRendered === 'function', 'Should have _notifyNodeRendered');
});

// Test 3: Callback registration
test('_addNodeRenderCallback registers callback for node', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');

    let callbackFired = false;
    canvas._addNodeRenderCallback('test-node', () => {
        callbackFired = true;
    });

    assertTrue(canvas.nodeRenderCallbacks.has('test-node'), 'Should register callback');
    assertEqual(canvas.nodeRenderCallbacks.get('test-node').length, 1, 'Should have 1 callback');

    // Fire callbacks
    canvas._notifyNodeRendered('test-node');

    assertTrue(callbackFired, 'Callback should fire');
    assertTrue(!canvas.nodeRenderCallbacks.has('test-node'), 'Should clean up after firing');
});

// Test 4: Multiple callbacks
test('_notifyNodeRendered fires multiple callbacks', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');

    let callback1Fired = false;
    let callback2Fired = false;

    canvas._addNodeRenderCallback('test-node', () => {
        callback1Fired = true;
    });
    canvas._addNodeRenderCallback('test-node', () => {
        callback2Fired = true;
    });

    assertEqual(canvas.nodeRenderCallbacks.get('test-node').length, 2, 'Should have 2 callbacks');

    canvas._notifyNodeRendered('test-node');

    assertTrue(callback1Fired, 'First callback should fire');
    assertTrue(callback2Fired, 'Second callback should fire');
});

// Test 5: Edge deferral when nodes missing
test('renderEdge defers edge when nodes not in DOM', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');
    const graph = new MockGraph();

    // Add nodes to graph
    graph.setNode('source', { id: 'source', position: { x: 0, y: 0 } });
    graph.setNode('target', { id: 'target', position: { x: 100, y: 100 } });

    // DON'T add nodes to canvas.nodeElements (they're not rendered)

    const edge = { id: 'edge1', source: 'source', target: 'target', type: 'reply' };
    const result = canvas.renderEdge(edge, graph);

    assertTrue(result === null, 'Should return null when deferring');
    assertTrue(canvas.deferredEdges.has('edge1'), 'Should defer the edge');
    assertTrue(!canvas.edgeElements.has('edge1'), 'Edge should not be in edgeElements');
});

// Test 6: Deferred edges cleaned up when removed
test('removeEdge clears deferred edge entries', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');
    const graph = new MockGraph();

    graph.setNode('source', { id: 'source', position: { x: 0, y: 0 } });
    graph.setNode('target', { id: 'target', position: { x: 100, y: 100 } });

    const edge = { id: 'edge1', source: 'source', target: 'target', type: 'reply' };
    canvas.renderEdge(edge, graph);

    assertTrue(canvas.deferredEdges.has('edge1'), 'Edge should be deferred');
    canvas.removeEdge('edge1');
    assertTrue(!canvas.deferredEdges.has('edge1'), 'Deferred edge should be cleared');
});

test('removeNode clears deferred edges and callbacks', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');
    const graph = new MockGraph();

    graph.setNode('source', { id: 'source', position: { x: 0, y: 0 } });
    graph.setNode('target', { id: 'target', position: { x: 100, y: 100 } });

    const edge = { id: 'edge2', source: 'source', target: 'target', type: 'reply' };
    canvas.renderEdge(edge, graph);
    canvas._addNodeRenderCallback('source', () => {});

    assertTrue(canvas.deferredEdges.has('edge2'), 'Edge should be deferred');
    assertTrue(canvas.nodeRenderCallbacks.has('source'), 'Callback should be registered');

    canvas.removeNode('source');

    assertTrue(!canvas.deferredEdges.has('edge2'), 'Deferred edges should be cleared');
    assertTrue(!canvas.nodeRenderCallbacks.has('source'), 'Callbacks should be cleared');
});

// Test 7: Edge renders immediately when nodes exist
test('renderEdge renders immediately when nodes in DOM', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');
    const graph = new MockGraph();

    // Add nodes to graph
    graph.setNode('source', { id: 'source', position: { x: 0, y: 0 } });
    graph.setNode('target', { id: 'target', position: { x: 100, y: 100 } });

    // Mock node wrappers in DOM
    const mockWrapper = {
        getAttribute: (attr) => (attr === 'width' ? '420' : '100'),
    };
    canvas.nodeElements.set('source', mockWrapper);
    canvas.nodeElements.set('target', mockWrapper);

    const edge = { id: 'edge1', source: 'source', target: 'target', type: 'reply' };
    const result = canvas.renderEdge(edge, graph);

    assertTrue(result !== null, 'Should return edge element');
    assertTrue(!canvas.deferredEdges.has('edge1'), 'Should not defer');
    assertTrue(canvas.edgeElements.has('edge1'), 'Edge should be in edgeElements');
});

// Test 7: Legacy signature not affected
test('renderEdge legacy signature (pos1, pos2) works without deferral', () => {
    const canvas = new Canvas('canvas-container', 'canvas-svg');

    const edge = { id: 'edge1', source: 's', target: 't', type: 'reply' };
    const pos1 = { x: 10, y: 10 };
    const pos2 = { x: 100, y: 100 };

    const result = canvas.renderEdge(edge, pos1, pos2);

    assertTrue(result !== null, 'Should render with legacy signature');
    assertTrue(!canvas.deferredEdges.has('edge1'), 'Should not defer legacy signature');
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
    process.exit(1);
}
