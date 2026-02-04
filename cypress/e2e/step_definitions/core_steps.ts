/// <reference types="cypress" />

import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';

const BUTTON_TEST_IDS = {
    'Auto Layout': 'auto-layout-btn',
    Export: 'export-btn',
    'New Canvas': 'new-canvas-btn',
    Import: 'import-btn',
    Help: 'help-btn',
    Multiplayer: 'multiplayer-btn',
    Redo: 'redo-btn',
    Search: 'search-btn',
    Sessions: 'sessions-btn',
    Settings: 'settings-btn',
    Tags: 'tags-btn',
    Undo: 'undo-btn',
} as const;

const MODAL_TEST_IDS = {
    Help: 'help-modal',
    Sessions: 'sessions-modal',
    Settings: 'settings-modal',
} as const;

const MODAL_CLOSE_TEST_IDS = {
    Help: 'help-close',
    Sessions: 'sessions-close',
    Settings: 'settings-close',
} as const;

Given('I open Canvas Chat', () => {
    cy.visit('/');
});

When('I wait for the app to initialize', () => {
    cy.window().should((win) => {
        expect(win.app, 'app instance').to.exist;
        expect(win.app.featureRegistry, 'feature registry').to.exist;
        expect(win.app.graph, 'graph initialized').to.exist;
    });
    cy.window().its('__APP_TEST__').should('exist');
    cy.window().its('__APP_TEST__.pluginSystemReady').should('eq', 'init-complete');
});

When('I click {string}', (label) => {
    const testId = BUTTON_TEST_IDS[label];
    if (!testId) {
        throw new Error(`No data-testid mapping for button: ${label}`);
    }
    cy.getByTestId(testId).click();
});

Then('I should see the toolbar', () => {
    cy.getByTestId('toolbar').should('be.visible');
});

Then('the canvas should be visible', () => {
    cy.getByTestId('canvas-container').should('be.visible');
});

Then('I should see the {string} button', (label) => {
    const testId = BUTTON_TEST_IDS[label];
    if (!testId) {
        throw new Error(`No data-testid mapping for button: ${label}`);
    }
    cy.getByTestId(testId).should('be.visible');
});

When('I open the {string} modal', (label) => {
    const buttonId = BUTTON_TEST_IDS[label];
    const modalId = MODAL_TEST_IDS[label];
    if (!buttonId || !modalId) {
        throw new Error(`No test id mapping for modal: ${label}`);
    }
    cy.getByTestId(buttonId).click();
});

When('I close the {string} modal', (label) => {
    const modalId = MODAL_TEST_IDS[label];
    const closeId = MODAL_CLOSE_TEST_IDS[label];
    if (!modalId || !closeId) {
        throw new Error(`No test id mapping for modal close: ${label}`);
    }
    cy.getByTestId(modalId).should('be.visible');
    cy.getByTestId(closeId).click();
});

Then('the {string} modal should be visible', (label) => {
    const modalId = MODAL_TEST_IDS[label];
    if (!modalId) {
        throw new Error(`No test id mapping for modal: ${label}`);
    }
    cy.getByTestId(modalId).should('be.visible');
});

Then('the {string} modal should be hidden', (label) => {
    const modalId = MODAL_TEST_IDS[label];
    if (!modalId) {
        throw new Error(`No test id mapping for modal: ${label}`);
    }
    cy.getByTestId(modalId).should('not.be.visible');
});

When('I open the search overlay', () => {
    cy.getByTestId('search-btn').click();
});

When('I close the search overlay', () => {
    cy.getByTestId('search-overlay').should('be.visible');
    cy.get('body').type('{esc}');
});

Then('the search overlay should be visible', () => {
    cy.getByTestId('search-overlay').should('be.visible');
});

Then('the search overlay should be hidden', () => {
    cy.getByTestId('search-overlay').should('not.be.visible');
});

When('I open the tag drawer', () => {
    cy.getByTestId('tags-btn').click();
});

When('I close the tag drawer', () => {
    cy.getByTestId('tag-drawer-close').click();
});

Then('the tag drawer should be visible', () => {
    cy.getByTestId('tag-drawer').should('be.visible');
});

Then('the tag drawer should be hidden', () => {
    cy.getByTestId('tag-drawer').should('not.be.visible');
});

When('I send the message {string}', (message) => {
    cy.sendMessage(message);
});

When('I create a {string} node via the app API', (nodeType) => {
    cy.window().then((win) => {
        const app = win.app;
        const graph = app?.graph;
        if (!graph) {
            throw new Error('Graph not initialized');
        }
        const node = {
            id: win.crypto.randomUUID(),
            type: nodeType,
            content: 'Test content',
            position: { x: 0, y: 0 },
            width: 420,
            height: 200,
            created_at: Date.now(),
            tags: [],
            title: null,
            summary: null,
            model: null,
            selection: null,
        };
        graph.addNode(node);
    });
});

Then('the graph should have at least {int} nodes', (minNodes) => {
    cy.window()
        .its('__APP_TEST__')
        .its('graph')
        .invoke('serialize')
        .should((graph) => {
            expect(graph.nodes.length).to.be.gte(minNodes);
        });
});

Then('the graph should have exactly {int} nodes', (nodeCount) => {
    cy.window()
        .its('__APP_TEST__')
        .its('graph')
        .invoke('serialize')
        .should((graph) => {
            expect(graph.nodes.length).to.equal(nodeCount);
        });
});

Then('the graph should include a node of type {string}', (nodeType) => {
    cy.window()
        .its('__APP_TEST__')
        .its('graph')
        .invoke('serialize')
        .should((graph) => {
            const hasType = graph.nodes.some((node) => node.type === nodeType);
            expect(hasType, `node type ${nodeType} present`).to.equal(true);
        });
});

Then('slash command {string} should be registered', (command) => {
    cy.window().should((win) => {
        if (typeof win.getAllSlashCommands !== 'function') {
            throw new Error('Slash command registry not available on window');
        }
        const commands = win.getAllSlashCommands().map((cmd) => cmd.command);
        if (!commands.includes(command)) {
            const pluginStatus = win.__APP_TEST__?.externalPlugins;
            const errors = win.__APP_TEST__?.errors;
            throw new Error(
                `Expected slash command ${command} to be registered. ` +
                    `Loaded plugins: ${JSON.stringify(pluginStatus?.loaded || [])}. ` +
                    `Failed plugins: ${JSON.stringify(pluginStatus?.failed || [])}. ` +
                    `Errors: ${JSON.stringify(errors || [])}.`
            );
        }
    });
});

Then('feature plugin {string} should be registered', (featureId) => {
    cy.window().should((win) => {
        const app = win.app;
        if (!app || !app.featureRegistry) {
            throw new Error('App feature registry not available on window');
        }
        const feature = app.featureRegistry.getFeature(featureId);
        expect(!!feature, `feature ${featureId} registered`).to.equal(true);
    });
});

Then('the file upload input should accept {string}', (token) => {
    cy.getByTestId('file-upload-input')
        .invoke('attr', 'accept')
        .then((accept) => {
            expect(accept).to.include(token);
        });
});
