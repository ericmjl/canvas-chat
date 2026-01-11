/**
 * Feature Registry - Central registry for feature plugins
 * Handles registration, slash command routing, priority management, and event coordination
 */

import { EventEmitter } from './event-emitter.js';
import { CanvasEvent, CancellableEvent } from './plugin-events.js';

/**
 * Priority levels for slash command resolution
 */
export const PRIORITY = {
    BUILTIN: 1000, // Built-in commands (highest by default)
    OFFICIAL: 500, // Official plugins
    COMMUNITY: 100, // Third-party plugins
    OVERRIDE: 2000, // Explicit config override (highest possible)
};

/**
 * FeatureRegistry manages all feature plugins in the application.
 * Provides:
 * - Feature registration and lifecycle management
 * - Slash command routing with priority-based conflict resolution
 * - Event bus for plugin communication
 */
class FeatureRegistry {
    constructor() {
        // Registered features: Map<featureId, featureInstance>
        this._features = new Map();

        // Slash commands: Map<command, { feature, handler, priority }>
        this._slashCommands = new Map();

        // Event bus for plugin communication
        this._eventBus = new EventEmitter();

        // App context (set later via setAppContext)
        this._appContext = null;
    }

    /**
     * Set the application context for dependency injection
     * @param {AppContext} appContext - Application context
     */
    setAppContext(appContext) {
        this._appContext = appContext;
    }

    /**
     * Register a feature plugin
     * @param {Object} config - Feature configuration
     * @param {string} config.id - Unique feature identifier
     * @param {Class} config.feature - FeaturePlugin class (not instance)
     * @param {Array} config.slashCommands - Array of slash command configs
     * @param {number} config.priority - Default priority for commands (optional)
     * @returns {Promise<void>}
     */
    async register(config) {
        const { id, feature: FeatureClass, slashCommands = [], priority = PRIORITY.BUILTIN } = config;

        if (this._features.has(id)) {
            throw new Error(`Feature "${id}" is already registered`);
        }

        if (!this._appContext) {
            throw new Error('AppContext must be set before registering features');
        }

        // Instantiate the feature with dependency injection
        const instance = new FeatureClass(this._appContext);
        this._features.set(id, instance);

        // Register slash commands with priority
        for (const cmd of slashCommands) {
            this._registerCommand(cmd, id, priority);
        }

        // Subscribe to events
        const subscriptions = instance.getEventSubscriptions?.() || {};
        for (const [eventName, handler] of Object.entries(subscriptions)) {
            this._eventBus.on(eventName, handler);
        }

        // Call lifecycle hook
        await instance.onLoad?.();

        console.log(`[FeatureRegistry] Registered feature: ${id}`);
    }

    /**
     * Register a single slash command
     * @param {Object} cmd - Command config
     * @param {string} cmd.command - Command string (e.g., '/committee')
     * @param {string} cmd.handler - Method name on feature instance
     * @param {number} cmd.priority - Override priority (optional)
     * @param {string} featureId - Feature that owns this command
     * @param {number} defaultPriority - Default priority if not specified
     * @private
     */
    _registerCommand(cmd, featureId, defaultPriority) {
        const { command, handler, priority = defaultPriority } = cmd;

        // Check for conflicts
        if (this._slashCommands.has(command)) {
            const existing = this._slashCommands.get(command);

            // If priorities are equal, it's an error (ambiguous)
            if (existing.priority === priority) {
                throw new Error(
                    `Slash command conflict: ${command}\n` +
                        `  - Feature "${existing.featureId}" (priority ${existing.priority})\n` +
                        `  - Feature "${featureId}" (priority ${priority})\n` +
                        `To resolve, set different priorities in the feature config.`
                );
            }

            // Higher priority wins
            if (priority <= existing.priority) {
                console.warn(
                    `[FeatureRegistry] Command ${command} from "${featureId}" ` +
                        `(priority ${priority}) is shadowed by "${existing.featureId}" ` +
                        `(priority ${existing.priority})`
                );
                return; // Don't register, existing command wins
            }

            // New command has higher priority, replace
            console.warn(
                `[FeatureRegistry] Command ${command} from "${featureId}" ` +
                    `(priority ${priority}) overrides "${existing.featureId}" ` +
                    `(priority ${existing.priority})`
            );
        }

        this._slashCommands.set(command, {
            featureId,
            handler,
            priority,
        });
    }

    /**
     * Handle a slash command by routing to the appropriate feature
     * @param {string} command - Command string (e.g., '/committee')
     * @param {string} args - Command arguments
     * @param {Object} context - Execution context (e.g., selected nodes, current node)
     * @returns {Promise<boolean>} true if command was handled, false otherwise
     */
    async handleSlashCommand(command, args, context) {
        const cmd = this._slashCommands.get(command);
        if (!cmd) {
            return false; // Command not found
        }

        // Emit before event (cancellable)
        const beforeEvent = new CancellableEvent('command:before', { command, args, context });
        this._eventBus.emit('command:before', beforeEvent);
        if (beforeEvent.cancelled) {
            console.log(`[FeatureRegistry] Command ${command} cancelled: ${beforeEvent.reason}`);
            return true; // Command was handled (by cancelling)
        }

        try {
            // Get feature instance and call handler method
            const feature = this._features.get(cmd.featureId);
            const handlerMethod = feature[cmd.handler];

            if (typeof handlerMethod !== 'function') {
                throw new Error(
                    `Handler "${cmd.handler}" not found on feature "${cmd.featureId}" for command ${command}`
                );
            }

            await handlerMethod.call(feature, command, args, context);

            // Emit after event
            this._eventBus.emit('command:after', new CanvasEvent('command:after', { command, result: 'success' }));
            return true;
        } catch (error) {
            // Emit error event
            this._eventBus.emit('command:error', new CanvasEvent('command:error', { command, error }));
            throw error; // Re-throw for app-level error handling
        }
    }

    /**
     * Get a registered feature instance by ID
     * @param {string} id - Feature ID
     * @returns {FeaturePlugin|undefined} Feature instance
     */
    getFeature(id) {
        return this._features.get(id);
    }

    /**
     * Get all registered slash commands
     * @returns {Array<string>} Array of command strings
     */
    getSlashCommands() {
        return Array.from(this._slashCommands.keys());
    }

    /**
     * Get the event bus for emitting custom events
     * @returns {EventEmitter} Event bus
     */
    getEventBus() {
        return this._eventBus;
    }

    /**
     * Emit an event on the event bus
     * @param {string} eventName - Event name (e.g., 'node:created')
     * @param {CanvasEvent} event - Event object
     */
    emit(eventName, event) {
        this._eventBus.emit(eventName, event);
    }

    /**
     * Subscribe to an event on the event bus
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler function
     * @returns {EventEmitter} Event bus (for chaining)
     */
    on(eventName, handler) {
        return this._eventBus.on(eventName, handler);
    }

    /**
     * Unregister a feature and clean up
     * @param {string} id - Feature ID
     * @returns {Promise<void>}
     */
    async unregister(id) {
        const feature = this._features.get(id);
        if (!feature) {
            return;
        }

        // Call lifecycle hook
        await feature.onUnload?.();

        // Remove slash commands owned by this feature
        for (const [command, cmd] of this._slashCommands.entries()) {
            if (cmd.featureId === id) {
                this._slashCommands.delete(command);
            }
        }

        // Remove feature instance
        this._features.delete(id);

        console.log(`[FeatureRegistry] Unregistered feature: ${id}`);
    }
}

export { FeatureRegistry };
