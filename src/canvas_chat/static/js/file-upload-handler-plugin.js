/**
 * File Upload Handler Plugin Base Class
 *
 * Base class for file type handlers. Plugins extend this class to handle
 * specific file types (PDF, Image, CSV, Word, PowerPoint, etc.).
 *
 * Example:
 *   class WordDocHandler extends FileUploadHandlerPlugin {
 *       async handleUpload(file, position, context) {
 *           // Process Word document
 *           // Create node using createNode from graph-types.js
 *           // Return node or throw error
 *       }
 *   }
 *
 *   FileUploadRegistry.register({
 *       id: 'word-doc',
 *       mimeTypes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
 *       extensions: ['.doc', '.docx'],
 *       handler: WordDocHandler,
 *       priority: PRIORITY.BUILTIN,
 *   });
 */

/**
 * Base class for file upload handler plugins
 */
class FileUploadHandlerPlugin {
    /**
     * Create a file upload handler plugin instance
     * @param {Object} context - Application context with injected dependencies
     */
    constructor(context) {
        this.app = context.app;
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.saveSession = context.saveSession;
        this.updateEmptyState = context.updateEmptyState;
        this.showCanvasHint = context.showCanvasHint;
    }

    /**
     * Handle file upload
     * Must be implemented by subclasses
     *
     * @param {File} file - The file to upload
     * @param {Object|null} _position - Optional position for the node (for drag & drop)
     * @param {Object} _context - Additional context (e.g., showHint, etc.)
     * @returns {Promise<Object>} The created node
     * @throws {Error} If upload fails
     */
    async handleUpload(file, _position = null, _context = {}) {
        throw new Error('FileUploadHandlerPlugin.handleUpload() must be implemented by subclass');
    }

    /**
     * Validate file before processing
     * Can be overridden by subclasses for custom validation
     *
     * @param {File} file - The file to validate
     * @param {number} maxSize - Maximum file size in bytes
     * @param {string} expectedType - Expected MIME type or description
     * @throws {Error} If validation fails
     */
    validateFile(file, maxSize, expectedType) {
        if (file.size > maxSize) {
            const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
            throw new Error(`${expectedType} file is too large. Maximum size is ${maxSizeMB} MB.`);
        }
    }

    /**
     * Helper method to add node to graph and canvas
     * Subclasses should create the node using createNode() and then call this
     *
     * @param {Object} node - The node to add
     */
    addNodeToCanvas(node) {
        this.graph.addNode(node);
        this.canvas.renderNode(node);
        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        // Pan to the new node
        this.canvas.centerOnAnimated(node.position.x + 160, node.position.y + 100, 300);
    }

    /**
     * Update node content after processing
     * Helper method for subclasses
     *
     * @param {string} nodeId - The node ID
     * @param {string} content - New content
     * @param {Object} updateData - Additional node data to update
     */
    updateNodeAfterProcessing(nodeId, content, updateData = {}) {
        this.canvas.updateNodeContent(nodeId, content, false);
        this.graph.updateNode(nodeId, {
            content,
            ...updateData,
        });
        this.saveSession();
    }

    /**
     * Handle upload error
     * Helper method for subclasses
     *
     * @param {string} nodeId - The node ID (if placeholder was created)
     * @param {File} file - The file that failed
     * @param {Error} error - The error that occurred
     */
    handleError(nodeId, file, error) {
        if (nodeId) {
            const errorContent = `**Failed to process ${file.name}**\n\n*Error: ${error.message}*`;
            this.canvas.updateNodeContent(nodeId, errorContent, false);
            this.graph.updateNode(nodeId, { content: errorContent });
            this.saveSession();
        } else {
            alert(`Failed to process ${file.name}: ${error.message}`);
        }
    }
}

export { FileUploadHandlerPlugin };
