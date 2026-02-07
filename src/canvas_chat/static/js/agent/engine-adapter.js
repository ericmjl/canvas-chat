/**
 * Engine Adapter Interface
 *
 * Agents are executed via engine adapters, allowing multiple execution strategies
 * without coupling Canvas Chat to a specific framework.
 *
 * Engine adapters:
 * - Do not mutate the canvas directly
 * - Do not manage persistence
 * - Interact only through host-provided interfaces
 */

import { EventType, createAgentPlan, createEvent, createPlanStep } from './agent-types.js';
import { engineLogger as logger } from './debug-logger.js';
import { getToolRegistry } from './tool-registry.js';
import { executeAgenticTask } from './agentic-executor.js';
import { storage } from '../storage.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Host-provided context for engine execution
 * The host exposes only safe primitives that engines can use.
 * @typedef {Object} HostContext
 * @property {any} graph - Graph instance for tool-backed engines
 * @property {any} chat - Chat instance for tool-backed engines
 * @property {LLMInterface} llm - LLM streaming interface
 * @property {ToolsInterface} tools - Tool invocation interface
 * @property {SubagentInterface} subagent - Sub-agent spawning interface
 * @property {Function} emit - Event emission function
 * @property {AgentBudgets} budgets - Execution limits
 * @property {MemoryRecallInterface} memory - Memory recall interface (read-only)
 */

/**
 * LLM interface for streaming completions
 * @typedef {Object} LLMInterface
 * @property {Function} stream - Stream LLM completion
 */

/**
 * Tools interface for invoking tools
 * @typedef {Object} ToolsInterface
 * @property {Function} invoke - Invoke a tool (permission-checked, MCP-backed)
 * @property {Function} list - List available tools
 * @property {Function} isAllowed - Check if tool is allowed for agent
 */

/**
 * Sub-agent spawning interface
 * @typedef {Object} SubagentInterface
 * @property {Function} spawn - Spawn a sub-agent
 */

/**
 * Memory recall interface (read-only)
 * @typedef {Object} MemoryRecallInterface
 * @property {Function} recall - Retrieve relevant memories
 */

// =============================================================================
// Tool Invocation Helpers
// =============================================================================

/**
 * Create a tools interface for an agent with permission checking.
 * @param {import('./agent-types.js').AgentDefinition} agentDefinition
 * @param {string} runId
 * @param {Function} emit - Event emission function
 * @returns {ToolsInterface}
 */
function createToolsInterface(agentDefinition, runId, emit) {
    const allowedTools = new Set(agentDefinition.allowedTools || []);
    const hitl = agentDefinition.hitl || {};
    const alwaysApproveTools = new Set(hitl.alwaysApproveTools || []);
    const alwaysBlockTools = new Set(hitl.alwaysBlockTools || []);

    return {
        /**
         * Invoke a tool with permission checking.
         * @param {string} toolId - Tool identifier
         * @param {Object} params - Tool parameters
         * @returns {Promise<import('./tool-registry.js').ToolResult>}
         */
        async invoke(toolId, params) {
            logger.enter('ToolsInterface.invoke', { toolId, runId });

            // Check if tool exists
            const tool = getToolRegistry().getTool(toolId);
            if (!tool) {
                logger.error(`Tool not found: ${toolId}`);
                return {
                    success: false,
                    error: `Tool not found: ${toolId}`,
                    toolId,
                    executionTimeMs: 0,
                };
            }

            // Check if tool is allowed for this agent
            if (!allowedTools.has(toolId) && !allowedTools.has('*')) {
                logger.warn(`Tool ${toolId} not allowed for agent ${agentDefinition.id}`);
                return {
                    success: false,
                    error: `Tool ${toolId} not allowed for this agent`,
                    toolId,
                    executionTimeMs: 0,
                };
            }

            // Check if tool is always blocked
            if (alwaysBlockTools.has(toolId)) {
                logger.warn(`Tool ${toolId} is blocked by HITL policy`);
                return {
                    success: false,
                    error: `Tool ${toolId} is blocked by policy`,
                    toolId,
                    executionTimeMs: 0,
                };
            }

            // Emit tool call requested event
            emit(
                createEvent(EventType.TOOL_CALL_REQUESTED, runId, {
                    toolId,
                    params,
                    requiresApproval: hitl.requireApprovalForTools && !alwaysApproveTools.has(toolId),
                })
            );

            // Execute tool via registry
            logger.info(`Invoking tool: ${toolId}`, params);
            const result = await getToolRegistry().invokeTool(toolId, params);

            // Emit tool call completed event
            emit(
                createEvent(EventType.TOOL_CALL_COMPLETED, runId, {
                    toolId,
                    result,
                })
            );

            logger.exit('ToolsInterface.invoke', { success: result.success });
            return result;
        },

        /**
         * List all tools available to this agent.
         * @returns {import('./tool-registry.js').ToolDefinition[]}
         */
        list() {
            const allTools = getToolRegistry().listTools();
            if (allowedTools.has('*')) {
                return allTools;
            }
            return allTools.filter((t) => allowedTools.has(t.id));
        },

        /**
         * Check if a tool is allowed for this agent.
         * @param {string} toolId
         * @returns {boolean}
         */
        isAllowed(toolId) {
            if (alwaysBlockTools.has(toolId)) return false;
            return allowedTools.has(toolId) || allowedTools.has('*');
        },
    };
}

