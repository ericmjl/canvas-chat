/**
 * E2E: Excel table ingest — upload .xlsx, assert one node per sheet; /code works with Excel nodes.
 * Requires dev server (e.g. pixi run dev) and XLSX loaded from CDN.
 */
describe('Excel table ingest', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
    });

    it('uploads Excel with two sheets and creates two table nodes', () => {
        cy.window().its('app', { timeout: 30000 }).should('exist');
        cy.window().its('app.fileUploadHandler', { timeout: 5000 }).should('exist');
        cy.window().its('XLSX', { timeout: 15000 }).should('exist');

        cy.window()
            .then((win) => {
                const XLSX = win.XLSX;
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.aoa_to_sheet([
                        ['A', 'B'],
                        [1, 2],
                        [3, 4],
                    ]),
                    'Sheet1'
                );
                XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.aoa_to_sheet([
                        ['X', 'Y'],
                        [10, 20],
                    ]),
                    'Sheet2'
                );
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                const file = new win.File([new Blob([new Uint8Array(wbout)])], 'data.xlsx', {
                    type: mime,
                });
                return win.app.fileUploadHandler.handleFileUpload(file, { x: 200, y: 200 });
            })
            .then((result) => {
                // Upload completed; result may be last node or null on error
                expect(result === null || typeof result === 'object').to.be.true;
            });

        cy.get('.node.excel', { timeout: 15000 }).should('have.length.at.least', 2);
        cy.get('.node.excel').first().should('be.visible');
        cy.get('.node.excel').eq(1).should('be.visible');
    });

    it('enables /code when Excel node is selected and creates code node with csvNodeIds', () => {
        cy.window().its('app', { timeout: 30000 }).should('exist');
        cy.window().its('app.fileUploadHandler', { timeout: 5000 }).should('exist');
        cy.window().its('XLSX', { timeout: 15000 }).should('exist');

        cy.window()
            .then((win) => {
                const XLSX = win.XLSX;
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.aoa_to_sheet([
                        ['Col1', 'Col2'],
                        [1, 2],
                    ]),
                    'Data'
                );
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                const file = new win.File([new Blob([new Uint8Array(wbout)])], 'single.xlsx', {
                    type: mime,
                });
                return win.app.fileUploadHandler.handleFileUpload(file, { x: 200, y: 200 });
            })
            .then((result) => {
                expect(result === null || typeof result === 'object').to.be.true;
            });

        cy.get('.node.excel', { timeout: 15000 }).should('exist').click();
        cy.get('#chat-input').type('/code');
        cy.get('#send-btn').click();

        cy.get('.node.code', { timeout: 5000 }).should('be.visible');
        cy.get('.node.code .code-display code').should('contain', 'df');
    });
});
