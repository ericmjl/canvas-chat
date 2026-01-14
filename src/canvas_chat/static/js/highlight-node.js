/**
 * Highlight Node Plugin (Built-in)
 *
 * Provides highlight nodes for excerpted text or images from other nodes.
 * Highlight nodes can display either:
 * - Text content (rendered as markdown)
 * - Image data (rendered as base64 image)
 */
import { BaseNode } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

class HighlightNode extends BaseNode {
    getTypeLabel() {
        return 'Highlight';
    }

    getTypeIcon() {
        return '✨';
    }

    renderContent(canvas) {
        // If has image data, render image; otherwise render markdown
        if (this.node.imageData) {
            const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
            return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
        }
        return canvas.renderMarkdown(this.node.content || '');
    }
}

NodeRegistry.register({
    type: 'highlight',
    protocol: HighlightNode,
    defaultSize: { width: 420, height: 200 },
});

export { HighlightNode };

console.log('Highlight node plugin loaded');
