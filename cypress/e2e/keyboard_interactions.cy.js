describe('Keyboard Interactions', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
    });

    it('sends message with Enter key', () => {
        // Type note command and press Enter
        cy.get('#chat-input').type('/note Keyboard test{enter}');

        // Verify node created
        cy.get('.node').should('exist').and('contain', 'Keyboard test');
    });

    it('allows multi-line input with Shift+Enter', () => {
        // Type multi-line text
        cy.get('#chat-input').type('/note Line 1{shift+enter}Line 2');

        // Verify input has both lines
        cy.get('#chat-input').should('have.value', '/note Line 1\nLine 2');

        // Send with Enter
        cy.get('#chat-input').type('{enter}');

        // Verify node created with both lines
        cy.get('.node').should('contain', 'Line 1').and('contain', 'Line 2');
    });
});
