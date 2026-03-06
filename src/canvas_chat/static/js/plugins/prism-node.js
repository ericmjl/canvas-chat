/**
 * Prism Node Plugin (Built-in)
 *
 * Provides Prism nodes for displaying GraphPad Prism table data (one node per table).
 * Parses .pzfx (XML) and creates one node per Table with csvData for /code and Analyze.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, createNode, createEdge, EdgeType } from '../graph-types.js';
import { FileUploadHandlerPlugin } from '../file-upload-handler-plugin.js';
import { FileUploadRegistry, PRIORITY } from '../file-upload-registry.js';

/**
 * Get all descendant elements with a given local tag name (namespace-agnostic).
 * @param {Element} parent
 * @param {string} localName
 * @returns {Element[]}
 */
function getByLocalName(parent, localName) {
    const list = parent.getElementsByTagNameNS('*', localName);
    return Array.from(list);
}

/**
 * Get the title of a column element (XColumn, YColumn, etc.).
 * @param {Element} colEl - Column element
 * @returns {string}
 */
function getColumnTitle(colEl) {
    const titleEls = getByLocalName(colEl, 'Title');
    const t = titleEls[0];
    return t && t.textContent ? t.textContent.trim() : '';
}

/**
 * Parse a single column element (XColumn, RowTitlesColumn, YColumn) into per-subcolumn row values.
 * Structure: Column > Subcolumn[] > d[] (one d per row). Each Subcolumn is one logical column.
 * @param {Element} colEl - Column element
 * @returns {{ title: string, subcolumnValues: string[][] }} Title and one array of row values per Subcolumn
 */
function readColumn(colEl) {
    const title = getColumnTitle(colEl);
    const subcols = getByLocalName(colEl, 'Subcolumn');
    const subcolumnValues = [];
    for (const sub of subcols) {
        const dList = getByLocalName(sub, 'd');
        const values = dList.map((el) => (el.textContent || '').trim());
        subcolumnValues.push(values);
    }
    return { title, subcolumnValues };
}

/**
 * Get table title from Table element (Prism 6+).
 * @param {Element} tableEl
 * @returns {string}
 */
function getTableTitle(tableEl) {
    const titleEls = getByLocalName(tableEl, 'Title');
    const titleEl = titleEls[0];
    if (titleEl && titleEl.textContent) return titleEl.textContent.trim();
    return '';
}

/**
 * Extract all data tables from .pzfx XML document.
 * PZFX has Table or HugeTable elements; each has optional Title, XColumn, RowTitlesColumn, YColumn.
 * Each column can have multiple Subcolumns (e.g. replicates); each Subcolumn has one &lt;d&gt; per row.
 * Uses local names so it works with or without XML namespace.
 * @param {Document} doc - Parsed XML document
 * @returns {Array<{title: string, rows: string[][], columnHeaders: string[]}>}
 */
function parsePzfxTables(doc) {
    const tables = [];
    const allTables = getByLocalName(doc.documentElement, 'Table');
    const allHuge = getByLocalName(doc.documentElement, 'HugeTable');
    const tableEls = [...allTables, ...allHuge];

    for (const tableEl of tableEls) {
        const title = getTableTitle(tableEl);
        const xCols = getByLocalName(tableEl, 'XColumn');
        const rowTitles = getByLocalName(tableEl, 'RowTitlesColumn');
        const yCols = getByLocalName(tableEl, 'YColumn');
        const colEls = [...xCols, ...rowTitles, ...yCols];
        if (colEls.length === 0) continue;

        const columnHeaders = [];
        const expandedColumns = [];
        for (const colEl of colEls) {
            const { title: colTitle, subcolumnValues } = readColumn(colEl);
            for (let s = 0; s < subcolumnValues.length; s++) {
                expandedColumns.push(subcolumnValues[s]);
                const header =
                    subcolumnValues.length === 1
                        ? colTitle || `Column ${columnHeaders.length + 1}`
                        : `${colTitle || 'Column'} (${s + 1})`;
                columnHeaders.push(header);
            }
        }

        const maxRows = Math.max(...expandedColumns.map((c) => c.length), 0);
        if (maxRows === 0) continue;

        const rows = [];
        for (let r = 0; r < maxRows; r++) {
            rows.push(expandedColumns.map((colArr) => colArr[r] ?? ''));
        }
        tables.push({
            title: title || `Table ${tables.length + 1}`,
            rows,
            columnHeaders,
        });
    }
    return tables;
}

/**
 * PrismNode - Protocol for Prism table data display
 */
class PrismNode extends BaseNode {
    /**
     * @returns {string}
     */
    getTypeLabel() {
        return 'Prism';
    }

    /**
     * @returns {string}
     */
    getTypeIcon() {
        return '📈';
    }

