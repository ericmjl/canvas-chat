/**
 * Image Node Plugin (Built-in)
 *
 * Provides image nodes for displaying base64-encoded images.
 * Image nodes support custom rendering of image data and copying
 * images to the clipboard.
 */
import { BaseNode } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';
import { NodeType } from './graph-types.js';

class ImageNode extends BaseNode {
    getTypeLabel() {
        return 'Image';
    }

    getTypeIcon() {
        return '🖼️';
    }

    getSummaryText(canvas) {
        return 'Image';
    }

    renderContent(canvas) {
        const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
        return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
    }

    async copyToClipboard(canvas, app) {
        if (!canvas?.copyImageToClipboard) {
            console.error('ImageNode.copyToClipboard: canvas.copyImageToClipboard is not available');
            return;
        }
        await canvas.copyImageToClipboard(this.node.imageData, this.node.mimeType);
        canvas.showCopyFeedback(this.node.id);
    }
}

NodeRegistry.register({
    type: 'image',
    protocol: ImageNode,
    defaultSize: { width: 640, height: 480 },
});

export { ImageNode };
console.log('Image node plugin loaded');
