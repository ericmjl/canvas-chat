/**
 * CRDT-backed Graph using Yjs for conflict-free collaborative editing.
 * API-compatible with the legacy Graph class.
 *
 * Key design decisions:
 * - Duck typing instead of instanceof (avoids Yjs duplicate instance issues)
 * - Y.Text for node content (future collaborative editing)
 * - Legacy DB is source of truth (CRDT DB is overlay for real-time sync)
 * - Defensive value extraction (always convert Y types to plain JS)
 *
 * @see ./graph-types.js for Node, Edge, and other type definitions
 */

import { NodeType, TAG_COLORS } from './graph-types.js';
import { EventEmitter } from './event-emitter.js';
import { wouldOverlapNodes, resolveOverlaps } from './layout.js';

// =============================================================================
// Type Imports (JSDoc)
// =============================================================================

/**
 * Type aliases for graph types (defined in graph-types.js)
 * @typedef {Object} Node - See graph-types.js for Node definition
 * @typedef {Object} Edge - See graph-types.js for Edge definition
 * @typedef {Object} Position - See graph-types.js for Position definition
 * @typedef {string} NodeTypeValue - See graph-types.js for NodeTypeValue definition
 * @typedef {string} EdgeTypeValue - See graph-types.js for EdgeTypeValue definition
 */

/**
 * Node lock info for collaborative editing
 * @typedef {Object} NodeLock
 * @property {number} clientId - Yjs client ID that holds the lock
 * @property {number} timestamp - When the lock was acquired
 * @property {boolean} [isOurs] - Whether this client holds the lock
 */

/**
 * Multiplayer connection status
 * @typedef {Object} MultiplayerStatus
 * @property {boolean} enabled - Whether multiplayer is enabled
 * @property {boolean} [connected] - Whether connected to signaling
 * @property {string} [room] - Room name
 * @property {number} [peers] - Number of connected peers
 */

/**
 * Message format for context resolution
 * @typedef {Object} ContextMessage
 * @property {'user'|'assistant'} role - Message role
 * @property {string} content - Message content
 * @property {string} nodeId - Source node ID
 * @property {string} [imageData] - Base64 image data
 * @property {string} [mimeType] - Image MIME type
 */

// =============================================================================
// Duck Type Checks (avoid instanceof which breaks after IndexedDB round-trip)
// =============================================================================

/**
 * Check if value is a Y.Map-like object
 * @param {*} value
 * @returns {boolean}
 */
function isYMap(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof value.get === 'function' &&
        typeof value.set === 'function' &&
        typeof value.has === 'function'
    );
}

/**
 * Check if value is a Y.Text-like object
 * Note: Must check for toDelta to distinguish from Y.Array (both have insert/delete)
 * @param {*} value
 * @returns {boolean}
 */
function isYText(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof value.toString === 'function' &&
        typeof value.insert === 'function' &&
        typeof value.delete === 'function' &&
        typeof value.toDelta === 'function'
    ); // Y.Array doesn't have toDelta
}

/**
 * Check if value is a Y.Array-like object
 * @param {*} value
 * @returns {boolean}
 */
function isYArray(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof value.toArray === 'function' &&
        typeof value.push === 'function' &&
        typeof value.delete === 'function'
    );
}

// =============================================================================
// CRDTGraph Class
// =============================================================================

/**
 *
 */
class CRDTGraph extends EventEmitter {
    /**
     * Create a new CRDT-backed graph
     * @param {string} sessionId - Unique session identifier for persistence
     * @param {Object} legacyData - Legacy data to load (nodes, edges, tags)
     */
    constructor(sessionId = null, legacyData = {}) {
        // Call EventEmitter constructor
        super();

        // Safety check: ensure Yjs is loaded
        if (typeof Y === 'undefined') {
            throw new Error(
                '[CRDTGraph] Yjs (Y) is not defined. ' +
                    'Ensure the Yjs ES module has loaded before instantiating CRDTGraph. ' +
                    'Wait for the "yjs-ready" event on window.'
            );
        }

        console.log('%c[CRDTGraph] Initializing CRDT-backed graph', 'color: #4CAF50; font-weight: bold');
        console.log('[CRDTGraph] Session ID:', sessionId);

        // Yjs document - the root of all CRDT data
        this.ydoc = new Y.Doc();

        // CRDT data structures
        this.yNodes = this.ydoc.getMap('nodes'); // nodeId -> Y.Map (node properties)
        this.yEdges = this.ydoc.getArray('edges'); // Array of edge objects
        this.yTags = this.ydoc.getMap('tags'); // color -> Y.Map { name, color }

        // Local indexes (rebuilt from CRDT state, not synced)
        // These provide fast lookups for graph traversal
        this.outgoingEdges = new Map(); // nodeId -> [edges where node is source]
        this.incomingEdges = new Map(); // nodeId -> [edges where node is target]

        // Session ID and persistence
        this.sessionId = sessionId;
        this.persistence = null;
        this._synced = false;

        // Store legacy data for loading after persistence sync
        this._legacyData = legacyData;

        // Set up observers for index maintenance
        this._setupObservers();
    }

    // =========================================================================
    // Persistence
    // =========================================================================

    /**
     * Enable IndexedDB persistence for this graph.
     * Always loads from legacy data (source of truth) to ensure consistency.
     */
    async enablePersistence() {
        if (!this.sessionId) {
            console.warn('[CRDTGraph] No session ID, skipping persistence');
            return;
        }

        if (typeof IndexeddbPersistence === 'undefined') {
            console.warn('[CRDTGraph] IndexeddbPersistence not available, skipping persistence');
            return;
        }

        const dbName = `crdt-${this.sessionId}`;
        console.log('[CRDTGraph] Enabling persistence:', dbName);

        try {
            this.persistence = new IndexeddbPersistence(dbName, this.ydoc);

            // Wait for initial sync with IndexedDB
            await new Promise((resolve, _reject) => {
                const timeout = setTimeout(() => {
                    console.warn('[CRDTGraph] Persistence sync timeout, continuing anyway');
                    resolve();
                }, 5000);

                this.persistence.on('synced', () => {
                    clearTimeout(timeout);
                    console.log('[CRDTGraph] Synced with IndexedDB');
                    this._synced = true;
                    resolve();
                });
            });

            // ALWAYS load from legacy data (source of truth)
            // This ensures toggle safety - legacy DB always wins
            if (
                this._legacyData.nodes?.length > 0 ||
                this._legacyData.edges?.length > 0 ||
                Object.keys(this._legacyData.tags || {}).length > 0
            ) {
                console.log('[CRDTGraph] Loading from legacy data (source of truth)');
                this._clearAndLoadFromLegacy();
            }

            // Rebuild indexes after loading
            this._rebuildIndexes();

            console.log('[CRDTGraph] Persistence enabled, nodes:', this.yNodes.size);
        } catch (error) {
            console.error('[CRDTGraph] Failed to enable persistence:', error);
            // Continue without persistence - still usable in memory
        }
    }

    // =========================================================================
    // WebRTC Multiplayer
    // =========================================================================

