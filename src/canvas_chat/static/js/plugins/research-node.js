/**
 * Research Node Plugin (Built-in)
 *
 * Provides research nodes for deep research with multiple sources.
 * Research nodes represent Exa deep research operations that can be
 * stopped and continued. They support creating flashcards from research results.
 */
import { BaseNode, Actions, HeaderButtons } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * ResearchNode - Protocol for deep research results
 */
class ResearchNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Research';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '📚';
    }

    /**
     * Get header buttons for this node
     * @returns {Array<string>}
     */
    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.COLLAPSE,
            HeaderButtons.STOP, // For stopping research generation
            HeaderButtons.CONTINUE, // For continuing stopped research
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE,
        ];
    }

    /**
     * Get action buttons for this node
     * @returns {Array<string>}
     */
    getActions() {
        return [Actions.REPLY, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

NodeRegistry.register({
    type: 'research',
    protocol: ResearchNode,
    defaultSize: { width: 640, height: 480 },
});

export { ResearchNode };
console.log('Research node plugin loaded');
