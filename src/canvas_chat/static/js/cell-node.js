/**
 * Cell Node Plugin (Built-in)
 *
 * Provides cell nodes for pinned matrix cells.
 * Cell nodes display a single cell extracted from a matrix.
 */
import { BaseNode } from './node-protocols.js';
import { NodeRegistry } from './node-registry.js';
import { NodeType, DEFAULT_NODE_SIZES } from './graph-types.js';

class CellNode extends BaseNode {
    getTypeLabel() {
        // For contextual labels like "GPT-4 × Accuracy"
        return this.node.title || 'Cell';
    }

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
