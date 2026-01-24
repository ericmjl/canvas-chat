/**
 * Storage module - IndexedDB for sessions, localStorage for settings
 */

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Session stored in IndexedDB
 * @typedef {Object} Session
 * @property {string} id - Session UUID
 * @property {string} name - Session display name
 * @property {Array.<Object>} nodes - Array of nodes (see graph-types.js for Node definition)
 * @property {Array.<Object>} edges - Array of edges (see graph-types.js for Edge definition)
 * @property {Object.<string, {name: string, color: string}>} [tags] - Tag definitions
 * @property {number} created_at - Creation timestamp (Unix ms)
 * @property {number} updated_at - Last update timestamp (Unix ms)
 * @property {number} [imported_at] - Import timestamp (if imported)
 */

/**
 * Exported session file format (.canvaschat)
 * @typedef {Object} ExportedSession
 * @property {string} id - Session UUID
 * @property {string} name - Session display name
 * @property {Array.<Object>} nodes - Array of nodes
 * @property {Array.<Object>} edges - Array of edges
 * @property {Object.<string, {name: string, color: string}>} [tags] - Tag definitions
 * @property {number} created_at - Creation timestamp (Unix ms)
 * @property {number} updated_at - Last update timestamp (Unix ms)
 * @property {number} [imported_at] - Import timestamp (if imported)
 * @property {number} version - Export format version
 * @property {string} exported_at - Export timestamp (ISO string)
 */

/**
 * API keys stored in localStorage
 * @typedef {Object} ApiKeys
 * @property {string} [openai] - OpenAI API key
 * @property {string} [anthropic] - Anthropic API key
 * @property {string} [google] - Google (Gemini) API key
 * @property {string} [groq] - Groq API key
 * @property {string} [github] - GitHub Models API key
 * @property {string} [exa] - Exa search API key
 */

/**
 * GitHub Copilot auth data stored in localStorage
 * @typedef {Object} CopilotAuth
 * @property {string} accessToken - GitHub OAuth access token
 * @property {string} apiKey - Copilot API key
 * @property {number} expiresAt - Unix timestamp (seconds)
 */

/**
 * Custom model configuration
 * @typedef {Object} CustomModel
 * @property {string} id - LiteLLM-compatible model ID (e.g., "openai/gpt-4.1-mini")
 * @property {string} name - Display name
 * @property {string} provider - Always "Custom" for custom models
 * @property {number} context_window - Context window size in tokens
 * @property {string|null} base_url - Per-model base URL (optional)
 */

/**
 * Provider name for API key lookup
 * @typedef {'openai'|'anthropic'|'gemini'|'google'|'groq'|'github'|'github_copilot'|'exa'|'ollama'} ProviderName
 */

// =============================================================================
// Constants
// =============================================================================

const DB_NAME = 'canvas-chat';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const COPILOT_AUTH_KEY = 'canvas-chat-copilot-auth';

/**
 *
 */
class Storage {
    /**
     *
     */
    constructor() {
        this.db = null;
        this.dbReady = this.initDB();
    }

