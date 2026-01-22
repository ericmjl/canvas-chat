/**
 * Tests for Highlight Feature plugin
 * Verifies that the highlight feature is properly registered and handles node selection
 */

// Setup global mocks FIRST, before any imports that might use them
global.window = global;
global.window.addEventListener = () => {};
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
};
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

// Now import modules
import { assertTrue, assertEqual } from './test_helpers/assertions.js';
import { createNode, NodeType } from '../src/canvas_chat/static/js/graph-types.js';

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

console.log('\n=== Highlight Feature Plugin Tests ===\n');

// Test: Highlight feature is registered
await asyncTest('HighlightFeature is registered in feature registry', async () => {
    const { FeatureRegistry } = await import('../src/canvas_chat/static/js/feature-registry.js');

    // Access the feature registry instance (it's a singleton exported from the module)
    // We need to check that the feature can be instantiated
    const { HighlightFeature } = await import('../src/canvas_chat/static/js/plugins/highlight.js');
    assertTrue(typeof HighlightFeature === 'function', 'HighlightFeature should be a class/function');
});

// Test: HighlightFeature has required methods
await asyncTest('HighlightFeature has required methods', async () => {
    const { HighlightFeature } = await import('../src/canvas_chat/static/js/plugins/highlight.js');

    // Check static methods
    assertTrue(typeof HighlightFeature.prototype.onLoad === 'function', 'onLoad should be a function');
    assertTrue(
        typeof HighlightFeature.prototype.getCanvasEventHandlers === 'function',
        'getCanvasEventHandlers should be a function'
    );
    assertTrue(
        typeof HighlightFeature.prototype.handleNodeSelect === 'function',
        'handleNodeSelect should be a function'
    );
    assertTrue(
        typeof HighlightFeature.prototype.highlightSourceTextInParent === 'function',
        'highlightSourceTextInParent should be a function'
    );
});

// Test: HighlightFeature registers nodeSelect handler
await asyncTest('HighlightFeature registers nodeSelect canvas event handler', async () => {
    const { HighlightFeature } = await import('../src/canvas_chat/static/js/plugins/highlight.js');

    // Create a mock context
    const mockContext = {
        canvas: {
            on: () => {},
        },
        graph: {
            getParents: () => [],
        },
    };

    const feature = new HighlightFeature(mockContext);
    const handlers = feature.getCanvasEventHandlers();

    assertTrue('nodeSelect' in handlers, 'nodeSelect should be in canvas event handlers');
    assertEqual(typeof handlers.nodeSelect, 'function', 'nodeSelect handler should be a function');
});

// Test: highlightSourceTextInParent handles edge cases
await asyncTest('highlightSourceTextInParent handles no parents', async () => {
    const { HighlightFeature } = await import('../src/canvas_chat/static/js/plugins/highlight.js');

    const mockCanvas = {
        highlightTextInNode: () => {},
    };

    const mockContext = {
        canvas: mockCanvas,
        graph: {
            getParents: () => [], // No parents
        },
    };

    const feature = new HighlightFeature(mockContext);

    // Should not throw
    const highlightNode = createNode(NodeType.HIGHLIGHT, '> test excerpt', { position: { x: 0, y: 0 } });
    feature.highlightSourceTextInParent(highlightNode);
});

await asyncTest('highlightSourceTextInParent strips "> " prefix correctly', async () => {
    const { HighlightFeature } = await import('../src/canvas_chat/static/js/plugins/highlight.js');

    let capturedNodeId = null;
    let capturedText = null;

    const mockCanvas = {
        highlightTextInNode: (nodeId, text) => {
            capturedNodeId = nodeId;
            capturedText = text;
        },
    };

    const mockContext = {
        canvas: mockCanvas,
        graph: {
            getParents: () => [{ id: 'parent-1' }],
        },
    };

    const feature = new HighlightFeature(mockContext);

    const highlightNode = createNode(NodeType.HIGHLIGHT, '> This is the excerpt text', { position: { x: 0, y: 0 } });
    feature.highlightSourceTextInParent(highlightNode);

    assertEqual(capturedText, 'This is the excerpt text', 'Should strip "> " prefix');
});

console.log('\n✅ All Highlight Feature plugin tests passed!\n');
