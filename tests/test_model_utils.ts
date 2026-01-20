/**
 * Tests for model-utils.ts
 *
 * Tests model utility functions for API key and base URL lookup.
 * These utilities are extracted from chat.js for plugin reusability.
 */

interface MockLocalStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    clear: () => void;
}

interface MockIDBRequest {
    onsuccess: ((event: { target: MockIDBRequest }) => void) | null;
    onerror: ((event: { target: MockIDBRequest }) => void) | null;
    onupgradeneeded: ((event: { target: MockIDBRequest }) => void) | null;
    result: unknown;
}

interface MockIDBDatabase {
    transaction: (
        store?: string,
        mode?: string
    ) => {
        objectStore: (name: string) => {
            get: (key: string) => MockIDBRequest;
            put: (value: unknown) => MockIDBRequest;
            delete: (key: string) => MockIDBRequest;
        };
    };
}

interface MockIndexedDB {
    open: (name: string, version: number) => MockIDBRequest;
}

// Setup global mocks
const global = globalThis as unknown as {
    localStorage: MockLocalStorage;
    indexedDB: MockIndexedDB;
    window: { location: { pathname: string } };
};

if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
    };
}

if (!global.indexedDB) {
    global.indexedDB = {
        open: () => {
            const request: MockIDBRequest = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: {
                    transaction: () => ({
                        objectStore: () => ({
                            get: () => ({ onsuccess: null, onerror: null }),
                            put: () => ({ onsuccess: null, onerror: null }),
                            delete: () => ({ onsuccess: null, onerror: null }),
                        }),
                    }),
                },
            };
            setTimeout(() => {
                if (request.onsuccess) {
                    request.onsuccess({ target: request });
                }
            }, 0);
            return request;
        },
    };
}

