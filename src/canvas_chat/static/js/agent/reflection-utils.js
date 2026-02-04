/**
 * Reflection Utilities
 *
 * Utilities for finding leaf-to-branch paths, gathering context for reflection,
 * and managing reflection state in the DAG.
 */

import { EdgeType } from '../graph-types.js';
import { reflectionLogger as logger } from './debug-logger.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * A path from a leaf node to a branch node
 * @typedef {Object} LeafToBranchPath
 * @property {string} leafNodeId - The starting leaf node
 * @property {string} branchNodeId - The branch point node (or root if no branch)
 * @property {string[]} nodeIds - Path node IDs from leaf to branch (inclusive)
 * @property {any[]} nodes - Full node objects along the path
 * @property {string[]} reflectionNodeIds - Reflection node IDs found along the path
 * @property {any[]} reflectionNodes - Full reflection node objects from previous reflects
 */

/**
 * Context for reflection
 * @typedef {Object} ReflectionContext
 * @property {string} leafNodeId - Starting leaf node
 * @property {string} branchNodeId - Branch point node
 * @property {any[]} pathNodes - Nodes from leaf to branch
 * @property {any[]} previousReflections - Previous reflection nodes on this path
 * @property {string} previousContext - Synthesized context from previous reflections
 * @property {string} pathContent - Formatted content from the path nodes
 */

// =============================================================================
// Path Finding
// =============================================================================

/**
 * Check if a node is a branch point (has multiple child connections)
 * @param {any} node - Node object
 * @param {any} graph - Graph instance
 * @returns {boolean} True if node is a branch point
 */
function isBranchPoint(node, graph) {
    const children = graph.getChildren(node.id);
    return children.length > 1;
}

/**
 * Check if a node is a leaf (has no children)
 * @param {any} node - Node object
 * @param {any} graph - Graph instance
 * @returns {boolean} True if node is a leaf
 */
function isLeafNode(node, graph) {
    const children = graph.getChildren(node.id);
    return children.length === 0;
}

/**
 * Find all parent nodes of a given node by traversing reverse edges
 * @param {string} nodeId - Node ID to find parents for
 * @param {any} graph - Graph instance
 * @returns {string[]} Array of parent node IDs
 */
function getParentNodes(nodeId, graph) {
    // graph.getParents returns node objects, extract IDs
    const parentNodes = graph.getParents(nodeId);
    return parentNodes.map((/** @type {any} */ node) => node.id);
}

/**
 * Find the path from a leaf node back to a branch point (or root)
 * Stops at the first branch point found, or at the root if no branches exist.
 *
 * @param {string} leafNodeId - Starting leaf node ID
 * @param {any} graph - Graph instance
 * @returns {LeafToBranchPath} The path information
 */
