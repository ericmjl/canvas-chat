/**
 * Skill Types for Canvas Chat
 *
 * Defines the type system for the Codex-style skills architecture.
 * Skills are discovered from SKILL.md files and can be:
 * - Instruction-based (LLM interprets natural language instructions)
 * - Script-based (Python/JS executed via Pyodide/eval)
 *
 * Progressive disclosure pattern:
 * - SkillMetadata: Lightweight info for listing (name, description, triggers)
 * - SkillDefinition: Full spec loaded on-demand (includes instructions/script)
 *
 * @module agent/skill-types
 */

/**
 * Permission levels for skill capabilities
 * @typedef {'none'|'read'|'write'|'execute'|'admin'} PermissionLevel
 */

/**
 * Capability categories that skills can request
 * @typedef {'graph'|'canvas'|'storage'|'network'|'code'|'files'|'llm'} CapabilityCategory
 */

/**
 * Single capability permission
 * @typedef {Object} CapabilityPermission
 * @property {CapabilityCategory} category - The capability category
 * @property {PermissionLevel} level - Required permission level
 * @property {string} [reason] - Why this permission is needed (for HITL prompts)
 */

/**
 * Skill permissions configuration
 * @typedef {Object} SkillPermissions
 * @property {CapabilityPermission[]} capabilities - Required capabilities
 * @property {boolean} [requiresApproval] - Whether HITL approval is needed before execution
 * @property {string[]} [allowedTools] - Explicit list of allowed tool names (whitelist)
 * @property {string[]} [deniedTools] - Explicit list of denied tool names (blacklist)
 * @property {number} [maxTokens] - Maximum tokens this skill can consume
 * @property {number} [timeoutMs] - Maximum execution time in milliseconds
 */

/**
 * @type {SkillPermissions}
 */
export const DEFAULT_SKILL_PERMISSIONS = {
    capabilities: [{ category: 'graph', level: 'read' }],
    requiresApproval: false,
    allowedTools: [],
    deniedTools: [],
    maxTokens: 4096,
    timeoutMs: 60000,
};

/**
 * Skill execution mode
 * @typedef {'instruction'|'script'} SkillExecutionMode
 */

/**
 * Skill parameter definition (for parameterized skills)
 * @typedef {Object} SkillParameter
 * @property {string} name - Parameter name
 * @property {string} type - Parameter type ('string'|'number'|'boolean'|'array'|'object')
 * @property {string} description - Parameter description
 * @property {boolean} [required] - Whether the parameter is required
 * @property {*} [default] - Default value if not provided
 * @property {*[]} [enum] - Allowed values for enum types
 */

/**
 * Trigger patterns for automatic skill invocation
 * @typedef {Object} SkillTrigger
 * @property {'command'|'pattern'|'event'|'tool'} type - Trigger type
 * @property {string} value - Trigger value (command name, regex pattern, event type, tool name)
 * @property {number} [priority] - Priority for pattern matching (higher = checked first)
 */

/**
 * Lightweight skill metadata for listing and selection
 * This is what SkillRegistry stores and returns for skill discovery.
 *
 * @typedef {Object} SkillMetadata
 * @property {string} id - Unique skill identifier (derived from filename or explicit)
 * @property {string} name - Human-readable skill name
 * @property {string} description - Brief description of what the skill does
 * @property {string} version - Semantic version string
 * @property {string[]} tags - Categorization tags for filtering
 * @property {SkillTrigger[]} triggers - How this skill can be invoked
 * @property {SkillExecutionMode} mode - 'instruction' or 'script'
 * @property {SkillPermissions} permissions - Required permissions
 * @property {string} source - Path to SKILL.md file
 * @property {string} [icon] - Emoji or icon identifier
 * @property {boolean} [builtin] - Whether this is a built-in skill
 */

/**
 * Full skill definition loaded on-demand
 * Extends metadata with the actual instructions/script content.
 *
 * @typedef {Object} SkillDefinition
 * @property {string} id - Unique skill identifier
 * @property {string} name - Human-readable skill name
 * @property {string} description - Brief description
 * @property {string} version - Semantic version
 * @property {string[]} tags - Categorization tags
 * @property {SkillTrigger[]} triggers - Invocation triggers
 * @property {SkillExecutionMode} mode - Execution mode
 * @property {SkillPermissions} permissions - Required permissions
 * @property {string} source - Path to SKILL.md
 * @property {string} [icon] - Emoji or icon
 * @property {boolean} [builtin] - Built-in flag
 *
 * @property {string} [instructions] - Natural language instructions (for mode='instruction')
 * @property {string} [script] - Executable code (for mode='script')
 * @property {string} [scriptLanguage] - 'python' or 'javascript' (for script mode)
 * @property {SkillParameter[]} [parameters] - Input parameters
 * @property {string} [systemPrompt] - Custom system prompt override
 * @property {string[]} [tools] - Specific tools this skill can use
 * @property {string} [outputFormat] - Expected output format description
 */

/**
 * Skill execution status
 * @typedef {'pending'|'running'|'waiting_approval'|'completed'|'failed'|'cancelled'} SkillRunStatus
 */