// =============================================================================
// Engine Adapter Base Class
// =============================================================================

/**
 * Base class for engine adapters.
 * Subclass this to implement different execution strategies.
 *
 * @abstract
 */
class EngineAdapter {
    /**
     * @param {string} engineId - Unique engine identifier
     */
    constructor(engineId) {
        if (this.constructor === EngineAdapter) {
            throw new Error('EngineAdapter is abstract and cannot be instantiated directly');
        }
        this.engineId = engineId;
    }

    /**
     * Execute an agent run.
     * Returns an async iterator of events for streaming updates to the UI.
     *
     * @param {import('./agent-types.js').RunRequest} runRequest - The run request
     * @param {HostContext} hostContext - Host-provided context
     * @param {import('./agent-types.js').AgentDefinition} agentDefinition - Agent definition
     * @yields {import('./agent-types.js').AgentEvent} Events during execution
     * @abstract
     */
    async *run(runRequest, hostContext, agentDefinition) {
        throw new Error('run() must be implemented by subclass');
    }

    /**
     * Cancel a running execution.
     * @param {string} runId - The run ID to cancel
     * @returns {Promise<boolean>} True if cancelled successfully
     */
    async cancel(runId) {
        // Default implementation - subclasses may override
        return false;
    }

    /**
     * Check if the engine supports a specific capability.
     * @param {string} capability - Capability name
     * @returns {boolean}
     */
    supports(capability) {
        return false;
    }
}

// =============================================================================
// Built-in Engine Adapter
// =============================================================================

/**
 * Built-in engine adapter using Canvas Chat's native LLM streaming.
 * This is the default engine for simple agent execution.
 */
class BuiltinEngineAdapter extends EngineAdapter {
    constructor() {
        super('builtin');
        /** @type {Map<string, AbortController>} */
        this.activeRuns = new Map();
        logger.info('BuiltinEngineAdapter initialized');
    }

