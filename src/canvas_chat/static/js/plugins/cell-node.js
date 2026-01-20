/**
 * Cell Node Plugin (Built-in)
 *
 * Provides cell nodes for pinned matrix cells.
 * Cell nodes display a single cell extracted from a matrix.
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from '../graph-types.js';

/**
 * CellNode - Protocol for pinned matrix cells
 */
class CellNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        // For contextual labels like "GPT-4 × Accuracy"
        return this.node.title || 'Cell';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '📦';
    }

    /**
     * Get the matrix ID this cell belongs to
     * @returns {string|null}
     */
    getMatrixId() {
        return this.node.matrixId || null;
    }
}

// Register with NodeRegistry
NodeRegistry.register({
    type: NodeType.CELL,
    protocol: CellNode,
    defaultSize: DEFAULT_NODE_SIZES[NodeType.CELL],
});
