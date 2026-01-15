/**
 * CSV Node Plugin (Built-in)
 *
 * Provides CSV nodes for displaying CSV data with metadata.
 * CSV nodes show filename, row/column counts, column names, and
 * a markdown table preview of the data.
 */
import { BaseNode, Actions } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

class CsvNode extends BaseNode {
    getTypeLabel() {
        return 'CSV';
    }

    getTypeIcon() {
        return '📊';
    }

    getSummaryText(canvas) {
        if (this.node.title) return this.node.title;
        const filename = this.node.filename || 'CSV Data';
        const rowCount = this.node.rowCount || '?';
        return `${filename} (${rowCount} rows)`;
    }

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

    getActions() {
        return [Actions.ANALYZE, Actions.REPLY, Actions.SUMMARIZE, Actions.COPY];
    }
}

NodeRegistry.register({
    type: 'csv',
    protocol: CsvNode,
    defaultSize: { width: 640, height: 480 },
});

export { CsvNode };
console.log('CSV node plugin loaded');
