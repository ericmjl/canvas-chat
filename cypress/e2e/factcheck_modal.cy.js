describe('Factcheck review modal', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('opens review modal after claim extraction', () => {
        const sseBody = ['data: ["Claim A", "Claim B"]', '', 'event: done', 'data: done', ''].join('\n');

        cy.intercept('POST', '/api/chat', {
            statusCode: 200,
            headers: {
                'content-type': 'text/event-stream',
            },
            body: sseBody,
        }).as('factcheckExtract');

        cy.sendMessage('/factcheck The Eiffel Tower is 330 meters tall and located in Paris.');

        cy.wait('@factcheckExtract');
        cy.get('#factcheck-main-modal', { timeout: 10000 }).should('be.visible');
        cy.get('.factcheck-claim-input').should('have.length', 2);
        cy.get('.factcheck-claim-input').eq(0).should('have.value', 'Claim A');
        cy.get('.factcheck-claim-input').eq(1).should('have.value', 'Claim B');
    });
});
