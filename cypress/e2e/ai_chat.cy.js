const buildSse = (chunks) => {
    let body = '';
    chunks.forEach((chunk) => {
        body += `event: message\ndata: ${chunk}\n\n`;
    });
    body += 'event: done\ndata: \n\n';
    return body;
};

describe('AI Chat - Basic Flow', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.waitForAppReady();
        cy.selectTestModel('openai/gpt-4o-mini');
    });

    it('creates human + ai nodes with stubbed chat response', { tags: '@ai' }, () => {
        cy.intercept('POST', '**/api/chat', {
            statusCode: 200,
            headers: { 'content-type': 'text/event-stream' },
            body: buildSse(['Hello from Cypress test!']),
        }).as('chat');

        cy.sendMessage('Hello from Cypress test!');

        cy.wait('@chat');
        cy.get('.node.human').should('be.visible');
        cy.get('.node.ai', { timeout: 10000 }).should('be.visible');
    });

    it('shows the test model in the picker', { tags: '@ai' }, () => {
        cy.get('#model-picker').then(($select) => {
            const options = Array.from($select.find('option')).map((opt) => opt.value);
            expect(options).to.include('openai/gpt-4o-mini');
        });
    });
});

describe('AI Chat - Streaming Tests', { tags: '@ai' }, () => {
    beforeEach(() => {
        cy.clearLocalStorage();
        cy.clearIndexedDB();
        cy.visit('/');
        cy.waitForAppReady();
        cy.selectTestModel('openai/gpt-4o-mini');
    });

    it('sends simple math question and receives answer', { tags: '@ai' }, () => {
        cy.intercept('POST', '**/api/chat', {
            statusCode: 200,
            headers: { 'content-type': 'text/event-stream' },
            body: buildSse(['The answer is 8.']),
        }).as('chat');

        cy.sendMessage('What is 5 + 3?');

        cy.wait('@chat');
        cy.get('.node.ai', { timeout: 10000 }).should('be.visible').and('contain', '8');
        cy.get('.node').should('have.length.at.least', 2);
    });

    it('handles multi-turn conversation with context', { tags: '@ai' }, () => {
        let callCount = 0;
        cy.intercept('POST', '**/api/chat', (req) => {
            callCount += 1;
            const response = callCount === 1 ? 'Nice to meet you, Alice.' : 'Your name is Alice.';
            req.reply({
                statusCode: 200,
                headers: { 'content-type': 'text/event-stream' },
                body: buildSse([response]),
            });
        }).as('chat');

        cy.sendMessage('My name is Alice');
        cy.wait('@chat');
        cy.sendMessage('What is my name?');
        cy.wait('@chat');

        cy.get('.node.ai').last().should('contain', 'Alice');
        cy.get('.node').should('have.length.at.least', 4);
    });
});
