/**
 * Blob Store Utilities
 *
 * Provides utilities for working with the blob store from plugins and features.
 * Handles the decision of whether to use blob store vs inline storage.
 *
 * @module blob-store-utils
 */

import { BlobStoreRegistry, ServerBlobStore, IndexedDBBlobStore } from './blob-store.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default configuration for blob store usage
 * @type {Object}
 */
const DEFAULT_CONFIG = {
    /**
     * Threshold in bytes - files larger than this use blob store.
     * Default 100KB - reasonable for images that might bloat the graph.
     */
    sizeThreshold: 100 * 1024,

    /**
     * Whether to prefer server storage over client-side IndexedDB.
     * Server storage enables sharing and persistence across devices.
     */
    preferServer: true,

    /**
     * File types that should always use blob store (regardless of size)
     */
    alwaysUseBlobStore: ['application/pdf', 'video/*', 'audio/*'],

    /**
     * File types that should never use blob store (always inline)
     */
    neverUseBlobStore: [],
};

let _config = { ...DEFAULT_CONFIG };

/**
 * Configure blob store behavior
 * @param {Partial<typeof DEFAULT_CONFIG>} config
 */
export function configureBlobStore(config) {
    _config = { ...DEFAULT_CONFIG, ...config };
}

/**
 * Get current blob store configuration
 * @returns {typeof DEFAULT_CONFIG}
 */
export function getBlobStoreConfig() {
    return { ..._config };
}

// =============================================================================
// Blob Store Selection
// =============================================================================

/**
 * Initialize the appropriate blob store based on configuration
 * @param {Object} options
 * @param {boolean} [options.preferServer=true] - Prefer server-side storage
 * @param {string} [options.baseUrl='/api/blobs'] - Server blob API URL
 * @returns {Promise<import('./blob-store.js').BlobStore>}
 */
export async function initializeBlobStore(options = {}) {
    const { preferServer = _config.preferServer, baseUrl = '/api/blobs' } = options;

    const registry = BlobStoreRegistry.getInstance();

    if (preferServer) {
        // Check if server blob API is available
        try {
            const response = await fetch(`${baseUrl}/stats`, { method: 'GET' });
            if (response.ok) {
                const serverStore = new ServerBlobStore(baseUrl);
                registry.registerStore(serverStore, true);
                console.log('[BlobStore] Using server-side storage');
                return serverStore;
            }
        } catch {
            console.log('[BlobStore] Server storage unavailable, falling back to IndexedDB');
        }
    }

    // Fall back to IndexedDB
    const indexedDBStore = new IndexedDBBlobStore('canvas-chat-blobs', 'blobs');
    await indexedDBStore.initialize();
    registry.registerStore(indexedDBStore, true);
    console.log('[BlobStore] Using IndexedDB storage');
    return indexedDBStore;
}

/**
 * Get the active blob store (initializing if needed)
 * @returns {Promise<import('./blob-store.js').BlobStore>}
 */
export async function getBlobStore() {
    const registry = BlobStoreRegistry.getInstance();
    let store = registry.getActiveStore();

    if (!store) {
        store = await initializeBlobStore();
    }

    return store;
}

// =============================================================================
// Decision Logic
// =============================================================================

/**
 * Check if a file matches a MIME pattern (supports wildcards like "image/*")
 * @param {string} mimeType
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesMimePattern(mimeType, pattern) {
    if (pattern === '*/*' || pattern === '*') return true;
    if (pattern === mimeType) return true;

    const patternParts = pattern.split('/');
    const typeParts = mimeType.split('/');

    if (patternParts[0] === '*' || patternParts[0] === typeParts[0]) {
        if (patternParts[1] === '*' || patternParts[1] === typeParts[1]) {
            return true;
        }
    }

    return false;
}

/**
 * Determine whether a file should use blob store or inline storage
 * @param {File|Blob} file - The file to check
 * @param {Object} [options] - Override options
 * @returns {{ useBlobStore: boolean, reason: string }}
 */
