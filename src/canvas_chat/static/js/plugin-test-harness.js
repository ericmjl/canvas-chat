/**
 * Plugin Test Harness
 * Reusable utilities for testing feature plugins in isolation
 */

import { FeatureRegistry } from './feature-registry.js';
import { AppContext } from './feature-plugin.js';
import { CanvasEvent } from './plugin-events.js';

/**
 * Mock Graph for testing (doesn't require Yjs)
 */
class MockGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    addNode(node) {
        this.nodes.set(node.id, node);
    }

    removeNode(nodeId) {
        this.nodes.delete(nodeId);
    }

    updateNode(nodeId, updates) {
        const node = this.nodes.get(nodeId);
        if (node) {
            Object.assign(node, updates);
        }
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    getNodes() {
        return Array.from(this.nodes.values());
    }

    addEdge(edge) {
        this.edges.set(edge.id, edge);
    }

    removeEdge(edgeId) {
        this.edges.delete(edgeId);
    }

    getEdges() {
        return Array.from(this.edges.values());
    }

    clear() {
        this.nodes.clear();
        this.edges.clear();
    }

    on() {
        return this; // Chainable
    }
}

/**
 * Mock Canvas for testing
 */
class MockCanvas {
    constructor() {
        this.nodes = new Map();
        this.renderedNodes = [];
        this.removedNodes = [];
        this.updatedNodes = [];
    }

    renderNode(node) {
        this.renderedNodes.push(node.id);
        this.nodes.set(node.id, node);
    }

    removeNode(nodeId) {
        this.removedNodes.push(nodeId);
        this.nodes.delete(nodeId);
    }

    updateNodeContent(nodeId, content, isStreaming) {
        this.updatedNodes.push({ nodeId, content, isStreaming });
    }

    getSelectedNodeIds() {
        return [];
    }

    showStopButton(nodeId) {}
    hideStopButton(nodeId) {}
    showContinueButton(nodeId) {}
    hideContinueButton(nodeId) {}
}

/**
 * Mock Chat for testing
 */
class MockChat {
    constructor() {
        this.messages = [];
    }

    async sendMessage(messages, model, onChunk, onDone, onError) {
        this.messages.push({ messages, model });
        // Simulate a simple response
        if (onChunk) onChunk('Mock response');
        if (onDone) onDone();
    }

    getApiKeyForModel(model) {
        return 'mock-api-key';
    }
}

/**
 * Mock Storage for testing
 */
class MockStorage {
    constructor() {
        this.data = new Map();
    }

    getItem(key) {
        return this.data.get(key);
    }

    setItem(key, value) {
        this.data.set(key, value);
    }

    getApiKeys() {
        return { openai: 'mock-key' };
    }

    getApiKeyForProvider(provider) {
        return 'mock-key';
    }
}

/**
 * Mock ModalManager for testing
 */
class MockModalManager {
    constructor() {
        this.modalsShown = [];
    }

    showSettingsModal() {
        this.modalsShown.push('settings');
    }

    showModal(modalId) {
        this.modalsShown.push(modalId);
    }
}

/**
 * Mock UndoManager for testing
 */
class MockUndoManager {
    constructor() {
        this.actions = [];
    }

    push(action) {
        this.actions.push(action);
    }

    undo() {}
    redo() {}
}

/**
 * Mock SearchIndex for testing
 */
class MockSearchIndex {
    addDocument(doc) {}
    search(query) {
        return [];
    }
}

/**
 * Mock App for creating AppContext
 */
class MockApp {
    constructor() {
        this.graph = new MockGraph();
        this.canvas = new MockCanvas();
        this.chat = new MockChat();
        this.storage = new MockStorage();
        this.modalManager = new MockModalManager();
        this.undoManager = new MockUndoManager();
        this.searchIndex = new MockSearchIndex();

        this.modelPicker = {
            value: 'gpt-4',
            options: [
                { value: 'gpt-4', textContent: 'GPT-4' },
                { value: 'gpt-3.5-turbo', textContent: 'GPT-3.5 Turbo' },
                { value: 'claude-3', textContent: 'Claude 3' },
            ],
            querySelector: (selector) => {
                const match = selector.match(/option\[value="(.+)"\]/);
                if (match) {
                    return this.modelPicker.options.find((opt) => opt.value === match[1]);
                }
                return null;
            },
        };
        this.chatInput = { value: '', style: { height: 'auto' } };

        this.streamingNodes = new Map();
        this.adminMode = false;
        this.adminModels = [];

        // Track method calls
        this.methodCalls = {
            showToast: [],
            saveSession: [],
            updateEmptyState: [],
            buildLLMRequest: [],
        };
    }

