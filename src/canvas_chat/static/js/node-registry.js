/**
 * Node Registry - Plugin System for Canvas-Chat
 *
 * Enables dynamic registration of node types. Both built-in node types and
 * third-party plugins use this same registration API.
 *
 * Usage:
 *   // Register a custom node type
 *   NodeRegistry.register({
 *       type: 'my-node',
 *       protocol: MyNodeClass,
 *       defaultSize: { width: 500, height: 300 },
 *       css: '.node.my-node { background: #f0f0f0; }',
 *       cssVariables: { '--node-my-node': '#f0f0f0' }
 *   });
 *
 *   // Use in rendering
 *   const NodeClass = NodeRegistry.getProtocolClass('my-node');
 *   const size = NodeRegistry.getDefaultSize('my-node');
 */

import { NodeType } from './graph-types.js';

/**
 * @typedef {Object} SlashCommandConfig
 * @property {string} command - Slash command (e.g., '/poll')
 * @property {string} description - Description for autocomplete menu
 * @property {string} placeholder - Placeholder text for input
 * @property {Function} handler - Handler function(app, args, context)
 * @property {boolean} [requiresContext] - Whether command requires selected nodes
 */

/**
 * @typedef {Object} SlashCommandWithType
 * @property {string} command - Slash command (e.g., '/poll')
 * @property {string} description - Description for autocomplete menu
 * @property {string} placeholder - Placeholder text for input
 * @property {Function} handler - Handler function(app, args, context)
 * @property {boolean} [requiresContext] - Whether command requires selected nodes
 * @property {string} type - Node type identifier linked to this command
 */

/**
 * @typedef {Object} NodeTypeConfig
 * @property {string} type - Unique node type identifier (e.g., 'poll', 'diagram')
 * @property {Function} protocol - Class extending BaseNode
 * @property {{width: number, height: number}} [defaultSize] - Default dimensions
 * @property {string} [css] - CSS rules for this node type
 * @property {Object.<string, string>} [cssVariables] - CSS custom properties
 * @property {Function} [createNode] - Optional custom factory function
 * @property {SlashCommandConfig} [slashCommand] - Optional slash command registration
 */

/**
 * Node Registry singleton
 * Manages registration and lookup of node types for the plugin system
 */
