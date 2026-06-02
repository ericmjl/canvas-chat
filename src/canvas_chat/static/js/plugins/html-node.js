/**
 * HTML Node Plugin (Built-in)
 *
 * Provides HTML nodes for rendering arbitrary HTML content including
 * scripts (Plotly charts, interactive widgets, etc.) in a sandboxed iframe.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * HtmlNode - Protocol for rendering HTML content in an iframe
 *
 * Uses srcdoc on a sandboxed iframe so <script> tags execute properly.
 * The iframe auto-sizes to fill the node content area.
 */
class HtmlNode extends BaseNode {
    /**
     * Display label shown in node header
     * @returns {string}
     */
    getTypeLabel() {
        return 'HTML';
    }

    /**
     * Emoji icon for the node type
     * @returns {string}
     */
    getTypeIcon() {
        return '🌐';
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out)
     * @param {Canvas} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        return 'HTML content';
    }

    /**
     * Render the content — an iframe with srcdoc for full HTML execution
     * @param {Canvas} _canvas
     * @returns {string}
     */
    renderContent(_canvas) {
        const htmlContent = this.node.content || '';
        const escaped = htmlContent
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `<div class="html-node-content"><iframe sandbox="allow-scripts allow-same-origin" srcdoc="${escaped}" class="html-node-iframe" frameborder="0"></iframe></div>`;
    }

    /**
     * HTML nodes are not content-editable (the HTML source is managed programmatically)
     * @returns {boolean}
     */
    isContentEditable() {
        return false;
    }

    /**
     * Get actions for this node type
     * @returns {Array<Object>}
     */
    getActions() {
        return [Actions.COPY];
    }

    /**
     * Get keyboard shortcuts for this node type
     * @returns {Object}
     */
    getKeyboardShortcuts() {
        return {
            c: { action: 'copy', handler: 'nodeCopy' },
        };
    }
}

NodeRegistry.register({
    type: 'html',
    protocol: HtmlNode,
    defaultSize: { width: 640, height: 480 },
    css: `
.html-node-content {
    width: 100%;
    height: 100%;
    overflow: hidden;
}
.html-node-iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
}
    `,
});

export { HtmlNode };
console.log('HTML node plugin loaded');
