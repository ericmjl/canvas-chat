/**
 * URL fetch: ensure content from fetched pages cannot break the app UI.
 *
 * If raw HTML with <style>body{display:none}</style> were injected into node
 * content, the toolbar and canvas would disappear. Backend converts HTML to
 * markdown, and the frontend strips <style>/<script> from rendered output.
 * This test stubs the API to return dangerous HTML and verifies the UI stays usable.
 */

const DANGEROUS_HTML_CONTENT =
    '<style>body{display:none;}.node{visibility:hidden;}</style>' +
    '<p>Fetched content that would break the UI if injected raw.</p>';

describe('URL fetch does not break UI', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000); // Wait for plugins to load

        cy.intercept('POST', '**/api/fetch-url', (req) => {
            req.reply({
                statusCode: 200,
                body: {
                    url: 'https://example.com/page',
                    title: 'Example Page',
                    content: DANGEROUS_HTML_CONTENT,
                    metadata: {},
                },
            });
        }).as('fetchUrl');
    });

    it('when API returns HTML with inline styles, toolbar and canvas remain visible', () => {
        cy.get('#chat-input').type('/fetch https://example.com/page');
        cy.get('#send-btn').click();

        cy.wait('@fetchUrl');

        // Node should appear with the text content (style tags stripped client-side)
        cy.get('.node.fetch-result', { timeout: 10000 })
            .should('be.visible')
            .and('contain', 'Fetched content that would break the UI');

        // UI must still be usable: toolbar and chat input visible
        // (If we had injected the raw <style>, body would be hidden and these would fail)
        cy.get('#toolbar').should('be.visible');
        cy.get('#chat-input').should('be.visible');
        cy.get('#send-btn').should('be.visible');
    });
});
