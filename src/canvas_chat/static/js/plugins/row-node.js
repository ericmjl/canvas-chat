/**
 * Row Node Plugin (Built-in)
 *
 * Provides row nodes for extracted matrix rows.
 * Row nodes display a single row extracted from a matrix.
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from '../graph-types.js';

class RowNode extends BaseNode {
    getTypeLabel() {
        return 'Row';
    }

    getTypeIcon() {
        return '↔️';
    }
}

// Register with NodeRegistry
NodeRegistry.register({
    type: NodeType.ROW,
    protocol: RowNode,
    defaultSize: DEFAULT_NODE_SIZES[NodeType.ROW],
});
