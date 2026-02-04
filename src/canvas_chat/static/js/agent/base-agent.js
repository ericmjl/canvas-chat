/**
 * Base Agent
 *
 * The Base Agent is the primary orchestrator for user message handling.
 * It receives user input from handleSend() and either:
 * - Handles regular messages directly (creates human/AI nodes, streams response)
 * - Delegates slash commands to sub-agents
 *
 * Key Principle: The canvas is the clock. The DAG is the truth. Agents are reactors, not daemons.
 *
 * @module base-agent
 */

import { EventType, createAgentDefinition, createRunContext, createRunRequest, createEvent } from './agent-types.js';
import { RunController } from './run-controller.js';
import { createComponentLogger } from './debug-logger.js';
import { apiUrl } from '../utils.js';
import { readSSEStream, normalizeText } from '../sse.js';

const logger = createComponentLogger('BaseAgent');

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * @typedef {import('../crdt-graph.js').CRDTGraph} CRDTGraph
 */

/**
 * @typedef {import('../canvas.js').Canvas} Canvas
 */

/**
 * @typedef {import('../feature-registry.js').FeatureRegistry} FeatureRegistry
 */

/**
 * @typedef {import('../node-registry.js').NodeRegistry} NodeRegistry
 */

/**
 * @typedef {import('../streaming-manager.js').StreamingManager} StreamingManager
 */

/**
 * @typedef {import('../feature-plugin.js').FeaturePlugin} FeaturePlugin
 */

/**
 * Input to the base agent
 * @typedef {Object} BaseAgentInput
 * @property {string} message - User's message content
 * @property {string|null} [context] - Context from selected text or nodes
 * @property {string[]} [selectedNodeIds] - IDs of selected nodes on canvas
 */

/**
 * Result from base agent execution
 * @typedef {Object} BaseAgentResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} [runId] - Run ID if tracked
 * @property {string[]} [artifactNodeIds] - Created artifact node IDs
 * @property {string} [error] - Error message if failed
 * @property {boolean} [wasSlashCommand] - Whether this was a slash command
 * @property {string} [subAgentId] - Sub-agent ID if delegated
 * @property {string} [type] - Type of operation ('slash-command' or 'chat')
 * @property {string} [humanNodeId] - Created human node ID
 * @property {string} [aiNodeId] - Created AI node ID
 * @property {string} [content] - Response content (for streaming)
 * @property {boolean} [aborted] - Whether the operation was aborted
 */

/**
 * Sub-agent registration
 * @typedef {Object} SubAgentRegistration
 * @property {string} command - Slash command (e.g., '/poll')
 * @property {string} agentId - Agent definition ID
 * @property {string} [description] - Human-readable description
 * @property {Function} [handler] - Direct handler function (bypasses RunController)
 * @property {FeaturePlugin} [feature] - Reference to FeaturePlugin (for direct dispatch)
 */

// =============================================================================
// Base Agent Definition
// =============================================================================

/**
 * Create the base agent definition
 * @returns {import('./agent-types.js').AgentDefinition}
 */
function createBaseAgentDefinition() {
    return createAgentDefinition({
        id: 'base-agent',
        name: 'Base Agent',
        engine: 'builtin',
        model: undefined, // Use app-level default model
        systemPrompt: `You are a helpful AI assistant. Respond to user messages clearly and concisely.
When given context, use it to inform your response.
Be direct and helpful.`,
        allowedTools: [
            'create_human_node',
            'create_ai_node',
            'add_edge',
            'build_context',
            'stream_response',
            'spawn_subagent',
        ],
        budgets: {
            maxTokens: 100000,
            maxToolCalls: 50,
            timeoutMs: 300000, // 5 minutes
        },
        hitl: {
            requireApprovalForTools: false,
            requireApprovalForSubagents: false,
            requireApprovalForMutations: false, // Base agent mutations are trusted
            alwaysApproveTools: ['create_human_node', 'create_ai_node', 'add_edge'],
            alwaysBlockTools: [],
        },
        defaultOutputNodeType: 'ai',
        description: 'Primary agent that orchestrates message handling and delegates slash commands to sub-agents.',
    });
}

