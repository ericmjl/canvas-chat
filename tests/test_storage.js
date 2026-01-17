/**
 * Tests for storage.js
 * Tests localStorage functions: RecentModels, Provider mapping, Custom Models, etc.
 */

import { test, assertEqual, assertTrue, assertFalse, assertNull, assertDeepEqual } from './test_setup.js';

// ============================================================
// Mock localStorage for testing
// ============================================================

/**
 * Mock localStorage for testing storage functions.
 */
class MockLocalStorage {
    constructor() {
        this.store = {};
    }

    getItem(key) {
        return this.store[key] || null;
    }

    setItem(key, value) {
        this.store[key] = value;
    }

    removeItem(key) {
        delete this.store[key];
    }

    clear() {
        this.store = {};
    }
}

// ============================================================
// RecentModels storage tests
// ============================================================

// Simulate the storage functions from storage.js
function createRecentModelsStorage(localStorage) {
    return {
        getRecentModels() {
            const data = localStorage.getItem('canvas-chat-recent-models');
            return data ? JSON.parse(data) : [];
        },

        addRecentModel(modelId) {
            const recent = this.getRecentModels();

            // Remove if already exists (will re-add at front)
            const filtered = recent.filter((id) => id !== modelId);

            // Add to front
            filtered.unshift(modelId);

            // Keep only last 10
            const trimmed = filtered.slice(0, 10);

            localStorage.setItem('canvas-chat-recent-models', JSON.stringify(trimmed));
        },
    };
}

test('getRecentModels: returns empty array when no data', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    assertEqual(storage.getRecentModels(), []);
});

test('addRecentModel: adds model to empty list', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');

    assertEqual(storage.getRecentModels(), ['openai/gpt-4o']);
});

test('addRecentModel: adds model to front of list', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('anthropic/claude-sonnet-4-20250514');

    assertEqual(storage.getRecentModels(), ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o']);
});

test('addRecentModel: moves existing model to front', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('anthropic/claude-sonnet-4-20250514');
    storage.addRecentModel('groq/llama-3.1-70b-versatile');

    // Now add gpt-4o again - should move to front
    storage.addRecentModel('openai/gpt-4o');

    assertEqual(storage.getRecentModels(), [
        'openai/gpt-4o',
        'groq/llama-3.1-70b-versatile',
        'anthropic/claude-sonnet-4-20250514',
    ]);
});

test('addRecentModel: limits to 10 models', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    // Add 12 models
    for (let i = 0; i < 12; i++) {
        storage.addRecentModel(`model-${i}`);
    }

    const recent = storage.getRecentModels();
    assertEqual(recent.length, 10);

    // Most recent should be first
    assertEqual(recent[0], 'model-11');
    // Oldest kept should be model-2
    assertEqual(recent[9], 'model-2');
});

test('addRecentModel: no duplicates in list', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createRecentModelsStorage(mockStorage);

    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('anthropic/claude-sonnet-4-20250514');
    storage.addRecentModel('openai/gpt-4o');
    storage.addRecentModel('openai/gpt-4o');

    const recent = storage.getRecentModels();

    // Should only have 2 unique models
    assertEqual(recent.length, 2);
    assertEqual(recent, ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514']);
});

// ============================================================
// Provider mapping tests (_getStorageKeyForProvider, getApiKeysForModels)
// ============================================================

/**
 * Simulate the provider mapping logic from storage.js
 * This is the canonical mapping for provider name to storage key.
 */
