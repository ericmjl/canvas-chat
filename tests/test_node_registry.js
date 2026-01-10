/**
 * Tests for NodeRegistry plugin system
 */

// Set up minimal browser-like environment for source files
global.window = global;
global.document = {
    createElement: () => ({ textContent: '', innerHTML: '' }),
    head: { appendChild: () => {} },
};
global.console = console;
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
global.indexedDB = {
    open: () => ({ onsuccess: null, onerror: null }),
};

// Import ES modules
const { NodeType, DEFAULT_NODE_SIZES } = await import('../src/canvas_chat/static/js/graph-types.js');
const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
const { BaseNode, Actions, HeaderButtons } = await import('../src/canvas_chat/static/js/node-protocols.js');

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        failed++;
    }
}

// Reset registry before each test group
function resetRegistry() {
    NodeRegistry._reset();
}

// ============================================================================
// NodeRegistry.register tests
// ============================================================================

test('NodeRegistry.register - registers a valid node type', () => {
    resetRegistry();

    class TestNode extends BaseNode {
        getTypeLabel() {
            return 'Test';
        }
        getTypeIcon() {
            return '🧪';
        }
    }

    NodeRegistry.register({
        type: 'test-node',
        protocol: TestNode,
        defaultSize: { width: 300, height: 200 },
    });

    if (!NodeRegistry.isRegistered('test-node')) {
        throw new Error('test-node should be registered');
    }
});

test('NodeRegistry.register - throws without type', () => {
    resetRegistry();

    class TestNode extends BaseNode {}

    let threw = false;
    try {
        NodeRegistry.register({
            protocol: TestNode,
        });
    } catch (e) {
        threw = true;
        if (!e.message.includes('type is required')) {
            throw new Error(`Wrong error message: ${e.message}`);
        }
    }

    if (!threw) {
        throw new Error('Should throw when type is missing');
    }
});

test('NodeRegistry.register - throws without protocol', () => {
    resetRegistry();

    let threw = false;
    try {
        NodeRegistry.register({
            type: 'test-node',
        });
    } catch (e) {
        threw = true;
        if (!e.message.includes('protocol is required')) {
            throw new Error(`Wrong error message: ${e.message}`);
        }
    }

    if (!threw) {
        throw new Error('Should throw when protocol is missing');
    }
});

test('NodeRegistry.register - uses default size when not provided', () => {
    resetRegistry();

    class TestNode extends BaseNode {}

    NodeRegistry.register({
        type: 'test-node',
        protocol: TestNode,
    });

    const size = NodeRegistry.getDefaultSize('test-node');
    if (size.width !== 420 || size.height !== 200) {
        throw new Error(`Expected default size 420x200, got ${size.width}x${size.height}`);
    }
});

// ============================================================================
// NodeRegistry.getProtocolClass tests
// ============================================================================

test('NodeRegistry.getProtocolClass - returns registered class', () => {
    resetRegistry();

    class TestNode extends BaseNode {
        getTypeLabel() {
            return 'Test';
        }
    }

    NodeRegistry.register({
        type: 'test-node',
        protocol: TestNode,
    });

    const NodeClass = NodeRegistry.getProtocolClass('test-node');
    if (NodeClass !== TestNode) {
        throw new Error('Should return the registered protocol class');
    }
});

test('NodeRegistry.getProtocolClass - returns null for unregistered type', () => {
    resetRegistry();

    const NodeClass = NodeRegistry.getProtocolClass('nonexistent-type');
    if (NodeClass !== null) {
        throw new Error('Should return null for unregistered type');
    }
});

// ============================================================================
// NodeRegistry.getDefaultSize tests
// ============================================================================

test('NodeRegistry.getDefaultSize - returns registered size', () => {
    resetRegistry();

    class TestNode extends BaseNode {}

    NodeRegistry.register({
        type: 'test-node',
        protocol: TestNode,
        defaultSize: { width: 500, height: 400 },
    });

    const size = NodeRegistry.getDefaultSize('test-node');
    if (size.width !== 500 || size.height !== 400) {
        throw new Error(`Expected 500x400, got ${size.width}x${size.height}`);
    }
});

test('NodeRegistry.getDefaultSize - returns fallback for unregistered type', () => {
    resetRegistry();

    const size = NodeRegistry.getDefaultSize('nonexistent-type');
    if (size.width !== 420 || size.height !== 200) {
        throw new Error(`Expected fallback 420x200, got ${size.width}x${size.height}`);
    }
});

