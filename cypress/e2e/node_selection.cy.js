describe('Node Selection and Deletion', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
    });

    it('selects and deletes a node', () => {
        // Create two note nodes
        cy.get('#chat-input').type('/note Node 1{enter}');
        cy.get('#chat-input').type('/note Node 2{enter}');

        // Verify both nodes exist
        cy.get('.node').should('have.length', 2);

        // Click first node to select it
        cy.get('.node').first().click();

        // Verify selection via CSS class
        cy.get('.node').first().should('have.class', 'selected');

        // Delete selected node
        cy.get('.node.selected .node-action.delete-btn').click();

        // Verify only one node remains
        cy.get('.node').should('have.length', 1);
    });
});
