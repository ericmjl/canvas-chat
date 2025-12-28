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
     * Get API key for a specific provider
     */
    getApiKeyForProvider(provider) {
        const keys = this.getApiKeys();
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
        const key = providerMap[provider.toLowerCase()] || provider.toLowerCase();
        return keys[key] || null;
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
}

// Export singleton instance
const storage = new Storage();
