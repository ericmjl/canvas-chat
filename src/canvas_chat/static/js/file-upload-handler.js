/**
 * File Upload Handler
 *
 * Handles file uploads from various sources:
 * - Paperclip button
 * - Drag & drop
 * - Paste (for images)
 *
 * Delegates to registered file upload handler plugins via FileUploadRegistry.
 *
 * Dependencies (injected via constructor):
 * - app: App instance with graph, canvas, saveSession, updateEmptyState, showCanvasHint, chatInput
 */

import { FileUploadRegistry } from './file-upload-registry.js';
import { FileUploadHandlerPlugin as _FileUploadHandlerPlugin } from './file-upload-handler-plugin.js';

/**
 *
 */
class FileUploadHandler {
    /**
     * Create a FileUploadHandler instance.
     * @param {Object} app - App instance with required methods
     */
    constructor(app) {
        this.app = app;
    }

    /**
     * Handle file upload using registered handlers
     * @param {File} file - The file to upload
     * @param {Object|null} position - Optional position for the node (for drag & drop)
     * @param {Object} context - Additional context (e.g., showHint)
     * @returns {Promise<Object>} The created node
     */
    async handleFileUpload(file, position = null, context = {}) {
        // Find handler for this file type
        const handlerConfig = FileUploadRegistry.findHandler(file);
        if (!handlerConfig) {
            alert(`Unsupported file type: ${file.name} (${file.type || 'unknown type'})`);
            return null;
        }

        // Create handler instance with app context
        const handlerContext = {
            app: this.app,
            graph: this.app.graph,
            canvas: this.app.canvas,
            saveSession: () => this.app.saveSession(),
            updateEmptyState: () => this.app.updateEmptyState(),
            showCanvasHint: (message) => this.app.showCanvasHint(message),
        };

        const handler = new handlerConfig.handler(handlerContext);

        // Delegate to handler
        try {
            return await handler.handleUpload(file, position, context);
        } catch (err) {
            // Handler should have already handled the error, but log it
            console.error(`File upload handler error for ${file.name}:`, err);
            return null;
        }
    }

    // --- Legacy methods for backwards compatibility ---
    // These delegate to the new plugin-based system

    /**
     * Handle PDF file upload (legacy method - delegates to plugin system)
     * @param {File} file
     * @param {Object|null} position
     * @returns {Promise<Object>}
     * @deprecated Use handleFileUpload() directly
     */
    async handlePdfUpload(file, position = null) {
        return this.handleFileUpload(file, position);
    }

    /**
     * Handle PDF drop on canvas (legacy method - delegates to plugin system)
     * @param {File} file
     * @param {Object} position
     * @returns {Promise<Object>}
     * @deprecated Use handleFileUpload() directly
     */
    async handlePdfDrop(file, position) {
        return this.handleFileUpload(file, position);
    }

    /**
     * Handle image file upload (legacy method - delegates to plugin system)
     * @param {File} file
     * @param {Object|null} position
     * @param {boolean} showHint
     * @returns {Promise<Object>}
     * @deprecated Use handleFileUpload() directly
     */
    async handleImageUpload(file, position = null, showHint = false) {
        return this.handleFileUpload(file, position, { showHint });
    }

    /**
     * Handle image drop on canvas (legacy method - delegates to plugin system)
     * @param {File} file
     * @param {Object} position
     * @returns {Promise<Object>}
     * @deprecated Use handleFileUpload() directly
     */
    async handleImageDrop(file, position) {
        return this.handleFileUpload(file, position);
    }

    /**
     * Handle CSV file upload (legacy method - delegates to plugin system)
     * @param {File} file
     * @param {Object|null} position
     * @returns {Promise<Object>}
     * @deprecated Use handleFileUpload() directly
     */
    async handleCsvUpload(file, position = null) {
        return this.handleFileUpload(file, position);
    }

    /**
     * Handle CSV drop on canvas (legacy method - delegates to plugin system)
     * @param {File} file
     * @param {Object} position
     * @returns {Promise<Object>}
     * @deprecated Use handleFileUpload() directly
     */
    async handleCsvDrop(file, position) {
        return this.handleFileUpload(file, position);
    }
}

export { FileUploadHandler };
