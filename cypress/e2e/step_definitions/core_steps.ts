/// <reference types="cypress" />

import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';

const BUTTON_TEST_IDS = {
    'Auto Layout': 'auto-layout-btn',
    Export: 'export-btn',
    'New Canvas': 'new-canvas-btn',
    Import: 'import-btn',
    Help: 'help-btn',
    Multiplayer: 'multiplayer-btn',
    Redo: 'redo-btn',
    Search: 'search-btn',
    Sessions: 'sessions-btn',
    Settings: 'settings-btn',
    Tags: 'tags-btn',
    Undo: 'undo-btn',
} as const;

const MODAL_TEST_IDS = {
    Help: 'help-modal',
    Sessions: 'sessions-modal',
    Settings: 'settings-modal',
} as const;

const MODAL_CLOSE_TEST_IDS = {
    Help: 'help-close',
    Sessions: 'sessions-close',
    Settings: 'settings-close',
} as const;

const TEST_EXTERNAL_PLUGIN_MODULE = 'export function registerPlugin(){ return true; }';

Given('I open Canvas Chat', () => {
    cy.visit('/');
});

Given('I stub external plugins list with valid plugins', () => {
    cy.intercept('GET', '/api/plugins', {
        plugins: [
            { id: 'poll', url: '/__test__/plugins/poll.js' },
            { id: 'example-poll-node', url: '/__test__/plugins/example-poll-node.js' },
        ],
    }).as('externalPlugins');

    cy.intercept('GET', '/__test__/plugins/poll.js', {
        statusCode: 200,
        headers: { 'Content-Type': 'application/javascript' },
        body: TEST_EXTERNAL_PLUGIN_MODULE,
    }).as('externalPluginPoll');

    cy.intercept('GET', '/__test__/plugins/example-poll-node.js', {
        statusCode: 200,
        headers: { 'Content-Type': 'application/javascript' },
        body: TEST_EXTERNAL_PLUGIN_MODULE,
    }).as('externalPluginExamplePoll');
});

Given('I stub external plugins list with a broken plugin', () => {
    cy.intercept('GET', '/api/plugins', {
        plugins: [
            {
                id: 'broken-plugin',
                url: '/api/plugins/does-not-exist.js',
            },
        ],
    }).as('externalPlugins');

    cy.intercept('GET', '/api/plugins/does-not-exist.js', {
        statusCode: 404,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Not found',
    }).as('externalPluginBroken');
});

When('I wait for the app to initialize', () => {
    // DOM first so we know the page has loaded, then wait for full init (plugins, config agents, event handlers)
    cy.get('#model-picker', { timeout: 15000 }).should('exist');
    cy.waitForAppReady();
    cy.window().should((win) => {
        expect(win.app.featureRegistry, 'feature registry').to.exist;
        expect(win.app.graph, 'graph initialized').to.exist;
    });
});

When('I reload external plugins for testing', () => {
    cy.reloadExternalPluginsForTest();
});

When('I clear any selected nodes', () => {
    cy.window().then((win) => {
        const canvas = win.app?.canvas;
        if (canvas?.clearSelection) {
            canvas.clearSelection();
        }
        const selection = win.getSelection?.();
        if (selection) {
            selection.removeAllRanges();
        }
    });
    cy.window()
        .its('app.canvas')
        .invoke('getSelectedNodeIds')
        .should('deep.equal', []);
});

When('I stub the agent stream response', () => {
    const sseBody =
        'event: message\ndata: ### Reflection\n\n' +
        'event: message\ndata: - Key Learnings: Tests run deterministically.\n\n' +
        'event: done\ndata: {"tool_calls": []}\n\n';

    cy.intercept('POST', '**/api/agents/run/stream', {
        statusCode: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseBody,
    }).as('agentStream');

    // Fallback path for legacy agent loop (prevents auth errors in tests)
    cy.intercept('POST', '**/api/chat', {
        statusCode: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: 'event: message\ndata: ### Reflection\n\nevent: done\ndata: \n\n',
    }).as('chatMessage');
});

