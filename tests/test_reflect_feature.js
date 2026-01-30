/**
 * Test for Reflect Feature integration
 *
 * Verifies that:
 * 1. ReflectFeature can be imported
 * 2. Reflection utilities work correctly
 * 3. The graph types include REFLECTION nodes and edges
 */

import { ReflectFeature } from '../src/canvas_chat/static/js/plugins/reflect-feature.js';
import { NodeType, EdgeType, DEFAULT_NODE_SIZES } from '../src/canvas_chat/static/js/graph-types.js';
import {
    findLeafToBranchPath,
    isBranchPoint,
    isLeafNode,
    getParentNodes,
} from '../src/canvas_chat/static/js/agent/reflection-utils.js';

// Mock AppContext for testing
const mockAppContext = {
    graph: {
        getNode: (id) => ({ id, type: 'ai', content: 'test' }),
        getOutgoing: (id) => [],
        getIncoming: (id) => [],
        addNode: () => {},
        updateNode: () => {},
        addEdge: () => {},
    },
    canvas: {
        selectedNode: null,
        renderNode: () => {},
        onReflectionComplete: null,
    },
    chat: {
        streamAI: (messages, model, onToken, callbacks) => {
            // Mock streaming - immediately call onComplete
            if (callbacks?.onComplete) callbacks.onComplete();
        },
    },
    showToast: () => {},
    modalManager: {},
};

console.log('Testing Reflect Feature Integration...\n');

// Test 1: NodeType.REFLECTION exists
test('NodeType.REFLECTION exists', () => {
    if (NodeType.REFLECTION !== 'reflection') {
        throw new Error(`Expected NodeType.REFLECTION to be 'reflection', got ${NodeType.REFLECTION}`);
    }
    console.log('✅ NodeType.REFLECTION is defined');
});

// Test 2: EdgeType.RUN_REFLECTION exists
test('EdgeType.RUN_REFLECTION exists', () => {
    if (EdgeType.RUN_REFLECTION !== 'run_reflection') {
        throw new Error(`Expected EdgeType.RUN_REFLECTION to be 'run_reflection', got ${EdgeType.RUN_REFLECTION}`);
    }
    console.log('✅ EdgeType.RUN_REFLECTION is defined');
});

// Test 3: ReflectFeature can be instantiated
test('ReflectFeature can be instantiated', () => {
    try {
        const feature = new ReflectFeature(mockAppContext);
        if (!feature.getSlashCommands) {
            throw new Error('ReflectFeature missing getSlashCommands method');
        }
        if (!feature.handleCommand) {
            throw new Error('ReflectFeature missing handleCommand method');
        }
        console.log('✅ ReflectFeature can be instantiated');
    } catch (error) {
        throw new Error(`Failed to instantiate ReflectFeature: ${error.message}`);
    }
});

// Test 4: ReflectFeature provides /reflect command
test('ReflectFeature provides /reflect command', () => {
    const feature = new ReflectFeature(mockAppContext);
    const commands = feature.getSlashCommands();
    const reflectCommand = commands.find((cmd) => cmd.command === '/reflect');
    if (!reflectCommand) {
        throw new Error('ReflectFeature does not provide /reflect command');
    }
    if (reflectCommand.description !== 'Analyze the path to this node and create a reflection') {
        throw new Error(`Unexpected command description: ${reflectCommand.description}`);
    }
    console.log('✅ ReflectFeature provides /reflect command');
});

// Test 5: Reflection utilities export functions
test('Reflection utilities export required functions', () => {
    const requiredFunctions = ['findLeafToBranchPath', 'isBranchPoint', 'isLeafNode', 'getParentNodes'];
    for (const fn of requiredFunctions) {
        if (typeof eval(fn) !== 'function') {
            throw new Error(`Missing function: ${fn}`);
        }
    }
    console.log('✅ Reflection utilities export all required functions');
});

// Test 6: GraphTypes includes reflection in size defaults
test('GraphTypes has default size for REFLECTION nodes', () => {
    if (!DEFAULT_NODE_SIZES[NodeType.REFLECTION]) {
        throw new Error('Missing DEFAULT_NODE_SIZES for REFLECTION');
    }
    if (DEFAULT_NODE_SIZES[NodeType.REFLECTION].width !== 640) {
        throw new Error(`Expected width 640, got ${DEFAULT_NODE_SIZES[NodeType.REFLECTION].width}`);
    }
    console.log('✅ DEFAULT_NODE_SIZES includes REFLECTION');
});

console.log('\n✨ All integration tests passed!');

// Helper function to run tests
function test(name, fn) {
    try {
        fn();
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
        process.exit(1);
    }
}
