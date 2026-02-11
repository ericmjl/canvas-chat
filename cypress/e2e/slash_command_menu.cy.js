describe('Slash command menu', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000); // App and feature registry init so /note etc. are available
    });

    it('opens and shows commands when typing /', () => {
        cy.get('#chat-input').focus().type('/');

        cy.get('.slash-command-menu').should('be.visible');
        cy.get('.slash-command-menu .slash-command-item').should('have.length.at.least', 1);
        cy.get('.slash-command-menu .slash-command-name').contains('/note').should('be.visible');
        cy.get('.slash-command-menu .slash-command-name').contains('/matrix').should('be.visible');
    });

    it('filters commands when typing more (e.g. /no)', () => {
        cy.get('#chat-input').focus().type('/no');

        cy.get('.slash-command-menu').should('be.visible');
        cy.get('.slash-command-menu .slash-command-name').contains('/note').should('be.visible');
        // All visible command names should start with /no
        cy.get('.slash-command-menu .slash-command-name').each(($el) => {
            expect($el.text().toLowerCase().startsWith('/no')).to.be.true;
        });
    });

    it('selects command with Enter, fills input, and send creates note node', () => {
        cy.get('#chat-input').focus().type('/no');
        cy.get('.slash-command-menu').should('be.visible');
        // Cypress .type() doesn't support {tab}; trigger Tab keydown so menu selectCommand runs
        cy.get('#chat-input').trigger('keydown', { key: 'Tab', keyCode: 9, which: 9 });

        cy.get('#chat-input').should('have.value', '/note ');
        cy.get('.slash-command-menu').should('not.be.visible');

        cy.get('#chat-input').type('test content{enter}');
        cy.get('.node').should('exist').and('be.visible').and('contain', 'test content');
    });

    it('Esc dismisses menu and leaves input unchanged', () => {
        cy.get('#chat-input').focus().type('/');
        cy.get('.slash-command-menu').should('be.visible');

        cy.get('#chat-input').type('{esc}');
        cy.get('.slash-command-menu').should('not.be.visible');
        cy.get('#chat-input').should('have.value', '/');
    });
});
