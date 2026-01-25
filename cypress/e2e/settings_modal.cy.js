describe('Settings Modal', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000); // Wait for app to fully initialize
    });

    it('opens and closes settings modal', () => {
        // Click settings button (⚙️ icon)
        cy.get('#settings-btn').click();

        // Verify settings modal appears
        cy.get('#settings-modal').should('be.visible');

        // Click close button (×)
        cy.get('#settings-close').click();

        // Verify modal is hidden
        cy.get('#settings-modal').should('not.be.visible');
    });
});
