describe('Matrix Undo/Redo', () => {
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
                columns: ['Performance', 'Ease of Learning', 'Ecosystem'],
            },
        }).as('parseTwoLists');

        // Mock matrix/fill API to return deterministic cell content via SSE
        cy.intercept('POST', '/api/matrix/fill', (req) => {
            const cellResponses = {
                'Python-Performance': 'Excellent performance with JIT',
                'JavaScript-Ease of Learning': 'Easy to learn for web devs',
            };

            const key = `${req.body.row_item}-${req.body.col_item}`;
            const content = cellResponses[key];

            if (content) {
                const response = `event: message\ndata: ${content}\n\nevent: done\ndata: \n\n`;
                req.reply({
                    statusCode: 200,
                    headers: { 'Content-Type': 'text/event-stream' },
                    body: response,
                });
            } else {
                req.reply({ statusCode: 500, body: 'Unknown cell' });
            }
        }).as('matrixFillStream');
    });

    it('undos and redos a single cell fill', () => {
        // Create matrix
        cy.get('#chat-input').type('/matrix Test undo');
        cy.get('#send-btn').click();
        cy.wait('@parseTwoLists');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Fill cell (0,0)
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait('@matrixFillStream', { timeout: 5000 });
        cy.get('.matrix-cell[data-row="0"][data-col="0"]')
            .should('have.class', 'filled')
            .find('.matrix-cell-content')
            .should('contain', 'Excellent performance');

        // Undo
        cy.get('#undo-btn').click();
        cy.get('.matrix-cell[data-row="0"][data-col="0"]')
            .should('have.class', 'empty')
            .find('.matrix-cell-fill')
            .should('be.visible');

        // Redo
        cy.get('#redo-btn').click();
        cy.get('.matrix-cell[data-row="0"][data-col="0"]')
            .should('have.class', 'filled')
            .find('.matrix-cell-content')
            .should('contain', 'Excellent performance');
    });

    it('undos multiple cell fills in LIFO order', () => {
        // Create matrix
        cy.get('#chat-input').type('/matrix Test multiple');
        cy.get('#send-btn').click();
        cy.wait('@parseTwoLists');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Fill cell (0,0)
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait('@matrixFillStream', { timeout: 5000 });
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'filled');

        // Fill cell (1,1)
        cy.get('.matrix-cell[data-row="1"][data-col="1"]').click();
        cy.wait('@matrixFillStream', { timeout: 5000 });
        cy.get('.matrix-cell[data-row="1"][data-col="1"]').should('have.class', 'filled');

        // Undo once - should clear second cell (LIFO)
        cy.get('#undo-btn').click();
        cy.get('.matrix-cell[data-row="1"][data-col="1"]').should('have.class', 'empty');
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'filled');

        // Redo - should restore second cell
        cy.get('#redo-btn').click();
        cy.get('.matrix-cell[data-row="1"][data-col="1"]').should('have.class', 'filled');
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'filled');
    });
});
