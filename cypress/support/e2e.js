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
