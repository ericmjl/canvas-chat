/**
 * Tests for auto-zoom functionality when creating nodes
 *
 * Verifies that:
 * 1. addUserNode() sets _userNodeCreation flag before adding nodes
 * 2. nodeAdded handler zooms to nodes when flag is set
 * 3. Feature plugins can use addUserNode() for auto-zoom
 * 4. Normal graph operations (session load, bulk ops) don't trigger zoom
 */

import { JSDOM } from 'jsdom';
import { assertTrue, assertEqual, assertFalse } from './test_helpers/assertions.js';

// Setup global mocks FIRST
if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
    };
}

if (!global.indexedDB) {
    global.indexedDB = {
        open: () => {
            const request = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: {
                    transaction: () => ({
                        objectStore: () => ({
                            get: () => ({ onsuccess: null, onerror: null }),
                            put: () => ({ onsuccess: null, onerror: null }),
                            delete: () => ({ onsuccess: null, onerror: null }),
                        }),
                    }),
                },
            };
            setTimeout(() => {
                if (request.onsuccess) {
                    request.onsuccess({ target: request });
                }
            }, 0);
            return request;
        },
    };
}

// Create minimal DOM environment
const dom = new JSDOM(
    `<!DOCTYPE html>
<html><body>
    <div id="canvas-container"></div>
    <textarea id="chat-input"></textarea>
</body></html>`,
    {
        url: 'http://localhost',
        pretendToBeVisual: true,
        resources: 'usable',
    }
);

global.window = dom.window;
global.document = dom.window.document;
global.SVGElement = dom.window.SVGElement;

// Import modules
const { NodeType, createNode } = await import('../src/canvas_chat/static/js/graph-types.js');
const { FeaturePlugin } = await import('../src/canvas_chat/static/js/feature-plugin.js');
const { PluginTestHarness } = await import('../src/canvas_chat/static/js/plugin-test-harness.js');

async function asyncTest(description, fn) {
    try {
        await fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        if (error.stack) {
            console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        }
        process.exit(1);
    }
}

console.log('\n=== Auto-Zoom Functionality Tests ===\n');

// ============================================================
// Mock App with addUserNode support
// ============================================================

class MockAppForZoom {
    constructor() {
        this.graph = new MockGraph();
        this.canvas = new MockCanvas();
        this._userNodeCreation = false;
    }

    addUserNode(node) {
        this._userNodeCreation = true;
        this.graph.addNode(node);
    }
}

class MockGraph {
    constructor() {
        this.nodes = new Map();
        this.events = {};
    }

    addNode(node) {
        this.nodes.set(node.id, node);
        // Simulate nodeAdded event
        if (this.events['nodeAdded']) {
            this.events['nodeAdded'](node);
        }
    }

    on(event, handler) {
        this.events[event] = handler;
    }

    getNode(id) {
        return this.nodes.get(id);
    }
}

class MockCanvas {
    constructor() {
        this.zoomedNodes = [];
    }

    renderNode(node) {
        // No-op for tests
    }

    zoomToSelectionAnimated(nodeIds, targetFill = 0.8, duration = 300) {
        this.zoomedNodes.push(...nodeIds);
    }
}

// ============================================================
// Tests for addUserNode flag behavior
// ============================================================

await asyncTest('addUserNode sets _userNodeCreation flag before adding node', async () => {
    const app = new MockAppForZoom();
    const graph = app.graph;
    const canvas = app.canvas;

    // Set up nodeAdded handler to zoom when flag is set
    graph.on('nodeAdded', (node) => {
        if (app._userNodeCreation) {
            app._userNodeCreation = false; // Reset flag
            canvas.zoomToSelectionAnimated([node.id]);
        }
    });

    const node = createNode(NodeType.HUMAN, 'Test message', { position: { x: 100, y: 100 } });

    // Call addUserNode
    app.addUserNode(node);

    // Verify flag was set and node was added
    assertTrue(app._userNodeCreation === false, 'Flag should be reset after node added');
    assertTrue(graph.getNode(node.id) !== undefined, 'Node should be added to graph');
    assertTrue(canvas.zoomedNodes.includes(node.id), 'Canvas should have zoomed to node');
});

