/**
 * E2E: Matrix web search (ground evaluations with web search).
 * Single highest-priority test: create matrix with "Ground with web search" checked,
 * fill one cell (mocked search + fill), assert Sources section appears.
 *
 * All LLM-backed API calls in this flow are mocked (no real Ollama/OpenAI/Exa):
 * - /api/parse-two-lists (LLM parses rows/columns)
 * - /api/refine-query (LLM refines search query)
 * - /api/generate-summary (LLM summarizes node for zoom; runs after matrix create)
 * - /api/matrix/fill (LLM generates cell content; mocked as SSE)
 * - /api/ddg/search (non-LLM; mocked for deterministic results)
 */
describe('Matrix Web Search', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(2000);

        // LLM: parse rows/columns from context
        cy.intercept('POST', '/api/parse-two-lists', {
            statusCode: 200,
            body: {
                rows: ['Python', 'JavaScript'],
                columns: ['Performance', 'Ease of Learning'],
            },
        }).as('parseTwoLists');

        // LLM: refine search query (web grounding)
        cy.intercept('POST', '/api/refine-query', {
            statusCode: 200,
            body: { refined_query: 'programming languages performance ease of learning' },
        }).as('refineQuery');

        // LLM: generate node summary (runs after matrix create)
        cy.intercept('POST', '/api/generate-summary', {
            statusCode: 200,
            body: { summary: 'Matrix evaluation' },
        }).as('generateSummary');

        // Non-LLM: web search (DDG)
        cy.intercept('POST', '/api/ddg/search', {
            statusCode: 200,
            body: {
                results: [
                    {
                        title: 'Programming Languages Comparison',
                        url: 'https://example.com/lang-comparison',
                        snippet: 'Comparison of performance and ease of learning.',
                    },
                ],
            },
        }).as('webSearch');

        // LLM: fill matrix cell (mocked as SSE)
        cy.intercept('POST', '/api/matrix/fill', (req) => {
            const content = `Grounded evaluation for ${req.body.row_item} vs ${req.body.col_item}.`;
            const response = `event: message\ndata: ${content}\n\nevent: done\ndata: \n\n`;
            req.reply({
                statusCode: 200,
                headers: { 'Content-Type': 'text/event-stream' },
                body: response,
            });
        }).as('matrixFill');
    });

    it('shows Sources section after filling a cell when Ground with web search is checked', () => {
        cy.get('#chat-input').type('/matrix Compare languages by performance and ease');
        cy.get('#send-btn').click();
        cy.wait('@parseTwoLists');
        cy.get('#matrix-main-modal', { timeout: 10000 }).should('be.visible');

        cy.get('#matrix-ground-with-web').check();

        cy.get('#matrix-create-btn').click();
        cy.get('#matrix-main-modal').should('not.be.visible');
        cy.get('.node.matrix', { timeout: 10000 }).should('be.visible');

        cy.get('.matrix-cell[data-row="0"][data-col="0"]').click();
        cy.wait('@refineQuery', { timeout: 5000 });
        cy.wait('@webSearch', { timeout: 5000 });
        cy.wait('@matrixFill', { timeout: 5000 });

        cy.get('.matrix-cell[data-row="0"][data-col="0"]').should('have.class', 'filled');
        // Sources appear in the output panel (drawer); expand it to see content
        cy.get('.output-panel-wrapper .code-output-toggle', { timeout: 5000 }).click();
        cy.get('.output-panel-wrapper .matrix-sources-drawer', { timeout: 5000 }).should('be.visible');
        cy.get('.output-panel-wrapper .matrix-sources-drawer-header').should('contain', 'Sources (1)');
        cy.get('.output-panel-wrapper .matrix-source-link')
            .should('have.attr', 'href', 'https://example.com/lang-comparison')
            .and('contain', 'Programming Languages Comparison');
    });
});
