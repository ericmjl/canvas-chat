/**
 * Tests for StreamingManager
 *
 * The StreamingManager is critical infrastructure that manages streaming state
 * for all AI features (regular AI, committee, matrix, research, code).
 *
 * Test categories:
 * 1. Registration and lifecycle
 * 2. Stop/continue operations
 * 3. Group streaming (committee, matrix)
 * 4. UI state management (buttons)
 * 5. Edge cases and error handling
 */

// Setup global mocks
if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
    };
}

if (!global.indexedDB) {
    global.indexedDB = {
        open: () => {
            const request = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: {
                    transaction: () => ({
                        objectStore: () => ({
                            get: () => ({ onsuccess: null, onerror: null }),
                            put: () => ({ onsuccess: null, onerror: null }),
                            delete: () => ({ onsuccess: null, onerror: null }),
                        }),
                    }),
                },
            };
            setTimeout(() => {
                if (request.onsuccess) {
                    request.onsuccess({ target: request });
                }
            }, 0);
            return request;
        },
    };
}

import { StreamingManager } from '../src/canvas_chat/static/js/streaming-manager.js';
import { createNode, NodeType } from './test_setup.js';
import { assertEqual } from './test_helpers/assertions.js';

function test(description, fn) {
    try {
        fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        throw error;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// Mock Graph with simple node storage
class MockGraph {
    constructor() {
        this.nodes = new Map();
    }

    addNode(node) {
        this.nodes.set(node.id, node);
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    updateNode(nodeId, updates) {
        const node = this.nodes.get(nodeId);
        if (node) {
            Object.assign(node, updates);
        }
    }
}

// Mock Canvas with tracking capabilities
class MockCanvas {
    constructor() {
        this.stopButtonShown = new Set();
        this.stopButtonHidden = new Set();
        this.continueButtonShown = new Set();
        this.continueButtonHidden = new Set();
        this.updatedNodes = new Map();
        this.eventHandlers = new Map();
    }

    on(event, handler) {
        this.eventHandlers.set(event, handler);
        return this;
    }

    showStopButton(nodeId) {
        this.stopButtonShown.add(nodeId);
        this.stopButtonHidden.delete(nodeId);
    }

    hideStopButton(nodeId) {
        this.stopButtonHidden.add(nodeId);
        this.stopButtonShown.delete(nodeId);
    }

    showContinueButton(nodeId) {
        this.continueButtonShown.add(nodeId);
        this.continueButtonHidden.delete(nodeId);
    }

    hideContinueButton(nodeId) {
        this.continueButtonHidden.add(nodeId);
        this.continueButtonShown.delete(nodeId);
    }

    updateNodeContent(nodeId, content, isStreaming) {
        this.updatedNodes.set(nodeId, { content, isStreaming });
    }

    hasStopButton(nodeId) {
        return this.stopButtonShown.has(nodeId) && !this.stopButtonHidden.has(nodeId);
    }

    hasContinueButton(nodeId) {
        return this.continueButtonShown.has(nodeId) && !this.continueButtonHidden.has(nodeId);
    }

    reset() {
        this.stopButtonShown.clear();
        this.stopButtonHidden.clear();
        this.continueButtonShown.clear();
        this.continueButtonHidden.clear();
        this.updatedNodes.clear();
    }
}

console.log('\n=== Registration and Lifecycle Tests ===\n');

test('Can register a streaming operation', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    const abortController = new AbortController();
    manager.register('node-1', {
        abortController,
        featureId: 'ai',
        context: { message: 'test' },
    });

    assert(manager.isStreaming('node-1'), 'Node should be streaming');
    assert(!manager.isStopped('node-1'), 'Node should not be stopped');
    assert(canvas.hasStopButton('node-1'), 'Stop button should be shown');
});

test('Can unregister a streaming operation', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    const abortController = new AbortController();
    manager.register('node-1', {
        abortController,
        featureId: 'ai',
    });

    assert(manager.isStreaming('node-1'), 'Node should be streaming');

    manager.unregister('node-1');

    assert(!manager.isStreaming('node-1'), 'Node should not be streaming after unregister');
    assert(manager.getState('node-1') === null, 'State should be null after unregister');
    assert(!canvas.hasStopButton('node-1'), 'Stop button should be hidden');
});

test('Registration shows stop button by default', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
    });

    assert(canvas.hasStopButton('node-1'), 'Stop button should be shown by default');
});

test('Registration can suppress stop button', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        showStopButton: false,
    });

    assert(!canvas.hasStopButton('node-1'), 'Stop button should not be shown');
});

