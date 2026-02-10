describe('Factcheck review modal', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.selectTestModel('openai/gpt-4o-mini');
    });

    it('opens review modal after claim extraction', () => {
        const sseBody = [
            'event: message',
            'data: ["Claim A", "Claim B"]',
            '',
            'event: done',
            'data: {"tool_calls": []}',
            '',
            '',
        ].join('\n');

        cy.intercept('POST', '**/api/agents/run/stream', {
            statusCode: 200,
            headers: {
                'content-type': 'text/event-stream',
            },
            body: sseBody,
        }).as('factcheckExtract');
        cy.intercept('POST', '**/api/chat', {
            statusCode: 200,
            headers: {
                'content-type': 'text/event-stream',
            },
            body: sseBody,
        }).as('factcheckExtractChat');

        cy.runFeatureSlashCommand('/factcheck', 'The Eiffel Tower is 330 meters tall and located in Paris.');

        // App may use /api/agents/run/stream or fall back to /api/chat; wait for modal instead of a specific request
        cy.get('#factcheck-main-modal', { timeout: 15000 }).should('be.visible');
        cy.get('.factcheck-claim-input').should('have.length', 2);
        cy.get('.factcheck-claim-input').eq(0).should('have.value', 'Claim A');
        cy.get('.factcheck-claim-input').eq(1).should('have.value', 'Claim B');
        cy.get('#factcheck-selection-count').should('contain.text', '2 claims ready');
        cy.get('#factcheck-execute-btn').should('not.be.disabled');

        // Edit a claim and ensure count stays valid
        cy.get('.factcheck-claim-input').eq(0).clear().type('Claim A updated');
        cy.get('.factcheck-claim-input').eq(0).should('have.value', 'Claim A updated');
        cy.get('#factcheck-selection-count').should('contain.text', '2 claims ready');

        // Remove a claim
        cy.get('.factcheck-claim-row').eq(1).find('.factcheck-claim-remove').click();
        cy.get('.factcheck-claim-input').should('have.length', 1);
        cy.get('#factcheck-selection-count').should('contain.text', '1 claim ready');

        // Clear remaining claim to make modal invalid
        cy.get('.factcheck-claim-input').eq(0).clear();
        cy.get('#factcheck-selection-count').should('contain.text', '0 claims ready');
        cy.get('#factcheck-execute-btn').should('be.disabled');

        // Remove empty row and add a new claim
        cy.get('.factcheck-claim-row').eq(0).find('.factcheck-claim-remove').click();
        cy.get('.factcheck-claim-input').should('have.length', 0);
        cy.get('#factcheck-new-claim').type('New claim added');
        cy.get('#factcheck-add-claim-btn').click();
        cy.get('.factcheck-claim-input').should('have.length', 1);
        cy.get('.factcheck-claim-input').eq(0).should('have.value', 'New claim added');
        cy.get('#factcheck-selection-count').should('contain.text', '1 claim ready');
        cy.get('#factcheck-execute-btn').should('not.be.disabled');
    });
});