function findLeafToBranchPath(leafNodeId, graph) {
    logger.enter('findLeafToBranchPath', { leafNodeId });
    logger.timeStart('pathFind');

    const leafNode = graph.getNode(leafNodeId);
    if (!leafNode) {
        logger.error(`Leaf node ${leafNodeId} not found in graph`);
        logger.timeEnd('pathFind');
        logger.exit('findLeafToBranchPath', { error: 'Leaf node not found' });
        return {
            leafNodeId,
            branchNodeId: leafNodeId,
            nodeIds: [],
            nodes: [],
            reflectionNodeIds: [],
            reflectionNodes: [],
        };
    }

    const nodeIds = [leafNodeId];
    const nodes = [leafNode];
    let currentNodeId = leafNodeId;

    // Walk backwards until we hit a branch point or root
    while (true) {
        const parents = getParentNodes(currentNodeId, graph);
        logger.debug(`Node ${currentNodeId.slice(0, 8)} has ${parents.length} parent(s)`);

        if (parents.length === 0) {
            // Reached root - no more parents
            logger.debug('Reached root node (no parents)');
            break;
        }

        if (parents.length > 1) {
            // Found a merge point - continue through all paths (they should reconverge)
            logger.debug(`Found merge point at ${currentNodeId.slice(0, 8)} with ${parents.length} parents`);
            for (const parentId of parents) {
                if (!nodeIds.includes(parentId)) {
                    nodeIds.unshift(parentId);
                    nodes.unshift(graph.getNode(parentId));
                }
            }
            break;
        }

        // Single parent - continue traversing
        const parentId = parents[0];
        const parentNode = graph.getNode(parentId);

        // Defensive: if parent node doesn't exist, stop traversal
        if (!parentNode) {
            logger.debug(`Parent node ${parentId.slice(0, 8)} not found in graph, stopping traversal`);
            break;
        }

        if (isBranchPoint(parentNode, graph)) {
            // Found branch point
            logger.debug(`Found branch point: ${parentId.slice(0, 8)}`);
            nodeIds.unshift(parentId);
            nodes.unshift(parentNode);
            break;
        }

        nodeIds.unshift(parentId);
        nodes.unshift(parentNode);
        currentNodeId = parentId;
    }

    logger.timeEnd('pathFind');
    logger.info(
        `Path from leaf ${leafNodeId.slice(0, 8)} to branch: ${nodeIds.length} nodes, ending at ${currentNodeId.slice(0, 8)}`
    );

    const branchNodeId = nodeIds[0];
    logger.exit('findLeafToBranchPath', {
        leafNodeId,
        branchNodeId,
        pathLength: nodeIds.length,
    });

    return {
        leafNodeId,
        branchNodeId,
        nodeIds,
        nodes,
        reflectionNodeIds: [],
        reflectionNodes: [],
    };
}

/**
 * Find previous reflection nodes on the path from a branch point
 * Looks for REFLECTION nodes that were attached to the branch point and its ancestors
 *
 * @param {string} branchNodeId - Branch point node ID
 * @param {string} leafNodeId - Leaf node ID (to avoid including child reflections)
 * @param {any} graph - Graph instance
 * @returns {Array<{nodeId: string, node: any}>} Reflection nodes found
 */
function findPreviousReflections(branchNodeId, leafNodeId, graph) {
    logger.enter('findPreviousReflections', { branchNodeId, leafNodeId });

    const reflections = [];
    const visited = new Set();

    // Find all reflection nodes pointing from the branch point
    // Note: graph.getChildren returns node objects, not IDs
    const children = graph.getChildren(branchNodeId);
    for (const childNode of children) {
        const childId = childNode.id;
        // Get the edge to check its type
        const edges = graph
            .getAllEdges()
            .filter((/** @type {any} */ e) => e.source === branchNodeId && e.target === childId);
        for (const edge of edges) {
            if (edge.type === EdgeType.RUN_REFLECTION && !visited.has(childId)) {
                reflections.push({
                    nodeId: childId,
                    node: childNode,
                });
                visited.add(childId);
                logger.debug(`Found previous reflection: ${childId.slice(0, 8)}`);
            }
        }
    }

    // Also check ancestors of the branch for older reflections
    let currentNodeId = branchNodeId;
    const pathVisited = new Set([branchNodeId]);
    while (true) {
        const parents = getParentNodes(currentNodeId, graph);
        if (parents.length === 0) break;

        // For now, just follow the first parent (main chain)
        const parentId = parents[0];
        if (pathVisited.has(parentId)) break;
        pathVisited.add(parentId);

        // Note: graph.getChildren returns node objects, not IDs
        const ancestorChildren = graph.getChildren(parentId);
        for (const childNode of ancestorChildren) {
            const childId = childNode.id;
            const edges = graph
                .getAllEdges()
                .filter((/** @type {any} */ e) => e.source === parentId && e.target === childId);
            for (const edge of edges) {
                if (edge.type === EdgeType.RUN_REFLECTION && !visited.has(childId)) {
                    reflections.push({
                        nodeId: childId,
                        node: childNode,
                    });
                    visited.add(childId);
                    logger.debug(
                        `Found ancestor reflection: ${childId.slice(0, 8)} from ancestor ${parentId.slice(0, 8)}`
                    );
                }
            }
        }

        currentNodeId = parentId;
    }

    logger.info(`Found ${reflections.length} previous reflections for branch ${branchNodeId.slice(0, 8)}`);
    logger.exit('findPreviousReflections', { count: reflections.length });

    return reflections;
}