test('getState returns streaming state', () => {
    const manager = new StreamingManager();
    const abortController = new AbortController();
    const context = { message: 'test' };

    manager.register('node-1', {
        abortController,
        featureId: 'ai',
        context,
    });

    const state = manager.getState('node-1');
    assert(state !== null, 'State should exist');
    assertEqual(state.featureId, 'ai', 'Feature ID should match');
    assertEqual(state.context, context, 'Context should match');
    assertEqual(state.stopped, false, 'Should not be stopped initially');
});

test('activeCount returns correct number of active streams', () => {
    const manager = new StreamingManager();

    assertEqual(manager.activeCount, 0, 'Should start with 0 active streams');

    manager.register('node-1', { abortController: new AbortController(), featureId: 'ai' });
    assertEqual(manager.activeCount, 1, 'Should have 1 active stream');

    manager.register('node-2', { abortController: new AbortController(), featureId: 'ai' });
    assertEqual(manager.activeCount, 2, 'Should have 2 active streams');

    manager.unregister('node-1');
    assertEqual(manager.activeCount, 1, 'Should have 1 active stream after unregister');
});

test('getActiveNodeIds returns array of active node IDs', () => {
    const manager = new StreamingManager();

    manager.register('node-1', { abortController: new AbortController(), featureId: 'ai' });
    manager.register('node-2', { abortController: new AbortController(), featureId: 'committee' });

    const activeIds = manager.getActiveNodeIds();
    assertEqual(activeIds.length, 2, 'Should have 2 active nodes');
    assert(activeIds.includes('node-1'), 'Should include node-1');
    assert(activeIds.includes('node-2'), 'Should include node-2');
});

console.log('\n=== Stop/Continue Operations Tests ===\n');

test('stop() aborts the request and updates state', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    const abortController = new AbortController();
    let aborted = false;
    abortController.signal.addEventListener('abort', () => {
        aborted = true;
    });

    manager.register('node-1', {
        abortController,
        featureId: 'ai',
    });

    const result = manager.stop('node-1');

    assert(result === true, 'Stop should return true');
    assert(aborted, 'AbortController should be aborted');
    assert(!manager.isStreaming('node-1'), 'Node should not be streaming');
    assert(manager.isStopped('node-1'), 'Node should be stopped');
});

test('stop() hides stop button', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
    });

    assert(canvas.hasStopButton('node-1'), 'Stop button should be visible initially');

    manager.stop('node-1');

    assert(!canvas.hasStopButton('node-1'), 'Stop button should be hidden after stop');
});

test('stop() shows continue button only if onContinue provided', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    // Without onContinue
    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
    });

    manager.stop('node-1');
    assert(!canvas.hasContinueButton('node-1'), 'Should not show continue button without onContinue');

    canvas.reset();

    // With onContinue
    manager.register('node-2', {
        abortController: new AbortController(),
        featureId: 'ai',
        onContinue: async () => {},
    });

    manager.stop('node-2');
    assert(canvas.hasContinueButton('node-2'), 'Should show continue button with onContinue');
});

test('stop() calls custom onStop callback', () => {
    const manager = new StreamingManager();
    let stopCalled = false;
    let receivedNodeId = null;

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        onStop: (nodeId, state) => {
            stopCalled = true;
            receivedNodeId = nodeId;
        },
    });

    manager.stop('node-1');

    assert(stopCalled, 'onStop callback should be called');
    assertEqual(receivedNodeId, 'node-1', 'Callback should receive correct node ID');
});

test('stop() uses default behavior without onStop callback', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    const graph = new MockGraph();

    manager.setCanvas(canvas);
    manager.setGraphGetter(() => graph);

    const node = createNode(NodeType.AI, 'Partial response');
    graph.addNode(node);

    manager.register(node.id, {
        abortController: new AbortController(),
        featureId: 'ai',
    });

    manager.stop(node.id);

    // Check that graph was updated with stopped message
    const updatedNode = graph.getNode(node.id);
    assert(updatedNode !== undefined, 'Node should exist in graph');
    assert(updatedNode.content.includes('Generation stopped'), 'Should append stopped message');

    // Check UI updates happened
    assert(canvas.stopButtonHidden.has(node.id), 'Stop button should be hidden');
    assert(!canvas.continueButtonShown.has(node.id), 'Continue button should not be shown (no onContinue)');
});

test('stop() on non-existent node returns false', () => {
    const manager = new StreamingManager();
    const result = manager.stop('non-existent');
    assertEqual(result, false, 'Stop on non-existent node should return false');
});

test('continue() creates new abort controller and calls onContinue', async () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    let continueCalled = false;
    let receivedController = null;

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        onContinue: async (nodeId, state, abortController) => {
            continueCalled = true;
            receivedController = abortController;
        },
    });

    manager.stop('node-1');
    const result = await manager.continue('node-1');

    assert(result === true, 'Continue should return true');
    assert(continueCalled, 'onContinue callback should be called');
    assert(receivedController !== null, 'Should receive new abort controller');
    assert(manager.isStreaming('node-1'), 'Node should be streaming again');
    assert(!manager.isStopped('node-1'), 'Node should not be stopped');
});

