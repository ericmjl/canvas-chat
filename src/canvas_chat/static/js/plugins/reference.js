/**
 * Reference Plugin (Built-in)
 *
 * Provides reference nodes for search results and web links.
 * Reference nodes display title, URL, and snippet from search results.
 * They support fetching full content and summarizing via the FETCH_SUMMARIZE action.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * ReferenceNode - Protocol for search results
 */
class ReferenceNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Reference';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '🔗';
    }

    /**
     * Get action buttons for this node
     * @returns {Array<string>}
     */
    getActions() {
        return [Actions.REPLY, Actions.FETCH_SUMMARIZE, Actions.COPY];
    }
}

NodeRegistry.register({
    type: 'reference',
    protocol: ReferenceNode,
    defaultSize: { width: 420, height: 200 },
});

export { ReferenceNode };
console.log('Reference plugin loaded');
