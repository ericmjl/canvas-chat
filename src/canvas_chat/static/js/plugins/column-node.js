/**
 * Column Node Plugin (Built-in)
 *
 * Provides column nodes for extracted matrix columns.
 * Column nodes display a single column extracted from a matrix.
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from '../graph-types.js';

/**
 * ColumnNode - Protocol for extracted matrix columns
 */
class ColumnNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Column';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
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
