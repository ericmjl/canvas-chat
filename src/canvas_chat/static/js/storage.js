/**
 * Storage module - IndexedDB for sessions, localStorage for settings
 */

const DB_NAME = 'canvas-chat';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';

class Storage {
    constructor() {
        this.db = null;
        this.dbReady = this.initDB();
    }

    /**
     * Initialize IndexedDB
     */
    async initDB() {
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
     */
    exportSession(session) {
        const exportData = {
            version: 1,
            exported_at: new Date().toISOString(),
            ...session
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
                        updated_at: Date.now()
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
     */
    getApiKeys() {
        const keys = localStorage.getItem('canvas-chat-api-keys');
        return keys ? JSON.parse(keys) : {};
    }

    /**
     * Save API keys to localStorage
     */
    saveApiKeys(keys) {
        localStorage.setItem('canvas-chat-api-keys', JSON.stringify(keys));
    }

    /**
     * Map provider name to storage key name.
     * This is the canonical mapping - all other methods should use this.
     * @param {string} provider - Provider name (e.g., "openai", "gemini", "github_copilot")
     * @returns {string} - Storage key name (e.g., "openai", "google", "github")
     */
    _getStorageKeyForProvider(provider) {
        const providerMap = {
            'openai': 'openai',
            'anthropic': 'anthropic',
            'gemini': 'google',
            'google': 'google',
            'groq': 'groq',
            'github': 'github',
            'github_copilot': 'github',  // Copilot uses the same GitHub token
            'exa': 'exa'
        };
        return providerMap[provider.toLowerCase()] || provider.toLowerCase();
    }

    /**
     * Get API key for a specific provider
     * @param {string} provider - Provider name from model ID (e.g., "openai", "gemini")
     * @returns {string|null} - API key or null if not configured
     */
    getApiKeyForProvider(provider) {
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
        return llmProviders.some(provider => keys[provider] && keys[provider].trim() !== '');
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
        return hostname === 'localhost' ||
               hostname === '127.0.0.1' ||
               hostname === '0.0.0.0' ||
               hostname === '[::1]';
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

        return configured;
    }

    /**
     * Get Exa API key
     */
    getExaApiKey() {
        const keys = this.getApiKeys();
        return keys.exa || null;
    }

    /**
     * Get the currently selected model
     */
    getCurrentModel() {
        return localStorage.getItem('canvas-chat-model') || 'openai/gpt-4o-mini';
    }

    /**
     * Save the currently selected model
     */
    setCurrentModel(model) {
        localStorage.setItem('canvas-chat-model', model);
    }

    /**
     * Get the last active session ID
     */
    getLastSessionId() {
        return localStorage.getItem('canvas-chat-last-session');
    }

    /**
     * Save the last active session ID
     */
    setLastSessionId(id) {
        localStorage.setItem('canvas-chat-last-session', id);
    }

    /**
     * Get the custom base URL for LLM proxy
     */
    getBaseUrl() {
        return localStorage.getItem('canvas-chat-base-url') || null;
    }

    /**
     * Save the custom base URL for LLM proxy
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
        const filtered = recent.filter(id => id !== modelId);

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
}

// Export singleton instance
const storage = new Storage();