    /**
     * Enable WebRTC-based multiplayer sync.
     * Peers with the same room ID will sync in real-time via WebRTC.
     *
     * @param {string} roomId - Room identifier (defaults to sessionId)
     * @param {Object} options - WebrtcProvider options
     * @returns {Object|null} - WebrtcProvider instance or null if unavailable
     */
    enableMultiplayer(roomId = null, options = {}) {
        if (typeof WebrtcProvider === 'undefined') {
            console.warn('[CRDTGraph] WebrtcProvider not available, skipping multiplayer');
            return null;
        }

        // Use session ID as room ID by default
        const room = roomId || this.sessionId;
        if (!room) {
            console.warn('[CRDTGraph] No room ID, skipping multiplayer');
            return null;
        }

        // Build signaling server URL
        // Default to local signaling server, can be overridden in options
        const signalingUrl = options.signaling || this._getSignalingUrl();

        console.log('%c[CRDTGraph] Enabling multiplayer', 'color: #2196F3; font-weight: bold');
        console.log('[CRDTGraph] Room:', room);
        console.log('[CRDTGraph] Signaling:', signalingUrl);

        try {
            // Create WebRTC provider
            this.webrtcProvider = new WebrtcProvider(room, this.ydoc, {
                signaling: [signalingUrl],
                // Password for encrypted signaling (optional)
                password: options.password || null,
                // Max connections (default 20-35 with random factor)
                maxConns: options.maxConns || 20 + Math.floor(Math.random() * 15),
                // Filter browser tab connections (use BroadcastChannel instead)
                filterBcConns: options.filterBcConns !== false,
                ...options,
            });

            // Log connection events
            this.webrtcProvider.on('synced', ({ synced }) => {
                console.log('[CRDTGraph] WebRTC synced:', synced);
            });

            this.webrtcProvider.on('peers', ({ added, removed, webrtcPeers, bcPeers }) => {
                console.log('[CRDTGraph] Peers changed:', {
                    added: added.length,
                    removed: removed.length,
                    webrtc: webrtcPeers.length,
                    broadcast: bcPeers.length,
                });
            });

            console.log('[CRDTGraph] Multiplayer enabled');
            return this.webrtcProvider;
        } catch (error) {
            console.error('[CRDTGraph] Failed to enable multiplayer:', error);
            return null;
        }
    }

    /**
     * Disable WebRTC multiplayer.
     * @returns {void}
     */
    disableMultiplayer() {
        if (this.webrtcProvider) {
            console.log('[CRDTGraph] Disabling multiplayer');
            this.webrtcProvider.destroy();
            this.webrtcProvider = null;
        }
    }

