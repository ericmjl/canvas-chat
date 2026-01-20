/**
 * AI Node Plugin (Built-in)
 *
 * Provides AI response nodes in conversations.
 * AI nodes represent LLM-generated responses in the chat canvas.
 * They support stop/continue controls for streaming responses and include
 * actions for summarizing and creating flashcards.
 */
import { BaseNode, Actions, HeaderButtons } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * AINode - Protocol for AI-generated responses
 */
class AINode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'AI';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '🤖';
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
    type: 'ai',
    protocol: AINode,
    defaultSize: { width: 640, height: 480 },
});

export { AINode };
console.log('AI node plugin loaded');
