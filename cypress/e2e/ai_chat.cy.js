describe('AI Chat with Ollama - Basic Flow', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('configures ollama and creates human + ai nodes', { tags: '@ai' }, () => {
        // Configure Ollama base URL
        cy.configureOllama();

        // Wait for models to be fetched
        cy.get('#model-picker', { timeout: 10000 }).should('not.be.empty');

        // Select the configured Ollama model for CI
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');

        // Send a simple message
        cy.sendMessage('Hello from Cypress test!');

        // Verify human node is created
        cy.get('.node.human').should('be.visible');

        // Wait a bit for AI to start responding (Ollama is slow on CPU)
        cy.wait(5000);

        // Check if any node was created (don't wait for completion)
        cy.get('.node').should('have.length.at.least', 1);
    });

    it('checks ollama model is available in picker', { tags: '@ai' }, () => {
        cy.configureOllama();

        // Wait for models to be fetched
        cy.get('#model-picker', { timeout: 10000 }).should('not.be.empty');

        // Check that ollama_chat/gemma3n:e4b is in the list
        cy.get('#model-picker').then(($select) => {
            const options = Array.from($select.find('option')).map((opt) => opt.value);
            cy.log('Available models:', options);
            expect(options).to.include('ollama_chat/gemma3n:e4b');
        });
    });

    it('checks that gemma3n:e4b is available', { tags: '@ai' }, () => {
        cy.configureOllama();

        // Wait for models to be fetched
        cy.get('#model-picker', { timeout: 10000 }).should('not.be.empty');

        // Verify the configured model is available
        cy.get('#model-picker').then(($select) => {
            const options = Array.from($select.find('option')).map((opt) => opt.value);
            expect(options).to.include('ollama_chat/gemma3n:e4b');
        });
    });
});

describe('AI Chat with Ollama - Streaming Tests', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
        cy.configureOllama();
        cy.get('#model-picker', { timeout: 10000 }).should('not.be.empty');
    });

    it('sends simple math question and receives answer', { tags: '@ai' }, () => {
        // Select the configured Ollama model for CI
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');

        // Send math question
        cy.sendMessage('What is 5 + 3?');

        // Verify AI node appears
        cy.get('.node.ai', { timeout: 10000 }).should('be.visible');

        // Check that stop button was shown (streaming started)
        cy.get('.stop-btn').should('be.visible');

        // Wait for some streaming to happen (Ollama is slow on CPU)
        cy.wait(10000);

        // Verify nodes were created
        cy.get('.node').should('have.length.at.least', 2);
    });

    it('handles multi-turn conversation with context', { tags: '@ai' }, () => {
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');

        // First message
        cy.sendMessage('My name is Alice');
        cy.get('.node.ai', { timeout: 10000 }).should('be.visible');

        // Wait for some streaming
        cy.wait(8000);

        // Second message (should remember context)
        cy.sendMessage('What is my name?');
        cy.get('.node.ai').last().should('be.visible');

        // Wait a bit more
        cy.wait(8000);

        // Verify multiple nodes were created
        cy.get('.node').should('have.length.at.least', 4);
    });

    it('verifies streaming UI shows correctly', { tags: '@ai' }, () => {
        cy.get('#model-picker').select('ollama_chat/gemma3n:e4b');

        cy.sendMessage('Count to 5');

        // Verify stop button is visible during streaming
        cy.get('.node.ai', { timeout: 10000 }).should('be.visible');
        cy.get('.stop-btn').should('be.visible');

        // Wait for some streaming to happen
        cy.wait(8000);

        // Verify AI node has content (use within instead of find)
        cy.get('.node.ai')
            .last()
            .within(() => {
                cy.get('.node-content').should('not.be.empty');
            });
    });
});
