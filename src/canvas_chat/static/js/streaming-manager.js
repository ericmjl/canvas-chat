/**
 * StreamingManager - Unified streaming state management for all features
 *
 * This class provides a canonical way to manage streaming state across all features:
 * - Regular AI responses
 * - Committee (multiple parallel nodes)
 * - Matrix (multiple cells in one node)
 * - Research
 * - Code generation
 *
 * Key concepts:
 * - Each streaming operation is registered with a nodeId and featureId
 * - Features can register callbacks for stop/continue operations
 * - Supports both single-node and multi-node streaming patterns
 * - Manages UI state (stop/continue buttons) through canvas callbacks
 */

/**
 * @typedef {Object} StreamingState
 * @property {AbortController} abortController - Controller to abort the request
 * @property {Object} context - Feature-specific context for resume
 * @property {string} featureId - ID of the feature that registered this stream
 * @property {boolean} stopped - Whether generation was stopped by user
 * @property {Function} [onStop] - Optional callback when stop is requested
 * @property {Function} [onContinue] - Optional callback when continue is requested
 */

/**
 *
 */
class StreamingManager {
    /**
     *
     */
    constructor() {
        // Main registry: nodeId -> StreamingState
        this.streams = new Map();

        // Group registry for multi-node operations: groupId -> Set<nodeId>
        this.groups = new Map();

        // Canvas reference for UI updates (set via setCanvas)
        this.canvas = null;

        // Graph reference for node access (set via setGraph)
        this._getGraph = null;
    }

    /**
     * Set the canvas reference for UI updates and wire up event listeners
     * @param {Canvas} canvas
     */
    setCanvas(canvas) {
        this.canvas = canvas;

        // Wire StreamingManager to handle stop/continue events directly
        canvas.on('nodeStopGeneration', (nodeId) => {
            this.handleStopEvent(nodeId);
        });

        canvas.on('nodeContinueGeneration', async (nodeId) => {
            await this.handleContinueEvent(nodeId);
        });
    }

    /**
     * Set a getter function for the graph (supports late initialization)
     * @param {Function} getGraph - Function that returns the current graph
     */
    setGraphGetter(getGraph) {
        this._getGraph = getGraph;
    }

    /**
     * Get the current graph instance
     * @returns {CRDTGraph|null}
     */
    get graph() {
        return this._getGraph ? this._getGraph() : null;
    }

    /**
     * Register a streaming operation for a node.
     *
     * @param {string} nodeId - The node being streamed to
     * @param {Object} options - Streaming options
     * @param {AbortController} options.abortController - Controller to abort the request
     * @param {string} options.featureId - ID of the feature (e.g., 'ai', 'committee', 'matrix')
     * @param {Object} [options.context] - Feature-specific context for resume
     * @param {string} [options.groupId] - Optional group ID for multi-node operations
     * @param {Function} [options.onStop] - Callback when stop is requested: (nodeId, state) => void
     * @param {Function} [options.onContinue] - Callback when continue is requested: (nodeId, state) => Promise<void>
     * @param {boolean} [options.showStopButton=true] - Whether to show stop button
     */
    register(nodeId, options) {
        const {
            abortController,
            featureId,
            context = {},
            groupId = null,
            onStop = null,
            onContinue = null,
            showStopButton = true,
        } = options;

        const state = {
            abortController,
            featureId,
            context,
            groupId,
            onStop,
            onContinue,
            stopped: false,
        };

        this.streams.set(nodeId, state);

        // Track group membership
        if (groupId) {
            if (!this.groups.has(groupId)) {
                this.groups.set(groupId, new Set());
            }
            this.groups.get(groupId).add(nodeId);
        }

        // Show stop button
        if (showStopButton && this.canvas) {
            this.canvas.showStopButton(nodeId);
        }
    }