    /**
     * Execute an agent run using the built-in LLM streaming.
     *
     * @param {import('./agent-types.js').RunRequest} runRequest
     * @param {HostContext} hostContext
     * @param {import('./agent-types.js').AgentDefinition} agentDefinition
     * @yields {import('./agent-types.js').AgentEvent}
     */
    async *run(runRequest, hostContext, agentDefinition) {
        const runId = crypto.randomUUID();
        logger.enter('BuiltinEngineAdapter.run', { runId, agentId: agentDefinition.id });
        logger.debug(`Starting run for agent: ${agentDefinition.name}`);
        logger.timeStart(`run-${runId}`);

        const abortController = new AbortController();
        this.activeRuns.set(runId, abortController);
        logger.trace(`Active runs count: ${this.activeRuns.size}`);

        try {
            // Emit run started
            logger.event('RUN_STARTED', { runId, agentId: agentDefinition.id });
            yield createEvent(EventType.RUN_STARTED, runId, {
                agentId: agentDefinition.id,
                context: runRequest.context,
            });

            // Update status to running
            logger.stateChange('runStatus', 'pending', 'running');
            yield createEvent(EventType.RUN_STATUS, runId, {
                status: 'running',
                message: 'Agent execution started',
            });

            // Build messages from context
            logger.debug('Building messages from context...');
            const messages = await this._buildMessages(runRequest, hostContext, agentDefinition);
            logger.debug(`Built ${messages.length} messages for LLM`);
            logger.table(
                'Messages',
                messages.map((m) => ({ role: m.role, length: m.content?.length || 0 }))
            );

            // Emit progress
            logger.event('PROGRESS_UPDATE', { phase: 'llm-streaming' });
            yield createEvent(EventType.PROGRESS_UPDATE, runId, {
                message: 'Generating response...',
                phase: 'llm-streaming',
            });

            // Stream LLM completion
            let fullContent = '';
            let tokensUsed = 0;
            let chunkCount = 0;

            logger.debug(`Starting LLM stream with model: ${agentDefinition.model}`);
            logger.timeStart(`llm-stream-${runId}`);

            const stream = hostContext.llm.stream({
                model: agentDefinition.model,
                messages,
                signal: abortController.signal,
            });

            for await (const chunk of stream) {
                chunkCount++;

                if (abortController.signal.aborted) {
                    logger.warn(`Run ${runId} aborted by user`);
                    logger.stateChange('runStatus', 'running', 'cancelled');
                    yield createEvent(EventType.RUN_STATUS, runId, {
                        status: 'cancelled',
                        message: 'Run cancelled by user',
                    });
                    return;
                }

                if (chunk.content) {
                    fullContent += chunk.content;
                    if (chunkCount % 10 === 0) {
                        logger.trace(`Received ${chunkCount} chunks, content length: ${fullContent.length}`);
                    }
                    yield createEvent(EventType.TOKEN_DELTA, runId, {
                        content: chunk.content,
                    });
                }

                if (chunk.usage) {
                    tokensUsed = chunk.usage.totalTokens || 0;
                    logger.debug(`Token usage update: ${tokensUsed} tokens`);
                }
            }

            logger.timeEnd(`llm-stream-${runId}`);
            logger.info(
                `LLM stream completed: ${chunkCount} chunks, ${fullContent.length} chars, ${tokensUsed} tokens`
            );

            // Emit artifact created
            logger.event('ARTIFACT_CREATED', { nodeType: agentDefinition.defaultOutputNodeType || 'ai' });
            yield createEvent(EventType.ARTIFACT_CREATED, runId, {
                nodeId: null, // Will be assigned by RunController
                nodeType: agentDefinition.defaultOutputNodeType || 'ai',
                outputDisplay: agentDefinition.outputDisplay || null,
                content: fullContent,
            });

            // Emit run completed
            const duration = logger.timeEnd(`run-${runId}`);
            logger.stateChange('runStatus', 'running', 'completed');
            logger.info(`Run ${runId} completed successfully in ${duration?.toFixed(0) || 'unknown'}ms`);

            yield createEvent(EventType.RUN_COMPLETED, runId, {
                artifactNodeIds: [], // Will be populated by RunController
                metrics: {
                    tokensUsed,
                    toolCallsCount: 0,
                    subagentSpawns: 0,
                    durationMs: Date.now() - Date.now(), // Will be calculated by RunController
                },
            });
        } catch (error) {
            logger.timeEnd(`run-${runId}`);

            if (error.name === 'AbortError') {
                logger.warn(`Run ${runId} cancelled via AbortError`);
                yield createEvent(EventType.RUN_STATUS, runId, {
                    status: 'cancelled',
                    message: 'Run cancelled',
                });
            } else {
                logger.error(`Run ${runId} failed: ${error.message}`, error);
                yield createEvent(EventType.RUN_FAILED, runId, {
                    error: error.message || 'Unknown error',
                });
            }
        } finally {
            this.activeRuns.delete(runId);
            logger.trace(`Cleaned up run ${runId}. Active runs: ${this.activeRuns.size}`);
            logger.exit('BuiltinEngineAdapter.run');
        }
    }

