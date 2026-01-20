/**
 * Highlight Node Plugin (Built-in)
 *
 * Provides highlight nodes for excerpted text or images from other nodes.
 * Highlight nodes can display either:
 * - Text content (rendered as markdown)
 * - Image data (rendered as base64 image)
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * HighlightNode - Protocol for excerpted content
 */
class HighlightNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Highlight';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '✨';
    }

    /**
     * Render the content for the highlight node
     * @param {Canvas} canvas
     * @returns {string}
     */
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