    /**
     * Get the current signaling server URL.
     * Uses the current page's host for the signaling endpoint.
     * @returns {string}
     */
    _getSignalingUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/signal`;
    }

    /**
     * Get multiplayer connection status.
     * @returns {Object} Status with peer counts and connection state
     */
    getMultiplayerStatus() {
        if (!this.webrtcProvider) {
            return { enabled: false, peers: 0, connected: false };
        }

        return {
            enabled: true,
            connected: this.webrtcProvider.connected,
            room: this.webrtcProvider.roomName,
            peers: this.webrtcProvider.awareness?.getStates().size - 1 || 0,
        };
    }

    // =========================================================================
    // Node Locking (for collaborative editing)
    // =========================================================================

    /**
     * Get the awareness instance for presence/locking.
     * @returns {Object|null} Yjs Awareness instance or null if not in multiplayer
     */
    getAwareness() {
        return this.webrtcProvider?.awareness || null;
    }

    /**
     * Get our unique client ID in the awareness system.
     * @returns {number|null} Client ID or null if not in multiplayer
     */
    getClientId() {
        return this.webrtcProvider?.awareness?.clientID || null;
    }

    /**
     * Lock a node for editing by this client.
     * @param {string} nodeId - The node to lock
     * @returns {boolean} True if lock acquired, false if already locked by another
     */
    lockNode(nodeId) {
        const awareness = this.getAwareness();
        if (!awareness) return true; // No multiplayer, always allow

        // Check if already locked by another client
        const lockInfo = this.getNodeLock(nodeId);
        if (lockInfo && lockInfo.clientId !== awareness.clientID) {
            console.log(`[CRDTGraph] Node ${nodeId} is locked by client ${lockInfo.clientId}`);
            return false;
        }

        // Acquire lock
        const currentState = awareness.getLocalState() || {};
        const lockedNodes = { ...(currentState.lockedNodes || {}) };
        lockedNodes[nodeId] = {
            clientId: awareness.clientID,
            timestamp: Date.now(),
        };

        awareness.setLocalState({
            ...currentState,
            lockedNodes,
        });

        console.log(`[CRDTGraph] Locked node ${nodeId}`);
        return true;
    }

    /**
     * Release a lock on a node.
     * @param {string} nodeId - The node to unlock
     */
    unlockNode(nodeId) {
        const awareness = this.getAwareness();
        if (!awareness) return;

        const currentState = awareness.getLocalState() || {};
        const lockedNodes = { ...(currentState.lockedNodes || {}) };

        // Only unlock if we own the lock
        if (lockedNodes[nodeId]?.clientId === awareness.clientID) {
            delete lockedNodes[nodeId];

            awareness.setLocalState({
                ...currentState,
                lockedNodes,
            });

            console.log(`[CRDTGraph] Unlocked node ${nodeId}`);
        }
    }

    /**
     * Check if a node is locked and by whom.
     * @param {string} nodeId - The node to check
     * @returns {Object|null} Lock info { clientId, timestamp } or null if not locked
     */
    getNodeLock(nodeId) {
        const awareness = this.getAwareness();
        if (!awareness) return null;

        // Check all clients' awareness states
        for (const [clientId, state] of awareness.getStates()) {
            if (state.lockedNodes?.[nodeId]) {
                return {
                    clientId,
                    timestamp: state.lockedNodes[nodeId].timestamp,
                    isOurs: clientId === awareness.clientID,
                };
            }
        }
        return null;
    }

    /**
     * Check if a node is locked by another client (not us).
     * @param {string} nodeId - The node to check
     * @returns {boolean} True if locked by another client
     */
    isNodeLockedByOther(nodeId) {
        const lock = this.getNodeLock(nodeId);
        return lock !== null && !lock.isOurs;
    }

    /**
     * Get all currently locked nodes across all clients.
     * @returns {Map<string, Object>} Map of nodeId -> lock info
     */
    getAllLockedNodes() {
        const awareness = this.getAwareness();
        if (!awareness) return new Map();

        const locks = new Map();
        for (const [clientId, state] of awareness.getStates()) {
            if (state.lockedNodes) {
                for (const [nodeId, lockInfo] of Object.entries(state.lockedNodes)) {
                    locks.set(nodeId, {
                        clientId,
                        timestamp: lockInfo.timestamp,
                        isOurs: clientId === awareness.clientID,
                    });
                }
            }
        }
        return locks;
    }

    /**
     * Release all locks held by this client.
     * Call this on disconnect or page unload.
     */
    releaseAllLocks() {
        const awareness = this.getAwareness();
        if (!awareness) return;

        const currentState = awareness.getLocalState() || {};
        if (currentState.lockedNodes && Object.keys(currentState.lockedNodes).length > 0) {
            awareness.setLocalState({
                ...currentState,
                lockedNodes: {},
            });
            console.log('[CRDTGraph] Released all locks');
        }
    }

    /**
     * Set a callback for when locks change (for UI updates).
     * @param {Function} callback - Called with (lockedNodes: Map) when locks change
     */
    onLocksChange(callback) {
        const awareness = this.getAwareness();
        if (!awareness) return;

        awareness.on('change', () => {
            callback(this.getAllLockedNodes());
        });
    }

    /**
     * Clear CRDT data and reload from legacy format.
     * This ensures legacy DB is always source of truth.
     */
    _clearAndLoadFromLegacy() {
        // Use a transaction to batch all changes
        this.ydoc.transact(() => {
            // Clear existing CRDT data
            this.yNodes.clear();
            while (this.yEdges.length > 0) {
                this.yEdges.delete(0);
            }
            this.yTags.clear();

            // Load nodes
            if (this._legacyData.nodes) {
                for (const node of this._legacyData.nodes) {
                    this._addNodeToCRDT(node);
                }
            }

            // Load edges
            if (this._legacyData.edges) {
                for (const edge of this._legacyData.edges) {
                    this._addEdgeToCRDT(edge);
                }
            }

            // Load tags
            if (this._legacyData.tags) {
                for (const [color, tag] of Object.entries(this._legacyData.tags)) {
                    const yTag = new Y.Map();
                    yTag.set('name', tag.name);
                    yTag.set('color', tag.color);
                    this.yTags.set(color, yTag);
                }
            }
        }, 'local'); // Mark as local change

        console.log('[CRDTGraph] Loaded from legacy:', {
            nodes: this.yNodes.size,
            edges: this.yEdges.length,
            tags: this.yTags.size,
        });
    }

    /**
     * Add a node to CRDT structures (internal helper)
     * @param node
     */
    _addNodeToCRDT(node) {
        const yNode = new Y.Map();

        for (const [key, value] of Object.entries(node)) {
            if (key === 'content') {
                // Use Y.Text for content (enables collaborative editing)
                const yText = new Y.Text();
                yText.insert(0, value || '');
                yNode.set('content', yText);
            } else if (key === 'position' && value) {
                // Use Y.Map for position
                const yPos = new Y.Map();
                yPos.set('x', value.x || 0);
                yPos.set('y', value.y || 0);
                yNode.set('position', yPos);
            } else if (key === 'tags' && Array.isArray(value)) {
                // Use Y.Array for tags
                const yTags = new Y.Array();
                yTags.push(value);
                yNode.set('tags', yTags);
            } else if (key === 'cells' && value) {
                // Matrix cells - store as Y.Map
                const yCells = new Y.Map();
                for (const [cellKey, cellValue] of Object.entries(value)) {
                    const yCell = new Y.Map();
                    yCell.set('content', cellValue.content);
                    yCell.set('filled', cellValue.filled || false);
                    yCells.set(cellKey, yCell);
                }
                yNode.set('cells', yCells);
            } else if (key === 'metadata' && value && typeof value === 'object') {
                // Metadata object - store as Y.Map to preserve nested properties
                const yMetadata = new Y.Map();
                for (const [metaKey, metaValue] of Object.entries(value)) {
                    yMetadata.set(metaKey, metaValue);
                }
                yNode.set('metadata', yMetadata);
            } else if (value && typeof value === 'object' && !Array.isArray(value) && value.constructor === Object) {
                // Generic nested object (not position, cells, metadata which have special handling above)
                // Recursively convert to Y.Map to preserve nested properties
                // This handles plugin-specific nested objects (e.g., gitRepoData) without special casing
                const yObj = new Y.Map();
                for (const [objKey, objValue] of Object.entries(value)) {
                    if (
                        objValue &&
                        typeof objValue === 'object' &&
                        !Array.isArray(objValue) &&
                        objValue.constructor === Object
                    ) {
                        // Nested object - recursively convert
                        const yNested = new Y.Map();
                        for (const [nestedKey, nestedValue] of Object.entries(objValue)) {
                            if (
                                nestedValue &&
                                typeof nestedValue === 'object' &&
                                !Array.isArray(nestedValue) &&
                                nestedValue.constructor === Object
                            ) {
                                // Deeply nested object - convert one more level
                                const yDeep = new Y.Map();
                                for (const [deepKey, deepValue] of Object.entries(nestedValue)) {
                                    yDeep.set(deepKey, deepValue);
                                }
                                yNested.set(nestedKey, yDeep);
                            } else {
                                yNested.set(nestedKey, nestedValue);
                            }
                        }
                        yObj.set(objKey, yNested);
                    } else if (Array.isArray(objValue)) {
                        // Arrays in nested objects - store as Y.Array
                        const yArr = new Y.Array();
                        yArr.push(objValue);
                        yObj.set(objKey, yArr);
                    } else {
                        // Primitives
                        yObj.set(objKey, objValue);
                    }
                }
                yNode.set(key, yObj);
            } else if (Array.isArray(value)) {
                // Other arrays (rowItems, colItems, contextNodeIds)
                const yArr = new Y.Array();
                yArr.push(value);
                yNode.set(key, yArr);
            } else {
                // Primitives
                yNode.set(key, value);
            }
        }

        this.yNodes.set(node.id, yNode);
    }

    /**
     * Add an edge to CRDT structures (internal helper)
     * @param edge
     */
    _addEdgeToCRDT(edge) {
        const yEdge = new Y.Map();
        for (const [key, value] of Object.entries(edge)) {
            yEdge.set(key, value);
        }
        this.yEdges.push([yEdge]);
    }

    // =========================================================================
    // Observers for Index Maintenance
    // =========================================================================

    /**
     *
     */
    _setupObservers() {
        // Observe node changes for remote sync notifications
        this.yNodes.observeDeep((events, transaction) => {
            // Only notify for remote changes (not local)
            if (transaction.origin !== null && transaction.origin !== 'local') {
                console.log('[CRDTGraph] Remote node change detected');
                this._notifyChange('nodes', events);
            }
        });

        // Observe edge changes to maintain indexes
        this.yEdges.observe((event, transaction) => {
            // Rebuild indexes on any edge change
            // This is simpler than tracking individual changes
            this._rebuildIndexes();

            // Emit granular events for both local and remote changes
            // This allows the UI to be fully event-driven
            event.changes.added.forEach((item) => {
                item.content.getContent().forEach((yEdge) => {
                    const edge = this._extractEdge(yEdge);
                    this.emit('edgeAdded', edge);
                });
            });

            event.changes.deleted.forEach((item) => {
                item.content.getContent().forEach((yEdge) => {
                    // We can't extract the edge fully because it's deleted,
                    // but we can try to get the ID if it was preserved,
                    // or we might have to rely on the fact that yEdges is an array.
                    // Y.Array deletions are tricky because we only get the index/length.
                    // However, we rebuilt indexes, so we know what's currently in the graph.
                    // For deleted edges, Yjs usually gives us the deleted content if we ask right,
                    // but item.content is available.
                    const edge = this._extractEdge(yEdge);
                    this.emit('edgeRemoved', edge.id);
                });
            });

            // Notify for remote changes (legacy callback)
            if (transaction.origin !== null && transaction.origin !== 'local') {
                console.log('[CRDTGraph] Remote edge change detected');
                this._notifyChange('edges', event);
            }
        });
    }

    /**
     * Set a callback to be notified of remote changes.
     * The callback receives (type, events) where type is 'nodes' or 'edges'.
     * Use this to trigger canvas re-renders when remote peers make changes.
     *
     * @param {Function} callback - Function to call on remote changes
     */
    onRemoteChange(callback) {
        this._remoteChangeCallback = callback;
    }

    /**
     * Notify the change callback if set
     * @param type
     * @param events
     */
    _notifyChange(type, events) {
        if (this._remoteChangeCallback) {
            this._remoteChangeCallback(type, events);
        }
    }

    /**
     *
     */
    _rebuildIndexes() {
        this.outgoingEdges.clear();
        this.incomingEdges.clear();

        for (let i = 0; i < this.yEdges.length; i++) {
            const yEdge = this.yEdges.get(i);
            const edge = this._extractEdge(yEdge);

            if (!edge.source || !edge.target) continue;

            // Outgoing
            if (!this.outgoingEdges.has(edge.source)) {
                this.outgoingEdges.set(edge.source, []);
            }
            this.outgoingEdges.get(edge.source).push(edge);

            // Incoming
            if (!this.incomingEdges.has(edge.target)) {
                this.incomingEdges.set(edge.target, []);
            }
            this.incomingEdges.get(edge.target).push(edge);
        }
    }

    // =========================================================================
    // Value Extraction (Y types -> plain JS)
    // =========================================================================

    /**
     * Extract a plain JS value from a potentially Y-typed value.
     * Uses duck typing to avoid instanceof issues.
     * Note: Check Y.Array BEFORE Y.Text because Y.Array passes the old Y.Text check
     * @param {*} value
     * @returns {*}
     */
    _extractValue(value) {
        if (value === null || value === undefined) {
            return value;
        }

        // Check Y.Array first (more specific check)
        if (isYArray(value)) {
            const arr = value.toArray();
            return arr.map((v) => this._extractValue(v));
        }

        if (isYText(value)) {
            return value.toString();
        }

        if (isYMap(value)) {
            const obj = {};
            value.forEach((v, k) => {
                obj[k] = this._extractValue(v);
            });
            return obj;
        }

        // Primitive value
        return value;
    }

    /**
     * Extract a node from Y.Map to plain JS object
     * @param {Object} yNode
     * @returns {Object|null}
     */
    _extractNode(yNode) {
        if (!yNode || !isYMap(yNode)) {
            return null;
        }

        const node = {};
        yNode.forEach((value, key) => {
            node[key] = this._extractValue(value);
        });

        // Ensure required fields exist and have correct types
        if (!node.tags || !Array.isArray(node.tags)) {
            node.tags = [];
        } else {
            // Flatten in case of nested arrays (Y.Array extraction edge case)
            node.tags = node.tags.flat();
        }

        // Flatten other arrays that might be nested (options, rowItems, colItems, etc.)
        // Y.Array.push(array) creates nested arrays, so we need to flatten on extraction
        const arrayFields = ['options', 'rowItems', 'colItems', 'contextNodeIds'];
        for (const field of arrayFields) {
            if (node[field] && Array.isArray(node[field])) {
                node[field] = node[field].flat();
            }
        }

        if (!node.position) node.position = { x: 0, y: 0 };

        return node;
    }

    /**
     * Extract an edge from Y.Map to plain JS object
     * @param {Object} yEdge
     * @returns {Object|null}
     */
    _extractEdge(yEdge) {
        if (!yEdge || !isYMap(yEdge)) {
            return null;
        }

        const edge = {};
        yEdge.forEach((value, key) => {
            edge[key] = this._extractValue(value);
        });

        return edge;
    }

    // =========================================================================
    // Node CRUD Operations
    // =========================================================================

    /**
     * Add a node to the graph
     * @param {Object} node
     * @returns {Object}
     */
    addNode(node) {
        this.ydoc.transact(() => {
            this._addNodeToCRDT(node);
        }, 'local'); // Mark as local change

        // Emit event for listeners (e.g., App to update empty state)
        this.emit('nodeAdded', node);

        return node;
    }

    /**
     * Get a node by ID (returns plain JS object)
     * @param {string} id
     * @returns {Object|undefined}
     */
    getNode(id) {
        const yNode = this.yNodes.get(id);
        if (!yNode) return undefined;
        return this._extractNode(yNode);
    }

    /**
     * Update a node's properties
     * @param {string} id
     * @param {Object} updates
     * @returns {Object|undefined}
     */
    updateNode(id, updates) {
        const yNode = this.yNodes.get(id);
        if (!yNode) return undefined;

        this.ydoc.transact(() => {
            for (const [key, value] of Object.entries(updates)) {
                if (key === 'content') {
                    // Get existing Y.Text or create new one
                    let yText = yNode.get('content');
                    if (!isYText(yText)) {
                        yText = new Y.Text();
                        yNode.set('content', yText);
                    }
                    // Replace content
                    yText.delete(0, yText.length);
                    yText.insert(0, value || '');
                } else if (key === 'position' && value) {
                    let yPos = yNode.get('position');
                    if (!isYMap(yPos)) {
                        yPos = new Y.Map();
                        yNode.set('position', yPos);
                    }
                    yPos.set('x', value.x);
                    yPos.set('y', value.y);
                } else if (key === 'tags' && Array.isArray(value)) {
                    let yTags = yNode.get('tags');
                    if (!isYArray(yTags)) {
                        yTags = new Y.Array();
                        yNode.set('tags', yTags);
                    }
                    // Replace tags
                    while (yTags.length > 0) {
                        yTags.delete(0);
                    }
                    if (value.length > 0) {
                        yTags.push(value);
                    }
                } else if (Array.isArray(value)) {
                    // Other arrays (options, rowItems, colItems, contextNodeIds, etc.)
                    let yArr = yNode.get(key);
                    if (!isYArray(yArr)) {
                        yArr = new Y.Array();
                        yNode.set(key, yArr);
                    }
                    // Replace array contents
                    while (yArr.length > 0) {
                        yArr.delete(0);
                    }
                    if (value.length > 0) {
                        // Push array as single element (Y.Array will store it nested)
                        // We'll flatten it when extracting (similar to tags)
                        yArr.push(value);
                    }
                } else if (key === 'cells' && value) {
                    // Matrix cells update
                    let yCells = yNode.get('cells');
                    if (!isYMap(yCells)) {
                        yCells = new Y.Map();
                        yNode.set('cells', yCells);
                    }
                    // Remove cells that are not in the new value (for Clear All functionality)
                    const newCellKeys = new Set(Object.keys(value));
                    for (const existingKey of yCells.keys()) {
                        if (!newCellKeys.has(existingKey)) {
                            yCells.delete(existingKey);
                        }
                    }
                    // Add/update cells from the new value
                    for (const [cellKey, cellValue] of Object.entries(value)) {
                        let yCell = yCells.get(cellKey);
                        if (!isYMap(yCell)) {
                            yCell = new Y.Map();
                            yCells.set(cellKey, yCell);
                        }
                        yCell.set('content', cellValue.content);
                        yCell.set('filled', cellValue.filled || false);
                    }
                } else if (key === 'metadata' && value && typeof value === 'object') {
                    // Metadata object - store as Y.Map to preserve nested properties
                    let yMetadata = yNode.get('metadata');
                    if (!isYMap(yMetadata)) {
                        yMetadata = new Y.Map();
                        yNode.set('metadata', yMetadata);
                    }
                    // Update all metadata properties
                    for (const [metaKey, metaValue] of Object.entries(value)) {
                        yMetadata.set(metaKey, metaValue);
                    }
                } else if (
                    value &&
                    typeof value === 'object' &&
                    !Array.isArray(value) &&
                    value.constructor === Object
                ) {
                    // Generic nested object (not position, cells, metadata which have special handling above)
                    // Recursively convert to Y.Map to preserve nested properties
                    // This handles plugin-specific nested objects without special casing
                    let yObj = yNode.get(key);
                    if (!isYMap(yObj)) {
                        yObj = new Y.Map();
                        yNode.set(key, yObj);
                    }
                    // Update all object properties
                    for (const [objKey, objValue] of Object.entries(value)) {
                        if (
                            objValue &&
                            typeof objValue === 'object' &&
                            !Array.isArray(objValue) &&
                            objValue.constructor === Object
                        ) {
                            // Nested object - recursively convert
                            let yNested = yObj.get(objKey);
                            if (!isYMap(yNested)) {
                                yNested = new Y.Map();
                                yObj.set(objKey, yNested);
                            }
                            // Update nested object properties
                            for (const [nestedKey, nestedValue] of Object.entries(objValue)) {
                                if (
                                    nestedValue &&
                                    typeof nestedValue === 'object' &&
                                    !Array.isArray(nestedValue) &&
                                    nestedValue.constructor === Object
                                ) {
                                    // Deeply nested object - convert one more level
                                    let yDeep = yNested.get(nestedKey);
                                    if (!isYMap(yDeep)) {
                                        yDeep = new Y.Map();
                                        yNested.set(nestedKey, yDeep);
                                    }
                                    // Update deeply nested properties
                                    for (const [deepKey, deepValue] of Object.entries(nestedValue)) {
                                        yDeep.set(deepKey, deepValue);
                                    }
                                } else {
                                    yNested.set(nestedKey, nestedValue);
                                }
                            }
                        } else if (Array.isArray(objValue)) {
                            // Arrays in nested objects - store as Y.Array
                            let yArr = yObj.get(objKey);
                            if (!isYArray(yArr)) {
                                yArr = new Y.Array();
                                yObj.set(objKey, yArr);
                            }
                            // Replace array contents
                            while (yArr.length > 0) {
                                yArr.delete(0);
                            }
                            if (objValue.length > 0) {
                                yArr.push(objValue);
                            }
                        } else {
                            // Primitives
                            yObj.set(objKey, objValue);
                        }
                    }
                } else {
                    // Primitives
                    yNode.set(key, value);
                }
            }
        }, 'local'); // Mark as local change

        return this.getNode(id);
    }

    /**
     * Remove a node and its connected edges
     * @param {string} id
     * @returns {void}
     */
    removeNode(id) {
        this.ydoc.transact(() => {
            // Remove connected edges
            const incoming = this.incomingEdges.get(id) || [];
            const outgoing = this.outgoingEdges.get(id) || [];

            for (const edge of [...incoming, ...outgoing]) {
                this._removeEdgeById(edge.id);
            }

            // Remove node
            this.yNodes.delete(id);
        }, 'local'); // Mark as local change

        // Clear from local indexes
        this.incomingEdges.delete(id);
        this.outgoingEdges.delete(id);

        // Emit event for listeners (e.g., App to update empty state)
        this.emit('nodeRemoved', id);
    }

    /**
     * Get all nodes as array of plain JS objects
     * @returns {Object[]}
     */
    getAllNodes() {
        const nodes = [];
        this.yNodes.forEach((yNode, _id) => {
            const node = this._extractNode(yNode);
            if (node) nodes.push(node);
        });
        return nodes;
    }

    // =========================================================================
    // Edge CRUD Operations
    // =========================================================================

    /**
     * Add an edge to the graph
     * @param {Object} edge
     * @returns {Object}
     */
    addEdge(edge) {
        this.ydoc.transact(() => {
            this._addEdgeToCRDT(edge);
        }, 'local'); // Mark as local change

        // Note: indexes are automatically rebuilt by the yEdges observer
        // after the transaction completes, so no manual update needed here

        return edge;
    }

    /**
     * Remove an edge by ID
     * @param {string} edgeId
     * @returns {void}
     */
    removeEdge(edgeId) {
        this._removeEdgeById(edgeId);
        this._rebuildIndexes();
    }

    /**
     * Internal helper to remove edge by ID
     * @param edgeId
     */
    _removeEdgeById(edgeId) {
        for (let i = 0; i < this.yEdges.length; i++) {
            const yEdge = this.yEdges.get(i);
            if (isYMap(yEdge) && yEdge.get('id') === edgeId) {
                this.yEdges.delete(i);
                return;
            }
        }
    }

    /**
     * Get all edges as array of plain JS objects
     * @returns {Object[]}
     */
    getAllEdges() {
        const edges = [];
        for (let i = 0; i < this.yEdges.length; i++) {
            const yEdge = this.yEdges.get(i);
            const edge = this._extractEdge(yEdge);
            if (edge) edges.push(edge);
        }
        return edges;
    }

    /**
     * Getter for edges array (compatibility with legacy Graph)
     * @returns {Object[]}
     */
    get edges() {
        return this.getAllEdges();
    }

    // =========================================================================
    // Graph Traversal
    // =========================================================================

    /**
     * Get parent nodes (nodes that have edges pointing to this node)
     * @param {string} nodeId
     * @returns {Object[]}
     */
    getParents(nodeId) {
        const incoming = this.incomingEdges.get(nodeId) || [];
        return incoming.map((edge) => this.getNode(edge.source)).filter(Boolean);
    }

    /**
     * Get child nodes (nodes that this node has edges pointing to)
     * @param {string} nodeId
     * @returns {Object[]}
     */
    getChildren(nodeId) {
        const outgoing = this.outgoingEdges.get(nodeId) || [];
        return outgoing.map((edge) => this.getNode(edge.target)).filter(Boolean);
    }

    /**
     * Get all descendants of a node (children, grandchildren, etc.)
     * Handles merge nodes (multiple parents) by deduplicating.
     * @param {string} nodeId - The node ID
     * @param {Set} visited - Set of already visited node IDs (for deduplication)
     * @returns {Array} Array of descendant node objects
     */
    getDescendants(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const descendants = [];
        const children = this.getChildren(nodeId);

        for (const child of children) {
            descendants.push(child);
            descendants.push(...this.getDescendants(child.id, visited));
        }

        return descendants;
    }

    /**
     * Check if a node is visible (not hidden by a collapsed ancestor).
     * A node is visible if ANY path from root to it contains no collapsed ancestors.
     * This handles merge nodes correctly: they stay visible if any parent path is open.
     * @param {string} nodeId - The node ID to check
     * @returns {boolean} True if the node is visible
     */
    isNodeVisible(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        const parents = this.getParents(nodeId);

        // Root nodes (no parents) are always visible
        if (parents.length === 0) return true;

        // Check if ANY parent path leads to visibility
        // A path is open if the parent is not collapsed AND the parent is visible
        for (const parent of parents) {
            if (!parent.collapsed && this.isNodeVisible(parent.id)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Count hidden descendants (for collapse button badge).
     * Only counts nodes that are actually hidden (not visible via another path).
     * @param {string} nodeId - The collapsed node ID
     * @returns {number} Number of hidden descendants
     */
    countHiddenDescendants(nodeId) {
        const descendants = this.getDescendants(nodeId, new Set([nodeId]));
        // Count only those that are not visible via another path
        return descendants.filter((d) => !this.isNodeVisible(d.id)).length;
    }

    /**
     * Find visible descendants reachable through hidden nodes.
     * Used for drawing collapsed-path virtual edges from collapsed node to merge nodes.
     * @param {string} nodeId - The collapsed node ID
     * @returns {Array} Array of visible descendant node objects reachable through hidden paths
     */
    getVisibleDescendantsThroughHidden(nodeId) {
        const result = [];
        const visited = new Set([nodeId]);

        const traverse = (currentId) => {
            const children = this.getChildren(currentId);
            for (const child of children) {
                if (visited.has(child.id)) continue;
                visited.add(child.id);

                if (this.isNodeVisible(child.id)) {
                    // Found a visible descendant - add it to results
                    result.push(child);
                    // Don't traverse further - we only want the first visible node in each path
                } else {
                    // Child is hidden, continue traversing
                    traverse(child.id);
                }
            }
        };

        traverse(nodeId);
        return result;
    }

    /**
     * Find visible ancestors reachable through hidden nodes.
     * Used for navigation: when at a merge node, find collapsed ancestors that connect through hidden paths.
     * @param {string} nodeId - The node ID to find ancestors for
     * @returns {Array} Array of visible ancestor node objects reachable through hidden paths
     */
    getVisibleAncestorsThroughHidden(nodeId) {
        const result = [];
        const visited = new Set([nodeId]);

        const traverse = (currentId) => {
            const parents = this.getParents(currentId);
            for (const parent of parents) {
                if (visited.has(parent.id)) continue;
                visited.add(parent.id);

                if (this.isNodeVisible(parent.id)) {
                    // Found a visible ancestor - add it to results
                    result.push(parent);
                    // Don't traverse further - we only want the first visible node in each path
                } else {
                    // Parent is hidden, continue traversing upward
                    traverse(parent.id);
                }
            }
        };

        traverse(nodeId);
        return result;
    }

    /**
     * Get all ancestors of a node (for context resolution)
     * Returns nodes in topological order (oldest first)
     * @param {string} nodeId
     * @param {Set} visited
     * @returns {Object[]}
     */
    getAncestors(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const ancestors = [];
        const parents = this.getParents(nodeId);

        for (const parent of parents) {
            ancestors.push(...this.getAncestors(parent.id, visited));
            ancestors.push(parent);
        }

        return ancestors;
    }

    /**
     * Get all ancestor edges (for highlighting context path)
     * @param {string} nodeId
     * @param {Set} visited
     * @returns {Object[]}
     */
    getAncestorEdges(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const edges = [];
        const incoming = this.incomingEdges.get(nodeId) || [];

        for (const edge of incoming) {
            edges.push(edge);
            edges.push(...this.getAncestorEdges(edge.source, visited));
        }

        return edges;
    }

    /**
     * Get all ancestor node IDs for highlighting
     * @param {string[]} nodeIds
     * @returns {Set<string>}
     */
    getAncestorIds(nodeIds) {
        const ancestorIds = new Set();

        for (const nodeId of nodeIds) {
            ancestorIds.add(nodeId);
            const ancestors = this.getAncestors(nodeId);
            for (const ancestor of ancestors) {
                ancestorIds.add(ancestor.id);
            }
        }

        return ancestorIds;
    }

    /**
     * Find root nodes (nodes with no parents)
     * @returns {Object[]}
     */
    getRootNodes() {
        const roots = [];
        this.yNodes.forEach((yNode, id) => {
            const incoming = this.incomingEdges.get(id) || [];
            if (incoming.length === 0) {
                const node = this._extractNode(yNode);
                if (node) roots.push(node);
            }
        });
        return roots;
    }

    /**
     * Find leaf nodes (nodes with no children)
     * @returns {Object[]}
     */
    getLeafNodes() {
        const leaves = [];
        this.yNodes.forEach((yNode, id) => {
            const outgoing = this.outgoingEdges.get(id) || [];
            if (outgoing.length === 0) {
                const node = this._extractNode(yNode);
                if (node) leaves.push(node);
            }
        });
        return leaves;
    }

    // =========================================================================
    // Context Resolution
    // =========================================================================

    /**
     * Resolve context for one or more nodes
     * Returns messages in chronological order, deduplicated
     * @param {string[]} nodeIds
     * @returns {Object[]}
     */
    resolveContext(nodeIds) {
        const allAncestors = new Map();

        // Collect ancestors from all selected nodes
        for (const nodeId of nodeIds) {
            const node = this.getNode(nodeId);
            if (node) {
                allAncestors.set(node.id, node);
            }

            const ancestors = this.getAncestors(nodeId);
            for (const ancestor of ancestors) {
                allAncestors.set(ancestor.id, ancestor);
            }
        }

        // Convert to array and sort by created_at
        const sorted = Array.from(allAncestors.values()).sort((a, b) => a.created_at - b.created_at);

        // Convert to message format for API
        const userTypes = [
            NodeType.HUMAN,
            NodeType.HIGHLIGHT,
            NodeType.NOTE,
            NodeType.IMAGE,
            NodeType.PDF,
            NodeType.FETCH_RESULT,
            NodeType.YOUTUBE,
            NodeType.GIT_REPO,
        ];
        return sorted.map((node) => {
            const msg = {
                role: userTypes.includes(node.type) ? 'user' : 'assistant',
                content: node.content,
                nodeId: node.id,
            };
            if (node.imageData) {
                msg.imageData = node.imageData;
                msg.mimeType = node.mimeType;
            }
            return msg;
        });
    }

    /**
     * Estimate token count for context
     * @param {string[]} nodeIds
     * @returns {number}
     */
    estimateTokens(nodeIds) {
        const context = this.resolveContext(nodeIds);
        const totalChars = context.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
        return Math.ceil(totalChars / 4);
    }

    // =========================================================================
    // Tag Management
    // =========================================================================

    /**
     * Create or update a tag for a color
     * @param color
     * @param name
     */
    createTag(color, name) {
        if (!TAG_COLORS.includes(color)) {
            throw new Error(`Invalid tag color: ${color}`);
        }

        this.ydoc.transact(() => {
            const yTag = new Y.Map();
            yTag.set('name', name);
            yTag.set('color', color);
            this.yTags.set(color, yTag);
        }, 'local'); // Mark as local change
        this.emit('tagCreated', { color, name });
    }

    /**
     * Update a tag's name
     * @param color
     * @param name
     */
    updateTag(color, name) {
        const yTag = this.yTags.get(color);
        if (yTag && isYMap(yTag)) {
            yTag.set('name', name);
            this.emit('tagUpdated', { color, name });
        }
    }

    /**
     * Delete a tag and remove it from all nodes
     * @param color
     */
    deleteTag(color) {
        const affectedNodeIds = [];

        this.ydoc.transact(() => {
            this.yTags.delete(color);

            // Remove from all nodes and collect affected node IDs
            this.yNodes.forEach((yNode, nodeId) => {
                const yTags = yNode.get('tags');
                if (isYArray(yTags)) {
                    const tags = yTags.toArray();
                    const index = tags.indexOf(color);
                    if (index !== -1) {
                        yTags.delete(index);
                        affectedNodeIds.push(nodeId);
                    }
                }
            });
        }, 'local'); // Mark as local change

        // Emit nodeUpdated for each affected node so canvas re-renders
        for (const nodeId of affectedNodeIds) {
            this.emit('nodeUpdated', this.getNode(nodeId));
        }
        this.emit('tagDeleted', { color });
    }

    /**
     * Get a tag by color
     * @param {string} color
     * @returns {Object|null}
     */
    getTag(color) {
        const yTag = this.yTags.get(color);
        if (!yTag || !isYMap(yTag)) return null;
        return {
            name: yTag.get('name'),
            color: yTag.get('color'),
        };
    }

    /**
     * Get all defined tags
     * @returns {Object}
     */
    getAllTags() {
        const tags = {};
        this.yTags.forEach((yTag, color) => {
            if (isYMap(yTag)) {
                tags[color] = {
                    name: yTag.get('name'),
                    color: yTag.get('color'),
                };
            }
        });
        return tags;
    }

    /**
     * Add a tag to a node
     * @param nodeId
     * @param color
     */
    addTagToNode(nodeId, color) {
        const yNode = this.yNodes.get(nodeId);

        if (!yNode) {
            console.warn('[CRDTGraph] addTagToNode: node not found:', nodeId);
            return;
        }
        if (!this.yTags.has(color)) {
            console.warn('[CRDTGraph] addTagToNode: tag not found:', color);
            return;
        }

        this.ydoc.transact(() => {
            let yTags = yNode.get('tags');
            if (!isYArray(yTags)) {
                yTags = new Y.Array();
                yNode.set('tags', yTags);
            }

            const tags = yTags.toArray();
            if (!tags.includes(color)) {
                yTags.push([color]);
            }
        }, 'local'); // Mark as local change
        this.emit('nodeUpdated', this.getNode(nodeId));
    }

    /**
     * Remove a tag from a node
     * @param nodeId
     * @param color
     */
    removeTagFromNode(nodeId, color) {
        const yNode = this.yNodes.get(nodeId);
        if (!yNode) return;

        const yTags = yNode.get('tags');
        if (isYArray(yTags)) {
            const tags = yTags.toArray();
            const index = tags.indexOf(color);
            if (index !== -1) {
                yTags.delete(index);
            }
        }
        this.emit('nodeUpdated', this.getNode(nodeId));
    }

    /**
     * Check if a node has a tag
     * @param {string} nodeId
     * @param {string} color
     * @returns {boolean}
     */
    nodeHasTag(nodeId, color) {
        const node = this.getNode(nodeId);
        return node && node.tags && node.tags.includes(color);
    }

    // =========================================================================
    // Layout Algorithms (delegated to shared functions)
    // =========================================================================

    /**
     * Auto-position a new node relative to its parents, avoiding overlaps
     * @param {string[]} parentIds
     * @returns {Object}
     */
    autoPosition(parentIds) {
        const NODE_WIDTH = 420;
        const NODE_HEIGHT = 200;
        const HORIZONTAL_GAP = 80;
        const VERTICAL_GAP = 30;

        let initialX, initialY;

        if (parentIds.length === 0) {
            initialX = 100;
            initialY = 100;
        } else {
            const parents = parentIds.map((id) => this.getNode(id)).filter(Boolean);

            if (parents.length === 1) {
                const parent = parents[0];
                const parentWidth = parent.width || NODE_WIDTH;
                initialX = parent.position.x + parentWidth + HORIZONTAL_GAP;
                initialY = parent.position.y;
            } else {
                const rightmost = parents.reduce((max, p) => {
                    const pRight = p.position.x + (p.width || NODE_WIDTH);
                    const maxRight = max.position.x + (max.width || NODE_WIDTH);
                    return pRight > maxRight ? p : max;
                }, parents[0]);
                const avgY = parents.reduce((sum, p) => sum + p.position.y, 0) / parents.length;

                initialX = rightmost.position.x + (rightmost.width || NODE_WIDTH) + HORIZONTAL_GAP;
                initialY = avgY;
            }
        }

        const candidatePos = { x: initialX, y: initialY };
        const allNodes = this.getAllNodes();

        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts && wouldOverlapNodes(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
            candidatePos.y += NODE_HEIGHT + VERTICAL_GAP;
            attempts++;
        }

        if (wouldOverlapNodes(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
            candidatePos.x += NODE_WIDTH + HORIZONTAL_GAP;
            candidatePos.y = initialY;

            attempts = 0;
            while (attempts < maxAttempts && wouldOverlapNodes(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
                candidatePos.y += NODE_HEIGHT + VERTICAL_GAP;
                attempts++;
            }
        }

        return candidatePos;
    }

    /**
     * Check if a position would overlap with existing nodes
     * @param {Object} pos
     * @param {number} width
     * @param {number} height
     * @param {Object[]} nodes
     * @returns {boolean}
     */
    wouldOverlap(pos, width, height, nodes) {
        return wouldOverlapNodes(pos, width, height, nodes);
    }

    /**
     * Topological sort using Kahn's algorithm
     * @returns {Object[]}
     */
    topologicalSort() {
        const allNodes = this.getAllNodes();
        const inDegree = new Map();
        const result = [];
        const resultIds = new Set(); // Track by ID to avoid duplicates

        for (const node of allNodes) {
            const incoming = this.incomingEdges.get(node.id) || [];
            inDegree.set(node.id, incoming.length);
        }

        const queue = allNodes.filter((n) => inDegree.get(n.id) === 0);
        queue.sort((a, b) => a.created_at - b.created_at);

        while (queue.length > 0) {
            const node = queue.shift();
            if (!resultIds.has(node.id)) {
                result.push(node);
                resultIds.add(node.id);
            }

            const children = this.getChildren(node.id);
            children.sort((a, b) => a.created_at - b.created_at);

            for (const child of children) {
                const newDegree = inDegree.get(child.id) - 1;
                inDegree.set(child.id, newDegree);
                if (newDegree === 0 && !resultIds.has(child.id)) {
                    queue.push(child);
                }
            }
        }

        // Add any remaining nodes (disconnected components)
        for (const node of allNodes) {
            if (!resultIds.has(node.id)) {
                result.push(node);
                resultIds.add(node.id);
            }
        }

        return result;
    }

    /**
     * Auto-layout all nodes using topological sort and greedy placement
     * @param dimensions
     */
    autoLayout(dimensions = new Map()) {
        const DEFAULT_WIDTH = 420;
        const DEFAULT_HEIGHT = 220;
        const HORIZONTAL_GAP = 120;
        const VERTICAL_GAP = 40;
        const START_X = 100;
        const START_Y = 100;

        const allNodes = this.getAllNodes();
        if (allNodes.length === 0) return;

        const getNodeSize = (node) => {
            const dim = dimensions.get(node.id);
            if (dim) return { width: dim.width, height: dim.height };
            return { width: node.width || DEFAULT_WIDTH, height: node.height || DEFAULT_HEIGHT };
        };

        const sorted = this.topologicalSort();

        const layers = new Map();
        for (const node of sorted) {
            const parents = this.getParents(node.id);
            if (parents.length === 0) {
                layers.set(node.id, 0);
            } else {
                const maxParentLayer = Math.max(...parents.map((p) => layers.get(p.id) || 0));
                layers.set(node.id, maxParentLayer + 1);
            }
        }

        const layerMaxWidth = new Map();
        for (const node of sorted) {
            const layer = layers.get(node.id);
            const { width } = getNodeSize(node);
            const current = layerMaxWidth.get(layer) || 0;
            layerMaxWidth.set(layer, Math.max(current, width));
        }

        const layerX = new Map();
        let currentX = START_X;
        const maxLayer = Math.max(...layers.values());
        for (let l = 0; l <= maxLayer; l++) {
            layerX.set(l, currentX);
            currentX += (layerMaxWidth.get(l) || DEFAULT_WIDTH) + HORIZONTAL_GAP;
        }

        // Track positioned nodes with their NEW positions (not stale graph positions)
        const positioned = [];
        const newPositions = new Map(); // nodeId -> { x, y }

        for (const node of sorted) {
            const layer = layers.get(node.id);
            const x = layerX.get(layer);
            const { width: nodeWidth, height: nodeHeight } = getNodeSize(node);

            let idealY = START_Y;
            const parents = this.getParents(node.id);
            if (parents.length > 0) {
                // Use NEW positions from this layout run, not stale graph positions
                const parentYs = parents.map((p) => {
                    const newPos = newPositions.get(p.id);
                    return newPos ? newPos.y : START_Y;
                });
                idealY = parentYs.reduce((sum, y) => sum + y, 0) / parentYs.length;
            }

            let y = idealY;
            let foundPosition = false;

            const searchOffsets = [0];
            for (let i = 1; i <= 30; i++) {
                searchOffsets.push(i * (DEFAULT_HEIGHT / 2 + VERTICAL_GAP));
                searchOffsets.push(-i * (DEFAULT_HEIGHT / 2 + VERTICAL_GAP));
            }

            for (const offset of searchOffsets) {
                const testY = Math.max(START_Y, idealY + offset);

                let hasOverlap = false;
                for (const pos of positioned) {
                    const horizontalOverlap = !(x + nodeWidth + 20 < pos.x || x > pos.x + pos.width + 20);
                    const verticalOverlap = !(
                        testY + nodeHeight + VERTICAL_GAP < pos.y || testY > pos.y + pos.height + VERTICAL_GAP
                    );

                    if (horizontalOverlap && verticalOverlap) {
                        hasOverlap = true;
                        break;
                    }
                }

                if (!hasOverlap) {
                    y = testY;
                    foundPosition = true;
                    break;
                }
            }

            if (!foundPosition) {
                const maxY = positioned.reduce((max, pos) => Math.max(max, pos.y + pos.height), START_Y);
                y = maxY + VERTICAL_GAP;
            }

            // Store new position for child nodes to reference
            newPositions.set(node.id, { x, y });

            // Update node position in CRDT
            this.updateNode(node.id, { position: { x, y } });
            positioned.push({ x, y, width: nodeWidth, height: nodeHeight });
        }
    }

    /**
     * Force-directed layout
     * @param dimensions
     */
    forceDirectedLayout(dimensions = new Map()) {
        const DEFAULT_WIDTH = 420;
        const DEFAULT_HEIGHT = 220;
        const ITERATIONS = 100;
        const REPULSION = 50000;
        const ATTRACTION = 0.05;
        const DAMPING = 0.85;
        const PADDING = 40;
        const IDEAL_EDGE_LENGTH = 100;

        const allNodes = this.getAllNodes();
        if (allNodes.length === 0) return;

        const getNodeSize = (node) => {
            const dim = dimensions.get(node.id);
            if (dim) return { width: dim.width, height: dim.height };
            return { width: node.width || DEFAULT_WIDTH, height: node.height || DEFAULT_HEIGHT };
        };

        // Use a positions map to track positions during iterations
        // This avoids issues with getChildren/getParents returning stale positions
        const positions = new Map();
        const velocities = new Map();
        for (const node of allNodes) {
            positions.set(node.id, { ...node.position });
            velocities.set(node.id, { x: 0, y: 0 });
        }

        // Initialize unpositioned nodes in a grid
        const unpositioned = allNodes.filter((n) => {
            const pos = positions.get(n.id);
            return !pos || (pos.x === 0 && pos.y === 0);
        });
        if (unpositioned.length > 0) {
            const cols = Math.ceil(Math.sqrt(allNodes.length));
            allNodes.forEach((node, i) => {
                const pos = positions.get(node.id);
                if (!pos || (pos.x === 0 && pos.y === 0)) {
                    positions.set(node.id, {
                        x: 200 + (i % cols) * 400,
                        y: 200 + Math.floor(i / cols) * 300,
                    });
                }
            });
        }

        // Helper to get position from our tracking map
        const getPos = (nodeId) => positions.get(nodeId);

        for (let iter = 0; iter < ITERATIONS; iter++) {
            const forces = new Map();
            for (const node of allNodes) {
                forces.set(node.id, { x: 0, y: 0 });
            }

            // Repulsion between all pairs
            for (let i = 0; i < allNodes.length; i++) {
                for (let j = i + 1; j < allNodes.length; j++) {
                    const nodeA = allNodes[i];
                    const nodeB = allNodes[j];
                    const sizeA = getNodeSize(nodeA);
                    const sizeB = getNodeSize(nodeB);
                    const posA = getPos(nodeA.id);
                    const posB = getPos(nodeB.id);

                    const centerAx = posA.x + sizeA.width / 2;
                    const centerAy = posA.y + sizeA.height / 2;
                    const centerBx = posB.x + sizeB.width / 2;
                    const centerBy = posB.y + sizeB.height / 2;

                    const dx = centerBx - centerAx;
                    const dy = centerBy - centerAy;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                    const aLeft = posA.x - PADDING;
                    const aRight = posA.x + sizeA.width + PADDING;
                    const aTop = posA.y - PADDING;
                    const aBottom = posA.y + sizeA.height + PADDING;

                    const bLeft = posB.x - PADDING;
                    const bRight = posB.x + sizeB.width + PADDING;
                    const bTop = posB.y - PADDING;
                    const bBottom = posB.y + sizeB.height + PADDING;

                    const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
                    const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);
                    const isOverlapping = overlapX > 0 && overlapY > 0;

                    const force = REPULSION / (distance * distance);
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    forces.get(nodeA.id).x -= fx;
                    forces.get(nodeA.id).y -= fy;
                    forces.get(nodeB.id).x += fx;
                    forces.get(nodeB.id).y += fy;

                    if (isOverlapping) {
                        const overlapForce = Math.min(overlapX, overlapY) * 5;
                        const ofx = (dx / distance) * overlapForce;
                        const ofy = (dy / distance) * overlapForce;
                        forces.get(nodeA.id).x -= ofx;
                        forces.get(nodeA.id).y -= ofy;
                        forces.get(nodeB.id).x += ofx;
                        forces.get(nodeB.id).y += ofy;
                    }
                }
            }

            // Attraction along edges
            for (const node of allNodes) {
                const children = this.getChildren(node.id);
                const parents = this.getParents(node.id);
                const connectedIds = [...children.map((c) => c.id), ...parents.map((p) => p.id)];

                for (const otherId of connectedIds) {
                    const otherNode = allNodes.find((n) => n.id === otherId);
                    if (!otherNode) continue;

                    const sizeA = getNodeSize(node);
                    const sizeB = getNodeSize(otherNode);
                    const posA = getPos(node.id);
                    const posB = getPos(otherId);

                    const centerAx = posA.x + sizeA.width / 2;
                    const centerAy = posA.y + sizeA.height / 2;
                    const centerBx = posB.x + sizeB.width / 2;
                    const centerBy = posB.y + sizeB.height / 2;

                    const dx = centerBx - centerAx;
                    const dy = centerBy - centerAy;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                    const minSafeDistance = Math.max(
                        (sizeA.width + sizeB.width) / 2 + PADDING,
                        (sizeA.height + sizeB.height) / 2 + PADDING
                    );
                    const idealDistance = minSafeDistance + IDEAL_EDGE_LENGTH;

                    const displacement = distance - idealDistance;
                    const force = ATTRACTION * displacement;
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    forces.get(node.id).x += fx;
                    forces.get(node.id).y += fy;
                }
            }

            // Apply forces with velocity and damping
            for (const node of allNodes) {
                const vel = velocities.get(node.id);
                const force = forces.get(node.id);
                const pos = getPos(node.id);

                vel.x = (vel.x + force.x) * DAMPING;
                vel.y = (vel.y + force.y) * DAMPING;

                const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                if (speed > 50) {
                    vel.x = (vel.x / speed) * 50;
                    vel.y = (vel.y / speed) * 50;
                }

                pos.x += vel.x;
                pos.y += vel.y;
            }
        }

        // Normalize to start at (100, 100)
        let minX = Infinity,
            minY = Infinity;
        for (const node of allNodes) {
            const pos = getPos(node.id);
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
        }
        for (const node of allNodes) {
            const pos = getPos(node.id);
            pos.x = pos.x - minX + 100;
            pos.y = pos.y - minY + 100;
            // Update node object for resolveOverlaps
            node.position = { ...pos };
        }

        this.resolveOverlaps(allNodes, dimensions);

        // Persist positions to CRDT
        for (const node of allNodes) {
            this.updateNode(node.id, { position: node.position });
        }
    }

    /**
     * Resolve overlapping nodes.
     * Delegates to the pure function from layout.js.
     * @param nodes
     * @param dimensions
     */
    resolveOverlaps(nodes, dimensions = new Map()) {
        resolveOverlaps(nodes, 40, 50, dimensions);
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    /**
     * Check if graph is empty
     * @returns {boolean}
     */
    isEmpty() {
        return this.yNodes.size === 0;
    }

    /**
     * Serialize graph to JSON-compatible object
     * @returns {Object}
     */
    toJSON() {
        return {
            nodes: this.getAllNodes(),
            edges: this.getAllEdges(),
            tags: this.getAllTags(),
        };
    }
}

export { CRDTGraph };
