/**
 * Reflection Agent Orchestrator
 *
 * Creates and manages reflection sub-agents that analyze branch paths
 * and synthesize insights about what happened along those paths.
 *
 * Uses the agentic approach: agent receives selected node ID and graph tools,
 * then autonomously gathers context before producing reflection.
 */

import { agentLogger as logger } from './debug-logger.js';
import { executeAgenticTask, GRAPH_TOOLS_SYSTEM_PROMPT } from './agentic-executor.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Reflection result
 * @typedef {Object} ReflectionResult
 * @property {string} reflectionRunId - Run ID for tracking
 * @property {string} synthesis - The synthesized reflection text
 * @property {Object[]} toolCalls - Tool calls made during reflection
 */

// =============================================================================
// Reflection Prompts (Agentic)
// =============================================================================

/**
 * System prompt for the reflection agent.
 * Combines task-specific instructions with the shared graph tools prompt.
 */
const REFLECTION_SYSTEM_PROMPT = `You are a reflection agent. Your task is to analyze a conversation thread and produce a CRISP, STRUCTURED reflection.

## Your Task

Follow these steps EXACTLY in order:

**Step 1:** Call \`graph:findPathToRoot\` with the selected node ID to get the conversation path.

**Step 2:** Call \`graph:getPathContent\` with the nodeIds array from Step 1 to get actual content.

**Step 3:** Write your reflection in the EXACT format below.

## Output Format

Your reflection MUST follow this exact structure:

### 🎯 Key Learnings
- [1-3 bullet points: What was learned or discovered in this conversation]

### 🧭 Direction Taken
- [1-2 bullet points: What direction/approach was chosen and why]

### 💡 Insights
- [1-2 bullet points: Non-obvious observations or patterns]

### ⚠️ Open Questions
- [0-2 bullet points: Unresolved questions or next steps, if any]

## Rules

1. **Be CRISP** - Each bullet point should be 1 sentence max
2. **Be SPECIFIC** - Reference actual content from the conversation, not generic observations
3. **No fluff** - Skip sections if there's nothing meaningful to say (except Key Learnings which is required)
4. **No node IDs** - Never mention node IDs in your output
5. **Evidence-first** - You MUST call getPathContent before writing your reflection

${GRAPH_TOOLS_SYSTEM_PROMPT}`;

/**
 * Build the user message for reflection
 * @param {string} selectedNodeId - The selected node to reflect on
 * @returns {string} User message
 */
function buildReflectionUserMessage(selectedNodeId) {
    return `Reflect on the conversation path ending at node \`${selectedNodeId}\`.

**First:** Call graph:findPathToRoot with nodeId "${selectedNodeId}"
**Then:** Call graph:getPathContent with the nodeIds you receive
**Finally:** Write your structured reflection (Key Learnings, Direction, Insights, Open Questions)

Start by calling the tool:`;
}

// =============================================================================
// Reflection Execution (Agentic)
// =============================================================================

/**
 * Execute reflection using the agentic approach.
 *
 * The agent receives the selected node ID and graph tools,
 * then autonomously gathers context before producing reflection.
 *
 * @param {Object} options - Execution options
 * @param {string} options.selectedNodeId - Selected node to reflect on
 * @param {any} options.graph - Graph instance
 * @param {any} options.chat - Chat instance for LLM calls
 * @param {string} options.model - LLM model to use
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<ReflectionResult>} Reflection result
 */
async function executeReflection(options) {
    const { selectedNodeId, graph, chat, model, onProgress } = options;

    logger.enter('executeReflection', {
        selectedNodeId: selectedNodeId.slice(0, 8),
        model,
    });
    logger.timeStart('reflectionExecution');

    try {
        if (onProgress) onProgress('Starting reflection agent...');

        // Execute using agentic approach
        const result = await executeAgenticTask({
            systemPrompt: REFLECTION_SYSTEM_PROMPT,
            userMessage: buildReflectionUserMessage(selectedNodeId),
            selectedNodeIds: [selectedNodeId],
            graph,
            chat,
            model: model || 'gpt-4',
            onProgress,
            maxToolCalls: 10,
        });

        if (!result.success) {
            throw new Error(result.error || 'Reflection failed');
        }

        logger.timeEnd('reflectionExecution');
        logger.info(`Reflection completed: ${result.content.length} characters, ${result.toolCalls.length} tool calls`);

        const runId = crypto.randomUUID();
        logger.exit('executeReflection', {
            runId,
            synthesisLength: result.content.length,
            toolCalls: result.toolCalls.length,
        });

        return {
            reflectionRunId: runId,
            synthesis: result.content,
            toolCalls: result.toolCalls,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Reflection execution failed: ${errorMessage}`);
        logger.exit('executeReflection', { error: errorMessage });
        throw error;
    }
}

// =============================================================================
// Exports
// =============================================================================

export { executeReflection, REFLECTION_SYSTEM_PROMPT };
