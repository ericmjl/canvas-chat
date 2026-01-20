/**
 * Synthesis Node Plugin (Built-in)
 *
 * Provides synthesis nodes for committee chairman's synthesized answers.
 * Synthesis nodes represent the chairman's synthesized response combining
 * multiple committee member opinions. They support stop/continue controls
 * for streaming responses and include actions for summarizing and creating flashcards.
 */
import { BaseNode, Actions, HeaderButtons } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * SynthesisNode - Protocol for chairman's synthesized response
 */
class SynthesisNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Synthesis';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '⚖️';
    }

    /**
     * Get action buttons for this node
     * @returns {Array<string>}
     */
    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }

    /**
     * Check if this node supports stop/continue functionality
     * @returns {boolean}
     */
    supportsStopContinue() {
        return true;
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
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE,
        ];
    }
}

NodeRegistry.register({
    type: 'synthesis',
    protocol: SynthesisNode,
    defaultSize: { width: 640, height: 480 },
});

export { SynthesisNode };
console.log('Synthesis node plugin loaded');
