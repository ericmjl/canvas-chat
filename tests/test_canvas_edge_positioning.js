/**
 * Tests for canvas edge positioning during node operations
 * Ensures edges stay correctly attached to nodes during resize, drag, etc.
 */

import { test, assertEqual, assertTrue } from './test_setup.js';
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
                <svg id="canvas" width="1000" height="800">
                    <g id="edges-container"></g>
                    <g id="nodes-container"></g>
                </svg>
            </body>
        </html>
    `);

    global.window = dom.window;
    global.document = dom.window.document;
    global.SVGElement = dom.window.SVGElement;
    global.Element = dom.window.Element;

    const svg = document.getElementById('canvas');
    const graph = new CRDTGraph();
    const canvas = new Canvas(svg, () => graph);

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
 * Helper to extract edge path positions
 */
function getEdgePathPositions(pathD) {
    // Parse SVG path data to extract start and end positions
    // Path format: "M x1 y1 C cp1x cp1y, cp2x cp2y, x2 y2"
    const match = pathD.match(/M\s+([\d.-]+)\s+([\d.-]+).*,\s+([\d.-]+)\s+([\d.-]+)$/);
    if (!match) return null;

    return {
        start: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
        end: { x: parseFloat(match[3]), y: parseFloat(match[4]) },
    };
}

// ============================================================
// Edge positioning during node resize
// ============================================================

test('Edge position remains correct when source node is resized', () => {
    console.log('Testing edge position during source node resize...');
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

        // Edge start position should remain at source node position (not jump elsewhere)
        assertEqual(updatedPositions.start.x, initialPositions.start.x);
        assertEqual(updatedPositions.start.y, initialPositions.start.y);

        // Edge end position should remain at target node position
        assertEqual(updatedPositions.end.x, initialPositions.end.x);
        assertEqual(updatedPositions.end.y, initialPositions.end.y);
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

        // Positions should remain stable
        assertEqual(updatedPositions.start.x, initialPositions.start.x);
        assertEqual(updatedPositions.start.y, initialPositions.start.y);
        assertEqual(updatedPositions.end.x, initialPositions.end.x);
        assertEqual(updatedPositions.end.y, initialPositions.end.y);
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
        assertTrue(updatedPositions.start.x !== initialPositions.start.x);
        assertTrue(updatedPositions.start.y !== initialPositions.start.y);

        // Edge end should remain at target position
        assertEqual(updatedPositions.end.x, initialPositions.end.x);
        assertEqual(updatedPositions.end.y, initialPositions.end.y);
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

        // All edge positions should remain stable (center node didn't move, just resized)
        // Edge1: start at node1, end at centerNode
        assertEqual(updatedPaths.edge1.start.x, initialPaths.edge1.start.x);
        assertEqual(updatedPaths.edge1.start.y, initialPaths.edge1.start.y);
        assertEqual(updatedPaths.edge1.end.x, initialPaths.edge1.end.x);
        assertEqual(updatedPaths.edge1.end.y, initialPaths.edge1.end.y);

        // Edge2: start at centerNode, end at node2
        assertEqual(updatedPaths.edge2.start.x, initialPaths.edge2.start.x);
        assertEqual(updatedPaths.edge2.start.y, initialPaths.edge2.start.y);

        // Edge3: start at centerNode, end at node3
        assertEqual(updatedPaths.edge3.start.x, initialPaths.edge3.start.x);
        assertEqual(updatedPaths.edge3.start.y, initialPaths.edge3.start.y);
    } finally {
        cleanupCanvasTest();
    }
});

console.log('\n=== All canvas edge positioning tests passed! ===\n');
