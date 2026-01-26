describe('Code Node Creation', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('creates a code node via /code command with default template', () => {
        cy.get('#chat-input').type('/code');
        cy.get('#send-btn').click();

        cy.get('.node.code', { timeout: 5000 }).should('be.visible');

        cy.get('.node.code .code-display code').should('contain', '# Python code');

        cy.get('.node.code').within(() => {
            cy.get('.edit-code-btn').should('exist');
            cy.get('.generate-btn').should('exist');
            cy.get('.run-code-btn').should('exist');
        });
    });

    it('creates a code node with AI-generated code via /code command with description', () => {
        const pythonCode = `import numpy as np
import matplotlib.pyplot as plt

# Generate bivariate gaussian with covariance 0.9
mean = [0, 0]
cov = [[1, 0.9], [0.9, 1]]

samples = np.random.multivariate_normal(mean, cov, 1000)

plt.figure(figsize=(8, 8))
plt.scatter(samples[:, 0], samples[:, 1], alpha=0.5)
plt.xlabel('X')
plt.ylabel('Y')
plt.title('Bivariate Gaussian')
plt.show()`;

        // Build SSE response format
        // SSE spec: multiple 'data:' lines in one event are joined with '\n'
        // So we can send each line as a separate 'data:' line to preserve newlines
        let sseResponse = '';

        // Send each line as a separate 'data:' line - they'll be joined with '\n' by the parser
        const lines = pythonCode.split('\n');
        sseResponse += 'event: message\n';
        for (const line of lines) {
            sseResponse += `data: ${line}\n`;
        }
        sseResponse += '\n'; // End of event (double newline)

        // Final done event to signal completion
        sseResponse += `event: done\ndata: \n\n`;

        // Set up mock FIRST (before any other setup) to intercept the API call
        // Use wildcard pattern to match any base path
        cy.intercept('POST', '**/api/generate-code', (req) => {
            // Verify the request contains the expected prompt
            expect(req.body).to.have.property('prompt');
            expect(req.body.prompt).to.include('bivariate');

            // Return mocked SSE stream response immediately (no real LLM call)
            req.reply({
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
                body: sseResponse,
            });
        }).as('generateCode');

        // Wait for app to be fully initialized
        cy.get('#chat-input', { timeout: 10000 }).should('be.visible');

        // Wait for model picker to be ready (needed for code generation to work)
        cy.get('#model-picker', { timeout: 10000 }).should('not.be.empty');

        // Select any available model (we're mocking the response, so model doesn't matter)
        cy.get('#model-picker').then(($select) => {
            const firstOption = $select.find('option:not([value=""])').first();
            if (firstOption.length > 0) {
                cy.wrap($select).select(firstOption.val());
            }
        });

        // Send the /code command with description
        cy.get('#chat-input').clear().type('/code Generate a bivariate gaussian with covariance 0.9');
        cy.get('#send-btn').click();

        // Wait for code node to be created
        cy.get('.node.code', { timeout: 10000 }).should('be.visible');

        // Wait for the mocked API call to be intercepted
        cy.wait('@generateCode', { timeout: 10000 });

        // Wait for the SSE stream to be processed and code to appear in the node
        cy.wait(1000);

        // Verify the generated code appears (check for key parts)
        cy.get('.node.code .code-display code', { timeout: 10000 })
            .should('contain', 'numpy')
            .and('contain', 'multivariate_normal')
            .and('contain', '0.9');

        // Verify the "Generating code..." placeholder is gone
        cy.get('.node.code .code-display code').should('not.contain', 'Generating code');
    });
});