test('continue() updates UI buttons', async () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        onContinue: async () => {},
    });

    manager.stop('node-1');
    assert(canvas.hasContinueButton('node-1'), 'Continue button should be shown after stop');

    await manager.continue('node-1');

    assert(!canvas.hasContinueButton('node-1'), 'Continue button should be hidden');
    assert(canvas.hasStopButton('node-1'), 'Stop button should be shown');
});

test('continue() without onContinue returns false', async () => {
    const manager = new StreamingManager();

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        // No onContinue
    });

    manager.stop('node-1');
    const result = await manager.continue('node-1');

    assertEqual(result, false, 'Continue without onContinue should return false');
});

test('continue() on non-stopped node returns false', async () => {
    const manager = new StreamingManager();

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        onContinue: async () => {},
    });

    // Don't stop first
    const result = await manager.continue('node-1');

    assertEqual(result, false, 'Continue on non-stopped node should return false');
});

console.log('\n=== Group Streaming Tests ===\n');

test('Can register multiple nodes in a group', () => {
    const manager = new StreamingManager();

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
    });

    manager.register('node-2', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
    });

    const groupNodes = manager.getGroupNodes('group-1');
    assertEqual(groupNodes.size, 2, 'Group should have 2 nodes');
    assert(groupNodes.has('node-1'), 'Group should contain node-1');
    assert(groupNodes.has('node-2'), 'Group should contain node-2');
});

test('stopGroup() stops all nodes in group', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    const abortController = new AbortController();
    let aborted = false;
    abortController.signal.addEventListener('abort', () => {
        aborted = true;
    });

    // Same abort controller for both (simulates committee pattern)
    manager.register('node-1', {
        abortController,
        featureId: 'committee',
        groupId: 'group-1',
    });

    manager.register('node-2', {
        abortController,
        featureId: 'committee',
        groupId: 'group-1',
    });

    const result = manager.stopGroup('group-1');

    assert(result === true, 'stopGroup should return true');
    assert(aborted, 'Abort controller should be aborted');
    assert(manager.isStopped('node-1'), 'Node-1 should be stopped');
    assert(manager.isStopped('node-2'), 'Node-2 should be stopped');
});

test('stop() on grouped node stops entire group', () => {
    const manager = new StreamingManager();

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
    });

    manager.register('node-2', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
    });

    // Stop just one node - should stop whole group
    manager.stop('node-1');

    assert(manager.isStopped('node-1'), 'Node-1 should be stopped');
    assert(manager.isStopped('node-2'), 'Node-2 should also be stopped (same group)');
});

test('Group is removed when all nodes unregistered', () => {
    const manager = new StreamingManager();

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
    });

    manager.register('node-2', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
    });

    assertEqual(manager.getGroupNodes('group-1').size, 2, 'Group should have 2 nodes');

    manager.unregister('node-1');
    assertEqual(manager.getGroupNodes('group-1').size, 1, 'Group should have 1 node');

    manager.unregister('node-2');
    assertEqual(manager.getGroupNodes('group-1').size, 0, 'Group should be empty');
});

test('stopGroup() calls onStop for each node', () => {
    const manager = new StreamingManager();
    const stopCalls = [];

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
        onStop: (nodeId) => stopCalls.push(nodeId),
    });

    manager.register('node-2', {
        abortController: new AbortController(),
        featureId: 'committee',
        groupId: 'group-1',
        onStop: (nodeId) => stopCalls.push(nodeId),
    });

    manager.stopGroup('group-1');

    assertEqual(stopCalls.length, 2, 'Should call onStop for both nodes');
    assert(stopCalls.includes('node-1'), 'Should call onStop for node-1');
    assert(stopCalls.includes('node-2'), 'Should call onStop for node-2');
});

console.log('\n=== Canvas Event Integration Tests ===\n');

test('handleStopEvent() stops streaming node', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
    });

    // Simulate canvas event
    const stopHandler = canvas.eventHandlers.get('nodeStopGeneration');
    assert(stopHandler !== undefined, 'Stop event handler should be registered');

    stopHandler('node-1');

    assert(manager.isStopped('node-1'), 'Node should be stopped');
});

test('handleContinueEvent() continues stopped node', async () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    let continueCalled = false;

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        onContinue: async () => {
            continueCalled = true;
        },
    });

    manager.stop('node-1');

    // Simulate canvas event
    const continueHandler = canvas.eventHandlers.get('nodeContinueGeneration');
    assert(continueHandler !== undefined, 'Continue event handler should be registered');

    await continueHandler('node-1');

    assert(continueCalled, 'Continue callback should be called');
    assert(manager.isStreaming('node-1'), 'Node should be streaming again');
});

