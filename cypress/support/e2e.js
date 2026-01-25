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
