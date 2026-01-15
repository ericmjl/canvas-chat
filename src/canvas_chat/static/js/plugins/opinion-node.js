/**
 * Opinion Node Plugin (Built-in)
 *
 * Provides opinion nodes for committee member opinions.
 * Opinion nodes represent individual committee member's opinions in the
 * committee feature. They support stop/continue controls for streaming
 * responses and include actions for summarizing and creating flashcards.
 */
import { BaseNode, Actions, HeaderButtons } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

class OpinionNode extends BaseNode {
    getTypeLabel() {
        return 'Opinion';
    }

    getTypeIcon() {
        return '🗣️';
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
    type: 'opinion',
    protocol: OpinionNode,
    defaultSize: { width: 640, height: 480 },
});

export { OpinionNode };
console.log('Opinion node plugin loaded');
