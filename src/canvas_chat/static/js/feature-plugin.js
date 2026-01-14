/**
 * Feature Plugin System - Base classes for extensible features
 */

import { apiUrl } from './utils.js';
import { chat } from './chat.js';
import { storage } from './storage.js';

/**
 * AppContext provides access to app-level APIs for feature plugins.
 * This encapsulates the App instance's public interface, enabling
 * dependency injection without exposing internal implementation details.
 */
class AppContext {
    /**
     * @param {App} app - The main App instance
     */
    constructor(app) {
        // Store reference to app for live property access
        this._app = app;

        // Core objects (use getters for live references)
        // Note: Don't copy app.graph, app.searchIndex here - they're created later
        this.canvas = app.canvas;
        this.chat = chat; // Use global singleton from chat.js
        this.storage = storage; // Use global singleton from storage.js
        this.modalManager = app.modalManager;
        this.undoManager = app.undoManager;
        this.featureRegistry = app.featureRegistry;

        // UI elements
        this.modelPicker = app.modelPicker;
        this.chatInput = app.chatInput;

        // Helper methods (bound to app instance)
        this.showToast = app.showToast ? app.showToast.bind(app) : null;
        this.saveSession = app.saveSession.bind(app);
        this.updateEmptyState = app.updateEmptyState.bind(app);
        this.updateCollapseButtonForNode = app.updateCollapseButtonForNode
            ? app.updateCollapseButtonForNode.bind(app)
            : null;
        this.buildLLMRequest = app.buildLLMRequest.bind(app);
        this.generateNodeSummary = app.generateNodeSummary ? app.generateNodeSummary.bind(app) : null;

        // Unified streaming manager (preferred)
        this.streamingManager = app.streamingManager;

        // Legacy streaming state management (for backwards compatibility during migration)
        // TODO: Remove after all features migrated to StreamingManager
        this.registerStreaming = (nodeId, abortController, context = null) => {
            app.streamingNodes.set(nodeId, { abortController, context });
        };
        this.unregisterStreaming = (nodeId) => {
            app.streamingNodes.delete(nodeId);
        };
        this.getStreamingState = (nodeId) => {
            return app.streamingNodes.get(nodeId);
        };

        // Code feature dependencies
        this.pyodideRunner = typeof pyodideRunner !== 'undefined' ? pyodideRunner : null;
        this.streamingNodes = app.streamingNodes;
        this.apiUrl = apiUrl;

        // Admin mode access
        this.adminMode = app.adminMode;
        this.adminModels = app.adminModels;
    }

    /**
     * Get graph instance (live reference, created during session load)
     */
    get graph() {
        return this._app.graph;
    }

    /**
     * Get search index (live reference, created during session load)
     */
    get searchIndex() {
        return this._app.searchIndex;
    }
}

/**
 * FeaturePlugin is the base class for all feature plugins.
 * Feature plugins can register slash commands, subscribe to events,
 * and orchestrate complex workflows using app-level APIs.
 *
 * Example:
 *   class MyFeature extends FeaturePlugin {
 *       async onLoad() {
 *           console.log('Feature loaded!');
 *       }
 *
 *       async handleMyCommand(command, args, context) {
 *           const node = createNode(NodeType.TEXT, 'Hello from plugin!');
 *           this.graph.addNode(node);
 *       }
 *
 *       getEventSubscriptions() {
 *           return {
 *               'node:created': this.onNodeCreated.bind(this),
 *           };
 *       }
 *
 *       onNodeCreated(event) {
 *           console.log('Node created:', event.data.nodeId);
 *       }
 *   }
 */
class FeaturePlugin {
    /**
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        // Store context for live property access via getters
        // This ensures features always access current app state, not stale snapshots
        this._context = context;

        // Static dependencies (initialized before plugins, safe to copy)
        this.canvas = context.canvas;
        this.chat = context.chat;
        this.storage = context.storage;
        this.modalManager = context.modalManager;
        this.undoManager = context.undoManager;
        this.featureRegistry = context.featureRegistry;

        // Unified streaming manager (preferred for new code)
        this.streamingManager = context.streamingManager;

        // UI elements (initialized before plugins, safe to copy)
        this.modelPicker = context.modelPicker;
        this.chatInput = context.chatInput;

        // Helper methods (bound functions, safe to copy)
        this.showToast = context.showToast;
        this.saveSession = context.saveSession;
        this.updateEmptyState = context.updateEmptyState;
        this.updateCollapseButtonForNode = context.updateCollapseButtonForNode;
        this.buildLLMRequest = context.buildLLMRequest;
        this.generateNodeSummary = context.generateNodeSummary;

        // Legacy streaming state management (for backwards compatibility)
        // TODO: Remove after all features migrated to StreamingManager
        this.registerStreaming = context.registerStreaming;
        this.unregisterStreaming = context.unregisterStreaming;
        this.getStreamingState = context.getStreamingState;

        // Code feature dependencies
        this.pyodideRunner = context.pyodideRunner;
        this.streamingNodes = context.streamingNodes;
        this.apiUrl = context.apiUrl;

        // Admin mode (set once during init, safe to copy)
        this.adminMode = context.adminMode;
        this.adminModels = context.adminModels;
    }

    /**
     * Get graph instance (live reference - created during session load, after plugins)
     * @returns {CRDTGraph|null}
     */
    get graph() {
        return this._context.graph;
    }

    /**
     * Get search index (live reference - created during session load, after plugins)
     * @returns {SearchIndex|null}
     */
    get searchIndex() {
        return this._context.searchIndex;
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     * Override in subclasses to perform initialization.
     * @returns {Promise<void>}
     */
    async onLoad() {
        // Override in subclass
    }

    /**
     * Lifecycle hook called when the plugin is unloaded.
     * Override in subclasses to perform cleanup.
     * @returns {Promise<void>}
     */
    async onUnload() {
        // Override in subclass
    }

    /**
     * Return event subscriptions for this plugin.
     * Override in subclasses to subscribe to events.
     *
     * Example:
     *   getEventSubscriptions() {
     *       return {
     *           'node:created': this.onNodeCreated.bind(this),
     *           'command:before': this.onCommandBefore.bind(this),
     *       };
     *   }
     *
     * @returns {Object<string, Function>} Map of event names to handler functions
     */
    getEventSubscriptions() {
        return {};
    }

    /**
     * Return canvas event handlers for this plugin.
     * Override in subclasses to handle canvas events emitted by custom nodes.
     *
     * Example:
     *   getCanvasEventHandlers() {
     *       return {
     *           'pollVote': this.handlePollVote.bind(this),
     *           'pollAddOption': this.handlePollAddOption.bind(this),
     *       };
     *   }
     *
     * These handlers will be automatically registered on the canvas when the plugin loads
     * and unregistered when the plugin unloads.
     *
     * @returns {Object<string, Function>} Map of event names to handler functions
     */
    getCanvasEventHandlers() {
        return {};
    }

    /**
     * Emit an event through the feature registry.
     * Convenience method for plugins to emit custom events.
     *
     * @param {string} eventName - Name of the event to emit
     * @param {Object|CanvasEvent} event - Event object or data
     */
    emit(eventName, event) {
        if (this.featureRegistry) {
            this.featureRegistry.emit(eventName, event);
        }
    }
}

export { AppContext, FeaturePlugin };
