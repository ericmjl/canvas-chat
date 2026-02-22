/**
 * Matrix Fill All: cell spinners appear immediately and disappear when filled.
 * Uses mocked APIs only (no real LLM) for fast runs.
 */
describe('Matrix Fill All spinners', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(2000);

        cy.intercept('POST', '/api/parse-two-lists', {
            statusCode: 200,
            body: {
                rows: ['A', 'B'],
                columns: ['X', 'Y'],
            },
        }).as('parseTwoLists');

        // Reply with SSE after a short delay so we can assert spinners first
        cy.intercept('POST', '/api/matrix/fill', (req) => {
            const content = `${req.body.row_item} vs ${req.body.col_item}: done.`;
            const response = `event: message\ndata: ${content}\n\nevent: done\ndata: \n\n`;
            req.reply({
                delay: 600,
                statusCode: 200,
                headers: { 'Content-Type': 'text/event-stream' },
                body: response,
            });
        }).as('matrixFill');
    });

    it('shows spinners in all empty cells when Fill All is clicked', () => {
        cy.get('#chat-input').type('/matrix Compare');
        cy.get('#send-btn').click();
        cy.wait('@parseTwoLists');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // All 4 cells should be empty
        cy.get('.node.matrix .matrix-cell.empty').should('have.length', 4);

        // Click Fill All
        cy.get('.node.matrix .matrix-fill-all-btn').click();

        // Spinners should appear immediately in all empty cells
        cy.get('.node.matrix .matrix-cell.filling', { timeout: 3000 }).should(
            'have.length',
            4
        );

        // Wait for all 4 fill requests (they run in parallel)
        cy.wait('@matrixFill', { timeout: 5000 });
        cy.wait('@matrixFill', { timeout: 5000 });
        cy.wait('@matrixFill', { timeout: 5000 });
        cy.wait('@matrixFill', { timeout: 5000 });

        // All cells should be filled (spinners gone)
        cy.get('.node.matrix .matrix-cell.filled', { timeout: 8000 }).should(
            'have.length',
            4
        );
        cy.get('.node.matrix .matrix-cell.filling').should('have.length', 0);
    });
});
