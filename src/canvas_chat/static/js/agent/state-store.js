/**
 * State Store Interface
 *
 * Abstract interface for persisting authoritative state (nodes, edges, runs, events).
 * StateStore is the source of truth - unlike MemoryStore which is derived and query-oriented.
 *
 * The default implementation wraps the existing CRDT graph, but alternate implementations
 * can use Postgres, SQLite, or other backends.
 *
 * @module state-store
 */

import { createLogger } from './debug-logger.js';

const stateLogger = createLogger('State');

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Type of entity stored in the state store
 * @typedef {'node'|'edge'|'run'|'event'} EntityType
 */

/**
 * Query options for listing entities
 * @typedef {Object} QueryOptions
 * @property {number} [limit] - Maximum number of results
 * @property {number} [offset] - Number of results to skip
 * @property {string} [orderBy] - Field to order by
 * @property {'asc'|'desc'} [orderDir] - Order direction
 * @property {Object} [filter] - Filter criteria
 */

/**
 * Result of a batch operation
 * @typedef {Object} BatchResult
 * @property {number} succeeded - Number of successful operations
 * @property {number} failed - Number of failed operations
 * @property {string[]} [errors] - Error messages if any
 */

// =============================================================================
// StateStore Interface
// =============================================================================

/**
 * Abstract interface for state persistence
 * @abstract
 */
class StateStore {
    /**
     * Store name for logging
     * @type {string}
     */
    get name() {
        return 'StateStore';
    }

    // ---- Node Operations ----

    /**
     * Get a node by ID
     * @param {string} nodeId - Node ID
     * @returns {Promise<Object|null>} Node object or null if not found
     */
    async getNode(nodeId) {
        throw new Error('getNode not implemented');
    }

    /**
     * List nodes with optional filtering
     * @param {QueryOptions} [options] - Query options
     * @returns {Promise<Object[]>} Array of nodes
     */
    async listNodes(options = {}) {
        throw new Error('listNodes not implemented');
    }

    /**
     * Save a node (create or update)
     * @param {Object} node - Node object
     * @returns {Promise<void>}
     */
    async saveNode(node) {
        throw new Error('saveNode not implemented');
    }

    /**
     * Delete a node
     * @param {string} nodeId - Node ID
     * @returns {Promise<boolean>} True if deleted
     */
    async deleteNode(nodeId) {
        throw new Error('deleteNode not implemented');
    }

    // ---- Edge Operations ----

    /**
     * Get an edge by ID
     * @param {string} edgeId - Edge ID
     * @returns {Promise<Object|null>} Edge object or null if not found
     */
    async getEdge(edgeId) {
        throw new Error('getEdge not implemented');
    }

    /**
     * List edges with optional filtering
     * @param {QueryOptions} [options] - Query options
     * @returns {Promise<Object[]>} Array of edges
     */
    async listEdges(options = {}) {
        throw new Error('listEdges not implemented');
    }

    /**
     * Save an edge (create or update)
     * @param {Object} edge - Edge object
     * @returns {Promise<void>}
     */
    async saveEdge(edge) {
        throw new Error('saveEdge not implemented');
    }

    /**
     * Delete an edge
     * @param {string} edgeId - Edge ID
     * @returns {Promise<boolean>} True if deleted
     */
    async deleteEdge(edgeId) {
        throw new Error('deleteEdge not implemented');
    }

    // ---- Run Operations ----

    /**
     * Get a run by ID
     * @param {string} runId - Run ID
     * @returns {Promise<import('./agent-types.js').AgentRun|null>} Run object or null
     */
    async getRun(runId) {
        throw new Error('getRun not implemented');
    }

    /**
     * List runs with optional filtering
     * @param {QueryOptions} [options] - Query options
     * @returns {Promise<import('./agent-types.js').AgentRun[]>} Array of runs
     */
    async listRuns(options = {}) {
        throw new Error('listRuns not implemented');
    }

    /**
     * Save a run (create or update)
     * @param {import('./agent-types.js').AgentRun} run - Run object
     * @returns {Promise<void>}
     */
    async saveRun(run) {
        throw new Error('saveRun not implemented');
    }

    /**
     * Delete a run
     * @param {string} runId - Run ID
     * @returns {Promise<boolean>} True if deleted
     */
    async deleteRun(runId) {
        throw new Error('deleteRun not implemented');
    }

    // ---- Event Operations ----

    /**
     * Get events for a run
     * @param {string} runId - Run ID
     * @returns {Promise<import('./agent-types.js').AgentEvent[]>} Array of events
     */
    async getEventsForRun(runId) {
        throw new Error('getEventsForRun not implemented');
    }

