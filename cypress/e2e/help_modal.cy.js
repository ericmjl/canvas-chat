describe('Help Modal and Auto-Layout', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.get('#chat-input', { timeout: 15000 }).should('be.visible');
        cy.get('body[data-app-ready="true"]', { timeout: 20000 }).should('exist');
    });

    it('opens and closes help modal', () => {
        // Click help button (❓ icon)
        cy.get('#help-btn').click();

        // Verify help modal appears
        cy.get('#help-modal').should('be.visible');

        // Click close button (×)
        cy.get('#help-close').click();

        // Verify modal is hidden
        cy.get('#help-modal').should('not.be.visible');
    });

    it('clicks auto-layout button', () => {
        // Create two nodes
        cy.get('#chat-input').type('/note Node 1{enter}');
        cy.get('#chat-input').type('/note Node 2{enter}');
        cy.get('.node').should('have.length', 2);

        // Click auto-layout button (🔀 icon)
        cy.get('#auto-layout-btn').click();

        // Wait a bit for layout to apply
        cy.wait(500);

        // Verify nodes still exist (layout shouldn't delete them)
        cy.get('.node').should('have.length', 2);
    });
});