    showToast(message, type) {
        this.methodCalls.showToast.push({ message, type });
    }

    saveSession() {
        this.methodCalls.saveSession.push({});
    }

    updateEmptyState() {
        this.methodCalls.updateEmptyState.push({});
    }

    updateCollapseButtonForNode(nodeId) {}

    buildLLMRequest(params) {
        this.methodCalls.buildLLMRequest.push(params);
        return {
            messages: params.messages || [],
            model: params.model || 'gpt-4',
            stream: params.stream !== false,
        };
    }

    generateNodeSummary(nodeId) {}
}

/**
 * PluginTestHarness provides a complete testing environment for feature plugins.
 * It creates mock versions of all app dependencies and provides utilities for:
 * - Loading and unloading plugins
 * - Executing slash commands
 * - Emitting and asserting events
 * - Verifying plugin behavior in isolation
 */
class PluginTestHarness {
    constructor() {
        this.mockApp = new MockApp();
        this.appContext = new AppContext(this.mockApp);
        this.registry = new FeatureRegistry();
        this.registry.setAppContext(this.appContext);
    }

    /**
     * Load a plugin into the test harness
     * @param {Object} config - Plugin configuration (same as FeatureRegistry.register)
     * @returns {Promise<void>}
     */
    async loadPlugin(config) {
        await this.registry.register(config);
    }

    /**
     * Unload a plugin from the test harness
     * @param {string} pluginId - Plugin ID
     * @returns {Promise<void>}
     */
    async unloadPlugin(pluginId) {
        await this.registry.unregister(pluginId);
    }

    /**
     * Execute a slash command
     * @param {string} command - Command string (e.g., '/test')
     * @param {string} args - Command arguments
     * @param {Object} context - Execution context
     * @returns {Promise<boolean>} true if command was handled
     */
    async executeSlashCommand(command, args = '', context = {}) {
        return await this.registry.handleSlashCommand(command, args, context);
    }

    /**
     * Emit an event on the event bus
     * @param {string} eventName - Event name
     * @param {CanvasEvent} event - Event object
     */
    emitEvent(eventName, event) {
        this.registry.emit(eventName, event);
    }

    /**
     * Subscribe to an event
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     */
    on(eventName, handler) {
        this.registry.on(eventName, handler);
    }

    /**
     * Get a plugin instance by ID
     * @param {string} pluginId - Plugin ID
     * @returns {FeaturePlugin|undefined} Plugin instance
     */
    getPlugin(pluginId) {
        return this.registry.getFeature(pluginId);
    }

    /**
     * Assert that no side effects occurred (for isolation testing)
     * Checks that no nodes were added, no toasts shown, etc.
     */
    assertNoSideEffects() {
        const errors = [];

        if (this.mockApp.graph.getNodes().length > 0) {
            errors.push(`Graph has ${this.mockApp.graph.getNodes().length} nodes (expected 0)`);
        }

        if (this.mockApp.canvas.renderedNodes.length > 0) {
            errors.push(`Canvas rendered ${this.mockApp.canvas.renderedNodes.length} nodes (expected 0)`);
        }

        if (this.mockApp.methodCalls.showToast.length > 0) {
            errors.push(`showToast called ${this.mockApp.methodCalls.showToast.length} times (expected 0)`);
        }

        if (errors.length > 0) {
            throw new Error('Side effects detected:\n  ' + errors.join('\n  '));
        }
    }

    /**
     * Reset the harness state (clear all nodes, messages, calls, etc.)
     */
    reset() {
        this.mockApp.graph = new MockGraph();
        this.mockApp.canvas = new MockCanvas();
        this.mockApp.chat = new MockChat();
        this.mockApp.methodCalls = {
            showToast: [],
            saveSession: [],
            updateEmptyState: [],
            buildLLMRequest: [],
        };
    }
}

export { PluginTestHarness, MockApp, MockCanvas, MockChat, MockStorage };
