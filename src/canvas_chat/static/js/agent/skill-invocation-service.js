/**
 * Skill Invocation Service - Main entry point for invoking skills
 *
 * The SkillInvocationService orchestrates the full skill execution flow:
 * 1. Validate skill and permissions (SkillValidator)
 * 2. Resolve full definition on-demand (SkillResolver)
 * 3. Create SKILL_RUN node with working state
 * 4. Execute skill (instruction or script mode)
 * 5. Update node with results/artifacts
 *
 * This service uses WorkingNodeManager for live progress updates
 * and integrates with the agent architecture for sub-agent execution.
 *
 * @module agent/skill-invocation-service
 */

import { getSkillRegistry } from './skill-registry.js';
import { SkillResolver, getBuiltinInstructions } from './skill-resolver.js';
import { createSkillRun } from './skill-types.js';
import { WorkingNodeManager, createWorkingNodeManager } from './working-node-manager.js';
import { executeAgenticTask } from './agentic-executor.js';
import { createComponentLogger, LogLevel } from './debug-logger.js';
import { NodeType, EdgeType, createNode, createEdge } from '../graph-types.js';

const logger = createComponentLogger('SkillInvocationService', LogLevel.DEBUG);

/**
 * @typedef {Object} SkillInvocationContext
 * @property {import('../crdt-graph.js').DAGGraph} graph - Graph instance
 * @property {import('../canvas.js').Canvas} canvas - Canvas instance
 * @property {Object} chat - Chat API instance
 * @property {Object} [storage] - Storage instance
 */

/**
 * SkillInvocationService - Single entry point for skill invocation
 */
export class SkillInvocationService {
    /**
     * @param {SkillInvocationContext} context - Application context
     * @param {Object} [options] - Service options
     * @param {import('./skill-registry.js').SkillRegistry} [options.registry] - Custom registry
     * @param {SkillResolver} [options.resolver] - Custom resolver
     */
    constructor(context, options = {}) {
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.chat = context.chat;
        this.storage = context.storage;

        this.registry = options.registry || getSkillRegistry();
        this.resolver = options.resolver || new SkillResolver();

        /**
         * Active skill runs being tracked
         * @type {Map<string, import('./skill-types.js').SkillRun>}
         */
        this.activeRuns = new Map();

        /**
         * Working node manager for live progress
         * @type {WorkingNodeManager|null}
         */
        this.workingNodeManager = null;

        logger.debug('SkillInvocationService initialized');
    }

    /**
     * Initialize the working node manager
     * Must be called before invoking skills.
     */
    initializeWorkingNodes() {
        if (!this.workingNodeManager) {
            this.workingNodeManager = createWorkingNodeManager(this.graph, this.canvas);
        }
    }

    /**
     * Invoke a skill by ID
     * @param {import('./skill-types.js').SkillInvocationRequest} request - Invocation request
     * @returns {Promise<import('./skill-types.js').SkillInvocationResult>}
     */
    async invoke(request) {
        this.initializeWorkingNodes();

        const startTime = Date.now();

        // 1. Get skill metadata from registry
        const metadata = this.registry.getSkill(request.skillId);
        if (!metadata) {
            return {
                success: false,
                runId: null,
                nodeId: null,
                error: `Skill not found: ${request.skillId}`,
            };
        }

        // 2. Check permissions (simplified for now)
        const permissionCheck = this._checkPermissions(metadata, request);
        if (!permissionCheck.allowed) {
            return {
                success: false,
                runId: null,
                nodeId: null,
                error: permissionCheck.reason,
            };
        }

        // 3. Create skill run record
        const run = createSkillRun({
            skillId: metadata.id,
            skillName: metadata.name,
            input: {
                message: request.message,
                parameters: request.parameters,
                contextNodeIds: request.contextNodeIds,
            },
        });
        this.activeRuns.set(run.runId, run);

        // 4. Create working node
        const nodeId = await this._createWorkingNode(run, request);

        try {
            // 5. Resolve full definition
            run.status = 'running';
            this._updateRunTrace(run, 'status_change', { status: 'running' });

            const definition = await this.resolver.resolve(metadata.id, metadata.source);
            if (!definition && !metadata.builtin) {
                throw new Error(`Could not resolve skill definition: ${metadata.id}`);
            }

            // 6. Execute based on mode
            let result;
            if (metadata.mode === 'script') {
                result = await this._executeScript(run, definition, request, nodeId);
            } else {
                result = await this._executeInstruction(run, metadata, definition, request, nodeId);
            }

            // 7. Finalize node with results
            run.status = 'completed';
            run.completedAt = Date.now();
            run.output = result;
            this._updateRunTrace(run, 'completed', result);

            await this._finalizeNode(run, nodeId, result);

            // 8. Return result
            const metrics = {
                durationMs: Date.now() - startTime,
                tokensUsed: result.tokensUsed || 0,
                toolCalls: result.toolCalls || 0,
            };
            run.metrics = metrics;

            return {
                success: true,
                runId: run.runId,
                nodeId,
                result: result.content,
                artifactNodeIds: result.artifactNodeIds || [],
                metrics,
            };
        } catch (error) {
            // Error handling
            run.status = 'failed';
            run.completedAt = Date.now();
            run.error = error.message;
            run.errorStack = error.stack;
            this._updateRunTrace(run, 'error', { message: error.message });

            if (this.workingNodeManager) {
                this.workingNodeManager.setError(nodeId, error.message);
            }

            logger.error(`Skill invocation failed: ${metadata.id}`, error);

            return {
                success: false,
                runId: run.runId,
                nodeId,
                error: error.message,
            };
        } finally {
            this.activeRuns.delete(run.runId);
        }
    }

