// Setup globals first
if (!global.window) {
    global.window = {
        addEventListener: () => {},
        location: { pathname: '/' },
    };
}

if (!global.document) {
    const mockClassList = {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
    };
    const mockElement = {
        setAttribute: () => {},
        getAttribute: () => null,
        style: {},
        classList: mockClassList,
        appendChild: () => {},
        addEventListener: () => {},
        querySelector: () => mockElement,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
    };
    global.document = {
        createElementNS: () => mockElement,
        createElement: () => mockElement,
        getElementById: () => mockElement,
        body: mockElement,
        querySelector: () => mockElement,
        addEventListener: () => {},
    };
}

// Dynamic import to ensure globals are set first
const { Canvas } = await import('../src/canvas_chat/static/js/canvas.js');

console.log('\n=== Canvas Edge Rendering Tests ===\n');

// Mock dependencies
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

class MockCanvas extends Canvas {
    constructor() {
        // Skip super() which does DOM setup
        // But in JS, if we extend, we MUST call super().
        // So we have to let Canvas constructor run.
        // Or we just don't extend Canvas and copy the method?
        // No, we want to test Canvas.renderEdge.

        // Pass dummy IDs
        super('container', 'canvas');

        this.renderedEdges = [];
        this.nodeElements = new Map();

        // Mock DOM elements required by renderEdge
        this.edgesLayer = {
            appendChild: () => {},
        };
        this.edgeElements = new Map();

        // Mock defensive edge rendering infrastructure
        this.deferredEdges = new Map();
        this.nodeRenderCallbacks = new Map();
    }

    // Override calculateBezierPath to capture positions
    calculateBezierPath(sourcePos, sourceDims, targetPos, targetDims) {
        this.renderedEdges.push({
            sourcePos,
            targetPos,
        });
        return 'M0,0';
    }

    // Override removeEdge
    removeEdge() {}

    // Override DOM-dependent part, but keep the logic we want to test?
    // Wait, the logic IS in renderEdge.
    // So I should let renderEdge run, but ensure it doesn't crash on DOM.
    // renderEdge calls:
    // 1. removeEdge (mocked)
    // 2. document.createElementNS (mocked in globals)
    // 3. nodeElements.get (mocked map)
    // 4. wrapper.getAttribute (mock wrapper needs this)
    // 5. calculateBezierPath (mocked)
    // 6. edgesLayer.appendChild (mocked)
    // 7. edgeElements.set (mocked map)

    // So I don't need to override renderEdge if I mock everything else!
}

// Test: renderEdge(edge, graph) uses current graph positions
try {
    console.log('Test: renderEdge(edge, graph) uses current graph positions');

    const graph = new MockGraph();
    const canvas = new MockCanvas();

    // Setup nodes with initial positions
    const sourceNode = { id: 'source', position: { x: 10, y: 10 } };
    const targetNode = { id: 'target', position: { x: 100, y: 100 } };
    graph.setNode('source', sourceNode);
    graph.setNode('target', targetNode);

    // IMPORTANT: Mock node wrappers so defensive edge rendering doesn't defer
    const mockWrapper = {
        getAttribute: (attr) => (attr === 'width' ? '420' : '100'),
    };
    canvas.nodeElements.set('source', mockWrapper);
    canvas.nodeElements.set('target', mockWrapper);

    const edge = { id: 'edge1', source: 'source', target: 'target' };

    // Update graph with NEW positions (simulating layout change)
    const updatedSource = { ...sourceNode, position: { x: 20, y: 20 } };
    const updatedTarget = { ...targetNode, position: { x: 200, y: 200 } };
    graph.setNode('source', updatedSource);
    graph.setNode('target', updatedTarget);

    // Call renderEdge with graph signature
    canvas.renderEdge(edge, graph);

    // Verify it used the NEW positions
    const lastRender = canvas.renderedEdges[0];

    if (lastRender.sourcePos.x !== 20 || lastRender.sourcePos.y !== 20) {
        throw new Error(`Expected source pos (20,20), got (${lastRender.sourcePos.x},${lastRender.sourcePos.y})`);
    }
    if (lastRender.targetPos.x !== 200 || lastRender.targetPos.y !== 200) {
        throw new Error(`Expected target pos (200,200), got (${lastRender.targetPos.x},${lastRender.targetPos.y})`);
    }

    console.log('✓ Passed');
} catch (error) {
    console.error('✗ Failed:', error.message);
    process.exit(1);
}

// Test: renderEdge(edge, graph) handles missing nodes
try {
    console.log('Test: renderEdge(edge, graph) handles missing nodes');

    const graph = new MockGraph();
    const canvas = new MockCanvas();

    const edge = { id: 'edge1', source: 'missing', target: 'target' };
    graph.setNode('target', { id: 'target', position: { x: 0, y: 0 } });

    // Should not throw and should return null
    const result = canvas.renderEdge(edge, graph);

    if (result !== null) {
        throw new Error('Expected return value null for missing node');
    }
    if (canvas.renderedEdges.length !== 0) {
        throw new Error('Should not have rendered any edge');
    }

    console.log('✓ Passed');
} catch (error) {
    console.error('✗ Failed:', error.message);
    process.exit(1);
}

// Test: renderEdge(edge, sourcePos, targetPos) legacy signature works
try {
    console.log('Test: renderEdge(edge, sourcePos, targetPos) works');

    const canvas = new MockCanvas();
    const edge = { id: 'edge1', source: 's', target: 't' };
    const p1 = { x: 1, y: 1 };
    const p2 = { x: 2, y: 2 };

    canvas.renderEdge(edge, p1, p2);

    const lastRender = canvas.renderedEdges[0];
    if (lastRender.sourcePos !== p1 || lastRender.targetPos !== p2) {
        throw new Error('Did not use provided positions');
    }

    console.log('✓ Passed');
} catch (error) {
    console.error('✗ Failed:', error.message);
    process.exit(1);
}

console.log('\n=== All tests passed ===\n');