// =============================================================================
// Base Agent Class
// =============================================================================

/**
 * BaseAgent orchestrates all user message handling.
 *
 * It integrates with:
 * - RunController: For execution tracking and event streaming
 * - Graph: For node/edge creation (via CRDT)
 * - Canvas: For rendering updates
 * - Chat: For LLM streaming
 * - FeatureRegistry: For discovering sub-agents from plugins
 */
class BaseAgent {
    /**
     * @param {Object} options - Agent options
     * @param {*} options.graph - CRDTGraph instance
     * @param {*} options.canvas - Canvas instance
     * @param {*} options.chat - Chat instance for LLM calls
     * @param {*} [options.featureRegistry] - FeatureRegistry for plugin sub-agents
     * @param {*} [options.nodeRegistry] - NodeRegistry for custom node types
     * @param {Function} [options.buildLLMRequest] - Function to build LLM requests
     * @param {Function} [options.getModel] - Function to get current model
     * @param {*} [options.streamingManager] - StreamingManager for abort handling
     */
    constructor(options) {
        logger.enter('BaseAgent.constructor');

        this.graph = options.graph;
        this.canvas = options.canvas;
        this.chat = options.chat;
        this.featureRegistry = options.featureRegistry || null;
        this.nodeRegistry = options.nodeRegistry || null;
        this.buildLLMRequest = options.buildLLMRequest || (() => ({}));
        this.getModel = options.getModel || (() => 'default');
        this.streamingManager = options.streamingManager || null;

        // Initialize RunController
        this.runController = new RunController({
            graph: this.graph,
            canvas: this.canvas,
            chat: this.chat,
        });

        // Register base agent definition
        this.agentDefinition = createBaseAgentDefinition();
        this.runController.registerAgent(this.agentDefinition);

        // Sub-agent registry (command -> agentId)
        /** @type {Map<string, SubAgentRegistration>} */
        this.subAgents = new Map();

        // Event listeners
        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();

        logger.info('BaseAgent initialized');
        logger.exit('BaseAgent.constructor');
    }

    // =========================================================================
    // Sub-Agent Registration
    // =========================================================================

    /**
     * Register a sub-agent for a slash command.
     * @param {string} command - Slash command (e.g., '/poll')
     * @param {import('./agent-types.js').AgentDefinition} agentDef - Agent definition
     * @param {string} [description] - Human-readable description
     * @param {Object} [options] - Additional options
     * @param {Function} [options.handler] - Direct handler (bypasses RunController)
     * @param {Object} [options.feature] - Reference to FeaturePlugin
     */
    registerSubAgent(command, agentDef, description = '', options = {}) {
        logger.enter('BaseAgent.registerSubAgent', { command, agentId: agentDef.id });

        // Only register with RunController if no direct handler
        if (!options.handler) {
            this.runController.registerAgent(agentDef);
        }

        // Map command to agent
        this.subAgents.set(command, {
            command,
            agentId: agentDef.id,
            description: description || agentDef.description || '',
            handler: options.handler || undefined,
            feature: /** @type {FeaturePlugin|undefined} */ (options.feature) || undefined,
        });

        logger.info(`Registered sub-agent for ${command}: ${agentDef.id}${options.handler ? ' (direct handler)' : ''}`);
        logger.exit('BaseAgent.registerSubAgent');
    }

    /**
     * Check if a command has a registered sub-agent.
     * @param {string} command - Slash command
     * @returns {boolean}
     */
    hasSubAgent(command) {
        return this.subAgents.has(command);
    }

    /**
     * Get sub-agent registration for a command.
     * @param {string} command - Slash command
     * @returns {SubAgentRegistration|null}
     */
    getSubAgent(command) {
        return this.subAgents.get(command) || null;
    }

