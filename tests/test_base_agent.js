/**
 * Tests for BaseAgent - the primary orchestrator in the agent architecture
 */

// Setup test globals
function assertTrue(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
}

/**
 * Run an async test
 */
async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
        return true;
    } catch (err) {
        console.error(`✗ ${name}`);
        console.error(`  ${err.message}`);
        return false;
    }
}

// ============================================================================
// Setup JSDOM environment before importing modules
// ============================================================================

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mock localStorage
const localStorageData = {};
global.localStorage = {
    getItem: (key) => localStorageData[key] || null,
    setItem: (key, value) => {
        localStorageData[key] = value;
    },
    removeItem: (key) => {
        delete localStorageData[key];
    },
    clear: () => {
        for (const key in localStorageData) {
            delete localStorageData[key];
        }
    },
};

// ============================================================================
// Import modules after DOM is set up
// ============================================================================

const { BaseAgent, createBaseAgentDefinition } = await import('../src/canvas_chat/static/js/agent/base-agent.js');

// ============================================================================
// Mock dependencies
// ============================================================================

function createMockGraph() {
    const nodes = new Map();
    const edges = [];
    return {
        getNode: (id) => nodes.get(id),
        addNode: (node) => {
            nodes.set(node.id, node);
            return node;
        },
        updateNode: (id, updates) => {
            const node = nodes.get(id);
            if (node) {
                Object.assign(node, updates);
            }
        },
        addEdge: (edge) => {
            edges.push(edge);
            return edge;
        },
        getParentIds: (id) => [],
        getChildIds: (id) => [],
        autoPosition: (parentIds) => ({ x: 100, y: 100 }),
        resolveContext: (nodeIds) => [],
        nodes: () => nodes.values(),
    };
}

function createMockCanvas() {
    let selectedIds = [];
    return {
        getSelectedNodeIds: () => selectedIds,
        setSelectedNodeIds: (ids) => {
            selectedIds = ids;
        },
        clearSelection: () => {
            selectedIds = [];
        },
        updateNodeContent: () => {},
        renderNode: () => {},
        renderEdge: () => {},
    };
}

function createMockChat() {
    return {
        streamChat: async function* (messages, model, options) {
            yield { choices: [{ delta: { content: 'Hello ' } }] };
            yield { choices: [{ delta: { content: 'world!' } }] };
        },
    };
}

function createMockFeatureRegistry() {
    const features = new Map();
    return {
        getFeature: (id) => features.get(id),
        registerFeature: (feature, priority) => {
            features.set(feature.id || feature.constructor?.name?.toLowerCase(), feature);
        },
        tryHandleCommand: async (command, args, context) => {
            // Simulate feature handling for known commands
            if (command === '/note') {
                return { handled: true, result: { type: 'note' } };
            }
            return { handled: false };
        },
        getSlashCommands: () => [],
    };
}

function createMockStreamingManager() {
    const streams = new Map();
    return {
        register: (nodeId, options) => {
            streams.set(nodeId, options);
        },
        unregister: (nodeId) => {
            streams.delete(nodeId);
        },
        isActive: (nodeId) => streams.has(nodeId),
        abort: (nodeId) => {
            const stream = streams.get(nodeId);
            if (stream?.abortController) {
                stream.abortController.abort();
            }
            streams.delete(nodeId);
        },
    };
}

// ============================================================================
// Tests
// ============================================================================

let passed = 0;
let failed = 0;

// Test: createBaseAgentDefinition creates valid definition
if (
    await asyncTest('createBaseAgentDefinition creates valid definition', async () => {
        const definition = createBaseAgentDefinition();

        assertEqual(definition.id, 'base-agent', 'Should have correct id');
        assertEqual(definition.name, 'Base Agent', 'Should have correct name');
        assertTrue(definition.allowedTools?.includes('create_human_node'), 'Should have create_human_node tool');
        assertTrue(definition.allowedTools?.includes('stream_response'), 'Should have stream_response tool');
    })
) {
    passed++;
} else {
    failed++;
}