    /**
     * Append an event to a run
     * @param {string} runId - Run ID
     * @param {import('./agent-types.js').AgentEvent} event - Event to append
     * @returns {Promise<void>}
     */
    async appendEvent(runId, event) {
        throw new Error('appendEvent not implemented');
    }

    // ---- Bulk Operations ----

    /**
     * Execute multiple operations in a transaction
     * @param {Function} callback - Callback receiving transaction context
     * @returns {Promise<any>} Result of callback
     */
    async transaction(callback) {
        // Default: no transaction support, just execute
        return await callback(this);
    }

    /**
     * Clear all data (use with caution!)
     * @returns {Promise<void>}
     */
    async clear() {
        throw new Error('clear not implemented');
    }
}

// =============================================================================
// CRDT StateStore Implementation
// =============================================================================

/**
 * StateStore implementation backed by the existing CRDT graph
 *
 * This wraps the CRDTGraph class to provide the StateStore interface,
 * allowing future migration to other backends.
 */
class CRDTStateStore extends StateStore {
    /**
     * @param {import('../crdt-graph.js').CRDTGraph} graph - CRDT graph instance
     */
    constructor(graph) {
        super();
        this.graph = graph;
        this.runs = new Map(); // Run ID -> AgentRun
        this.events = new Map(); // Run ID -> AgentEvent[]

        stateLogger.debug('CRDTStateStore initialized');
    }

    get name() {
        return 'CRDTStateStore';
    }

    // ---- Node Operations (delegated to CRDT graph) ----

    async getNode(nodeId) {
        stateLogger.debug('getNode', { nodeId });
        return this.graph.getNode(nodeId);
    }

    async listNodes(options = {}) {
        stateLogger.debug('listNodes', options);
        const allNodes = this.graph.getAllNodes();

        let result = allNodes;

        // Apply filter
        if (options.filter) {
            result = result.filter((node) => {
                for (const [key, value] of Object.entries(options.filter)) {
                    if (node[key] !== value) return false;
                }
                return true;
            });
        }

        // Apply ordering
        if (options.orderBy) {
            result.sort((a, b) => {
                const aVal = a[options.orderBy];
                const bVal = b[options.orderBy];
                const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return options.orderDir === 'desc' ? -cmp : cmp;
            });
        }

        // Apply pagination
        if (options.offset) {
            result = result.slice(options.offset);
        }
        if (options.limit) {
            result = result.slice(0, options.limit);
        }

        return result;
    }

    async saveNode(node) {
        stateLogger.debug('saveNode', { nodeId: node.id, type: node.type });

        const existing = this.graph.getNode(node.id);
        if (existing) {
            // Update existing node
            for (const [key, value] of Object.entries(node)) {
                if (key !== 'id') {
                    this.graph.updateNodeProperty(node.id, key, value);
                }
            }
        } else {
            // Create new node
            this.graph.addNode(node);
        }
    }

    async deleteNode(nodeId) {
        stateLogger.debug('deleteNode', { nodeId });
        const existing = this.graph.getNode(nodeId);
        if (!existing) return false;

        this.graph.deleteNode(nodeId);
        return true;
    }

    // ---- Edge Operations (delegated to CRDT graph) ----

    async getEdge(edgeId) {
        stateLogger.debug('getEdge', { edgeId });
        return this.graph.getEdge(edgeId);
    }

    async listEdges(options = {}) {
        stateLogger.debug('listEdges', options);
        const allEdges = this.graph.getAllEdges();

        let result = allEdges;

        // Apply filter
        if (options.filter) {
            result = result.filter((edge) => {
                for (const [key, value] of Object.entries(options.filter)) {
                    if (edge[key] !== value) return false;
                }
                return true;
            });
        }

        // Apply pagination
        if (options.offset) {
            result = result.slice(options.offset);
        }
        if (options.limit) {
            result = result.slice(0, options.limit);
        }

        return result;
    }

    async saveEdge(edge) {
        stateLogger.debug('saveEdge', { edgeId: edge.id });

        const existing = this.graph.getEdge(edge.id);
        if (!existing) {
            this.graph.addEdge(edge);
        }
        // Note: CRDT graph doesn't support edge updates
    }

    async deleteEdge(edgeId) {
        stateLogger.debug('deleteEdge', { edgeId });
        const existing = this.graph.getEdge(edgeId);
        if (!existing) return false;

        this.graph.deleteEdge(edgeId);
        return true;
    }

