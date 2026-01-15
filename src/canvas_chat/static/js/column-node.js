/**
 * Column Node Plugin (Built-in)
 *
 * Provides column nodes for extracted matrix columns.
 * Column nodes display a single column extracted from a matrix.
 */
import { BaseNode } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from './graph-types.js';

class ColumnNode extends BaseNode {
    getTypeLabel() {
        return 'Column';
    }

    getTypeIcon() {
        return '↕️';
    }
}

// Register with NodeRegistry
NodeRegistry.register({
    type: NodeType.COLUMN,
    protocol: ColumnNode,
    defaultSize: DEFAULT_NODE_SIZES[NodeType.COLUMN],
});
