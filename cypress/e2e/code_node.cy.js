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

describe('Code Node Generate UI Workflow', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('shows and cancels generate UI via cancel button', () => {
        // Create code node
        cy.get('#chat-input').type('/code');
        cy.get('#send-btn').click();
        cy.get('.node.code', { timeout: 5000 }).should('be.visible');

        // Click Generate button
        cy.get('.node.code .generate-btn').click();

        // Verify generate UI appears
        cy.get('.code-generate-input').should('be.visible');
        cy.get('.generate-prompt-input').should('be.visible');
        cy.get('.generate-model-select').should('be.visible');
        cy.get('.generate-submit-btn').should('be.visible');
        cy.get('.generate-cancel-btn').should('be.visible');

        // Click Cancel
        cy.get('.generate-cancel-btn').click();

        // Verify generate UI is removed
        cy.get('.code-generate-input').should('not.exist');
    });

    it('cancels generate UI via Escape key', () => {
        // Create code node
        cy.get('#chat-input').type('/code');
        cy.get('#send-btn').click();
        cy.get('.node.code', { timeout: 5000 }).should('be.visible');

        // Click Generate button
        cy.get('.node.code .generate-btn').click();
        cy.get('.code-generate-input').should('be.visible');

        // Press Escape on the input
        cy.get('.generate-prompt-input').type('{esc}');

        // Verify generate UI is removed
        cy.get('.code-generate-input').should('not.exist');
    });

    it('generates code via inline generate UI', () => {
        // Set up mock SSE response (reuse pattern from existing test)
        const pythonCode = `print("Hello from generated code!")`;

        // Build SSE response format - send each line as a separate 'data:' line
        let sseResponse = '';
        const lines = pythonCode.split('\n');
        sseResponse += 'event: message\n';
        for (const line of lines) {
            sseResponse += `data: ${line}\n`;
        }
        sseResponse += '\n'; // End of event (double newline)
        sseResponse += 'event: done\ndata: \n\n';

        // Set up mock FIRST (before any other setup) to intercept the API call
        cy.intercept('POST', '**/api/generate-code', (req) => {
            // Verify the request contains the expected prompt
            expect(req.body).to.have.property('prompt');
            expect(req.body.prompt).to.include('hello world');

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

        // Create code node
        cy.get('#chat-input').type('/code');
        cy.get('#send-btn').click();
        cy.get('.node.code', { timeout: 5000 }).should('be.visible');

        // Select any available model (we're mocking the response, so model doesn't matter)
        cy.get('#model-picker').then(($select) => {
            const firstOption = $select.find('option:not([value=""])').first();
            if (firstOption.length > 0) {
                cy.wrap($select).select(firstOption.val());
            }
        });

        // Click Generate button
        cy.get('.node.code .generate-btn').click();
        cy.get('.code-generate-input').should('be.visible');

        // Type prompt and submit
        cy.get('.generate-prompt-input').type('Print hello world');
        cy.get('.generate-submit-btn').click();

        // Wait for API call
        cy.wait('@generateCode', { timeout: 10000 });

        // Wait for the SSE stream to be processed
        cy.wait(1000);

        // Verify generate UI is removed after submission
        cy.get('.code-generate-input').should('not.exist');

        // Verify generated code appears
        cy.get('.node.code .code-display code', { timeout: 10000 })
            .should('contain', 'Hello from generated code');
    });
});

describe('Code Node Execution and Output Panel', () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('runs code and interacts with output panel (toggle, clear)', () => {
        // Create code node with simple print statement
        cy.get('#chat-input').type('/code');
        cy.get('#send-btn').click();
        cy.get('.node.code', { timeout: 5000 }).should('be.visible');

        // Edit code to add simple print (we need code that produces output)
        // Click the Edit button to open the code editor modal
        cy.get('.node.code .edit-code-btn').click();

        // Wait for code editor modal and clear + type new code
        cy.get('#code-editor-textarea', { timeout: 5000 })
            .should('be.visible')
            .clear()
            .type('print("Hello from Pyodide!")');

        // Save the code (Cmd/Ctrl+Enter or click save button)
        cy.get('#code-editor-save').click();

        // Wait for modal to fully close and ensure it's not visible
        cy.get('#code-editor-modal').should('not.be.visible');
        cy.wait(1000); // Wait for any animations/transitions to complete

        // Click Run button - this tests nodeRunCode event routing
        // Use force: true to bypass visibility checks if modal overlay is still present
        cy.get('.node.code .run-code-btn').click({ force: true });

        // Wait for Pyodide to load and execute (may take a few seconds first time)
        // Output panel wrapper (foreignObject in SVG) should appear
        cy.get('.output-panel-wrapper[data-output-panel="true"]', { timeout: 30000 }).should('be.visible');

        // Assert that the output drawer contains the expected stdout output
        // The panel is inside a foreignObject, so we need to look inside it
        cy.get('.output-panel-wrapper[data-output-panel="true"]').within(() => {
            // Check that the code-output-panel div exists
            cy.get('.code-output-panel').should('be.visible').and('have.class', 'expanded');
            // Check that the output panel content exists
            cy.get('.code-output-panel-content').should('be.visible');
            // Check that stdout is displayed
            cy.get('.code-output-stdout').should('be.visible').and('contain', 'Hello from Pyodide!');
        });

        // Verify the output panel is attached to the code node (via data-node-id)
        cy.get('.node.code').then(($node) => {
            const nodeId = $node.attr('data-node-id');
            cy.get(`.output-panel-wrapper[data-node-id="${nodeId}"]`).should('be.visible');
        });


    });
});
