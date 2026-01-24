/**
 * Layout utilities for node positioning and overlap resolution.
 *
 * These are pure functions that can be imported and tested independently.
 * They operate on node-like objects with { position: { x, y }, width?, height? }.
 */

// Type definitions for better IDE support and type checking
/**
 * @typedef {Object} NodePosition
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} NodeDimensions
 * @property {number} width - Node width
 * @property {number} height - Node height
 */

/**
 * @typedef {Object} Node
 * @property {string} id - Unique node identifier
 * @property {NodePosition} position - Node position
 * @property {number} [width] - Optional width override
 * @property {number} [height] - Optional height override
 */

/**
 * @typedef {Map<string, NodeDimensions>} DimensionsMap
 * - Map of nodeId -> { width, height } for custom dimensions
 */

// Default node dimensions
const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 220;
const DEFAULT_PADDING = 40;

/**
 * Get the size of a node, using defaults if not specified.
 * @param {Node} node - Node with optional width/height properties
 * @param {DimensionsMap|null} dimensions - Optional map of nodeId -> { width, height }
 * @returns {{ width: number, height: number }}
 */
function getNodeSize(node, dimensions = null) {
    if (dimensions && node.id) {
        const dim = dimensions.get(node.id);
        if (dim) {
            return { width: dim.width, height: dim.height };
        }
    }
    return {
        width: node.width || DEFAULT_WIDTH,
        height: node.height || DEFAULT_HEIGHT,
    };
}

/**
 * Check if a position would overlap with any existing nodes.
 * @param {{ x: number, y: number }} pos - Position to check
 * @param {number} width - Width of the new node
 * @param {number} height - Height of the new node
 * @param {Array.<Node>} nodes - Array of existing nodes (with position, optional width/height)
 * @param {number} padding - Minimum gap between nodes (default: 20)
 * @returns {boolean} True if there would be overlap
 */
function wouldOverlapNodes(pos, width, height, nodes, padding = 20) {
    for (const node of nodes) {
        const nodeWidth = node.width || DEFAULT_WIDTH;
        const nodeHeight = node.height || 200; // Legacy default for this function

        // Check bounding box overlap
        const noOverlap =
            pos.x + width + padding < node.position.x || // new is left of existing
            pos.x > node.position.x + nodeWidth + padding || // new is right of existing
            pos.y + height + padding < node.position.y || // new is above existing
            pos.y > node.position.y + nodeHeight + padding; // new is below existing

        if (!noOverlap) {
            return true; // There is overlap
        }
    }

    return false; // No overlap with any node
}

/**
 * Calculate overlap between two nodes.
 * @param {Node} nodeA - First node (with position, optional width/height)
 * @param {Node} nodeB - Second node (with position, optional width/height)
 * @param {number} padding - Padding to include in overlap calculation (default: 40)
 * @param {DimensionsMap|null} dimensions - Optional map of nodeId -> { width, height }
 * @returns {{ overlapX: number, overlapY: number }} - Amount of overlap in each dimension
 */
function getOverlap(nodeA, nodeB, padding = DEFAULT_PADDING, dimensions = null) {
    const sizeA = getNodeSize(nodeA, dimensions);
    const sizeB = getNodeSize(nodeB, dimensions);

    const aLeft = nodeA.position.x;
    const aRight = nodeA.position.x + sizeA.width + padding;
    const aTop = nodeA.position.y;
    const aBottom = nodeA.position.y + sizeA.height + padding;

    const bLeft = nodeB.position.x;
    const bRight = nodeB.position.x + sizeB.width + padding;
    const bTop = nodeB.position.y;
    const bBottom = nodeB.position.y + sizeB.height + padding;

    // Calculate overlap in each dimension
    const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
    const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

    // Only overlapping if both dimensions overlap
    if (overlapX > 0 && overlapY > 0) {
        return { overlapX, overlapY };
    }
    return { overlapX: 0, overlapY: 0 };
}

/**
 * Check if any nodes in the array overlap with each other.
 * @param {Array.<Node>} nodes - Array of nodes to check (with position, optional width/height)
 * @param {number} padding - Padding for overlap calculation (default: 40)
 * @param {DimensionsMap|null} dimensions - Optional map of nodeId -> { width, height }
 * @returns {boolean} True if any overlap exists
 */
function hasAnyOverlap(nodes, padding = DEFAULT_PADDING, dimensions = null) {
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const { overlapX, overlapY } = getOverlap(nodes[i], nodes[j], padding, dimensions);
            if (overlapX > 0 && overlapY > 0) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Resolve overlapping nodes by nudging them apart.
 * Mutates the position of nodes in place.
 * @param {Array.<Node>} nodes - Array of nodes to resolve (with position, optional width/height)
 * @param {number} padding - Padding between nodes (default: 40)
 * @param {number} maxIterations - Maximum iterations to attempt (default: 50)
 * @param {DimensionsMap|null} dimensions - Optional map of nodeId -> { width, height }
 */
function resolveOverlaps(nodes, padding = DEFAULT_PADDING, maxIterations = 50, dimensions = null) {
    for (let iter = 0; iter < maxIterations; iter++) {
        let hasOverlap = false;

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const nodeA = nodes[i];
                const nodeB = nodes[j];

                const { overlapX, overlapY } = getOverlap(nodeA, nodeB, padding, dimensions);

                if (overlapX > 0 && overlapY > 0) {
                    hasOverlap = true;

                    const sizeA = getNodeSize(nodeA, dimensions);
                    const sizeB = getNodeSize(nodeB, dimensions);

                    // Calculate centers
                    const centerAx = nodeA.position.x + sizeA.width / 2;
                    const centerAy = nodeA.position.y + sizeA.height / 2;
                    const centerBx = nodeB.position.x + sizeB.width / 2;
                    const centerBy = nodeB.position.y + sizeB.height / 2;

                    // Push apart along the axis of minimum overlap (more efficient)
                    // This avoids diagonal pushes that may not resolve the overlap
                    if (overlapX < overlapY) {
                        // Push horizontally
                        const pushAmount = overlapX / 2 + 1; // +1 to ensure separation
                        if (centerBx >= centerAx) {
                            nodeA.position.x -= pushAmount;
                            nodeB.position.x += pushAmount;
                        } else {
                            nodeA.position.x += pushAmount;
                            nodeB.position.x -= pushAmount;
                        }
                    } else {
                        // Push vertically
                        const pushAmount = overlapY / 2 + 1;
                        if (centerBy >= centerAy) {
                            nodeA.position.y -= pushAmount;
                            nodeB.position.y += pushAmount;
                        } else {
                            nodeA.position.y += pushAmount;
                            nodeB.position.y -= pushAmount;
                        }
                    }
                }
            }
        }

        if (!hasOverlap) break;
    }

    // Ensure all nodes stay in positive coordinates
    let minX = Infinity,
        minY = Infinity;
    for (const node of nodes) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
    }
    if (minX < 100 || minY < 100) {
        const offsetX = minX < 100 ? 100 - minX : 0;
        const offsetY = minY < 100 ? 100 - minY : 0;
        for (const node of nodes) {
            node.position.x += offsetX;
            node.position.y += offsetY;
        }
    }
}

export {
    wouldOverlapNodes,
    getOverlap,
    hasAnyOverlap,
    resolveOverlaps,
    getNodeSize,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_PADDING,
};
