/**
 * Code Node Plugin (Built-in)
 *
 * Provides code nodes for Python code execution with Pyodide.
 * Code nodes support syntax highlighting, execution, output panels, and self-healing.
 */
import { BaseNode, Actions, HeaderButtons } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from './graph-types.js';

class CodeNode extends BaseNode {
    getTypeLabel() {
        return 'Code';
    }

    getTypeIcon() {
        return '🐍';
    }

    getSummaryText(canvas) {
        if (this.node.title) return this.node.title;
        // Show first meaningful line of code
        const code = this.node.code || this.node.content || '';
        const firstLine = code.split('\n').find((line) => line.trim() && !line.trim().startsWith('#')) || 'Python code';
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
        const selfHealingStatus = this.node.selfHealingStatus;
        const selfHealingAttempt = this.node.selfHealingAttempt;

        if (executionState === 'running') {
            stateClass = 'code-running';
            if (selfHealingAttempt) {
                stateIndicator = `<div class="code-state-indicator code-self-healing">${selfHealingStatus === 'verifying' ? '🔍 Verifying' : '🔧 Self-healing'} (attempt ${selfHealingAttempt}/3)...</div>`;
            } else {
                stateIndicator = '<div class="code-state-indicator">Running...</div>';
            }
        } else if (executionState === 'error') {
            stateClass = 'code-error';
        } else if (selfHealingStatus === 'fixed') {
            // Show success badge if code was self-healed
            stateIndicator = '<div class="code-state-indicator code-self-healed">✅ Self-healed</div>';
        } else if (selfHealingStatus === 'failed') {
            // Show failure badge if self-healing gave up
            stateIndicator = '<div class="code-state-indicator code-self-heal-failed">⚠️ Self-healing failed</div>';
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
     * @returns {boolean}
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
     * @param {Canvas} canvas - Canvas instance for helper methods
     * @returns {string} HTML string
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

    /**
     * Update code content in-place (for streaming updates)
     * @param {string} nodeId - The node ID
     * @param {string} content - New code content
     * @param {boolean} isStreaming - Whether this is a streaming update
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @returns {boolean}
     */
    updateContent(nodeId, content, isStreaming, canvas) {
        // Update the code display in-place
        const wrapper = canvas.nodeElements.get(nodeId);
        if (!wrapper) return false;

        const codeEl = wrapper.querySelector('.code-display code');
        if (codeEl && window.hljs) {
            codeEl.textContent = content;
            codeEl.className = 'language-python';
            delete codeEl.dataset.highlighted;
            window.hljs.highlightElement(codeEl);
        }
        return true;
    }

    getActions() {
        return [Actions.EDIT_CODE, Actions.GENERATE, Actions.RUN_CODE, Actions.COPY];
    }

    supportsStopContinue() {
        return true;
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
            HeaderButtons.DELETE,
        ];
    }

    /**
     * Check if this node supports code execution operations
     * @returns {boolean}
     */
    supportsCodeExecution() {
        return true;
    }

    /**
     * Get the code content from this node
     * @returns {string|null}
     */
    getCode() {
        return this.node.code || this.node.content || null;
    }

    /**
     * Code-specific event bindings for syntax highlighting initialization
     */
    getEventBindings() {
        return [
            // Initialize syntax highlighting after render
            {
                selector: '.code-display',
                event: 'init', // Special event: called after render, not a DOM event
                handler: (nodeId, e, canvas) => {
                    if (window.hljs) {
                        const codeEl = e.currentTarget.querySelector('code');
                        if (codeEl) {
                            window.hljs.highlightElement(codeEl);
                        }
                    }
                },
            },
        ];
    }
}

// Register with NodeRegistry
NodeRegistry.register({
    type: NodeType.CODE,
    protocol: CodeNode,
    defaultSize: DEFAULT_NODE_SIZES[NodeType.CODE],
});