// ============================================================================
// NodeRegistry.buildClassMap tests
// ============================================================================

test('NodeRegistry.buildClassMap - returns map of all registered types', () => {
    resetRegistry();

    class NodeA extends BaseNode {}
    class NodeB extends BaseNode {}

    NodeRegistry.register({ type: 'node-a', protocol: NodeA });
    NodeRegistry.register({ type: 'node-b', protocol: NodeB });

    const classMap = NodeRegistry.buildClassMap();

    if (classMap['node-a'] !== NodeA) {
        throw new Error('classMap should contain NodeA');
    }
    if (classMap['node-b'] !== NodeB) {
        throw new Error('classMap should contain NodeB');
    }
});

// ============================================================================
// NodeRegistry.getRegisteredTypes tests
// ============================================================================

test('NodeRegistry.getRegisteredTypes - returns array of type names', () => {
    resetRegistry();

    class NodeA extends BaseNode {}
    class NodeB extends BaseNode {}

    NodeRegistry.register({ type: 'alpha', protocol: NodeA });
    NodeRegistry.register({ type: 'beta', protocol: NodeB });

    const types = NodeRegistry.getRegisteredTypes();

    if (!types.includes('alpha') || !types.includes('beta')) {
        throw new Error(`Expected ['alpha', 'beta'], got ${JSON.stringify(types)}`);
    }
});

// ============================================================================
// Plugin with custom event bindings
// ============================================================================

test('Plugin with getEventBindings - bindings are accessible via protocol', () => {
    resetRegistry();

    class PollNode extends BaseNode {
        getTypeLabel() {
            return 'Poll';
        }
        getTypeIcon() {
            return '📊';
        }

        getEventBindings() {
            return [
                {
                    selector: '.vote-btn',
                    handler: 'pollVote',
                },
                {
                    selector: '.poll-option',
                    multiple: true,
                    handler: (nodeId, e, canvas) => {
                        // Custom handler
                    },
                },
            ];
        }
    }

    NodeRegistry.register({
        type: 'poll',
        protocol: PollNode,
        defaultSize: { width: 400, height: 300 },
    });

    // Create instance and check bindings
    const node = { type: 'poll', id: 'test-id', content: '' };
    const NodeClass = NodeRegistry.getProtocolClass('poll');
    const instance = new NodeClass(node);
    const bindings = instance.getEventBindings();

    if (bindings.length !== 2) {
        throw new Error(`Expected 2 bindings, got ${bindings.length}`);
    }

    if (bindings[0].selector !== '.vote-btn') {
        throw new Error(`Expected selector '.vote-btn', got '${bindings[0].selector}'`);
    }

    if (bindings[0].handler !== 'pollVote') {
        throw new Error(`Expected handler 'pollVote', got '${bindings[0].handler}'`);
    }

    if (bindings[1].multiple !== true) {
        throw new Error('Second binding should have multiple: true');
    }
});

// ============================================================================
// Plugin with CSS
// ============================================================================

test('Plugin CSS and cssVariables - stored in config', () => {
    resetRegistry();

    class CustomNode extends BaseNode {}

    NodeRegistry.register({
        type: 'custom',
        protocol: CustomNode,
        css: '.node.custom { background: #f0f0f0; }',
        cssVariables: {
            '--node-custom': '#f0f0f0',
            '--node-custom-border': '#ccc',
        },
    });

    const config = NodeRegistry.getConfig('custom');

    if (!config.css.includes('.node.custom')) {
        throw new Error('CSS should be stored in config');
    }

    if (config.cssVariables['--node-custom'] !== '#f0f0f0') {
        throw new Error('CSS variables should be stored in config');
    }
});

// ============================================================================
// Override warning (hot reload)
// ============================================================================

test('NodeRegistry.register - warns on duplicate registration', () => {
    resetRegistry();

    class NodeV1 extends BaseNode {}
    class NodeV2 extends BaseNode {}

    // Capture console.warn
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = (msg) => {
        if (msg.includes('Overwriting')) {
            warnCalled = true;
        }
    };

    NodeRegistry.register({ type: 'dup', protocol: NodeV1 });
    NodeRegistry.register({ type: 'dup', protocol: NodeV2 });

    console.warn = originalWarn;

    if (!warnCalled) {
        throw new Error('Should warn when overwriting a registration');
    }

    // Verify V2 is now registered
    const NodeClass = NodeRegistry.getProtocolClass('dup');
    if (NodeClass !== NodeV2) {
        throw new Error('Should use the latest registration');
    }
});

// Print summary
console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
}
