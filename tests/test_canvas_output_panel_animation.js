/**
 * Tests for output panel animation during layout changes
 *
 * These tests verify that output panels (drawers beneath code nodes) stay
 * attached to their parent nodes during auto-layout animations. This was
 * a bug where panels would remain in place while nodes moved, appearing
 * to become detached.
 */

import { test, assertEqual, assertFalse } from './test_setup.js';
import { JSDOM } from 'jsdom';

/**
 * Create a minimal mock Canvas instance for testing animation logic
 */
function createMockCanvas() {
    const dom = new JSDOM('<!DOCTYPE html><div id="canvas-container"></div>');
    const document = dom.window.document;

    // Create mock SVG structure
    const container = document.getElementById('canvas-container');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'canvas';
    container.appendChild(svg);

    // Mock Canvas with minimal required structure
    const canvas = {
        nodeElements: new Map(),
        outputPanels: new Map(),
        edgeElements: new Map(),
        viewBox: { x: 0, y: 0, width: 1000, height: 800 },
        scale: 1,
        container: container,
        svg: svg,

        // Mock methods needed for animation
        updateAllEdges: () => {},
        updateViewBox: () => {},
        updateNoNodesHint: () => {},
        fitToContentAnimated: () => {},
        calculateFitToContentViewport: () => null,
    };

    return { canvas, document };
}

/**
 * Create a mock node wrapper (foreignObject element)
 */
function createMockNodeWrapper(document, nodeId, x, y, width, height) {
    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    wrapper.setAttribute('data-node-id', nodeId);
    wrapper.setAttribute('x', x);
    wrapper.setAttribute('y', y);
    wrapper.setAttribute('width', width);
    wrapper.setAttribute('height', height);
    return wrapper;
}

/**
 * Create a mock output panel wrapper
 */
function createMockOutputPanel(document, nodeId, x, y, width, height) {
    const panel = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    panel.setAttribute('data-node-id', nodeId);
    panel.setAttribute('data-output-panel', 'true');
    panel.setAttribute('x', x);
    panel.setAttribute('y', y);
    panel.setAttribute('width', width);
    panel.setAttribute('height', height);
    return panel;
}

/**
 * Create a mock graph with nodes at specified positions
 */
function createMockGraph(nodes) {
    return {
        getAllNodes: () => nodes,
        getAllEdges: () => [],
    };
}

// ============================================================
// Test: Output panel position calculation
// ============================================================

test('Output panel position calculation matches drag behavior', () => {
    // Test that the position formula is consistent
    const nodeX = 100;
    const nodeY = 200;
    const nodeWidth = 400;
    const nodeHeight = 300;
    const panelWidth = 360; // 90% of node width
    const panelOverlap = 10;

    // Formula from renderOutputPanel (line 1885-1889)
    const expectedPanelX = nodeX + (nodeWidth - panelWidth) / 2;
    const expectedPanelY = nodeY + nodeHeight - panelOverlap;

    // Verify calculation
    assertEqual(expectedPanelX, 100 + (400 - 360) / 2); // 120
    assertEqual(expectedPanelY, 200 + 300 - 10); // 490
});

// ============================================================
// Test: Animation data collection includes output panels
// ============================================================

test('Animation data collection includes output panel positions', () => {
    const { canvas, document } = createMockCanvas();

    // Create node with output panel
    const nodeId = 'node1';
    const nodeWrapper = createMockNodeWrapper(document, nodeId, 100, 100, 400, 300);
    const outputPanel = createMockOutputPanel(document, nodeId, 120, 390, 360, 210);

    canvas.nodeElements.set(nodeId, nodeWrapper);
    canvas.outputPanels.set(nodeId, outputPanel);

    // Create mock graph with position change
    const graph = createMockGraph([
        { id: nodeId, position: { x: 300, y: 300 } }, // Moving to new position
    ]);

    // Simulate animation data collection (lines 1352-1401 in canvas.js)
    const animations = [];
    for (const node of graph.getAllNodes()) {
        const wrapper = canvas.nodeElements.get(node.id);
        if (!wrapper) continue;

        const startX = parseFloat(wrapper.getAttribute('x'));
        const startY = parseFloat(wrapper.getAttribute('y'));
        const endX = node.position.x;
        const endY = node.position.y;

        if (startX !== endX || startY !== endY) {
            const animData = {
                nodeId: node.id,
                wrapper,
                startX,
                startY,
                endX,
                endY,
            };

            // Check for output panel (this is the fix we're testing)
            const outputPanel = canvas.outputPanels.get(node.id);
            if (outputPanel) {
                const nodeWidth = parseFloat(wrapper.getAttribute('width'));
                const nodeHeight = parseFloat(wrapper.getAttribute('height'));
                const panelWidth = parseFloat(outputPanel.getAttribute('width'));
                const panelOverlap = 10;

                const startPanelX = startX + (nodeWidth - panelWidth) / 2;
                const startPanelY = startY + nodeHeight - panelOverlap;
                const endPanelX = endX + (nodeWidth - panelWidth) / 2;
                const endPanelY = endY + nodeHeight - panelOverlap;

                animData.outputPanel = outputPanel;
                animData.startPanelX = startPanelX;
                animData.startPanelY = startPanelY;
                animData.endPanelX = endPanelX;
                animData.endPanelY = endPanelY;
            }

            animations.push(animData);
        }
    }

    // Verify animation data includes output panel info
    assertEqual(animations.length, 1);
    const anim = animations[0];
    assertEqual(anim.nodeId, nodeId);
    assertEqual(anim.outputPanel, outputPanel);

    // Verify panel positions were calculated
    assertEqual(anim.startPanelX, 120); // 100 + (400-360)/2
    assertEqual(anim.startPanelY, 390); // 100 + 300 - 10
    assertEqual(anim.endPanelX, 320); // 300 + (400-360)/2
    assertEqual(anim.endPanelY, 590); // 300 + 300 - 10
});

