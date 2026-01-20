/**
 * Row Node Plugin (Built-in)
 *
 * Provides row nodes for extracted matrix rows.
 * Row nodes display a single row extracted from a matrix.
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from '../graph-types.js';

/**
 * RowNode - Protocol for extracted matrix rows
 */
class RowNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Row';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
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
