/**
 * Agent Types and Definitions
 *
 * Core types for the Base Agent + Sub-Agent architecture.
 * Agents are explicit execution units that transform selected nodes into new nodes.
 * Every execution is recorded as part of the graph.
 */

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Agent budget constraints
 * @typedef {Object} AgentBudgets
 * @property {number} maxTokens - Maximum tokens for LLM calls
 * @property {number} maxToolCalls - Maximum tool invocations
 * @property {number} timeoutMs - Maximum execution time in milliseconds
 */

/**
 * Human-in-the-loop policy for an agent
 * @typedef {Object} HITLPolicy
 * @property {boolean} requireApprovalForTools - Require approval before tool calls
 * @property {boolean} requireApprovalForSubagents - Require approval before spawning sub-agents
 * @property {boolean} requireApprovalForMutations - Require approval before canvas mutations
 * @property {string[]} alwaysApproveTools - Tool names that never require approval
 * @property {string[]} alwaysBlockTools - Tool names that are never allowed
 */

/**
 * Declarative specification describing what an agent is and what it is allowed to do
 * @typedef {Object} AgentDefinition
 * @property {string} id - Unique agent identifier
 * @property {string} name - Human-readable name
 * @property {string} engine - Engine adapter identifier (e.g., 'builtin', 'langchain')
 * @property {string|null} [model] - LLM model identifier (e.g., 'openai/gpt-4o'). Null uses app default.
 * @property {string} systemPrompt - System prompt for the agent
 * @property {string[]} allowedTools - List of allowed tool identifiers
 * @property {AgentBudgets} budgets - Resource constraints
 * @property {Object<string, AgentDefinition>} [subagents] - Named map of sub-agent definitions
 * @property {HITLPolicy} [hitl] - Human-in-the-loop policy rules
 * @property {string} [defaultOutputNodeType] - Default node type for artifacts (e.g., 'ai', 'research')
 * @property {string} [description] - Human-readable description
 */

/**
 * Status of an agent run
 * @typedef {'pending'|'running'|'paused'|'completed'|'failed'|'cancelled'} RunStatus
 */

/**
 * Context for an agent run - what prompted the execution
 * @typedef {Object} RunContext
 * @property {string[]} sourceNodeIds - Node IDs that triggered this run
 * @property {string} [userQuery] - User's original query/command
 * @property {string} [slashCommand] - Slash command if applicable (e.g., '/committee')
 * @property {string} [parentRunId] - Parent run ID if this is a sub-agent run
 */

/**
 * Request to start an agent run
 * @typedef {Object} RunRequest
 * @property {string} agentId - ID of the agent definition to use
 * @property {RunContext} context - Execution context
 * @property {Object} [parameters] - Additional parameters for the agent
 */

/**
 * Represents a single agent execution
 * @typedef {Object} AgentRun
 * @property {string} id - Unique run identifier
 * @property {string} agentId - Agent definition ID
 * @property {RunStatus} status - Current status
 * @property {RunContext} context - Execution context
 * @property {number} startedAt - Unix timestamp when run started
 * @property {number} [completedAt] - Unix timestamp when run completed
 * @property {AgentPlan} [plan] - Current execution plan
 * @property {AgentEvent[]} events - All events from this run
 * @property {string[]} artifactNodeIds - Node IDs of artifacts produced
 * @property {AgentMetrics} metrics - Execution metrics
 * @property {string} [error] - Error message if failed
 */

/**
 * Execution metrics for a run
 * @typedef {Object} AgentMetrics
 * @property {number} tokensUsed - Total tokens consumed
 * @property {number} toolCallsCount - Number of tool invocations
 * @property {number} subagentSpawns - Number of sub-agents spawned
 * @property {number} durationMs - Total execution time in milliseconds
 */

/**
 * Agent execution plan (visible to user)
 * @typedef {Object} AgentPlan
 * @property {string} id - Plan identifier
 * @property {string} summary - Brief description of the plan
 * @property {PlanStep[]} steps - Ordered list of planned steps
 * @property {number} currentStepIndex - Index of current step (-1 if not started)
 */

/**
 * A single step in an agent's plan
 * @typedef {Object} PlanStep
 * @property {string} id - Step identifier
 * @property {string} description - Human-readable description
 * @property {'pending'|'in-progress'|'completed'|'skipped'|'failed'} status - Step status
 * @property {string} [result] - Brief result summary when completed
 */

// =============================================================================
// Event Types
// =============================================================================

/**
 * Base event type
 * @typedef {Object} BaseEvent
 * @property {string} type - Event type identifier
 * @property {string} runId - Associated run ID
 * @property {number} timestamp - Unix timestamp
 * @property {Object} [metadata] - Additional event metadata
 */

/**
 * Run lifecycle events
 * @typedef {BaseEvent & {type: 'run.started', data: {agentId: string, context: RunContext}}} RunStartedEvent
 * @typedef {BaseEvent & {type: 'run.status', data: {status: RunStatus, message?: string}}} RunStatusEvent
 * @typedef {BaseEvent & {type: 'run.completed', data: {artifactNodeIds: string[], metrics: AgentMetrics}}} RunCompletedEvent
 * @typedef {BaseEvent & {type: 'run.failed', data: {error: string}}} RunFailedEvent
 */

