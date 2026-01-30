/**
 * Blob Store Interface
 *
 * Abstract interface for storing large binary data (attachments, artifacts).
 * Blobs are referenced by nodes but stored separately for efficiency.
 *
 * @module blob-store
 */

import { createLogger } from './debug-logger.js';

const blobLogger = createLogger('Blob');

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Metadata for a stored blob
 * @typedef {Object} BlobMetadata
 * @property {string} id - Blob identifier
 * @property {string} mimeType - MIME type
 * @property {number} size - Size in bytes
 * @property {string} [filename] - Original filename
 * @property {number} createdAt - Creation timestamp
 * @property {Object} [custom] - Custom metadata
 */

/**
 * Storage stats
 * @typedef {Object} StorageStats
 * @property {number} totalBytes - Total bytes stored
 * @property {number} blobCount - Number of blobs
 * @property {number} [quota] - Storage quota if applicable
 * @property {number} [usage] - Usage percentage
 */

// =============================================================================
// BlobStore Interface
// =============================================================================

/**
 * Abstract interface for blob storage
 * @abstract
 */
class BlobStore {
    /**
     * Store name for logging
     * @type {string}
     */
    get name() {
        return 'BlobStore';
    }

    /**
     * Store a blob
     * @param {Blob|ArrayBuffer|string} data - Blob data
     * @param {Object} options - Storage options
     * @param {string} [options.id] - Optional ID (auto-generated if not provided)
     * @param {string} options.mimeType - MIME type
     * @param {string} [options.filename] - Original filename
     * @param {Object} [options.metadata] - Custom metadata
     * @returns {Promise<BlobMetadata>} Stored blob metadata
     */
    async store(data, options) {
        throw new Error('store not implemented');
    }

    /**
     * Retrieve a blob by ID
     * @param {string} blobId - Blob identifier
     * @returns {Promise<{data: Blob, metadata: BlobMetadata}|null>} Blob and metadata or null
     */
    async retrieve(blobId) {
        throw new Error('retrieve not implemented');
    }

    /**
     * Get blob metadata without retrieving data
     * @param {string} blobId - Blob identifier
     * @returns {Promise<BlobMetadata|null>} Metadata or null
     */
    async getMetadata(blobId) {
        throw new Error('getMetadata not implemented');
    }

    /**
     * Delete a blob
     * @param {string} blobId - Blob identifier
     * @returns {Promise<boolean>} True if deleted
     */
    async delete(blobId) {
        throw new Error('delete not implemented');
    }

    /**
     * Check if a blob exists
     * @param {string} blobId - Blob identifier
     * @returns {Promise<boolean>} True if exists
     */
    async exists(blobId) {
        throw new Error('exists not implemented');
    }

    /**
     * List all blobs with optional filtering
     * @param {Object} [options] - List options
     * @param {string} [options.mimeType] - Filter by MIME type
     * @param {number} [options.limit] - Max results
     * @param {number} [options.offset] - Skip results
     * @returns {Promise<BlobMetadata[]>} Array of blob metadata
     */
    async list(options = {}) {
        throw new Error('list not implemented');
    }

    /**
     * Get storage statistics
     * @returns {Promise<StorageStats>} Storage statistics
     */
    async getStats() {
        throw new Error('getStats not implemented');
    }

    /**
     * Create a URL for accessing the blob
     * @param {string} blobId - Blob identifier
     * @param {Object} [options] - URL options
     * @param {number} [options.expiresIn] - Expiration time in seconds
     * @returns {Promise<string>} Blob URL
     */
    async createUrl(blobId, options = {}) {
        throw new Error('createUrl not implemented');
    }
}

// =============================================================================
// IndexedDB BlobStore Implementation
// =============================================================================

/**
 * BlobStore implementation using IndexedDB
 * Suitable for browser-based storage of large files
 */
class IndexedDBBlobStore extends BlobStore {
    /**
     * @param {string} [dbName='canvas-chat-blobs'] - Database name
     */
    constructor(dbName = 'canvas-chat-blobs') {
        super();
        this.dbName = dbName;
        this.storeName = 'blobs';
        this.db = null;

        blobLogger.debug('IndexedDBBlobStore created', { dbName });
    }

    get name() {
        return 'IndexedDBBlobStore';
    }

