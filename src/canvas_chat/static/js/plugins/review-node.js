/**
 * Review Node Plugin (Built-in)
 *
 * Provides review nodes for committee member reviews of other opinions.
 * Review nodes represent a committee member's review of other members'
 * opinions. They support stop/continue controls for streaming responses
 * and include actions for summarizing and creating flashcards.
 */
import { BaseNode, Actions, HeaderButtons } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

class ReviewNode extends BaseNode {
    getTypeLabel() {
        return 'Review';
    }

    getTypeIcon() {
        return '🔍';
    }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }

    supportsStopContinue() {
        return true;
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
            HeaderButtons.DELETE,
        ];
    }
}

NodeRegistry.register({
    type: 'review',
    protocol: ReviewNode,
    defaultSize: { width: 640, height: 480 },
});

export { ReviewNode };
console.log('Review node plugin loaded');
