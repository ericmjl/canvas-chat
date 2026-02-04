/**
 * Working Node Manager
 *
 * Manages work-in-progress nodes that show agent/skill execution status
 * directly on the canvas. Instead of floating "thinking" overlays, work
 * is shown as live-updating nodes that transform into final nodes on completion.
 *
 * Key principle: The canvas is the truth. All work is visible in the DAG.
 *
 * @module working-node-manager
 */

import { createComponentLogger } from './debug-logger.js';
import { NodeType, EdgeType, createNode, getDefaultNodeSize } from '../graph-types.js';

const logger = createComponentLogger('WorkingNodeManager');

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * @typedef {Object} WorkingNodeOptions
 * @property {string} type - Target node type (what this will become)
 * @property {string} title - Display title while working
 * @property {string} [parentNodeId] - Parent node to connect from
 * @property {Object} [position] - {x, y} position, auto-calculated if not provided
 * @property {string} [initiator] - Who started this: 'user' | 'base_agent' | 'plugin_agent'
 * @property {string} [agentId] - Agent or skill ID
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} ProgressUpdate
 * @property {string} [message] - Progress message to display
 * @property {string} [toolCall] - Tool being called (e.g., 'graph:getPathContent')
 * @property {number} [progress] - Progress percentage (0-100)
 * @property {string} [status] - Status: 'working' | 'waiting' | 'tool_call'
 */

/**
 * @typedef {Object} FinalizeOptions
 * @property {string} content - Final content for the node
 * @property {Object} [metadata] - Final metadata to merge
 * @property {string} [title] - Final title (optional, keeps working title if not provided)
 * @property {string} [type] - Override final node type (rare)
 */

// =============================================================================
// Working Node Manager
// =============================================================================

/**
 * Manages work-in-progress nodes on the canvas
 */
export class WorkingNodeManager {
    /**
     * @param {Object} options - Manager options
     * @param {Object} options.graph - CRDTGraph instance
     * @param {Object} options.canvas - Canvas instance
     */
    constructor({ graph, canvas }) {
        /** @type {Object} */
        this.graph = graph;
        /** @type {Object} */
        this.canvas = canvas;

        /**
         * Track active working nodes
         * @type {Map<string, {nodeId: string, type: string, progressMessages: string[]}>}
         */
        this.activeNodes = new Map();

        logger.info('[WorkingNodeManager] Initialized');
    }

    /**
     * Create a working node that shows work-in-progress
     *
     * @param {WorkingNodeOptions} options - Node options
     * @returns {string} Created node ID
     */
    createWorkingNode(options) {
        const { type, title, parentNodeId, position, initiator, agentId, metadata = {} } = options;

        logger.enter('createWorkingNode', { type, title, parentNodeId });

        // Calculate position if not provided
        let nodePosition = position;
        if (!nodePosition && parentNodeId) {
            const parentNode = this.graph.getNode(parentNodeId);
            if (parentNode) {
                nodePosition = {
                    x: parentNode.position.x + 700,
                    y: parentNode.position.y,
                };
            }
        }
        if (!nodePosition) {
            nodePosition = { x: 100, y: 100 };
        }

        // Get default size for target type
        const size = getDefaultNodeSize(type);

        // Create node with working status
        const node = createNode(type, '', {
            position: nodePosition,
            width: size.width,
            height: size.height,
            title: title,
        });

        // Add working metadata
        node.metadata = {
            ...metadata,
            status: 'working',
            initiator: initiator || 'user',
            agentId: agentId,
            startedAt: Date.now(),
            progressMessages: [],
            // Data-driven display for working state
            display: {
                typeLabel: title,
                typeIcon: '⏳',
                actions: ['stop'],
                showProgress: true,
            },
        };

        // Add to graph
        this.graph.addNode(node);
        logger.debug(`Created working node: ${node.id.slice(0, 8)}`);

        // Create edge from parent if provided
        if (parentNodeId) {
            const edge = {
                id: crypto.randomUUID(),
                source: parentNodeId,
                target: node.id,
                type: EdgeType.REPLY, // Will be updated on finalize if needed
            };
            this.graph.addEdge(edge);
            logger.debug(`Created edge: ${parentNodeId.slice(0, 8)} → ${node.id.slice(0, 8)}`);
        }

        // Render the node
        this.canvas.renderNode(node);

        // Track it
        this.activeNodes.set(node.id, {
            nodeId: node.id,
            type: type,
            progressMessages: [],
        });

        logger.exit('createWorkingNode', { nodeId: node.id });
        return node.id;
    }

    /**
     * Update progress on a working node
     *
     * @param {string} nodeId - Working node ID
     * @param {ProgressUpdate} update - Progress update
     */
    updateProgress(nodeId, update) {
        const node = this.graph.getNode(nodeId);
        if (!node) {
            logger.warn(`Working node not found: ${nodeId}`);
            return;
        }

        if (!node.metadata) {
            node.metadata = {};
        }

        // Update status if provided
        if (update.status) {
            node.metadata.status = update.status;
        }

        // Add progress message
        if (update.message) {
            if (!node.metadata.progressMessages) {
                node.metadata.progressMessages = [];
            }
            // Keep last 5 messages to avoid bloat
            node.metadata.progressMessages.push({
                message: update.message,
                timestamp: Date.now(),
            });
            if (node.metadata.progressMessages.length > 5) {
                node.metadata.progressMessages.shift();
            }
        }

        // Track tool calls
        if (update.toolCall) {
            node.metadata.currentToolCall = update.toolCall;
            node.metadata.display = {
                ...node.metadata.display,
                typeIcon: '🔧',
            };
        }

        // Update progress percentage
        if (update.progress !== undefined) {
            node.metadata.progress = update.progress;
        }

        // Update the node in graph
        this.graph.updateNode(node);

        // Re-render the node
        this.canvas.renderNode(node);
    }

