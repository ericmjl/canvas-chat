/**
 * Memory Store Interface
 *
 * Memory is a derived layer, not the source of truth.
 * StateStore is authoritative. MemoryStore is derived and query-oriented.
 * Memory may be lossy, summarized, or denormalized.
 */

import { memoryLogger as logger } from './debug-logger.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Memory type categories
 * @typedef {'world'|'experience'|'opinion'} MemoryType
 * - world: Facts about the world (entities, relationships)
 * - experience: What happened (events, interactions, outcomes)
 * - opinion: Beliefs with confidence (learned preferences, assessments)
 */

/**
 * A single memory entry
 * @typedef {Object} Memory
 * @property {string} id - Unique memory identifier
 * @property {string} bankId - Workspace/user/agent scope identifier
 * @property {MemoryType} type - Memory type category
 * @property {string} content - Memory content
 * @property {string[]} sourceRefs - Node/run/event provenance references
 * @property {number} createdAt - Unix timestamp when memory was created
 * @property {number} [confidence] - Confidence score (0-1) for opinion memories
 * @property {Object} [metadata] - Additional metadata
 * @property {number[]} [embedding] - Vector embedding for semantic search
 */

/**
 * Options for retaining a memory
 * @typedef {Object} RetainOptions
 * @property {string} bankId - Memory bank identifier
 * @property {MemoryType} type - Memory type
 * @property {string} content - Memory content
 * @property {string[]} sourceRefs - Provenance references
 * @property {number} [confidence] - Confidence score for opinion memories
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Options for recalling memories
 * @typedef {Object} RecallOptions
 * @property {string} bankId - Memory bank identifier
 * @property {string} [query] - Semantic search query
 * @property {MemoryType[]} [types] - Filter by memory types
 * @property {number} [limit=10] - Maximum number of memories to return
 * @property {number} [minConfidence] - Minimum confidence score (for opinions)
 * @property {number} [since] - Only memories created after this timestamp
 * @property {string[]} [sourceRefs] - Filter by source references
 */

/**
 * Options for reflection
 * @typedef {Object} ReflectOptions
 * @property {string} bankId - Memory bank identifier
 * @property {string} question - Question to answer using memories
 * @property {MemoryType[]} [types] - Memory types to consider
 * @property {number} [limit=20] - Maximum memories to consider
 */

/**
 * Reflection result
 * @typedef {Object} ReflectionResult
 * @property {string} answer - Synthesized answer
 * @property {Memory[]} usedMemories - Memories used to generate the answer
 * @property {number} confidence - Confidence in the answer (0-1)
 */

// =============================================================================
// Memory Type Constants
// =============================================================================

/**
 * Memory type identifiers
 * @type {Object<string, MemoryType>}
 */
const MemoryTypeEnum = {
    WORLD: 'world', // Facts about entities, relationships
    EXPERIENCE: 'experience', // What happened, events, outcomes
    OPINION: 'opinion', // Beliefs, preferences, assessments
};

// =============================================================================
// Memory Store Interface
// =============================================================================

/**
 * Abstract base class for memory stores.
 * Implementations provide retain/recall/reflect semantics.
 *
 * @abstract
 */
class MemoryStore {
    /**
     * @param {string} storeId - Unique store identifier
     */
    constructor(storeId) {
        if (this.constructor === MemoryStore) {
            throw new Error('MemoryStore is abstract and cannot be instantiated directly');
        }
        this.storeId = storeId;
    }

    /**
     * Persist memories derived from runs and artifacts.
     *
     * @param {RetainOptions} options - Memory to retain
     * @returns {Promise<Memory>} The persisted memory
     * @abstract
     */
    async retain(options) {
        throw new Error('retain() must be implemented by subclass');
    }

    /**
     * Retrieve relevant memories using semantic, lexical, temporal, or hybrid search.
     *
     * @param {RecallOptions} options - Recall options
     * @returns {Promise<Memory[]>} Retrieved memories
     * @abstract
     */
    async recall(options) {
        throw new Error('recall() must be implemented by subclass');
    }

    /**
     * Produce synthesized answers or beliefs using recalled memories.
     * This is optional and advanced - MVP implementations may simply
     * return recalled memories and let the agent synthesize.
     *
     * @param {ReflectOptions} options - Reflection options
     * @returns {Promise<ReflectionResult>} Synthesized result
     */
    async reflect(options) {
        // Default implementation: agent-driven reflection
        // Subclasses may override with store-driven reflection
        const memories = await this.recall({
            bankId: options.bankId,
            query: options.question,
            types: options.types,
            limit: options.limit || 20,
        });

        return {
            answer: null, // Agent should synthesize
            usedMemories: memories,
            confidence: 0,
        };
    }

