/**
 * Excel Node Plugin (Built-in)
 *
 * Provides Excel nodes for displaying spreadsheet data (one node per sheet).
 * Excel nodes show filename, sheet name, row/column counts, and a markdown table preview.
 * Exposes csvData for /code and Analyze, like CSV nodes.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, createNode, createEdge, EdgeType } from '../graph-types.js';
import { FileUploadHandlerPlugin } from '../file-upload-handler-plugin.js';
import { FileUploadRegistry, PRIORITY } from '../file-upload-registry.js';

/* global XLSX */

/**
 * ExcelNode - Protocol for Excel sheet data display
 */
class ExcelNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Excel';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '📗';
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out).
     * Includes filename and sheet name for identification.
     * @param {Canvas} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        if (this.node.title) return this.node.title;
        const filename = this.node.filename || 'Excel Data';
        const sheetName = this.node.sheetName || 'Sheet';
        const rowCount = this.node.rowCount ?? '?';
        return `${filename} — ${sheetName} (${rowCount} rows)`;
    }

    /**
     * Render the content for the Excel node
     * @param {Canvas} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        const filename = this.node.filename || 'data.xlsx';
        const sheetName = this.node.sheetName || 'Sheet';
        const rowCount = this.node.rowCount ?? '?';
        const colCount = this.node.columnCount ?? '?';
        const columns = this.node.columns || [];

        let html = `<div class="csv-metadata">`;
        html += `<strong>${canvas.escapeHtml(filename)}</strong> — <strong>${canvas.escapeHtml(sheetName)}</strong><br>`;
        html += `${rowCount} rows × ${colCount} columns`;
        if (columns.length > 0) {
            html += `<br><span class="csv-columns">Columns: ${columns.map((c) => canvas.escapeHtml(c)).join(', ')}</span>`;
        }
        html += `</div>`;

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
     * Handle Analyze button click - creates a Code node linked to this Excel node.
     * @param {string} nodeId - The Excel node ID
     * @param {Object} canvas - Canvas instance
     * @param {Object} graph - Graph instance
     */
    analyze(nodeId, canvas, graph) {
        const excelNode = graph.getNode(nodeId);
        if (!excelNode) return;

        const starterCode = `# Analyzing: ${excelNode.title || 'Excel data'}
import pandas as pd

# DataFrame is pre-loaded as 'df'
df.head()
`;

        const position = graph.autoPosition([nodeId]);

        const codeNode = createNode(NodeType.CODE, starterCode, {
            position,
            csvNodeIds: [nodeId],
        });

        graph.addNode(codeNode);

        const edge = createEdge(nodeId, codeNode.id, EdgeType.GENERATES);
        graph.addEdge(edge);

        canvas.renderNode(codeNode);
        canvas.updateAllEdges(graph);
        canvas.updateAllNavButtonStates(graph);
        canvas.panToNodeAnimated(codeNode.id);

        if (canvas.saveSession) {
            canvas.saveSession();
        }

        if (window.pyodideRunner) {
            window.pyodideRunner.preload();
        }
    }
}

NodeRegistry.register({
    type: 'excel',
    protocol: ExcelNode,
    defaultSize: { width: 640, height: 480 },
});

// =============================================================================
// Excel File Upload Handler
// =============================================================================

/**
 * Excel File Upload Handler Plugin
 * Handles .xlsx / .xls uploads and creates one Excel node per sheet.
 */
class ExcelFileUploadHandler extends FileUploadHandlerPlugin {
    /**
     * Handle Excel file upload: one node per sheet.
     * @param {File} file - The Excel file to upload
     * @param {Object|null} position - Optional position for the first node
     * @param {Object} _context - Additional context
     * @returns {Promise<Object>} The last created Excel node
     */
    async handleUpload(file, position = null, _context = {}) {
        if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
            throw new Error('Please select an Excel file (.xlsx or .xls).');
        }