export function shouldUseBlobStore(file, options = {}) {
    const config = { ..._config, ...options };
    const mimeType = file.type || 'application/octet-stream';
    const size = file.size;

    // Check "never use" list first
    for (const pattern of config.neverUseBlobStore) {
        if (matchesMimePattern(mimeType, pattern)) {
            return { useBlobStore: false, reason: `MIME type ${mimeType} is configured for inline storage` };
        }
    }

    // Check "always use" list
    for (const pattern of config.alwaysUseBlobStore) {
        if (matchesMimePattern(mimeType, pattern)) {
            return { useBlobStore: true, reason: `MIME type ${mimeType} always uses blob store` };
        }
    }

    // Check size threshold
    if (size > config.sizeThreshold) {
        return {
            useBlobStore: true,
            reason: `Size ${(size / 1024).toFixed(1)}KB exceeds threshold ${(config.sizeThreshold / 1024).toFixed(1)}KB`,
        };
    }

    return { useBlobStore: false, reason: `Size ${(size / 1024).toFixed(1)}KB is within threshold` };
}

// =============================================================================
// Storage Operations
// =============================================================================

/**
 * Store file data, using blob store or returning inline based on configuration
 *
 * @param {File|Blob} file - The file to store
 * @param {Object} [options]
 * @param {boolean} [options.forceInline] - Force inline storage
 * @param {boolean} [options.forceBlobStore] - Force blob store
 * @param {Object} [options.metadata] - Additional metadata to store
 * @returns {Promise<{ type: 'blob'|'inline', blobId?: string, data?: string, mimeType: string, size: number }>}
 */
export async function storeFileData(file, options = {}) {
    const mimeType = file.type || 'application/octet-stream';
    const size = file.size;

    // Determine storage method
    let useBlobStore = false;
    if (options.forceInline) {
        useBlobStore = false;
    } else if (options.forceBlobStore) {
        useBlobStore = true;
    } else {
        useBlobStore = shouldUseBlobStore(file, options).useBlobStore;
    }

    if (useBlobStore) {
        // Store in blob store
        const store = await getBlobStore();
        const result = await store.store(file, {
            filename: file.name || 'blob',
            mimeType,
            metadata: options.metadata,
        });

        return {
            type: 'blob',
            blobId: result.id,
            mimeType,
            size,
        };
    } else {
        // Store inline as base64
        const base64 = await fileToBase64(file);

        return {
            type: 'inline',
            data: base64,
            mimeType,
            size,
        };
    }
}

/**
 * Retrieve file data from blob store or decode inline data
 *
 * @param {Object} reference - Storage reference from storeFileData()
 * @param {string} reference.type - 'blob' or 'inline'
 * @param {string} [reference.blobId] - Blob ID (if type='blob')
 * @param {string} [reference.data] - Base64 data (if type='inline')
 * @param {string} reference.mimeType - MIME type
 * @returns {Promise<{ data: ArrayBuffer, mimeType: string, url?: string }>}
 */
