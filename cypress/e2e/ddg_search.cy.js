describe('DDG Search', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000); // Wait for plugins to load

        cy.intercept('POST', '**/api/ddg/search', {
            fixture: 'ddg-search-response.json',
        }).as('ddgSearch');
    });

    it('creates search node and reference nodes when using /search without Exa key', () => {
        cy.get('#chat-input').type('/search test query');
        cy.get('#send-btn').click();

        cy.wait('@ddgSearch');

        cy.get('.node.search', { timeout: 10000 })
            .should('be.visible')
            .and('contain', 'DuckDuckGo')
            .and('contain', 'Found 2 results');

        cy.get('.node.reference').should('have.length', 2);
        cy.get('.node.reference').first().should('contain', 'Example Result 1').and('contain', 'Snippet one.');
    });

    it('shows error in search node when DDG search fails', () => {
        cy.intercept('POST', '**/api/ddg/search', {
            statusCode: 500,
            body: { detail: 'Server error' },
        }).as('ddgSearchError');

        cy.get('#chat-input').type('/search fail query');
        cy.get('#send-btn').click();

        cy.wait('@ddgSearchError');

        cy.get('.node.search', { timeout: 10000 }).should('be.visible').and('contain', 'Error');
    });
});

describe('DDG Research', { tags: '@ai' }, () => {
    const ddgResearchSSEBody =
        'event: status\ndata: Generating initial search queries.\n\n' +
        'event: source\ndata: {"title":"Source 1","url":"https://example.com/1","summary":"Summary one.","query":"test"}\n\n' +
        'event: content\ndata: ## Research Report\ndata: \ndata: This is the final report.\n\n' +
        'event: sources\ndata: [{"title":"Source 1","url":"https://example.com/1"}]\n\n' +
        'event: done\ndata: \n\n';

    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(2000); // Wait for plugins and model picker to load

        cy.intercept('POST', '**/api/ddg/research', (req) => {
            req.reply({
                statusCode: 200,
                headers: { 'Content-Type': 'text/event-stream' },
                body: ddgResearchSSEBody,
            });
        }).as('ddgResearch');
    });

    it('creates research node and shows final report when using /research without Exa key', () => {
        cy.get('#chat-input').type('/research test topic');
        cy.get('#send-btn').click();

        cy.wait('@ddgResearch');

        cy.get('.node.research', { timeout: 15000 })
            .should('be.visible')
            .and('contain', 'Research')
            .and('contain', 'Research Report')
            .and('contain', 'This is the final report.');
    });

    it('shows error in research node when DDG research fails', () => {
        cy.intercept('POST', '**/api/ddg/research', {
            statusCode: 500,
            body: { detail: 'Server error' },
        }).as('ddgResearchError');

        cy.get('#chat-input').type('/research fail topic');
        cy.get('#send-btn').click();

        cy.wait('@ddgResearchError');

        cy.get('.node.research', { timeout: 15000 }).should('be.visible').and('contain', 'Error');
    });
});
