/**
 * Unit tests for Plugin Registration
 * Run with: node tests/test_plugin_registration.js
 *
 * Tests custom plugin registration, protocol compliance, and node creation.
 */

import { assertEqual } from './test_helpers/assertions.js';

// Mock browser globals before importing modules
global.window = global;
global.document = {
    createElement: () => ({ textContent: '', innerHTML: '', id: '' }),
    head: { appendChild: () => {} },
};
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
global.indexedDB = {
    open: () => ({ onsuccess: null, onerror: null }),
};

// Import ES modules
const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
const { BaseNode, Actions } = await import('../src/canvas_chat/static/js/node-protocols.js');
const { createNode } = await import('../src/canvas_chat/static/js/graph-types.js');

// Test utilities
const tests = [];
const errors = [];

function test(name, fn) {
    tests.push({ name, fn });
}

async function runTests() {
    console.log(`Running ${tests.length} tests...\n`);
    let passed = 0;
    let failed = 0;

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`✗ ${name}`);
            console.error(`  ${err.message}`);
            if (err.stack) {
                console.error(`  ${err.stack.split('\n').slice(1, 3).join('\n')}`);
            }
            errors.push({ name, err });
            failed++;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// --- Tests ---

test('NodeRegistry.register() accepts custom node type', () => {
    class CustomNode extends BaseNode {
        getTypeLabel() {
            return 'Custom';
        }
    }

    NodeRegistry.register({
        type: 'custom',
        protocol: CustomNode,
    });

    const ProtocolClass = NodeRegistry.getProtocolClass('custom');
    assert(ProtocolClass !== null, 'Protocol should be registered');
    const instance = new ProtocolClass();
    assertEqual(instance.getTypeLabel(), 'Custom');
});

test('NodeRegistry.register() validates required fields', () => {
    let error = null;
    try {
        NodeRegistry.register({ type: 'invalid' }); // missing protocol
    } catch (err) {
        error = err;
    }
    assert(error !== null, 'Should throw error for missing protocol');
    assert(error.message.includes('protocol'), 'Error should mention protocol');
});

test('Custom node can be created via createNode()', () => {
    class PollNode extends BaseNode {
        getTypeLabel() {
            return 'Poll';
        }
    }

    NodeRegistry.register({
        type: 'poll',
        protocol: PollNode,
    });

    const node = createNode('poll', 'Test poll content');
    assertEqual(node.type, 'poll');
    assertEqual(node.content, 'Test poll content');
    assert(node.id, 'Node should have an ID');
});

test('Custom node protocol can override render()', () => {
    class ColoredNode extends BaseNode {
        getTypeLabel() {
            return 'Colored';
        }

        render(node) {
            return `<div style="background: blue">${node.content}</div>`;
        }
    }

    NodeRegistry.register({
        type: 'colored',
        protocol: ColoredNode,
    });

    const ProtocolClass = NodeRegistry.getProtocolClass('colored');
    const protocol = new ProtocolClass();
    const node = { id: '1', type: 'colored', content: 'Blue node' };
    const html = protocol.render(node);

    assert(html.includes('background: blue'), 'Should include custom styling');
    assert(html.includes('Blue node'), 'Should include content');
});

test('Custom node protocol can override getSupportedActions()', () => {
    class VotableNode extends BaseNode {
        getTypeLabel() {
            return 'Votable';
        }

        getSupportedActions() {
            return [Actions.CONTINUE, Actions.DELETE]; // Custom action set
        }
    }

    NodeRegistry.register({
        type: 'votable',
        protocol: VotableNode,
    });

    const ProtocolClass = NodeRegistry.getProtocolClass('votable');
    const protocol = new ProtocolClass();
    const actions = protocol.getSupportedActions();

    assertEqual(actions.length, 2);
    assert(actions.includes(Actions.CONTINUE));
    assert(actions.includes(Actions.DELETE));
    assert(!actions.includes(Actions.REPLY), 'Should not include REPLY');
});