function createProviderMappingStorage(localStorage) {
    return {
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
        },

        getApiKeys() {
            const data = localStorage.getItem('canvas-chat-api-keys');
            return data ? JSON.parse(data) : {};
        },

        saveApiKeys(keys) {
            localStorage.setItem('canvas-chat-api-keys', JSON.stringify(keys));
        },

        getCopilotAuth() {
            const data = localStorage.getItem('canvas-chat-copilot-auth');
            return data ? JSON.parse(data) : null;
        },

        saveCopilotAuth(auth) {
            localStorage.setItem('canvas-chat-copilot-auth', JSON.stringify(auth));
        },

        getCopilotApiKey() {
            return this.getCopilotAuth()?.apiKey || null;
        },

        getApiKeyForProvider(provider) {
            const normalizedProvider = provider.toLowerCase();
            if (normalizedProvider === 'github_copilot') {
                return this.getCopilotApiKey();
            }
            const keys = this.getApiKeys();
            const storageKey = this._getStorageKeyForProvider(provider);
            return keys[storageKey] || null;
        },

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
        },
    };
}

test('_getStorageKeyForProvider: direct mapping', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('openai'), 'openai');
    assertEqual(storage._getStorageKeyForProvider('anthropic'), 'anthropic');
    assertEqual(storage._getStorageKeyForProvider('groq'), 'groq');
});

test('_getStorageKeyForProvider: gemini maps to google', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('gemini'), 'google');
    assertEqual(storage._getStorageKeyForProvider('google'), 'google');
});

test('_getStorageKeyForProvider: github_copilot maps to github_copilot', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('github'), 'github');
    assertEqual(storage._getStorageKeyForProvider('github_copilot'), 'github_copilot');
});

test('_getStorageKeyForProvider: case insensitive', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('OpenAI'), 'openai');
    assertEqual(storage._getStorageKeyForProvider('GEMINI'), 'google');
    assertEqual(storage._getStorageKeyForProvider('GitHub_Copilot'), 'github_copilot');
});

test('_getStorageKeyForProvider: unknown provider returns lowercase', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    assertEqual(storage._getStorageKeyForProvider('mistral'), 'mistral');
    assertEqual(storage._getStorageKeyForProvider('Cohere'), 'cohere');
});

test('getApiKeyForProvider: returns key using mapping', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        openai: 'sk-openai-key',
        google: 'google-key',
        github: 'gh-token',
    });
    storage.saveCopilotAuth({ apiKey: 'copilot-token' });

    assertEqual(storage.getApiKeyForProvider('openai'), 'sk-openai-key');
    assertEqual(storage.getApiKeyForProvider('gemini'), 'google-key');
    assertEqual(storage.getApiKeyForProvider('github_copilot'), 'copilot-token');
});

test('getApiKeyForProvider: returns null for unconfigured provider', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({ openai: 'sk-key' });

    assertNull(storage.getApiKeyForProvider('anthropic'));
    assertNull(storage.getApiKeyForProvider('mistral'));
});

test('getApiKeysForModels: builds dict from model IDs', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        openai: 'sk-openai',
        anthropic: 'sk-anthropic',
        google: 'google-key',
    });

    const result = storage.getApiKeysForModels(['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514']);

    assertDeepEqual(result, {
        openai: 'sk-openai',
        anthropic: 'sk-anthropic',
    });
});

test('getApiKeysForModels: maps gemini to google', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        openai: 'sk-openai',
        google: 'google-key',
    });

    const result = storage.getApiKeysForModels(['openai/gpt-4o', 'gemini/gemini-1.5-pro']);

    assertDeepEqual(result, {
        openai: 'sk-openai',
        google: 'google-key',
    });
});

test('getApiKeysForModels: includes github_copilot auth', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveCopilotAuth({ apiKey: 'copilot-token' });

    const result = storage.getApiKeysForModels(['github_copilot/gpt-4']);

    assertDeepEqual(result, {
        github_copilot: 'copilot-token',
    });
});

test('getApiKeysForModels: skips models without configured keys', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        openai: 'sk-openai',
    });

    const result = storage.getApiKeysForModels([
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4-20250514', // No key configured
        'mistral/mistral-large', // Unknown provider, no key
    ]);

    assertDeepEqual(result, {
        openai: 'sk-openai',
    });
});