test('handleStopEvent() handles matrix group', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    const matrixId = 'matrix-node';
    const groupId = `matrix-${matrixId}`;

    // Register matrix cells as group
    manager.register('cell-1', {
        abortController: new AbortController(),
        featureId: 'matrix',
        groupId,
    });

    manager.register('cell-2', {
        abortController: new AbortController(),
        featureId: 'matrix',
        groupId,
    });

    // Stop matrix node (not a cell)
    const stopHandler = canvas.eventHandlers.get('nodeStopGeneration');
    stopHandler(matrixId);

    // Should stop all cells
    assert(manager.isStopped('cell-1'), 'Cell-1 should be stopped');
    assert(manager.isStopped('cell-2'), 'Cell-2 should be stopped');
});

console.log('\n=== Edge Cases and Error Handling Tests ===\n');

test('clear() aborts all streams and clears state', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    const controller1 = new AbortController();
    const controller2 = new AbortController();
    let aborted1 = false;
    let aborted2 = false;

    controller1.signal.addEventListener('abort', () => {
        aborted1 = true;
    });
    controller2.signal.addEventListener('abort', () => {
        aborted2 = true;
    });

    manager.register('node-1', {
        abortController: controller1,
        featureId: 'ai',
    });

    manager.register('node-2', {
        abortController: controller2,
        featureId: 'committee',
    });

    assertEqual(manager.activeCount, 2, 'Should have 2 active streams');

    manager.clear();

    assert(aborted1, 'First controller should be aborted');
    assert(aborted2, 'Second controller should be aborted');
    assertEqual(manager.activeCount, 0, 'Should have 0 active streams after clear');
    assert(!canvas.hasStopButton('node-1'), 'Stop button should be hidden');
    assert(!canvas.hasStopButton('node-2'), 'Stop button should be hidden');
});

test('Default stop messages are feature-specific', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    const graph = new MockGraph();

    manager.setCanvas(canvas);
    manager.setGraphGetter(() => graph);

    const testCases = [
        { featureId: 'ai', expected: 'Generation stopped' },
        { featureId: 'research', expected: 'Research stopped' },
        { featureId: 'committee', expected: 'Committee stopped' },
        { featureId: 'matrix', expected: 'Fill stopped' },
    ];

    for (const { featureId, expected } of testCases) {
        const node = createNode(NodeType.AI, 'Test');
        graph.addNode(node);
        canvas.reset();

        manager.register(node.id, {
            abortController: new AbortController(),
            featureId,
        });

        manager.stop(node.id);

        const updatedNode = graph.getNode(node.id);
        assert(updatedNode !== undefined, `Node should exist for ${featureId}`);
        assert(updatedNode.content.includes(expected), `Should include "${expected}" for ${featureId}`);
    }
});

test('unregister with hideButtons=false preserves button state', () => {
    const manager = new StreamingManager();
    const canvas = new MockCanvas();
    manager.setCanvas(canvas);

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
    });

    assert(canvas.hasStopButton('node-1'), 'Stop button should be visible');

    manager.unregister('node-1', { hideButtons: false });

    assert(canvas.hasStopButton('node-1'), 'Stop button should still be visible');
});

test('Multiple stop calls are idempotent', () => {
    const manager = new StreamingManager();
    let stopCallCount = 0;

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        onStop: () => {
            stopCallCount++;
        },
    });

    manager.stop('node-1');
    manager.stop('node-1');
    manager.stop('node-1');

    assertEqual(stopCallCount, 1, 'onStop should only be called once');
});

test('isStreaming returns false for stopped nodes', () => {
    const manager = new StreamingManager();

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
    });

    assert(manager.isStreaming('node-1'), 'Should be streaming initially');
    assert(!manager.isStopped('node-1'), 'Should not be stopped initially');

    manager.stop('node-1');

    assert(!manager.isStreaming('node-1'), 'Should not be streaming after stop');
    assert(manager.isStopped('node-1'), 'Should be stopped after stop');
});

test('getGroupNodes returns empty set for non-existent group', () => {
    const manager = new StreamingManager();
    const nodes = manager.getGroupNodes('non-existent');
    assertEqual(nodes.size, 0, 'Should return empty set');
});

test('Context is preserved through stop/continue cycle', async () => {
    const manager = new StreamingManager();
    const originalContext = { messages: ['hello'], attempt: 1 };
    let receivedContext = null;

    manager.register('node-1', {
        abortController: new AbortController(),
        featureId: 'ai',
        context: originalContext,
        onContinue: async (nodeId, state) => {
            receivedContext = state.context;
        },
    });

    manager.stop('node-1');
    await manager.continue('node-1');

    assertEqual(receivedContext, originalContext, 'Context should be preserved');
});

console.log('\n=== All StreamingManager tests passed! ===\n');
