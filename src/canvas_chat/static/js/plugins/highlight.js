/**
 * Highlight Feature Module
 *
 * Handles highlight-related functionality:
 * - Highlight source text in parent node when a highlight node is selected
 *
 * This feature integrates with the canvas event system to automatically
 * highlight the source text when a highlight node is selected.
 */

import { NodeType } from '../graph-types.js';
import { FeaturePlugin } from '../feature-plugin.js';

/**
 * HighlightFeature class manages all highlight-related functionality.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
class HighlightFeature extends FeaturePlugin {
    /**
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     */
    async onLoad() {
        console.log('[HighlightFeature] Loaded');
    }

    /**
     * Lifecycle hook called when the plugin is unloaded.
     */
    async onUnload() {
        console.log('[HighlightFeature] Unloaded');
    }

    /**
     * Get canvas event handlers for highlight functionality.
     * @returns {Object} Event name -> handler function mapping
     */
    getCanvasEventHandlers() {
        return {
            nodeSelect: this.handleNodeSelect.bind(this),
        };
    }

    /**
     * Handle node selection events.
     * When a highlight node is selected, highlight the source text in the parent node.
     * @param {string[]} selectedIds - Array of selected node IDs
     */
    handleNodeSelect(selectedIds) {
        if (selectedIds.length !== 1) {
            return;
        }

        const node = this.graph.getNode(selectedIds[0]);
        if (!node) return;

        if (node.type === NodeType.HIGHLIGHT) {
            this.highlightSourceTextInParent(node);
        }
    }

    /**
     * Highlight the source text in the parent node when a highlight node is selected.
     * @param {Object} highlightNode - The highlight node that was selected
     */
    highlightSourceTextInParent(highlightNode) {
        const parents = this.graph.getParents(highlightNode.id);
        if (parents.length === 0) return;

        const parentNode = parents[0];
        if (!parentNode) return;

        // Extract the excerpt text from the highlight node (strip "> " prefix)
        const excerptText = highlightNode.content ? highlightNode.content.replace(/^>\s*/, '') : '';

        if (!excerptText) return;

        // Highlight the matching text in the parent node
        this.canvas.highlightTextInNode(parentNode.id, excerptText);
    }
}

export { HighlightFeature };
