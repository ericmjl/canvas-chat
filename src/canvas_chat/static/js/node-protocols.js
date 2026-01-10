/**
 * Node Protocol Pattern
 *
 * Implements sklearn-style protocol classes where each node type defines its behaviors
 * in a single class. This centralizes node-type-specific logic that was previously
 * scattered across canvas.js and app.js with if (node.type === ...) checks.
 */

/**
 * Action button definitions for node action bars
 */
// Detect platform for keyboard shortcuts
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';
const modKeyLong = isMac ? 'Cmd' : 'Ctrl';  // For longer tooltips

const Actions = {
    REPLY: { id: 'reply', label: '↩️ Reply (r)', title: 'Reply (r)' },
    BRANCH: { id: 'branch', label: '🌿 Branch', title: 'Branch from selection' },
    SUMMARIZE: { id: 'summarize', label: '📝 Summarize', title: 'Summarize' },
    FETCH_SUMMARIZE: { id: 'fetch-summarize', label: '📄 Fetch & Summarize', title: 'Fetch full content and summarize' },
    EDIT_CONTENT: { id: 'edit-content', label: '✏️ Edit (e)', title: `Edit content (e, save with ${modKeyLong}+Enter)` },
    RESUMMARIZE: { id: 'resummarize', label: '📝 Re-summarize', title: 'Create new summary from edited content' },
    COPY: { id: 'copy', label: '📋 Copy (c)', title: 'Copy (c)' },
    FLIP_CARD: { id: 'flip-card', label: '🔄 Flip', title: 'Flip card to see answer' },
    CREATE_FLASHCARDS: { id: 'create-flashcards', label: '🎴 Flashcards', title: 'Generate flashcards from content' },
    REVIEW_CARD: { id: 'review-card', label: '📖 Review', title: 'Start review session for this card' },
    ANALYZE: { id: 'analyze', label: '🔬 Analyze (⇧A)', title: 'Generate code to analyze this data (Shift+A)' },
    EDIT_CODE: { id: 'edit-code', label: '✏️ Edit (e)', title: `Edit code (e, save with ${modKeyLong}+Enter)` },
    GENERATE: { id: 'generate', label: '✨ AI (⇧A)', title: 'Generate code with AI (Shift+A)' },
    RUN_CODE: { id: 'run-code', label: `▶️ Run (${modKey}↵)`, title: `Execute code (${modKeyLong}+Enter)` }
};

/**
 * Header button definitions for node headers
 */
const HeaderButtons = {
    NAV_PARENT: { id: 'nav-parent', label: '↑', title: 'Go to parent node' },
    NAV_CHILD: { id: 'nav-child', label: '↓', title: 'Go to child node' },
    COLLAPSE: { id: 'collapse', label: '−', title: 'Collapse children' },
    STOP: { id: 'stop', label: '⏹', title: 'Stop generating', hidden: true },
    CONTINUE: { id: 'continue', label: '▶', title: 'Continue generating', hidden: true },
    RESET_SIZE: { id: 'reset-size', label: '↺', title: 'Reset to default size' },
    FIT_VIEWPORT: { id: 'fit-viewport', label: '⤢', title: 'Fit to viewport (f)' },
    DELETE: { id: 'delete', label: '🗑️', title: 'Delete node' }
};

/**
 * Base node protocol class with default implementations
 * All node-specific classes extend this base class
 */
class BaseNode {
    constructor(node) {
        this.node = node;
    }

    /**
     * Get the display label for this node type
     * @returns {string}
     */
    getTypeLabel() {
        return this.node.type || 'Unknown';
    }