test('getApiKeysForModels: deduplicates providers', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        openai: 'sk-openai',
    });

    // Multiple models from same provider
    const result = storage.getApiKeysForModels(['openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-3.5-turbo']);

    assertDeepEqual(result, {
        openai: 'sk-openai',
    });
});

test('getApiKeysForModels: empty array returns empty object', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createProviderMappingStorage(mockStorage);

    storage.saveApiKeys({
        openai: 'sk-openai',
    });

    const result = storage.getApiKeysForModels([]);

    assertDeepEqual(result, {});
});

// ============================================================
// Custom Models storage tests
// ============================================================

/**
 * Tests for user-defined custom models storage.
 * Custom models allow users to add LiteLLM-compatible model IDs
 * that persist in localStorage and appear in the model picker.
 */
function createCustomModelsStorage(localStorage) {
    const STORAGE_KEY = 'canvas-chat-custom-models';
    const MODEL_ID_PATTERN = /^[a-z0-9_-]+\/[a-z0-9._-]+$/i;

    return {
        getCustomModels() {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        },

        saveCustomModel(model) {
            // Validate model ID format (provider/model-name)
            if (!model.id || !MODEL_ID_PATTERN.test(model.id)) {
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

            localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
            return customModel;
        },

        deleteCustomModel(modelId) {
            const models = this.getCustomModels();
            const filtered = models.filter((m) => m.id !== modelId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
            return filtered.length < models.length; // Return true if deleted
        },
    };
}

test('getCustomModels: returns empty array when no data', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    assertEqual(storage.getCustomModels(), []);
});

test('saveCustomModel: adds model with all fields', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({
        id: 'openai/gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        context_window: 200000,
        base_url: 'https://my-proxy.com/v1',
    });

    assertEqual(model.id, 'openai/gpt-4.1-mini');
    assertEqual(model.name, 'GPT-4.1 Mini');
    assertEqual(model.provider, 'Custom');
    assertEqual(model.context_window, 200000);
    assertEqual(model.base_url, 'https://my-proxy.com/v1');

    const saved = storage.getCustomModels();
    assertEqual(saved.length, 1);
    assertEqual(saved[0].id, 'openai/gpt-4.1-mini');
});

test('saveCustomModel: defaults name to id when not provided', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({ id: 'openai/my-model' });

    assertEqual(model.name, 'openai/my-model');
});

test('saveCustomModel: defaults context_window to 128000', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({ id: 'openai/my-model' });

    assertEqual(model.context_window, 128000);
});

test('saveCustomModel: defaults base_url to null', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({ id: 'openai/my-model' });

    assertEqual(model.base_url, null);
});

test('saveCustomModel: always sets provider to Custom', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const model = storage.saveCustomModel({
        id: 'anthropic/claude-custom',
        provider: 'ShouldBeIgnored',
    });

    assertEqual(model.provider, 'Custom');
});

test('saveCustomModel: updates existing model with same id', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    storage.saveCustomModel({
        id: 'openai/my-model',
        name: 'Original Name',
        context_window: 100000,
    });

    storage.saveCustomModel({
        id: 'openai/my-model',
        name: 'Updated Name',
        context_window: 200000,
    });

    const models = storage.getCustomModels();
    assertEqual(models.length, 1);
    assertEqual(models[0].name, 'Updated Name');
    assertEqual(models[0].context_window, 200000);
});

test('saveCustomModel: rejects invalid model ID - missing slash', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    let threw = false;
    try {
        storage.saveCustomModel({ id: 'invalid-model-no-slash' });
    } catch (e) {
        threw = true;
        assertTrue(e.message.includes('provider/model-name'), 'Error should mention format');
    }
    assertTrue(threw, 'Should throw for invalid model ID');
});

test('saveCustomModel: rejects empty model ID', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    let threw = false;
    try {
        storage.saveCustomModel({ id: '' });
    } catch (e) {
        threw = true;
    }
    assertTrue(threw, 'Should throw for empty model ID');
});

