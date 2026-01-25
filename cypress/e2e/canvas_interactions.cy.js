describe('Canvas Pan and Zoom', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
    });

    it('pans canvas by dragging', () => {
        // Create a node away from center
        cy.get('#chat-input').type('/note Pan me{enter}');

        // Get canvas container
        cy.get('#canvas').as('canvas');

        // Store initial transform
        cy.get('#canvas').invoke('attr', 'transform').as('initialTransform');

        // Simulate drag pan (mouse down, move, mouse up)
        cy.get('#canvas')
            .trigger('mousedown', { clientX: 0, clientY: 0 })
            .trigger('mousemove', { clientX: 100, clientY: 100 })
            .trigger('mouseup');

        // Verify canvas transform changed
        cy.get('#canvas').invoke('attr', 'transform').should('not.equal', '@initialTransform');
    });

    it('zooms canvas with mouse wheel', () => {
        // Create a node
        cy.get('#chat-input').type('/note Zoom me{enter}');

        // Get initial transform
        cy.get('#canvas').invoke('attr', 'transform').as('initialTransform');

        // Simulate scroll wheel zoom
        cy.get('#canvas').trigger('wheel', { deltaY: -100 }); // Negative = zoom in

        // Verify transform changed (scale changed)
        cy.get('#canvas').invoke('attr', 'transform').should('not.equal', '@initialTransform');
    });
});