    /**
     * Build messages array for LLM from run context.
     * @private
     */
    async _buildMessages(runRequest, hostContext, agentDefinition) {
        logger.enter('BuiltinEngineAdapter._buildMessages');
        const messages = [];

        // System prompt
        logger.debug(`Adding system prompt (${agentDefinition.systemPrompt?.length || 0} chars)`);
        messages.push({
            role: 'system',
            content: agentDefinition.systemPrompt,
        });

        // Recall relevant memories if available
        if (hostContext.memory && hostContext.memory.recall) {
            logger.debug('Memory interface available, attempting recall...');
            try {
                logger.timeStart('memory-recall');
                const memories = await hostContext.memory.recall({
                    query: runRequest.context.userQuery || '',
                    limit: 5,
                });
                logger.timeEnd('memory-recall');

                if (memories && memories.length > 0) {
                    logger.info(`Recalled ${memories.length} memories for context`);
                    logger.table(
                        'Recalled memories',
                        memories.map((m) => ({
                            id: m.id?.slice(0, 8),
                            type: m.type,
                            contentLength: m.content?.length,
                        }))
                    );

                    const memoryContext = memories.map((m) => `[Memory: ${m.type}] ${m.content}`).join('\n\n');
                    messages.push({
                        role: 'system',
                        content: `Relevant context from memory:\n\n${memoryContext}`,
                    });
                } else {
                    logger.debug('No relevant memories found');
                }
            } catch (e) {
                logger.warn('Memory recall failed:', e.message);
            }
        } else {
            logger.trace('Memory interface not available');
        }

        // User query
        if (runRequest.context.userQuery) {
            logger.debug(`Adding user query (${runRequest.context.userQuery.length} chars)`);
            messages.push({
                role: 'user',
                content: runRequest.context.userQuery,
            });
        }

        logger.exit('BuiltinEngineAdapter._buildMessages', { messageCount: messages.length });
        return messages;
    }

    /**
     * Cancel a running execution.
     * @param {string} runId
     * @returns {Promise<boolean>}
     */
    async cancel(runId) {
        logger.enter('BuiltinEngineAdapter.cancel', { runId });
        const controller = this.activeRuns.get(runId);
        if (controller) {
            logger.info(`Cancelling run: ${runId}`);
            controller.abort();
            this.activeRuns.delete(runId);
            logger.exit('BuiltinEngineAdapter.cancel', true);
            return true;
        }
        logger.warn(`Cannot cancel - run not found: ${runId}`);
        logger.exit('BuiltinEngineAdapter.cancel', false);
        return false;
    }

    /**
     * Check if the engine supports a capability.
     * @param {string} capability
     * @returns {boolean}
     */
    supports(capability) {
        const supported = ['llm-streaming', 'cancellation'];
        const result = supported.includes(capability);
        logger.trace(`supports(${capability}): ${result}`);
        return result;
    }
}

// =============================================================================
// Agentic Engine Adapter
// =============================================================================

/**
 * Agentic engine adapter using the tool-using agentic executor.
 * This enables config-based agents to call graph tools.
 */
class AgenticEngineAdapter extends EngineAdapter {
    constructor() {
        super('agentic');
        logger.info('AgenticEngineAdapter initialized');
    }