async function asyncTest(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  ${(error as Error).message}`);
        process.exit(1);
    }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(value: unknown, message?: string): void {
    if (!value) {
        throw new Error(message || 'Expected true but got false');
    }
}

function assertNull(value: unknown, message?: string): void {
    if (value !== null) {
        throw new Error(`${message || 'Expected null'}: got ${JSON.stringify(value)}`);
    }
}

asyncTest('model-utils.ts imports successfully', async () => {
    const { getApiKeyForModel, getBaseUrlForModel, apiUrl } =
        await import('../src/canvas_chat/static/js/model-utils.ts');
    assertTrue(typeof getApiKeyForModel === 'function', 'getApiKeyForModel is a function');
    assertTrue(typeof getBaseUrlForModel === 'function', 'getBaseUrlForModel is a function');
    assertTrue(typeof apiUrl === 'function', 'apiUrl is a function');
});

asyncTest('getApiKeyForModel returns null for null model', async () => {
    const { getApiKeyForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const result = getApiKeyForModel(null);
    assertNull(result, 'Should return null for null model');
});

asyncTest('getApiKeyForModel returns null for undefined model', async () => {
    const { getApiKeyForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const result = getApiKeyForModel(undefined);
    assertNull(result, 'Should return null for undefined model');
});

asyncTest('getApiKeyForModel returns null for empty string model', async () => {
    const { getApiKeyForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const result = getApiKeyForModel('');
    assertNull(result, 'Should return null for empty string model');
});

asyncTest('getApiKeyForModel handles dall-e models with OpenAI provider', async () => {
    const { getApiKeyForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const { storage } = await import('../src/canvas_chat/static/js/storage.js');

    const originalGetApiKeyForProvider = storage.getApiKeyForProvider;
    storage.getApiKeyForProvider = (provider: string) => {
        if (provider === 'openai') {
            return 'test-openai-key';
        }
        return null;
    };

    try {
        const result = getApiKeyForModel('dall-e-3');
        assertEqual(result, 'test-openai-key', 'DALL-E should use OpenAI provider');
    } finally {
        storage.getApiKeyForProvider = originalGetApiKeyForProvider;
    }
});

asyncTest('getApiKeyForModel extracts provider from model ID', async () => {
    const { getApiKeyForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const { storage } = await import('../src/canvas_chat/static/js/storage.js');

    const originalGetApiKeyForProvider = storage.getApiKeyForProvider;
    storage.getApiKeyForProvider = (provider: string) => {
        if (provider === 'anthropic') {
            return 'test-anthropic-key';
        }
        return null;
    };

    try {
        const result = getApiKeyForModel('anthropic/claude-sonnet-4-20250514');
        assertEqual(result, 'test-anthropic-key', 'Should extract anthropic provider');
    } finally {
        storage.getApiKeyForProvider = originalGetApiKeyForProvider;
    }
});

asyncTest('getApiKeyForModel returns null for unknown provider', async () => {
    const { getApiKeyForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const { storage } = await import('../src/canvas_chat/static/js/storage.js');

    const originalGetApiKeyForProvider = storage.getApiKeyForProvider;
    storage.getApiKeyForProvider = () => null;

    try {
        const result = getApiKeyForModel('unknown/model-name');
        assertNull(result, 'Should return null for unknown provider');
    } finally {
        storage.getApiKeyForProvider = originalGetApiKeyForProvider;
    }
});

asyncTest('getApiKeyForModel handles provider with hyphen (e.g., "openrouter")', async () => {
    const { getApiKeyForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const { storage } = await import('../src/canvas_chat/static/js/storage.js');

    const originalGetApiKeyForProvider = storage.getApiKeyForProvider;
    storage.getApiKeyForProvider = (provider: string) => {
        if (provider === 'openrouter') {
            return 'test-openrouter-key';
        }
        return null;
    };

    try {
        const result = getApiKeyForModel('openrouter/openrouter-model');
        assertEqual(result, 'test-openrouter-key', 'Should handle provider with hyphen');
    } finally {
        storage.getApiKeyForProvider = originalGetApiKeyForProvider;
    }
});

asyncTest('getBaseUrlForModel returns custom model base_url if configured', async () => {
    const { getBaseUrlForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const { storage } = await import('../src/canvas_chat/static/js/storage.js');

    const originalGetCustomModels = storage.getCustomModels;
    storage.getCustomModels = () => [
        { id: 'custom/model', name: 'Custom Model', base_url: 'https://custom.api.com/v1' },
    ];

    try {
        const result = getBaseUrlForModel('custom/model');
        assertEqual(result, 'https://custom.api.com/v1', 'Should return custom model base_url');
    } finally {
        storage.getCustomModels = originalGetCustomModels;
    }
});

asyncTest('getBaseUrlForModel falls back to global base URL', async () => {
    const { getBaseUrlForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const { storage } = await import('../src/canvas_chat/static/js/storage.js');

    const originalGetCustomModels = storage.getCustomModels;
    const originalGetBaseUrl = storage.getBaseUrl;

    storage.getCustomModels = () => [];
    storage.getBaseUrl = () => 'https://global.api.com/v1';

    try {
        const result = getBaseUrlForModel('standard/model');
        assertEqual(result, 'https://global.api.com/v1', 'Should return global base URL');
    } finally {
        storage.getCustomModels = originalGetCustomModels;
        storage.getBaseUrl = originalGetBaseUrl;
    }
});

asyncTest('getBaseUrlForModel returns null when no base URL configured', async () => {
    const { getBaseUrlForModel } = await import('../src/canvas_chat/static/js/model-utils.ts');
    const { storage } = await import('../src/canvas_chat/static/js/storage.js');

    const originalGetCustomModels = storage.getCustomModels;
    const originalGetBaseUrl = storage.getBaseUrl;

    storage.getCustomModels = () => [];
    storage.getBaseUrl = () => null;

    try {
        const result = getBaseUrlForModel('standard/model');
        assertNull(result, 'Should return null when no base URL configured');
    } finally {
        storage.getCustomModels = originalGetCustomModels;
        storage.getBaseUrl = originalGetBaseUrl;
    }
});

asyncTest('apiUrl formats endpoint correctly', async () => {
    const { apiUrl } = await import('../src/canvas_chat/static/js/model-utils.ts');

    const originalWindow = global.window;
    global.window = { location: { pathname: '/' } };

    try {
        const result = apiUrl('api/chat');
        assertTrue(result.includes('api/chat'), 'Should include endpoint in result');
    } finally {
        global.window = originalWindow;
    }
});

asyncTest('apiUrl handles endpoints with leading slash', async () => {
    const { apiUrl } = await import('../src/canvas_chat/static/js/model-utils.ts');

    const originalWindow = global.window;
    global.window = { location: { pathname: '/' } };

    try {
        const result = apiUrl('/api/chat');
        assertTrue(result.includes('api/chat'), 'Should include endpoint in result');
    } finally {
        global.window = originalWindow;
    }
});

console.log('\n✓ All model-utils tests passed!');