// =============================================================================
// Context Gathering
// =============================================================================

/**
 * Gather context for reflection from a path
 * @param {LeafToBranchPath} path - The path information
 * @param {any} graph - Graph instance
 * @returns {ReflectionContext} Reflection context
 */
function gatherReflectionContext(path, graph) {
    logger.enter('gatherReflectionContext', {
        leafNodeId: path.leafNodeId,
        branchNodeId: path.branchNodeId,
        pathLength: path.nodes.length,
    });

    // Find previous reflections on this path
    const previousReflections = findPreviousReflections(path.branchNodeId, path.leafNodeId, graph);

    // Synthesize context from previous reflections
    let previousContext = '';
    if (previousReflections.length > 0) {
        const reflectionTexts = previousReflections
            .map((r) => r.node.content || r.node.title || 'No content')
            .join('\n\n---\n\n');
        previousContext = `## Previous Reflections on This Branch:\n\n${reflectionTexts}`;
        logger.debug(
            `Synthesized context from ${previousReflections.length} previous reflections (${previousContext.length} chars)`
        );
    }

    // Build node content summary
    const pathContent = path.nodes
        .map((node, idx) => {
            const prefix = idx === 0 ? '(branch)' : idx === path.nodes.length - 1 ? '(leaf)' : '';
            return `[${node.type}] ${node.title || 'Untitled'}\n${prefix}\n${node.content?.slice(0, 200) || '(empty)'}`;
        })
        .join('\n---\n');

    logger.exit('gatherReflectionContext', {
        hasPreflections: previousReflections.length > 0,
        contextLength: previousContext.length,
        pathContentLength: pathContent.length,
    });

    return {
        leafNodeId: path.leafNodeId,
        branchNodeId: path.branchNodeId,
        pathNodes: path.nodes,
        previousReflections: previousReflections.map((r) => r.node),
        previousContext,
        pathContent,
    };
}

// =============================================================================
// Reflection State Management
// =============================================================================

/**
 * Attach a reflection node to the DAG
 * Creates edges from both the branch point and leaf node to the reflection
 *
 * @param {string} reflectionNodeId - Reflection node ID
 * @param {string} branchNodeId - Branch point node ID
 * @param {string} leafNodeId - Leaf node ID
 * @param {any} graph - Graph instance
 * @returns {void}
 */
function attachReflectionToPath(reflectionNodeId, branchNodeId, leafNodeId, graph) {
    logger.enter('attachReflectionToPath', { reflectionNodeId, branchNodeId, leafNodeId });

    // Create single edge from leaf (selected node) to reflection
    const edgeId = crypto.randomUUID();
    graph.addEdge({
        id: edgeId,
        source: leafNodeId,
        target: reflectionNodeId,
        type: EdgeType.RUN_REFLECTION,
    });
    logger.debug(`Created RUN_REFLECTION edge: ${leafNodeId.slice(0, 8)} → ${reflectionNodeId.slice(0, 8)}`);

    logger.exit('attachReflectionToPath');
}

/**
 * Store reflection node IDs on metadata for quick access
 * @param {any} node - Node object
 * @param {string} reflectionNodeId - Reflection node ID to add
 * @returns {any} Updated node
 */
function addReflectionToNodeMetadata(node, reflectionNodeId) {
    if (!node.metadata) {
        node.metadata = {};
    }
    if (!node.metadata.reflectionNodeIds) {
        node.metadata.reflectionNodeIds = [];
    }
    if (!node.metadata.reflectionNodeIds.includes(reflectionNodeId)) {
        node.metadata.reflectionNodeIds.push(reflectionNodeId);
        logger.debug(`Added reflection ${reflectionNodeId.slice(0, 8)} to node ${node.id.slice(0, 8)} metadata`);
    }
    return node;
}

// =============================================================================
// Exports
// =============================================================================

export {
    isBranchPoint,
    isLeafNode,
    getParentNodes,
    findLeafToBranchPath,
    findPreviousReflections,
    gatherReflectionContext,
    attachReflectionToPath,
    addReflectionToNodeMetadata,
};
