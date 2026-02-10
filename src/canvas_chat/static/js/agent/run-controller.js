/**
 * Run Controller
 *
 * The Run Controller orchestrates agent execution:
 * - Creates and manages agent runs
 * - Streams events to the UI
 * - Persists execution traces
 * - Enforces budgets, depth limits, and HITL policies
 * - Materializes artifacts into DAG nodes
 * - Coordinates memory retention
 */

import { EventType, RunStatusType, createAgentRun, createEvent, createRunContext } from './agent-types.js';
import { EngineRegistry } from './engine-adapter.js';
import { MemoryStoreRegistry, MemoryTypeEnum } from './memory-store.js';
import { controllerLogger as logger, eventLogger } from './debug-logger.js';
import { createWorkingNodeManager } from './working-node-manager.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Guardrails configuration
 * @typedef {Object} GuardrailsConfig
 * @property {number} maxSubagentDepth - Maximum sub-agent nesting depth (default: 1)
 * @property {number} maxSubagentSpawnsPerRun - Maximum sub-agents per run
 * @property {boolean} inheritBudgets - Whether sub-agents inherit parent budgets
 * @property {number} debounceTriggerMs - Debounce for node-triggered runs
 */

/**
 * Run Controller configuration
 * @typedef {Object} RunControllerConfig
 * @property {GuardrailsConfig} guardrails - Safety guardrails
 * @property {Object<string, import('./agent-types.js').AgentDefinition>} agents - Registered agent definitions
 */

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default guardrails configuration
 * @type {GuardrailsConfig}
 */
const DEFAULT_GUARDRAILS = {
    maxSubagentDepth: 1,
    maxSubagentSpawnsPerRun: 5,
    inheritBudgets: true,
    debounceTriggerMs: 500,
};

// =============================================================================
// Run Controller
// =============================================================================

/**
 * Run Controller orchestrates agent execution.
 */
class RunController {
    /**
     * @param {Object} options - Controller options
     * @param {Object} options.graph - Graph instance for node operations
     * @param {Object} options.canvas - Canvas instance for rendering
     * @param {Object} options.chat - Chat instance for LLM calls
     * @param {GuardrailsConfig} [options.guardrails] - Guardrails config
     */
    constructor(options) {
        logger.enter('RunController.constructor', {
            hasGraph: !!options.graph,
            hasCanvas: !!options.canvas,
            hasChat: !!options.chat,
        });

        this.graph = options.graph;
        this.canvas = options.canvas;
        this.chat = options.chat;
        this.guardrails = { ...DEFAULT_GUARDRAILS, ...options.guardrails };

        /** @type {Map<string, import('./agent-types.js').AgentDefinition>} */
        this.agents = new Map();

        /** @type {Map<string, import('./agent-types.js').AgentRun>} */
        this.activeRuns = new Map();

        /** @type {Map<string, {resolve: Function, reject: Function}>} */
        this.pendingApprovals = new Map();

        // Registries
        logger.debug('Initializing registries...');
        this.engineRegistry = new EngineRegistry();
        this.memoryRegistry = new MemoryStoreRegistry();
        this.workingNodeManager = null;

        // Event listeners
        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();

        logger.info('RunController initialized');
        logger.table('Guardrails configuration', this.guardrails);
        logger.exit('RunController.constructor');
    }

    // =========================================================================
    // Agent Registration
    // =========================================================================

    /**
     * Register an agent definition.
     * @param {import('./agent-types.js').AgentDefinition} agentDef
     */
    registerAgent(agentDef) {
        logger.enter('RunController.registerAgent', { agentId: agentDef.id, name: agentDef.name });

        if (this.agents.has(agentDef.id)) {
            logger.warn(`Overwriting existing agent: ${agentDef.id}`);
        }

        this.agents.set(agentDef.id, agentDef);

        logger.info(`Registered agent: ${agentDef.id}`);
        logger.table('Agent definition', {
            id: agentDef.id,
            name: agentDef.name,
            engine: agentDef.engine,
            model: agentDef.model,
            allowedTools: agentDef.allowedTools?.length || 0,
            subagents: Object.keys(agentDef.subagents || {}).length,
        });
        logger.exit('RunController.registerAgent');
    }

    /**
     * Get an agent definition by ID.
     * @param {string} agentId
     * @returns {import('./agent-types.js').AgentDefinition|null}
     */
    getAgent(agentId) {
        const agent = this.agents.get(agentId) || null;
        if (agent) {
            logger.trace(`Retrieved agent: ${agentId}`);
        } else {
            logger.warn(`Agent not found: ${agentId}`);
        }
        return agent;
    }

    /**
     * List all registered agent IDs.
     * @returns {string[]}
     */
    listAgents() {
        const ids = Array.from(this.agents.keys());
        logger.trace(`Listing agents: ${ids.join(', ') || '(none)'}`);
        return ids;
    }

    // =========================================================================
    // Run Execution
    // =========================================================================

