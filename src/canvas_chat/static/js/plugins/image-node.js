/**
 * Image Node Plugin (Built-in)
 *
 * Provides image nodes for displaying base64-encoded images.
 * Image nodes support custom rendering of image data and copying
 * images to the clipboard.
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, createNode } from '../graph-types.js';
import { FileUploadHandlerPlugin } from '../file-upload-handler-plugin.js';
import { FileUploadRegistry, PRIORITY } from '../file-upload-registry.js';
import { resizeImage } from '../utils.js';

/**
 * ImageNode - Protocol for image display
 */
class ImageNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Image';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '🖼️';
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out)
     * @param {Canvas} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        return 'Image';
    }

    /**
     * Render the content for the image node
     * @param {Canvas} _canvas
     * @returns {string}
     */
    renderContent(_canvas) {
        const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
        return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
    }

    /**
     * Copy image to clipboard
     * @param {Canvas} canvas
     * @param {App} _app
     * @returns {Promise<void>}
     */
    async copyToClipboard(canvas, _app) {
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

// =============================================================================
// Image File Upload Handler
// =============================================================================

/**
 * Image File Upload Handler Plugin
 * Handles image file uploads and creates image nodes
 */
class ImageFileUploadHandler extends FileUploadHandlerPlugin {
    /**
     * Handle image file upload
     * @param {File} file - The image file to upload
     * @param {Object|null} position - Optional position for the node
     * @param {Object} context - Additional context (e.g., showHint)
     * @returns {Promise<Object>} The created image node
     */
    async handleUpload(file, position = null, context = {}) {
        // Validate image type
        if (!file.type.startsWith('image/')) {
            throw new Error('Please select an image file.');
        }

        // Validate size (20 MB raw limit)
        const MAX_SIZE = 20 * 1024 * 1024;
        this.validateFile(file, MAX_SIZE, 'Image');

        try {
            // Resize and convert to base64
            const dataUrl = await resizeImage(file);
            const [header, base64Data] = dataUrl.split(',');
            const mimeMatch = header.match(/data:(.*);base64/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

            // Create IMAGE node
            const nodePosition = position || this.graph.autoPosition([]);
            const imageNode = createNode(NodeType.IMAGE, '', {
                position: nodePosition,
                imageData: base64Data,
                mimeType: mimeType,
            });

            this.addNodeToCanvas(imageNode);
            this.canvas.selectNode(imageNode.id); // Select the new image

            // Show hint if requested (e.g., from paste)
            if (context.showHint) {
                this.showCanvasHint('Image added! Select it and type a message to ask about it.');
            }

            return imageNode;
        } catch (err) {
            this.handleError(null, file, err);
            throw err;
        }
    }
}

// Register image file upload handler
FileUploadRegistry.register({
    id: 'image',
    mimeTypes: ['image/*'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    handler: ImageFileUploadHandler,
    priority: PRIORITY.BUILTIN,
});

export { ImageNode, ImageFileUploadHandler };
console.log('Image node plugin loaded');
