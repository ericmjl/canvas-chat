/**
 * Graph context breadcrumb: parent > current > children when one node is selected.
 * @spec NAV-UI-001, NAV-UI-011
 */

describe('Breadcrumb relationship panel', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.get('body', { timeout: 15000 }).should('have.attr', 'data-app-ready', 'true');
    });

    it('shows parent chip and navigates when child is selected', () => {
        const parentId = 'e2e-rel-parent';
        const childId = 'e2e-rel-child';
        const edgeId = 'e2e-rel-edge';

        cy.window().then((win) => {
            const { app } = win;
            const t = Date.now();
            const parent = {
                id: parentId,
                type: 'note',
                title: 'E2E Parent Node',
                content: 'parent',
                position: { x: 120, y: 120 },
                width: 420,
                height: 200,
                created_at: t,
                tags: [],
            };
            const child = {
                id: childId,
                type: 'note',
                title: 'E2E Child Node',
                content: 'child',
                position: { x: 600, y: 120 },
                width: 420,
                height: 200,
                created_at: t + 1,
                tags: [],
            };
            app.graph.addNode(parent);
            app.graph.addNode(child);
            app.graph.addEdge({
                id: edgeId,
                source: parentId,
                target: childId,
                type: 'reply',
            });
            // Selecting programmatically matches single-node selection used by the panel
            app.canvas.selectNode(childId);
        });

        cy.get(`.node-wrapper[data-node-id="${childId}"]`, { timeout: 10000 }).should('exist');

        cy.get('#relationship-panel').should('be.visible');
        cy.get('#relationship-breadcrumb .rel-crumb-inline')
            .should('have.length', 1)
            .should('contain', 'E2E Parent');

        cy.get('#relationship-breadcrumb .rel-crumb-inline').first().click({ force: true });

        cy.get(`.node-wrapper[data-node-id="${parentId}"] .node`).should('have.class', 'selected');
    });
});
