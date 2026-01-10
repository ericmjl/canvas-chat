/**
 * File Upload Handler
 *
 * Handles file uploads (PDF, Image, CSV) from various sources:
 * - Paperclip button
 * - Drag & drop
 * - Paste (for images)
 *
 * Dependencies (injected via constructor):
 * - app: App instance with graph, canvas, saveSession, updateEmptyState, showCanvasHint, chatInput
 *
 * Global dependencies:
 * - createNode, NodeType: Node creation utilities
 * - resizeImage: Image resizing utility
 * - Papa: CSV parsing library
 * - apiUrl: API URL helper
 */

/* global resizeImage, Papa */

class FileUploadHandler {
    /**
     * Create a FileUploadHandler instance.
     * @param {Object} app - App instance with required methods
     */
    constructor(app) {
        this.app = app;
    }

    /**
     * Handle PDF file upload (from paperclip button or drag & drop).
     *
     * @param {File} file - The PDF file to upload
     * @param {Object} position - Optional position for the node (for drag & drop)
     */
    async handlePdfUpload(file, position = null) {
        // Validate file type
        if (file.type !== 'application/pdf') {
            alert('Please select a PDF file.');
            return;
        }

        // Validate file size (25 MB limit)
        const MAX_SIZE = 25 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert(`PDF file is too large. Maximum size is 25 MB.`);
            return;
        }

        // Create a placeholder node while processing
        const nodePosition = position || this.app.graph.autoPosition([]);
        const pdfNode = createNode(NodeType.PDF, `Processing PDF: ${file.name}...`, {
            position: nodePosition,
        });

        this.app.graph.addNode(pdfNode);
        this.app.canvas.renderNode(pdfNode);

        this.app.canvas.clearSelection();
        this.app.saveSession();
        this.app.updateEmptyState();

        // Pan to the new node
        this.app.canvas.centerOnAnimated(pdfNode.position.x + 160, pdfNode.position.y + 100, 300);

        try {
            // Upload PDF via FormData
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(apiUrl('/api/upload-pdf'), {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to process PDF');
            }

            const data = await response.json();

            // Update the node with the extracted content
            this.app.canvas.updateNodeContent(pdfNode.id, data.content, false);
            this.app.graph.updateNode(pdfNode.id, {
                content: data.content,
                title: data.title,
                page_count: data.page_count,
            });
            this.app.saveSession();
        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to process PDF**\n\n${file.name}\n\n*Error: ${err.message}*`;
            this.app.canvas.updateNodeContent(pdfNode.id, errorContent, false);
            this.app.graph.updateNode(pdfNode.id, { content: errorContent });
            this.app.saveSession();
        }
    }

    /**
     * Handle PDF drop on canvas (from drag & drop).
     *
     * @param {File} file - The PDF file that was dropped
     * @param {Object} position - The drop position in canvas coordinates
     */
    async handlePdfDrop(file, position) {
        await this.handlePdfUpload(file, position);
    }

    /**
     * Handle image file upload (from paperclip button, drag & drop, or paste).
     *
     * @param {File} file - The image file to upload
     * @param {Object} position - Optional position for the node (for drag & drop)
     * @param {boolean} showHint - Whether to show a canvas hint after upload
     */
    async handleImageUpload(file, position = null, showHint = false) {
        // Validate image type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        // Validate size (20 MB raw limit)
        const MAX_SIZE = 20 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert('Image is too large. Maximum size is 20 MB.');
            return;
        }

        try {
            // Resize and convert to base64
            const dataUrl = await resizeImage(file);
            const [header, base64Data] = dataUrl.split(',');
            const mimeMatch = header.match(/data:(.*);base64/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

            // Create IMAGE node
            const nodePosition = position || this.app.graph.autoPosition([]);
            const imageNode = createNode(NodeType.IMAGE, '', {
                position: nodePosition,
                imageData: base64Data,
                mimeType: mimeType,
            });

            this.app.graph.addNode(imageNode);
            this.app.canvas.renderNode(imageNode);

            this.app.canvas.clearSelection();
            this.app.canvas.selectNode(imageNode.id); // Select the new image
            this.app.saveSession();
            this.app.updateEmptyState();

            // Pan to the new node
            this.app.canvas.centerOnAnimated(imageNode.position.x + 160, imageNode.position.y + 100, 300);

            // Show hint if requested (e.g., from paste)
            if (showHint) {
                this.app.showCanvasHint('Image added! Select it and type a message to ask about it.');
            }
        } catch (err) {
            alert(`Failed to process image: ${err.message}`);
        }
    }

    /**
     * Handle image drop on canvas (from drag & drop).
     *
     * @param {File} file - The image file that was dropped
     * @param {Object} position - The drop position in canvas coordinates
     */
    async handleImageDrop(file, position) {
        await this.handleImageUpload(file, position);
    }

    /**
     * Handle CSV file upload (from drag & drop or file picker).
     *
     * @param {File} file - The CSV file to upload
     * @param {Object} position - Optional position for the node (for drag & drop)
     */
    async handleCsvUpload(file, position = null) {
        // Validate CSV type
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            alert('Please select a CSV file.');
            return;
        }

        // Validate size (10 MB limit for browser-friendly parsing)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert('CSV is too large. Maximum size is 10 MB.');
            return;
        }

        try {
            // Read file contents
            const text = await file.text();

            // Parse CSV with Papa Parse
            const parseResult = Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
            });

            if (parseResult.errors && parseResult.errors.length > 0) {
                console.warn('CSV parse warnings:', parseResult.errors);
            }

            const data = parseResult.data;
            const columns = parseResult.meta.fields || [];

            // Create preview content (first 5 rows as markdown table)
            const previewRows = data.slice(0, 5);
            let previewContent = `**${file.name}** (${data.length} rows, ${columns.length} columns)\n\n`;
            if (columns.length > 0) {
                previewContent += '| ' + columns.join(' | ') + ' |\n';
                previewContent += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
                for (const row of previewRows) {
                    previewContent += '| ' + columns.map((col) => String(row[col] ?? '')).join(' | ') + ' |\n';
                }
                if (data.length > 5) {
                    previewContent += `\n*...and ${data.length - 5} more rows*`;
                }
            }

            // Create CSV node
            const nodePosition = position || this.app.graph.autoPosition([]);
            const csvNode = createNode(NodeType.CSV, previewContent, {
                position: nodePosition,
                title: file.name,
                filename: file.name,
                csvData: text, // Store raw CSV string for code execution
                columns: columns,
            });

            this.app.graph.addNode(csvNode);
            this.app.canvas.renderNode(csvNode);

            this.app.canvas.clearSelection();
            this.app.canvas.selectNode(csvNode.id);
            this.app.saveSession();
            this.app.updateEmptyState();

            // Pan to the new node
            this.app.canvas.centerOnAnimated(csvNode.position.x + 200, csvNode.position.y + 150, 300);

            this.app.showCanvasHint('CSV loaded! Click "Analyze" to write Python code.');
        } catch (err) {
            alert(`Failed to process CSV: ${err.message}`);
        }
    }

    /**
     * Handle CSV drop on canvas (from drag & drop).
     *
     * @param {File} file - The CSV file that was dropped
     * @param {Object} position - The drop position in canvas coordinates
     */
    async handleCsvDrop(file, position) {
        await this.handleCsvUpload(file, position);
    }
}

export { FileUploadHandler };
