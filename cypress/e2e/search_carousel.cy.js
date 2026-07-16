/**
 * E2E: Search results carousel drawer interactions.
 *
 * Covers the redesigned /search: results render in a carousel drawer on the
 * SEARCH node. Verifies next/prev navigation, the include-in-context checkbox,
 * and the "View content" action which fetches the page and creates an opt-in
 * child reference node.
 *
 * APIs mocked for determinism:
 * - /api/ddg/search (fixture)
 * - /api/fetch-url (page text for "View content")
 */
describe('Search results carousel', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000); // Wait for plugins to load

        cy.intercept('POST', '**/api/ddg/search', {
            fixture: 'ddg-search-response.json',
        }).as('ddgSearch');

        cy.intercept('POST', '**/api/fetch-url', {
            statusCode: 200,
            body: { title: 'Example Result 1', content: 'FULL PAGE BODY TEXT' },
        }).as('fetchUrl');
    });

    it('navigates results with next/prev', () => {
        cy.get('#chat-input').type('/search test query');
        cy.get('#send-btn').click();
        cy.wait('@ddgSearch');

        cy.get('.search-carousel-counter').should('contain', '1 / 2');
        cy.get('.search-carousel-title').should('contain', 'Example Result 1');

        // Next -> second result
        cy.get('.search-next').click();
        cy.get('.search-carousel-counter').should('contain', '2 / 2');
        cy.get('.search-carousel-title').should('contain', 'Example Result 2');

        // Prev -> back to first
        cy.get('.search-prev').click();
        cy.get('.search-carousel-title').should('contain', 'Example Result 1');
    });

    it('toggles include-in-context checkbox', () => {
        cy.get('#chat-input').type('/search test query');
        cy.get('#send-btn').click();
        cy.wait('@ddgSearch');

        // Defaults to selected (checked)
        cy.get('.search-toggle-select').should('be.checked');
        cy.get('.search-toggle-select').uncheck();
        cy.get('.search-toggle-select').should('not.be.checked');
    });

    it('View content fetches the page and creates an opt-in child reference node', () => {
        cy.get('#chat-input').type('/search test query');
        cy.get('#send-btn').click();
        cy.wait('@ddgSearch');

        // No reference nodes initially
        cy.get('.node.reference').should('have.length', 0);

        cy.get('.search-view-content').click();
        cy.wait('@fetchUrl');

        // A child reference node is created carrying the fetched page text
        cy.get('.node.reference', { timeout: 10000 })
            .should('have.length', 1)
            .and('contain', 'FULL PAGE BODY TEXT');
    });
});
