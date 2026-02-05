/**
 * PDF Output Panel E2E tests.
 *
 * Verifies that PDF nodes show extracted text in the output panel with page
 * headings, that the panel can be expanded by default, and that page IDs
 * exist for scroll targeting.
 */

const PDF_NODE_ID = 'test-pdf-output-panel-node';

describe('PDF Output Panel', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('displays output panel with extracted text for PDF nodes', () => {
        cy.window().then((win) => {
            const { app } = win;
            const pdfContent = [
                '## Page 1',
                '',
                'First page extract text.',
                '',
                '## Page 2',
                '',
                'Second page extract text.',
            ].join('\n');
            const pdfNode = {
                id: PDF_NODE_ID,
                type: 'fetch_result',
                title: 'Test PDF',
                content: pdfContent,
                metadata: { content_type: 'pdf' },
                position: { x: 100, y: 100 },
                width: 640,
                height: 480,
            };
            app.graph.addNode(pdfNode);
            app.canvas.renderNode(pdfNode);
        });

        cy.get('.node.fetch-result', { timeout: 5000 }).should('be.visible');
        cy.get(`.output-panel-wrapper[data-node-id="${PDF_NODE_ID}"]`, { timeout: 5000 }).should(
            'exist'
        );

        cy.get(`.output-panel-wrapper[data-node-id="${PDF_NODE_ID}"]`).within(() => {
            cy.get('.code-output-panel-body').should('be.visible');
            cy.get('#pdf-page-1').should('exist').and('contain', 'Page 1');
            cy.get('#pdf-page-2').should('exist').and('contain', 'Page 2');
            cy.get('.code-output-panel-body').should('contain', 'First page extract text');
            cy.get('.code-output-panel-body').should('contain', 'Second page extract text');
        });
    });

    it('expands output panel by default when outputExpanded is true', () => {
        cy.window().then((win) => {
            const { app } = win;
            const pdfContent = '## Page 1\n\nContent.';
            const pdfNode = {
                id: 'test-pdf-expanded',
                type: 'fetch_result',
                title: 'Test PDF',
                content: pdfContent,
                metadata: { content_type: 'pdf' },
                outputExpanded: true,
                position: { x: 100, y: 100 },
                width: 640,
                height: 480,
            };
            app.graph.addNode(pdfNode);
            app.canvas.renderNode(pdfNode);
        });

        cy.get('.node.fetch-result', { timeout: 5000 }).should('be.visible');
        cy.get('.output-panel-wrapper[data-node-id="test-pdf-expanded"]', { timeout: 5000 })
            .within(() => {
                cy.get('.code-output-panel').should('have.class', 'expanded');
            });
    });

    it('output panel has page heading IDs for scroll targeting', () => {
        cy.window().then((win) => {
            const { app } = win;
            const pdfContent = '## Page 1\n\nA.\n\n## Page 2\n\nB.';
            const pdfNode = {
                id: 'test-pdf-ids',
                type: 'fetch_result',
                title: 'Test PDF',
                content: pdfContent,
                metadata: { content_type: 'pdf' },
                outputExpanded: true,
                position: { x: 100, y: 100 },
                width: 640,
                height: 480,
            };
            app.graph.addNode(pdfNode);
            app.canvas.renderNode(pdfNode);
        });

        cy.get('.node.fetch-result', { timeout: 5000 }).should('be.visible');
        cy.get('.output-panel-wrapper[data-node-id="test-pdf-ids"]').within(() => {
            cy.get('#pdf-page-1').should('exist');
            cy.get('#pdf-page-2').should('exist');
        });
    });

    it('selecting highlight node (parent PDF) highlights excerpt in output panel', () => {
        const pdfId = 'pdf-highlight-parent';
        const excerptText = 'Excerpt to find here';
        const highlightId = 'highlight-from-pdf';

        cy.window().then((win) => {
            const { app } = win;
            const pdfContent = `## Page 1\n\n${excerptText}.\n\n## Page 2\n\nMore text.`;
            const pdfNode = {
                id: pdfId,
                type: 'fetch_result',
                title: 'Test PDF',
                content: pdfContent,
                metadata: { content_type: 'pdf' },
                outputExpanded: true,
                position: { x: 100, y: 100 },
                width: 640,
                height: 480,
            };
            const highlightNode = {
                id: highlightId,
                type: 'highlight',
                content: `> ${excerptText}`,
                position: { x: 800, y: 100 },
                width: 420,
                height: 300,
            };
            const edge = {
                id: 'edge-pdf-highlight',
                source: pdfId,
                target: highlightId,
                type: 'highlight',
            };
            app.graph.addNode(pdfNode);
            app.graph.addNode(highlightNode);
            app.graph.addEdge(edge);
            app.canvas.renderNode(pdfNode);
            app.canvas.renderNode(highlightNode);
        });

        cy.get(`.node-wrapper[data-node-id="${pdfId}"]`, { timeout: 5000 }).should('exist');
        cy.get(`.node-wrapper[data-node-id="${highlightId}"]`, { timeout: 5000 }).should('exist');

        // Select the highlight node (triggers HighlightFeature → highlight in output panel)
        cy.window().then((win) => {
            win.app.canvas.selectNode(highlightId);
        });

        // Output panel should show the excerpt highlighted (source text lives in drawer for PDF nodes)
        cy.get(`.output-panel-wrapper[data-node-id="${pdfId}"]`).within(() => {
            cy.get('.code-output-panel-body').find('.source-highlight').should('exist').and('contain', excerptText);
        });
    });

    it('clearing selection removes highlight from output panel', () => {
        const pdfId = 'pdf-clear-highlight';
        const excerptText = 'Unique snippet for clear test';
        const highlightId = 'highlight-clear-test';

        cy.window().then((win) => {
            const { app } = win;
            const pdfContent = `## Page 1\n\n${excerptText}.\n\n`;
            const pdfNode = {
                id: pdfId,
                type: 'fetch_result',
                title: 'Test PDF',
                content: pdfContent,
                metadata: { content_type: 'pdf' },
                outputExpanded: true,
                position: { x: 100, y: 100 },
                width: 640,
                height: 480,
            };
            const highlightNode = {
                id: highlightId,
                type: 'highlight',
                content: `> ${excerptText}`,
                position: { x: 300, y: 100 },
                width: 420,
                height: 300,
            };
            app.graph.addNode(pdfNode);
            app.graph.addNode(highlightNode);
            app.graph.addEdge({ id: 'e1', source: pdfId, target: highlightId, type: 'highlight' });
            app.canvas.renderNode(pdfNode);
            app.canvas.renderNode(highlightNode);
            app.canvas.selectNode(highlightId);
        });

        cy.get(`.output-panel-wrapper[data-node-id="${pdfId}"]`).within(() => {
            cy.get('.code-output-panel-body').find('.source-highlight').should('exist');
        });

        // Clear selection (triggers clearSourceTextHighlights)
        cy.window().then((win) => {
            win.app.canvas.clearSelection();
        });

        cy.get(`.output-panel-wrapper[data-node-id="${pdfId}"]`).within(() => {
            cy.get('.code-output-panel-body').find('.source-highlight').should('not.exist');
            cy.get('.code-output-panel-body').should('contain', excerptText);
        });
    });
});