    /**
     * Start an agent run.
     *
     * @param {import('./agent-types.js').RunRequest} runRequest - Run request
     * @param {Object} [options] - Additional options
     * @param {number} [options.depth=0] - Current sub-agent depth
     * @param {string} [options.parentRunId] - Parent run ID for sub-agents
     * @returns {AsyncGenerator<import('./agent-types.js').AgentEvent>} Event stream
     */
    async *startRun(runRequest, options = {}) {
        const { depth = 0, parentRunId = null } = options;

        logger.enter('RunController.startRun', {
            agentId: runRequest.agentId,
            depth,
            parentRunId,
            sourceNodeIds: runRequest.context?.sourceNodeIds,
        });
        logger.timeStart('startRun');

        // Get agent definition
        const agentDef = this.getAgent(runRequest.agentId);
        if (!agentDef) {
            logger.error(`Agent not found: ${runRequest.agentId}`);
            yield createEvent(EventType.RUN_FAILED, 'unknown', {
                error: `Agent not found: ${runRequest.agentId}`,
            });
            logger.exit('RunController.startRun', { success: false, reason: 'agent_not_found' });
            return;
        }
        logger.debug(`Agent definition loaded: ${agentDef.name}`);

        // Check depth limit
        if (depth > this.guardrails.maxSubagentDepth) {
            logger.error(`Sub-agent depth limit exceeded: ${depth} > ${this.guardrails.maxSubagentDepth}`);
            yield createEvent(EventType.RUN_FAILED, 'unknown', {
                error: `Sub-agent depth limit exceeded (max: ${this.guardrails.maxSubagentDepth})`,
            });
            logger.exit('RunController.startRun', { success: false, reason: 'depth_exceeded' });
            return;
        }
        logger.trace(`Depth check passed: ${depth} <= ${this.guardrails.maxSubagentDepth}`);

        // Get engine
        const engine = this.engineRegistry.get(agentDef.engine);
        if (!engine) {
            logger.error(`Engine not found: ${agentDef.engine}`);
            yield createEvent(EventType.RUN_FAILED, 'unknown', {
                error: `Engine not found: ${agentDef.engine}`,
            });
            logger.exit('RunController.startRun', { success: false, reason: 'engine_not_found' });
            return;
        }
        logger.debug(`Engine loaded: ${agentDef.engine}`);

        // Create run state
        const runId = crypto.randomUUID();
        logger.info(`Creating new run: ${runId}`);
        const run = createAgentRun(runId, agentDef.id, runRequest.context);
        if (parentRunId) {
            run.context.parentRunId = parentRunId;
            logger.debug(`Set parent run: ${parentRunId}`);
        }
        this.activeRuns.set(runId, run);
        logger.stateChange('activeRuns', this.activeRuns.size - 1, this.activeRuns.size);

        // Build host context
        logger.debug('Building host context...');
        const hostContext = this._buildHostContext(runId, agentDef, depth);
        logger.trace('Host context built successfully');

        const inferredOutputMode =
            agentDef.outputMode || (agentDef.defaultOutputNodeType === 'reflection' ? 'single_node' : 'run_artifact');
        const outputMode = this._normalizeOutputMode(inferredOutputMode);
        const useSingleNode = outputMode === 'single_node';

        let runNodeId = null;
        let outputNodeId = null;

        if (useSingleNode) {
            logger.debug('Creating single-node output in graph...');
            outputNodeId = await this._createWorkingOutputNode(run, agentDef, runRequest.context);
            logger.info(`Working output node created: ${outputNodeId}`);
        } else {
            logger.debug('Creating run node in graph...');
            runNodeId = await this._createRunNode(run, agentDef, runRequest.context);
            logger.info(`Run node created: ${runNodeId}`);
        }

        try {
            // Execute via engine
            const startTime = Date.now();
            logger.info(`Starting engine execution for run ${runId}...`);

            let eventCount = 0;
            for await (const event of engine.run(runRequest, hostContext, agentDef)) {
                eventCount++;
                eventLogger.event(event.type, event.runId, event.data);

                // Update run state based on event
                this._processEvent(run, event);

                // Handle special events
                if (event.type === EventType.ARTIFACT_CREATED) {
                    if (useSingleNode && outputNodeId) {
                        const workingNodeManager = this._getWorkingNodeManager();
                        const outputDisplay =
                            event.data.outputDisplay ||
                            agentDef.outputDisplay ||
                            ({
                                typeLabel: agentDef.name || 'Output',
                            });
                        const metadata = { display: outputDisplay };
                        const nodeType = event.data.nodeType || agentDef.defaultOutputNodeType || 'ai';

                        workingNodeManager.finalizeNode(outputNodeId, {
                            content: event.data.content || '',
                            title: this._buildFinalTitle(agentDef),
                            type: nodeType,
                            metadata,
                        });

                        event.data.nodeId = outputNodeId;
                        if (!run.artifactNodeIds.includes(outputNodeId)) {
                            run.artifactNodeIds.push(outputNodeId);
                        }

                        if (agentDef.postCreate) {
                            await this._executePostCreateHooks(outputNodeId, run, agentDef.postCreate);
                        }

                        logger.info(`Single-node output finalized: ${outputNodeId}`);
                    } else {
                        // Materialize artifact into DAG
                        logger.info(`Creating artifact node for run ${runId}...`);
                        const artifactNodeId = await this._createArtifactNode(runNodeId, run, event.data, agentDef);
                        event.data.nodeId = artifactNodeId;
                        run.artifactNodeIds.push(artifactNodeId);
                        logger.info(`Artifact node created: ${artifactNodeId}`);
                    }
                }

                if (useSingleNode && outputNodeId) {
                    const workingNodeManager = this._getWorkingNodeManager();
                    if (event.type === EventType.TOKEN_DELTA && event.data?.content) {
                        const node = this.graph.getNode(outputNodeId);
                        if (node?.metadata?.status !== 'streaming') {
                            workingNodeManager.updateProgress(outputNodeId, {
                                status: 'streaming',
                                message: 'Streaming response...',
                            });
                        }
                        workingNodeManager.streamContent(outputNodeId, event.data.content);
                    } else if (event.type === EventType.PROGRESS_UPDATE) {
                        workingNodeManager.updateProgress(outputNodeId, {
                            message: event.data?.message,
                            progress: event.data?.percent,
                            status: 'working',
                        });
                    } else if (event.type === EventType.TOOL_CALL_REQUESTED) {
                        workingNodeManager.updateProgress(outputNodeId, {
                            toolCall: event.data?.toolId,
                            status: 'tool_call',
                        });
                    } else if (event.type === EventType.TOOL_CALL_COMPLETED) {
                        workingNodeManager.updateProgress(outputNodeId, {
                            message: `Completed: ${event.data?.toolId}`,
                            status: 'working',
                        });
                    } else if (event.type === EventType.RUN_STATUS) {
                        const statusMessage = event.data?.message || `Status: ${event.data?.status || run.status}`;
                        workingNodeManager.updateProgress(outputNodeId, {
                            message: statusMessage,
                            status: event.data?.status === RunStatusType.PAUSED ? 'waiting' : 'working',
                        });
                    }
                }

                if (event.type === EventType.APPROVAL_REQUESTED) {
                    // Pause for HITL approval
                    logger.warn(`HITL approval requested for ${event.data.actionType}`);
                    yield event;
                    logger.debug('Waiting for approval...');
                    const approved = await this._waitForApproval(runId, event.data);
                    logger.info(`Approval ${approved ? 'granted' : 'denied'} for ${event.data.actionType}`);
                    yield createEvent(EventType.APPROVAL_RESOLVED, runId, {
                        actionType: event.data.actionType,
                        approved,
                    });
                    if (!approved) {
                        // Cancel run if approval denied
                        logger.warn('Run cancelled due to denied approval');
                        run.status = RunStatusType.CANCELLED;
                        break;
                    }
                }

                // Emit event to listeners
                this._emitEvent(event);

                // Yield event to caller
                yield event;

                // Update run node display
                if (runNodeId) {
                    await this._updateRunNode(runNodeId, run);
                }
            }
            logger.debug(`Processed ${eventCount} events for run ${runId}`);

            if (
                useSingleNode &&
                outputNodeId &&
                run.status !== RunStatusType.COMPLETED &&
                !run.artifactNodeIds.includes(outputNodeId)
            ) {
                const workingNodeManager = this._getWorkingNodeManager();
                const statusMessage =
                    run.status === RunStatusType.CANCELLED ? 'Run cancelled' : `Run ${run.status}`;
                workingNodeManager.setError(outputNodeId, statusMessage);
            }

            // Calculate final metrics
            run.metrics.durationMs = Date.now() - startTime;
            run.completedAt = Date.now();
            logger.timeEnd('startRun');

            logger.table('Run metrics', run.metrics);

            // Attach execution trace to artifacts before retention
            this._attachExecutionTraceToArtifacts(run);

            // Retain memories from run
            logger.debug('Retaining run memories...');
            await this._retainRunMemories(run);

            // Final run node update
            // Attach execution trace to artifacts even on failure
            this._attachExecutionTraceToArtifacts(run);

            if (runNodeId) {
                await this._updateRunNode(runNodeId, run);
            }

            logger.info(`Run ${runId} completed with status: ${run.status}`);
            logger.exit('RunController.startRun', { success: true, runId, status: run.status });
        } catch (error) {
            logger.error(`Run ${runId} failed: ${error.message}`);
            logger.trace('Error stack:', error.stack);

            run.status = RunStatusType.FAILED;
            run.error = error.message || 'Unknown error';
            run.completedAt = Date.now();

            yield createEvent(EventType.RUN_FAILED, runId, {
                error: run.error,
            });

            if (useSingleNode && outputNodeId) {
                const workingNodeManager = this._getWorkingNodeManager();
                workingNodeManager.setError(outputNodeId, run.error);
            }

            if (runNodeId) {
                await this._updateRunNode(runNodeId, run);
            }
            logger.exit('RunController.startRun', { success: false, runId, error: run.error });
        } finally {
            this.activeRuns.delete(runId);
            logger.stateChange('activeRuns', this.activeRuns.size + 1, this.activeRuns.size);
        }
    }