    /**
     * List all registered sub-agents.
     * @returns {SubAgentRegistration[]}
     */
    listSubAgents() {
        return Array.from(this.subAgents.values());
    }

    /**
     * Get all sub-agent slash commands in the format expected by slash-command-menu.
     * This includes config-based agents registered via registerSubAgent().
     * @returns {Array<{command: string, description: string}>}
     */
    getSlashCommands() {
        const commands = [];
        for (const [command, registration] of this.subAgents.entries()) {
            // Skip feature-backed sub-agents (they report their own commands)
            if (registration.feature) {
                continue;
            }
            commands.push({
                command: command,
                description: registration.description || registration.agentDef?.description || '',
            });
        }
        return commands;
    }

    /**
     * Register a feature plugin as a sub-agent.
     * If the feature has an AgentDefinition (via getAgentDefinition()),
     * it will be registered for automatic routing.
     *
     * Features with 'feature' engine type get direct dispatch (via handleCommand).
     * Features with other engine types go through RunController.
     *
     * @param {*} feature - FeaturePlugin instance
     * @returns {boolean} True if registered, false if feature has no AgentDefinition
     */
    registerSubAgentFromFeature(feature) {
        console.log(`[BaseAgent] registerSubAgentFromFeature: ${feature?.constructor?.name}`);
        if (!feature || typeof feature.getAgentDefinition !== 'function') {
            console.log(`[BaseAgent] Feature ${feature?.constructor?.name} has no getAgentDefinition`);
            return false;
        }

        const agentDef = feature.getAgentDefinition();
        if (!agentDef) {
            console.log(`[BaseAgent] Feature ${feature?.constructor?.name} getAgentDefinition returned falsy`);
            return false;
        }
        console.log(`[BaseAgent] AgentDef for ${feature.constructor.name}:`, agentDef.id, 'engine:', agentDef.engine);

        // Get slash commands from feature
        const commands = typeof feature.getSlashCommands === 'function' ? feature.getSlashCommands() : [];

        if (commands.length === 0) {
            logger.warn(`Feature ${feature.constructor.name} has AgentDefinition but no slash commands`);
            console.log(`[BaseAgent] Feature ${feature.constructor.name} has no slash commands`);
            return false;
        }
        console.log(
            `[BaseAgent] Feature ${feature.constructor.name} slash commands:`,
            commands.map((c) => c.command)
        );

        // Determine if this should use direct dispatch or RunController
        const useDirectDispatch = agentDef.engine === 'feature' || agentDef.engine === 'direct';
        console.log(`[BaseAgent] useDirectDispatch: ${useDirectDispatch}`);

        // Create handler wrapper for direct dispatch
        /** @type {Function|undefined} */
        const handler =
            useDirectDispatch && typeof feature.handleCommand === 'function'
                ? async (
                      /** @type {string} */ command,
                      /** @type {string} */ args,
                      /** @type {string|null} */ context,
                      /** @type {string[]} */ selectedNodeIds
                  ) => {
                      return await feature.handleCommand(command, args, { text: context, selectedNodeIds });
                  }
                : undefined;

        // Register agent for each command
        for (const cmdConfig of commands) {
            const command = cmdConfig.command;
            const description = cmdConfig.description || agentDef.description || '';
            this.registerSubAgent(command, agentDef, description, {
                handler,
                feature,
            });
            logger.info(
                `Auto-registered feature ${feature.constructor.name} as sub-agent for ${command}${handler ? ' (direct)' : ''}`
            );
        }

        return true;
    }

    /**
     * Register all features from a FeatureRegistry that have AgentDefinitions.
     * @param {*} registry - FeatureRegistry instance
     * @returns {number} Number of features registered as sub-agents
     */
    registerFeaturesFromRegistry(registry) {
        if (!registry || typeof registry.getAllFeatures !== 'function') {
            return 0;
        }

        let count = 0;
        const features = registry.getAllFeatures();

        for (const feature of features) {
            if (this.registerSubAgentFromFeature(feature)) {
                count++;
            }
        }

        logger.info(`Registered ${count} features as sub-agents`);
        return count;
    }