    /**
     * Stream content to a working node (for token streaming)
     *
     * @param {string} nodeId - Working node ID
     * @param {string} contentDelta - Content chunk to append
     */
    streamContent(nodeId, contentDelta) {
        const node = this.graph.getNode(nodeId);
        if (!node) {
            logger.warn(`Working node not found for streaming: ${nodeId}`);
            return;
        }

        // Append content
        node.content = (node.content || '') + contentDelta;

        // Update the node
        this.graph.updateNode(node);

        // Re-render (canvas should handle efficient updates)
        this.canvas.renderNode(node);
    }

    /**
     * Finalize a working node - transforms it into its final state
     *
     * @param {string} nodeId - Working node ID
     * @param {FinalizeOptions} options - Finalization options
     */
    finalizeNode(nodeId, options) {
        logger.enter('finalizeNode', { nodeId, hasContent: !!options.content });

        const node = this.graph.getNode(nodeId);
        if (!node) {
            logger.warn(`Working node not found for finalize: ${nodeId}`);
            return;
        }

        // Update content
        node.content = options.content;

        // Update title if provided
        if (options.title) {
            node.title = options.title;
        }

        // Update type if needed (rare)
        if (options.type) {
            node.type = options.type;
        }

        // Merge metadata
        const finalMetadata = {
            ...node.metadata,
            ...options.metadata,
            status: 'completed',
            completedAt: Date.now(),
        };

        // Update display for completed state
        if (finalMetadata.display) {
            finalMetadata.display = {
                ...finalMetadata.display,
                typeIcon: options.metadata?.display?.typeIcon || '✓',
                showProgress: false,
                actions: options.metadata?.display?.actions || ['reply', 'copy'],
            };
        }

        // Remove working-specific fields
        delete finalMetadata.currentToolCall;
        delete finalMetadata.progressMessages;
        delete finalMetadata.progress;

        node.metadata = finalMetadata;

        // Update in graph
        this.graph.updateNode(node);

        // Re-render
        this.canvas.renderNode(node);

        // Remove from active tracking
        this.activeNodes.delete(nodeId);

        logger.exit('finalizeNode', { status: 'completed' });
    }

    /**
     * Mark a working node as failed
     *
     * @param {string} nodeId - Working node ID
     * @param {string} errorMessage - Error message to display
     */
    setError(nodeId, errorMessage) {
        logger.enter('setError', { nodeId, error: errorMessage });

        const node = this.graph.getNode(nodeId);
        if (!node) {
            logger.warn(`Working node not found for error: ${nodeId}`);
            return;
        }

        // Update metadata
        if (!node.metadata) {
            node.metadata = {};
        }

        node.metadata.status = 'failed';
        node.metadata.error = errorMessage;
        node.metadata.completedAt = Date.now();

        // Update display for error state
        if (node.metadata.display) {
            node.metadata.display = {
                ...node.metadata.display,
                typeIcon: '❌',
                showProgress: false,
            };
        }

        // Set error content
        node.content = `**Error:** ${errorMessage}`;

        // Update in graph
        this.graph.updateNode(node);

        // Re-render
        this.canvas.renderNode(node);

        // Remove from active tracking
        this.activeNodes.delete(nodeId);

        logger.exit('setError', { status: 'failed' });
    }

    /**
     * Cancel a working node (user-initiated stop)
     *
     * @param {string} nodeId - Working node ID
     */
    cancelNode(nodeId) {
        logger.enter('cancelNode', { nodeId });

        const node = this.graph.getNode(nodeId);
        if (!node) {
            logger.warn(`Working node not found for cancel: ${nodeId}`);
            return;
        }

        // Update metadata
        if (!node.metadata) {
            node.metadata = {};
        }

        node.metadata.status = 'cancelled';
        node.metadata.completedAt = Date.now();

        // Update display
        if (node.metadata.display) {
            node.metadata.display = {
                ...node.metadata.display,
                typeIcon: '⏹',
                showProgress: false,
            };
        }

        // Update in graph
        this.graph.updateNode(node);

        // Re-render
        this.canvas.renderNode(node);

        // Remove from active tracking
        this.activeNodes.delete(nodeId);

        logger.exit('cancelNode', { status: 'cancelled' });
    }

    /**
     * Check if a node is currently working
     *
     * @param {string} nodeId - Node ID to check
     * @returns {boolean} True if node is in working state
     */
    isWorking(nodeId) {
        return this.activeNodes.has(nodeId);
    }

    /**
     * Get all active working nodes
     *
     * @returns {string[]} Array of working node IDs
     */
    getActiveNodes() {
        return Array.from(this.activeNodes.keys());
    }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a WorkingNodeManager instance
 *
 * @param {import('../crdt-graph.js').DAGGraph} graph - Graph instance
 * @param {import('../canvas.js').Canvas} canvas - Canvas instance
 * @returns {WorkingNodeManager}
 */
export function createWorkingNodeManager(graph, canvas) {
    return new WorkingNodeManager({ graph, canvas });
}

// =============================================================================
// Exports
// =============================================================================

// WorkingNodeManager and createWorkingNodeManager are exported inline above