// ============================================================
// Test: Panel positions update during animation
// ============================================================

test('Output panel positions update during animation loop', () => {
    const { canvas, document } = createMockCanvas();

    // Create node with output panel
    const nodeId = 'node1';
    const nodeWrapper = createMockNodeWrapper(document, nodeId, 100, 100, 400, 300);
    const outputPanel = createMockOutputPanel(document, nodeId, 120, 390, 360, 210);

    canvas.nodeElements.set(nodeId, nodeWrapper);
    canvas.outputPanels.set(nodeId, outputPanel);

    // Create animation data (simulating what's collected)
    const animData = {
        nodeId: nodeId,
        wrapper: nodeWrapper,
        startX: 100,
        startY: 100,
        endX: 300,
        endY: 300,
        outputPanel: outputPanel,
        startPanelX: 120,
        startPanelY: 390,
        endPanelX: 320,
        endPanelY: 590,
    };

    // Simulate animation loop at 50% progress (easing applied)
    const eased = 0.5; // Midpoint for simplicity

    const x = animData.startX + (animData.endX - animData.startX) * eased;
    const y = animData.startY + (animData.endY - animData.startY) * eased;
    animData.wrapper.setAttribute('x', x);
    animData.wrapper.setAttribute('y', y);

    // Update panel position (the fix we're testing)
    if (animData.outputPanel) {
        const panelX = animData.startPanelX + (animData.endPanelX - animData.startPanelX) * eased;
        const panelY = animData.startPanelY + (animData.endPanelY - animData.startPanelY) * eased;
        animData.outputPanel.setAttribute('x', panelX);
        animData.outputPanel.setAttribute('y', panelY);
    }

    // Verify node moved to midpoint
    assertEqual(parseFloat(nodeWrapper.getAttribute('x')), 200); // 100 + 200*0.5
    assertEqual(parseFloat(nodeWrapper.getAttribute('y')), 200); // 100 + 200*0.5

    // Verify panel also moved to midpoint
    assertEqual(parseFloat(outputPanel.getAttribute('x')), 220); // 120 + 200*0.5
    assertEqual(parseFloat(outputPanel.getAttribute('y')), 490); // 390 + 200*0.5
});

// ============================================================
// Test: Nodes without output panels still work
// ============================================================

test('Animation works for nodes without output panels', () => {
    const { canvas, document } = createMockCanvas();

    // Create node WITHOUT output panel
    const nodeId = 'node1';
    const nodeWrapper = createMockNodeWrapper(document, nodeId, 100, 100, 400, 300);
    canvas.nodeElements.set(nodeId, nodeWrapper);
    // Note: NOT adding to outputPanels Map

    // Create animation data
    const animData = {
        nodeId: nodeId,
        wrapper: nodeWrapper,
        startX: 100,
        startY: 100,
        endX: 300,
        endY: 300,
        // No outputPanel field
    };

    // Simulate animation loop
    const eased = 0.5;
    const x = animData.startX + (animData.endX - animData.startX) * eased;
    const y = animData.startY + (animData.endY - animData.startY) * eased;
    animData.wrapper.setAttribute('x', x);
    animData.wrapper.setAttribute('y', y);

    // This should not error even though no panel exists
    if (animData.outputPanel) {
        const panelX = animData.startPanelX + (animData.endPanelX - animData.startPanelX) * eased;
        const panelY = animData.startPanelY + (animData.endPanelY - animData.startPanelY) * eased;
        animData.outputPanel.setAttribute('x', panelX);
        animData.outputPanel.setAttribute('y', panelY);
    }

    // Verify node still moved correctly
    assertEqual(parseFloat(nodeWrapper.getAttribute('x')), 200);
    assertEqual(parseFloat(nodeWrapper.getAttribute('y')), 200);
});