    /**
     * Initialize IndexedDB
     * @returns {Promise<IDBDatabase|null>}
     */
    async initDB() {
        // Check if indexedDB is available (not available in Node.js test environment)
        if (typeof indexedDB === 'undefined') {
            console.warn('[Storage] IndexedDB not available (running in Node.js?)');
            return null;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create sessions store
                if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
                    const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
                    store.createIndex('updated_at', 'updated_at', { unique: false });
                    store.createIndex('name', 'name', { unique: false });
                }
            };
        });
    }

    /**
     * Ensure DB is ready before operations
     * @returns {IDBDatabase}
     */
    async ensureDB() {
        if (!this.db) {
            await this.dbReady;
        }
        return this.db;
    }

    // --- Session Operations ---

    /**
     * Save a session to IndexedDB
     * @param {Session} session
     * @returns {Promise<Session>}
     */
    async saveSession(session) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SESSIONS_STORE, 'readwrite');
            const store = tx.objectStore(SESSIONS_STORE);

            session.updated_at = Date.now();
            const request = store.put(session);

            request.onsuccess = () => resolve(session);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a session by ID
     * @param {string} id
     * @returns {Promise<Session|null>}
     */
    async getSession(id) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SESSIONS_STORE, 'readonly');
            const store = tx.objectStore(SESSIONS_STORE);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * List all sessions, sorted by updated_at descending
     * @returns {Promise<Session[]>}
     */
    async listSessions() {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SESSIONS_STORE, 'readonly');
            const store = tx.objectStore(SESSIONS_STORE);
            const index = store.index('updated_at');
            const request = index.openCursor(null, 'prev');

            const sessions = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    sessions.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(sessions);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a session by ID
     * @param id
     */
    async deleteSession(id) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SESSIONS_STORE, 'readwrite');
            const store = tx.objectStore(SESSIONS_STORE);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // --- Export/Import ---

    /**
     * Export session to JSON file (.canvaschat)
     * @param {Session} session
     * @returns {void}
     */
    exportSession(session) {
        const exportData = {
            version: 1,
            exported_at: new Date().toISOString(),
            ...session,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.name || 'session'}-${Date.now()}.canvaschat`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Import session from .canvaschat file
     * @param {File} file
     * @returns {Promise<Session>}
     */
    async importSession(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);

                    // Validate structure
                    if (!data.nodes || !data.edges) {
                        throw new Error('Invalid .canvaschat file format');
                    }

                    // Generate new ID to avoid conflicts
                    const session = {
                        ...data,
                        id: crypto.randomUUID(),
                        imported_at: Date.now(),
                        updated_at: Date.now(),
                    };

                    await this.saveSession(session);
                    resolve(session);
                } catch (err) {
                    reject(new Error(`Failed to import: ${err.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // --- Settings (localStorage) ---

    /**
     * Get API keys from localStorage
     * @returns {ApiKeys}
     */
    getApiKeys() {
        const keys = localStorage.getItem('canvas-chat-api-keys');
        return keys ? JSON.parse(keys) : {};
    }

    /**
     * Save API keys to localStorage
     * @param keys
     */
    saveApiKeys(keys) {
        localStorage.setItem('canvas-chat-api-keys', JSON.stringify(keys));
    }

    /**
     * Get GitHub Copilot auth data
     * @returns {CopilotAuth|null}
     */
    getCopilotAuth() {
        const auth = localStorage.getItem(COPILOT_AUTH_KEY);
        return auth ? JSON.parse(auth) : null;
    }

    /**
     * Save GitHub Copilot auth data
     * @param {CopilotAuth} auth
     */
    saveCopilotAuth(auth) {
        localStorage.setItem(COPILOT_AUTH_KEY, JSON.stringify(auth));
    }

    /**
     * Clear GitHub Copilot auth data
     */
    clearCopilotAuth() {
        localStorage.removeItem(COPILOT_AUTH_KEY);
    }

    /**
     * Get Copilot API key
     * @returns {string|null}
     */
    getCopilotApiKey() {
        return this.getCopilotAuth()?.apiKey || null;
    }

    /**
     * Get Copilot access token
     * @returns {string|null}
     */
    getCopilotAccessToken() {
        return this.getCopilotAuth()?.accessToken || null;
    }

    /**
     * Get Copilot token expiry timestamp (seconds)
     * @returns {number|null}
     */
    getCopilotExpiresAt() {
        return this.getCopilotAuth()?.expiresAt || null;
    }

    /**
     * Check if Copilot auth is expired
     * @returns {boolean}
     */
    isCopilotAuthExpired() {
        const auth = this.getCopilotAuth();
        if (!auth?.expiresAt) {
            return false;
        }
        return auth.expiresAt <= Math.floor(Date.now() / 1000);
    }

    /**
     * Check if Copilot auth is available and not expired
     * @returns {boolean}
     */
    hasCopilotAuth() {
        const auth = this.getCopilotAuth();
        if (!auth?.apiKey) {
            return false;
        }
        if (this.isCopilotAuthExpired()) {
            return false;
        }
        return true;
    }

    /**
     * Map provider name to storage key name.
     * This is the canonical mapping - all other methods should use this.
     * @param {string} provider - Provider name (e.g., "openai", "gemini", "github_copilot")
     * @returns {string} - Storage key name (e.g., "openai", "google", "github")
     */
    _getStorageKeyForProvider(provider) {
        const providerMap = {
            openai: 'openai',
            anthropic: 'anthropic',
            gemini: 'google',
            google: 'google',
            groq: 'groq',
            github: 'github',
            github_copilot: 'github_copilot',
            exa: 'exa',
        };
        return providerMap[provider.toLowerCase()] || provider.toLowerCase();
    }

    /**
     * Get API key for a specific provider
     * @param {string} provider - Provider name from model ID (e.g., "openai", "gemini")
     * @returns {string|null} - API key or null if not configured
     */
    getApiKeyForProvider(provider) {
        const normalizedProvider = provider.toLowerCase();
        if (normalizedProvider === 'github_copilot') {
            return this.getCopilotApiKey();
        }
        const keys = this.getApiKeys();
        const storageKey = this._getStorageKeyForProvider(provider);
        return keys[storageKey] || null;
    }

    /**
     * Check if any LLM API keys are configured (excludes Exa which is search-only)
     * @returns {boolean} - True if at least one LLM provider key is configured
     */
    hasAnyLLMApiKey() {
        const keys = this.getApiKeys();
        const llmProviders = ['openai', 'anthropic', 'google', 'groq', 'github'];
        const hasStandardKey = llmProviders.some((provider) => keys[provider] && keys[provider].trim() !== '');
        return hasStandardKey || this.hasCopilotAuth();
    }

    /**
     * Build an API keys dict for a list of models.
     * Used by endpoints that need multiple provider keys (e.g., committee).
     * @param {string[]} modelIds - Array of model IDs (e.g., ["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"])
     * @returns {Object} - Dict of {storageKey: apiKey} for models that have keys configured
     */
    getApiKeysForModels(modelIds) {
        const apiKeys = {};
        for (const modelId of modelIds) {
            const provider = modelId.split('/')[0];
            const storageKey = this._getStorageKeyForProvider(provider);
            const key = this.getApiKeyForProvider(provider);
            if (key) {
                apiKeys[storageKey] = key;
            }
        }
        return apiKeys;
    }

    /**
     * Check if a provider has an API key configured or doesn't need one
     * @param {string} provider - Provider name from model registry
     * @returns {boolean} - True if model can be used
     */
    hasApiKeyForProvider(provider) {
        const normalizedProvider = provider.toLowerCase();

        // Ollama is only available on localhost (local models, no API key needed)
        if (normalizedProvider === 'ollama') {
            return this.isLocalhost();
        }

        if (normalizedProvider === 'github_copilot') {
            return this.hasCopilotAuth();
        }

        // Use the canonical mapping to get the storage key
        const storageKey = this._getStorageKeyForProvider(normalizedProvider);
        const keys = this.getApiKeys();
        return !!keys[storageKey];
    }

    /**
     * Check if the app is running on localhost
     * @returns {boolean} - True if running locally
     */
    isLocalhost() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]';
    }

    /**
     * Get list of providers that have API keys configured
     * @returns {string[]} - List of provider names with keys
     */
    getConfiguredProviders() {
        const keys = this.getApiKeys();
        const configured = [];

        // Include Ollama if on localhost
        if (this.isLocalhost()) {
            configured.push('Ollama');
        }

        // Check each provider
        if (keys.openai) configured.push('OpenAI');
        if (keys.anthropic) configured.push('Anthropic');
        if (keys.google) configured.push('Google');
        if (keys.groq) configured.push('Groq');
        if (keys.github) configured.push('GitHub');
        if (this.hasCopilotAuth()) configured.push('GitHub Copilot');

        return configured;
    }

    /**
     * Get Exa API key
     * @returns {string|null}
     */
    getExaApiKey() {
        const keys = this.getApiKeys();
        return keys.exa || null;
    }

    /**
     * Check if Exa API key is configured
     * @returns {boolean} - True if Exa API key is set and non-empty
     */
    hasExaApiKey() {
        const key = this.getExaApiKey();
        return key && key.trim().length > 0;
    }

    /**
     * Get the currently selected model
     * @returns {string}
     */
    getCurrentModel() {
        return localStorage.getItem('canvas-chat-model') || 'openai/gpt-4o-mini';
    }

    /**
     * Save the currently selected model
     * @param model
     */
    setCurrentModel(model) {
        localStorage.setItem('canvas-chat-model', model);
    }

    /**
     * Get the last active session ID
     * @returns {string|null}
     */
    getLastSessionId() {
        return localStorage.getItem('canvas-chat-last-session');
    }

    /**
     * Save the last active session ID
     * @param id
     */
    setLastSessionId(id) {
        localStorage.setItem('canvas-chat-last-session', id);
    }

    /**
     * Get the custom base URL for LLM proxy
     * @returns {string|null}
     */
    getBaseUrl() {
        return localStorage.getItem('canvas-chat-base-url') || null;
    }

    /**
     * Save the custom base URL for LLM proxy
     * @param url
     */
    setBaseUrl(url) {
        if (url) {
            localStorage.setItem('canvas-chat-base-url', url);
        } else {
            localStorage.removeItem('canvas-chat-base-url');
        }
    }

    /**
     * Get recently used models for committee pre-selection
     * @returns {string[]} - Array of model IDs, most recent first
     */
    getRecentModels() {
        const data = localStorage.getItem('canvas-chat-recent-models');
        return data ? JSON.parse(data) : [];
    }

    /**
     * Add a model to the recently used list
     * @param {string} modelId - The model ID to add
     */
    addRecentModel(modelId) {
        const recent = this.getRecentModels();

        // Remove if already exists (will re-add at front)
        const filtered = recent.filter((id) => id !== modelId);

        // Add to front
        filtered.unshift(modelId);

        // Keep only last 10
        const trimmed = filtered.slice(0, 10);

        localStorage.setItem('canvas-chat-recent-models', JSON.stringify(trimmed));
    }

    /**
     * Get flashcard grading strictness level
     * @returns {string} - 'lenient', 'medium', or 'strict' (default: 'medium')
     */
    getFlashcardStrictness() {
        return localStorage.getItem('canvas-chat-flashcard-strictness') || 'medium';
    }

    /**
     * Set flashcard grading strictness level
     * @param {string} value - 'lenient', 'medium', or 'strict'
     */
    setFlashcardStrictness(value) {
        localStorage.setItem('canvas-chat-flashcard-strictness', value);
    }

    // --- Custom Models (localStorage) ---

    /**
     * Model ID validation pattern: provider/model-name
     * Examples: openai/gpt-4.1-mini, ollama_chat/llama3.1, my-proxy/qwen2.5-72b
     */
    static MODEL_ID_PATTERN = /^[a-z0-9_-]+\/[a-z0-9._-]+$/i;

    /**
     * Get user-defined custom models from localStorage
     * @returns {Array<{id: string, name: string, provider: string, context_window: number, base_url: string|null}>}
     */
    getCustomModels() {
        const data = localStorage.getItem('canvas-chat-custom-models');
        return data ? JSON.parse(data) : [];
    }

    /**
     * Save a custom model to localStorage.
     * If a model with the same ID exists, it will be updated.
     * @param {Object} model - Model configuration
     * @param {string} model.id - LiteLLM-compatible model ID (e.g., "openai/gpt-4.1-mini")
     * @param {string} [model.name] - Display name (defaults to model.id)
     * @param {number} [model.context_window] - Context window size (defaults to 128000)
     * @param {string} [model.base_url] - Per-model base URL (defaults to null, uses global)
     * @returns {Object} - The saved model object
     * @throws {Error} - If model ID is invalid
     */
    saveCustomModel(model) {
        // Validate model ID format (provider/model-name)
        if (!model.id || !Storage.MODEL_ID_PATTERN.test(model.id)) {
            throw new Error('Model ID must be in format: provider/model-name');
        }

        const models = this.getCustomModels();

        // Check if model already exists (update) or is new (add)
        const existingIndex = models.findIndex((m) => m.id === model.id);

        const customModel = {
            id: model.id,
            name: model.name || model.id, // Default to ID if no name
            provider: 'Custom',
            context_window: model.context_window || 128000,
            base_url: model.base_url || null,
        };

        if (existingIndex >= 0) {
            models[existingIndex] = customModel;
        } else {
            models.push(customModel);
        }

        localStorage.setItem('canvas-chat-custom-models', JSON.stringify(models));
        return customModel;
    }

    /**
     * Delete a custom model by ID
     * @param {string} modelId - The model ID to delete
     * @returns {boolean} - True if a model was deleted, false if not found
     */
    deleteCustomModel(modelId) {
        const models = this.getCustomModels();
        const filtered = models.filter((m) => m.id !== modelId);
        localStorage.setItem('canvas-chat-custom-models', JSON.stringify(filtered));
        return filtered.length < models.length;
    }

    /**
     * Get base URL for a specific model.
     * Custom models may have per-model base URLs that override the global setting.
     * @param {string} modelId - The model ID
     * @returns {string|null} - Base URL to use, or null if none configured
     */
    getBaseUrlForModel(modelId) {
        // Check if this is a custom model with per-model base_url
        const customModels = this.getCustomModels();
        const customModel = customModels.find((m) => m.id === modelId);

        if (customModel && customModel.base_url) {
            return customModel.base_url;
        }

        // Fall back to global base URL
        return this.getBaseUrl();
    }
}

// Export class and singleton instance
const storage = new Storage();

export { Storage, storage };