    /**
     * Delete a memory by ID.
     *
     * @param {string} memoryId - Memory to delete
     * @returns {Promise<boolean>} True if deleted
     */
    async delete(memoryId) {
        throw new Error('delete() must be implemented by subclass');
    }

    /**
     * Clear all memories in a bank.
     *
     * @param {string} bankId - Memory bank to clear
     * @returns {Promise<number>} Number of memories deleted
     */
    async clearBank(bankId) {
        throw new Error('clearBank() must be implemented by subclass');
    }
}

// =============================================================================
// In-Memory Store (DAG-as-Memory)
// =============================================================================

/**
 * Simple in-memory store backed by the DAG.
 * This is a lightweight implementation for MVP that stores memories
 * as regular nodes in the graph.
 */
class InMemoryStore extends MemoryStore {
    constructor() {
        super('in-memory');
        /** @type {Map<string, Memory[]>} */
        this.banks = new Map();
        logger.info('InMemoryStore initialized');
    }

    /**
     * Persist a memory.
     * @param {RetainOptions} options
     * @returns {Promise<Memory>}
     */
    async retain(options) {
        logger.enter('InMemoryStore.retain', {
            bankId: options.bankId,
            type: options.type,
            contentLength: options.content?.length,
        });
        logger.timeStart(`retain-${options.type}`);

        const memory = {
            id: crypto.randomUUID(),
            bankId: options.bankId,
            type: options.type,
            content: options.content,
            sourceRefs: options.sourceRefs || [],
            createdAt: Date.now(),
            confidence: options.confidence,
            metadata: options.metadata || {},
            embedding: null, // Would be populated by embedding service
        };

        if (!this.banks.has(options.bankId)) {
            logger.debug(`Creating new memory bank: ${options.bankId}`);
            this.banks.set(options.bankId, []);
        }
        this.banks.get(options.bankId).push(memory);

        const bankSize = this.banks.get(options.bankId).length;
        logger.timeEnd(`retain-${options.type}`);
        logger.info(
            `Memory retained: ${memory.id.slice(0, 8)} (type: ${options.type}, bank: ${options.bankId}, bank size: ${bankSize})`
        );
        logger.exit('InMemoryStore.retain', { memoryId: memory.id });

        return memory;
    }

    /**
     * Recall memories with filtering.
     * @param {RecallOptions} options
     * @returns {Promise<Memory[]>}
     */
    async recall(options) {
        logger.enter('InMemoryStore.recall', {
            bankId: options.bankId,
            query: options.query?.slice(0, 50),
            types: options.types,
            limit: options.limit,
        });
        logger.timeStart('recall');

        const bankMemories = this.banks.get(options.bankId) || [];
        logger.debug(`Bank ${options.bankId} has ${bankMemories.length} total memories`);

        let results = [...bankMemories];
        let filterLog = [];

        // Filter by types
        if (options.types && options.types.length > 0) {
            const beforeCount = results.length;
            results = results.filter((m) => options.types.includes(m.type));
            filterLog.push(`types: ${beforeCount} → ${results.length}`);
        }

        // Filter by confidence
        if (options.minConfidence != null) {
            const beforeCount = results.length;
            results = results.filter((m) => m.confidence == null || m.confidence >= options.minConfidence);
            filterLog.push(`confidence: ${beforeCount} → ${results.length}`);
        }

        // Filter by timestamp
        if (options.since) {
            const beforeCount = results.length;
            results = results.filter((m) => m.createdAt >= options.since);
            filterLog.push(`since: ${beforeCount} → ${results.length}`);
        }

        // Filter by source refs
        if (options.sourceRefs && options.sourceRefs.length > 0) {
            const beforeCount = results.length;
            results = results.filter((m) => m.sourceRefs.some((ref) => options.sourceRefs.includes(ref)));
            filterLog.push(`sourceRefs: ${beforeCount} → ${results.length}`);
        }

        // Simple text-based search (no semantic search in MVP)
        if (options.query) {
            const beforeCount = results.length;
            const queryLower = options.query.toLowerCase();
            results = results.filter((m) => m.content.toLowerCase().includes(queryLower));
            filterLog.push(`query: ${beforeCount} → ${results.length}`);
        }

        if (filterLog.length > 0) {
            logger.debug(`Filter pipeline: ${filterLog.join(' | ')}`);
        }

        // Sort by recency
        results.sort((a, b) => b.createdAt - a.createdAt);

        // Apply limit
        const limit = options.limit || 10;
        const finalResults = results.slice(0, limit);

        logger.timeEnd('recall');
        logger.info(`Recalled ${finalResults.length} memories (limit: ${limit}, filtered from ${bankMemories.length})`);

        if (finalResults.length > 0) {
            logger.table(
                'Recall results',
                finalResults.map((m) => ({
                    id: m.id.slice(0, 8),
                    type: m.type,
                    contentPreview: m.content.slice(0, 40) + (m.content.length > 40 ? '...' : ''),
                    age: `${Math.round((Date.now() - m.createdAt) / 1000)}s ago`,
                }))
            );
        }

        logger.exit('InMemoryStore.recall', { count: finalResults.length });
        return finalResults;
    }

