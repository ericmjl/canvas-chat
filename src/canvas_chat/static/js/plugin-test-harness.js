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
    /**
     *
     */
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    /**
     *
     * @param {Object} node
     * @returns {void}
     */
    addNode(node) {
        this.nodes.set(node.id, node);
    }

    /**
     *
     * @param nodeId
     */
    removeNode(nodeId) {
        this.nodes.delete(nodeId);
    }

    /**
     *
     * @param nodeId
     * @param updates
     */
    updateNode(nodeId, updates) {
        const node = this.nodes.get(nodeId);
        if (node) {
            Object.assign(node, updates);
        }
    }

    /**
     *
     * @param {string} nodeId
     * @returns {Object|undefined}
     */
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    /**
     *
     * @returns {Object[]}
     */
    getNodes() {
        return Array.from(this.nodes.values());
    }

    /**
     *
     * @param edge
     */
    addEdge(edge) {
        this.edges.set(edge.id, edge);
    }

    /**
     *
     * @param edgeId
     */
    removeEdge(edgeId) {
        this.edges.delete(edgeId);
    }

    /**
     *
     * @returns {Object[]}
     */
    getEdges() {
        return Array.from(this.edges.values());
    }

    /**
     *
     */
    clear() {
        this.nodes.clear();
        this.edges.clear();
    }

    /**
     *
     * @returns {MockGraph}
     */
    on() {
        return this; // Chainable
    }

    /**
     *
     * @param {Object[]} _existingNodes
     * @returns {{x: number, y: number}}
     */
    autoPosition(_existingNodes) {
        // Simple mock implementation - return a fixed position
        return { x: 100, y: 100 };
    }
}

/**
 * Mock Canvas for testing
 */
class MockCanvas {
    /**
     *
     */
    constructor() {
        this.nodes = new Map();
        this.renderedNodes = [];
        this.removedNodes = [];
        this.updatedNodes = [];
        this._eventHandlers = new Map();
    }

    /**
     *
     * @param node
     */
    renderNode(node) {
        this.renderedNodes.push(node.id);
        this.nodes.set(node.id, node);
    }

    /**
     *
     * @param nodeId
     */
    removeNode(nodeId) {
        this.removedNodes.push(nodeId);
        this.nodes.delete(nodeId);
    }

    /**
     *
     * @param {string} nodeId
     * @param {string} content
     * @param {boolean} isStreaming
     * @returns {void}
     */
    updateNodeContent(nodeId, content, isStreaming) {
        this.updatedNodes.push({ nodeId, content, isStreaming });
    }

    /**
     *
     * @returns {string[]}
     */
    getSelectedNodeIds() {
        return [];
    }

    /**
     *
     * @returns {void}
     */
    clearSelection() {
        // Mock implementation
    }

    /**
     *
     * @param {number} _x
     * @param {number} _y
     * @param {number} _duration
     * @returns {void}
     */
    centerOnAnimated(_x, _y, _duration) {
        // Mock implementation
    }

    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    panToNodeAnimated(_nodeId) {
        // Mock implementation
    }

    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    showStopButton(_nodeId) {}
    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    hideStopButton(_nodeId) {}
    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    showContinueButton(_nodeId) {}
    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    hideContinueButton(_nodeId) {}

    // Event emitter methods for plugin-scoped event handlers
    /**
     *
     * @param {string} eventName
     * @param {Function} handler
     * @returns {MockCanvas}
     */
    on(eventName, handler) {
        if (!this._eventHandlers.has(eventName)) {
            this._eventHandlers.set(eventName, []);
        }
        this._eventHandlers.get(eventName).push(handler);
        return this; // Chainable
    }

    /**
     *
     * @param {string} eventName
     * @param {Function} handler
     * @returns {MockCanvas}
     */
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

    /**
     *
     * @param eventName
     * @param {...any} args
     */
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
    /**
     *
     */
    constructor() {
        this.messages = [];
    }

    /**
     *
     * @param {Object[]} messages
     * @param {string} model
     * @param {Function} onChunk
     * @param {Function} onDone
     * @param {Function} _onError
     * @returns {Promise<void>}
     */
    async sendMessage(messages, model, onChunk, onDone, _onError) {
        this.messages.push({ messages, model });
        // Simulate a simple response
        if (onChunk) onChunk('Mock response');
        if (onDone) onDone();
    }

    /**
     *
     * @param {string} _model
     * @returns {string}
     */
    getApiKeyForModel(_model) {
        return 'mock-api-key';
    }
}

/**
 * Mock Storage for testing
 */
class MockStorage {
    /**
     *
     */
    constructor() {
        this.data = new Map();
    }

