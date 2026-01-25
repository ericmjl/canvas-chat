describe('Matrix Undo/Redo', { tags: ['@ai'] }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
        cy.configureOllama();
        cy.get('#model-picker', { timeout: 10000 }).should('not.be.empty');
    });

    it('undos a matrix cell fill', () => {
        // Create matrix
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');
        cy.sendMessage('/matrix Test matrix');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.wait(15000);
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Fill first cell (0,0)
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait(10000);

        // Get original content
        cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content').then(($cell) => {
            const originalContent = $cell.text();

            // Undo
            cy.get('#undo-btn').click();
            cy.wait(500);

            // Verify cell is empty
            cy.get('.matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'empty');
            cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content').should('not.exist');

            // Redo
            cy.get('#redo-btn').click();
            cy.wait(500);

            // Verify cell has original content
            cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content')
                .should('have.text', originalContent)
                .should('be.visible');
        });
    });

    it('undos multiple cell fills independently', () => {
        // Create matrix
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');
        cy.sendMessage('/matrix Multi cell test');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.wait(15000);
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Fill two cells
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait(10000);
        cy.get('.matrix-cell[data-row="1"][data-col="1"]').click();
        cy.wait(10000);

        // Get content of both cells
        cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content').then(($cell1) => {
            const content1 = $cell1.text();

            cy.get('.matrix-cell[data-row="1"][data-col="1"] .matrix-cell-content').then(($cell2) => {
                const content2 = $cell2.text();

                // Undo once - should undo last cell fill
                cy.get('#undo-btn').click();
                cy.wait(500);

                // Cell (1,1) should be empty, cell (0,0) should still have content
                cy.get('.matrix-cell[data-row="1"][data-col="1"]').should('have.class', 'empty');
                cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content').should('have.text', content1);

                // Redo
                cy.get('#redo-btn').click();
                cy.wait(500);

                // Both cells should have content
                cy.get('.matrix-cell[data-row="1"][data-col="1"] .matrix-cell-content').should('have.text', content2);
                cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content').should('have.text', content1);
            });
        });
    });

    it('undos cell fill when matrix rows/columns were edited', () => {
        // Create matrix
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');
        cy.sendMessage('/matrix Edit test');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.wait(15000);
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Edit matrix to change structure
        cy.get('.matrix-edit-btn').click();
        cy.get('#edit-matrix-modal').should('be.visible');

        // Add a row
        cy.get('#edit-add-row-btn').click();
        cy.get('#edit-matrix-save-btn').click();
        cy.get('#edit-matrix-modal').should('not.be.visible');

        // Fill a cell
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait(10000);

        // Get content
        cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content').then(($cell) => {
            const originalContent = $cell.text();

            // Undo cell fill
            cy.get('#undo-btn').click();
            cy.wait(500);

            // Cell should be empty
            cy.get('.matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'empty');

            // Redo
            cy.get('#redo-btn').click();
            cy.wait(500);

            // Cell should have content
            cy.get('.matrix-cell[data-row="0"][data-col="0"] .matrix-cell-content').should(
                'have.text',
                originalContent
            );
        });
    });

    it('updates undo/redo button states during cell fill', () => {
        // Create matrix
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');
        cy.sendMessage('/matrix Undo state test');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.wait(15000);
        cy.get('#matrix-create-btn').click();
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Initially, undo should be disabled (no cell fills yet)
        cy.get('#undo-btn').should('have.attr', 'disabled');

        // Fill a cell
        cy.get('.matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait(10000);

        // Undo should be enabled
        cy.get('#undo-btn').should('not.have.attr', 'disabled');
        cy.get('#redo-btn').should('have.attr', 'disabled');

        // Undo
        cy.get('#undo-btn').click();
        cy.wait(500);

        // Redo should be enabled
        cy.get('#redo-btn').should('not.have.attr', 'disabled');
    });
});
