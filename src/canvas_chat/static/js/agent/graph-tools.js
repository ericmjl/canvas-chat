/**
 * Graph Tools for Agents
 *
 * Provides built-in tools for navigating and querying the conversation graph.
 * These tools enable agents to explore the DAG structure, find paths,
 * retrieve content, and discover related nodes.
 *
 * Tool IDs use the `graph:` prefix to indicate they are built-in graph tools.
 *
 * @module graph-tools
 */

import { createComponentLogger } from './debug-logger.js';
import { EdgeType } from '../graph-types.js';
import {
    isBranchPoint,
    isLeafNode,
    getParentNodes,
    findLeafToBranchPath,
    findPreviousReflections,
} from './reflection-utils.js';

const logger = createComponentLogger('GraphTools');

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * @typedef {Object} GraphToolDefinition
 * @property {string} id - Tool ID (e.g., 'graph:findPathToRoot')
 * @property {string} name - Human-readable name
 * @property {string} description - Tool description
 * @property {import('./tool-registry.js').ToolParameter[]} parameters - Tool parameters
 * @property {Function} handler - Tool handler function
 */

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Find path from a node to the root of the conversation
 * @param {Object} args - Tool arguments
 * @param {string} args.nodeId - Starting node ID
 * @param {any} graph - Graph instance
 * @returns {Object} Path information
 */
function findPathToRoot(args, graph) {
    logger.debug('findPathToRoot', args);

    const path = findLeafToBranchPath(args.nodeId, graph);

    return {
        success: true,
        result: {
            startNodeId: path.leafNodeId,
            endNodeId: path.branchNodeId,
            nodeIds: path.nodeIds,
            pathLength: path.nodeIds.length,
            isBranched: path.branchNodeId !== path.nodeIds[0],
        },
    };
}

/**
 * Get content from a node
 * @param {Object} args - Tool arguments
 * @param {string} args.nodeId - Node ID to get content from
 * @param {number} [args.maxLength=500] - Maximum content length to return
 * @param {any} graph - Graph instance
 * @returns {Object} Node content
 */
function getNodeContent(args, graph) {
    logger.debug('getNodeContent', args);

    const node = graph.getNode(args.nodeId);
    if (!node) {
        return {
            success: false,
            error: `Node not found: ${args.nodeId}`,
        };
    }

    const maxLength = args.maxLength || 500;
    let content = node.content || '';
    if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '...';
    }

    return {
        success: true,
        result: {
            nodeId: node.id,
            type: node.type,
            title: node.title || 'Untitled',
            content: content,
            contentLength: (node.content || '').length,
            truncated: (node.content || '').length > maxLength,
        },
    };
}

/**
 * Get content from multiple nodes along a path
 * @param {Object} args - Tool arguments
 * @param {string[]} args.nodeIds - Node IDs to get content from
 * @param {number} [args.maxLengthPerNode=300] - Maximum content length per node
 * @param {any} graph - Graph instance
 * @returns {Object} Path content
 */
function getPathContent(args, graph) {
    logger.debug('getPathContent', args);

    const nodes = [];
    for (const nodeId of args.nodeIds) {
        const node = graph.getNode(nodeId);
        if (node) {
            const maxLength = args.maxLengthPerNode || 300;
            let content = node.content || '';
            if (content.length > maxLength) {
                content = content.slice(0, maxLength) + '...';
            }
            nodes.push({
                nodeId: node.id,
                type: node.type,
                title: node.title || 'Untitled',
                content: content,
            });
        }
    }

    return {
        success: true,
        result: {
            nodes: nodes,
            totalNodes: nodes.length,
        },
    };
}

/**
 * Get previous reflections for a branch point
 * @param {Object} args - Tool arguments
 * @param {string} args.branchNodeId - Branch point node ID
 * @param {string} [args.leafNodeId] - Optional leaf node to exclude its children
 * @param {any} graph - Graph instance
 * @returns {Object} Previous reflections
 */