test('Custom node protocol can add custom data fields', () => {
    class DataNode extends BaseNode {
        getTypeLabel() {
            return 'Data';
        }

        validateData(data) {
            // Custom validation
            if (!data.schema) {
                throw new Error('Missing schema field');
            }
            return true;
        }
    }

    NodeRegistry.register({
        type: 'datanode',
        protocol: DataNode,
    });

    const ProtocolClass = NodeRegistry.getProtocolClass('datanode');
    const protocol = new ProtocolClass();

    // Valid data
    assert(protocol.validateData({ schema: 'v1' }), 'Should accept valid data');

    // Invalid data
    let error = null;
    try {
        protocol.validateData({});
    } catch (err) {
        error = err;
    }
    assert(error !== null, 'Should throw for missing schema');
});

test('Multiple custom nodes can coexist', () => {
    class AlphaNode extends BaseNode {
        getTypeLabel() {
            return 'Alpha';
        }
    }

    class BetaNode extends BaseNode {
        getTypeLabel() {
            return 'Beta';
        }
    }

    NodeRegistry.register({ type: 'alpha', protocol: AlphaNode });
    NodeRegistry.register({ type: 'beta', protocol: BetaNode });

    const AlphaClass = NodeRegistry.getProtocolClass('alpha');
    const BetaClass = NodeRegistry.getProtocolClass('beta');

    const alphaProtocol = new AlphaClass();
    const betaProtocol = new BetaClass();

    assertEqual(alphaProtocol.getTypeLabel(), 'Alpha');
    assertEqual(betaProtocol.getTypeLabel(), 'Beta');

    const alphaNode = createNode('alpha', 'A');
    const betaNode = createNode('beta', 'B');

    assertEqual(alphaNode.type, 'alpha');
    assertEqual(betaNode.type, 'beta');
});

test('NodeRegistry.getRegisteredTypes() includes custom types', () => {
    class GammaNode extends BaseNode {
        getTypeLabel() {
            return 'Gamma';
        }
    }

    NodeRegistry.register({ type: 'gamma', protocol: GammaNode });

    const types = NodeRegistry.getRegisteredTypes();
    assert(types.includes('gamma'), 'Should list custom type');
});

test('Custom node with complex data structure', () => {
    class SurveyNode extends BaseNode {
        getTypeLabel() {
            return 'Survey';
        }

        render(node) {
            const { question, options = [] } = node.data || {};
            const optionsHtml = options.map((opt) => `<li>${opt}</li>`).join('');
            return `
                <div class="survey-node">
                    <h3>${question || 'No question'}</h3>
                    <ul>${optionsHtml}</ul>
                </div>
            `;
        }
    }

    NodeRegistry.register({ type: 'survey', protocol: SurveyNode });

    const node = createNode('survey', '', {
        data: {
            question: 'Favorite color?',
            options: ['Red', 'Blue', 'Green'],
        },
    });

    const ProtocolClass = NodeRegistry.getProtocolClass('survey');
    const protocol = new ProtocolClass();
    const html = protocol.render(node);

    assert(html.includes('Favorite color?'), 'Should render question');
    assert(html.includes('Red'), 'Should render option 1');
    assert(html.includes('Blue'), 'Should render option 2');
    assert(html.includes('Green'), 'Should render option 3');
});

test('NodeRegistry allows duplicate registration with warning', () => {
    class DupeNode extends BaseNode {
        getTypeLabel() {
            return 'Dupe';
        }
    }

    NodeRegistry.register({ type: 'duplicate', protocol: DupeNode });

    // Second registration should succeed but warn (for hot reload support)
    NodeRegistry.register({ type: 'duplicate', protocol: DupeNode });

    // Should still be registered
    assert(NodeRegistry.isRegistered('duplicate'), 'Type should still be registered');
});

// Run all tests
await runTests();