const NodeRegistry = {
    /**
     * Registered node types
     * @type {Map<string, NodeTypeConfig>}
     * @private
     */
    _types: new Map(),

    /**
     * Registered slash commands
     * @type {Map<string, SlashCommandWithType>}
     * @private
     */
    _slashCommands: new Map(),

    /**
     * Style element for injected CSS
     * @type {HTMLStyleElement|null}
     * @private
     */
    _styleElement: null,

    /**
     * Whether built-in types have been registered
     * @type {boolean}
     * @private
     */
    _builtinsRegistered: false,

    /**
     * Register a node type
     * @param {NodeTypeConfig} config - Node type configuration
     * @throws {Error} If type already registered or config invalid
     */
    register(config) {
        // Validate required fields
        if (!config.type) {
            throw new Error('NodeRegistry.register: type is required');
        }
        if (!config.protocol) {
            throw new Error(`NodeRegistry.register: protocol is required for type "${config.type}"`);
        }
        if (typeof config.protocol !== 'function') {
            throw new Error(`NodeRegistry.register: protocol must be a class for type "${config.type}"`);
        }

        // Check for duplicate registration (warn but allow override for hot reload)
        if (this._types.has(config.type)) {
            console.warn(`NodeRegistry: Overwriting existing type "${config.type}"`);
        }

        // Store the config
        this._types.set(config.type, {
            type: config.type,
            protocol: config.protocol,
            defaultSize: config.defaultSize || { width: 420, height: 200 },
            css: config.css || '',
            cssVariables: config.cssVariables || {},
            createNode: config.createNode || null,
            slashCommand: config.slashCommand || null,
        });

        // Register slash command if provided
        if (config.slashCommand) {
            const cmd = config.slashCommand;
            if (!cmd.command || !cmd.handler) {
                console.warn(`NodeRegistry: Invalid slash command for type "${config.type}"`);
            } else {
                this._slashCommands.set(cmd.command, {
                    ...cmd,
                    type: config.type, // Link back to node type
                });
                console.debug(`NodeRegistry: Registered slash command "${cmd.command}" for type "${config.type}"`);
            }
        }

        // Add to NodeType enum if it doesn't exist
        if (typeof NodeType !== 'undefined' && !NodeType[config.type.toUpperCase()]) {
            NodeType[config.type.toUpperCase()] = config.type;
        }

        // Inject CSS if provided
        if (config.css || Object.keys(config.cssVariables || {}).length > 0) {
            this._injectStyles();
        }

        // Log registration in development
        if (typeof console !== 'undefined' && console.debug) {
            console.debug(`NodeRegistry: Registered type "${config.type}"`);
        }
    },

    /**
     * Get the protocol class for a node type
     * @param {string} type - Node type identifier
     * @returns {Function|null} Protocol class or null if not found
     */
    getProtocolClass(type) {
        const config = this._types.get(type);
        return config ? config.protocol : null;
    },

    /**
     * Get default size for a node type
     * @param {string} type - Node type identifier
     * @returns {{width: number, height: number}} Default dimensions
     */
    getDefaultSize(type) {
        const config = this._types.get(type);
        return config ? config.defaultSize : { width: 420, height: 200 };
    },

    /**
     * Check if a node type is registered
     * @param {string} type - Node type identifier
     * @returns {boolean}
     */
    isRegistered(type) {
        return this._types.has(type);
    },

    /**
     * Get all registered type identifiers
     * @returns {string[]}
     */
    getRegisteredTypes() {
        return Array.from(this._types.keys());
    },

    /**
     * Get the full config for a node type
     * @param {string} type - Node type identifier
     * @returns {NodeTypeConfig|null}
     */
    getConfig(type) {
        return this._types.get(type) || null;
    },

    /**
     * Create a node using the registered factory (if custom) or default createNode
     * @param {string} type - Node type identifier
     * @param {string} content - Node content
     * @param {Object} options - Additional options
     * @returns {Object} New node object
     */
    createNode(type, content, options = {}) {
        const config = this._types.get(type);

        // Use custom factory if provided
        if (config && config.createNode) {
            return config.createNode(content, options);
        }

        // Fall back to default createNode from graph-types.js
        if (typeof window.createNode === 'function') {
            return window.createNode(type, content, options);
        }

        throw new Error(`NodeRegistry: Cannot create node of type "${type}" - no factory available`);
    },

    /**
     * Build class map for wrapNode() factory
     * @returns {Object.<string, Function>} Map of type -> protocol class
     */
    buildClassMap() {
        const map = {};
        for (const [type, config] of this._types) {
            map[type] = config.protocol;
        }
        return map;
    },

    /**
     * Inject all registered CSS into the document
     * @private
     */
    _injectStyles() {
        // Skip if not in browser
        if (typeof document === 'undefined') return;

        // Create style element if needed
        if (!this._styleElement) {
            this._styleElement = document.createElement('style');
            this._styleElement.id = 'node-registry-styles';
            document.head.appendChild(this._styleElement);
        }

        // Build CSS string
        let css = '/* Node Registry Plugin Styles */\n\n';

        // Add CSS variables to :root
        const allVariables = {};
        for (const config of this._types.values()) {
            Object.assign(allVariables, config.cssVariables);
        }

        if (Object.keys(allVariables).length > 0) {
            css += ':root {\n';
            for (const [prop, value] of Object.entries(allVariables)) {
                css += `    ${prop}: ${value};\n`;
            }
            css += '}\n\n';
        }

        // Add type-specific CSS
        for (const config of this._types.values()) {
            if (config.css) {
                css += `/* ${config.type} */\n${config.css}\n\n`;
            }
        }

        this._styleElement.textContent = css;
    },

    /**
     * Register all built-in node types
     * Called automatically when node-protocols.js loads
     */
    registerBuiltins() {
        if (this._builtinsRegistered) return;

        // This will be called after node-protocols.js defines the classes
        // The actual registration happens in node-protocols.js
        this._builtinsRegistered = true;
    },

    /**
     * Get all registered slash commands
     * @returns {Array<{command: string, description: string, placeholder: string, handler: Function, requiresContext: boolean, type: string}>}
     */
    getSlashCommands() {
        return Array.from(this._slashCommands.values());
    },

    /**
     * Get slash command by command string
     * @param {string} command - Command string (e.g., '/poll')
     * @returns {Object|null} Command config or null if not found
     */
    getSlashCommand(command) {
        return this._slashCommands.get(command) || null;
    },

    /**
     * Check if a slash command is registered
     * @param {string} command - Command string (e.g., '/poll')
     * @returns {boolean}
     */
    hasSlashCommand(command) {
        return this._slashCommands.has(command);
    },

    /**
     * Clear all registrations (for testing)
     */
    _reset() {
        this._types.clear();
        this._slashCommands.clear();
        this._builtinsRegistered = false;
        if (this._styleElement) {
            this._styleElement.textContent = '';
        }
    },
};

// Freeze the registry object to prevent accidental modification
Object.freeze(NodeRegistry.register);
Object.freeze(NodeRegistry.getProtocolClass);
Object.freeze(NodeRegistry.getDefaultSize);

// ES Module export
export { NodeRegistry };

// Also expose to global scope for backwards compatibility with non-module scripts
if (typeof window !== 'undefined') {
    window.NodeRegistry = NodeRegistry;
}
