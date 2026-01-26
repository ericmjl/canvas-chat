describe('Matrix copy to clipboard keyboard shortcut', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.wait(1000);
    });

    it('keyboard shortcut "c" copies matrix to clipboard', { tags: '@ai' }, () => {
        // Create matrix node programmatically (no LLM calls)
        cy.window().then((win) => {
            const { app } = win;
            const matrixNode = {
                id: 'test-matrix-keyboard-copy',
                type: 'matrix',
                context: 'Test Comparison',
                rowItems: ['Item A', 'Item B'],
                colItems: ['X', 'Y'],
                cells: {
                    '0-0': { content: 'AX', filled: true },
                    '0-1': { content: 'AY', filled: true },
                    '1-0': { content: 'BX', filled: true },
                    '1-1': { content: 'BY', filled: true },
                },
                position: { x: 100, y: 100 },
                width: 600,
                height: 400,
            };

            app.graph.addNode(matrixNode);
            app.canvas.renderNode(matrixNode);
        });

        // Wait for node to be rendered in DOM
        cy.get('.node.matrix').should('exist');

        // Select the node by clicking on the grab handle
        cy.get('.node.matrix .drag-handle').click();
        cy.get('.node.matrix').should('have.class', 'selected');

        // Stub clipboard.writeText BEFORE the action
        cy.window().then((win) => {
            const stub = cy.stub(win.navigator.clipboard, 'writeText').resolves();
            // Store stub reference for later access
            win.__clipboardStub = stub;
        });

        // Press "c" key by dispatching proper KeyboardEvent on body
        // (Cypress .trigger() creates generic Event, not KeyboardEvent, so e.key won't work)
        // Dispatch on body so e.target is body (not document), which passes the !e.target.matches('input, textarea') check
        // The event bubbles to document where the listener is attached
        cy.get('body').then(($body) => {
            const event = new KeyboardEvent('keydown', {
                key: 'c',
                code: 'KeyC',
                bubbles: true,
                cancelable: true,
            });
            $body[0].dispatchEvent(event);
        });

        // Verify clipboard was called with correct markdown
        // Use retry mechanism for async timing (copyNodeContent is async)
        cy.window().then((win) => {
            cy.wrap(null).should(() => {
                expect(win.__clipboardStub.callCount).to.equal(1);
            });

            const callArgs = win.__clipboardStub.getCall(0).args[0];
            expect(callArgs).to.contain('## Test Comparison');
            expect(callArgs).to.contain('| X | Y |');
            expect(callArgs).to.contain('| Item A |');
            expect(callArgs).to.contain('| AX |');
        });
    });

    it('keyboard shortcut "c" only works when node is selected', { tags: '@ai' }, () => {
        // Create matrix node programmatically (no LLM calls)
        cy.window().then((win) => {
            const { app } = win;
            const matrixNode = {
                id: 'test-matrix-not-selected',
                type: 'matrix',
                context: 'Not Selected Test',
                rowItems: ['Row 1'],
                colItems: ['Col 1'],
                cells: {
                    '0-0': { content: 'Content', filled: true },
                },
                position: { x: 100, y: 100 },
                width: 600,
                height: 400,
            };

            app.graph.addNode(matrixNode);
            app.canvas.renderNode(matrixNode);
        });

        // Wait for node to be rendered in DOM
        cy.get('.node.matrix').should('exist');

        // Verify node is NOT selected
        cy.get('.node.matrix').should('not.have.class', 'selected');

        // Stub clipboard.writeText
        let clipboardStub;
        cy.window().then((win) => {
            clipboardStub = cy.stub(win.navigator.clipboard, 'writeText').resolves();
        });

        // Press "c" key by dispatching KeyboardEvent on body
        cy.get('body').then(($body) => {
            const event = new KeyboardEvent('keydown', {
                key: 'c',
                code: 'KeyC',
                bubbles: true,
                cancelable: true,
            });
            $body[0].dispatchEvent(event);
        });

        // Verify clipboard was NOT called (node not selected)
        cy.then(() => {
            expect(clipboardStub.callCount).to.equal(0);
        });
    });

    it('keyboard shortcut "c" does not work when focus is in input field', { tags: '@ai' }, () => {
        // Create matrix node programmatically (no LLM calls)
        cy.window().then((win) => {
            const { app } = win;
            const matrixNode = {
                id: 'test-matrix-input-focus',
                type: 'matrix',
                context: 'Input Focus Test',
                rowItems: ['Row 1'],
                colItems: ['Col 1'],
                cells: {
                    '0-0': { content: 'Content', filled: true },
                },
                position: { x: 100, y: 100 },
                width: 600,
                height: 400,
            };

            app.graph.addNode(matrixNode);
            app.canvas.renderNode(matrixNode);
        });

        // Wait for node to be rendered in DOM
        cy.get('.node.matrix').should('exist');

        // Select the node by clicking on the grab handle
        cy.get('.node.matrix .drag-handle').click();
        cy.get('.node.matrix').should('have.class', 'selected');

        // Focus the chat input field
        cy.get('#chat-input').focus();

        // Stub clipboard.writeText
        let clipboardStub;
        cy.window().then((win) => {
            clipboardStub = cy.stub(win.navigator.clipboard, 'writeText').resolves();
        });

        // Press "c" key by dispatching KeyboardEvent on the input element
        // (so e.target is the input, not body)
        cy.get('#chat-input').then(($input) => {
            const event = new KeyboardEvent('keydown', {
                key: 'c',
                code: 'KeyC',
                bubbles: true,
                cancelable: true,
            });
            $input[0].dispatchEvent(event);
        });

        // Verify clipboard was NOT called (keyboard shortcuts disabled in input fields)
        cy.then(() => {
            expect(clipboardStub.callCount).to.equal(0);
        });
    });


});
