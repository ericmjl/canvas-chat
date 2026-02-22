describe('Matrix row and column header click', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(2000); // Wait for plugins to load

        // Mock parse-two-lists API to return deterministic 2x3 matrix
        cy.intercept('POST', '/api/parse-two-lists', {
            statusCode: 200,
            body: {
                rows: ['Python', 'JavaScript'],
                columns: ['Ease of use', 'Ecosystem', 'Safety'],
            },
        }).as('parseTwoLists');

        // Mock matrix/fill so we can fill one cell for non-empty slice content
        cy.intercept('POST', '/api/matrix/fill', (req) => {
            const key = `${req.body.row_item}-${req.body.col_item}`;
            const content = key === 'Python-Ease of use' ? 'Great for beginners.' : 'Filled.';
            const response = `event: message\ndata: ${content}\n\nevent: done\ndata: \n\n`;
            req.reply({
                statusCode: 200,
                headers: { 'Content-Type': 'text/event-stream' },
                body: response,
            });
        }).as('matrixFillStream');
    });

    it('clicking row header opens slice modal with row details', () => {
        cy.get('#chat-input').type('/matrix Compare languages');
        cy.get('#send-btn').click();
        cy.wait('@parseTwoLists');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Fill cell (0,0) so row slice has content to assert
        cy.get('.node.matrix .matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait('@matrixFillStream', { timeout: 5000 });
        cy.get('.node.matrix .matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'filled');

        // Click first row header (Python)
        cy.get('.node.matrix .row-header[data-row="0"]').click();

        // Slice modal should be visible with Row Details
        cy.get('#matrix-slice-modal', { timeout: 5000 }).should('be.visible');
        cy.get('#slice-title').should('have.text', 'Row Details');
        cy.get('#slice-label').should('contain', 'Row');
        cy.get('#slice-item').should('have.text', 'Python');
        cy.get('#slice-content').should('contain', 'Ease of use');
        cy.get('#slice-content').should('contain', 'Great for beginners');
    });

    it('clicking column header opens slice modal with column details', () => {
        cy.get('#chat-input').type('/matrix Compare languages');
        cy.get('#send-btn').click();
        cy.wait('@parseTwoLists');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Fill cell (0,0) so column slice has at least one non-empty cell
        cy.get('.node.matrix .matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait('@matrixFillStream', { timeout: 5000 });
        cy.get('.node.matrix .matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'filled');

        // Click first column header (Ease of use)
        cy.get('.node.matrix .col-header[data-col="0"]').click();

        // Slice modal should be visible with Column Details
        cy.get('#matrix-slice-modal', { timeout: 5000 }).should('be.visible');
        cy.get('#slice-title').should('have.text', 'Column Details');
        cy.get('#slice-label').should('contain', 'Column');
        cy.get('#slice-item').should('have.text', 'Ease of use');
        cy.get('#slice-content').should('contain', 'Python');
        cy.get('#slice-content').should('contain', 'Great for beginners');
    });
});
