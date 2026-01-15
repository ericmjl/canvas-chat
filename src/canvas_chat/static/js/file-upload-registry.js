/**
 * File Upload Registry - Plugin System for File Type Handlers
 *
 * Enables dynamic registration of file type handlers. Both built-in file types
 * and third-party plugins use this same registration API.
 *
 * Usage:
 *   // Register a custom file type handler
 *   FileUploadRegistry.register({
 *       id: 'word-doc',
 *       mimeTypes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
 *       extensions: ['.doc', '.docx'],
 *       handler: WordDocHandler,
 *       priority: PRIORITY.BUILTIN,
 *   });
 *
 *   // Find handler for a file
 *   const handler = FileUploadRegistry.findHandler(file);
 */

/**
 * Priority levels for file upload handlers (higher priority = checked first)
 */
const PRIORITY = {
    BUILTIN: 100,
    OFFICIAL: 50,
    COMMUNITY: 10,
};

/**
 * File Upload Registry singleton
 * Manages registration and lookup of file type handlers
 */
const FileUploadRegistry = {
    /**
     * Registered file handlers
     * @type {Map<string, FileHandlerConfig>}
     * @private
     */
    _handlers: new Map(),

    /**
     * Register a file type handler
     * @param {FileHandlerConfig} config - Handler configuration
     * @throws {Error} If config invalid or handler already registered
     */
    register(config) {
        // Validate required fields
        if (!config.id) {
            throw new Error('FileUploadRegistry.register: id is required');
        }
        if (!config.handler) {
            throw new Error(`FileUploadRegistry.register: handler is required for "${config.id}"`);
        }
        if (typeof config.handler !== 'function') {
            throw new Error(`FileUploadRegistry.register: handler must be a class for "${config.id}"`);
        }
        if (!config.mimeTypes && !config.extensions) {
            throw new Error(
                `FileUploadRegistry.register: must specify either mimeTypes or extensions for "${config.id}"`
            );
        }

        // Check for duplicate registration
        if (this._handlers.has(config.id)) {
            console.warn(`FileUploadRegistry: Overwriting existing handler "${config.id}"`);
        }

        // Store the config
        this._handlers.set(config.id, {
            id: config.id,
            handler: config.handler,
            mimeTypes: config.mimeTypes || [],
            extensions: config.extensions || [],
            priority: config.priority || PRIORITY.COMMUNITY,
        });

        console.log(`[FileUploadRegistry] Registered file handler: ${config.id}`);
    },

    /**
     * Find a handler for a given file
     * @param {File} file - The file to find a handler for
     * @returns {FileHandlerConfig|null} The handler config, or null if no handler found
     */
    findHandler(file) {
        // Get all handlers sorted by priority (highest first)
        const handlers = Array.from(this._handlers.values()).sort((a, b) => b.priority - a.priority);

        for (const handlerConfig of handlers) {
            // Check MIME type match
            if (handlerConfig.mimeTypes.length > 0) {
                for (const mimeType of handlerConfig.mimeTypes) {
                    if (file.type === mimeType) {
                        return handlerConfig;
                    }
                    // Support wildcard patterns like "image/*"
                    if (mimeType.endsWith('/*') && file.type.startsWith(mimeType.slice(0, -1))) {
                        return handlerConfig;
                    }
                }
            }

            // Check extension match
            if (handlerConfig.extensions.length > 0) {
                const fileName = file.name.toLowerCase();
                for (const ext of handlerConfig.extensions) {
                    if (fileName.endsWith(ext.toLowerCase())) {
                        return handlerConfig;
                    }
                }
            }
        }

        return null;
    },

    /**
     * Get all registered handlers
     * @returns {FileHandlerConfig[]} Array of all handler configs
     */
    getAllHandlers() {
        return Array.from(this._handlers.values());
    },

    /**
     * Get all accepted MIME types and extensions for file input
     * @returns {string} Comma-separated list for HTML accept attribute
     */
    getAcceptAttribute() {
        const mimeTypes = new Set();
        const extensions = new Set();

        for (const handler of this._handlers.values()) {
            handler.mimeTypes.forEach((m) => mimeTypes.add(m));
            handler.extensions.forEach((e) => extensions.add(e));
        }

        const parts = [];
        mimeTypes.forEach((m) => parts.push(m));
        extensions.forEach((e) => parts.push(e));

        return parts.join(',');
    },
};

export { FileUploadRegistry, PRIORITY };