    /**
     * Check permissions for skill invocation
     * @param {import('./skill-types.js').SkillMetadata} metadata - Skill metadata
     * @param {import('./skill-types.js').SkillInvocationRequest} request - Request
     * @returns {{allowed: boolean, reason?: string}}
     * @private
     */
    _checkPermissions(metadata, request) {
        const permissions = metadata.permissions;

        // Check if HITL approval is required
        if (permissions.requiresApproval && !request.skipApproval) {
            // In a full implementation, this would trigger a UI prompt
            // For now, we allow if skipApproval is set
            return {
                allowed: false,
                reason: `Skill "${metadata.name}" requires approval before execution`,
            };
        }

        // Check token limit
        if (permissions.maxTokens && request.options?.maxTokens > permissions.maxTokens) {
            return {
                allowed: false,
                reason: `Requested tokens (${request.options.maxTokens}) exceeds skill limit (${permissions.maxTokens})`,
            };
        }

        // More permission checks would go here (capability-based, tool restrictions, etc.)

        return { allowed: true };
    }

    /**
     * Create a working node for the skill run
     * @param {import('./skill-types.js').SkillRun} run - Skill run record
     * @param {import('./skill-types.js').SkillInvocationRequest} request - Request
     * @returns {Promise<string>} Node ID
     * @private
     */
    async _createWorkingNode(run, request) {
        if (!this.workingNodeManager) {
            throw new Error('WorkingNodeManager not initialized');
        }

        const node = this.workingNodeManager.createWorkingNode({
            type: NodeType.SKILL_RUN,
            title: `🚀 ${run.skillName}`,
            parentNodeId: request.parentNodeId,
            edgeType: EdgeType.SKILL_INPUT,
            metadata: {
                runId: run.runId,
                skillId: run.skillId,
                skillName: run.skillName,
                status: 'pending',
            },
        });

        return node.id;
    }

    /**
     * Execute an instruction-mode skill
     * @param {import('./skill-types.js').SkillRun} run - Skill run
     * @param {import('./skill-types.js').SkillMetadata} metadata - Skill metadata
     * @param {import('./skill-types.js').SkillDefinition|null} definition - Full definition (may be null for builtin)
     * @param {import('./skill-types.js').SkillInvocationRequest} request - Request
     * @param {string} nodeId - Working node ID
     * @returns {Promise<Object>}
     * @private
     */
    async _executeInstruction(run, metadata, definition, request, nodeId) {
        // Get instructions (from definition or built-in fallback)
        let instructions = definition?.instructions;
        if (!instructions && metadata.builtin) {
            instructions = getBuiltinInstructions(metadata.id);
        }
        if (!instructions) {
            throw new Error(`No instructions found for skill: ${metadata.id}`);
        }

        // Gather context from nodes
        const contextContent = await this._gatherContext(request.contextNodeIds);

        // Build system prompt
        const systemPrompt =
            definition?.systemPrompt ||
            `You are executing the "${metadata.name}" skill.

${instructions}`;

        // Build user message
        const userMessage = request.message
            ? `${request.message}\n\n${contextContent ? `Context:\n${contextContent}` : ''}`
            : contextContent || 'Please process the provided context.';

        // Update progress
        if (this.workingNodeManager) {
            this.workingNodeManager.updateProgress(nodeId, {
                message: 'Executing skill instructions...',
            });
        }

        // Determine which tools this skill can use
        const allowedTools = definition?.tools || [];

        // Execute via agentic executor (sub-agent pattern)
        const result = await executeAgenticTask({
            task: userMessage,
            systemPrompt,
            graph: this.graph,
            chat: this.chat,
            allowedTools,
            contextNodeIds: request.contextNodeIds,
            onProgress: (event) => {
                this._handleProgressEvent(run, nodeId, event);
            },
            maxIterations: 10,
            model: request.options?.model,
        });

        return {
            content: result.content,
            tokensUsed: result.tokensUsed,
            toolCalls: result.toolCalls?.length || 0,
            artifactNodeIds: result.createdNodeIds || [],
        };
    }

