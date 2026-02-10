/// <reference types="cypress" />

// Clear localStorage and IndexedDB before each test
beforeEach(() => {
    cy.clearLocalStorage();
    cy.clearIndexedDB();
});

// Custom command to clear IndexedDB
Cypress.Commands.add('clearIndexedDB', () => {
    cy.window().then((win) => {
        return new Promise((resolve, reject) => {
            const request = win.indexedDB.deleteDatabase('canvas-chat');
            request.onsuccess = () => resolve();
            request.onerror = (err) => reject(err);
        });
    });
});

// Standard selector helper for stable test IDs
Cypress.Commands.add('getByTestId', (testId, options) => {
    return cy.get(`[data-testid="${testId}"]`, options);
});

// Configure Ollama base URL
Cypress.Commands.add('configureOllama', (baseUrl = 'http://localhost:11434') => {
    cy.get('#settings-btn').click();
    cy.get('#settings-modal').should('be.visible');
    cy.get('#base-url').clear().type(baseUrl);
    cy.get('#settings-close').click();
    cy.get('#settings-modal').should('not.be.visible');
    cy.wait(1000); // Wait for models to fetch
});

// Wait for streaming to complete (stop button disappears)
Cypress.Commands.add('waitForStreamingComplete', (timeout = 120000) => {
    cy.get('.stop-btn', { timeout }).should('not.exist');
});

// Send chat message
Cypress.Commands.add('sendMessage', (message) => {
    cy.get('#chat-input').type(message);
    cy.get('#send-btn').click();
});

// Get last AI node
Cypress.Commands.add('getLastAiNode', () => {
    return cy.get('.node.ai').last();
});

// Get last human node
Cypress.Commands.add('getLastHumanNode', () => {
    return cy.get('.node.human').last();
});

// Wait for app + plugin system to be fully initialized.
// All checks in one retry block so we wait for __APP_TEST__ and pluginSystemReady
// to appear (they are set by the app after session load) instead of failing fast.
// Does not require baseAgent; specs that need it (e.g. chat flows) should call waitForBaseAgent() after.
Cypress.Commands.add('waitForAppReady', () => {
    cy.window().should(
        (win) => {
            expect(win.app, 'app instance').to.exist;
            expect(win.__APP_TEST__, 'test hook (set after session load)').to.exist;
            expect(win.__APP_TEST__.pluginSystemReady, 'plugin system ready').to.eq('init-complete');
        },
        { timeout: 60000 }
    );
});

// Wait for BaseAgent to be ready. Call after waitForAppReady() in specs that send chat messages or use runAgentSlashCommand.
Cypress.Commands.add('waitForBaseAgent', () => {
    cy.window().its('app.baseAgent', { timeout: 10000 }).should('exist');
});

// Seed custom models so the picker is not empty in tests
Cypress.Commands.add('seedTestModels', (models = null) => {
    const fallbackModels = [
        {
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o Mini (Test)',
            provider: 'Custom',
            context_window: 128000,
            base_url: null,
        },
    ];
    const modelsToStore = Array.isArray(models) && models.length > 0 ? models : fallbackModels;
    const firstModelId = modelsToStore[0]?.id || 'openai/gpt-4o-mini';

    cy.window().then((win) => {
        win.localStorage.setItem('canvas-chat-custom-models', JSON.stringify(modelsToStore));
        win.localStorage.setItem('canvas-chat-model', firstModelId);
        if (win.app?.loadModels) {
            return win.app.loadModels();
        }
        return undefined;
    });
});

// Seed and select a deterministic test model in the picker
Cypress.Commands.add('selectTestModel', (modelId = 'openai/gpt-4o-mini') => {
    cy.seedTestModels([{ id: modelId, name: 'Test Model', provider: 'Custom', context_window: 128000, base_url: null }]);
    cy.get('#model-picker', { timeout: 10000 }).should('not.have.class', 'no-keys');
    cy.get('#model-picker').select(modelId);
});

// Force reloading external plugins with test hooks
Cypress.Commands.add('reloadExternalPluginsForTest', () => {
    cy.window().then((win) => {
        if (win.__APP_TEST__?.externalPlugins) {
            win.__APP_TEST__.externalPlugins.loaded = [];
            win.__APP_TEST__.externalPlugins.failed = [];
        }
        if (win.app) {
            win.app._externalPluginsLoaded = false;
            return win.app.loadExternalJsPlugins();
        }
        return undefined;
    });
});

// Run a slash command via the feature registry (bypasses chat input/BaseAgent)
Cypress.Commands.add('runFeatureSlashCommand', (command, args = '', context = null) => {
    cy.window().then((win) => {
        const app = win.app;
        if (!app?.featureRegistry) {
            throw new Error('Feature registry not available');
        }
        return app.featureRegistry.handleSlashCommand(command, args, { text: context, selectedNodeIds: [] });
    });
});

// Run a slash command via BaseAgent (ensures prereqs + toast errors)
Cypress.Commands.add('runAgentSlashCommand', (message) => {
    cy.window().then((win) => {
        const app = win.app;
        if (!app?.baseAgent) {
            throw new Error('BaseAgent not available');
        }
        const selectedNodeIds = app.canvas?.getSelectedNodeIds?.() || [];
        if (selectedNodeIds.length === 0 && (message === '/reflect' || message === '/reflect-config')) {
            const toastMessage =
                message === '/reflect'
                    ? 'Please select a node to reflect on'
                    : 'Please select a node before running /reflect-config';
            app.showToast?.(toastMessage, 'warning');
            return { success: false, error: toastMessage };
        }
        return app.baseAgent
            .invoke({ message, context: null, selectedNodeIds })
            .then((result) => {
                if (!result.success && result.error) {
                    app.showToast?.(result.error, 'error');
                }
                return result;
            });
    });
});
