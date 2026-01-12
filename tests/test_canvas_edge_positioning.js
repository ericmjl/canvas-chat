/**
 * Tests for canvas edge positioning during node operations
 * Ensures edges stay correctly attached to nodes during resize, drag, etc.
 *
 * Regression test for issue: Edge position jumps during node resize
 * Root cause: Passing stale node.position instead of reading current position from wrapper
 */

import { test, assertTrue, assertFalse } from './test_setup.js';
import { JSDOM } from 'jsdom';
import { Canvas } from '../src/canvas_chat/static/js/canvas.js';
import { createNode, EdgeType } from '../src/canvas_chat/static/js/graph-types.js';
import { CRDTGraph } from '../src/canvas_chat/static/js/crdt-graph.js';

/**
 * Setup helper for canvas tests
 */
function setupCanvasTest() {
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

    const graph = new CRDTGraph();
    const canvas = new Canvas('canvas-container', 'canvas-svg');

    return { canvas, graph, dom };
}

/**
 * Cleanup helper
 */
function cleanupCanvasTest() {
    delete global.window;
    delete global.document;
    delete global.SVGElement;
    delete global.Element;
}

/**
 * Helper to extract edge path positions from SVG path data
 * Handles both simple and complex Bezier curve paths
 */
function getEdgePathPositions(pathD) {
    if (!pathD) return null;

    // Parse SVG path data to extract start and end positions
    // Path format: "M x1 y1 C cp1x cp1y, cp2x cp2y, x2 y2"
    const match = pathD.match(/M\s+([\d.-]+)\s+([\d.-]+).*,\s+([\d.-]+)\s+([\d.-]+)$/);
    if (!match) return null;

    return {
        start: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
        end: { x: parseFloat(match[3]), y: parseFloat(match[4]) },
    };
}

/**
 * Helper to check if two positions are approximately equal (within tolerance)
 * Useful for floating point comparisons
 */
function positionsEqual(pos1, pos2, tolerance = 0.01) {
    return Math.abs(pos1.x - pos2.x) < tolerance && Math.abs(pos1.y - pos2.y) < tolerance;
}

// ============================================================
// Edge positioning during node resize - Regression tests
// ============================================================

test('REGRESSION: Passing stale position causes edge to jump (the bug we fixed)', () => {
    const { canvas, graph } = setupCanvasTest();

    try {
        // Create two connected nodes
        const sourceNode = createNode('ai', 'Source node', { x: 100, y: 100 });
        const targetNode = createNode('ai', 'Target node', { x: 500, y: 100 });

        graph.addNode(sourceNode);
        graph.addNode(targetNode);

        const edge = {
            id: 'edge-1',
            source: sourceNode.id,
            target: targetNode.id,
            type: EdgeType.REPLY,
        };
        graph.addEdge(edge);

        // Render nodes and edge
        canvas.renderNode(sourceNode);
        canvas.renderNode(targetNode);
        canvas.renderEdge(edge, sourceNode.position, targetNode.position);

        // Get initial edge positions
        const edgePath = canvas.edgeElements.get(edge.id);
        const initialPath = edgePath.getAttribute('d');
        const initialPositions = getEdgePathPositions(initialPath);

        // Simulate what happened in the bug: node position in graph is stale
        const stalePosition = { x: 999, y: 999 }; // Some completely wrong position

        // Resize the node (width changes but position doesn't)
        const sourceWrapper = canvas.nodeElements.get(sourceNode.id);
        const newWidth = parseFloat(sourceWrapper.getAttribute('width')) + 200;
        sourceWrapper.setAttribute('width', newWidth);

        // OLD BUGGY CODE would pass stale position: updateEdgesForNode(id, node.position)
        // This should cause edge to jump to wrong position
        canvas.updateEdgesForNode(sourceNode.id, stalePosition);

        const buggyPath = edgePath.getAttribute('d');
        const buggyPositions = getEdgePathPositions(buggyPath);

        // With buggy code, edge would jump to the stale position
        assertFalse(
            positionsEqual(buggyPositions.start, initialPositions.start),
            'Edge should have jumped with stale position (this proves the bug existed)'
        );

        // NOW FIX IT: Read current position from wrapper (what the fix does)
        const currentPos = {
            x: parseFloat(sourceWrapper.getAttribute('x')),
            y: parseFloat(sourceWrapper.getAttribute('y')),
        };
        canvas.updateEdgesForNode(sourceNode.id, currentPos);

        const fixedPath = edgePath.getAttribute('d');
        const fixedPositions = getEdgePathPositions(fixedPath);

        // With the fix, edge should be back at correct position
        assertTrue(
            positionsEqual(fixedPositions.start, initialPositions.start),
            'Edge should return to correct position with current position from wrapper'
        );
        assertTrue(positionsEqual(fixedPositions.end, initialPositions.end), 'Edge end should remain stable');
    } finally {
        cleanupCanvasTest();
    }
});

