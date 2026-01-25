describe('Note Node Creation', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
    });

    it('creates a note node via /note command', () => {
        // Type slash command
        cy.get('#chat-input').type('/note This is a test note');

        // Send message
        cy.get('#send-btn').click();

        // Verify node was created
        cy.get('.node').should('exist').and('be.visible').and('contain', 'This is a test note');
    });
});