    /**
     * Initialize the database
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this.db) return this.db;

        blobLogger.debug('Initializing IndexedDB', { dbName: this.dbName });

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => {
                blobLogger.error('Failed to open IndexedDB', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                blobLogger.debug('IndexedDB initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store with blob ID as key
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('mimeType', 'mimeType', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    blobLogger.debug('Created blob object store');
                }
            };
        });
    }

    async store(data, options) {
        const startTime = Date.now();
        await this.init();

        const id = options.id || crypto.randomUUID();
        let blob;

        // Convert to Blob if needed
        if (data instanceof Blob) {
            blob = data;
        } else if (data instanceof ArrayBuffer) {
            blob = new Blob([data], { type: options.mimeType });
        } else if (typeof data === 'string') {
            blob = new Blob([data], { type: options.mimeType || 'text/plain' });
        } else {
            throw new Error('Unsupported data type');
        }

        const metadata = {
            id,
            mimeType: options.mimeType || blob.type || 'application/octet-stream',
            size: blob.size,
            filename: options.filename || null,
            createdAt: Date.now(),
            custom: options.metadata || {},
        };

        blobLogger.debug('Storing blob', { id, mimeType: metadata.mimeType, size: metadata.size });

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const record = {
                id,
                data: blob,
                metadata,
            };

            const request = store.put(record);

            request.onerror = () => {
                blobLogger.error('Failed to store blob', { id, error: request.error });
                reject(request.error);
            };

            request.onsuccess = () => {
                blobLogger.debug('Blob stored', { id, durationMs: Date.now() - startTime });
                resolve(metadata);
            };
        });
    }

    async retrieve(blobId) {
        await this.init();
        blobLogger.debug('Retrieving blob', { blobId });

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(blobId);

            request.onerror = () => {
                blobLogger.error('Failed to retrieve blob', { blobId, error: request.error });
                reject(request.error);
            };

            request.onsuccess = () => {
                const record = request.result;
                if (!record) {
                    blobLogger.debug('Blob not found', { blobId });
                    resolve(null);
                } else {
                    blobLogger.debug('Blob retrieved', { blobId, size: record.metadata.size });
                    resolve({ data: record.data, metadata: record.metadata });
                }
            };
        });
    }

    async getMetadata(blobId) {
        const result = await this.retrieve(blobId);
        return result?.metadata || null;
    }

    async delete(blobId) {
        await this.init();
        blobLogger.debug('Deleting blob', { blobId });

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(blobId);

            request.onerror = () => {
                blobLogger.error('Failed to delete blob', { blobId, error: request.error });
                reject(request.error);
            };

            request.onsuccess = () => {
                blobLogger.debug('Blob deleted', { blobId });
                resolve(true);
            };
        });
    }

    async exists(blobId) {
        const metadata = await this.getMetadata(blobId);
        return metadata !== null;
    }

    async list(options = {}) {
        await this.init();
        blobLogger.debug('Listing blobs', options);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                let results = request.result.map((r) => r.metadata);

                // Apply filters
                if (options.mimeType) {
                    results = results.filter((m) => m.mimeType === options.mimeType);
                }

                // Sort by createdAt desc
                results.sort((a, b) => b.createdAt - a.createdAt);

                // Apply pagination
                if (options.offset) {
                    results = results.slice(options.offset);
                }
                if (options.limit) {
                    results = results.slice(0, options.limit);
                }

                blobLogger.debug('Listed blobs', { count: results.length });
                resolve(results);
            };
        });
    }

    async getStats() {
        await this.init();
        const allBlobs = await this.list();

        const totalBytes = allBlobs.reduce((sum, b) => sum + b.size, 0);

        // Try to get quota info if available
        let quota = null;
        let usage = null;

        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                quota = estimate.quota;
                usage = estimate.usage / estimate.quota;
            } catch {
                // Quota estimate not available
            }
        }

        return {
            totalBytes,
            blobCount: allBlobs.length,
            quota,
            usage,
        };
    }

    async createUrl(blobId, options = {}) {
        const result = await this.retrieve(blobId);
        if (!result) {
            throw new Error(`Blob not found: ${blobId}`);
        }

        // Create object URL (valid until page unload or revoked)
        return URL.createObjectURL(result.data);
    }
}

// =============================================================================
// Server BlobStore (HTTP backend)
// =============================================================================

/**
 * BlobStore implementation that stores blobs on the Python server.
 * Uses HTTP API endpoints: POST /api/blobs, GET /api/blobs/{id}, DELETE /api/blobs/{id}
 *
 * This is the recommended implementation for:
 * - Persistent storage across browser sessions
 * - Sharing blobs between users/devices
 * - Large file storage with server-side management
 * - Admin-controlled storage with quotas
 */
class ServerBlobStore extends BlobStore {
    /**
     * @param {string} [baseUrl='/api/blobs'] - Base URL for blob API
     */
    constructor(baseUrl = '/api/blobs') {
        super();
        this.baseUrl = baseUrl;
        blobLogger.debug('ServerBlobStore created', { baseUrl });
    }

