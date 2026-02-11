describe('Node Selection and Deletion', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('selects and deletes a node', () => {
        // Create two note nodes (wait for first so both get created)
        cy.get('#chat-input').type('/note Node 1{enter}');
        cy.get('.node', { timeout: 10000 }).should('have.length', 1);
        cy.get('#chat-input').type('/note Node 2{enter}');

        // Verify both nodes exist
        cy.get('.node', { timeout: 10000 }).should('have.length', 2);

        // Click first node to select it (force click in case it's off-screen)
        cy.get('.node').first().click({ force: true });

        // Verify selection via CSS class
        cy.get('.node').first().should('have.class', 'selected');

        // Delete selected node
        cy.get('.node.selected .delete-btn').click({ force: true });

        // Wait for deletion animation
        cy.wait(500);

        // Verify only one node remains
        cy.get('.node').should('have.length', 1);
    });
});
