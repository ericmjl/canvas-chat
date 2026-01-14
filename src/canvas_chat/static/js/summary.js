/**
 * Summary Plugin (Built-in)
 *
 * Provides summary nodes for AI-generated summaries.
 * Summary nodes display concise summaries of longer content.
 */

import { BaseNode, Actions } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

/**
 * Summary Node Protocol Class
 * Defines how summary nodes are rendered and what actions they support.
 */
class SummaryNode extends BaseNode {
    /**
     * Display label shown in node header
     */
    getTypeLabel() {
        return 'Summary';
    }

    /**
     * Emoji icon for the node type
     */
    getTypeIcon() {
        return '📋';
    }

    /**
     * Action buttons for the summary node
     */
    getActions() {
        return [Actions.REPLY, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

// Register the summary node type
NodeRegistry.register({
    type: 'summary',
    protocol: SummaryNode,
    defaultSize: { width: 640, height: 480 },
    // Note: CSS styles for summary nodes are in nodes.css (no custom CSS needed)
});

// Export SummaryNode for testing
export { SummaryNode };

console.log('Summary plugin loaded');