    /**
     * Execute a script-mode skill
     * @param {import('./skill-types.js').SkillRun} run - Skill run
     * @param {import('./skill-types.js').SkillDefinition} definition - Full definition
     * @param {import('./skill-types.js').SkillInvocationRequest} request - Request
     * @param {string} nodeId - Working node ID
     * @returns {Promise<Object>}
     * @private
     */
    async _executeScript(run, definition, request, nodeId) {
        if (!definition.script || !definition.scriptLanguage) {
            throw new Error('Script mode requires script and scriptLanguage');
        }

        if (this.workingNodeManager) {
            this.workingNodeManager.updateProgress(nodeId, {
                message: `Executing ${definition.scriptLanguage} script...`,
            });
        }

        if (definition.scriptLanguage === 'python') {
            return this._executePythonScript(definition.script, request, nodeId);
        } else if (definition.scriptLanguage === 'javascript') {
            return this._executeJavaScriptScript(definition.script, request, nodeId);
        } else {
            throw new Error(`Unsupported script language: ${definition.scriptLanguage}`);
        }
    }

    /**
     * Execute Python script via Pyodide
     * @param {string} script - Python code
     * @param {import('./skill-types.js').SkillInvocationRequest} request - Request
     * @param {string} nodeId - Working node ID
     * @returns {Promise<Object>}
     * @private
     */
    async _executePythonScript(script, request, nodeId) {
        // This would integrate with pyodide-runner.js
        // For now, return placeholder
        logger.warn('Python script execution not yet implemented');

        if (this.workingNodeManager) {
            this.workingNodeManager.updateProgress(nodeId, {
                message: 'Python execution via Pyodide coming soon...',
            });
        }

        return {
            content: 'Python script execution not yet implemented',
            tokensUsed: 0,
            toolCalls: 0,
        };
    }

    /**
     * Execute JavaScript script
     * @param {string} script - JavaScript code
     * @param {import('./skill-types.js').SkillInvocationRequest} request - Request
     * @param {string} nodeId - Working node ID
     * @returns {Promise<Object>}
     * @private
     */
    async _executeJavaScriptScript(script, request, nodeId) {
        // Create a sandboxed execution context
        // This is a simplified implementation - production would need more isolation
        logger.warn('JavaScript script execution is experimental');

        try {
            // Create context with limited access
            const context = {
                input: request.message,
                parameters: request.parameters || {},
                contextNodeIds: request.contextNodeIds || [],
                // Safe APIs only
                console: {
                    log: (...args) => logger.info('[Script]', ...args),
                    error: (...args) => logger.error('[Script]', ...args),
                },
            };

            // Use Function constructor for basic sandboxing
            // Note: This is NOT secure for untrusted code
            const fn = new Function(
                'context',
                `
                with (context) {
                    ${script}
                }
            `
            );

            const result = await fn(context);

            return {
                content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                tokensUsed: 0,
                toolCalls: 0,
            };
        } catch (error) {
            throw new Error(`Script execution failed: ${error.message}`);
        }
    }

    /**
     * Gather context from specified nodes
     * @param {string[]} nodeIds - Node IDs to gather context from
     * @returns {Promise<string>}
     * @private
     */
    async _gatherContext(nodeIds) {
        if (!nodeIds || nodeIds.length === 0) {
            return '';
        }

        const contents = [];
        for (const nodeId of nodeIds) {
            const node = this.graph.getNode(nodeId);
            if (node) {
                const content = node.content || '';
                const title = node.title || node.type;
                contents.push(`[${title}]\n${content}`);
            }
        }

        return contents.join('\n\n---\n\n');
    }