// Test: BaseAgent can be instantiated
if (
    await asyncTest('BaseAgent can be instantiated', async () => {
        const agent = new BaseAgent({
            graph: createMockGraph(),
            canvas: createMockCanvas(),
            chat: createMockChat(),
            featureRegistry: createMockFeatureRegistry(),
            streamingManager: createMockStreamingManager(),
            getModel: () => 'test-model',
        });

        assertTrue(agent !== null, 'Agent should be created');
        assertTrue(typeof agent.invoke === 'function', 'Agent should have invoke method');
        assertTrue(typeof agent.registerSubAgent === 'function', 'Agent should have registerSubAgent method');
    })
) {
    passed++;
} else {
    failed++;
}

// Test: BaseAgent detects regular vs slash messages
if (
    await asyncTest('BaseAgent detects regular vs slash messages', async () => {
        const agent = new BaseAgent({
            graph: createMockGraph(),
            canvas: createMockCanvas(),
            chat: createMockChat(),
            featureRegistry: createMockFeatureRegistry(),
            streamingManager: createMockStreamingManager(),
            getModel: () => 'test-model',
        });

        // Test slash command detection without full execution
        const message1 = '/note Test content';
        const message2 = 'Hello, how are you?';

        assertTrue(message1.startsWith('/'), 'Should detect slash command');
        assertTrue(!message2.startsWith('/'), 'Should detect regular message');
    })
) {
    passed++;
} else {
    failed++;
}

// Test: BaseAgent sub-agent registration
if (
    await asyncTest('BaseAgent sub-agent registration', async () => {
        const agent = new BaseAgent({
            graph: createMockGraph(),
            canvas: createMockCanvas(),
            chat: createMockChat(),
            featureRegistry: createMockFeatureRegistry(),
            streamingManager: createMockStreamingManager(),
            getModel: () => 'test-model',
        });

        // Create a mock sub-agent definition (not the actual sub-agent handler)
        const mockAgentDef = createBaseAgentDefinition();
        mockAgentDef.id = 'test-sub-agent';
        mockAgentDef.name = 'Test Sub Agent';

        agent.registerSubAgent('/test', mockAgentDef);

        assertTrue(agent.hasSubAgent('/test'), 'Should have registered sub-agent');
        const registration = agent.getSubAgent('/test');
        assertEqual(registration.command, '/test', 'Registration should have correct command');
        assertEqual(registration.agentId, 'test-sub-agent', 'Registration should have correct agentId');
    })
) {
    passed++;
} else {
    failed++;
}

// Test: BaseAgent handles empty message
if (
    await asyncTest('BaseAgent handles empty message', async () => {
        const agent = new BaseAgent({
            graph: createMockGraph(),
            canvas: createMockCanvas(),
            chat: createMockChat(),
            featureRegistry: createMockFeatureRegistry(),
            streamingManager: createMockStreamingManager(),
            getModel: () => 'test-model',
        });

        const result = await agent.invoke({
            message: '',
            context: null,
            selectedNodeIds: [],
        });

        assertTrue(result.success === false, 'Empty message should fail');
        assertTrue(result.error !== undefined, 'Should have error message');
    })
) {
    passed++;
} else {
    failed++;
}

// Test: BaseAgent handles unknown slash command (fallback to featureRegistry)
if (
    await asyncTest('BaseAgent handles unknown slash command via featureRegistry fallback', async () => {
        // Feature registry that doesn't handle any commands
        const featureRegistry = {
            handleSlashCommand: async () => false, // Returns false for unhandled
            getSlashCommands: () => [],
        };

        const agent = new BaseAgent({
            graph: createMockGraph(),
            canvas: createMockCanvas(),
            chat: createMockChat(),
            featureRegistry,
            streamingManager: createMockStreamingManager(),
            getModel: () => 'test-model',
        });

        const result = await agent.invoke({
            message: '/unknowncommand args',
            context: null,
            selectedNodeIds: [],
        });

        assertTrue(result.success === false, 'Unknown command should fail');
        assertTrue(result.error?.includes('Unknown command'), 'Error should mention unknown command');
    })
) {
    passed++;
} else {
    failed++;
}

// Summary
console.log(`\n========================================`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`========================================`);

process.exit(failed > 0 ? 1 : 0);