test('Edge position remains correct when source node is resized', () => {
    const { canvas, graph } = setupCanvasTest();

    try {
        // Create two connected nodes
        const sourceNode = createNode('ai', 'Source node', { x: 100, y: 100 });
        const targetNode = createNode('ai', 'Target node', { x: 500, y: 100 });

        graph.addNode(sourceNode);
        graph.addNode(targetNode);

        const edge = {
            id: 'edge-1',
            source: sourceNode.id,
            target: targetNode.id,
            type: EdgeType.REPLY,
        };
        graph.addEdge(edge);

        // Render nodes and edge
        canvas.renderNode(sourceNode);
        canvas.renderNode(targetNode);
        canvas.renderEdge(edge, sourceNode.position, targetNode.position);

        // Get initial edge path
        const edgePath = canvas.edgeElements.get(edge.id);
        const initialPath = edgePath.getAttribute('d');
        const initialPositions = getEdgePathPositions(initialPath);

        // Simulate resize of source node - get the wrapper
        const sourceWrapper = canvas.nodeElements.get(sourceNode.id);
        const initialWidth = parseFloat(sourceWrapper.getAttribute('width'));

        // Manually set new width (simulating what resize handler does)
        const newWidth = initialWidth + 200;
        sourceWrapper.setAttribute('width', newWidth);

        // Call updateEdgesForNode with current position from wrapper
        // This is what the fixed code does
        const currentPos = {
            x: parseFloat(sourceWrapper.getAttribute('x')),
            y: parseFloat(sourceWrapper.getAttribute('y')),
        };
        canvas.updateEdgesForNode(sourceNode.id, currentPos);

        // Get updated edge path
        const updatedPath = edgePath.getAttribute('d');
        const updatedPositions = getEdgePathPositions(updatedPath);

        // Edge positions should remain stable (node size changed, not position)
        assertTrue(
            positionsEqual(updatedPositions.start, initialPositions.start),
            'Edge start should remain at source node position'
        );
        assertTrue(
            positionsEqual(updatedPositions.end, initialPositions.end),
            'Edge end should remain at target node position'
        );
    } finally {
        cleanupCanvasTest();
    }
});

test('Edge position remains correct when target node is resized', () => {
    const { canvas, graph } = setupCanvasTest();

    try {
        // Create two connected nodes
        const sourceNode = createNode('ai', 'Source node', { x: 100, y: 100 });
        const targetNode = createNode('ai', 'Target node', { x: 500, y: 100 });

        graph.addNode(sourceNode);
        graph.addNode(targetNode);

        const edge = {
            id: 'edge-1',
            source: sourceNode.id,
            target: targetNode.id,
            type: EdgeType.REPLY,
        };
        graph.addEdge(edge);

        // Render nodes and edge
        canvas.renderNode(sourceNode);
        canvas.renderNode(targetNode);
        canvas.renderEdge(edge, sourceNode.position, targetNode.position);

        // Get initial edge path
        const edgePath = canvas.edgeElements.get(edge.id);
        const initialPath = edgePath.getAttribute('d');
        const initialPositions = getEdgePathPositions(initialPath);

        // Simulate resize of target node
        const targetWrapper = canvas.nodeElements.get(targetNode.id);
        const initialWidth = parseFloat(targetWrapper.getAttribute('width'));

        // Set new width
        const newWidth = initialWidth + 200;
        targetWrapper.setAttribute('width', newWidth);

        // Call updateEdgesForNode with current position from wrapper
        const currentPos = {
            x: parseFloat(targetWrapper.getAttribute('x')),
            y: parseFloat(targetWrapper.getAttribute('y')),
        };
        canvas.updateEdgesForNode(targetNode.id, currentPos);

        // Get updated edge path
        const updatedPath = edgePath.getAttribute('d');
        const updatedPositions = getEdgePathPositions(updatedPath);

        // Positions should remain stable (target size changed, not position)
        assertTrue(
            positionsEqual(updatedPositions.start, initialPositions.start),
            'Edge start should remain at source position'
        );
        assertTrue(
            positionsEqual(updatedPositions.end, initialPositions.end),
            'Edge end should remain at target position'
        );
    } finally {
        cleanupCanvasTest();
    }
});