/**
 * Skill run record (stored in SKILL_RUN nodes)
 * @typedef {Object} SkillRun
 * @property {string} runId - Unique run identifier
 * @property {string} skillId - ID of the skill being executed
 * @property {string} skillName - Name of the skill (for display)
 * @property {SkillRunStatus} status - Current execution status
 * @property {number} startedAt - Timestamp when run started
 * @property {number} [completedAt] - Timestamp when run completed
 *
 * @property {Object} [input] - Input data for this run
 * @property {string} [input.message] - User message that triggered the run
 * @property {Object} [input.parameters] - Resolved parameters
 * @property {string[]} [input.contextNodeIds] - Node IDs providing context
 *
 * @property {Object} [output] - Output from the run
 * @property {*} [output.result] - Main result value
 * @property {string[]} [output.artifactNodeIds] - Created artifact node IDs
 * @property {Object} [output.metadata] - Additional metadata
 *
 * @property {Object[]} [trace] - Execution trace for debugging
 * @property {string} trace[].type - Event type
 * @property {*} trace[].data - Event data
 * @property {number} trace[].timestamp - Event timestamp
 *
 * @property {string} [error] - Error message if failed
 * @property {string} [errorStack] - Error stack trace
 *
 * @property {Object} [metrics] - Performance metrics
 * @property {number} [metrics.tokensUsed] - Total tokens consumed
 * @property {number} [metrics.durationMs] - Total execution time
 * @property {number} [metrics.toolCalls] - Number of tool calls made
 */

/**
 * Skill invocation request
 * @typedef {Object} SkillInvocationRequest
 * @property {string} skillId - ID of skill to invoke
 * @property {string} [message] - User message (for instruction mode)
 * @property {Object} [parameters] - Explicit parameters (for script mode)
 * @property {string[]} [contextNodeIds] - Nodes to include as context
 * @property {string} [parentNodeId] - Node to attach results to
 * @property {boolean} [skipApproval] - Skip HITL approval even if required
 * @property {Object} [options] - Additional options
 * @property {number} [options.maxTokens] - Override max tokens
 * @property {number} [options.timeoutMs] - Override timeout
 * @property {string} [options.model] - Override LLM model
 */

/**
 * Skill invocation result
 * @typedef {Object} SkillInvocationResult
 * @property {boolean} success - Whether the invocation succeeded
 * @property {string} runId - ID of the skill run
 * @property {string} nodeId - ID of the created SKILL_RUN node
 * @property {*} [result] - Main result value
 * @property {string[]} [artifactNodeIds] - IDs of created artifact nodes
 * @property {string} [error] - Error message if failed
 * @property {Object} [metrics] - Performance metrics
 */

/**
 * Create default skill metadata object
 * @param {Partial<SkillMetadata>} overrides - Properties to override
 * @returns {SkillMetadata}
 */
export function createSkillMetadata(overrides = {}) {
    return {
        id: overrides.id || `skill-${Date.now()}`,
        name: overrides.name || 'Unnamed Skill',
        description: overrides.description || '',
        version: overrides.version || '1.0.0',
        tags: overrides.tags || [],
        triggers: overrides.triggers || [],
        mode: overrides.mode || 'instruction',
        permissions: { ...DEFAULT_SKILL_PERMISSIONS, ...overrides.permissions },
        source: overrides.source || '',
        icon: overrides.icon,
        builtin: overrides.builtin || false,
    };
}

/**
 * Create default skill definition object
 * @param {Partial<SkillDefinition>} overrides - Properties to override
 * @returns {SkillDefinition}
 */
export function createSkillDefinition(overrides = {}) {
    return {
        ...createSkillMetadata(overrides),
        instructions: overrides.instructions,
        script: overrides.script,
        scriptLanguage: overrides.scriptLanguage,
        parameters: overrides.parameters || [],
        systemPrompt: overrides.systemPrompt,
        tools: overrides.tools,
        outputFormat: overrides.outputFormat,
    };
}

/**
 * Create a skill run record
 * @param {Object} options - Run options
 * @param {string} options.skillId - ID of the skill
 * @param {string} options.skillName - Name of the skill
 * @param {Object} [options.input] - Input data
 * @returns {SkillRun}
 */
export function createSkillRun(options) {
    return {
        runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        skillId: options.skillId,
        skillName: options.skillName,
        status: 'pending',
        startedAt: Date.now(),
        input: options.input || {},
        trace: [],
    };
}

/**
 * Create a skill invocation request
 * @param {Object} options - Request options
 * @param {string} options.skillId - ID of skill to invoke
 * @param {string} [options.message] - User message
 * @param {Object} [options.parameters] - Parameters
 * @param {string[]} [options.contextNodeIds] - Context nodes
 * @param {string} [options.parentNodeId] - Parent node
 * @returns {SkillInvocationRequest}
 */
export function createSkillInvocationRequest(options) {
    return {
        skillId: options.skillId,
        message: options.message,
        parameters: options.parameters,
        contextNodeIds: options.contextNodeIds || [],
        parentNodeId: options.parentNodeId,
        skipApproval: options.skipApproval || false,
        options: options.options || {},
    };
}

// Export for global scope (browser compatibility)
if (typeof window !== 'undefined') {
    window.SkillTypes = {
        DEFAULT_SKILL_PERMISSIONS,
        createSkillMetadata,
        createSkillDefinition,
        createSkillRun,
        createSkillInvocationRequest,
    };
}