    // ---- Run Operations (stored in memory, backed by Run nodes) ----

    async getRun(runId) {
        stateLogger.debug('getRun', { runId });

        // First check memory
        if (this.runs.has(runId)) {
            return this.runs.get(runId);
        }

        // Then check for Run node in graph
        const nodes = await this.listNodes({ filter: { type: 'run', runId } });
        if (nodes.length > 0) {
            const runNode = nodes[0];
            const run = runNode.metadata?.run;
            if (run) {
                this.runs.set(runId, run);
                return run;
            }
        }

        return null;
    }

    async listRuns(options = {}) {
        stateLogger.debug('listRuns', options);

        // Get all runs from memory
        const runs = Array.from(this.runs.values());

        let result = runs;

        // Apply filter
        if (options.filter) {
            result = result.filter((run) => {
                for (const [key, value] of Object.entries(options.filter)) {
                    if (run[key] !== value) return false;
                }
                return true;
            });
        }

        // Apply ordering (default: by startedAt desc)
        const orderBy = options.orderBy || 'startedAt';
        const orderDir = options.orderDir || 'desc';
        result.sort((a, b) => {
            const aVal = a[orderBy];
            const bVal = b[orderBy];
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return orderDir === 'desc' ? -cmp : cmp;
        });

        // Apply pagination
        if (options.offset) {
            result = result.slice(options.offset);
        }
        if (options.limit) {
            result = result.slice(0, options.limit);
        }

        return result;
    }

    async saveRun(run) {
        stateLogger.debug('saveRun', { runId: run.id, status: run.status });
        this.runs.set(run.id, run);

        // Also update the Run node in graph if it exists
        const nodes = await this.listNodes({ filter: { type: 'run', runId: run.id } });
        if (nodes.length > 0) {
            const nodeId = nodes[0].id;
            this.graph.updateNodeProperty(nodeId, 'metadata', {
                ...nodes[0].metadata,
                run,
            });
        }
    }

    async deleteRun(runId) {
        stateLogger.debug('deleteRun', { runId });

        const existed = this.runs.has(runId);
        this.runs.delete(runId);
        this.events.delete(runId);

        return existed;
    }

    // ---- Event Operations ----

    async getEventsForRun(runId) {
        stateLogger.debug('getEventsForRun', { runId });
        return this.events.get(runId) || [];
    }

    async appendEvent(runId, event) {
        stateLogger.debug('appendEvent', { runId, eventType: event.type });

        if (!this.events.has(runId)) {
            this.events.set(runId, []);
        }
        this.events.get(runId).push(event);

        // Also update run's events array
        const run = this.runs.get(runId);
        if (run) {
            run.events.push(event);
        }
    }

    // ---- Bulk Operations ----

    async clear() {
        stateLogger.warn('Clearing all state');
        this.runs.clear();
        this.events.clear();
        // Note: We don't clear the CRDT graph as that's managed separately
    }
}

// =============================================================================
// StateStore Registry
// =============================================================================

/**
 * Registry for StateStore implementations
 */
class StateStoreRegistry {
    constructor() {
        /** @type {Map<string, typeof StateStore>} */
        this.stores = new Map();
        /** @type {StateStore|null} */
        this.activeStore = null;

        // Register built-in stores
        this.register('crdt', CRDTStateStore);
    }

    /**
     * Register a StateStore implementation
     * @param {string} id - Store identifier
     * @param {typeof StateStore} storeClass - Store class
     */
    register(id, storeClass) {
        stateLogger.debug('StateStoreRegistry.register', { id });
        this.stores.set(id, storeClass);
    }

    /**
     * Get a registered store class
     * @param {string} id - Store identifier
     * @returns {typeof StateStore|undefined}
     */
    get(id) {
        return this.stores.get(id);
    }

    /**
     * List all registered store IDs
     * @returns {string[]}
     */
    list() {
        return Array.from(this.stores.keys());
    }

    /**
     * Set the active store
     * @param {StateStore} store - Store instance
     */
    setActive(store) {
        stateLogger.info('StateStoreRegistry.setActive', { storeName: store.name });
        this.activeStore = store;
    }

    /**
     * Get the active store
     * @returns {StateStore|null}
     */
    getActive() {
        return this.activeStore;
    }
}

// Global registry instance
const stateStoreRegistry = new StateStoreRegistry();

// =============================================================================
// Exports
// =============================================================================

export { StateStore, CRDTStateStore, StateStoreRegistry, stateStoreRegistry };