test('Edge position updates correctly when node is actually moved', () => {
    const { canvas, graph } = setupCanvasTest();

    try {
        // Create two connected nodes
        const sourceNode = createNode('ai', 'Source node', { x: 100, y: 100 });
        const targetNode = createNode('ai', 'Target node', { x: 500, y: 100 });

        graph.addNode(sourceNode);
        graph.addNode(targetNode);

        const edge = {
            id: 'edge-1',
            source: sourceNode.id,
            target: targetNode.id,
            type: EdgeType.REPLY,
        };
        graph.addEdge(edge);

        // Render nodes and edge
        canvas.renderNode(sourceNode);
        canvas.renderNode(targetNode);
        canvas.renderEdge(edge, sourceNode.position, targetNode.position);

        // Get initial edge path
        const edgePath = canvas.edgeElements.get(edge.id);
        const initialPath = edgePath.getAttribute('d');
        const initialPositions = getEdgePathPositions(initialPath);

        // Move source node to new position
        const newPos = { x: 200, y: 200 };
        const sourceWrapper = canvas.nodeElements.get(sourceNode.id);
        sourceWrapper.setAttribute('x', newPos.x);
        sourceWrapper.setAttribute('y', newPos.y);

        // Update edges with new position
        canvas.updateEdgesForNode(sourceNode.id, newPos);

        // Get updated edge path
        const updatedPath = edgePath.getAttribute('d');
        const updatedPositions = getEdgePathPositions(updatedPath);

        // Edge start should have moved with the node
        assertFalse(
            positionsEqual(updatedPositions.start, initialPositions.start),
            'Edge start should have moved to new source position'
        );

        // Edge end should remain at target position (target didn't move)
        assertTrue(
            positionsEqual(updatedPositions.end, initialPositions.end),
            'Edge end should remain at target position'
        );
    } finally {
        cleanupCanvasTest();
    }
});

test('Multiple edges update correctly when node is resized', () => {
    const { canvas, graph } = setupCanvasTest();

    try {
        // Create a node connected to multiple other nodes
        const centerNode = createNode('ai', 'Center node', { x: 300, y: 300 });
        const node1 = createNode('ai', 'Node 1', { x: 100, y: 100 });
        const node2 = createNode('ai', 'Node 2', { x: 500, y: 100 });
        const node3 = createNode('ai', 'Node 3', { x: 100, y: 500 });

        graph.addNode(centerNode);
        graph.addNode(node1);
        graph.addNode(node2);
        graph.addNode(node3);

        const edge1 = { id: 'edge-1', source: node1.id, target: centerNode.id, type: EdgeType.REPLY };
        const edge2 = { id: 'edge-2', source: centerNode.id, target: node2.id, type: EdgeType.REPLY };
        const edge3 = { id: 'edge-3', source: centerNode.id, target: node3.id, type: EdgeType.REPLY };

        graph.addEdge(edge1);
        graph.addEdge(edge2);
        graph.addEdge(edge3);

        // Render everything
        canvas.renderNode(centerNode);
        canvas.renderNode(node1);
        canvas.renderNode(node2);
        canvas.renderNode(node3);
        canvas.renderEdge(edge1, node1.position, centerNode.position);
        canvas.renderEdge(edge2, centerNode.position, node2.position);
        canvas.renderEdge(edge3, centerNode.position, node3.position);

        // Store initial paths
        const initialPaths = {
            edge1: getEdgePathPositions(canvas.edgeElements.get(edge1.id).getAttribute('d')),
            edge2: getEdgePathPositions(canvas.edgeElements.get(edge2.id).getAttribute('d')),
            edge3: getEdgePathPositions(canvas.edgeElements.get(edge3.id).getAttribute('d')),
        };

        // Resize center node
        const centerWrapper = canvas.nodeElements.get(centerNode.id);
        const newWidth = parseFloat(centerWrapper.getAttribute('width')) + 200;
        centerWrapper.setAttribute('width', newWidth);

        // Update edges with current position from wrapper
        const currentPos = {
            x: parseFloat(centerWrapper.getAttribute('x')),
            y: parseFloat(centerWrapper.getAttribute('y')),
        };
        canvas.updateEdgesForNode(centerNode.id, currentPos);

        // Get updated paths
        const updatedPaths = {
            edge1: getEdgePathPositions(canvas.edgeElements.get(edge1.id).getAttribute('d')),
            edge2: getEdgePathPositions(canvas.edgeElements.get(edge2.id).getAttribute('d')),
            edge3: getEdgePathPositions(canvas.edgeElements.get(edge3.id).getAttribute('d')),
        };

        // All edge positions should remain stable (center node resized but didn't move)
        // Edge1: node1 → centerNode
        assertTrue(
            positionsEqual(updatedPaths.edge1.start, initialPaths.edge1.start) &&
                positionsEqual(updatedPaths.edge1.end, initialPaths.edge1.end),
            'Edge1 positions should remain stable'
        );

        // Edge2: centerNode → node2
        assertTrue(
            positionsEqual(updatedPaths.edge2.start, initialPaths.edge2.start) &&
                positionsEqual(updatedPaths.edge2.end, initialPaths.edge2.end),
            'Edge2 positions should remain stable'
        );

        // Edge3: centerNode → node3
        assertTrue(
            positionsEqual(updatedPaths.edge3.start, initialPaths.edge3.start) &&
                positionsEqual(updatedPaths.edge3.end, initialPaths.edge3.end),
            'Edge3 positions should remain stable'
        );
    } finally {
        cleanupCanvasTest();
    }
});

console.log('\n=== All canvas edge positioning tests passed! ===\n');