    /**
     * Cancel a running execution.
     * @param {string} runId
     * @returns {Promise<boolean>}
     */
    async cancelRun(runId) {
        logger.enter('RunController.cancelRun', { runId });

        const run = this.activeRuns.get(runId);
        if (!run) {
            logger.warn(`Cannot cancel - run not found: ${runId}`);
            logger.exit('RunController.cancelRun', { success: false, reason: 'run_not_found' });
            return false;
        }

        const agentDef = this.getAgent(run.agentId);
        if (!agentDef) {
            logger.warn(`Cannot cancel - agent not found: ${run.agentId}`);
            logger.exit('RunController.cancelRun', { success: false, reason: 'agent_not_found' });
            return false;
        }

        const engine = this.engineRegistry.get(agentDef.engine);
        if (!engine) {
            logger.warn(`Cannot cancel - engine not found: ${agentDef.engine}`);
            logger.exit('RunController.cancelRun', { success: false, reason: 'engine_not_found' });
            return false;
        }

        logger.debug(`Sending cancel request to engine for run ${runId}...`);
        const cancelled = await engine.cancel(runId);
        if (cancelled) {
            logger.info(`Run ${runId} cancelled successfully`);
            run.status = RunStatusType.CANCELLED;
            run.completedAt = Date.now();
        } else {
            logger.warn(`Engine did not cancel run ${runId}`);
        }

        logger.exit('RunController.cancelRun', { success: cancelled });
        return cancelled;
    }

