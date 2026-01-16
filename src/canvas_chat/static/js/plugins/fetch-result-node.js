/**
 * Fetch Result Node Plugin (Built-in)
 *
 * Provides fetch result nodes for fetched content from URLs (via Exa API).
 * Fetch result nodes display the raw fetched content and support actions like
 * resummarizing, editing, and creating flashcards.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

class FetchResultNode extends BaseNode {
    getTypeLabel() {
        return 'Fetched Content';
    }

    getTypeIcon() {
        return '📄';
    }

    getAdditionalActions() {
        return [Actions.RESUMMARIZE, Actions.CREATE_FLASHCARDS];
    }
}

NodeRegistry.register({
    type: 'fetch_result',
    protocol: FetchResultNode,
    defaultSize: { width: 640, height: 480 },
});

export { FetchResultNode };
console.log('Fetch result node plugin loaded');