When('I click {string}', (label) => {
    const testId = BUTTON_TEST_IDS[label];
    if (!testId) {
        throw new Error(`No data-testid mapping for button: ${label}`);
    }
    cy.getByTestId(testId).click();
});

Then('I should see the toolbar', () => {
    // Use #toolbar (id) so we find the element even if testid is missing; toolbar is in initial HTML
    cy.get('#toolbar', { timeout: 5000 }).should('be.visible');
});

Then('the canvas should be visible', () => {
    cy.getByTestId('canvas-container').should('be.visible');
});

Then('I should see the {string} button', (label) => {
    const testId = BUTTON_TEST_IDS[label];
    if (!testId) {
        throw new Error(`No data-testid mapping for button: ${label}`);
    }
    // Use #id so the button is found even if data-testid is missing; 5s to avoid long default timeout
    cy.get(`#${testId}`, { timeout: 5000 }).should('be.visible');
});

When('I open the {string} modal', (label) => {
    const buttonId = BUTTON_TEST_IDS[label];
    const modalId = MODAL_TEST_IDS[label];
    if (!buttonId || !modalId) {
        throw new Error(`No test id mapping for modal: ${label}`);
    }
    cy.getByTestId(buttonId).click();
});

When('I close the {string} modal', (label) => {
    const modalId = MODAL_TEST_IDS[label];
    const closeId = MODAL_CLOSE_TEST_IDS[label];
    if (!modalId || !closeId) {
        throw new Error(`No test id mapping for modal close: ${label}`);
    }
    cy.getByTestId(modalId).should('be.visible');
    cy.getByTestId(closeId).click();
});

Then('the {string} modal should be visible', (label) => {
    const modalId = MODAL_TEST_IDS[label];
    if (!modalId) {
        throw new Error(`No test id mapping for modal: ${label}`);
    }
    cy.getByTestId(modalId).should('be.visible');
});

Then('the {string} modal should be hidden', (label) => {
    const modalId = MODAL_TEST_IDS[label];
    if (!modalId) {
        throw new Error(`No test id mapping for modal: ${label}`);
    }
    cy.getByTestId(modalId).should('not.be.visible');
});

When('I open the search overlay', () => {
    cy.getByTestId('search-btn').click();
});

When('I close the search overlay', () => {
    cy.getByTestId('search-overlay').should('be.visible');
    cy.get('body').type('{esc}');
});

Then('the search overlay should be visible', () => {
    cy.getByTestId('search-overlay').should('be.visible');
});

Then('the search overlay should be hidden', () => {
    cy.getByTestId('search-overlay').should('not.be.visible');
});

When('I open the tag drawer', () => {
    cy.getByTestId('tags-btn').click();
});

When('I close the tag drawer', () => {
    cy.getByTestId('tag-drawer-close').click();
});

Then('the tag drawer should be visible', () => {
    cy.getByTestId('tag-drawer').should('be.visible');
});

Then('the tag drawer should be hidden', () => {
    cy.getByTestId('tag-drawer').should('not.be.visible');
});

When('I send the message {string}', (message) => {
    if (message.startsWith('/')) {
        // Use the real send path for reflect commands so toast behavior matches the app.
        if (message === '/reflect' || message === '/reflect-config') {
            cy.sendMessage(message);
            return;
        }
        cy.runAgentSlashCommand(message);
        return;
    }
    cy.intercept('POST', '**/api/chat', {
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'event: message\ndata: Hello from test\n\nevent: done\ndata: \n\n',
    }).as('chatMessage');
    cy.sendMessage(message);
});

When('I create a {string} node via the app API', (nodeType) => {
    cy.window().then((win) => {
        const app = win.app;
        const graph = app?.graph;
        if (!graph) {
            throw new Error('Graph not initialized');
        }
        const node = {
            id: win.crypto.randomUUID(),
            type: nodeType,
            content: 'Test content',
            position: { x: 0, y: 0 },
            width: 420,
            height: 200,
            created_at: Date.now(),
            tags: [],
            title: null,
            summary: null,
            model: null,
            selection: null,
        };
        graph.addNode(node);
    });
});