        if (typeof XLSX === 'undefined') {
            throw new Error('Spreadsheet library is still loading. Please try again in a moment.');
        }

        const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
        this.validateFile(file, MAX_SIZE, 'Excel');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });

            const sheetNames = workbook.SheetNames || [];
            if (sheetNames.length === 0) {
                throw new Error('This Excel file has no sheets.');
            }

            const createdNodes = [];
            let nodePosition = position || this.graph.autoPosition([]);

            for (const sheetName of sheetNames) {
                const sheet = workbook.Sheets[sheetName];
                if (!sheet) continue;

                // sheet_to_json with header: 1 gives array of rows (array of arrays)
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (rows.length === 0) continue; // Skip empty sheet

                const columns = rows[0].map((c) => String(c ?? '').trim());
                const dataRows = rows.slice(1);
                const rowCount = dataRows.length;
                const columnCount = columns.length;

                // Build CSV string for csvData (header + data rows, escape commas in cells)
                const escapeCsv = (val) => {
                    const s = String(val ?? '');
                    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                        return '"' + s.replace(/"/g, '""') + '"';
                    }
                    return s;
                };
                const csvLines = [columns.map(escapeCsv).join(',')];
                for (const row of dataRows) {
                    const cells = Array.isArray(row) ? row : (columns.length ? [row] : []);
                    csvLines.push(columns.map((_, i) => escapeCsv(cells[i])).join(','));
                }
                const csvString = csvLines.join('\n');

                // Build markdown preview (first 5 rows)
                const previewRows = dataRows.slice(0, 5);
                let previewContent = `**${file.name}** — **${sheetName}** (${rowCount} rows, ${columnCount} columns)\n\n`;
                if (columns.length > 0) {
                    previewContent += '| ' + columns.join(' | ') + ' |\n';
                    previewContent += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
                    for (const row of previewRows) {
                        const cells = Array.isArray(row) ? row : [];
                        previewContent += '| ' + columns.map((_, i) => String(cells[i] ?? '')).join(' | ') + ' |\n';
                    }
                    if (dataRows.length > 5) {
                        previewContent += `\n*...and ${dataRows.length - 5} more rows*`;
                    }
                }

                const title = `${file.name} — ${sheetName}`;
                const excelNode = createNode(NodeType.EXCEL, previewContent, {
                    position: nodePosition,
                    title,
                    filename: file.name,
                    sheetName,
                    csvData: csvString,
                    columns,
                    rowCount,
                    columnCount,
                    content: previewContent,
                });

                this.graph.addNode(excelNode);
                this.canvas.renderNode(excelNode);
                createdNodes.push(excelNode);
                nodePosition = this.graph.autoPosition(createdNodes.map((n) => n.id));
            }

            if (createdNodes.length === 0) {
                throw new Error('No sheets with data found in this Excel file.');
            }

            this.canvas.clearSelection();
            this.canvas.selectNode(createdNodes[createdNodes.length - 1].id);
            this.saveSession();
            this.updateEmptyState();
            this.canvas.centerOnAnimated(
                createdNodes[createdNodes.length - 1].position.x + 160,
                createdNodes[createdNodes.length - 1].position.y + 100,
                300
            );

            const count = createdNodes.length;
            this.showCanvasHint(
                count === 1
                    ? `Loaded 1 sheet from ${file.name}. Click "Analyze" to write Python code.`
                    : `Loaded ${count} sheets from ${file.name}. Click "Analyze" on a sheet to write Python code.`
            );

            return createdNodes[createdNodes.length - 1];
        } catch (err) {
            this.handleError(null, file, err);
            throw err;
        }
    }
}

FileUploadRegistry.register({
    id: 'excel',
    mimeTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
    ],
    extensions: ['.xlsx', '.xls'],
    handler: ExcelFileUploadHandler,
    priority: PRIORITY.BUILTIN,
});

export { ExcelNode, ExcelFileUploadHandler };
console.log('Excel node plugin loaded');