    get name() {
        return 'ServerBlobStore';
    }

    async store(data, options) {
        const startTime = Date.now();
        const id = options.id || crypto.randomUUID();

        blobLogger.debug('Storing blob on server', {
            id,
            mimeType: options.mimeType,
            filename: options.filename,
        });

        // Create FormData for multipart upload
        const formData = new FormData();

        // Convert data to Blob if needed
        let blob;
        if (data instanceof Blob) {
            blob = data;
        } else if (data instanceof ArrayBuffer) {
            blob = new Blob([data], { type: options.mimeType });
        } else if (typeof data === 'string') {
            blob = new Blob([data], { type: options.mimeType || 'text/plain' });
        } else {
            throw new Error('Unsupported data type');
        }

        formData.append('file', blob, options.filename || 'blob');
        formData.append('id', id);
        formData.append('mimeType', options.mimeType || blob.type || 'application/octet-stream');

        if (options.metadata) {
            formData.append('metadata', JSON.stringify(options.metadata));
        }

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: response.statusText }));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }

            const metadata = await response.json();
            blobLogger.debug('Blob stored on server', {
                id: metadata.id,
                durationMs: Date.now() - startTime,
            });

            return metadata;
        } catch (error) {
            blobLogger.error('Failed to store blob on server', { id, error: error.message });
            throw error;
        }
    }

    async retrieve(blobId) {
        blobLogger.debug('Retrieving blob from server', { blobId });

        try {
            // First get metadata
            const metadataResponse = await fetch(`${this.baseUrl}/${blobId}/metadata`);
            if (!metadataResponse.ok) {
                if (metadataResponse.status === 404) {
                    blobLogger.debug('Blob not found on server', { blobId });
                    return null;
                }
                throw new Error(`HTTP ${metadataResponse.status}`);
            }
            const metadata = await metadataResponse.json();

            // Then get data
            const dataResponse = await fetch(`${this.baseUrl}/${blobId}`);
            if (!dataResponse.ok) {
                throw new Error(`HTTP ${dataResponse.status}`);
            }
            const data = await dataResponse.blob();

            blobLogger.debug('Blob retrieved from server', { blobId, size: metadata.size });
            return { data, metadata };
        } catch (error) {
            blobLogger.error('Failed to retrieve blob from server', { blobId, error: error.message });
            throw error;
        }
    }

    async getMetadata(blobId) {
        blobLogger.debug('Getting blob metadata from server', { blobId });

        try {
            const response = await fetch(`${this.baseUrl}/${blobId}/metadata`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            blobLogger.error('Failed to get blob metadata', { blobId, error: error.message });
            throw error;
        }
    }

    async delete(blobId) {
        blobLogger.debug('Deleting blob from server', { blobId });

        try {
            const response = await fetch(`${this.baseUrl}/${blobId}`, {
                method: 'DELETE',
            });

            if (!response.ok && response.status !== 404) {
                throw new Error(`HTTP ${response.status}`);
            }

            blobLogger.debug('Blob deleted from server', { blobId });
            return response.ok;
        } catch (error) {
            blobLogger.error('Failed to delete blob from server', { blobId, error: error.message });
            throw error;
        }
    }

    async exists(blobId) {
        try {
            const response = await fetch(`${this.baseUrl}/${blobId}/metadata`, {
                method: 'HEAD',
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async list(options = {}) {
        blobLogger.debug('Listing blobs from server', options);

        try {
            const params = new URLSearchParams();
            if (options.mimeType) params.set('mimeType', options.mimeType);
            if (options.limit) params.set('limit', String(options.limit));
            if (options.offset) params.set('offset', String(options.offset));

            const url = params.toString() ? `${this.baseUrl}?${params}` : this.baseUrl;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const results = await response.json();
            blobLogger.debug('Listed blobs from server', { count: results.length });
            return results;
        } catch (error) {
            blobLogger.error('Failed to list blobs from server', { error: error.message });
            throw error;
        }
    }

    async getStats() {
        blobLogger.debug('Getting storage stats from server');

        try {
            const response = await fetch(`${this.baseUrl}/stats`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            blobLogger.error('Failed to get storage stats', { error: error.message });
            throw error;
        }
    }

    async createUrl(blobId, options = {}) {
        // Server provides direct URL to blob
        const url = `${this.baseUrl}/${blobId}`;

        // If expiration is requested, server would need to generate signed URL
        if (options.expiresIn) {
            const response = await fetch(`${this.baseUrl}/${blobId}/signed-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expiresIn: options.expiresIn }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const { url: signedUrl } = await response.json();
            return signedUrl;
        }

        return url;
    }
}

// =============================================================================
// In-Memory BlobStore (for testing)
// =============================================================================

/**
 * In-memory BlobStore for testing and development
 */
class InMemoryBlobStore extends BlobStore {
    constructor() {
        super();
        /** @type {Map<string, {data: Blob, metadata: BlobMetadata}>} */
        this.blobs = new Map();

        blobLogger.debug('InMemoryBlobStore created');
    }

    get name() {
        return 'InMemoryBlobStore';
    }

    async store(data, options) {
        const id = options.id || crypto.randomUUID();
        let blob;

        if (data instanceof Blob) {
            blob = data;
        } else if (data instanceof ArrayBuffer) {
            blob = new Blob([data], { type: options.mimeType });
        } else if (typeof data === 'string') {
            blob = new Blob([data], { type: options.mimeType || 'text/plain' });
        } else {
            throw new Error('Unsupported data type');
        }

        const metadata = {
            id,
            mimeType: options.mimeType || blob.type || 'application/octet-stream',
            size: blob.size,
            filename: options.filename || null,
            createdAt: Date.now(),
            custom: options.metadata || {},
        };

        this.blobs.set(id, { data: blob, metadata });
        blobLogger.debug('Blob stored (in-memory)', { id, size: metadata.size });

        return metadata;
    }

    async retrieve(blobId) {
        return this.blobs.get(blobId) || null;
    }

    async getMetadata(blobId) {
        const blob = this.blobs.get(blobId);
        return blob?.metadata || null;
    }

    async delete(blobId) {
        const existed = this.blobs.has(blobId);
        this.blobs.delete(blobId);
        return existed;
    }

    async exists(blobId) {
        return this.blobs.has(blobId);
    }

    async list(options = {}) {
        let results = Array.from(this.blobs.values()).map((v) => v.metadata);

        if (options.mimeType) {
            results = results.filter((m) => m.mimeType === options.mimeType);
        }

        results.sort((a, b) => b.createdAt - a.createdAt);

        if (options.offset) results = results.slice(options.offset);
        if (options.limit) results = results.slice(0, options.limit);

        return results;
    }

    async getStats() {
        const allBlobs = Array.from(this.blobs.values());
        const totalBytes = allBlobs.reduce((sum, b) => sum + b.metadata.size, 0);

        return {
            totalBytes,
            blobCount: allBlobs.length,
            quota: null,
            usage: null,
        };
    }

    async createUrl(blobId) {
        const blob = this.blobs.get(blobId);
        if (!blob) throw new Error(`Blob not found: ${blobId}`);
        return URL.createObjectURL(blob.data);
    }

    /**
     * Clear all blobs (for testing)
     */
    clear() {
        this.blobs.clear();
    }
}

// =============================================================================
// BlobStore Registry
// =============================================================================

/**
 * Registry for BlobStore implementations
 */
class BlobStoreRegistry {
    constructor() {
        /** @type {Map<string, typeof BlobStore>} */
        this.stores = new Map();
        /** @type {BlobStore|null} */
        this.activeStore = null;

        // Register built-in stores
        this.register('indexeddb', IndexedDBBlobStore);
        this.register('server', ServerBlobStore);
        this.register('memory', InMemoryBlobStore);
    }

    /**
     * Register a BlobStore implementation
     * @param {string} id - Store identifier
     * @param {typeof BlobStore} storeClass - Store class
     */
    register(id, storeClass) {
        blobLogger.debug('BlobStoreRegistry.register', { id });
        this.stores.set(id, storeClass);
    }

    /**
     * Get a registered store class
     * @param {string} id - Store identifier
     * @returns {typeof BlobStore|undefined}
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
     * @param {BlobStore} store - Store instance
     */
    setActive(store) {
        blobLogger.info('BlobStoreRegistry.setActive', { storeName: store.name });
        this.activeStore = store;
    }

    /**
     * Get the active store
     * @returns {BlobStore|null}
     */
    getActive() {
        return this.activeStore;
    }
}

// Global registry instance
const blobStoreRegistry = new BlobStoreRegistry();

// =============================================================================
// Exports
// =============================================================================

export { BlobStore, IndexedDBBlobStore, ServerBlobStore, InMemoryBlobStore, BlobStoreRegistry, blobStoreRegistry };
