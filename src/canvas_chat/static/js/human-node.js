/**
 * Human Node Plugin (Built-in)
 *
 * Provides human/user message nodes in conversations.
 * Human nodes represent user input in the chat canvas.
 * They use default actions (REPLY, COPY) from BaseNode.
 */
import { BaseNode } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';

class HumanNode extends BaseNode {
    getTypeLabel() {
        return 'You';
    }

    getTypeIcon() {
        return '💬';
    }
}

NodeRegistry.register({
    type: 'human',
    protocol: HumanNode,
    defaultSize: { width: 420, height: 200 },
});

export { HumanNode };
console.log('Human node plugin loaded');