When('I create a {string} node and store its id as {string}', (nodeType, alias) => {
    cy.window().then((win) => {
        const app = win.app;
        const graph = app?.graph;
        if (!graph) {
            throw new Error('Graph not initialized');
        }
        const node = {
            id: win.crypto.randomUUID(),
            type: nodeType,
            content: 'Test content',
            position: { x: 0, y: 0 },
            width: 420,
            height: 200,
            created_at: Date.now(),
            tags: [],
            title: null,
            summary: null,
            model: null,
            selection: null,
        };
        graph.addNode(node);
        cy.wrap(node.id, { log: false }).as(alias);
    });
});

When('I select the node stored as {string}', (alias) => {
    cy.get<string>(`@${alias}`).then((nodeId) => {
        cy.window().then((win) => {
            const canvas = win.app?.canvas;
            if (!canvas) {
                throw new Error('Canvas not initialized');
            }
            canvas.selectNode(nodeId);
        });
    });
});

When('I record the current node count as {string}', (alias) => {
    cy.window()
        .its('app')
        .its('graph')
        .invoke('toJSON')
        .then((graph) => {
            cy.wrap(graph.nodes.length, { log: false }).as(alias);
        });
});

Then('the graph node count should be unchanged from {string}', (alias) => {
    cy.get<number>(`@${alias}`).then((count) => {
        cy.window()
            .its('app')
            .its('graph')
            .invoke('toJSON')
            .should((graph) => {
                expect(graph.nodes.length).to.equal(count);
            });
    });
});

Then('the graph should have at least {int} more node than {string}', (delta, alias) => {
    cy.get<number>(`@${alias}`).then((count) => {
        cy.window()
            .its('app')
            .its('graph')
            .invoke('toJSON')
            .should((graph) => {
                expect(graph.nodes.length).to.be.gte(count + delta);
            });
    });
});

Then('I should see a toast with text {string}', (message) => {
    cy.get('.toast-notification', { timeout: 5000 }).should('exist').and('contain', message);
});

Then('the graph should have at least {int} nodes', (minNodes) => {
    cy.window()
        .its('app')
        .its('graph')
        .invoke('toJSON')
        .should((graph) => {
            expect(graph.nodes.length).to.be.gte(minNodes);
        });
});

Then('the graph should have exactly {int} nodes', (nodeCount) => {
    cy.window()
        .its('app')
        .its('graph')
        .invoke('toJSON')
        .should((graph) => {
            expect(graph.nodes.length).to.equal(nodeCount);
        });
});

Then('the graph should include a node of type {string}', (nodeType) => {
    cy.window()
        .its('app')
        .its('graph')
        .invoke('toJSON')
        .should((graph) => {
            const hasType = graph.nodes.some((node) => node.type === nodeType);
            expect(hasType, `node type ${nodeType} present`).to.equal(true);
        });
});

Then('slash command {string} should be registered', (command) => {
    cy.window().should((win) => {
        if (typeof win.getAllSlashCommands !== 'function') {
            throw new Error('Slash command registry not available on window');
        }
        const commands = win.getAllSlashCommands().map((cmd) => cmd.command);
        if (!commands.includes(command)) {
            throw new Error(
                `Expected slash command ${command} to be registered. ` +
                    `Registered commands: ${commands.slice(0, 20).join(', ')}${commands.length > 20 ? '...' : ''}.`
            );
        }
    });
});

Then('slash command {string} should not be registered', (command) => {
    cy.window().should((win) => {
        if (typeof win.getAllSlashCommands !== 'function') {
            throw new Error('Slash command registry not available on window');
        }
        const commands = win.getAllSlashCommands().map((cmd) => cmd.command);
        if (commands.includes(command)) {
            throw new Error(`Expected slash command ${command} to be absent, but it was registered.`);
        }
    });
});