    /**
     * @param {Object} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        if (this.node.title) return this.node.title;
        const filename = this.node.filename || 'Prism Data';
        const tableTitle = this.node.tableTitle || this.node.tableIndex != null ? `Table ${(this.node.tableIndex ?? 0) + 1}` : 'Table';
        const rowCount = this.node.rowCount ?? '?';
        return `${filename} — ${tableTitle} (${rowCount} rows)`;
    }

    /**
     * @param {Object} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        const filename = this.node.filename || 'data.pzfx';
        const tableTitle = this.node.tableTitle || (this.node.tableIndex != null ? `Table ${this.node.tableIndex + 1}` : 'Table');
        const rowCount = this.node.rowCount ?? '?';
        const colCount = this.node.columnCount ?? '?';
        const columns = this.node.columns || [];

        let html = `<div class="csv-metadata">`;
        html += `<strong>${canvas.escapeHtml(filename)}</strong> — <strong>${canvas.escapeHtml(tableTitle)}</strong><br>`;
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
     * @returns {string[]}
     */
    getActions() {
        return [Actions.ANALYZE, Actions.REPLY, Actions.SUMMARIZE, Actions.COPY];
    }

    /**
     *
     * @param nodeId
     * @param canvas
     * @param graph
     */
    analyze(nodeId, canvas, graph) {
        const prismNode = graph.getNode(nodeId);
        if (!prismNode) return;

        const starterCode = `# Analyzing: ${prismNode.title || 'Prism data'}
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

        if (canvas.saveSession) canvas.saveSession();
        if (window.pyodideRunner) window.pyodideRunner.preload();
    }
}

NodeRegistry.register({
    type: 'prism',
    protocol: PrismNode,
    defaultSize: { width: 640, height: 480 },
});

// =============================================================================
// Prism File Upload Handler
// =============================================================================

/**
 * Prism File Upload Handler Plugin
 * Handles .pzfx uploads and creates one Prism node per table.
 */
class PrismFileUploadHandler extends FileUploadHandlerPlugin {
    /**
     * Handle Prism .pzfx file upload: one node per table.
     * @param {File} file - The .pzfx file
     * @param {Object|null} position - Optional position for the first node
     * @param {Object} _context - Additional context
     * @returns {Promise<Object>} The last created Prism node
     */
    async handleUpload(file, position = null, _context = {}) {
        if (!file.name.toLowerCase().endsWith('.pzfx')) {
            throw new Error('Please select a GraphPad Prism file (.pzfx).');
        }

        const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
        this.validateFile(file, MAX_SIZE, 'Prism');

        try {
            const text = await file.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/xml');
            const parseError = doc.querySelector('parsererror');
            if (parseError) {
                throw new Error('Invalid or unsupported Prism XML. Try exporting as .pzfx from Prism.');
            }

            const tables = parsePzfxTables(doc);
            if (tables.length === 0) {
                throw new Error('No data tables found in this Prism file.');
            }

            const createdNodes = [];
            let nodePosition = position || this.graph.autoPosition([]);

            for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
                const { title: tableTitle, rows, columnHeaders } = tables[tableIndex];
                if (rows.length === 0) continue;

                const columns = columnHeaders && columnHeaders.length > 0 ? columnHeaders : rows[0].map((_, i) => `Column ${i + 1}`);
                const dataRows = rows;
                const rowCount = dataRows.length;
                const columnCount = columns.length;

                const escapeCsv = (val) => {
                    const s = String(val ?? '');
                    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                        return '"' + s.replace(/"/g, '""') + '"';
                    }
                    return s;
                };
                const csvLines = [columns.map(escapeCsv).join(',')];
                for (const row of dataRows) {
                    csvLines.push(row.map(escapeCsv).join(','));
                }
                const csvString = csvLines.join('\n');

                const previewRows = dataRows.slice(0, 5);
                let previewContent = `**${file.name}** — **${tableTitle}** (${rowCount} rows, ${columnCount} columns)\n\n`;
                previewContent += '| ' + columns.join(' | ') + ' |\n';
                previewContent += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
                for (const row of previewRows) {
                    previewContent += '| ' + row.map((c) => String(c ?? '')).join(' | ') + ' |\n';
                }
                if (dataRows.length > 5) {
                    previewContent += `\n*...and ${dataRows.length - 5} more rows*`;
                }

                const nodeTitle = `${file.name} — ${tableTitle}`;
                const prismNode = createNode(NodeType.PRISM, previewContent, {
                    position: nodePosition,
                    title: nodeTitle,
                    filename: file.name,
                    tableTitle,
                    tableIndex,
                    csvData: csvString,
                    columns,
                    rowCount,
                    columnCount,
                    content: previewContent,
                });

                this.graph.addNode(prismNode);
                this.canvas.renderNode(prismNode);
                createdNodes.push(prismNode);
                nodePosition = this.graph.autoPosition(createdNodes.map((n) => n.id));
            }

            if (createdNodes.length === 0) {
                throw new Error('No tables with data found in this Prism file.');
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
                    ? `Loaded 1 table from ${file.name}. Click "Analyze" to write Python code.`
                    : `Loaded ${count} tables from ${file.name}. Click "Analyze" on a table to write Python code.`
            );

            return createdNodes[createdNodes.length - 1];
        } catch (err) {
            this.handleError(null, file, err);
            throw err;
        }
    }
}

FileUploadRegistry.register({
    id: 'prism',
    mimeTypes: [],
    extensions: ['.pzfx'],
    handler: PrismFileUploadHandler,
    priority: PRIORITY.BUILTIN,
});

export { PrismNode, PrismFileUploadHandler };
console.log('Prism node plugin loaded');
