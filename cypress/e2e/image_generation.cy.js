/**
 * Image Generation: dynamic Ollama model discovery.
 * Uses mocked APIs only (no real LLM/Ollama) for fast runs.
 */
describe('Image Generation modal', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(2000);
    });

    it('populates Ollama models dynamically in the dropdown', () => {
        cy.intercept('GET', '/api/ollama/image-models', {
            statusCode: 200,
            body: [
                {
                    id: 'ollama_image/x/z-image-turbo:latest',
                    name: 'x/z-image-turbo',
                    provider: 'Ollama',
                    context_window: 128000,
                },
                {
                    id: 'ollama_image/x/flux2-klein:latest',
                    name: 'x/flux2-klein',
                    provider: 'Ollama',
                    context_window: 128000,
                },
            ],
        }).as('ollamaImageModels');

        // Type /image with a prompt
        cy.get('#chat-input').focus().type('/image a serene mountain lake{enter}');

        // Modal should open
        cy.get('#image-generation-settings-modal', { timeout: 10000 }).should('be.visible');

        // Wait for the Ollama models to load
        cy.wait('@ollamaImageModels');

        // The Ollama optgroup should contain both dynamically fetched models
        cy.get('#image-gen-ollama-group option').should('have.length', 2);
        cy.get('#image-gen-ollama-group option').eq(0).should('have.value', 'ollama_image/x/z-image-turbo:latest');
        cy.get('#image-gen-ollama-group option').eq(1).should('have.value', 'ollama_image/x/flux2-klein:latest');
    });

    it('shows placeholder when Ollama is not running', () => {
        cy.intercept('GET', '/api/ollama/image-models', {
            statusCode: 200,
            body: [],
        }).as('ollamaImageModels');

        cy.get('#chat-input').focus().type('/image a cat{enter}');

        cy.get('#image-generation-settings-modal', { timeout: 10000 }).should('be.visible');
        cy.wait('@ollamaImageModels');

        // Should show a disabled placeholder, not real models
        cy.get('#image-gen-ollama-group option').should('have.length', 1);
        cy.get('#image-gen-ollama-group option').eq(0).should('be.disabled');
    });

    it('sends correct model when an Ollama model is selected', () => {
        cy.intercept('GET', '/api/ollama/image-models', {
            statusCode: 200,
            body: [
                {
                    id: 'ollama_image/x/z-image-turbo:latest',
                    name: 'x/z-image-turbo',
                    provider: 'Ollama',
                    context_window: 128000,
                },
            ],
        }).as('ollamaImageModels');

        cy.intercept('POST', '/api/generate-image', {
            statusCode: 200,
            body: {
                imageData: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                mimeType: 'image/png',
                revised_prompt: null,
            },
        }).as('generateImage');

        cy.get('#chat-input').focus().type('/image a sunset{enter}');

        cy.get('#image-generation-settings-modal', { timeout: 10000 }).should('be.visible');
        cy.wait('@ollamaImageModels');

        // Select the Ollama model
        cy.get('#image-gen-model').select('ollama_image/x/z-image-turbo:latest');

        // Click Generate
        cy.get('#image-gen-generate').click();

        // Verify the backend received the correct model
        cy.wait('@generateImage').then((interception) => {
            expect(interception.request.body.model).to.eq('ollama_image/x/z-image-turbo:latest');
        });

        // An image node should appear on the canvas
        cy.get('.node.image', { timeout: 10000 }).should('exist');
    });
});
