/**
 * PDF Node Plugin (Built-in)
 *
 * Provides PDF document nodes for imported PDF files.
 * PDF nodes represent uploaded PDF documents that can be summarized,
 * used to create flashcards, or replied to.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, createNode } from '../graph-types.js';
import { FileUploadHandlerPlugin } from '../file-upload-handler-plugin.js';
import { FileUploadRegistry, PRIORITY } from '../file-upload-registry.js';
import { apiUrl } from '../utils.js';

/**
 * PdfNode - Protocol for PDF document display
 */
class PdfNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'PDF';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '📑';
    }

    /**
     * Get action buttons for this node
     * @returns {Array<string>}
     */
    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

NodeRegistry.register({
    type: 'pdf',
    protocol: PdfNode,
    defaultSize: { width: 640, height: 480 },
});

// =============================================================================
// PDF File Upload Handler
// =============================================================================

/**
 * PDF File Upload Handler Plugin
 * Handles PDF file uploads and creates PDF nodes
 */
class PdfFileUploadHandler extends FileUploadHandlerPlugin {
    /**
     * Handle PDF file upload
     * @param {File} file - The PDF file to upload
     * @param {Object|null} position - Optional position for the node
     * @param {Object} _context - Additional context
     * @returns {Promise<Object>} The created PDF node
     */
    async handleUpload(file, position = null, _context = {}) {
        // Validate file type
        if (file.type !== 'application/pdf') {
            throw new Error('Please select a PDF file.');
        }

        // Validate file size (25 MB limit)
        const MAX_SIZE = 25 * 1024 * 1024;
        this.validateFile(file, MAX_SIZE, 'PDF');

        // Create a placeholder node while processing
        // Use FETCH_RESULT node type (unified with fetched PDFs)
        const nodePosition = position || this.graph.autoPosition([]);
        const pdfNode = createNode(NodeType.FETCH_RESULT, `Processing PDF: ${file.name}...`, {
            position: nodePosition,
        });

        this.addNodeToCanvas(pdfNode);

        try {
            // Upload PDF via FormData
            const formData = new FormData();
            formData.append('file', file);

            // Use generic upload-file endpoint (plugin-based)
            const response = await fetch(apiUrl('/api/upload-file'), {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to process PDF');
            }

            const data = await response.json();

            // Update the node with the extracted content and metadata
            // Store metadata to identify this as a PDF (unified with fetched PDFs)
            this.updateNodeAfterProcessing(pdfNode.id, data.content, {
                title: data.title,
                metadata: {
                    content_type: 'pdf',
                    page_count: data.page_count,
                    source: 'upload',
                },
            });

            return pdfNode;
        } catch (err) {
            this.handleError(pdfNode.id, file, err);
            throw err;
        }
    }
}

// Register PDF file upload handler
FileUploadRegistry.register({
    id: 'pdf',
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
    handler: PdfFileUploadHandler,
    priority: PRIORITY.BUILTIN,
});

export { PdfNode, PdfFileUploadHandler };
console.log('PDF node plugin loaded');