function getPreviousReflections(args, graph) {
    logger.debug('getPreviousReflections', args);

    const reflections = findPreviousReflections(args.branchNodeId, args.leafNodeId || args.branchNodeId, graph);

    return {
        success: true,
        result: {
            reflections: reflections.map((r) => ({
                nodeId: r.nodeId,
                content: r.node.content || '',
                title: r.node.title || 'Untitled',
            })),
            count: reflections.length,
        },
    };
}

/**
 * Check if a node is a branch point
 * @param {Object} args - Tool arguments
 * @param {string} args.nodeId - Node ID to check
 * @param {any} graph - Graph instance
 * @returns {Object} Branch check result
 */
function checkBranchPoint(args, graph) {
    logger.debug('checkBranchPoint', args);

    const node = graph.getNode(args.nodeId);
    if (!node) {
        return {
            success: false,
            error: `Node not found: ${args.nodeId}`,
        };
    }

    const isBranch = isBranchPoint(node, graph);
    const isLeaf = isLeafNode(node, graph);
    const childCount = graph.getChildren(args.nodeId).length;
    const parentCount = getParentNodes(args.nodeId, graph).length;

    return {
        success: true,
        result: {
            nodeId: args.nodeId,
            isBranchPoint: isBranch,
            isLeafNode: isLeaf,
            childCount: childCount,
            parentCount: parentCount,
        },
    };
}

/**
 * Get children or parents of a node
 * @param {Object} args - Tool arguments
 * @param {string} args.nodeId - Node ID
 * @param {string} [args.direction='children'] - 'children' or 'parents'
 * @param {any} graph - Graph instance
 * @returns {Object} Related nodes
 */
function getRelatedNodes(args, graph) {
    logger.debug('getRelatedNodes', args);

    const direction = args.direction || 'children';

    let nodes = [];
    if (direction === 'children') {
        // graph.getChildren returns node objects, not IDs
        const childNodes = graph.getChildren(args.nodeId);
        nodes = childNodes.map((/** @type {any} */ node) => ({
            nodeId: node.id,
            type: node.type,
            title: node.title || 'Untitled',
        }));
    } else if (direction === 'parents') {
        // getParentNodes returns IDs, so we need to get the nodes
        const parentIds = getParentNodes(args.nodeId, graph);
        nodes = parentIds
            .map((/** @type {string} */ id) => {
                const node = graph.getNode(id);
                return node
                    ? {
                          nodeId: id,
                          type: node.type,
                          title: node.title || 'Untitled',
                      }
                    : null;
            })
            .filter(Boolean);
    } else {
        return {
            success: false,
            error: `Invalid direction: ${direction}. Use 'children' or 'parents'.`,
        };
    }

    return {
        success: true,
        result: {
            nodeId: args.nodeId,
            direction: direction,
            nodes: nodes,
            count: nodes.length,
        },
    };
}

/**
 * Find nodes by type
 * @param {Object} args - Tool arguments
 * @param {string} args.nodeType - Node type to find
 * @param {number} [args.limit=10] - Maximum nodes to return
 * @param {any} graph - Graph instance
 * @returns {Object} Matching nodes
 */
function findNodesByType(args, graph) {
    logger.debug('findNodesByType', args);

    const limit = args.limit || 10;
    const allNodes = graph.getAllNodes ? graph.getAllNodes() : [];

    const matchingNodes = [];
    for (const node of allNodes) {
        if (node.type === args.nodeType) {
            matchingNodes.push({
                nodeId: node.id,
                type: node.type,
                title: node.title || 'Untitled',
            });
            if (matchingNodes.length >= limit) break;
        }
    }

    return {
        success: true,
        result: {
            nodeType: args.nodeType,
            nodes: matchingNodes,
            count: matchingNodes.length,
            hasMore: allNodes.filter((/** @type {any} */ n) => n.type === args.nodeType).length > limit,
        },
    };
}

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * Get all graph tool definitions
 * @param {any} graph - Graph instance for tools to operate on
 * @returns {GraphToolDefinition[]} Tool definitions
 */