    /**
     * Unregister a streaming operation (called when streaming completes normally).
     *
     * @param {string} nodeId - The node to unregister
     * @param {Object} [options] - Options
     * @param {boolean} [options.hideButtons=true] - Whether to hide stop/continue buttons
     */
    unregister(nodeId, options = {}) {
        const { hideButtons = true } = options;

        const state = this.streams.get(nodeId);
        if (!state) return;

        // Remove from group
        if (state.groupId) {
            const group = this.groups.get(state.groupId);
            if (group) {
                group.delete(nodeId);
                if (group.size === 0) {
                    this.groups.delete(state.groupId);
                }
            }
        }

        this.streams.delete(nodeId);

        // Hide buttons
        if (hideButtons && this.canvas) {
            this.canvas.hideStopButton(nodeId);
            this.canvas.hideContinueButton(nodeId);
        }
    }

    /**
     * Check if a node is currently streaming.
     *
     * @param {string} nodeId - The node to check
     * @returns {boolean}
     */
    isStreaming(nodeId) {
        const state = this.streams.get(nodeId);
        return state && !state.stopped;
    }

    /**
     * Check if a node was stopped and can be continued.
     *
     * @param {string} nodeId - The node to check
     * @returns {boolean}
     */
    isStopped(nodeId) {
        const state = this.streams.get(nodeId);
        return state && state.stopped;
    }

    /**
     * Get streaming state for a node.
     *
     * @param {string} nodeId - The node to get state for
     * @returns {StreamingState|null}
     */
    getState(nodeId) {
        return this.streams.get(nodeId) || null;
    }

    /**
     * Get all node IDs in a group.
     *
     * @param {string} groupId - The group ID
     * @returns {Set<string>} Set of node IDs in the group
     */
    getGroupNodes(groupId) {
        return this.groups.get(groupId) || new Set();
    }

    /**
     * Stop streaming for a node.
     * Handles both individual nodes and grouped nodes (stops entire group).
     *
     * @param {string} nodeId - The node to stop
     * @returns {boolean} True if stop was successful
     */
    stop(nodeId) {
        const state = this.streams.get(nodeId);
        if (!state) return false;

        // If already stopped, return early (idempotent)
        if (state.stopped) return true;

        // If part of a group, stop all nodes in the group
        if (state.groupId) {
            return this.stopGroup(state.groupId);
        }

        // Abort the request
        if (state.abortController) {
            state.abortController.abort();
        }

        // Call feature's onStop callback if provided
        if (state.onStop) {
            state.onStop(nodeId, state);
        } else {
            // Default behavior: update node content with stopped indicator
            this._defaultOnStop(nodeId, state);
        }

        // Update state
        state.stopped = true;
        state.abortController = null;

        // Update UI
        if (this.canvas) {
            this.canvas.hideStopButton(nodeId);
            // Only show continue button if onContinue callback is provided
            if (state.onContinue) {
                this.canvas.showContinueButton(nodeId);
            }
        }

        return true;
    }

    /**
     * Stop all nodes in a group.
     *
     * @param {string} groupId - The group to stop
     * @returns {boolean} True if stop was successful
     */
    stopGroup(groupId) {
        const nodeIds = this.groups.get(groupId);
        if (!nodeIds || nodeIds.size === 0) return false;

        // Get abort controller from first node (shared across group)
        const firstNodeId = nodeIds.values().next().value;
        const state = this.streams.get(firstNodeId);

        if (state && state.abortController) {
            state.abortController.abort();
        }

        // Update all nodes in group
        for (const nodeId of nodeIds) {
            const nodeState = this.streams.get(nodeId);
            if (nodeState) {
                // Call feature's onStop callback if provided
                if (nodeState.onStop) {
                    nodeState.onStop(nodeId, nodeState);
                } else {
                    this._defaultOnStop(nodeId, nodeState);
                }

                nodeState.stopped = true;
                nodeState.abortController = null;

                // Update UI
                if (this.canvas) {
                    this.canvas.hideStopButton(nodeId);
                    if (nodeState.onContinue) {
                        this.canvas.showContinueButton(nodeId);
                    }
                }
            }
        }

        return true;
    }