/**
 * Token streaming events
 * @typedef {BaseEvent & {type: 'token.delta', data: {content: string, nodeId?: string}}} TokenDeltaEvent
 */

/**
 * Tool call events
 * @typedef {BaseEvent & {type: 'tool.call.requested', data: {toolId: string, arguments: Object, requiresApproval: boolean}}} ToolCallRequestedEvent
 * @typedef {BaseEvent & {type: 'tool.call.completed', data: {toolId: string, result: any, durationMs: number}}} ToolCallCompletedEvent
 */

/**
 * Sub-agent events
 * @typedef {BaseEvent & {type: 'subagent.spawn.requested', data: {agentId: string, context: RunContext, requiresApproval: boolean}}} SubagentSpawnRequestedEvent
 * @typedef {BaseEvent & {type: 'subagent.spawn.completed', data: {childRunId: string, agentId: string}}} SubagentSpawnCompletedEvent
 */

/**
 * Artifact events
 * @typedef {BaseEvent & {type: 'artifact.created', data: {nodeId: string, nodeType: string, content?: string}}} ArtifactCreatedEvent
 */

/**
 * Mutation events (agent proposing changes to canvas)
 * @typedef {BaseEvent & {type: 'mutation.proposed', data: {mutationType: string, payload: Object, requiresApproval: boolean}}} MutationProposedEvent
 */

/**
 * Approval events (HITL)
 * @typedef {BaseEvent & {type: 'approval.requested', data: {actionType: string, description: string, payload: Object}}} ApprovalRequestedEvent
 * @typedef {BaseEvent & {type: 'approval.resolved', data: {actionType: string, approved: boolean, reason?: string}}} ApprovalResolvedEvent
 */

/**
 * Plan events
 * @typedef {BaseEvent & {type: 'plan.created', data: {plan: AgentPlan}}} PlanCreatedEvent
 * @typedef {BaseEvent & {type: 'plan.updated', data: {plan: AgentPlan, stepIndex: number}}} PlanUpdatedEvent
 */

/**
 * Progress events (heartbeat for long-running runs)
 * @typedef {BaseEvent & {type: 'progress.update', data: {message: string, phase?: string, percent?: number}}} ProgressUpdateEvent
 */

/**
 * Rationale events (brief explanations)
 * @typedef {BaseEvent & {type: 'rationale.note', data: {note: string}}} RationaleNoteEvent
 */

/**
 * Scratchpad events (structured notes, hidden by default)
 * @typedef {BaseEvent & {type: 'scratchpad.created', data: {content: string, format?: 'text'|'json'|'markdown', visible?: boolean}}} ScratchpadCreatedEvent
 */

/**
 * Union of all event types
 * @typedef {RunStartedEvent|RunStatusEvent|RunCompletedEvent|RunFailedEvent|TokenDeltaEvent|ToolCallRequestedEvent|ToolCallCompletedEvent|SubagentSpawnRequestedEvent|SubagentSpawnCompletedEvent|ArtifactCreatedEvent|MutationProposedEvent|ApprovalRequestedEvent|ApprovalResolvedEvent|PlanCreatedEvent|PlanUpdatedEvent|ProgressUpdateEvent|RationaleNoteEvent|ScratchpadCreatedEvent} AgentEvent
 */

// =============================================================================
// Event Type Constants
// =============================================================================

/**
 * Event type identifiers
 * @type {Object<string, string>}
 */
const EventType = {
    // Run lifecycle
    RUN_STARTED: 'run.started',
    RUN_STATUS: 'run.status',
    RUN_COMPLETED: 'run.completed',
    RUN_FAILED: 'run.failed',

    // Token streaming
    TOKEN_DELTA: 'token.delta',

    // Tool calls
    TOOL_CALL_REQUESTED: 'tool.call.requested',
    TOOL_CALL_COMPLETED: 'tool.call.completed',

    // Sub-agents
    SUBAGENT_SPAWN_REQUESTED: 'subagent.spawn.requested',
    SUBAGENT_SPAWN_COMPLETED: 'subagent.spawn.completed',

    // Artifacts
    ARTIFACT_CREATED: 'artifact.created',

    // Mutations
    MUTATION_PROPOSED: 'mutation.proposed',

    // Approvals (HITL)
    APPROVAL_REQUESTED: 'approval.requested',
    APPROVAL_RESOLVED: 'approval.resolved',

    // Plans and progress
    PLAN_CREATED: 'plan.created',
    PLAN_UPDATED: 'plan.updated',
    PROGRESS_UPDATE: 'progress.update',
    RATIONALE_NOTE: 'rationale.note',

    // Scratchpad (hidden working memory)
    SCRATCHPAD_CREATED: 'scratchpad.created',
};

/**
 * Run status values
 * @type {Object<string, RunStatus>}
 */
const RunStatusType = {
    PENDING: 'pending',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
};

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default agent budgets
 * @param {Partial<AgentBudgets>} [overrides={}] - Optional overrides
 * @returns {AgentBudgets}
 */