test('saveCustomModel: rejects model ID without provider', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    let threw = false;
    try {
        storage.saveCustomModel({ id: '/model-only' });
    } catch (e) {
        threw = true;
    }
    assertTrue(threw, 'Should throw for model ID without provider');
});

test('saveCustomModel: accepts valid model ID formats', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    // Various valid formats
    storage.saveCustomModel({ id: 'openai/gpt-4o' });
    storage.saveCustomModel({ id: 'ollama_chat/llama3.1' });
    storage.saveCustomModel({ id: 'my-proxy/qwen2.5-72b' });
    storage.saveCustomModel({ id: 'anthropic/claude-3.5-sonnet' });

    assertEqual(storage.getCustomModels().length, 4);
});

test('deleteCustomModel: removes model by id', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    storage.saveCustomModel({ id: 'openai/model-1' });
    storage.saveCustomModel({ id: 'openai/model-2' });
    storage.saveCustomModel({ id: 'openai/model-3' });

    assertEqual(storage.getCustomModels().length, 3);

    const deleted = storage.deleteCustomModel('openai/model-2');

    assertTrue(deleted, 'Should return true when model deleted');
    assertEqual(storage.getCustomModels().length, 2);
    assertFalse(storage.getCustomModels().some((m) => m.id === 'openai/model-2'));
});

test('deleteCustomModel: returns false for non-existent model', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    storage.saveCustomModel({ id: 'openai/model-1' });

    const deleted = storage.deleteCustomModel('openai/non-existent');

    assertFalse(deleted, 'Should return false when model not found');
    assertEqual(storage.getCustomModels().length, 1);
});

test('deleteCustomModel: handles empty list gracefully', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createCustomModelsStorage(mockStorage);

    const deleted = storage.deleteCustomModel('openai/any-model');

    assertFalse(deleted);
    assertEqual(storage.getCustomModels().length, 0);
});

test('getCustomModels: persists across storage instances', () => {
    const mockStorage = new MockLocalStorage();
    const storage1 = createCustomModelsStorage(mockStorage);

    storage1.saveCustomModel({ id: 'openai/my-model', name: 'My Model' });

    // Simulate page reload - new storage instance, same localStorage
    const storage2 = createCustomModelsStorage(mockStorage);
    const models = storage2.getCustomModels();

    assertEqual(models.length, 1);
    assertEqual(models[0].id, 'openai/my-model');
    assertEqual(models[0].name, 'My Model');
});

// ============================================================
// getBaseUrlForModel helper tests
// ============================================================

/**
 * Tests for the getBaseUrlForModel helper.
 * This helper checks if a model is custom and has a per-model base_url,
 * otherwise falls back to the global base URL.
 */
function createBaseUrlHelper(localStorage) {
    const customModelsStorage = createCustomModelsStorage(localStorage);

    return {
        getBaseUrl() {
            return localStorage.getItem('canvas-chat-base-url') || null;
        },

        setBaseUrl(url) {
            if (url) {
                localStorage.setItem('canvas-chat-base-url', url);
            } else {
                localStorage.removeItem('canvas-chat-base-url');
            }
        },

        getBaseUrlForModel(modelId) {
            // Check if model is a custom model with per-model base_url
            const customModels = customModelsStorage.getCustomModels();
            const customModel = customModels.find((m) => m.id === modelId);

            if (customModel && customModel.base_url) {
                return customModel.base_url;
            }

            // Fall back to global base URL
            return this.getBaseUrl();
        },

        // Expose for test setup
        saveCustomModel: customModelsStorage.saveCustomModel.bind(customModelsStorage),
    };
}

test('getBaseUrlForModel: returns null when no base URL configured', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    assertNull(helper.getBaseUrlForModel('openai/gpt-4o'));
});