    /**
     * Continue streaming for a stopped node.
     *
     * @param {string} nodeId - The node to continue
     * @returns {Promise<boolean>} True if continue was successful
     */
    async continue(nodeId) {
        const state = this.streams.get(nodeId);
        if (!state || !state.stopped) return false;

        // Must have onContinue callback
        if (!state.onContinue) {
            console.warn(`[StreamingManager] No onContinue callback for node ${nodeId}`);
            return false;
        }

        // Create new abort controller
        const abortController = new AbortController();
        state.abortController = abortController;
        state.stopped = false;

        // Update UI
        if (this.canvas) {
            this.canvas.hideContinueButton(nodeId);
            this.canvas.showStopButton(nodeId);
        }

        // Call feature's continue handler
        try {
            await state.onContinue(nodeId, state, abortController);
            return true;
        } catch (err) {
            console.error(`[StreamingManager] Error continuing node ${nodeId}:`, err);
            return false;
        }
    }

    /**
     * Default stop behavior: append stopped indicator to node content.
     *
     * @param {string} nodeId - The node to update
     * @param {StreamingState} state - The streaming state
     * @private
     */
    _defaultOnStop(nodeId, state) {
        if (!this.graph) return;

        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Determine appropriate stopped message based on feature
        let stoppedMessage = '*[Generation stopped]*';
        if (state.featureId === 'research') {
            stoppedMessage = '*[Research stopped]*';
        } else if (state.featureId === 'committee') {
            stoppedMessage = '*[Committee stopped]*';
        } else if (state.featureId === 'matrix') {
            stoppedMessage = '*[Fill stopped]*';
        }

        const stoppedContent = node.content + '\n\n' + stoppedMessage;

        if (this.canvas) {
            this.canvas.updateNodeContent(nodeId, stoppedContent, false);
        }
        this.graph.updateNode(nodeId, { content: stoppedContent });
    }

    /**
     * Clear all streaming state (e.g., on session change).
     */
    clear() {
        // Abort all active streams
        for (const [nodeId, state] of this.streams) {
            if (state.abortController) {
                state.abortController.abort();
            }
            if (this.canvas) {
                this.canvas.hideStopButton(nodeId);
                this.canvas.hideContinueButton(nodeId);
            }
        }

        this.streams.clear();
        this.groups.clear();
    }

    /**
     * Get count of active streams (for debugging).
     *
     * @returns {number}
     */
    get activeCount() {
        let count = 0;
        for (const state of this.streams.values()) {
            if (!state.stopped) count++;
        }
        return count;
    }

    /**
     * Get all active stream node IDs (for debugging).
     *
     * @returns {string[]}
     */
    getActiveNodeIds() {
        const ids = [];
        for (const [nodeId, state] of this.streams) {
            if (!state.stopped) ids.push(nodeId);
        }
        return ids;
    }

    /**
     * Handle stop button click event from canvas.
     * This is called automatically when user clicks stop button on any node.
     * @param {string} nodeId - The node to stop
     */
    handleStopEvent(nodeId) {
        // Check if this node is streaming
        if (this.isStreaming(nodeId) || this.getState(nodeId)) {
            this.stop(nodeId);
            return;
        }

        // Check if this is a matrix node with cells streaming (group)
        const matrixGroupId = `matrix-${nodeId}`;
        const matrixCells = this.getGroupNodes(matrixGroupId);
        if (matrixCells.size > 0) {
            this.stopGroup(matrixGroupId);
            if (this.canvas) {
                this.canvas.hideStopButton(nodeId);
            }
            return;
        }

        console.warn(`[StreamingManager] No streaming state found for node ${nodeId}`);
    }

    /**
     * Handle continue button click event from canvas.
     * This is called automatically when user clicks continue button on any node.
     * @param {string} nodeId - The node to continue
     */
    async handleContinueEvent(nodeId) {
        if (this.isStopped(nodeId)) {
            await this.continue(nodeId);
        } else {
            console.warn(`[StreamingManager] Node ${nodeId} is not stopped, cannot continue`);
        }
    }
}

// Export for ES modules
export { StreamingManager };

// Also expose to global scope for backwards compatibility during migration
if (typeof window !== 'undefined') {
    window.StreamingManager = StreamingManager;
}
