/**
 * CSV Node Plugin (Built-in)
 *
 * Provides CSV nodes for displaying CSV data with metadata.
 * CSV nodes show filename, row/column counts, column names, and
 * a markdown table preview of the data.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, createNode, createEdge, EdgeType } from '../graph-types.js';
import { FileUploadHandlerPlugin } from '../file-upload-handler-plugin.js';
import { FileUploadRegistry, PRIORITY } from '../file-upload-registry.js';

/* global Papa */

/**
 * CsvNode - Protocol for CSV data display
 */
class CsvNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'CSV';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '📊';
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out)
     * @param {Canvas} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        if (this.node.title) return this.node.title;
        const filename = this.node.filename || 'CSV Data';
        const rowCount = this.node.rowCount || '?';
        return `${filename} (${rowCount} rows)`;
    }

    /**
     * Render the content for the CSV node
     * @param {Canvas} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        // Show table preview with metadata header
        const filename = this.node.filename || 'data.csv';
        const rowCount = this.node.rowCount || '?';
        const colCount = this.node.columnCount || '?';
        const columns = this.node.columns || [];

        let html = `<div class="csv-metadata">`;
        html += `<strong>${canvas.escapeHtml(filename)}</strong> — `;
        html += `${rowCount} rows × ${colCount} columns`;
        if (columns.length > 0) {
            html += `<br><span class="csv-columns">Columns: ${columns.map((c) => canvas.escapeHtml(c)).join(', ')}</span>`;
        }
        html += `</div>`;

        // Render the markdown table preview
        if (this.node.content) {
            html += `<div class="csv-preview">${canvas.renderMarkdown(this.node.content)}</div>`;
        }

        return html;
    }

    /**
     * Get action buttons for this node
     * @returns {Array<string>}
     */
    getActions() {
        return [Actions.ANALYZE, Actions.REPLY, Actions.SUMMARIZE, Actions.COPY];
    }

    /**
     * Handle Analyze button click - creates a Code node to analyze CSV data.
     * This is tight coupling between CSV and Code nodes (by design).
     * @param {string} nodeId - The CSV node ID
     * @param {Object} canvas - Canvas instance
     * @param {Object} graph - Graph instance
     */
    analyze(nodeId, canvas, graph) {
        const csvNode = graph.getNode(nodeId);
        if (!csvNode) return;

        // Create code node with starter template
        const starterCode = `# Analyzing: ${csvNode.title || 'CSV data'}
import pandas as pd

# DataFrame is pre-loaded as 'df'
df.head()
`;

        const position = graph.autoPosition([nodeId]);

        const codeNode = createNode(NodeType.CODE, starterCode, {
            position,
            csvNodeIds: [nodeId], // Link to source CSV node
        });

        graph.addNode(codeNode);

        // Create edge from CSV to code node
        const edge = createEdge(nodeId, codeNode.id, EdgeType.GENERATES);
        graph.addEdge(edge);

        canvas.renderNode(codeNode);
        canvas.updateAllEdges(graph);
        canvas.updateAllNavButtonStates(graph);
        canvas.panToNodeAnimated(codeNode.id);

        // Save session
        if (canvas.saveSession) {
            canvas.saveSession();
        }

        // Preload Pyodide in background so it's ready when user clicks Run
        if (window.pyodideRunner) {
            window.pyodideRunner.preload();
        }
    }
}

NodeRegistry.register({
    type: 'csv',
    protocol: CsvNode,
    defaultSize: { width: 640, height: 480 },
});

// =============================================================================
// CSV File Upload Handler
// =============================================================================

/**
 * CSV File Upload Handler Plugin
 * Handles CSV file uploads and creates CSV nodes
 */
class CsvFileUploadHandler extends FileUploadHandlerPlugin {
    /**
     * Handle CSV file upload
     * @param {File} file - The CSV file to upload
     * @param {Object|null} position - Optional position for the node
     * @param {Object} _context - Additional context
     * @returns {Promise<Object>} The created CSV node
     */
    async handleUpload(file, position = null, _context = {}) {
        // Validate CSV type
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            throw new Error('Please select a CSV file.');
        }

        // Validate size (10 MB limit for browser-friendly parsing)
        const MAX_SIZE = 10 * 1024 * 1024;
        this.validateFile(file, MAX_SIZE, 'CSV');

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
            const nodePosition = position || this.graph.autoPosition([]);
            const csvNode = createNode(NodeType.CSV, previewContent, {
                position: nodePosition,
                title: file.name,
                filename: file.name,
                csvData: text, // Store raw CSV string for code execution
                columns: columns,
            });

            this.addNodeToCanvas(csvNode);
            this.canvas.selectNode(csvNode.id);

            this.showCanvasHint('CSV loaded! Click "Analyze" to write Python code.');

            return csvNode;
        } catch (err) {
            this.handleError(null, file, err);
            throw err;
        }
    }
}

// Register CSV file upload handler
FileUploadRegistry.register({
    id: 'csv',
    mimeTypes: ['text/csv'],
    extensions: ['.csv'],
    handler: CsvFileUploadHandler,
    priority: PRIORITY.BUILTIN,
});

export { CsvNode, CsvFileUploadHandler };
console.log('CSV node plugin loaded');
