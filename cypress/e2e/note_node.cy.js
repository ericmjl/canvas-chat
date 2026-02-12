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

    it('new note is brought into view after creation (viewport focus)', () => {
        cy.get('#chat-input').type('/note Viewport focus test');
        cy.get('#send-btn').click();
        cy.wait(400); // pan animation is 300ms
        cy.get('.node')
            .should('exist')
            .and('be.visible')
            .and('contain', 'Viewport focus test');
        cy.get('.node').should(($n) => {
            const rect = $n[0].getBoundingClientRect();
            expect(rect.width).to.be.greaterThan(0);
            expect(rect.height).to.be.greaterThan(0);
        });
    });
});