function createDefaultBudgets(overrides = {}) {
    return {
        maxTokens: 100000,
        maxToolCalls: 20,
        timeoutMs: 300000, // 5 minutes
        ...overrides,
    };
}

/**
 * Create default HITL policy
 * @param {Partial<HITLPolicy>} [overrides={}] - Optional overrides
 * @returns {HITLPolicy}
 */
function createDefaultHITLPolicy(overrides = {}) {
    return {
        requireApprovalForTools: false,
        requireApprovalForSubagents: false,
        requireApprovalForMutations: true, // Safe default: approve mutations
        alwaysApproveTools: [],
        alwaysBlockTools: [],
        ...overrides,
    };
}

/**
 * Create an agent definition
 * @param {Object} config - Agent configuration
 * @param {string} config.id - Unique agent identifier
 * @param {string} config.name - Human-readable name
 * @param {string} [config.model] - LLM model identifier (optional, defaults to app-level model)
 * @param {string} config.systemPrompt - System prompt
 * @param {string[]} [config.allowedTools=[]] - Allowed tools
 * @param {string} [config.engine='builtin'] - Engine adapter
 * @param {Partial<AgentBudgets>} [config.budgets] - Budget overrides
 * @param {Object<string, AgentDefinition>} [config.subagents] - Sub-agent definitions
 * @param {Partial<HITLPolicy>} [config.hitl] - HITL policy overrides
 * @param {string} [config.defaultOutputNodeType='ai'] - Default output node type
 * @param {string} [config.description] - Description
 * @returns {AgentDefinition}
 */
function createAgentDefinition(config) {
    return {
        id: config.id,
        name: config.name,
        engine: config.engine || 'builtin',
        model: config.model || null, // null = use app-level default model
        systemPrompt: config.systemPrompt,
        allowedTools: config.allowedTools || [],
        budgets: createDefaultBudgets(config.budgets),
        subagents: config.subagents || {},
        hitl: createDefaultHITLPolicy(config.hitl),
        defaultOutputNodeType: config.defaultOutputNodeType || 'ai',
        description: config.description || '',
    };
}

/**
 * Create a run context
 * @param {Object} config - Context configuration
 * @param {string[]} config.sourceNodeIds - Source node IDs
 * @param {string} [config.userQuery] - User query
 * @param {string} [config.slashCommand] - Slash command
 * @param {string} [config.parentRunId] - Parent run ID
 * @returns {RunContext}
 */
function createRunContext(config) {
    return {
        sourceNodeIds: config.sourceNodeIds || [],
        userQuery: config.userQuery || null,
        slashCommand: config.slashCommand || null,
        parentRunId: config.parentRunId || null,
    };
}

/**
 * Create a run request
 * @param {string} agentId - Agent definition ID
 * @param {RunContext} context - Run context
 * @param {Object} [parameters={}] - Additional parameters
 * @returns {RunRequest}
 */
function createRunRequest(agentId, context, parameters = {}) {
    return {
        agentId,
        context,
        parameters,
    };
}

/**
 * Create initial agent run state
 * @param {string} runId - Run ID
 * @param {string} agentId - Agent definition ID
 * @param {RunContext} context - Run context
 * @returns {AgentRun}
 */
function createAgentRun(runId, agentId, context) {
    return {
        id: runId,
        agentId,
        status: RunStatusType.PENDING,
        context,
        startedAt: Date.now(),
        completedAt: null,
        plan: null,
        events: [],
        artifactNodeIds: [],
        metrics: {
            tokensUsed: 0,
            toolCallsCount: 0,
            subagentSpawns: 0,
            durationMs: 0,
        },
        error: null,
    };
}

/**
 * Create a plan step
 * @param {string} description - Step description
 * @param {string} [id] - Optional step ID
 * @returns {PlanStep}
 */
function createPlanStep(description, id = null) {
    return {
        id: id || crypto.randomUUID(),
        description,
        status: 'pending',
        result: null,
    };
}

/**
 * Create an agent plan
 * @param {string} summary - Plan summary
 * @param {PlanStep[]} steps - Plan steps
 * @returns {AgentPlan}
 */
function createAgentPlan(summary, steps) {
    return {
        id: crypto.randomUUID(),
        summary,
        steps,
        currentStepIndex: -1,
    };
}

/**
 * Create an event
 * @param {string} type - Event type
 * @param {string} runId - Run ID
 * @param {Object} data - Event data
 * @param {Object} [metadata={}] - Optional metadata
 * @returns {BaseEvent}
 */
function createEvent(type, runId, data, metadata = {}) {
    return {
        type,
        runId,
        timestamp: Date.now(),
        data,
        metadata,
    };
}

// =============================================================================
// Exports
// =============================================================================

export {
    EventType,
    RunStatusType,
    createDefaultBudgets,
    createDefaultHITLPolicy,
    createAgentDefinition,
    createRunContext,
    createRunRequest,
    createAgentRun,
    createPlanStep,
    createAgentPlan,
    createEvent,
};
