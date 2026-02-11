describe('Factcheck review modal', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.selectTestModel('openai/gpt-4o-mini');
    });

    it('opens review modal after claim extraction', () => {
        // Modal only appears when >5 claims; mock 6 so the selection modal is shown
        const claims = ['Claim A', 'Claim B', 'Claim C', 'Claim D', 'Claim E', 'Claim F'];
        const sseBody = [
            'event: message',
            `data: ${JSON.stringify(claims)}`,
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
        // Modal shows checkbox list (.factcheck-claim-item with .claim-text), first 5 pre-selected
        cy.get('.factcheck-claim-item').should('have.length', 6);
        cy.get('.factcheck-claim-item .claim-text').eq(0).should('contain.text', 'Claim A');
        cy.get('.factcheck-claim-item .claim-text').eq(1).should('contain.text', 'Claim B');
        cy.get('#factcheck-selection-count').should('contain.text', '5 of 6 selected');
        cy.get('#factcheck-execute-btn').should('not.be.disabled');

        // Uncheck one claim and assert count updates
        cy.get('#factcheck-claims-list input[type="checkbox"]').eq(0).uncheck();
        cy.get('#factcheck-selection-count').should('contain.text', '4 of 6 selected');
        cy.get('#factcheck-execute-btn').should('not.be.disabled');

        // Uncheck all but one; execute should still be enabled (≥1 required)
        cy.get('#factcheck-claims-list input[type="checkbox"]').uncheck();
        cy.get('#factcheck-claims-list input[type="checkbox"]').eq(0).check();
        cy.get('#factcheck-selection-count').should('contain.text', '1 of 6 selected');
        cy.get('#factcheck-execute-btn').should('not.be.disabled');

        // Uncheck last; execute should be disabled
        cy.get('#factcheck-claims-list input[type="checkbox"]').uncheck();
        cy.get('#factcheck-selection-count').should('contain.text', '0 of 6 selected');
        cy.get('#factcheck-execute-btn').should('be.disabled');
    });
});
