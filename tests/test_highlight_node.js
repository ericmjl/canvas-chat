/**
 * Tests for Highlight node plugin
 * Verifies that the highlight node plugin works correctly when loaded
 */

// Setup global mocks FIRST, before any imports that might use them
// Must set window before any module imports that reference it
global.window = global;
global.window.addEventListener = () => {}; // Mock window.addEventListener
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
import { wrapNode } from '../src/canvas_chat/static/js/node-protocols.js';

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

// Mock canvas for renderContent tests
const mockCanvas = {
    renderMarkdown: (text) => `<div>${text}</div>`,
    escapeHtml: (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
};

console.log('\n=== Highlight Node Plugin Tests ===\n');

// Test: Highlight node plugin is registered
await asyncTest('Highlight node plugin is registered', async () => {
    // Import highlight-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    // Check if NodeRegistry has the highlight type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('highlight'), 'Highlight node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('highlight');
    assertTrue(protocol !== undefined, 'Highlight protocol class should exist');
});

// Test: HighlightNode protocol methods
await asyncTest('HighlightNode implements protocol methods', async () => {
    // Import highlight-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.HIGHLIGHT, 'Highlighted text', {});
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Highlight', 'Type label should be Highlight');
    assertEqual(wrapped.getTypeIcon(), '✨', 'Type icon should be ✨');
});

// Test: HighlightNode renderContent with text
await asyncTest('HighlightNode renderContent renders markdown for text content', async () => {
    // Import highlight-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    const node = createNode(NodeType.HIGHLIGHT, '**Bold text**', {});
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('<div>'), 'Should render markdown');
    assertTrue(html.includes('**Bold text**'), 'Should include original content');
});

// Test: HighlightNode renderContent with empty content
await asyncTest('HighlightNode renderContent handles empty content', async () => {
    // Import highlight-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    const node = { type: NodeType.HIGHLIGHT, content: '', id: 'test', position: { x: 0, y: 0 }, width: 420, height: 200, created_at: Date.now(), tags: [] };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);

    // Should not throw and should return some HTML (even if empty)
    assertTrue(typeof html === 'string', 'Should return a string');
});

// Test: HighlightNode renderContent with image
await asyncTest('HighlightNode renderContent renders image for imageData', async () => {
    // Import highlight-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    const node = {
        id: 'test-highlight',
        type: NodeType.HIGHLIGHT,
        content: '',
        imageData: 'base64imagedata',
        mimeType: 'image/png',
        position: { x: 0, y: 0 },
        width: 420,
        height: 200,
        created_at: Date.now(),
        tags: [],
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('data:image/png;base64'), 'Should render image data URL');
    assertTrue(html.includes('node-image'), 'Should include image class');
    assertTrue(html.includes('image-node-content'), 'Should include image container');
});

// Test: HighlightNode renderContent with image but no mimeType (should default to image/png)
await asyncTest('HighlightNode renderContent defaults mimeType to image/png when missing', async () => {
    // Import highlight-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    const node = {
        id: 'test-highlight',
        type: NodeType.HIGHLIGHT,
        content: '',
        imageData: 'base64imagedata',
        // mimeType missing - should default to image/png
        position: { x: 0, y: 0 },
        width: 420,
        height: 200,
        created_at: Date.now(),
        tags: [],
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('data:image/png;base64'), 'Should default to image/png when mimeType is missing');
});

// Test: HighlightNode isScrollable
await asyncTest('HighlightNode isScrollable returns true', async () => {
    // Import highlight-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    const node = { type: NodeType.HIGHLIGHT, content: 'Highlighted text' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'HighlightNode should be scrollable');
});

// Test: HighlightNode wrapNode integration
await asyncTest('wrapNode returns HighlightNode for HIGHLIGHT type', async () => {
    // Import highlight-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/highlight-node.js');

    const node = { type: NodeType.HIGHLIGHT, content: 'Highlighted text' };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Highlight', 'Should return Highlight node protocol');
    assertTrue(wrapped.getTypeIcon() === '✨', 'Should have highlight icon');
});

console.log('\n✅ All Highlight node plugin tests passed!\n');