    /**
     * Resolve a pending approval.
     * @param {string} runId
     * @param {boolean} approved
     */
    resolveApproval(runId, approved) {
        logger.enter('RunController.resolveApproval', { runId, approved });

        const pending = this.pendingApprovals.get(runId);
        if (pending) {
            logger.info(`Resolving approval for run ${runId}: ${approved ? 'APPROVED' : 'DENIED'}`);
            pending.resolve(approved);
            this.pendingApprovals.delete(runId);
        } else {
            logger.warn(`No pending approval found for run ${runId}`);
        }

        logger.exit('RunController.resolveApproval');
    }

    // =========================================================================
    // Event Handling
    // =========================================================================

    /**
     * Subscribe to events.
     * @param {string} eventType - Event type or '*' for all
     * @param {Function} handler - Event handler
     */
    on(eventType, handler) {
        logger.trace(`Adding event listener for: ${eventType}`);
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(handler);
        logger.debug(`Event listeners for ${eventType}: ${this.listeners.get(eventType).size}`);
    }

    /**
     * Unsubscribe from events.
     * @param {string} eventType
     * @param {Function} handler
     */
    off(eventType, handler) {
        logger.trace(`Removing event listener for: ${eventType}`);
        const handlers = this.listeners.get(eventType);
        if (handlers) {
            handlers.delete(handler);
            logger.debug(`Event listeners for ${eventType}: ${handlers.size}`);
        }
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /**
     * Build host context for engine execution.
     * @param runId
     * @param agentDef
     * @param depth
     * @private
     */
    _buildHostContext(runId, agentDef, depth) {
        logger.enter('RunController._buildHostContext', { runId, agentId: agentDef.id, depth });
        const self = this;

        const context = {
            graph: self.graph,
            chat: self.chat,
            // LLM interface
            llm: {
                stream: (options) => {
                    return self.chat.streamCompletion(options);
                },
            },

            // Tools interface (placeholder - MCP integration)
            tools: {
                invoke: async (toolId, args) => {
                    // Check permission
                    if (!agentDef.allowedTools.includes(toolId)) {
                        throw new Error(`Tool not allowed: ${toolId}`);
                    }
                    // TODO: Implement MCP tool invocation
                    console.warn('[RunController] Tool invocation not yet implemented:', toolId);
                    return null;
                },
                list: () => agentDef.allowedTools,
            },

            // Sub-agent spawning
            subagent: {
                spawn: async function* (childAgentId, context) {
                    // Check depth limit
                    if (depth >= self.guardrails.maxSubagentDepth) {
                        throw new Error('Sub-agent depth limit exceeded');
                    }

                    // Get child agent definition
                    let childDef = agentDef.subagents?.[childAgentId];
                    if (!childDef) {
                        childDef = self.getAgent(childAgentId);
                    }
                    if (!childDef) {
                        throw new Error(`Sub-agent not found: ${childAgentId}`);
                    }

                    const childRequest = {
                        agentId: childDef.id,
                        context: createRunContext({
                            ...context,
                            parentRunId: runId,
                        }),
                    };

                    // Run child agent
                    yield* self.startRun(childRequest, {
                        depth: depth + 1,
                        parentRunId: runId,
                    });
                },
            },

            // Event emission
            emit: (event) => {
                self._emitEvent(event);
            },

            // Budgets
            budgets: agentDef.budgets,

            // Memory access (read-only)
            memory: {
                recall: async (options) => {
                    logger.trace('Host context memory.recall called', options);
                    const store = self.memoryRegistry.get();
                    if (!store) {
                        logger.warn('No memory store available for recall');
                        return [];
                    }
                    return store.recall({
                        bankId: 'default',
                        ...options,
                    });
                },
            },
        };

        logger.exit('RunController._buildHostContext');
        return context;
    }

    /**
     * Process an event and update run state.
     * @param run
     * @param event
     * @private
     */
    _processEvent(run, event) {
        logger.trace(`Processing event: ${event.type}`, { runId: run.id });

        switch (event.type) {
            case EventType.RUN_STARTED:
                logger.stateChange('run.status', run.status, RunStatusType.RUNNING);
                run.status = RunStatusType.RUNNING;
                break;

            case EventType.RUN_STATUS:
                run.status = event.data.status;
                break;

            case EventType.RUN_COMPLETED:
                run.status = RunStatusType.COMPLETED;
                if (event.data.metrics) {
                    Object.assign(run.metrics, event.data.metrics);
                }
                break;

            case EventType.RUN_FAILED:
                run.status = RunStatusType.FAILED;
                run.error = event.data.error;
                break;

            case EventType.TOKEN_DELTA:
                run.metrics.tokensUsed += event.data.content?.length || 0;
                break;

            case EventType.TOOL_CALL_COMPLETED:
                run.metrics.toolCallsCount++;
                break;

            case EventType.SUBAGENT_SPAWN_COMPLETED:
                run.metrics.subagentSpawns++;
                break;

            case EventType.PLAN_CREATED:
            case EventType.PLAN_UPDATED:
                logger.debug(
                    `Plan ${event.type === EventType.PLAN_CREATED ? 'created' : 'updated'}: ${event.data.plan?.summary || 'no summary'}`
                );
                run.plan = event.data.plan;
                break;

            case EventType.PROGRESS_UPDATE:
                if (event.data?.message) {
                    run.lastProgress = event.data.message;
                }
                break;
        }

        // Always record the event
        run.events.push(event);
        logger.trace(`Event recorded. Total events for run: ${run.events.length}`);
    }

    /**
     * Emit event to listeners.
     * @param event
     * @private
     */
    _emitEvent(event) {
        // Specific type listeners
        const typeHandlers = this.listeners.get(event.type);
        const typeCount = typeHandlers?.size || 0;
        const wildcardHandlers = this.listeners.get('*');
        const wildcardCount = wildcardHandlers?.size || 0;

        logger.trace(`Emitting event ${event.type} to ${typeCount} type + ${wildcardCount} wildcard listeners`);

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
        if (wildcardHandlers) {
            for (const handler of wildcardHandlers) {
                try {
                    handler(event);
                } catch (e) {
                    logger.error(`Wildcard event handler error for ${event.type}:`, e);
                }
            }
        }
    }

    /**
     * Wait for HITL approval.
     * @param runId
     * @param action
     * @private
     */
    async _waitForApproval(runId, action) {
        logger.enter('RunController._waitForApproval', { runId, actionType: action?.actionType });

        return new Promise((resolve) => {
            this.pendingApprovals.set(runId, { resolve });
            logger.info(`Approval pending for run ${runId}. Timeout in 5 minutes.`);

            // Auto-approve after timeout (configurable)
            setTimeout(
                () => {
                    if (this.pendingApprovals.has(runId)) {
                        logger.warn(`Approval timeout for run ${runId} - auto-denying`);
                        this.pendingApprovals.delete(runId);
                        resolve(false); // Default to denied
                    }
                },
                5 * 60 * 1000
            ); // 5 minute timeout
        });
    }

    /**
     * Get or create a working node manager instance.
     * @private
     * @returns {import('./working-node-manager.js').WorkingNodeManager}
     */
    _getWorkingNodeManager() {
        if (!this.workingNodeManager) {
            this.workingNodeManager = createWorkingNodeManager(this.graph, this.canvas);
        }
        return this.workingNodeManager;
    }

    /**
     * Normalize output mode to a supported value.
     * @private
     * @param {string | null | undefined} outputMode
     * @returns {'run_artifact'|'single_node'}
     */
    _normalizeOutputMode(outputMode) {
        const mode = (outputMode || '').toString().toLowerCase();
        if (mode === 'single' || mode === 'single_node' || mode === 'working_node') {
            return 'single_node';
        }
        return 'run_artifact';
    }

    /**
     * Build a working title for output nodes.
     * @private
     * @param {import('./agent-types.js').AgentDefinition} agentDef
     * @returns {string}
     */
    _buildWorkingTitle(agentDef) {
        const label = agentDef.outputDisplay?.typeLabel || agentDef.name || 'Output';
        const icon = agentDef.outputDisplay?.typeIcon || '⏳';
        return `${icon} ${label}...`;
    }

    /**
     * Build a final title for output nodes.
     * @private
     * @param {import('./agent-types.js').AgentDefinition} agentDef
     * @returns {string|null}
     */
    _buildFinalTitle(agentDef) {
        if (agentDef.id === 'base-agent') {
            return null;
        }
        const label = agentDef.outputDisplay?.typeLabel || agentDef.name || 'Result';
        const icon = agentDef.outputDisplay?.typeIcon || '';
        return icon ? `${icon} ${label}` : label;
    }

    /**
     * Create a working output node (single-node mode).
     * @private
     * @param {import('./agent-types.js').AgentRun} run
     * @param {import('./agent-types.js').AgentDefinition} agentDef
     * @param {import('./agent-types.js').RunContext} context
     * @returns {Promise<string>}
     */
    async _createWorkingOutputNode(run, agentDef, context) {
        logger.enter('RunController._createWorkingOutputNode', { runId: run.id, agentId: agentDef.id });

        const { createEdge, EdgeType } = await import('../graph-types.js');
        const workingNodeManager = this._getWorkingNodeManager();

        let position = { x: 100, y: 100 };
        if (context.sourceNodeIds?.length > 0) {
            const sourceNode = this.graph.getNode(context.sourceNodeIds[0]);
            if (sourceNode) {
                position = {
                    x: sourceNode.position.x + sourceNode.width + 50,
                    y: sourceNode.position.y,
                };
            }
        }

        const nodeType = agentDef.defaultOutputNodeType || 'ai';
        const nodeId = workingNodeManager.createWorkingNode({
            type: nodeType,
            title: this._buildWorkingTitle(agentDef),
            position,
            initiator: 'base_agent',
            agentId: agentDef.id,
            metadata: {
                runId: run.id,
                agentId: agentDef.id,
                outputMode: 'single_node',
                sourceNodeIds: context.sourceNodeIds || [],
            },
        });

        const node = this.graph.getNode(nodeId);
        if (node) {
            node.runId = run.id;
            node.agentId = agentDef.id;
            this.graph.updateNode(node.id, {
                runId: node.runId,
                agentId: node.agentId,
            });
        }

        const sourceIds = context.sourceNodeIds || [];
        for (const sourceId of sourceIds) {
            const edge = createEdge(sourceId, nodeId, EdgeType.RUN_TRIGGER);
            this.graph.addEdge(edge);
        }

        if (context.parentRunId) {
            const nodes = this.graph.getNodes();
            const parentRunNode = nodes.find((n) => n.runId === context.parentRunId);
            if (parentRunNode) {
                const edge = createEdge(parentRunNode.id, nodeId, EdgeType.SUBAGENT);
                this.graph.addEdge(edge);
            } else {
                logger.warn(`Parent run node not found for parentRunId: ${context.parentRunId}`);
            }
        }

        logger.exit('RunController._createWorkingOutputNode', { nodeId });
        return nodeId;
    }

    /**
     * Create a run node in the graph.
     * @param run
     * @param agentDef
     * @param context
     * @private
     */
    async _createRunNode(run, agentDef, context) {
        logger.enter('RunController._createRunNode', { runId: run.id, agentId: agentDef.id });

        // Import dynamically to avoid circular deps
        const { createRunNode, createEdge, EdgeType } = await import('../graph-types.js');

        // Calculate position near source nodes
        let position = { x: 100, y: 100 };
        if (context.sourceNodeIds?.length > 0) {
            const sourceNode = this.graph.getNode(context.sourceNodeIds[0]);
            if (sourceNode) {
                position = {
                    x: sourceNode.position.x + sourceNode.width + 50,
                    y: sourceNode.position.y,
                };
            }
        }

        const runNode = createRunNode(run.id, agentDef.id, agentDef.name, {
            position,
            title: agentDef.name,
        });

        this.graph.addNode(runNode);
        logger.debug(`Run node added to graph: ${runNode.id}`);

        // Create edges from source nodes
        const sourceIds = context.sourceNodeIds || [];
        logger.trace(`Creating ${sourceIds.length} trigger edges from source nodes`);
        for (const sourceId of sourceIds) {
            const edge = createEdge(sourceId, runNode.id, EdgeType.RUN_TRIGGER);
            this.graph.addEdge(edge);
            logger.trace(`Created RUN_TRIGGER edge: ${sourceId} -> ${runNode.id}`);
        }

        // Create edge from parent run if sub-agent
        if (context.parentRunId) {
            logger.debug(`Looking for parent run node: ${context.parentRunId}`);
            // Find parent run node
            const nodes = this.graph.getNodes();
            const parentRunNode = nodes.find((n) => n.runId === context.parentRunId);
            if (parentRunNode) {
                const edge = createEdge(parentRunNode.id, runNode.id, EdgeType.SUBAGENT);
                this.graph.addEdge(edge);
                logger.debug(`Created SUBAGENT edge: ${parentRunNode.id} -> ${runNode.id}`);
            } else {
                logger.warn(`Parent run node not found for parentRunId: ${context.parentRunId}`);
            }
        }

        // Graph updates trigger canvas re-render via observers; no direct render call here.
        logger.exit('RunController._createRunNode', { nodeId: runNode.id });
        return runNode.id;
    }

    /**
     * Update a run node's display.
     * @param nodeId
     * @param run
     * @private
     */
    async _updateRunNode(nodeId, run) {
        logger.trace(`Updating run node: ${nodeId}`, { status: run.status });

        const node = this.graph.getNode(nodeId);
        if (!node) {
            logger.warn(`Cannot update - node not found: ${nodeId}`);
            return;
        }

        // Update content
        let statusEmoji = '⏳';
        switch (run.status) {
            case RunStatusType.RUNNING:
                statusEmoji = '🔄';
                break;
            case RunStatusType.COMPLETED:
                statusEmoji = '✅';
                break;
            case RunStatusType.FAILED:
                statusEmoji = '❌';
                break;
            case RunStatusType.CANCELLED:
                statusEmoji = '🚫';
                break;
            case RunStatusType.PAUSED:
                statusEmoji = '⏸️';
                break;
        }

        let content = `${statusEmoji} **Status:** ${run.status}\n`;

        if (run.plan) {
            content += `\n**Plan:** ${run.plan.summary}\n`;
            for (let i = 0; i < run.plan.steps.length; i++) {
                const step = run.plan.steps[i];
                const stepIcon = step.status === 'completed' ? '✓' : step.status === 'in-progress' ? '→' : '○';
                content += `${stepIcon} ${step.description}\n`;
            }
        }

        if (run.lastProgress) {
            content += `\n**Progress:** ${run.lastProgress}\n`;
        }

        if (run.metrics.tokensUsed > 0) {
            content += `\n**Tokens:** ${run.metrics.tokensUsed}`;
        }

        if (run.error) {
            content += `\n\n**Error:** ${run.error}`;
        }

        this.graph.updateNode(nodeId, {
            content,
            status: run.status,
            plan: run.plan,
            metrics: run.metrics,
            error: run.error,
            completedAt: run.completedAt,
        });

        const updatedNode = this.graph.getNode(nodeId);
        if (updatedNode) {
            this.canvas.renderNode(updatedNode);
        }
    }

    /**
     * Create an artifact node.
     * @private
     * @param {string} runNodeId - Run node ID
     * @param {import('./agent-types.js').AgentRun} run - Agent run
     * @param {Object} artifactData - Artifact data from event
     * @param {import('./agent-types.js').AgentDefinition} agentDef - Agent definition
     * @returns {Promise<string>} Created artifact node ID
     */
    async _createArtifactNode(runNodeId, run, artifactData, agentDef) {
        logger.enter('RunController._createArtifactNode', {
            runNodeId,
            runId: run.id,
            nodeType: artifactData.nodeType,
            hasPostCreate: !!agentDef?.postCreate,
        });

        const { createArtifactNode, createEdge, EdgeType } = await import('../graph-types.js');

        // Get run node position
        const runNode = this.graph.getNode(runNodeId);
        const position = runNode
            ? {
                  x: runNode.position.x,
                  y: runNode.position.y + runNode.height + 50,
              }
            : { x: 200, y: 200 };

        // Build artifact metadata, including data-driven display if provided
        const artifactMetadata = {};
        if (artifactData.outputDisplay) {
            // Apply data-driven display config to metadata.display
            // BaseNode reads this automatically for typeLabel, typeIcon, actions
            artifactMetadata.display = artifactData.outputDisplay;
        }

        const artifactNode = createArtifactNode(run.id, artifactData.content || '', artifactData.nodeType || 'text', {
            position,
            artifactMetadata,
        });

        // Also set metadata.display at root level for BaseNode to read
        if (artifactData.outputDisplay) {
            artifactNode.metadata = artifactNode.metadata || {};
            artifactNode.metadata.display = artifactData.outputDisplay;
        }

        this.graph.addNode(artifactNode);
        logger.debug(`Artifact node added: ${artifactNode.id}`);

        // Create edge from run node
        const edge = createEdge(runNodeId, artifactNode.id, EdgeType.RUN_ARTIFACT);
        this.graph.addEdge(edge);
        logger.trace(`Created RUN_ARTIFACT edge: ${runNodeId} -> ${artifactNode.id}`);

        // Execute postCreate hooks if configured
        if (agentDef?.postCreate) {
            await this._executePostCreateHooks(artifactNode.id, run, agentDef.postCreate);
        }

        // Graph updates trigger canvas re-render via observers; no direct render call here.
        logger.exit('RunController._createArtifactNode', { nodeId: artifactNode.id });
        return artifactNode.id;
    }

    /**
     * Execute postCreate hooks after artifact creation.
     * Resolves variable references and creates edges/updates metadata.
     * @private
     * @param {string} artifactNodeId - The created artifact node ID
     * @param {import('./agent-types.js').AgentRun} run - Agent run context
     * @param {import('./agent-types.js').PostCreateConfig} postCreate - PostCreate config
     */
    async _executePostCreateHooks(artifactNodeId, run, postCreate) {
        logger.enter('RunController._executePostCreateHooks', {
            artifactNodeId,
            runId: run.id,
            edgeCount: postCreate.edges?.length || 0,
            metadataUpdateCount: postCreate.metadataUpdates?.length || 0,
        });

        const { createEdge, EdgeType } = await import('../graph-types.js');

        // Build context for variable resolution
        const sourceNodeIds = run.context?.sourceNodeIds || [];
        let branchNodeId = null;
        let leafNodeId = null;

        // Resolve path context if needed
        if (postCreate.usePathContext && sourceNodeIds.length > 0) {
            const { findLeafToBranchPath } = await import('./reflection-utils.js');
            // Use the first source node as the leaf for path finding
            const path = findLeafToBranchPath(sourceNodeIds[0], this.graph);
            branchNodeId = path.branchNodeId;
            leafNodeId = path.leafNodeId;
            logger.debug(`Resolved path context: branch=${branchNodeId?.slice(0, 8)}, leaf=${leafNodeId?.slice(0, 8)}`);
        }

        /**
         * Resolve a node reference to actual node ID(s)
         * @param {string} ref - Node reference like $artifact, $source, etc.
         * @returns {string[]} Resolved node IDs
         */
        const resolveRef = (ref) => {
            switch (ref) {
                case '$artifact':
                    return [artifactNodeId];
                case '$source':
                    return sourceNodeIds;
                case '$branch':
                    return branchNodeId ? [branchNodeId] : [];
                case '$leaf':
                    return leafNodeId ? [leafNodeId] : [];
                default:
                    // Literal node ID
                    return [ref];
            }
        };

        // Edge type mapping
        const edgeTypeMap = {
            reply: EdgeType.REPLY,
            run_reflection: EdgeType.RUN_REFLECTION,
            run_artifact: EdgeType.RUN_ARTIFACT,
            run_trigger: EdgeType.RUN_TRIGGER,
            subagent: EdgeType.SUBAGENT,
        };

        // Create edges from postCreate config
        for (const edgeSpec of postCreate.edges || []) {
            const fromNodes = resolveRef(edgeSpec.from);
            const toNodes = resolveRef(edgeSpec.to);
            const edgeType = edgeTypeMap[edgeSpec.edgeType?.toLowerCase()] || EdgeType.REPLY;

            for (const fromId of fromNodes) {
                for (const toId of toNodes) {
                    if (fromId && toId) {
                        const newEdge = createEdge(fromId, toId, edgeType);
                        this.graph.addEdge(newEdge);
                        logger.debug(
                            `PostCreate edge: ${fromId.slice(0, 8)} -> ${toId.slice(0, 8)} (${edgeSpec.edgeType || 'reply'})`
                        );
                    }
                }
            }
        }

        // Apply metadata updates from postCreate config
        for (const updateSpec of postCreate.metadataUpdates || []) {
            const targetNodes = resolveRef(updateSpec.target);

            for (const targetId of targetNodes) {
                if (!targetId) continue;

                const node = this.graph.getNode(targetId);
                if (!node) {
                    logger.warn(`PostCreate metadata update: node not found: ${targetId}`);
                    continue;
                }

                // Deep merge metadata
                node.metadata = node.metadata || {};
                for (const [key, value] of Object.entries(updateSpec.metadata || {})) {
                    // Handle special variable in metadata values
                    let resolvedValue = value;
                    if (typeof value === 'string' && value.startsWith('$')) {
                        const resolvedIds = resolveRef(value);
                        resolvedValue = resolvedIds.length === 1 ? resolvedIds[0] : resolvedIds;
                    }

                    if (Array.isArray(resolvedValue) && Array.isArray(node.metadata[key])) {
                        // Append to arrays
                        node.metadata[key] = [...node.metadata[key], ...resolvedValue];
                    } else if (
                        typeof resolvedValue === 'object' &&
                        typeof node.metadata[key] === 'object' &&
                        !Array.isArray(resolvedValue)
                    ) {
                        // Merge objects
                        node.metadata[key] = { ...node.metadata[key], ...resolvedValue };
                    } else {
                        node.metadata[key] = resolvedValue;
                    }
                }

                this.graph.updateNode(node.id, { metadata: node.metadata });
                logger.debug(`PostCreate metadata updated on: ${targetId.slice(0, 8)}`);
            }
        }

        logger.exit('RunController._executePostCreateHooks');
    }

    /**
     * Build a safe execution trace summary for display.
     * Avoids including chain-of-thought or raw scratchpad content.
     * @private
     * @param {import('./agent-types.js').AgentRun} run
     * @returns {Object}
     */
    _buildExecutionTrace(run) {
        /** @type {Map<string, {toolId: string, count: number, totalDurationMs: number}>} */
        const toolCalls = new Map();
        /** @type {Array<{message: string, timestamp: number}>} */
        const progress = [];
        /** @type {Array<{agentId: string, timestamp: number, childRunId?: string}>} */
        const subagents = [];
        /** @type {Array<{actionType: string, timestamp: number, approved?: boolean}>} */
        const approvals = [];

        for (const event of run.events) {
            switch (event.type) {
                case EventType.PROGRESS_UPDATE: {
                    const message = event.data?.message;
                    if (message) {
                        progress.push({ message, timestamp: event.timestamp });
                    }
                    break;
                }
                case EventType.TOOL_CALL_COMPLETED: {
                    const toolId = event.data?.toolId || 'tool';
                    const duration = event.data?.durationMs || 0;
                    const entry = toolCalls.get(toolId) || { toolId, count: 0, totalDurationMs: 0 };
                    entry.count += 1;
                    entry.totalDurationMs += duration;
                    toolCalls.set(toolId, entry);
                    break;
                }
                case EventType.SUBAGENT_SPAWN_REQUESTED: {
                    const agentId = event.data?.agentId;
                    if (agentId) {
                        subagents.push({ agentId, timestamp: event.timestamp });
                    }
                    break;
                }
                case EventType.SUBAGENT_SPAWN_COMPLETED: {
                    const agentId = event.data?.agentId;
                    if (agentId) {
                        subagents.push({
                            agentId,
                            timestamp: event.timestamp,
                            childRunId: event.data?.childRunId,
                        });
                    }
                    break;
                }
                case EventType.APPROVAL_REQUESTED: {
                    const actionType = event.data?.actionType || 'approval';
                    approvals.push({ actionType, timestamp: event.timestamp });
                    break;
                }
                case EventType.APPROVAL_RESOLVED: {
                    const actionType = event.data?.actionType || 'approval';
                    approvals.push({
                        actionType,
                        timestamp: event.timestamp,
                        approved: event.data?.approved,
                    });
                    break;
                }
                default:
                    break;
            }
        }

        return {
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            plan: run.plan
                ? {
                      summary: run.plan.summary,
                      currentStepIndex: run.plan.currentStepIndex,
                      steps: run.plan.steps.map((step) => ({
                          id: step.id,
                          description: step.description,
                          status: step.status,
                          result: step.result || null,
                      })),
                  }
                : null,
            progress,
            toolCalls: Array.from(toolCalls.values()),
            subagents,
            approvals,
            metrics: run.metrics,
            error: run.error || null,
        };
    }

    /**
     * Attach execution trace metadata to artifact nodes produced by the run.
     * @private
     * @param {import('./agent-types.js').AgentRun} run
     */
    _attachExecutionTraceToArtifacts(run) {
        if (!run?.artifactNodeIds?.length) {
            return;
        }

        const trace = this._buildExecutionTrace(run);

        for (const artifactNodeId of run.artifactNodeIds) {
            const node = this.graph.getNode(artifactNodeId);
            if (!node) continue;

            const existingMetadata = node.metadata || {};
            const existingTrace = existingMetadata.executionTrace || {};
            const expanded = typeof existingTrace.expanded === 'boolean' ? existingTrace.expanded : false;

            this.graph.updateNode(artifactNodeId, {
                metadata: {
                    ...existingMetadata,
                    executionTrace: {
                        ...trace,
                        expanded,
                    },
                },
            });
        }
    }

    /**
     * Retain memories from a completed run.
     * @param run
     * @private
     */
    async _retainRunMemories(run) {
        logger.enter('RunController._retainRunMemories', { runId: run.id, status: run.status });

        const store = this.memoryRegistry.get();
        if (!store) {
            logger.warn('No memory store available - skipping memory retention');
            logger.exit('RunController._retainRunMemories');
            return;
        }

        // Retain experience memory
        await store.retain({
            bankId: 'default',
            type: MemoryTypeEnum.EXPERIENCE,
            content:
                `Agent ${run.agentId} completed with status ${run.status}. ` +
                `Used ${run.metrics.tokensUsed} tokens in ${run.metrics.durationMs}ms.`,
            sourceRefs: [run.id],
            metadata: {
                agentId: run.agentId,
                status: run.status,
                metrics: run.metrics,
            },
        });

        // Retain outcome as world fact if successful
        if (run.status === RunStatusType.COMPLETED && run.artifactNodeIds.length > 0) {
            logger.debug(`Retaining world memory for ${run.artifactNodeIds.length} artifacts`);
            await store.retain({
                bankId: 'default',
                type: MemoryTypeEnum.WORLD,
                content: `Run ${run.id} produced ${run.artifactNodeIds.length} artifact(s).`,
                sourceRefs: run.artifactNodeIds,
            });
        }

        logger.exit('RunController._retainRunMemories');
    }
}

// =============================================================================
// Exports
// =============================================================================

export { RunController, DEFAULT_GUARDRAILS };