    /**
     * Handle progress events from skill execution
     * @param {import('./skill-types.js').SkillRun} run - Skill run
     * @param {string} nodeId - Working node ID
     * @param {Object} event - Progress event
     * @private
     */
    _handleProgressEvent(run, nodeId, event) {
        this._updateRunTrace(run, event.type, event.data);

        if (!this.workingNodeManager) return;

        switch (event.type) {
            case 'token':
            case 'token.delta':
                this.workingNodeManager.streamContent(nodeId, event.data.content || event.data);
                break;

            case 'tool.call':
            case 'tool.call.requested':
                this.workingNodeManager.updateProgress(nodeId, {
                    message: `Calling tool: ${event.data.name || event.data.tool}`,
                    toolCall: event.data,
                });
                break;

            case 'tool.result':
            case 'tool.call.completed':
                this.workingNodeManager.updateProgress(nodeId, {
                    message: `Tool completed: ${event.data.name || event.data.tool}`,
                });
                break;

            case 'progress':
            case 'progress.update':
                this.workingNodeManager.updateProgress(nodeId, {
                    message: event.data.message,
                    percentage: event.data.percentage,
                });
                break;

            default:
                logger.debug(`Unhandled progress event: ${event.type}`);
        }
    }

    /**
     * Update run trace
     * @param {import('./skill-types.js').SkillRun} run - Skill run
     * @param {string} type - Event type
     * @param {*} data - Event data
     * @private
     */
    _updateRunTrace(run, type, data) {
        if (!run.trace) run.trace = [];
        run.trace.push({
            type,
            data,
            timestamp: Date.now(),
        });
    }

    /**
     * Finalize the working node with results
     * @param {import('./skill-types.js').SkillRun} run - Skill run
     * @param {string} nodeId - Working node ID
     * @param {Object} result - Execution result
     * @private
     */
    async _finalizeNode(run, nodeId, result) {
        if (this.workingNodeManager) {
            this.workingNodeManager.finalizeNode(nodeId, {
                title: `✅ ${run.skillName}`,
                content: result.content,
                metadata: {
                    runId: run.runId,
                    skillId: run.skillId,
                    skillName: run.skillName,
                    status: 'completed',
                    completedAt: run.completedAt,
                    metrics: run.metrics,
                    trace: run.trace,
                },
            });
        } else {
            // Fallback: update node directly
            this.graph.updateNode(nodeId, {
                title: `✅ ${run.skillName}`,
                content: result.content,
                metadata: {
                    runId: run.runId,
                    skillId: run.skillId,
                    skillName: run.skillName,
                    status: 'completed',
                    completedAt: run.completedAt,
                },
            });
        }
    }

    /**
     * Cancel an active skill run
     * @param {string} runId - Run ID to cancel
     * @returns {boolean} Whether cancellation succeeded
     */
    cancel(runId) {
        const run = this.activeRuns.get(runId);
        if (!run) {
            return false;
        }

        run.status = 'cancelled';
        run.completedAt = Date.now();
        this._updateRunTrace(run, 'cancelled', {});

        // Find and update the node
        // This would need the nodeId tracked in the run
        logger.info(`Cancelled skill run: ${runId}`);

        return true;
    }

    /**
     * Get status of an active run
     * @param {string} runId - Run ID
     * @returns {import('./skill-types.js').SkillRun|null}
     */
    getRunStatus(runId) {
        return this.activeRuns.get(runId) || null;
    }

    /**
     * List all available skills (delegates to registry)
     * @param {Object} [options] - Filter options
     * @returns {import('./skill-types.js').SkillMetadata[]}
     */
    listSkills(options = {}) {
        return this.registry.listSkills(options);
    }

    /**
     * Match user input to a skill (delegates to registry)
     * @param {string} input - User input
     * @returns {Object|null} Match result
     */
    matchInput(input) {
        return this.registry.matchInput(input);
    }
}

/**
 * Create a SkillInvocationService instance
 * @param {SkillInvocationContext} context - Application context
 * @param {Object} [options] - Service options
 * @returns {SkillInvocationService}
 */
export function createSkillInvocationService(context, options = {}) {
    return new SkillInvocationService(context, options);
}

// Export for global scope (browser compatibility)
if (typeof window !== 'undefined') {
    window.SkillInvocationService = SkillInvocationService;
    window.createSkillInvocationService = createSkillInvocationService;
}
