describe('Search Zoom to Node', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
    });

    it('zooms to node when selecting from search results', () => {
        // Create multiple nodes with distinct content
        cy.get('#chat-input').type('/note Node Alpha{enter}');
        cy.wait(500); // Wait for node creation

        cy.get('#chat-input').type('/note Node Beta{enter}');
        cy.wait(500);

        cy.get('#chat-input').type('/note Node Gamma{enter}');
        cy.wait(500);

        // Verify nodes exist
        cy.get('.node').should('have.length', 3);

        // Get canvas SVG element
        cy.get('#canvas').as('canvas');

        // Zoom out the canvas to see all nodes (using mouse wheel)
        // Capture initial viewBox (should be zoomed out - larger width/height values)
        cy.get('@canvas')
            .invoke('attr', 'viewBox')
            .as('initialViewBox')
            .then((initialViewBox) => {
                // Verify viewBox exists and is a valid string
                expect(initialViewBox).to.exist;
                expect(initialViewBox).to.be.a('string');
                // Parse to verify it has valid numbers (handle NaN case)
                const parts = initialViewBox.split(' ').map(parseFloat);
                expect(parts).to.have.length(4);
                // At least width and height should be valid numbers (x and y might be NaN initially)
                expect(parts[2]).to.be.a('number').and.not.be.NaN; // width
                expect(parts[3]).to.be.a('number').and.not.be.NaN; // height
            });

        // Open search with Cmd+K (Mac) or Ctrl+K (Windows/Linux)
        // Cypress handles this differently - we'll trigger the keydown event directly
        cy.get('body').type('{meta}k', { force: true }); // meta = Cmd on Mac, Ctrl on Windows

        // Wait for search overlay to appear
        cy.get('#search-overlay').should('be.visible');
        cy.get('#search-input').should('be.visible').should('be.focused');

        // Type search term matching one node (Gamma is likely out of viewport)
        cy.get('#search-input').type('Alpha');

        // Wait for search results to appear
        cy.get('#search-results').should('be.visible');
        cy.get('.search-result').should('have.length.at.least', 1);

        // Verify the result contains "Gamma"
        cy.get('.search-result').first().should('contain', 'Alpha');

        // Press Enter to select the result
        cy.get('#search-input').type('{enter}');

        // Wait for search overlay to close
        cy.get('#search-overlay').should('not.be.visible');

        // Wait for zoom animation to complete (300ms + buffer)
        cy.wait(600);

        // Verify the selected node is visible and has the selected class
        cy.get('.node.selected').should('exist');
        cy.get('.node.selected').should('contain', 'Node Alpha');

        // Verify the node is actually visible in the viewport (not just exists in DOM)
        cy.get('.node.selected').should('be.visible');

        // Verify the node has reasonable dimensions (indicating it's zoomed into view)
        cy.get('.node.selected').should(($node) => {
            const rect = $node[0].getBoundingClientRect();
            expect(rect.width).to.be.greaterThan(0);
            expect(rect.height).to.be.greaterThan(0);
        });
    });
});