    /**
     * Delete a memory.
     * @param {string} memoryId
     * @returns {Promise<boolean>}
     */
    async delete(memoryId) {
        logger.enter('InMemoryStore.delete', { memoryId });

        for (const [bankId, memories] of this.banks.entries()) {
            const index = memories.findIndex((m) => m.id === memoryId);
            if (index !== -1) {
                memories.splice(index, 1);
                logger.info(`Deleted memory ${memoryId.slice(0, 8)} from bank ${bankId}`);
                logger.exit('InMemoryStore.delete', true);
                return true;
            }
        }

        logger.warn(`Memory not found for deletion: ${memoryId}`);
        logger.exit('InMemoryStore.delete', false);
        return false;
    }

    /**
     * Clear a memory bank.
     * @param {string} bankId
     * @returns {Promise<number>}
     */
    async clearBank(bankId) {
        logger.enter('InMemoryStore.clearBank', { bankId });

        const memories = this.banks.get(bankId);
        if (memories) {
            const count = memories.length;
            this.banks.delete(bankId);
            logger.info(`Cleared bank ${bankId}: ${count} memories deleted`);
            logger.exit('InMemoryStore.clearBank', count);
            return count;
        }

        logger.debug(`Bank ${bankId} not found or already empty`);
        logger.exit('InMemoryStore.clearBank', 0);
        return 0;
    }
}

// =============================================================================
// Memory Store Registry
// =============================================================================

/**
 * Registry for memory store implementations.
 */
class MemoryStoreRegistry {
    constructor() {
        logger.info('MemoryStoreRegistry initializing...');
        /** @type {Map<string, MemoryStore>} */
        this.stores = new Map();
        /** @type {string|null} */
        this.defaultStoreId = null;

        // Register in-memory store by default
        const inMemoryStore = new InMemoryStore();
        this.register(inMemoryStore);
        this.setDefault(inMemoryStore.storeId);
        logger.info('MemoryStoreRegistry initialized with in-memory store as default');
    }

    /**
     * Register a memory store.
     * @param {MemoryStore} store
     */
    register(store) {
        logger.enter('MemoryStoreRegistry.register', { storeId: store.storeId });
        this.stores.set(store.storeId, store);
        logger.info(`Registered memory store: ${store.storeId}`);
        logger.table(
            'Available stores',
            Array.from(this.stores.keys()).map((id) => ({ id, isDefault: id === this.defaultStoreId }))
        );
        logger.exit('MemoryStoreRegistry.register');
    }

    /**
     * Set the default store.
     * @param {string} storeId
     */
    setDefault(storeId) {
        logger.enter('MemoryStoreRegistry.setDefault', { storeId });
        if (!this.stores.has(storeId)) {
            logger.error(`Cannot set default - store not found: ${storeId}`);
            throw new Error(`Memory store not found: ${storeId}`);
        }
        const previousDefault = this.defaultStoreId;
        this.defaultStoreId = storeId;
        logger.stateChange('defaultStore', previousDefault, storeId);
        logger.exit('MemoryStoreRegistry.setDefault');
    }

    /**
     * Get a store by ID.
     * @param {string} [storeId] - Store ID (uses default if not provided)
     * @returns {MemoryStore|null}
     */
    get(storeId = null) {
        const id = storeId || this.defaultStoreId;
        const store = this.stores.get(id) || null;
        if (store) {
            logger.trace(`Retrieved memory store: ${id}${!storeId ? ' (default)' : ''}`);
        } else {
            logger.warn(`Memory store not found: ${id}`);
        }
        return store;
    }

    /**
     * List all registered store IDs.
     * @returns {string[]}
     */
    list() {
        const ids = Array.from(this.stores.keys());
        logger.trace(`Listing memory stores: ${ids.join(', ')}`);
        return ids;
    }
}

// =============================================================================
// Exports
// =============================================================================

export { MemoryTypeEnum, MemoryStore, InMemoryStore, MemoryStoreRegistry };