    /**
     *
     * @param {string} key
     * @returns {*}
     */
    getItem(key) {
        return this.data.get(key);
    }

    /**
     *
     * @param {string} key
     * @param {*} value
     * @returns {void}
     */
    setItem(key, value) {
        this.data.set(key, value);
    }

    /**
     *
     * @returns {Object}
     */
    getApiKeys() {
        return { openai: 'mock-key' };
    }

    /**
     *
     * @param {string} _provider
     * @returns {string}
     */
    getApiKeyForProvider(_provider) {
        return 'mock-key';
    }
}

/**
 * Mock ModalManager for testing
 */
class MockModalManager {
    /**
     *
     */
    constructor() {
        this.modalsShown = [];
        this.registeredModals = new Map();
    }

    /**
     *
     */
    showSettingsModal() {
        this.modalsShown.push('settings');
    }

    /**
     *
     * @param modalId
     */
    showModal(modalId) {
        this.modalsShown.push(modalId);
    }

    /**
     *
     * @param {string} pluginId
     * @param {string} modalId
     * @param {string} _htmlTemplate
     * @returns {Object}
     */
    registerModal(pluginId, modalId, _htmlTemplate) {
        const key = `${pluginId}:${modalId}`;
        // Create a mock modal element with querySelector support
        const mockModal = {
            id: `${pluginId}-${modalId}-modal`,
            style: { display: 'none' },
            classList: { contains: () => true, add: () => {} },
            querySelector: (_selector) => {
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
            getElementById: (_id) => {
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

    /**
     *
     * @param pluginId
     * @param modalId
     */
    showPluginModal(pluginId, modalId) {
        this.modalsShown.push(`${pluginId}:${modalId}`);
    }

    /**
     *
     * @param {string} _pluginId
     * @param {string} _modalId
     * @returns {void}
     */
    hidePluginModal(_pluginId, _modalId) {
        // Mock implementation
    }

    /**
     *
     * @param {string} pluginId
     * @param {string} modalId
     * @returns {Object|undefined}
     */
    getPluginModal(pluginId, modalId) {
        const key = `${pluginId}:${modalId}`;
        return this.registeredModals.get(key);
    }
}

/**
 * Mock UndoManager for testing
 */
class MockUndoManager {
    /**
     *
     */
    constructor() {
        this.actions = [];
        this.pluginActionHandlers = new Map();
    }

    /**
     *
     * @param action
     */
    push(action) {
        this.actions.push(action);
    }

    /**
     *
     */
    undo() {}
    /**
     *
     */
    redo() {}

    /**
     * Allow plugins to register custom undo/redo handlers
     * @param {string} actionType - The action type (e.g., 'FILL_CELL')
     * @param {Object} handlers - { undo: Function, redo: Function }
     */
    registerActionHandler(actionType, handlers) {
        this.pluginActionHandlers.set(actionType, handlers);
    }

    /**
     * Check if action type has a plugin handler
     * @param {string} actionType
     * @returns {boolean}
     */
    hasActionHandler(actionType) {
        return this.pluginActionHandlers.has(actionType);
    }
}

/**
 * Mock SearchIndex for testing
 */
class MockSearchIndex {
    /**
     *
     * @param {Object} _doc
     * @returns {void}
     */
    addDocument(_doc) {}
    /**
     *
     * @param {string} _query
     * @returns {Array}
     */
    search(_query) {
        return [];
    }
}

/**
 * Mock App for creating AppContext
 */
class MockApp {
    /**
     *
     */
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

        // Flag for user-initiated node creation (used by addUserNode)
        this._userNodeCreation = false;

        // Track method calls
        this.methodCalls = {
            showToast: [],
            saveSession: [],
            updateEmptyState: [],
            buildLLMRequest: [],
        };
    }

    /**
     *
     * @param message
     * @param type
     */
    showToast(message, type) {
        this.methodCalls.showToast.push({ message, type });
    }

    /**
     *
     */
    saveSession() {
        this.methodCalls.saveSession.push({});
    }

    /**
     *
     */
    updateEmptyState() {
        this.methodCalls.updateEmptyState.push({});
    }

    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    updateCollapseButtonForNode(_nodeId) {}

    /**
     *
     * @param {Object} params
     * @returns {Object}
     */
    buildLLMRequest(params) {
        this.methodCalls.buildLLMRequest.push(params);
        return {
            messages: params.messages || [],
            model: params.model || 'gpt-4',
            stream: params.stream !== false,
        };
    }

    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    updateCollapseButtonForNode(_nodeId) {}

    /**
     *
     * @param {string} _nodeId
     * @returns {void}
     */
    generateNodeSummary(_nodeId) {}
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
    /**
     *
     */
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