export function getGraphToolDefinitions(graph) {
    return [
        {
            id: 'graph:findPathToRoot',
            name: 'Find Path to Root',
            description: 'Find the path from a node back to the nearest branch point or root',
            parameters: [
                {
                    name: 'nodeId',
                    type: 'string',
                    description: 'Starting node ID',
                    required: true,
                },
            ],
            handler: (args) => findPathToRoot(args, graph),
        },
        {
            id: 'graph:getNodeContent',
            name: 'Get Node Content',
            description: 'Get the content and metadata of a specific node',
            parameters: [
                {
                    name: 'nodeId',
                    type: 'string',
                    description: 'Node ID to get content from',
                    required: true,
                },
                {
                    name: 'maxLength',
                    type: 'number',
                    description: 'Maximum content length to return',
                    default: 500,
                },
            ],
            handler: (args) => getNodeContent(args, graph),
        },
        {
            id: 'graph:getPathContent',
            name: 'Get Path Content',
            description: 'Get content from multiple nodes along a path',
            parameters: [
                {
                    name: 'nodeIds',
                    type: 'array',
                    description: 'Node IDs to get content from',
                    required: true,
                },
                {
                    name: 'maxLengthPerNode',
                    type: 'number',
                    description: 'Maximum content length per node',
                    default: 300,
                },
            ],
            handler: (args) => getPathContent(args, graph),
        },
        {
            id: 'graph:getPreviousReflections',
            name: 'Get Previous Reflections',
            description: 'Find previous reflection nodes for a branch point',
            parameters: [
                {
                    name: 'branchNodeId',
                    type: 'string',
                    description: 'Branch point node ID',
                    required: true,
                },
                {
                    name: 'leafNodeId',
                    type: 'string',
                    description: 'Optional leaf node to exclude',
                },
            ],
            handler: (args) => getPreviousReflections(args, graph),
        },
        {
            id: 'graph:checkBranchPoint',
            name: 'Check Branch Point',
            description: 'Check if a node is a branch point (has multiple children)',
            parameters: [
                {
                    name: 'nodeId',
                    type: 'string',
                    description: 'Node ID to check',
                    required: true,
                },
            ],
            handler: (args) => checkBranchPoint(args, graph),
        },
        {
            id: 'graph:getRelatedNodes',
            name: 'Get Related Nodes',
            description: 'Get parent or child nodes of a given node',
            parameters: [
                {
                    name: 'nodeId',
                    type: 'string',
                    description: 'Node ID',
                    required: true,
                },
                {
                    name: 'direction',
                    type: 'string',
                    description: "Direction: 'children' or 'parents'",
                    default: 'children',
                },
            ],
            handler: (args) => getRelatedNodes(args, graph),
        },
        {
            id: 'graph:findNodesByType',
            name: 'Find Nodes by Type',
            description: 'Find nodes of a specific type in the graph',
            parameters: [
                {
                    name: 'nodeType',
                    type: 'string',
                    description: 'Node type to find',
                    required: true,
                },
                {
                    name: 'limit',
                    type: 'number',
                    description: 'Maximum nodes to return',
                    default: 10,
                },
            ],
            handler: (args) => findNodesByType(args, graph),
        },
    ];
}

/**
 * Register graph tools with the tool registry
 * @param {import('./tool-registry.js').ToolRegistry} registry - Tool registry
 * @param {any} graph - Graph instance
 */
export function registerGraphTools(registry, graph) {
    logger.info('Registering graph tools...');

    const tools = getGraphToolDefinitions(graph);
    for (const tool of tools) {
        registry.registerTool(
            {
                id: tool.id,
                name: tool.name,
                description: tool.description,
                category: 'graph',
                parameters: tool.parameters,
            },
            tool.handler
        );
    }

    logger.info(`Registered ${tools.length} graph tools`);
}
