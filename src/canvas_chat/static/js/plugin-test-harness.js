/**
 * Plugin Test Harness
 * Reusable utilities for testing feature plugins in isolation
 */

import { FeatureRegistry } from './feature-registry.js';
import { AppContext } from './feature-plugin.js';

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

    autoPosition(existingNodes) {
        // Simple mock implementation - return a fixed position
        return { x: 100, y: 100 };
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
        this._eventHandlers = new Map();
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

    clearSelection() {
        // Mock implementation
    }

    centerOnAnimated(x, y, duration) {
        // Mock implementation
    }

    panToNodeAnimated(nodeId) {
        // Mock implementation
    }

    showStopButton(nodeId) {}
    hideStopButton(nodeId) {}
    showContinueButton(nodeId) {}
    hideContinueButton(nodeId) {}

    // Event emitter methods for plugin-scoped event handlers
    on(eventName, handler) {
        if (!this._eventHandlers.has(eventName)) {
            this._eventHandlers.set(eventName, []);
        }
        this._eventHandlers.get(eventName).push(handler);
        return this; // Chainable
    }

    off(eventName, handler) {
        if (this._eventHandlers.has(eventName)) {
            const handlers = this._eventHandlers.get(eventName);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
        return this; // Chainable
    }

    emit(eventName, ...args) {
        if (this._eventHandlers.has(eventName)) {
            for (const handler of this._eventHandlers.get(eventName)) {
                handler(...args);
            }
        }
    }
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
        this.registeredModals = new Map();
    }

    showSettingsModal() {
        this.modalsShown.push('settings');
    }

    showModal(modalId) {
        this.modalsShown.push(modalId);
    }

    registerModal(pluginId, modalId, htmlTemplate) {
        const key = `${pluginId}:${modalId}`;
        // Create a mock modal element with querySelector support
        const mockModal = {
            id: `${pluginId}-${modalId}-modal`,
            style: { display: 'none' },
            classList: { contains: () => true, add: () => {} },
            querySelector: (selector) => {
                // Return a mock element for common selectors
                const classes = new Set();
                return {
                    value: '',
                    checked: false,
                    innerHTML: '',
                    textContent: '',
                    style: { display: 'none' },
                    addEventListener: () => {},
                    appendChild: () => {},
                    disabled: false,
                    classList: {
                        contains: (cls) => classes.has(cls),
                        add: (cls) => classes.add(cls),
                        remove: (cls) => classes.delete(cls),
                        toggle: (cls) => {
                            if (classes.has(cls)) {
                                classes.delete(cls);
                                return false;
                            } else {
                                classes.add(cls);
                                return true;
                            }
                        },
                    },
                };
            },
            querySelectorAll: () => [],
            getElementById: (id) => {
                const classes = new Set();
                return {
                    value: '',
                    checked: false,
                    innerHTML: '',
                    textContent: '',
                    style: { display: 'none' },
                    addEventListener: () => {},
                    appendChild: () => {},
                    disabled: false,
                    classList: {
                        contains: (cls) => classes.has(cls),
                        add: (cls) => classes.add(cls),
                        remove: (cls) => classes.delete(cls),
                        toggle: (cls) => {
                            if (classes.has(cls)) {
                                classes.delete(cls);
                                return false;
                            } else {
                                classes.add(cls);
                                return true;
                            }
                        },
                    },
                };
            },
        };
        this.registeredModals.set(key, mockModal);
        return mockModal;
    }

    showPluginModal(pluginId, modalId) {
        this.modalsShown.push(`${pluginId}:${modalId}`);
    }

    hidePluginModal(pluginId, modalId) {
        // Mock implementation
    }

    getPluginModal(pluginId, modalId) {
        const key = `${pluginId}:${modalId}`;
        return this.registeredModals.get(key);
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
        // Track nodes created during tests
        this.createdNodes = [];
        // Track toast messages
        this.toasts = [];
        // Hook into graph.addNode to track created nodes (before AppContext creation)
        const originalAddNode = this.mockApp.graph.addNode.bind(this.mockApp.graph);
        this.mockApp.graph.addNode = (node) => {
            this.createdNodes.push(node);
            return originalAddNode(node);
        };
        // Hook into showToast to track toasts (before AppContext creation)
        const originalShowToast = this.mockApp.showToast.bind(this.mockApp);
        this.mockApp.showToast = (message, type) => {
            this.toasts.push({ message, type });
            return originalShowToast(message, type);
        };
        // Now create AppContext (it will use the hooked showToast)
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
        // Re-hook graph.addNode to track nodes
        const originalAddNode = this.mockApp.graph.addNode.bind(this.mockApp.graph);
        this.mockApp.graph.addNode = (node) => {
            this.createdNodes.push(node);
            return originalAddNode(node);
        };
        // Re-hook showToast to track toasts
        const originalShowToast = this.mockApp.showToast.bind(this.mockApp);
        this.mockApp.showToast = (message, type) => {
            this.toasts.push({ message, type });
            return originalShowToast(message, type);
        };
        this.createdNodes = [];
        this.toasts = [];
    }
}

export { PluginTestHarness, MockApp, MockCanvas, MockChat, MockStorage };
