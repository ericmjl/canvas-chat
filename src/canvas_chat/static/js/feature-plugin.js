/**
 * Feature Plugin System - Base classes for extensible features
 */

import { chat } from './chat.js';
import { storage } from './storage.js';
import { apiUrl } from './utils.js';

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
        /**
         * @param {string} nodeId
         * @param {AbortController} abortController
         * @param {Object|null} context
         */
        this.registerStreaming = (nodeId, abortController, context = null) => {
            app.streamingNodes.set(nodeId, { abortController, context });
        };
        /**
         * @param {string} nodeId
         */
        this.unregisterStreaming = (nodeId) => {
            app.streamingNodes.delete(nodeId);
        };
        /**
         * @param {string} nodeId
         * @returns {Object|undefined}
         */
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

        // Wrap graph.addNode to automatically handle user node creation zoom
        // Use lazy initialization since app.graph might not exist yet when AppContext is created
        const wrapGraphAddNode = () => {
            if (!app.graph || app.graph.addNode._wrapped) return;
            const originalAddNode = app.graph.addNode.bind(app.graph);
            /**
             * @param {Object} node
             * @returns {*}
             */
            app.graph.addNode = (node) => {
                app._userNodeCreation = true;
                return originalAddNode(node);
            };
            app.graph.addNode._wrapped = true;
        };
        this._wrapGraphAddNode = wrapGraphAddNode;
    }

    /**
     * Get graph instance (live reference, created during session load)
     * @returns {Object}
     */
    get graph() {
        this._wrapGraphAddNode();
        return this._app.graph;
    }

    /**
     * Get search index (live reference, created during session load)
     * @returns {Object}
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
     * @returns {Object|null}
     */
    get graph() {
        return this._context.graph;
    }

    /**
     * Get app instance for internal use
     * @returns {Object|null}
     */
    get _app() {
        return this._context._app;
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

    /**
     * Inject CSS styles for this plugin.
     * This allows plugins to be self-contained with their own styles.
     *
     * @param {string} css - CSS string to inject
     * @param {string} [id] - Optional unique ID for the style element (defaults to plugin class name)
     * @returns {HTMLStyleElement} The created style element
     */
    injectCSS(css, id = null) {
        if (!css || typeof css !== 'string') {
            console.warn('[FeaturePlugin] injectCSS: CSS must be a non-empty string');
            return null;
        }

        // Generate ID from class name if not provided
        if (!id) {
            id = `plugin-styles-${this.constructor.name.toLowerCase()}`;
        }

        // Check if style element already exists
        let styleElement = document.getElementById(id);
        if (styleElement) {
            // Update existing styles
            styleElement.textContent = css;
            return styleElement;
        }

        // Create new style element
        styleElement = document.createElement('style');
        styleElement.id = id;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);

        return styleElement;
    }

    /**
     * Inject CSS from a URL (for external plugins).
     * Creates a <link> element to load CSS from a remote or local URL.
     *
     * @param {string} url - URL to the CSS file
     * @param {string} [id] - Optional unique ID for the link element
     * @returns {HTMLLinkElement} The created link element
     */
    injectCSSFromURL(url, id = null) {
        if (!url || typeof url !== 'string') {
            console.warn('[FeaturePlugin] injectCSSFromURL: URL must be a non-empty string');
            return null;
        }

        // Generate ID from class name if not provided
        if (!id) {
            id = `plugin-styles-${this.constructor.name.toLowerCase()}`;
        }

        // Check if link element already exists
        let linkElement = document.getElementById(id);
        if (linkElement) {
            // Update existing link
            linkElement.href = url;
            return linkElement;
        }

        // Create new link element
        linkElement = document.createElement('link');
        linkElement.id = id;
        linkElement.rel = 'stylesheet';
        linkElement.href = url;
        document.head.appendChild(linkElement);

        return linkElement;
    }
}

export { AppContext, FeaturePlugin };