export async function retrieveFileData(reference) {
    if (reference.type === 'blob') {
        const store = await getBlobStore();
        const result = await store.retrieve(reference.blobId);

        return {
            data: result.data,
            mimeType: reference.mimeType,
            // Create URL for display
            url: URL.createObjectURL(new Blob([result.data], { type: reference.mimeType })),
        };
    } else {
        // Decode inline base64
        const binaryString = atob(reference.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return {
            data: bytes.buffer,
            mimeType: reference.mimeType,
            url: `data:${reference.mimeType};base64,${reference.data}`,
        };
    }
}

/**
 * Get a display URL for stored data (data URL or blob URL)
 *
 * @param {Object} reference - Storage reference from storeFileData()
 * @returns {Promise<string>} URL suitable for img src, video src, etc.
 */
export async function getDisplayUrl(reference) {
    if (reference.type === 'inline') {
        return `data:${reference.mimeType};base64,${reference.data}`;
    }

    // For blob store, try to get a URL
    const store = await getBlobStore();

    // Try signed URL first (for S3-like backends)
    const url = await store.createUrl(reference.blobId);
    if (url) {
        return url;
    }

    // Fall back to retrieving data and creating object URL
    const result = await store.retrieve(reference.blobId);
    return URL.createObjectURL(new Blob([result.data], { type: reference.mimeType }));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a File/Blob to base64 string
 * @param {File|Blob} file
 * @returns {Promise<string>} Base64 encoded data (without data URL prefix)
 */
export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = /** @type {string} */ (reader.result);
            // Extract base64 part from data URL
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Convert base64 string to Blob
 * @param {string} base64
 * @param {string} mimeType
 * @returns {Blob}
 */
export function base64ToBlob(base64, mimeType) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

// =============================================================================
// Node Integration Helpers
// =============================================================================

/**
 * Create storage metadata for a node
 * This should be stored in the node's data to support both inline and blob storage.
 *
 * @param {Object} storageResult - Result from storeFileData()
 * @returns {Object} Node storage metadata
 */
export function createNodeStorageMetadata(storageResult) {
    if (storageResult.type === 'blob') {
        return {
            storageType: 'blob',
            blobId: storageResult.blobId,
            mimeType: storageResult.mimeType,
            size: storageResult.size,
        };
    } else {
        return {
            storageType: 'inline',
            data: storageResult.data,
            mimeType: storageResult.mimeType,
            size: storageResult.size,
        };
    }
}

/**
 * Get file data from node storage metadata
 *
 * @param {Object} node - Node with storage metadata
 * @returns {Promise<{ url: string, mimeType: string }>}
 */
export async function getNodeFileData(node) {
    // Check new storage format first
    if (node.storageType === 'blob' && node.blobId) {
        return await getDisplayUrl({
            type: 'blob',
            blobId: node.blobId,
            mimeType: node.mimeType,
        }).then((url) => ({ url, mimeType: node.mimeType }));
    }

    if (node.storageType === 'inline' && node.data) {
        return {
            url: `data:${node.mimeType};base64,${node.data}`,
            mimeType: node.mimeType,
        };
    }

    // Fall back to legacy format (imageData field for images)
    if (node.imageData) {
        return {
            url: `data:${node.mimeType || 'image/png'};base64,${node.imageData}`,
            mimeType: node.mimeType || 'image/png',
        };
    }

    // Fall back to pdfData for PDFs
    if (node.pdfData) {
        return {
            url: `data:application/pdf;base64,${node.pdfData}`,
            mimeType: 'application/pdf',
        };
    }

    throw new Error('No file data found in node');
}

// =============================================================================
// Cleanup Operations
// =============================================================================

/**
 * Delete blob(s) associated with a node
 * Should be called BEFORE the node is removed from the graph.
 *
 * @param {Object} node - Node to clean up blobs for
 * @returns {Promise<{ deleted: string[], errors: string[] }>}
 */
export async function deleteNodeBlobs(node) {
    const deleted = [];
    const errors = [];

    if (!node) return { deleted, errors };

    // Collect all blob references from the node
    const blobRefs = [];

    // Check new storage format
    if (node.blobRef) {
        blobRefs.push(node.blobRef);
    }
    if (node.blobId) {
        blobRefs.push(node.blobId);
    }

    // Check metadata for blob references
    if (node.metadata?.blobRef) {
        blobRefs.push(node.metadata.blobRef);
    }

    // Check for multiple attachments (future support)
    if (node.attachments && Array.isArray(node.attachments)) {
        for (const attachment of node.attachments) {
            if (attachment.blobRef) {
                blobRefs.push(attachment.blobRef);
            }
        }
    }

    // Deduplicate
    const uniqueBlobRefs = [...new Set(blobRefs)];

    if (uniqueBlobRefs.length === 0) {
        return { deleted, errors };
    }

    // Get blob store and delete each
    try {
        const store = await getBlobStore();

        for (const blobRef of uniqueBlobRefs) {
            try {
                await store.delete(blobRef);
                deleted.push(blobRef);
                console.log(`[BlobStore] Deleted blob: ${blobRef}`);
            } catch (err) {
                // Log but don't fail - blob might not exist
                console.warn(`[BlobStore] Failed to delete blob ${blobRef}:`, err.message);
                errors.push(blobRef);
            }
        }
    } catch (err) {
        console.warn('[BlobStore] Blob store unavailable for cleanup:', err.message);
    }

    return { deleted, errors };
}

/**
 * Delete blobs for multiple nodes
 *
 * @param {Object[]} nodes - Nodes to clean up blobs for
 * @returns {Promise<{ deleted: string[], errors: string[] }>}
 */
export async function deleteNodesBlobs(nodes) {
    const allDeleted = [];
    const allErrors = [];

    for (const node of nodes) {
        const { deleted, errors } = await deleteNodeBlobs(node);
        allDeleted.push(...deleted);
        allErrors.push(...errors);
    }

    return { deleted: allDeleted, errors: allErrors };
}

// Export for testing
export { DEFAULT_CONFIG, matchesMimePattern };
