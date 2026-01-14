/**
 * PDF Node Plugin (Built-in)
 *
 * Provides PDF document nodes for imported PDF files.
 * PDF nodes represent uploaded PDF documents that can be summarized,
 * used to create flashcards, or replied to.
 */
import { BaseNode, Actions } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

class PdfNode extends BaseNode {
    getTypeLabel() {
        return 'PDF';
    }

    getTypeIcon() {
        return '📑';
    }

    getActions() {
        return [Actions.REPLY, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

NodeRegistry.register({
    type: 'pdf',
    protocol: PdfNode,
    defaultSize: { width: 640, height: 480 },
});

export { PdfNode };
console.log('PDF node plugin loaded');
