describe('Matrix Creation', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
        cy.configureOllama();
        cy.get('#model-picker', { timeout: 10000 }).should('not.be.empty');
    });

    it('creates matrix node with /matrix command', { tags: '@ai' }, () => {
        // Select the configured Ollama model for CI
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');

        // Send matrix creation command with context
        cy.sendMessage('/matrix Compare programming languages');

        // Wait for modal to appear
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');

        // Wait for LLM to parse rows and columns (may take some time with Ollama)
        cy.wait(15000);

        // Verify matrix creation modal has loaded rows and columns
        cy.get('#row-items').should('be.visible');
        cy.get('#col-items').should('be.visible');

        // Create matrix node
        cy.get('#matrix-create-btn').click();

        // Verify modal is closed
        cy.get('#matrix-main-modal').should('not.be.visible');

        // Verify matrix node appears on canvas
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Verify matrix has context
        cy.get('.node.matrix .matrix-context-text').should('contain', 'Compare programming languages');

        // Verify matrix table is rendered
        cy.get('.node.matrix .matrix-table').should('be.visible');

        // Verify matrix has rows
        cy.get('.node.matrix .row-header').should('have.length.at.least', 1);

        // Verify matrix has columns
        cy.get('.node.matrix .col-header').should('have.length.at.least', 1);

        // Verify cells are present (empty)
        cy.get('.node.matrix .matrix-cell.empty').should('have.length.at.least', 1);
    });

    it('matrix node has edit and fill all buttons', { tags: '@ai' }, () => {
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');
        cy.sendMessage('/matrix Test matrix context');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.wait(15000);
        cy.get('#matrix-create-btn').click();
        cy.get('#matrix-main-modal').should('not.be.visible');
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Verify matrix actions are visible
        cy.get('.node.matrix .matrix-edit-btn').should('be.visible');
        cy.get('.node.matrix .matrix-fill-all-btn').should('be.visible');
        cy.get('.node.matrix .matrix-clear-all-btn').should('be.visible');
    });

    it('matrix node displays context and dimensions in summary', { tags: '@ai' }, () => {
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');
        cy.sendMessage('/matrix Evaluate frameworks');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');
        cy.wait(15000);
        cy.get('#matrix-create-btn').click();
        cy.get('#matrix-main-modal').should('not.be.visible');
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        // Zoom out to see summary
        cy.get('#canvas').trigger('wheel', { deltaY: 100 });

        // Verify summary text shows context (when zoomed out)
        cy.get('.node.matrix .summary-text').should('contain', 'Evaluate frameworks');
    });
});