    /**
     * Get the emoji icon for this node type
     * @returns {string}
     */
    getTypeIcon() {
        return '📄';
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out)
     * @param {Canvas} canvas - Canvas instance for helper methods
     * @returns {string}
     */
    getSummaryText(canvas) {
        // Priority: user-set title > LLM summary > generated fallback
        if (this.node.title) return this.node.title;
        if (this.node.summary) return this.node.summary;

        // Default: strip markdown and truncate content
        const plainText = (this.node.content || '').replace(/[#*_`>\[\]()!]/g, '').trim();
        return canvas.truncate(plainText, 60);
    }

    /**
     * Render the HTML content for the node body
     * @param {Canvas} canvas - Canvas instance for helper methods
     * @returns {string} HTML string
     */
    renderContent(canvas) {
        // Default: render markdown content
        return canvas.renderMarkdown(this.node.content || '');
    }

    /**
     * Get action buttons for the node action bar
     * @returns {Array<{id: string, label: string, title: string}>}
     */
    getActions() {
        return [Actions.REPLY, Actions.COPY];
    }

    /**
     * Get header buttons for the node header
     * @returns {Array<{id: string, label: string, title: string, hidden?: boolean}>}
     */
    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }

    /**
     * Copy node content to clipboard
     * @param {Canvas} canvas - Canvas instance
     * @param {App} app - App instance
     * @returns {Promise<void>}
     */
    async copyToClipboard(canvas, app) {
        const text = this.node.content || '';
        if (!text) return;
        await navigator.clipboard.writeText(text);
        canvas.showCopyFeedback(this.node.id);
    }

    /**
     * Whether this node type has fixed scrollable dimensions.
     * All nodes now have fixed dimensions with scrollable content.
     * @returns {boolean}
     */
    isScrollable() {
        return true;
    }

    /**
     * Get additional CSS classes for the node-content wrapper.
     * Override in subclasses that need custom content container styling.
     * @returns {string} Space-separated CSS class names
     */
    getContentClasses() {
        return '';
    }
}

/**
 * Human message node
 */
class HumanNode extends BaseNode {
    getTypeLabel() { return 'You'; }
    getTypeIcon() { return '💬'; }
}

/**
 * AI response node
 */
class AINode extends BaseNode {
    getTypeLabel() { return 'AI'; }
    getTypeIcon() { return '🤖'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Note node
 */
class NoteNode extends BaseNode {
    getTypeLabel() { return 'Note'; }
    getTypeIcon() { return '📝'; }

    getActions() {
        return [Actions.REPLY, Actions.EDIT_CONTENT, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

/**
 * Summary node
 */
class SummaryNode extends BaseNode {
    getTypeLabel() { return 'Summary'; }
    getTypeIcon() { return '📋'; }

    getActions() {
        return [Actions.REPLY, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

/**
 * Reference node (link to external content)
 */
class ReferenceNode extends BaseNode {
    getTypeLabel() { return 'Reference'; }
    getTypeIcon() { return '🔗'; }

    getActions() {
        return [Actions.REPLY, Actions.FETCH_SUMMARIZE, Actions.COPY];
    }
}

/**
 * Search query node
 */
class SearchNode extends BaseNode {
    getTypeLabel() { return 'Search'; }
    getTypeIcon() { return '🔍'; }
}

/**
 * Research node (deep research with multiple sources)
 */
class ResearchNode extends BaseNode {
    getTypeLabel() { return 'Research'; }
    getTypeIcon() { return '📚'; }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP,  // For stopping research generation
            HeaderButtons.CONTINUE,  // For continuing stopped research
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }

    getActions() {
        return [Actions.REPLY, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

/**
 * Highlight node (excerpted text or image from another node)
 */
class HighlightNode extends BaseNode {
    getTypeLabel() { return 'Highlight'; }
    getTypeIcon() { return '✨'; }

    renderContent(canvas) {
        // If has image data, render image; otherwise render markdown
        if (this.node.imageData) {
            const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
            return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
        }
        return canvas.renderMarkdown(this.node.content || '');
    }
}

/**
 * Matrix node (cross-product evaluation table)
 */
class MatrixNode extends BaseNode {
    getTypeLabel() { return 'Matrix'; }
    getTypeIcon() { return '📊'; }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP,  // For stopping cell fills
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }

    /**
     * Matrix nodes use internal actions (Edit, Fill All) instead of the standard footer
     * @returns {Array}
     */
    getActions() {
        return [];
    }

    /**
     * Matrix needs special content container styling for the scrollable table
     * @returns {string}
     */
    getContentClasses() {
        return 'matrix-table-container';
    }

    getSummaryText(canvas) {
        // Priority: user-set title > LLM summary > generated fallback
        if (this.node.title) return this.node.title;
        if (this.node.summary) return this.node.summary;

        // For matrix nodes, generate from context and dimensions
        const context = this.node.context || 'Matrix';
        const rows = this.node.rowItems?.length || 0;
        const cols = this.node.colItems?.length || 0;
        return `${context} (${rows}×${cols})`;
    }

    /**
     * Render matrix-specific content: context bar, table, and internal actions.
     * The standard header/summary/resize-handles are rendered by canvas.js.
     * @param {Canvas} canvas
     * @returns {string} HTML for the content portion only
     */
    renderContent(canvas) {
        const { context, rowItems, colItems, cells, indexColWidth } = this.node;

        // Build table HTML with optional custom index column width
        const styleAttr = indexColWidth ? ` style="--index-col-width: ${indexColWidth}"` : '';
        let tableHtml = `<table class="matrix-table"${styleAttr}><thead><tr>`;

        // Corner cell with context and resize handle
        tableHtml += `<th class="corner-cell" title="${canvas.escapeHtml(context)}"><span class="matrix-header-text">${canvas.escapeHtml(context)}</span><div class="index-col-resize-handle" title="Drag to resize index column"></div></th>`;

        // Column headers - clickable to extract column
        for (let c = 0; c < colItems.length; c++) {
            const colItem = colItems[c];
            tableHtml += `<th class="col-header" data-col="${c}" title="Click to extract column: ${canvas.escapeHtml(colItem)}">
                <span class="matrix-header-text">${canvas.escapeHtml(colItem)}</span>
            </th>`;
        }
        tableHtml += '</tr></thead><tbody>';

        // Data rows
        for (let r = 0; r < rowItems.length; r++) {
            const rowItem = rowItems[r];
            tableHtml += '<tr>';

            // Row header - clickable to extract row
            tableHtml += `<td class="row-header" data-row="${r}" title="Click to extract row: ${canvas.escapeHtml(rowItem)}">
                <span class="matrix-header-text">${canvas.escapeHtml(rowItem)}</span>
            </td>`;

            // Cells
            for (let c = 0; c < colItems.length; c++) {
                const cellKey = `${r}-${c}`;
                const cell = cells[cellKey];
                const isFilled = cell && cell.filled && cell.content;

                if (isFilled) {
                    tableHtml += `<td class="matrix-cell filled" data-row="${r}" data-col="${c}" title="Click to view details">
                        <div class="matrix-cell-content">${canvas.escapeHtml(cell.content)}</div>
                    </td>`;
                } else {
                    tableHtml += `<td class="matrix-cell empty" data-row="${r}" data-col="${c}">
                        <div class="matrix-cell-empty">
                            <button class="matrix-cell-fill" title="Fill with concise AI evaluation">+</button>
                        </div>
                    </td>`;
                }
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';

        // Matrix-specific content: context bar at top, table, and internal actions at bottom
        return `
            <div class="matrix-context">
                <span class="matrix-context-text">${canvas.escapeHtml(context)}</span>
                <button class="matrix-context-copy" title="Copy context">📋</button>
            </div>
            ${tableHtml}
            <div class="matrix-actions">
                <button class="matrix-edit-btn" title="Edit rows and columns">Edit</button>
                <button class="matrix-fill-all-btn" title="Fill all empty cells with concise AI evaluations (2-3 sentences each)">Fill All</button>
            </div>
        `;
    }

    async copyToClipboard(canvas, app) {
        // Format matrix as markdown table
        if (!app?.formatMatrixAsText) {
            console.error('MatrixNode.copyToClipboard: app.formatMatrixAsText is not available');
            return;
        }
        const text = app.formatMatrixAsText(this.node);
        if (!text) return;
        await navigator.clipboard.writeText(text);
        canvas.showCopyFeedback(this.node.id);
    }
}

/**
 * Cell node (pinned cell from a matrix)
 */
class CellNode extends BaseNode {
    getTypeLabel() {
        // For contextual labels like "GPT-4 × Accuracy"
        return this.node.title || 'Cell';
    }
    getTypeIcon() { return '📦'; }
}

/**
 * Row node (extracted row from a matrix)
 */
class RowNode extends BaseNode {
    getTypeLabel() { return 'Row'; }
    getTypeIcon() { return '↔️'; }
}

/**
 * Column node (extracted column from a matrix)
 */
class ColumnNode extends BaseNode {
    getTypeLabel() { return 'Column'; }
    getTypeIcon() { return '↕️'; }
}

/**
 * Fetch result node (fetched content from URL via Exa)
 */
class FetchResultNode extends BaseNode {
    getTypeLabel() { return 'Fetched Content'; }
    getTypeIcon() { return '📄'; }

    getActions() {
        return [Actions.REPLY, Actions.EDIT_CONTENT, Actions.RESUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

/**
 * PDF node (imported PDF document)
 */
class PdfNode extends BaseNode {
    getTypeLabel() { return 'PDF'; }
    getTypeIcon() { return '📑'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

/**
 * CSV node (uploaded CSV data for analysis)
 */
class CsvNode extends BaseNode {
    getTypeLabel() { return 'CSV'; }
    getTypeIcon() { return '📊'; }

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
            html += `<br><span class="csv-columns">Columns: ${columns.map(c => canvas.escapeHtml(c)).join(', ')}</span>`;
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

/**
 * Code node (Python code for execution with Pyodide)
 */
class CodeNode extends BaseNode {
    getTypeLabel() { return 'Code'; }
    getTypeIcon() { return '🐍'; }

    getSummaryText(canvas) {
        if (this.node.title) return this.node.title;
        // Show first meaningful line of code
        const code = this.node.code || this.node.content || '';
        const firstLine = code.split('\n').find(line => line.trim() && !line.trim().startsWith('#')) || 'Python code';
        return canvas.truncate(firstLine.trim(), 50);
    }

    renderContent(canvas) {
        const code = this.node.code || this.node.content || '';
        const executionState = this.node.executionState || 'idle';
        const csvNodeIds = this.node.csvNodeIds || [];

        // Build header comment showing available data
        let dataHint = '';
        if (csvNodeIds.length === 1) {
            dataHint = `<div class="code-data-hint"># Data available as: df</div>`;
        } else if (csvNodeIds.length > 1) {
            const vars = csvNodeIds.map((_, i) => `df${i + 1}`).join(', ');
            dataHint = `<div class="code-data-hint"># Data available as: ${vars}</div>`;
        }

        // Execution state indicator
        let stateClass = '';
        let stateIndicator = '';
        if (executionState === 'running') {
            stateClass = 'code-running';
            stateIndicator = '<div class="code-state-indicator">Running...</div>';
        } else if (executionState === 'error') {
            stateClass = 'code-error';
        }

        // Syntax-highlighted read-only code display (click to edit opens modal)
        // Escape HTML to prevent XSS, highlight.js will handle the rest
        const escapedCode = canvas.escapeHtml(code) || '# Click Edit to add code...';

        let html = `<div class="code-node-content ${stateClass}">`;
        html += dataHint;
        html += `<div class="code-display" data-node-id="${this.node.id}">`;
        html += `<pre><code class="language-python">${escapedCode}</code></pre>`;
        html += `</div>`;
        html += stateIndicator;

        // Show inline error if present
        if (this.node.lastError) {
            html += `<div class="code-error-output">${canvas.escapeHtml(this.node.lastError)}</div>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Check if this code node has output to display
     */
    hasOutput() {
        return !!(
            this.node.outputHtml ||
            this.node.outputText ||
            this.node.outputStdout ||
            (this.node.installProgress && this.node.installProgress.length > 0)
        );
    }

    /**
     * Render the output panel content (called by canvas for the slide-out panel)
     */
    renderOutputPanel(canvas) {
        const outputHtml = this.node.outputHtml || null;
        const outputText = this.node.outputText || null;
        const outputStdout = this.node.outputStdout || null;
        const installProgress = this.node.installProgress || null;

        let html = `<div class="code-output-panel-content">`;

        // Show installation progress if present (during running state)
        if (installProgress && installProgress.length > 0) {
            html += `<div class="code-install-progress">`;
            for (const msg of installProgress) {
                html += `<div class="install-progress-line">${canvas.escapeHtml(msg)}</div>`;
            }
            html += `</div>`;
        }

        // Show stdout first if present
        if (outputStdout) {
            html += `<pre class="code-output-stdout">${canvas.escapeHtml(outputStdout)}</pre>`;
        }

        // Show result (HTML or text)
        if (outputHtml) {
            html += `<div class="code-output-result code-output-html">${outputHtml}</div>`;
        } else if (outputText) {
            html += `<pre class="code-output-result code-output-text">${canvas.escapeHtml(outputText)}</pre>`;
        }

        html += `</div>`;
        return html;
    }

    getActions() {
        return [Actions.EDIT_CODE, Actions.GENERATE, Actions.RUN_CODE, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.COLLAPSE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Opinion node (committee member's opinion)
 */
class OpinionNode extends BaseNode {
    getTypeLabel() { return 'Opinion'; }
    getTypeIcon() { return '🗣️'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Synthesis node (chairman's synthesized answer)
 */
class SynthesisNode extends BaseNode {
    getTypeLabel() { return 'Synthesis'; }
    getTypeIcon() { return '⚖️'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Review node (committee member's review of other opinions)
 */
class ReviewNode extends BaseNode {
    getTypeLabel() { return 'Review'; }
    getTypeIcon() { return '🔍'; }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }

    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE
        ];
    }
}

/**
 * Factcheck node (claim verification with verdicts)
 */
class FactcheckNode extends BaseNode {
    getTypeLabel() { return 'Factcheck'; }
    getTypeIcon() { return '🔍'; }

    getSummaryText(canvas) {
        const claims = this.node.claims || [];
        const count = claims.length;
        if (count === 0) return 'Fact Check';
        return `Fact Check · ${count} claim${count !== 1 ? 's' : ''}`;
    }

    renderContent(canvas) {
        const claims = this.node.claims || [];
        if (claims.length === 0) {
            return canvas.renderMarkdown(this.node.content || 'No claims to verify.');
        }

        // Render accordion-style claims
        const claimsHtml = claims.map((claim, index) => {
            const badge = this.getVerdictBadge(claim.status);
            const statusClass = claim.status || 'checking';
            const isChecking = claim.status === 'checking';

            let detailsHtml = '';
            if (!isChecking && claim.explanation) {
                const sourcesHtml = (claim.sources || []).map(s =>
                    `<a href="${canvas.escapeHtml(s.url)}" target="_blank" rel="noopener">${canvas.escapeHtml(s.title || s.url)}</a>`
                ).join(', ');

                detailsHtml = `
                    <div class="factcheck-details">
                        <p>${canvas.escapeHtml(claim.explanation)}</p>
                        ${sourcesHtml ? `<div class="factcheck-sources"><strong>Sources:</strong> ${sourcesHtml}</div>` : ''}
                    </div>
                `;
            }

            return `
                <div class="factcheck-claim ${statusClass}" data-claim-index="${index}">
                    <div class="factcheck-claim-header">
                        <span class="factcheck-badge">${badge}</span>
                        <span class="factcheck-claim-text">${canvas.escapeHtml(claim.text)}</span>
                        ${isChecking ? '<span class="factcheck-spinner">⟳</span>' : '<span class="factcheck-toggle">▼</span>'}
                    </div>
                    ${detailsHtml}
                </div>
            `;
        }).join('');

        return `<div class="factcheck-claims">${claimsHtml}</div>`;
    }

    getVerdictBadge(status) {
        const badges = {
            'checking': '🔄',
            'verified': '✅',
            'partially_true': '⚠️',
            'misleading': '🔶',
            'false': '❌',
            'unverifiable': '❓',
            'error': '⚠️'
        };
        return badges[status] || '❓';
    }

    getActions() {
        return [Actions.COPY];
    }

    getContentClasses() {
        return 'factcheck-content';
    }
}

/**
 * Image node (uploaded image for analysis)
 */
class ImageNode extends BaseNode {
    getTypeLabel() { return 'Image'; }
    getTypeIcon() { return '🖼️'; }

    getSummaryText(canvas) {
        return 'Image';
    }

    renderContent(canvas) {
        const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
        return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
    }

    async copyToClipboard(canvas, app) {
        if (!canvas?.copyImageToClipboard) {
            console.error('ImageNode.copyToClipboard: canvas.copyImageToClipboard is not available');
            return;
        }
        await canvas.copyImageToClipboard(this.node.imageData, this.node.mimeType);
        canvas.showCopyFeedback(this.node.id);
    }
}

/**
 * Flashcard node (spaced repetition Q/A card)
 */
class FlashcardNode extends BaseNode {
    getTypeLabel() { return 'Flashcard'; }
    getTypeIcon() { return '🎴'; }

    getSummaryText(canvas) {
        // Priority: user-set title > question content truncated
        if (this.node.title) return this.node.title;
        const plainText = (this.node.content || '').replace(/[#*_`>\[\]()!]/g, '').trim();
        return canvas.truncate(plainText, 60);
    }

    renderContent(canvas) {
        const front = canvas.escapeHtml(this.node.content || 'No question');
        const back = canvas.escapeHtml(this.node.back || 'No answer');

        // Determine SRS status for display
        let statusClass = 'new';
        let statusText = 'New';
        if (this.node.srs) {
            const { nextReviewDate } = this.node.srs;
            if (nextReviewDate) {
                const now = new Date();
                const reviewDate = new Date(nextReviewDate);
                if (reviewDate <= now) {
                    statusClass = 'due';
                    statusText = 'Due';
                } else {
                    // Card has been reviewed and has a future due date
                    statusClass = 'learning';
                    const daysUntil = Math.ceil((reviewDate - now) / 86400000);
                    statusText = daysUntil === 1 ? 'Due tomorrow' : `Due in ${daysUntil} days`;
                }
            }
        }

        return `
            <div class="flashcard-container">
                <div class="flashcard-status ${statusClass}">${statusText}</div>
                <div class="flashcard-card">
                    <div class="flashcard-front">
                        <div class="flashcard-label">Question</div>
                        <div class="flashcard-text">${front}</div>
                    </div>
                    <div class="flashcard-back">
                        <div class="flashcard-label">Answer</div>
                        <div class="flashcard-text">${back}</div>
                    </div>
                </div>
            </div>
        `;
    }

    getActions() {
        return [Actions.FLIP_CARD, Actions.REVIEW_CARD, Actions.EDIT_CONTENT, Actions.COPY];
    }
}

/**
 * Factory function to wrap a node with its protocol class
 * Checks node.imageData first (for image highlights), then dispatches by node.type
 *
 * @param {Object} node - Node object from graph
 * @returns {BaseNode} Protocol instance for the node
 */
function wrapNode(node) {
    // Image data takes precedence (for IMAGE nodes or HIGHLIGHT nodes with images)
    if (node.imageData && node.type === NodeType.IMAGE) {
        return new ImageNode(node);
    }

    // Dispatch by node type
    const classMap = {
        [NodeType.HUMAN]: HumanNode,
        [NodeType.AI]: AINode,
        [NodeType.NOTE]: NoteNode,
        [NodeType.SUMMARY]: SummaryNode,
        [NodeType.REFERENCE]: ReferenceNode,
        [NodeType.SEARCH]: SearchNode,
        [NodeType.RESEARCH]: ResearchNode,
        [NodeType.HIGHLIGHT]: HighlightNode,
        [NodeType.MATRIX]: MatrixNode,
        [NodeType.CELL]: CellNode,
        [NodeType.ROW]: RowNode,
        [NodeType.COLUMN]: ColumnNode,
        [NodeType.FETCH_RESULT]: FetchResultNode,
        [NodeType.PDF]: PdfNode,
        [NodeType.OPINION]: OpinionNode,
        [NodeType.SYNTHESIS]: SynthesisNode,
        [NodeType.REVIEW]: ReviewNode,
        [NodeType.FACTCHECK]: FactcheckNode,
        [NodeType.IMAGE]: ImageNode,
        [NodeType.FLASHCARD]: FlashcardNode,
        [NodeType.CSV]: CsvNode,
        [NodeType.CODE]: CodeNode
    };

    const NodeClass = classMap[node.type] || BaseNode;
    return new NodeClass(node);
}

/**
 * Create a type-appropriate mock node for protocol validation
 * @param {string} nodeType - The node type
 * @returns {Object} Mock node with required properties for that type
 */
function createMockNodeForType(nodeType) {
    const baseMock = { type: nodeType, content: '' };

    // Add type-specific properties that methods might access
    if (nodeType === NodeType.IMAGE) {
        return { ...baseMock, imageData: 'mockImageData', mimeType: 'image/png' };
    }
    if (nodeType === NodeType.MATRIX) {
        return {
            ...baseMock,
            context: 'Test Context',
            rowItems: ['Row1'],
            colItems: ['Col1'],
            cells: {}
        };
    }
    if (nodeType === NodeType.CELL) {
        return { ...baseMock, title: 'Test Cell Title' };
    }
    if (nodeType === NodeType.HIGHLIGHT) {
        // HighlightNode can have imageData or just content
        return baseMock;
    }
    if (nodeType === NodeType.FLASHCARD) {
        return { ...baseMock, content: 'Test question', back: 'Test answer', srs: null };
    }

    return baseMock;
}

/**
 * Validate that a node protocol class implements all required methods
 * Used for testing protocol compliance
 *
 * @param {Function} NodeClass - Node class constructor
 * @returns {boolean} True if all methods are implemented
 */
function validateNodeProtocol(NodeClass) {
    const requiredMethods = [
        'getTypeLabel',
        'getTypeIcon',
        'getSummaryText',
        'renderContent',
        'getActions',
        'getHeaderButtons',
        'copyToClipboard',
        'isScrollable'
    ];

    // Try to determine the node type from the class name
    // This is a heuristic - class names should match node types
    let nodeType = NodeType.NOTE; // Default fallback
    const className = NodeClass.name;
    if (className.includes('Image')) nodeType = NodeType.IMAGE;
    else if (className.includes('Matrix')) nodeType = NodeType.MATRIX;
    else if (className.includes('Cell')) nodeType = NodeType.CELL;
    else if (className.includes('Human')) nodeType = NodeType.HUMAN;
    else if (className.includes('AI') && !className.includes('Human')) nodeType = NodeType.AI;
    else if (className.includes('Note')) nodeType = NodeType.NOTE;
    else if (className.includes('Summary')) nodeType = NodeType.SUMMARY;
    else if (className.includes('Reference')) nodeType = NodeType.REFERENCE;
    else if (className.includes('Search')) nodeType = NodeType.SEARCH;
    else if (className.includes('Research')) nodeType = NodeType.RESEARCH;
    else if (className.includes('Highlight')) nodeType = NodeType.HIGHLIGHT;
    else if (className.includes('Row')) nodeType = NodeType.ROW;
    else if (className.includes('Column')) nodeType = NodeType.COLUMN;
    else if (className.includes('FetchResult')) nodeType = NodeType.FETCH_RESULT;
    else if (className.includes('Pdf')) nodeType = NodeType.PDF;
    else if (className.includes('Opinion')) nodeType = NodeType.OPINION;
    else if (className.includes('Synthesis')) nodeType = NodeType.SYNTHESIS;
    else if (className.includes('Review')) nodeType = NodeType.REVIEW;
    else if (className.includes('Factcheck')) nodeType = NodeType.FACTCHECK;
    else if (className.includes('Flashcard')) nodeType = NodeType.FLASHCARD;
    else if (className.includes('Csv')) nodeType = NodeType.CSV;
    else if (className.includes('Code')) nodeType = NodeType.CODE;

    // Create a type-appropriate mock node
    const mockNode = createMockNodeForType(nodeType);
    const instance = new NodeClass(mockNode);

    for (const method of requiredMethods) {
        if (typeof instance[method] !== 'function') {
            return false;
        }
    }

    return true;
}

// Export for use in other modules
window.wrapNode = wrapNode;
window.validateNodeProtocol = validateNodeProtocol;
window.Actions = Actions;
window.HeaderButtons = HeaderButtons;

// Export classes for testing
window.BaseNode = BaseNode;
window.HumanNode = HumanNode;
window.AINode = AINode;
window.NoteNode = NoteNode;
window.SummaryNode = SummaryNode;
window.ReferenceNode = ReferenceNode;
window.SearchNode = SearchNode;
window.ResearchNode = ResearchNode;
window.HighlightNode = HighlightNode;
window.MatrixNode = MatrixNode;
window.CellNode = CellNode;
window.RowNode = RowNode;
window.ColumnNode = ColumnNode;
window.FetchResultNode = FetchResultNode;
window.PdfNode = PdfNode;
window.OpinionNode = OpinionNode;
window.SynthesisNode = SynthesisNode;
window.ReviewNode = ReviewNode;
window.FactcheckNode = FactcheckNode;
window.ImageNode = ImageNode;
window.FlashcardNode = FlashcardNode;
window.CsvNode = CsvNode;
window.CodeNode = CodeNode;

// CommonJS export for Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        wrapNode,
        validateNodeProtocol,
        Actions,
        HeaderButtons,
        BaseNode,
        HumanNode,
        AINode,
        NoteNode,
        SummaryNode,
        ReferenceNode,
        SearchNode,
        ResearchNode,
        HighlightNode,
        MatrixNode,
        CellNode,
        RowNode,
        ColumnNode,
        FetchResultNode,
        PdfNode,
        OpinionNode,
        SynthesisNode,
        ReviewNode,
        FactcheckNode,
        ImageNode,
        FlashcardNode,
        CsvNode,
        CodeNode
    };
}