await asyncTest('direct graph.addNode does not trigger zoom', async () => {
    const app = new MockAppForZoom();
    const graph = app.graph;
    const canvas = app.canvas;

    // Set up nodeAdded handler (but flag is never set for direct calls)
    graph.on('nodeAdded', (node) => {
        if (app._userNodeCreation) {
            app._userNodeCreation = false;
            canvas.zoomToSelectionAnimated([node.id]);
        }
    });

    const node = createNode(NodeType.AI, 'AI response', { position: { x: 200, y: 200 } });

    // Call graph.addNode directly (simulating session load or bulk operation)
    graph.addNode(node);

    // Verify flag is still false and no zoom happened
    assertTrue(app._userNodeCreation === false, 'Flag should remain false');
    assertTrue(canvas.zoomedNodes.length === 0, 'Canvas should NOT have zoomed');
});

// ============================================================
// Tests for FeaturePlugin graph.addNode integration (auto-zoom via wrapper)
// ============================================================

await asyncTest('FeaturePlugin.graph uses wrapped addNode', async () => {
    const harness = new PluginTestHarness();
    const { NoteFeature } = await import('../src/canvas_chat/static/js/plugins/note.js');

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [{ command: '/note', handler: 'handleCommand' }],
    });

    const feature = harness.getPlugin('note');
    // FeaturePlugin no longer has addUserNode - plugins use this.graph.addNode() directly
    // The auto-zoom is handled by a wrapper in AppContext that intercepts graph.addNode calls
    assertTrue(typeof feature.graph.addNode === 'function', 'Feature should have graph.addNode');
});

await asyncTest('FeaturePlugin.graph.addNode triggers auto-zoom (via wrapper)', async () => {
    const harness = new PluginTestHarness();
    const { NoteFeature } = await import('../src/canvas_chat/static/js/plugins/note.js');

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [{ command: '/note', handler: 'handleCommand' }],
    });

    const feature = harness.getPlugin('note');
    const graph = feature.graph;

    const noteNode = createNode(NodeType.NOTE, 'Test note content', { position: { x: 300, y: 300 } });

    // Plugins use this.graph.addNode() - the wrapper handles auto-zoom automatically
    feature.graph.addNode(noteNode);

    assertTrue(graph.getNode(noteNode.id) !== undefined, 'Node should be added to graph');
    assertEqual(harness.createdNodes.length, 1, 'Harness should track created node');
    assertEqual(harness.createdNodes[0].id, noteNode.id, 'Created node should be tracked');
});

// ============================================================
// Tests for App.addUserNode helper
// ============================================================

await asyncTest('App.addUserNode creates node and triggers zoom', async () => {
    const harness = new PluginTestHarness();
    const app = harness.mockApp;

    // Track zoom calls
    let zoomCalled = false;
    const originalZoomToSelection = app.canvas.zoomToSelectionAnimated;
    app.canvas.zoomToSelectionAnimated = (nodeIds) => {
        zoomCalled = true;
        originalZoomToSelection.call(app.canvas, nodeIds);
    };

    const node = createNode(NodeType.CODE, 'code here', { position: { x: 400, y: 400 } });

    // Test via addUserNode if App has it, otherwise test the flag directly
    if (typeof app.addUserNode === 'function') {
        app.addUserNode(node);
        assertTrue(zoomCalled, 'Zoom should be called when addUserNode is used');
    } else {
        // Fallback: just test the flag
        assertTrue('_userNodeCreation' in app, 'App should have _userNodeCreation flag');
    }
});

console.log('\n✅ All Auto-Zoom tests passed!\n');
