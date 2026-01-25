/// <reference types="cypress" />

// Clear localStorage and IndexedDB before each test
beforeEach(() => {
    cy.clearLocalStorage();
    cy.clearIndexedDB();
});

// Custom command to clear IndexedDB
Cypress.Commands.add('clearIndexedDB', () => {
    cy.window().then((win) => {
        const request = win.indexedDB.deleteDatabase('canvas-chat');
        request.onsuccess = () => cy.log('IndexedDB cleared');
        request.onerror = (err) => cy.log('IndexedDB clear error:', err);
    });
});
