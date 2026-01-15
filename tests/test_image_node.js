/**
 * Tests for Image node plugin
 * Verifies that the image node plugin works correctly when loaded
 */

// Setup global mocks FIRST, before any imports that might use them
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

console.log('\n=== Image Node Plugin Tests ===\n');

// Test: Image node plugin is registered
await asyncTest('Image node plugin is registered', async () => {
    // Import image-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    // Check if NodeRegistry has the image type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('image'), 'Image node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('image');
    assertTrue(protocol !== undefined, 'Image protocol class should exist');
});

// Test: ImageNode protocol methods
await asyncTest('ImageNode implements protocol methods', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.IMAGE, '', {
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        mimeType: 'image/png',
    });
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Image', 'Type label should be Image');
    assertEqual(wrapped.getTypeIcon(), '🖼️', 'Type icon should be 🖼️');
});

// Test: ImageNode getSummaryText
await asyncTest('ImageNode getSummaryText returns "Image"', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const node = createNode(NodeType.IMAGE, '', {
        imageData: 'test',
        mimeType: 'image/png',
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = { truncate: (text) => text };
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'Image', 'Summary text should be "Image"');
});

// Test: ImageNode renderContent
await asyncTest('ImageNode renderContent generates correct HTML', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const mimeType = 'image/png';
    const node = createNode(NodeType.IMAGE, '', { imageData, mimeType });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {};
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('image-node-content'), 'Should contain image-node-content class');
    assertTrue(html.includes('node-image'), 'Should contain node-image class');
    assertTrue(html.includes(`data:${mimeType};base64,${imageData}`), 'Should contain base64 data URL');
});

// Test: ImageNode renderContent with default mimeType
await asyncTest('ImageNode renderContent uses default mimeType when not provided', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const imageData = 'test';
    const node = createNode(NodeType.IMAGE, '', { imageData });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {};
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('data:image/png;base64'), 'Should default to image/png mimeType');
});

// Test: ImageNode copyToClipboard
await asyncTest('ImageNode copyToClipboard calls canvas method', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const imageData = 'test';
    const mimeType = 'image/png';
    const node = createNode(NodeType.IMAGE, '', { imageData, mimeType, id: 'test-image' });
    const wrapped = wrapNode(node);

    let copyCalled = false;
    let copyImageData = null;
    let copyMimeType = null;
    let showFeedbackCalled = false;
    let feedbackNodeId = null;

    // Mock canvas with copyImageToClipboard
    const mockCanvas = {
        copyImageToClipboard: async (data, mime) => {
            copyCalled = true;
            copyImageData = data;
            copyMimeType = mime;
        },
        showCopyFeedback: (nodeId) => {
            showFeedbackCalled = true;
            feedbackNodeId = nodeId;
        },
    };

    await wrapped.copyToClipboard(mockCanvas, {});

    assertTrue(copyCalled, 'copyImageToClipboard should be called');
    assertEqual(copyImageData, imageData, 'Should pass correct image data');
    assertEqual(copyMimeType, mimeType, 'Should pass correct mime type');
    assertTrue(showFeedbackCalled, 'showCopyFeedback should be called');
    assertEqual(feedbackNodeId, 'test-image', 'Should pass correct node ID');
});

// Test: ImageNode copyToClipboard handles missing canvas method
await asyncTest('ImageNode copyToClipboard handles missing canvas method gracefully', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const node = createNode(NodeType.IMAGE, '', { imageData: 'test', mimeType: 'image/png' });
    const wrapped = wrapNode(node);

    // Mock canvas without copyImageToClipboard
    const mockCanvas = {};

    // Should not throw, just log error
    await wrapped.copyToClipboard(mockCanvas, {});
    // Test passes if no exception is thrown
});

// Test: ImageNode isScrollable
await asyncTest('ImageNode isScrollable returns true', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const node = { type: NodeType.IMAGE, imageData: 'test', mimeType: 'image/png' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'ImageNode should be scrollable');
});

// Test: ImageNode wrapNode integration
await asyncTest('wrapNode returns ImageNode for IMAGE type', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const node = {
        type: NodeType.IMAGE,
        imageData: 'test',
        mimeType: 'image/png',
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Image', 'Should return Image node protocol');
    assertTrue(wrapped.getTypeIcon() === '🖼️', 'Should have image icon');
});

// Test: ImageNode handles edge cases
await asyncTest('ImageNode handles missing imageData', async () => {
    // Import image-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/image-node.js');

    const node = {
        type: NodeType.IMAGE,
        id: 'test',
        position: { x: 0, y: 0 },
        width: 640,
        height: 480,
        created_at: Date.now(),
        tags: [],
    };
    const wrapped = wrapNode(node);

    // Should still work with missing imageData
    assertEqual(wrapped.getTypeLabel(), 'Image', 'Should return type label even with missing imageData');
    assertEqual(wrapped.getTypeIcon(), '🖼️', 'Should return type icon even with missing imageData');
    const mockCanvas = {};
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('data:image/png;base64,undefined'), 'Should handle missing imageData in renderContent');
});

console.log('\n✅ All Image node plugin tests passed!\n');
