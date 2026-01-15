/**
 * Synthesis Node Plugin (Built-in)
 *
 * Provides synthesis nodes for committee chairman's synthesized answers.
 * Synthesis nodes represent the chairman's synthesized response combining
 * multiple committee member opinions. They support stop/continue controls
 * for streaming responses and include actions for summarizing and creating flashcards.
 */
import { BaseNode, Actions, HeaderButtons } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

class SynthesisNode extends BaseNode {
    getTypeLabel() {
        return 'Synthesis';
    }

    getTypeIcon() {
        return '⚖️';
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
    type: 'synthesis',
    protocol: SynthesisNode,
    defaultSize: { width: 640, height: 480 },
});

export { SynthesisNode };
console.log('Synthesis node plugin loaded');
