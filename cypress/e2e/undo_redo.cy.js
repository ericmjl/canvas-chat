describe('Undo and Redo', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('undos and redos node deletion', () => {
        // Create two nodes
        cy.get('#chat-input').type('/note Node 1{enter}');
        cy.get('#chat-input').type('/note Node 2{enter}');
        cy.get('.node').should('have.length', 2);

        // Delete first node
        cy.get('.node').first().click({ force: true });
        cy.get('.node.selected .delete-btn').click({ force: true });
        cy.wait(500);
        cy.get('.node').should('have.length', 1);

        // Undo deletion
        cy.get('#undo-btn').click();
        cy.wait(500);

        // Verify node is restored (2 nodes again)
        cy.get('.node').should('have.length', 2);

        // Redo deletion
        cy.get('#redo-btn').click();
        cy.wait(500);

        // Verify node is deleted again (1 node)
        cy.get('.node').should('have.length', 1);
    });
});
