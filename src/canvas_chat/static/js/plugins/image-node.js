/**
 * Image Node Plugin (Built-in)
 *
 * Provides image nodes for displaying base64-encoded images.
 * Image nodes support custom rendering of image data and copying
 * images to the clipboard.
 *
 * Storage modes:
 * - Inline: imageData contains base64 (backwards compatible)
 * - Blob: blobRef contains reference to blob store, blobUrl for display
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, createNode } from '../graph-types.js';
import { FileUploadHandlerPlugin } from '../file-upload-handler-plugin.js';
import { FileUploadRegistry, PRIORITY } from '../file-upload-registry.js';
import { resizeImage } from '../utils.js';

// Lazy import blob store utils to avoid circular dependencies
let blobStoreUtils = null;
async function getBlobStoreUtils() {
    if (!blobStoreUtils) {
        try {
            blobStoreUtils = await import('../agent/blob-store-utils.js');
        } catch (e) {
            console.warn('[ImageNode] Blob store utils not available:', e.message);
            return null;
        }
    }
    return blobStoreUtils;
}

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
     * Get image source URL - handles both inline and blob storage
     * @returns {string}
     */
    getImageSrc() {
        // Check for blob URL first (server-side blob storage)
        if (this.node.blobUrl) {
            return this.node.blobUrl;
        }

        // Check for blob ref (needs to be resolved)
        if (this.node.blobRef) {
            // Return placeholder, will be resolved asynchronously
            return this.node.blobUrl || '';
        }

        // Fallback to inline base64 (backwards compatible)
        if (this.node.imageData) {
            return `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
        }

        return '';
    }

    /**
     * Render the content for the image node
     * @param {Canvas} _canvas
     * @returns {string}
     */
    renderContent(_canvas) {
        const imgSrc = this.getImageSrc();
        const nodeId = this.node.id;

        // If we have a blob ref but no URL yet, add a loading state
        if (this.node.blobRef && !this.node.blobUrl) {
            // Trigger async URL resolution
            this.resolveBlobUrl();
            return `<div class="image-node-content">
                <div class="image-loading" data-node-id="${nodeId}">Loading image...</div>
            </div>`;
        }

        if (!imgSrc) {
            return `<div class="image-node-content"><div class="image-error">No image data</div></div>`;
        }

        return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image" data-node-id="${nodeId}"></div>`;
    }

    /**
     * Resolve blob URL asynchronously
     * @private
     */
    async resolveBlobUrl() {
        if (!this.node.blobRef || this.node.blobUrl) return;

        try {
            const utils = await getBlobStoreUtils();
            if (!utils) return;

            const url = await utils.getDisplayUrl(this.node.blobRef);
            if (url) {
                // Update node with resolved URL (note: this may require re-render)
                this.node.blobUrl = url;
                console.log(`[ImageNode] Resolved blob URL for ${this.node.id}`);
            }
        } catch (e) {
            console.error(`[ImageNode] Failed to resolve blob URL:`, e);
        }
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

        // Handle blob storage - need to fetch image data
        if (this.node.blobRef) {
            try {
                const utils = await getBlobStoreUtils();
                if (utils) {
                    const { data } = await utils.retrieveFileData(this.node.blobRef);
                    if (data) {
                        // Convert blob to base64 for clipboard
                        const base64 = await utils.fileToBase64(data);
                        await canvas.copyImageToClipboard(base64, this.node.mimeType);
                        canvas.showCopyFeedback(this.node.id);
                        return;
                    }
                }
            } catch (e) {
                console.error('[ImageNode] Failed to copy blob image:', e);
            }
        }

        // Fallback to inline data
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
 *
 * Storage strategy:
 * - If blob store is configured and enabled, stores image in blob store
 * - Otherwise, stores as inline base64 (backwards compatible)
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

            // Create IMAGE node position
            const nodePosition = position || this.graph.autoPosition([]);

            // Try to use blob store if available and configured
            const utils = await getBlobStoreUtils();
            let imageNode;

            if (utils && utils.shouldUseBlobStore(base64Data.length)) {
                // Store in blob store
                console.log('[ImageUpload] Using blob store for image');
                try {
                    const storageResult = await utils.storeFileData(base64Data, {
                        mimeType: mimeType,
                        filename: file.name,
                        sourceType: 'upload',
                    });

                    imageNode = createNode(NodeType.IMAGE, '', {
                        position: nodePosition,
                        blobRef: storageResult.blobRef,
                        blobUrl: storageResult.url,
                        mimeType: mimeType,
                        // Store original filename for reference
                        filename: file.name,
                    });
                    console.log('[ImageUpload] Stored in blob store:', storageResult.blobRef);
                } catch (blobError) {
                    console.warn('[ImageUpload] Blob store failed, falling back to inline:', blobError);
                    // Fallback to inline on blob store failure
                    imageNode = createNode(NodeType.IMAGE, '', {
                        position: nodePosition,
                        imageData: base64Data,
                        mimeType: mimeType,
                    });
                }
            } else {
                // Use inline base64 storage (default/backwards compatible)
                console.log('[ImageUpload] Using inline storage for image');
                imageNode = createNode(NodeType.IMAGE, '', {
                    position: nodePosition,
                    imageData: base64Data,
                    mimeType: mimeType,
                });
            }

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