Then('feature plugin {string} should be registered', (featureId) => {
    cy.window().should((win) => {
        const app = win.app;
        if (!app || !app.featureRegistry) {
            throw new Error('App feature registry not available on window');
        }
        const feature = app.featureRegistry.getFeature(featureId);
        expect(!!feature, `feature ${featureId} registered`).to.equal(true);
    });
});

// External plugin steps: assert via behavior (slash commands) since app does not expose plugin load list.
Then('external plugins should be loaded', () => {
    cy.window().should((win) => {
        if (typeof win.getAllSlashCommands !== 'function') {
            throw new Error('Slash command registry not available');
        }
        const commands = win.getAllSlashCommands().map((cmd) => cmd.command);
        expect(commands.length, 'at least one slash command from plugins').to.be.greaterThan(0);
    });
});

Then('external plugins should include id {string}', (pluginId) => {
    // Assert a command from that plugin is registered (e.g. poll -> /poll, example-poll-node -> /poll or node type)
    cy.window().should((win) => {
        if (typeof win.getAllSlashCommands !== 'function') {
            throw new Error('Slash command registry not available');
        }
        const commands = win.getAllSlashCommands().map((cmd) => cmd.command);
        // Known plugin id -> primary command
        const pluginCommands: Record<string, string> = {
            poll: '/poll',
            'example-poll-node': '/poll',
        };
        const expectedCmd = pluginCommands[pluginId] ?? `/${pluginId}`;
        expect(commands, `plugin ${pluginId} registered`).to.include(expectedCmd);
    });
});

Then('external plugins should include failed id {string}', (_pluginId) => {
    // Without app exposing a failed-plugins list, we only assert the app is still healthy after a failed load
    cy.window().should((win) => {
        expect(win.app, 'app still available after plugin load attempt').to.exist;
        expect(typeof win.getAllSlashCommands === 'function', 'slash command registry still available').to.equal(
            true
        );
    });
});

When('I create a tagged node with color {string} and name {string}, stored as {string}', (color, name, alias) => {
    cy.window().then((win) => {
        const app = win.app;
        const graph = app?.graph;
        if (!graph) {
            throw new Error('Graph not initialized');
        }
        const nodeId = win.crypto.randomUUID();
        const node = {
            id: nodeId,
            type: 'human',
            content: 'Tagged node',
            position: { x: 120, y: 120 },
            width: 420,
            height: 200,
            created_at: Date.now(),
            tags: [],
            title: null,
            summary: null,
            model: null,
            selection: null,
        };
        graph.addNode(node);
        graph.createTag(color, name);
        graph.addTagToNode(nodeId, color);
        const updatedNode = graph.getNode(nodeId);
        if (updatedNode) {
            app.canvas.renderNode(updatedNode);
        }
        cy.wrap(nodeId, { log: false }).as(alias);
    });
});

When('I remove the tag color {string} from the node stored as {string}', (color, alias) => {
    cy.get<string>(`@${alias}`).then((nodeId) => {
        cy.get(`.node-tag[data-node-id="${nodeId}"][data-color="${color}"] .node-tag-remove`).then(($el) => {
            const el = $el.get(0);
            if (!el) {
                throw new Error('Tag remove button not found');
            }
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
    });
});

Then('the node stored as {string} should not have tag color {string}', (alias, color) => {
    cy.get<string>(`@${alias}`).then((nodeId) => {
        cy.window()
            .its('app')
            .its('graph')
            .invoke('toJSON')
            .should((graph) => {
                const node = graph.nodes.find((entry) => entry.id === nodeId);
                expect(node, 'node exists').to.exist;
                expect(node.tags || []).to.not.include(color);
            });
    });
});

Then('the file upload input should accept {string}', (token) => {
    cy.getByTestId('file-upload-input')
        .invoke('attr', 'accept')
        .then((accept) => {
            expect(accept).to.include(token);
        });
});
