describe('New Canvas', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.get('#chat-input', { timeout: 15000 }).should('be.visible');
    });

    it('clears canvas when clicking new canvas button', () => {
        // Create a note node first
        cy.get('#chat-input').type('/note Test node{enter}');
        cy.get('.node').should('have.length', 1);

        // Click new canvas button (📄 icon)
        cy.get('#new-canvas-btn').click();

        // Verify all nodes are gone
        cy.get('.node').should('not.exist');
    });
});