    /**
     * Execute an agent run using the agentic executor.
     *
     * @param {import('./agent-types.js').RunRequest} runRequest
     * @param {HostContext} hostContext
     * @param {import('./agent-types.js').AgentDefinition} agentDefinition
     * @yields {import('./agent-types.js').AgentEvent}
     */
    async *run(runRequest, hostContext, agentDefinition) {
        const runId = crypto.randomUUID();
        logger.enter('AgenticEngineAdapter.run', { runId, agentId: agentDefinition.id });
        logger.timeStart(`run-${runId}`);

        try {
            if (!hostContext?.graph || !hostContext?.chat) {
                throw new Error('Agentic engine requires graph and chat interfaces');
            }

            const plan = createAgentPlan('Respond to the user', [
                createPlanStep('Gather relevant context'),
                createPlanStep('Use tools if needed'),
                createPlanStep('Compose response'),
            ]);
            const gatherStep = plan.steps[0];
            const toolsStep = plan.steps[1];
            const composeStep = plan.steps[2];
            plan.currentStepIndex = 0;
            gatherStep.status = 'in-progress';

            yield createEvent(EventType.RUN_STARTED, runId, {
                agentId: agentDefinition.id,
                context: runRequest.context,
            });

            yield createEvent(EventType.RUN_STATUS, runId, {
                status: 'running',
                message: 'Agent execution started',
            });

            yield createEvent(EventType.PLAN_CREATED, runId, { plan });
            yield createEvent(EventType.PLAN_UPDATED, runId, { plan, stepIndex: plan.currentStepIndex });

            const startTime = Date.now();
            const model = agentDefinition.model || storage.getCurrentModel();
            const userMessage = runRequest.context.userQuery || runRequest.parameters?.context || 'Complete the task.';

            const eventQueue = [];
            let notifyEvent = null;
            let streamedTokens = false;
            let toolsUsed = 0;
            let gatherCompleted = false;
            let composeStarted = false;
            const enqueueEvent = (event) => {
                eventQueue.push(event);
                if (notifyEvent) {
                    notifyEvent();
                    notifyEvent = null;
                }
            };
            const onProgress = (message) => {
                if (!message) return;
                enqueueEvent({ type: 'progress', message: String(message) });
            };
            const onToken = (chunk) => {
                if (!chunk) return;
                streamedTokens = true;
                enqueueEvent({ type: 'token', content: String(chunk) });
            };
            const onTool = (toolCall) => {
                if (!toolCall) return;
                enqueueEvent({ type: 'tool', tool: toolCall });
            };

            let resolved = false;
            let resolvedResult = null;

            const resultPromise = executeAgenticTask({
                systemPrompt: agentDefinition.systemPrompt || '',
                userMessage,
                selectedNodeIds: runRequest.context.sourceNodeIds || [],
                graph: hostContext.graph,
                chat: hostContext.chat,
                model,
                maxToolCalls: agentDefinition.budgets?.maxToolCalls || 10,
                allowedTools: agentDefinition.allowedTools || [],
                onProgress,
                onToken,
                onTool,
            }).then((result) => {
                resolved = true;
                resolvedResult = result;
                if (notifyEvent) {
                    notifyEvent();
                    notifyEvent = null;
                }
                return result;
            });

            while (!resolved) {
                if (eventQueue.length === 0) {
                    await new Promise((resolve) => {
                        notifyEvent = resolve;
                    });
                }

                while (eventQueue.length > 0) {
                    const event = eventQueue.shift();
                    if (!event) continue;
                    if (event.type === 'token') {
                        yield createEvent(EventType.TOKEN_DELTA, runId, {
                            content: event.content,
                        });
                    } else if (event.type === 'progress') {
                        yield createEvent(EventType.PROGRESS_UPDATE, runId, {
                            message: event.message,
                        });

                        if (!gatherCompleted) {
                            gatherCompleted = true;
                            gatherStep.status = 'completed';
                            gatherStep.result = event.message;
                            toolsStep.status = 'in-progress';
                            plan.currentStepIndex = 1;
                            yield createEvent(EventType.PLAN_UPDATED, runId, {
                                plan,
                                stepIndex: 1,
                            });
                        }
                    } else if (event.type === 'tool') {
                        const toolId = event.tool?.toolId || event.tool?.name || 'tool';
                        toolsUsed += 1;

                        const toolStep = createPlanStep(`Tool: ${toolId}`);
                        toolStep.status = 'completed';
                        toolStep.result = toolsUsed === 1 ? 'Used tool' : `Used tool (${toolsUsed})`;

                        const composeIndex = plan.steps.indexOf(composeStep);
                        if (composeIndex === -1) {
                            plan.steps.push(toolStep);
                        } else {
                            plan.steps.splice(composeIndex, 0, toolStep);
                        }

                        toolsStep.status = 'completed';
                        toolsStep.result = `Used ${toolsUsed} tool${toolsUsed === 1 ? '' : 's'}`;
                        if (!composeStarted) {
                            composeStarted = true;
                            composeStep.status = 'in-progress';
                            plan.currentStepIndex = plan.steps.indexOf(composeStep);
                        }
                        plan.summary = `Respond to the user (tools used: ${toolsUsed})`;
                        yield createEvent(EventType.PLAN_UPDATED, runId, {
                            plan,
                            stepIndex: plan.currentStepIndex,
                        });
                    }
                }
            }

            const result = resolvedResult || (await resultPromise);

            if (!result.success) {
                yield createEvent(EventType.RUN_FAILED, runId, {
                    error: result.error || 'Agentic execution failed',
                });
                logger.exit('AgenticEngineAdapter.run', { success: false, error: result.error });
                return;
            }

            const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
            for (const toolCall of toolCalls) {
                yield createEvent(EventType.TOOL_CALL_COMPLETED, runId, {
                    toolId: toolCall.toolId || toolCall.name || 'tool',
                    durationMs: toolCall.durationMs || 0,
                });
            }

            if (!streamedTokens && result.content) {
                const chunkSize = 120;
                for (let i = 0; i < result.content.length; i += chunkSize) {
                    const chunk = result.content.slice(i, i + chunkSize);
                    yield createEvent(EventType.TOKEN_DELTA, runId, {
                        content: chunk,
                    });
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }

            if (!gatherCompleted) {
                gatherStep.status = 'completed';
                gatherStep.result = 'Context gathered';
            }
            if (toolsUsed === 0 && toolsStep.status !== 'completed') {
                toolsStep.status = 'skipped';
                toolsStep.result = 'No tools needed';
            }
            if (!composeStarted) {
                composeStep.status = 'in-progress';
            }
            composeStep.status = 'completed';
            composeStep.result = 'Response generated';
            plan.currentStepIndex = plan.steps.indexOf(composeStep);
            yield createEvent(EventType.PLAN_UPDATED, runId, {
                plan,
                stepIndex: plan.currentStepIndex,
            });

            yield createEvent(EventType.ARTIFACT_CREATED, runId, {
                nodeId: null,
                nodeType: agentDefinition.defaultOutputNodeType || 'ai',
                outputDisplay: agentDefinition.outputDisplay || null,
                content: result.content || '',
            });

            const durationMs = Date.now() - startTime;
            yield createEvent(EventType.RUN_COMPLETED, runId, {
                artifactNodeIds: [],
                metrics: {
                    tokensUsed: result.content ? result.content.length : 0,
                    toolCallsCount: toolCalls.length,
                    subagentSpawns: 0,
                    durationMs: durationMs,
                },
            });

            logger.exit('AgenticEngineAdapter.run', { success: true });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            yield createEvent(EventType.RUN_FAILED, runId, {
                error: errorMessage,
            });
            logger.exit('AgenticEngineAdapter.run', { success: false, error: errorMessage });
        } finally {
            logger.timeEnd(`run-${runId}`);
        }
    }
}

// =============================================================================
// Engine Registry
// =============================================================================

/**
 * Registry for engine adapters.
 * Allows registering and retrieving engine implementations.
 */
class EngineRegistry {
    constructor() {
        logger.info('EngineRegistry initializing...');
        /** @type {Map<string, EngineAdapter>} */
        this.engines = new Map();

        // Register built-in engine by default
        this.register(new BuiltinEngineAdapter());
        this.register(new AgenticEngineAdapter());
        logger.info('EngineRegistry initialized with builtin + agentic engines');
    }

