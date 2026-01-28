describe('PowerPoint Upload and Navigation', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
    });

    it('uploads a PPTX via drag & drop and navigates slides', () => {
        const mimeType =
            'application/vnd.openxmlformats-officedocument.presentationml.presentation';

        // Ensure the upload endpoint is actually hit
        cy.intercept('POST', '**/api/upload-file').as('uploadFile');

        // Wait for app initialization (depends on Yjs readiness)
        cy.window().its('app', { timeout: 30000 }).should('exist');
        cy.window().its('app.featureRegistry', { timeout: 30000 }).should('exist');
        // Wait for core runtime state to be ready (graph is created async during session load)
        cy.window().its('app.graph', { timeout: 30000 }).should('exist');
        cy.window().its('app.canvas', { timeout: 30000 }).should('exist');

        // Sanity check: FileUploadRegistry includes pptx
        cy.window()
            .then((win) =>
                win.eval(
                    "import('/static/js/file-upload-registry.js').then(m => m.FileUploadRegistry.getAcceptAttribute())"
                )
            )
            .then((acceptAttr) => {
                expect(acceptAttr).to.include('.pptx');
            });

        // Sanity check: pptx handler resolves for a PPTX file
        cy.window()
            .then((win) =>
                win.eval(
                    `import('/static/js/file-upload-registry.js').then(m => {
                        const f = new File([new Blob(['x'])], 'sample.pptx', { type: '${mimeType}' });
                        const h = m.FileUploadRegistry.findHandler(f);
                        return h ? h.id : null;
                    })`
                )
            )
            .then((handlerId) => {
                expect(handlerId).to.equal('pptx');
            });

        // Drive the app through its real upload handler (same path used by drag/drop + 📎)
        cy.fixture('sample.pptx.base64').then((b64) => {
            cy.window().then((win) => {
                const blob = Cypress.Blob.base64StringToBlob(b64, mimeType);
                const file = new win.File([blob], 'sample.pptx', { type: mimeType });
                return win.app.fileUploadHandler.handleFileUpload(file, { x: 200, y: 200 });
            });
        });
        cy.wait('@uploadFile', { timeout: 30000 });

        // Verify PPTX node created
        cy.get('.node.powerpoint', { timeout: 30000 }).should('exist').and('be.visible');

        // Slide image should render (placeholder if LibreOffice is not installed locally)
        cy.get('.node.powerpoint .pptx-slide-image', { timeout: 30000 }).should('exist');

        // Verify slide counter exists
        cy.get('.node.powerpoint .pptx-counter').should('contain', 'Slide');

        // Navigate next/prev via buttons
        cy.get('.node.powerpoint .pptx-next').click();
        cy.get('.node.powerpoint .pptx-counter').should('contain', 'Slide 2');

        cy.get('.node.powerpoint .pptx-prev').click();
        cy.get('.node.powerpoint .pptx-counter').should('contain', 'Slide 1');

        // Drawer should be present (output panel body contains our drawer content)
        cy.get('.pptx-drawer', { timeout: 30000 }).should('exist');

        // Click slide 2 in drawer
        cy.get('.pptx-slide-row[data-slide-index="1"] .pptx-slide-select').click();
        cy.get('.node.powerpoint .pptx-counter').should('contain', 'Slide 2');

        // Edit title for slide 2 and save
        cy.get('.pptx-slide-row[data-slide-index="1"] .pptx-title-input')
            .clear()
            .type('My Slide Title');
        cy.get('.pptx-slide-row[data-slide-index="1"] .pptx-title-save').click();

        // Title should show in node body for current slide
        cy.get('.node.powerpoint .pptx-slide-title').should('contain', 'My Slide Title');

        // Extract slide as image node (via tooltip on slide image)
        cy.get('.node.powerpoint .pptx-slide-image').click();
        cy.get('.image-tooltip', { timeout: 10000 }).should('be.visible');
        cy.get('.image-tooltip .extract-btn').click();
        cy.get('.node.image', { timeout: 10000 }).should('exist');
    });
});
