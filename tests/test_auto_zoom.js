/**
 * Tests for viewport focus when creating nodes
 *
 * Verifies that:
 * 1. addUserNode() adds the node and explicitly zooms to it (no flag)
 * 2. Direct graph.addNode() does not trigger zoom (creation does not imply focus)
 * 3. Feature plugins use graph.addNode() and call zoom explicitly when they want focus
 * 4. App.addUserNode (or mock equivalent) creates node and triggers zoom
 */

import { JSDOM } from 'jsdom';
import { assertTrue, assertEqual } from './test_helpers/assertions.js';

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

console.log('\n=== Viewport focus (addUserNode / explicit zoom) tests ===\n');

// ============================================================
// Mock App: addUserNode = add + explicit zoom (no flag)
// ============================================================

class MockAppForZoom {
    constructor() {
        this.graph = new MockGraph();
        this.canvas = new MockCanvas();
    }

    addUserNode(node) {
        this.graph.addNode(node);
        this.canvas.zoomToSelectionAnimated([node.id], 0.8, 300);
    }
}

class MockGraph {
    constructor() {
        this.nodes = new Map();
        this.events = {};
    }

    addNode(node) {
        this.nodes.set(node.id, node);
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

    renderNode(_node) {}

    zoomToSelectionAnimated(nodeIds, _targetFill = 0.8, _duration = 300) {
        this.zoomedNodes.push(...nodeIds);
    }
}

// ============================================================
// addUserNode: add + explicit zoom
// ============================================================

await asyncTest('addUserNode adds node and zooms to it', async () => {
    const app = new MockAppForZoom();
    const graph = app.graph;
    const canvas = app.canvas;

    const node = createNode(NodeType.HUMAN, 'Test message', { position: { x: 100, y: 100 } });

    app.addUserNode(node);

    assertTrue(graph.getNode(node.id) !== undefined, 'Node should be added to graph');
    assertTrue(canvas.zoomedNodes.includes(node.id), 'Canvas should have zoomed to node');
});

await asyncTest('direct graph.addNode does not trigger zoom', async () => {
    const app = new MockAppForZoom();
    const graph = app.graph;
    const canvas = app.canvas;

    const node = createNode(NodeType.AI, 'AI response', { position: { x: 200, y: 200 } });

    graph.addNode(node);

    assertTrue(graph.getNode(node.id) !== undefined, 'Node should be in graph');
    assertTrue(canvas.zoomedNodes.length === 0, 'Canvas should NOT have zoomed');
});

// ============================================================
// FeaturePlugin graph.addNode (no wrapper; no auto-zoom)
// ============================================================

await asyncTest('FeaturePlugin.graph has addNode', async () => {
    const harness = new PluginTestHarness();
    const { NoteFeature } = await import('../src/canvas_chat/static/js/plugins/note.js');

    await harness.loadPlugin({
        id: 'note',
        feature: NoteFeature,
        slashCommands: [{ command: '/note', handler: 'handleCommand' }],
    });

    const feature = harness.getPlugin('note');
    assertTrue(typeof feature.graph.addNode === 'function', 'Feature should have graph.addNode');
});

await asyncTest('FeaturePlugin.graph.addNode adds node (focus is explicit)', async () => {
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

    feature.graph.addNode(noteNode);

    assertTrue(graph.getNode(noteNode.id) !== undefined, 'Node should be added to graph');
    assertEqual(harness.createdNodes.length, 1, 'Harness should track created node');
    assertEqual(harness.createdNodes[0].id, noteNode.id, 'Created node should be tracked');
});

// ============================================================
// App.addUserNode (or mock) creates node and zooms
// ============================================================

await asyncTest('App.addUserNode creates node and triggers zoom', async () => {
    const harness = new PluginTestHarness();
    const app = harness.mockApp;

    let zoomCalled = false;
    const originalZoomToSelection = app.canvas.zoomToSelectionAnimated;
    app.canvas.zoomToSelectionAnimated = (nodeIds) => {
        zoomCalled = true;
        originalZoomToSelection.call(app.canvas, nodeIds);
    };

    const node = createNode(NodeType.CODE, 'code here', { position: { x: 400, y: 400 } });

    assertTrue(typeof app.addUserNode === 'function', 'MockApp should have addUserNode');
    app.addUserNode(node);
    assertTrue(zoomCalled, 'Zoom should be called when addUserNode is used');
});

console.log('\n✅ All viewport focus tests passed!\n');