    /**
     * Register an engine adapter.
     * @param {EngineAdapter} engine
     */
    register(engine) {
        logger.enter('EngineRegistry.register', { engineId: engine.engineId });
        if (this.engines.has(engine.engineId)) {
            logger.warn(`Overwriting existing engine: ${engine.engineId}`);
        }
        this.engines.set(engine.engineId, engine);
        logger.info(`Registered engine: ${engine.engineId}`);
        logger.table(
            'Available engines',
            Array.from(this.engines.keys()).map((id) => ({ id }))
        );
        logger.exit('EngineRegistry.register');
    }

    /**
     * Get an engine by ID.
     * @param {string} engineId
     * @returns {EngineAdapter|null}
     */
    get(engineId) {
        const engine = this.engines.get(engineId) || null;
        if (engine) {
            logger.trace(`Retrieved engine: ${engineId}`);
        } else {
            logger.warn(`Engine not found: ${engineId}`);
        }
        return engine;
    }

    /**
     * List all registered engine IDs.
     * @returns {string[]}
     */
    list() {
        const ids = Array.from(this.engines.keys());
        logger.trace(`Listing engines: ${ids.join(', ')}`);
        return ids;
    }
}

// =============================================================================
// Exports
// =============================================================================

export { EngineAdapter, BuiltinEngineAdapter, AgenticEngineAdapter, EngineRegistry };
