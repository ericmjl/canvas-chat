describe('Settings Modal', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.get('#chat-input', { timeout: 15000 }).should('be.visible');
    });

    it('opens and closes settings modal', () => {
        cy.get('#settings-btn').click();
        cy.get('#settings-modal').should('be.visible');
        cy.get('#settings-close').click();
        cy.get('#settings-modal').should('not.be.visible');
    });

    it('sidebar navigation switches content panel', () => {
        cy.get('#settings-btn').click();
        cy.get('#settings-modal').should('be.visible');

        // Default: LLM panel visible
        cy.get('#settings-panel-llm').should('have.class', 'active');
        cy.get('#settings-panel-llm h3').should('contain', 'LLM providers');

        // Click Search
        cy.get('.settings-sidebar-item[data-category="search"]').click();
        cy.get('#settings-panel-search').should('have.class', 'active');
        cy.get('#settings-panel-search h3').should('contain', 'Search');

        // Click Shortcuts
        cy.get('.settings-sidebar-item[data-category="shortcuts"]').click();
        cy.get('#settings-panel-shortcuts').should('have.class', 'active');
        cy.get('#settings-panel-shortcuts h3').should('contain', 'Keyboard shortcuts');
        cy.get('#shortcuts-list .shortcuts-row').should('have.length.at.least', 5);

        // Click Features
        cy.get('.settings-sidebar-item[data-category="features"]').click();
        cy.get('#settings-panel-features').should('have.class', 'active');
        cy.get('#settings-panel-features h3').should('contain', 'Features');

        // Click Plugins
        cy.get('.settings-sidebar-item[data-category="plugins"]').click();
        cy.get('#settings-panel-plugins').should('have.class', 'active');
        cy.get('#settings-panel-plugins h3').should('contain', 'Plugins');
    });

    it('save and re-open persists flashcard strictness', () => {
        cy.get('#settings-btn').click();
        cy.get('#settings-modal').should('be.visible');

        cy.get('.settings-sidebar-item[data-category="features"]').click();
        cy.get('#settings-panel-features').should('have.class', 'active');
        cy.get('#flashcard-strictness').select('strict');
        cy.get('#save-settings-btn').click();
        cy.get('#settings-modal').should('not.be.visible');

        cy.get('#settings-btn').click();
        cy.get('.settings-sidebar-item[data-category="features"]').click();
        cy.get('#flashcard-strictness').should('have.value', 'strict');

        // Restore for other tests
        cy.get('#flashcard-strictness').select('medium');
        cy.get('#save-settings-btn').click();
    });

    it('save and re-open persists base URL from Proxy panel', () => {
        const testBaseUrl = 'https://test-proxy.example.com/v1';
        cy.get('#settings-btn').click();
        cy.get('#settings-modal').should('be.visible');

        cy.get('.settings-sidebar-item[data-category="proxy"]').click();
        cy.get('#settings-panel-proxy').should('have.class', 'active');
        cy.get('#base-url').clear().type(testBaseUrl);
        cy.get('#save-settings-btn').click();
        cy.get('#settings-modal').should('not.be.visible');

        cy.get('#settings-btn').click();
        cy.get('.settings-sidebar-item[data-category="proxy"]').click();
        cy.get('#base-url').should('have.value', testBaseUrl);

        // Clear so other tests (e.g. AI chat) start with default
        cy.get('#base-url').clear();
        cy.get('#save-settings-btn').click();
    });

    it('in admin mode, admin-restricted categories are hidden', () => {
        cy.intercept('GET', '**/api/config', {
            statusCode: 200,
            body: { adminMode: true, models: [{ id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000 }] },
        }).as('config');
        cy.visit('/');
        cy.wait('@config');
        cy.wait(500);

        cy.get('#settings-btn').click();
        cy.get('#settings-modal').should('be.visible');

        // Admin-restricted sidebar items should be hidden
        cy.get('.settings-sidebar-item[data-category="llm"]').should('have.class', 'admin-hidden');
        cy.get('.settings-sidebar-item[data-category="search"]').should('have.class', 'admin-hidden');
        cy.get('.settings-sidebar-item[data-category="custom-models"]').should('have.class', 'admin-hidden');
        cy.get('.settings-sidebar-item[data-category="proxy"]').should('have.class', 'admin-hidden');

        // Shortcuts, Features and Plugins remain visible
        cy.get('.settings-sidebar-item[data-category="shortcuts"]').should('not.have.class', 'admin-hidden');
        cy.get('.settings-sidebar-item[data-category="features"]').should('not.have.class', 'admin-hidden');
        cy.get('.settings-sidebar-item[data-category="plugins"]').should('not.have.class', 'admin-hidden');

        // First visible panel should be Shortcuts (first non-admin-restricted in sidebar order)
        cy.get('#settings-panel-shortcuts').should('have.class', 'active');
    });

    it('Shortcuts panel: change binding, save, reopen persists; reset restores', () => {
        cy.get('#settings-btn').click();
        cy.get('#settings-modal').should('be.visible');
        cy.get('.settings-sidebar-item[data-category="shortcuts"]').click();
        cy.get('#settings-panel-shortcuts').should('have.class', 'active');

        // Find "Show help" row and click Change
        cy.get('#shortcuts-list .shortcuts-row').contains('Show help').parents('.shortcuts-row').as('helpRow');
        cy.get('@helpRow').find('.shortcuts-change-btn').click();
        cy.get('@helpRow').find('.shortcuts-key').should('contain', 'Press key combo');
        // Simulate keydown for 'h'
        cy.get('body').trigger('keydown', { key: 'h', keyCode: 72, which: 72 });
        cy.get('@helpRow').find('.shortcuts-key').should('contain', 'h');

        cy.get('#save-settings-btn').click();
        cy.get('#settings-modal').should('not.be.visible');

        cy.get('#settings-btn').click();
        cy.get('.settings-sidebar-item[data-category="shortcuts"]').click();
        cy.get('#shortcuts-list .shortcuts-row').contains('Show help').parents('.shortcuts-row').find('.shortcuts-key').should('contain', 'h');

        // Reset to default for Show help (restore ? so other tests are unaffected)
        cy.get('#shortcuts-list .shortcuts-row').contains('Show help').parents('.shortcuts-row').find('.shortcuts-reset-btn').click();
        cy.get('#shortcuts-list .shortcuts-row').contains('Show help').parents('.shortcuts-row').find('.shortcuts-key').should('not.contain', 'h');
        cy.get('#save-settings-btn').click();
    });
});
