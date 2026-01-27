/**
 * Feature Registry - Central registry for feature plugins
 * Handles registration, slash command routing, priority management, and event coordination
 */

import { EventEmitter } from './event-emitter.js';
import { CancellableEvent, CanvasEvent } from './plugin-events.js';
import { CodeFeature } from './plugins/code.js';
import { CommitteeFeature } from './plugins/committee.js';
import { FactcheckFeature } from './plugins/factcheck.js';
import { FlashcardFeature } from './plugins/flashcards.js';
import { GitRepoFeature } from './plugins/git-repo.js';
import { HighlightFeature } from './plugins/highlight.js';
import { ImageGenerationFeature } from './plugins/image-generation.js';
import { MatrixFeature } from './plugins/matrix.js';
import { NoteFeature } from './plugins/note.js';
import { PowerPointFeature } from './plugins/powerpoint-node.js';
import { ResearchFeature } from './plugins/research.js';
import { UrlFetchFeature } from './plugins/url-fetch.js';
import { YouTubeFeature } from './plugins/youtube.js';

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
    /**
     *
     */
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
     * Register all built-in features.
     * This method knows about all 6 built-in features and registers them automatically.
     * Called during app initialization.
     * @returns {Promise<void>}
     */
    async registerBuiltInFeatures() {
        // Built-in feature configurations
        const features = [
            {
                id: 'committee',
                feature: CommitteeFeature,
                slashCommands: [
                    {
                        command: '/committee',
                        handler: 'handleCommittee',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'flashcards',
                feature: FlashcardFeature,
                slashCommands: [], // Event-driven, no slash commands
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'matrix',
                feature: MatrixFeature,
                slashCommands: [
                    {
                        command: '/matrix',
                        handler: 'handleMatrix',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'factcheck',
                feature: FactcheckFeature,
                slashCommands: [
                    {
                        command: '/factcheck',
                        handler: 'handleFactcheck',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'research',
                feature: ResearchFeature,
                slashCommands: [
                    {
                        command: '/search',
                        handler: 'handleSearch',
                    },
                    {
                        command: '/research',
                        handler: 'handleResearch',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'code',
                feature: CodeFeature,
                slashCommands: [
                    {
                        command: '/code',
                        handler: 'handleCommand',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'note',
                feature: NoteFeature,
                slashCommands: [
                    {
                        command: '/note',
                        handler: 'handleCommand',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'git-repo',
                feature: GitRepoFeature,
                slashCommands: [
                    {
                        command: '/git',
                        handler: 'handleCommand',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'youtube',
                feature: YouTubeFeature,
                slashCommands: [
                    {
                        command: '/youtube',
                        handler: 'handleCommand',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'url-fetch',
                feature: UrlFetchFeature,
                slashCommands: [
                    {
                        command: '/fetch',
                        handler: 'handleCommand',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'image-generation',
                feature: ImageGenerationFeature,
                slashCommands: [
                    {
                        command: '/image',
                        handler: 'handleCommand',
                    },
                ],
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'highlight',
                feature: HighlightFeature,
                slashCommands: [], // Event-driven, no slash commands
                priority: PRIORITY.BUILTIN,
            },
            {
                id: 'powerpoint',
                feature: PowerPointFeature,
                slashCommands: [], // Event-driven (drag & drop), no slash commands
                priority: PRIORITY.BUILTIN,
            },
        ];

        console.log('[FeatureRegistry] Registering built-in features...');
        for (const config of features) {
            console.log(`[FeatureRegistry] Registering feature: ${config.id}`, {
                hasSlashCommands: config.slashCommands?.length > 0,
                slashCommands: config.slashCommands,
            });
            await this.register(config);
        }
        console.log('[FeatureRegistry] All built-in features registered');
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

        // Register canvas event handlers
        const canvasHandlers = instance.getCanvasEventHandlers?.() || {};
        if (!instance._canvasHandlers) {
            instance._canvasHandlers = [];
        }
        for (const [eventName, handler] of Object.entries(canvasHandlers)) {
            if (this._appContext && this._appContext.canvas) {
                this._appContext.canvas.on(eventName, handler);
                // Track handlers for cleanup
                instance._canvasHandlers.push({ eventName, handler });
            }
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
            console.log(
                `[FeatureRegistry] Command "${command}" not found in registry. Available commands:`,
                Array.from(this._slashCommands.keys())
            );
            return false; // Command not found
        }
        console.log(`[FeatureRegistry] Handling command "${command}" with args: "${args}"`, {
            featureId: cmd.featureId,
            handler: cmd.handler,
        });

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
     * Get all registered feature instances
     * @returns {Array<FeaturePlugin>} Array of all feature instances
     */
    getAllFeatures() {
        return Array.from(this._features.values());
    }

    /**
     * Get all registered slash commands (just command strings)
     * @returns {Array<string>} Array of command strings
     */
    getSlashCommands() {
        return Array.from(this._slashCommands.keys());
    }

    /**
     * Get all registered slash commands with full metadata (description, placeholder)
     * @returns {Array<Object>} Array of command objects with command, description, placeholder
     */
    getSlashCommandsWithMetadata() {
        const commands = [];

        // Get commands from all registered features
        for (const [featureId, feature] of this._features.entries()) {
            if (typeof feature.getSlashCommands === 'function') {
                const featureCommands = feature.getSlashCommands();
                for (const cmd of featureCommands) {
                    // Only include if this feature actually owns the command in registry
                    const registeredCmd = this._slashCommands.get(cmd.command);
                    if (registeredCmd && registeredCmd.featureId === featureId) {
                        commands.push(cmd);
                    }
                }
            }
        }

        return commands;
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

        // Unregister canvas event handlers
        if (feature._canvasHandlers) {
            for (const { eventName, handler } of feature._canvasHandlers) {
                if (this._appContext && this._appContext.canvas) {
                    this._appContext.canvas.off(eventName, handler);
                }
            }
            feature._canvasHandlers = [];
        }

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
