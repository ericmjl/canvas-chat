import { JSDOM } from 'jsdom';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

const dom = new JSDOM('<!DOCTYPE html><select id="model-picker"></select>', {
    url: 'http://localhost',
});

global.window = dom.window;
global.document = dom.window.document;

global.indexedDB = {
    open: () => ({
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
    }),
};

const localStore = new Map();
global.localStorage = {
    getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => localStore.set(key, value),
    removeItem: (key) => localStore.delete(key),
    clear: () => localStore.clear(),
};

let passed = 0;
let failed = 0;

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        failed++;
    }
}

const { App } = await import('../src/canvas_chat/static/js/app.js');
const { storage } = await import('../src/canvas_chat/static/js/storage.js');
const { Chat } = await import('../src/canvas_chat/static/js/chat.js');
const { ModalManager } = await import('../src/canvas_chat/static/js/modal-manager.js');

function resetStorage() {
    localStore.clear();
}

function createAppForLoadModels() {
    const app = Object.create(App.prototype);
    app.adminMode = false;
    app.modelPicker = document.getElementById('model-picker');
    app.loadModelsAdminMode = App.prototype.loadModelsAdminMode;
    return app;
}

await asyncTest('loadModels adds Copilot options when authenticated', async () => {
    resetStorage();

    const originalGetApiKeys = storage.getApiKeys;
    const originalGetCustomModels = storage.getCustomModels;
    const originalGetCurrentModel = storage.getCurrentModel;
    const originalIsLocalhost = storage.isLocalhost;
    const app = createAppForLoadModels();

    // Enable copilot (normally set by fetchFeatureFlags)
    app.copilotEnabled = true;

    const { chat } = await import('../src/canvas_chat/static/js/chat.js');
    const originalFetchProviderModels = chat.fetchProviderModels;
    const originalFetchModels = chat.fetchModels;

    storage.getApiKeys = () => ({});
    storage.getCustomModels = () => [];
    storage.getCurrentModel = () => null;
    storage.isLocalhost = () => false;
    storage.saveCopilotAuth({
        accessToken: 'copilot-access-token',
        apiKey: 'copilot-api-key',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
    });

    chat.fetchProviderModels = async (provider) => {
        if (provider === 'github_copilot') {
            return [
                {
                    id: 'github_copilot/gpt-4o',
                    name: 'gpt-4o',
                    provider: 'GitHub Copilot',
                    context_window: 128000,
                },
            ];
        }
        return [];
    };
    chat.fetchModels = async () => [];

    try {
        await app.loadModels();
        const options = [...app.modelPicker.querySelectorAll('option')];
        assertTrue(options.some((option) => option.value === 'github_copilot/gpt-4o'));
    } finally {
        storage.getApiKeys = originalGetApiKeys;
        storage.getCustomModels = originalGetCustomModels;
        storage.getCurrentModel = originalGetCurrentModel;
        storage.isLocalhost = originalIsLocalhost;
        storage.clearCopilotAuth();
        chat.fetchProviderModels = originalFetchProviderModels;
        chat.fetchModels = originalFetchModels;
    }
});

await asyncTest('expired Copilot auth opens modal on load', async () => {
    resetStorage();

    document.body.innerHTML = `
        <div id="copilot-auth-modal" style="display: none"></div>
        <span id="copilot-auth-status"></span>
        <span id="copilot-auth-message"></span>
    `;

    const now = Math.floor(Date.now() / 1000);
    storage.saveCopilotAuth({
        accessToken: 'access-token',
        apiKey: 'old-api-key',
        expiresAt: now - 10,
    });

    const app = Object.create(App.prototype);
    app.adminMode = false;
    app.loadModels = async () => {};
    app.modalManager = new ModalManager(app);

    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    global.fetch = async () => ({
        ok: false,
        json: async () => ({ detail: 'expired' }),
    });
    console.error = () => {};

    try {
        await app.handleCopilotAuthOnLoad();
        const modal = document.getElementById('copilot-auth-modal');
        assertEqual(modal.style.display, 'flex');
        const message = document.getElementById('copilot-auth-message').textContent;
        assertTrue(message.includes('expired'));
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
        storage.clearCopilotAuth();
    }
});

await asyncTest('ensureCopilotAuthFresh refreshes near expiry', async () => {
    resetStorage();

    const chat = new Chat();
    const now = Math.floor(Date.now() / 1000);
    storage.saveCopilotAuth({
        accessToken: 'access-token',
        apiKey: 'old-api-key',
        expiresAt: now + 30,
    });

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            api_key: 'new-api-key',
            expires_at: now + 600,
            access_token: 'access-token',
        }),
    });

    try {
        const apiKey = await chat.ensureCopilotAuthFresh('github_copilot/gpt-4o');
        assertEqual(apiKey, 'new-api-key');
        const updated = storage.getCopilotAuth();
        assertEqual(updated.apiKey, 'new-api-key');
    } finally {
        global.fetch = originalFetch;
    }
});

await asyncTest('ensureCopilotAuthFresh falls back on refresh failure', async () => {
    resetStorage();

    const chat = new Chat();
    const now = Math.floor(Date.now() / 1000);
    storage.saveCopilotAuth({
        accessToken: 'access-token',
        apiKey: 'old-api-key',
        expiresAt: now + 30,
    });

    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    global.fetch = async () => {
        throw new Error('Network error');
    };
    console.error = () => {};

    try {
        const apiKey = await chat.ensureCopilotAuthFresh('github_copilot/gpt-4o');
        assertEqual(apiKey, 'old-api-key');
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

await asyncTest('completeCopilotAuth triggers model refresh', async () => {
    resetStorage();

    document.body.innerHTML = `
        <div id="copilot-auth-modal"></div>
        <span id="copilot-auth-status"></span>
        <span id="copilot-auth-message"></span>
        <a id="copilot-auth-url"></a>
        <input id="copilot-auth-code" />
    `;

    let loadModelsCalled = 0;
    const app = {
        loadModels: async () => {
            loadModelsCalled += 1;
        },
    };

    const manager = new ModalManager(app);
    manager.copilotDeviceCode = 'device-code';
    manager.copilotInterval = 5;
    manager.copilotExpiresIn = 900;

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            access_token: 'access-token',
            api_key: 'api-key',
            expires_at: Math.floor(Date.now() / 1000) + 600,
        }),
    });

    try {
        await manager.completeCopilotAuth();
        assertTrue(loadModelsCalled >= 1);
        assertEqual(storage.getCopilotAuth().apiKey, 'api-key');
    } finally {
        global.fetch = originalFetch;
    }
});

if (failed > 0) {
    console.log(`\nFailed: ${failed} tests`);
    process.exit(1);
} else {
    console.log(`\nPassed: ${passed} tests`);
}