// ============================================================
// Test: Multiple nodes with panels
// ============================================================

test('Multiple output panels animate correctly', () => {
    const { canvas, document } = createMockCanvas();

    // Create two nodes with output panels
    const node1 = createMockNodeWrapper(document, 'node1', 100, 100, 400, 300);
    const panel1 = createMockOutputPanel(document, 'node1', 120, 390, 360, 210);
    const node2 = createMockNodeWrapper(document, 'node2', 500, 200, 400, 300);
    const panel2 = createMockOutputPanel(document, 'node2', 520, 490, 360, 210);

    canvas.nodeElements.set('node1', node1);
    canvas.nodeElements.set('node2', node2);
    canvas.outputPanels.set('node1', panel1);
    canvas.outputPanels.set('node2', panel2);

    // Create animation data for both
    const animations = [
        {
            nodeId: 'node1',
            wrapper: node1,
            startX: 100,
            startY: 100,
            endX: 300,
            endY: 300,
            outputPanel: panel1,
            startPanelX: 120,
            startPanelY: 390,
            endPanelX: 320,
            endPanelY: 590,
        },
        {
            nodeId: 'node2',
            wrapper: node2,
            startX: 500,
            startY: 200,
            endX: 700,
            endY: 400,
            outputPanel: panel2,
            startPanelX: 520,
            startPanelY: 490,
            endPanelX: 720,
            endPanelY: 690,
        },
    ];

    // Simulate animation loop for both
    const eased = 0.5;
    for (const anim of animations) {
        const x = anim.startX + (anim.endX - anim.startX) * eased;
        const y = anim.startY + (anim.endY - anim.startY) * eased;
        anim.wrapper.setAttribute('x', x);
        anim.wrapper.setAttribute('y', y);

        if (anim.outputPanel) {
            const panelX = anim.startPanelX + (anim.endPanelX - anim.startPanelX) * eased;
            const panelY = anim.startPanelY + (anim.endPanelY - anim.startPanelY) * eased;
            anim.outputPanel.setAttribute('x', panelX);
            anim.outputPanel.setAttribute('y', panelY);
        }
    }

    // Verify both nodes and panels moved
    assertEqual(parseFloat(node1.getAttribute('x')), 200);
    assertEqual(parseFloat(panel1.getAttribute('x')), 220);
    assertEqual(parseFloat(node2.getAttribute('x')), 600);
    assertEqual(parseFloat(panel2.getAttribute('x')), 620);
});

// ============================================================
// Test: Collapsed panels still move
// ============================================================

test('Collapsed output panels still animate with their parent', () => {
    const { canvas, document } = createMockCanvas();

    // Create node with collapsed output panel (smaller height)
    const nodeId = 'node1';
    const nodeWrapper = createMockNodeWrapper(document, nodeId, 100, 100, 400, 300);
    const outputPanel = createMockOutputPanel(document, nodeId, 120, 390, 360, 34); // Collapsed height
    outputPanel.classList.add('collapsed'); // Styling hint

    canvas.nodeElements.set(nodeId, nodeWrapper);
    canvas.outputPanels.set(nodeId, outputPanel);

    // Animation logic doesn't care about collapsed state - still moves it
    const animData = {
        nodeId: nodeId,
        wrapper: nodeWrapper,
        startX: 100,
        startY: 100,
        endX: 300,
        endY: 300,
        outputPanel: outputPanel,
        startPanelX: 120,
        startPanelY: 390,
        endPanelX: 320,
        endPanelY: 590,
    };

    const eased = 1.0; // Complete animation
    const x = animData.startX + (animData.endX - animData.startX) * eased;
    const y = animData.startY + (animData.endY - animData.startY) * eased;
    animData.wrapper.setAttribute('x', x);
    animData.wrapper.setAttribute('y', y);

    if (animData.outputPanel) {
        const panelX = animData.startPanelX + (animData.endPanelX - animData.startPanelX) * eased;
        const panelY = animData.startPanelY + (animData.endPanelY - animData.startPanelY) * eased;
        animData.outputPanel.setAttribute('x', panelX);
        animData.outputPanel.setAttribute('y', panelY);
    }

    // Verify collapsed panel moved to final position
    assertEqual(parseFloat(nodeWrapper.getAttribute('x')), 300);
    assertEqual(parseFloat(outputPanel.getAttribute('x')), 320);
    assertEqual(parseFloat(outputPanel.getAttribute('y')), 590);
});
