/**
 * Regression test: selecting a node and sending a chat message MUST create
 * an edge from the selected node to the new human node.
 *
 * Bug history: handleSend() captured selectedIds but never passed them to
 * sendChatMessage/runAgent, resulting in disconnected nodes. Fixed by
 * threading parentIds through and extracting graph.createLinkedNode().
 */

describe('Reply to selected node creates edges', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.get('body', { timeout: 15000 }).should('have.attr', 'data-app-ready', 'true');
    });

    it('creates edge from selected node to new human node', () => {
        const targetId = 'e2e-reply-target';

        // Set up a node to reply to
        cy.window().then((win) => {
            const { app } = win;
            app.graph.addNode({
                id: targetId,
                type: 'note',
                title: 'Reply Target',
                content: 'Select me and reply',
                position: { x: 200, y: 200 },
                width: 420,
                height: 200,
                created_at: Date.now(),
                tags: [],
            });
            app.canvas.selectNode(targetId);
        });

        // Wait for node to render and be selected
        cy.get(`.node-wrapper[data-node-id="${targetId}"]`, { timeout: 10000 }).should('exist');

        // Send a message (should link to selected node)
        cy.sendMessage('Replying to selected node!');

        // Wait for new human node to appear
        cy.get('.node.human', { timeout: 10000 }).should('exist');

        // Verify edge exists from target to the new human node
        cy.window().then((win) => {
            const { app } = win;
            const allNodes = app.graph.getAllNodes();
            const humanNodes = allNodes.filter((n) => n.type === 'human');
            const newHuman = humanNodes[humanNodes.length - 1];

            expect(newHuman, 'human node should exist').to.exist;

            const parents = app.graph.getParents(newHuman.id);
            const parentIds = parents.map((p) => p.id);
            expect(parentIds, 'new human node should have the selected node as parent').to.include(targetId);
        });
    });

    it('creates merge edges when multiple nodes are selected', () => {
        const targetA = 'e2e-merge-a';
        const targetB = 'e2e-merge-b';

        cy.window().then((win) => {
            const { app } = win;
            const t = Date.now();
            app.graph.addNode({
                id: targetA,
                type: 'note',
                title: 'Merge Source A',
                content: 'First source',
                position: { x: 100, y: 200 },
                width: 420,
                height: 200,
                created_at: t,
                tags: [],
            });
            app.graph.addNode({
                id: targetB,
                type: 'note',
                title: 'Merge Source B',
                content: 'Second source',
                position: { x: 600, y: 200 },
                width: 420,
                height: 200,
                created_at: t + 1,
                tags: [],
            });
            // Select both nodes
            app.canvas.selectNode(targetA);
            app.canvas.selectNode(targetB, true); // additive
        });

        cy.get(`.node-wrapper[data-node-id="${targetA}"]`, { timeout: 10000 }).should('exist');

        cy.sendMessage('Synthesizing both sources');

        cy.get('.node.human', { timeout: 10000 }).should('exist');

        cy.window().then((win) => {
            const { app } = win;
            const allNodes = app.graph.getAllNodes();
            const humanNodes = allNodes.filter((n) => n.type === 'human');
            const newHuman = humanNodes[humanNodes.length - 1];

            const parents = app.graph.getParents(newHuman.id);
            const parentIds = parents.map((p) => p.id);
            expect(parentIds).to.include(targetA);
            expect(parentIds).to.include(targetB);

            // Multi-parent edges should be 'merge' type
            const edges = app.graph.getAllEdges();
            const parentEdges = edges.filter(
                (e) => e.target === newHuman.id && (e.source === targetA || e.source === targetB),
            );
            parentEdges.forEach((e) => {
                expect(e.type).to.equal('merge');
            });
        });
    });
});