    // =========================================================================
    // Main Entry Point - invoke()
    // =========================================================================

    /**
     * Invoke the base agent with user input.
     * This is the main entry point called by App.handleSend().
     *
     * @param {BaseAgentInput} input - User input
     * @returns {Promise<BaseAgentResult>}
     */
    async invoke(input) {
        logger.enter('BaseAgent.invoke', {
            messageLength: input.message?.length,
            hasContext: !!input.context,
            selectedNodeIds: input.selectedNodeIds?.length || 0,
        });
        logger.timeStart('baseAgent.invoke');

        const { message, context, selectedNodeIds = [] } = input;

        // Guard: empty message
        if (!message || message.trim() === '') {
            logger.warn('BaseAgent.invoke called with empty message');
            logger.timeEnd('baseAgent.invoke');
            return {
                success: false,
                error: 'Empty message',
            };
        }

        try {
            // Analyze: Is this a slash command?
            if (message.startsWith('/')) {
                const result = await this._handleSlashCommand(message, context || null, selectedNodeIds);
                logger.timeEnd('baseAgent.invoke');
                logger.exit('BaseAgent.invoke', { success: result.success, wasSlashCommand: true });
                return { ...result, wasSlashCommand: true, type: 'slash-command' };
            }

            // Regular message: Base agent handles directly
            const result = await this._handleRegularMessage(message, context || null, selectedNodeIds);
            logger.timeEnd('baseAgent.invoke');
            logger.exit('BaseAgent.invoke', { success: result.success, wasSlashCommand: false });
            return { ...result, wasSlashCommand: false, type: 'chat' };
        } catch (error) {
            logger.timeEnd('baseAgent.invoke');
            logger.error('BaseAgent.invoke failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.exit('BaseAgent.invoke', { success: false, error: errorMessage });
            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    // =========================================================================
    // Slash Command Handling
    // =========================================================================

    /**
     * Handle a slash command by delegating to a sub-agent.
     * @private
     * @param {string} message - The full message including slash command
     * @param {string|null} context - Additional context
     * @param {string[]} selectedNodeIds - Selected node IDs
     * @returns {Promise<BaseAgentResult>}
     */
    async _handleSlashCommand(message, context, selectedNodeIds) {
        logger.enter('BaseAgent._handleSlashCommand', { message });
        console.log('[BaseAgent] _handleSlashCommand called:', message);

        const parts = message.split(' ');
        const command = parts[0]; // e.g., '/poll'
        const args = parts.slice(1).join(' '); // Everything after command

        // Check if we have a registered sub-agent
        const subAgentReg = this.getSubAgent(command);
        console.log(
            '[BaseAgent] Sub-agent lookup for',
            command,
            ':',
            subAgentReg ? `found (${subAgentReg.agentId}, hasHandler: ${!!subAgentReg.handler})` : 'NOT FOUND'
        );
        console.log('[BaseAgent] Registered sub-agents:', Array.from(this.subAgents.keys()));

        if (subAgentReg) {
            // Check for direct handler (bypasses RunController)
            if (subAgentReg.handler) {
                logger.info(`Delegating ${command} to direct handler: ${subAgentReg.agentId}`);
                console.log(`[BaseAgent] Calling direct handler for ${command}`);
                try {
                    await subAgentReg.handler(command, args, context, selectedNodeIds);
                    console.log(`[BaseAgent] Direct handler completed for ${command}`);
                    logger.exit('BaseAgent._handleSlashCommand', { success: true, direct: true });
                    return {
                        success: true,
                        wasSlashCommand: true,
                        subAgentId: subAgentReg.agentId,
                    };
                } catch (error) {
                    logger.error(`Direct handler for ${command} failed:`, error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    return {
                        success: false,
                        error: errorMessage,
                        subAgentId: subAgentReg.agentId,
                    };
                }
            }

            // Use RunController for full agent execution
            logger.info(`Delegating ${command} to sub-agent via RunController: ${subAgentReg.agentId}`);
            return await this._spawnSubAgent(subAgentReg.agentId, {
                command,
                args,
                context,
                selectedNodeIds,
            });
        }

        // Fallback: Check FeatureRegistry (legacy plugin routing)
        if (this.featureRegistry) {
            logger.debug(`No sub-agent for ${command}, trying FeatureRegistry...`);
            const handled = await /** @type {any} */ (this.featureRegistry).handleSlashCommand(command, args, {
                text: context,
            });
            if (handled) {
                logger.info(`Command ${command} handled by FeatureRegistry`);
                return {
                    success: true,
                    wasSlashCommand: true,
                };
            }
        }

        // Fallback: Check NodeRegistry (custom node types)
        if (/** @type {any} */ (this.nodeRegistry)?.hasSlashCommand?.(command)) {
            logger.debug(`No sub-agent for ${command}, trying NodeRegistry...`);
            const cmdConfig = /** @type {any} */ (this.nodeRegistry).getSlashCommand(command);
            if (cmdConfig?.handler) {
                // Note: NodeRegistry handlers expect (app, args, context) but we don't have app here
                // This fallback is for compatibility - agents should be preferred
                logger.warn(`NodeRegistry handler for ${command} - may need app context`);
                return {
                    success: false,
                    error: `Command ${command} requires legacy app context`,
                };
            }
        }

        // Command not found
        logger.warn(`Unknown slash command: ${command}`);
        logger.exit('BaseAgent._handleSlashCommand', { success: false });
        return {
            success: false,
            error: `Unknown command: ${command}`,
        };
    }

    /**
     * Spawn a sub-agent for execution.
     * @private
     * @param {string} agentId - Agent ID to spawn
     * @param {Object} params - Spawn parameters
     * @param {string} params.command - Slash command
     * @param {string} params.args - Command arguments
     * @param {string|null} params.context - Additional context
     * @param {string[]} params.selectedNodeIds - Selected node IDs
     * @returns {Promise<BaseAgentResult>}
     */
    async _spawnSubAgent(agentId, params) {
        logger.enter('BaseAgent._spawnSubAgent', { agentId, command: params.command });

        const runContext = createRunContext({
            sourceNodeIds: params.selectedNodeIds || [],
            userQuery: params.args,
            slashCommand: params.command,
        });

        const runRequest = createRunRequest(agentId, runContext, {
            context: params.context,
        });

        // Stream events from sub-agent run
        const artifactNodeIds = [];
        /** @type {string|undefined} */
        let runId;

        try {
            for await (const event of this.runController.startRun(runRequest)) {
                runId = event.runId;

                // Emit events to listeners
                this._emitEvent(event);

                // Collect artifact IDs
                if (event.type === EventType.ARTIFACT_CREATED && /** @type {any} */ (event.data)?.nodeId) {
                    artifactNodeIds.push(/** @type {any} */ (event.data).nodeId);
                }
            }

            logger.info(`Sub-agent ${agentId} completed, created ${artifactNodeIds.length} artifacts`);
            logger.exit('BaseAgent._spawnSubAgent', { success: true });
            return {
                success: true,
                runId,
                artifactNodeIds,
                subAgentId: agentId,
            };
        } catch (error) {
            logger.error(`Sub-agent ${agentId} failed:`, error);
            logger.exit('BaseAgent._spawnSubAgent', { success: false });
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                runId,
                error: errorMessage,
                subAgentId: agentId,
            };
        }
    }

    // =========================================================================
    // Regular Message Handling
    // =========================================================================

    /**
     * Handle a regular message (not a slash command).
     * Creates human node, AI node, and streams LLM response.
     * @private
     * @param {string} message - User's message
     * @param {string|null} context - Additional context
     * @param {string[]} selectedNodeIds - Selected node IDs
     * @returns {Promise<BaseAgentResult>}
     */
    async _handleRegularMessage(message, context, selectedNodeIds) {
        logger.enter('BaseAgent._handleRegularMessage', {
            messageLength: message.length,
            selectedNodeIds: selectedNodeIds.length,
        });

        // Import graph-types dynamically to avoid circular deps
        const { createNode, createEdge, NodeType, EdgeType } = await import('../graph-types.js');
        const { buildMessagesForApi } = await import('../utils.js');

        // Step 1: Create human node
        logger.debug('Creating human node...');
        const humanNode = createNode(NodeType.HUMAN, message, {
            position: /** @type {any} */ (this.graph).autoPosition(selectedNodeIds.length > 0 ? selectedNodeIds : []),
        });

        /** @type {any} */ (this.graph).addNode(humanNode);
        logger.info(`Created human node: ${humanNode.id}`);

        // Step 2: Create edges from selected nodes (parents)
        if (selectedNodeIds.length > 0) {
            logger.debug(`Creating ${selectedNodeIds.length} edges from parent nodes...`);
            for (const parentId of selectedNodeIds) {
                const edgeType = selectedNodeIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY;
                const edge = createEdge(parentId, humanNode.id, edgeType);
                /** @type {any} */ (this.graph).addEdge(edge);
            }
        }

        // Step 3: Create AI response node (empty initially)
        const model = this.getModel();
        logger.debug(`Creating AI node with model: ${model}`);
        const aiNode = createNode(NodeType.AI, '', {
            position: /** @type {any} */ (this.graph).autoPosition([humanNode.id]),
            model: model.split('/').pop(),
        });

        /** @type {any} */ (this.graph).addNode(aiNode);
        const aiEdge = createEdge(humanNode.id, aiNode.id, EdgeType.REPLY);
        /** @type {any} */ (this.graph).addEdge(aiEdge);
        logger.info(`Created AI node: ${aiNode.id}`);

        // Step 4: Build context and messages
        logger.debug('Building LLM context...');
        const graphContext = /** @type {any} */ (this.graph).resolveContext([humanNode.id]);
        const messages = buildMessagesForApi(graphContext);
        logger.debug(`Built ${messages.length} messages for LLM`);

        // Step 5: Stream LLM response
        const result = await this._streamLLMResponse(aiNode.id, messages, model);

        logger.exit('BaseAgent._handleRegularMessage', { success: result.success });
        return {
            success: result.success,
            humanNodeId: humanNode.id,
            aiNodeId: aiNode.id,
            artifactNodeIds: [humanNode.id, aiNode.id],
            error: result.error,
        };
    }

    /**
     * Stream LLM response and update AI node.
     * @private
     * @param {string} aiNodeId - The AI node ID to update
     * @param {Array<{role: string, content: string}>} messages - Messages for the LLM
     * @param {string} model - The model to use
     * @returns {Promise<{success: boolean, error?: string, content?: string, aborted?: boolean}>}
     */
    async _streamLLMResponse(aiNodeId, messages, model) {
        logger.enter('BaseAgent._streamLLMResponse', { aiNodeId, messageCount: messages.length });

        const abortController = new AbortController();

        // Register with streaming manager if available
        if (this.streamingManager) {
            /** @type {any} */ (this.streamingManager).register(aiNodeId, {
                abortController,
                featureId: 'base-agent',
                context: { messages, model },
                onContinue: async (/** @type {string} */ nodeId, /** @type {any} */ state) => {
                    // Resume streaming from where we left off
                    await this._streamLLMResponse(nodeId, state.context.messages, state.context.model);
                },
            });
        }

        try {
            // Build request
            const request = this.buildLLMRequest({ messages });

            // Fetch streaming response
            const response = await fetch(apiUrl('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `API error: ${response.status}`);
            }

            // Read streaming response using SSE
            let fullContent = '';

            await readSSEStream(response, {
                onEvent: (/** @type {string} */ eventType, /** @type {string} */ data) => {
                    if (eventType === 'message' && data) {
                        fullContent += data;

                        // Update AI node content (streaming)
                        this.canvas.updateNodeContent(aiNodeId, fullContent, true);
                        /** @type {any} */ (this.graph).updateNode(aiNodeId, { content: fullContent });

                        // Emit token delta event
                        this._emitEvent(
                            createEvent(EventType.TOKEN_DELTA, 'base-agent', {
                                content: data,
                                nodeId: aiNodeId,
                            })
                        );
                    }
                },
                onDone: () => {
                    // Normalize and finalize
                    fullContent = normalizeText(fullContent);
                },
                onError: (/** @type {Error} */ err) => {
                    throw err;
                },
            });

            // Finalize node
            this.canvas.updateNodeContent(aiNodeId, fullContent, false);
            /** @type {any} */ (this.graph).updateNode(aiNodeId, { content: fullContent });

            // Unregister from streaming manager
            if (this.streamingManager) {
                /** @type {any} */ (this.streamingManager).unregister(aiNodeId);
            }

            // Generate summary (if available)
            if (this._generateSummary) {
                await this._generateSummary(aiNodeId);
            }

            logger.info(`LLM streaming complete for ${aiNodeId}, ${fullContent.length} chars`);
            logger.exit('BaseAgent._streamLLMResponse', { success: true });
            return { success: true, content: fullContent };
        } catch (error) {
            // Unregister from streaming manager
            if (this.streamingManager) {
                /** @type {any} */ (this.streamingManager).unregister(aiNodeId);
            }

            const err = /** @type {Error} */ (error);
            if (err.name === 'AbortError') {
                logger.warn(`LLM stream aborted for ${aiNodeId}`);
                return { success: true, aborted: true };
            }

            logger.error(`LLM streaming failed for ${aiNodeId}:`, error);
            logger.exit('BaseAgent._streamLLMResponse', { success: false });
            return { success: false, error: err.message };
        }
    }

    // =========================================================================
    // Event Handling
    // =========================================================================

    /**
     * Subscribe to agent events.
     * @param {string} eventType - Event type or '*' for all
     * @param {Function} handler - Event handler
     */
    on(eventType, handler) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        const handlers = this.listeners.get(eventType);
        if (handlers) {
            handlers.add(handler);
        }
    }

    /**
     * Unsubscribe from agent events.
     * @param {string} eventType
     * @param {Function} handler
     */
    off(eventType, handler) {
        const handlers = this.listeners.get(eventType);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Emit an event to listeners.
     * @private
     * @param {*} event - Event to emit
     */
    _emitEvent(event) {
        // Specific type listeners
        const typeHandlers = this.listeners.get(event.type);
        if (typeHandlers) {
            for (const handler of typeHandlers) {
                try {
                    handler(event);
                } catch (e) {
                    logger.error(`Event handler error for ${event.type}:`, e);
                }
            }
        }

        // Wildcard listeners
        const wildcardHandlers = this.listeners.get('*');
        if (wildcardHandlers) {
            for (const handler of wildcardHandlers) {
                try {
                    handler(event);
                } catch (e) {
                    logger.error(`Wildcard event handler error:`, e);
                }
            }
        }
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    /**
     * Set the summary generation function.
     * @param {Function} fn - Function to generate node summaries
     */
    setSummaryGenerator(fn) {
        this._generateSummary = fn;
    }

    /**
     * Get the RunController for advanced usage.
     * @returns {RunController}
     */
    getRunController() {
        return this.runController;
    }
}

// =============================================================================
// Exports
// =============================================================================

export { BaseAgent, createBaseAgentDefinition };