test('getBaseUrlForModel: returns global base URL for regular models', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global-proxy.com/v1');

    assertEqual(helper.getBaseUrlForModel('openai/gpt-4o'), 'https://global-proxy.com/v1');
});

test('getBaseUrlForModel: returns per-model base URL for custom models', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global-proxy.com/v1');
    helper.saveCustomModel({
        id: 'openai/my-custom',
        base_url: 'https://my-custom-proxy.com/v1',
    });

    assertEqual(helper.getBaseUrlForModel('openai/my-custom'), 'https://my-custom-proxy.com/v1');
});

test('getBaseUrlForModel: per-model base URL overrides global', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global.com/v1');
    helper.saveCustomModel({
        id: 'openai/custom',
        base_url: 'https://custom.com/v1',
    });

    // Custom model uses its own URL
    assertEqual(helper.getBaseUrlForModel('openai/custom'), 'https://custom.com/v1');
    // Regular model uses global URL
    assertEqual(helper.getBaseUrlForModel('openai/gpt-4o'), 'https://global.com/v1');
});

test('getBaseUrlForModel: custom model without base_url uses global', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.setBaseUrl('https://global.com/v1');
    helper.saveCustomModel({
        id: 'openai/custom',
        // No base_url specified
    });

    assertEqual(helper.getBaseUrlForModel('openai/custom'), 'https://global.com/v1');
});

test('getBaseUrlForModel: custom model without base_url and no global returns null', () => {
    const mockStorage = new MockLocalStorage();
    const helper = createBaseUrlHelper(mockStorage);

    helper.saveCustomModel({
        id: 'openai/custom',
        // No base_url specified
    });

    assertNull(helper.getBaseUrlForModel('openai/custom'));
});

// ============================================================
// Flashcard strictness storage tests
// ============================================================

/**
 * Simulate the flashcard strictness storage functions from storage.js.
 * These control how strictly the LLM grades flashcard answers.
 */
function createStrictnessStorage(localStorage) {
    return {
        getFlashcardStrictness() {
            return localStorage.getItem('canvas-chat-flashcard-strictness') || 'medium';
        },

        setFlashcardStrictness(value) {
            localStorage.setItem('canvas-chat-flashcard-strictness', value);
        },
    };
}

test('getFlashcardStrictness: returns medium by default', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    assertEqual(storage.getFlashcardStrictness(), 'medium');
});

test('getFlashcardStrictness: returns stored value', () => {
    const mockStorage = new MockLocalStorage();
    mockStorage.setItem('canvas-chat-flashcard-strictness', 'strict');
    const storage = createStrictnessStorage(mockStorage);

    assertEqual(storage.getFlashcardStrictness(), 'strict');
});

test('setFlashcardStrictness: stores lenient value', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    storage.setFlashcardStrictness('lenient');

    assertEqual(storage.getFlashcardStrictness(), 'lenient');
});

test('setFlashcardStrictness: stores strict value', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    storage.setFlashcardStrictness('strict');

    assertEqual(storage.getFlashcardStrictness(), 'strict');
});

test('setFlashcardStrictness: can update value', () => {
    const mockStorage = new MockLocalStorage();
    const storage = createStrictnessStorage(mockStorage);

    storage.setFlashcardStrictness('lenient');
    assertEqual(storage.getFlashcardStrictness(), 'lenient');

    storage.setFlashcardStrictness('strict');
    assertEqual(storage.getFlashcardStrictness(), 'strict');

    storage.setFlashcardStrictness('medium');
    assertEqual(storage.getFlashcardStrictness(), 'medium');
});

test('setFlashcardStrictness: persists across function calls', () => {
    const mockStorage = new MockLocalStorage();
    const storage1 = createStrictnessStorage(mockStorage);

    storage1.setFlashcardStrictness('strict');

    // Create a new storage instance with the same localStorage
    const storage2 = createStrictnessStorage(mockStorage);
    assertEqual(storage2.getFlashcardStrictness(), 'strict');
});
