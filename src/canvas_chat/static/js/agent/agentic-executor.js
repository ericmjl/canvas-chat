/**
 * Agentic Executor
 *
 * Provides a tool-using agentic loop for sub-agents.
 * Instead of pre-constructing context, agents receive:
 * - Selected node ID(s)
 * - Graph tools to autonomously gather context
 * - Their specific task description
 *
 * The agent then uses tools iteratively to gather what it needs
 * before producing its final output.
 *
 * @module agentic-executor
 */

import { createComponentLogger } from './debug-logger.js';
import { getGraphToolDefinitions } from './graph-tools.js';
import { readSSEStream } from '../sse.js';

const logger = createComponentLogger('AgenticExecutor');

// =============================================================================
// Standard System Prompt for Graph Tools
// =============================================================================

/**
 * Standard system prompt explaining graph tools.
 * Sub-agents should prepend their task-specific instructions and append this.
 * This ensures all sub-agents know how to gather context from the graph.
 */
const GRAPH_TOOLS_SYSTEM_PROMPT = `
## Available Graph Tools

You have access to tools for exploring the conversation graph structure. Use these to gather the context you need:

### Navigation Tools
- \`graph:findPathToRoot\` - Find the path from a node back to a branch point or root
  - Parameters: \`nodeId\` (required), \`stopAtBranchPoint\` (optional, default true)
  - Returns: Array of node IDs from the node back toward root

- \`graph:getRelatedNodes\` - Get parent or child nodes of a given node
  - Parameters: \`nodeId\` (required), \`direction\` ('parents' | 'children')
  - Returns: Array of related node IDs

- \`graph:checkBranchPoint\` - Check if a node is a branch point (has multiple children)
  - Parameters: \`nodeId\` (required)
  - Returns: { isBranchPoint, childCount }

### Content Tools
- \`graph:getNodeContent\` - Get the full content and metadata of a specific node
  - Parameters: \`nodeId\` (required)
  - Returns: { nodeId, type, content, metadata }

- \`graph:getPathContent\` - Get content from multiple nodes along a path
  - Parameters: \`nodeIds\` (required, array of node IDs)
  - Returns: Array of { nodeId, type, content } for each node

### Search Tools
- \`graph:findNodesByType\` - Find all nodes of a specific type
  - Parameters: \`nodeType\` (required), \`limit\` (optional, default 20)
  - Returns: Array of node IDs matching the type

- \`graph:getPreviousReflections\` - Find previous reflection nodes in the graph
  - Parameters: \`limit\` (optional, default 5)
  - Returns: Array of reflection node summaries

## How to Use Tools

Use the tool-calling interface to invoke tools directly whenever you need context.
You may call multiple tools in sequence to gather what you need before answering.

**Important:** Do NOT output JSON blocks or describe your intent. Just call the tools.

## Workflow

1. **Start with the selected node(s)** - You'll be given node ID(s) to work with
2. **Call tools to explore** - Output a \`\`\`json code block with tool_calls to gather information
3. **Review results** - I'll provide tool results, then you can call more tools or proceed
4. **Complete your task** - When you have enough context, produce your final answer (WITHOUT any tool_calls JSON)

**REMINDER:** Call tools directly via the tool-calling interface. Do not output JSON blocks.
`;

const LEGACY_TOOL_CALLS_PROMPT = `
## Legacy Tool Calling (JSON Only)

If you cannot call tools directly, output a JSON code block like this:

\`\`\`json
{"tool_calls": [{"name": "graph:getNodeContent", "arguments": {"nodeId": "abc123"}}]}
\`\`\`

Do NOT describe intent. Output ONLY the JSON block for tool calls.
`;

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * @typedef {Object} AgenticExecutionOptions
 * @property {string} systemPrompt - System prompt for the agent
 * @property {string} userMessage - User message/task description
 * @property {string[]} selectedNodeIds - Selected node IDs for context
 * @property {any} graph - Graph instance for tools
 * @property {any} chat - Chat instance for LLM calls
 * @property {string} model - LLM model to use
 * @property {Function} [onProgress] - Progress callback
 * @property {Function} [onToken] - Token callback for streaming updates
 * @property {Function} [onTool] - Tool callback for tool usage updates
 * @property {number} [maxToolCalls=10] - Maximum tool call iterations
 * @property {string[]} [allowedTools] - Optional allowlist of tool IDs
 */

/**
 * @typedef {Object} AgenticExecutionResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} content - Final agent response
 * @property {Object[]} toolCalls - Tool calls made during execution
 * @property {string} [error] - Error message if failed
 */

// =============================================================================
// Agentic Execution
// =============================================================================

/**
 * Build the graph tools context message
 * @param {string[]} selectedNodeIds - Selected node IDs
 * @param tools
 * @returns {string} Context message for the agent
 */
function buildGraphToolsContextMessage(selectedNodeIds, tools = null) {
    const parts = [];

    parts.push(`## Available Context`);
    parts.push(`You have been invoked with the following selected node(s):`);

    for (const nodeId of selectedNodeIds) {
        parts.push(`- Node ID: \`${nodeId}\``);
    }

    parts.push(``);
    parts.push(`## Available Tools`);
    parts.push(`You have access to graph tools to explore the conversation structure:`);

    if (Array.isArray(tools) && tools.length > 0) {
        for (const tool of tools) {
            parts.push(`- \`${tool.id}\` - ${tool.description}`);
        }
    } else {
        parts.push(`- \`graph:getNodeContent\` - Get content/metadata of a specific node`);
        parts.push(`- \`graph:findPathToRoot\` - Find the path from a node back to a branch point`);
        parts.push(`- \`graph:getPathContent\` - Get content from multiple nodes along a path`);
        parts.push(`- \`graph:getRelatedNodes\` - Get parent or child nodes of a given node`);
        parts.push(`- \`graph:checkBranchPoint\` - Check if a node is a branch point`);
        parts.push(`- \`graph:getPreviousReflections\` - Find previous reflection nodes`);
        parts.push(`- \`graph:findNodesByType\` - Find nodes of a specific type`);
    }
    parts.push(``);
    parts.push(`**Start by using these tools to gather the context you need, then complete your task.**`);

    return parts.join('\n');
}

// =============================================================================
// OpenAI Agents SDK Execution
// =============================================================================

/**
 * Execute an agentic task via the backend OpenAI Agents SDK.
 * @param {AgenticExecutionOptions} options
 * @returns {Promise<AgenticExecutionResult>}
 */
async function executeAgenticTaskWithSDK(options) {
    const {
        systemPrompt,
        userMessage,
        selectedNodeIds,
        graph,
        chat,
        model,
        onProgress,
        onToken,
        onTool,
        maxToolCalls = 10,
        allowedTools,
    } = options;

    if (!graph?.toJSON) {
        throw new Error('Graph instance is required for agentic execution');
    }
    if (!chat) {
        throw new Error('Chat instance is required for agentic execution');
    }

    let graphTools = getGraphToolDefinitions(graph);
    if (Array.isArray(allowedTools)) {
        const normalized = allowedTools.map((tool) => String(tool || '').trim()).filter(Boolean);
        if (normalized.length === 0) {
            graphTools = [];
        } else if (!normalized.includes('*')) {
            const allowedSet = new Set(normalized);
            graphTools = graphTools.filter((tool) => allowedSet.has(tool.id));
        }
    }
    const contextMessage = buildGraphToolsContextMessage(selectedNodeIds, graphTools);
    const combinedUserMessage = `${contextMessage}\n\n---\n\n${userMessage}`;

    if (onProgress) {
        onProgress('Preparing context...');
    }

    let apiKey = null;
    if (model?.startsWith('github_copilot/')) {
        apiKey = await chat.ensureCopilotAuthFresh(model);
    } else {
        apiKey = chat.getApiKeyForModel(model);
    }

    const baseUrl =
        (typeof chat.getBaseUrlForModel === 'function' ? chat.getBaseUrlForModel(model) : null) || chat.getBaseUrl();

    const payload = {
        system_prompt: systemPrompt || '',
        user_message: combinedUserMessage || '',
        selected_node_ids: selectedNodeIds || [],
        graph_snapshot: graph.toJSON(),
        model: model || '',
        api_key: apiKey,
        base_url: baseUrl,
        max_tool_calls: maxToolCalls,
        allowed_tools: allowedTools || [],
    };

    if (onProgress) {
        onProgress('Submitting agent request...');
    }

    const streamResponse = await fetch('/api/agents/run/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (streamResponse.ok && streamResponse.headers.get('content-type')?.includes('text/event-stream')) {
        if (onProgress) {
            onProgress('Streaming agent response...');
        }

        let fullContent = '';
        const toolCalls = [];

        await readSSEStream(streamResponse, {
            onEvent: (eventType, data) => {
                if (eventType === 'message' && data) {
                    fullContent += data;
                    if (onToken) onToken(data, fullContent);
                } else if (eventType === 'progress' && data) {
                    if (onProgress) onProgress(data);
                } else if (eventType === 'tool' && data) {
                    try {
                        const toolCall = JSON.parse(data);
                        toolCalls.push(toolCall);
                        if (onTool) onTool(toolCall);
                    } catch (e) {
                        console.warn('[AgenticExecutor] Failed to parse tool event', e);
                    }
                } else if (eventType === 'done' && data) {
                    try {
                        const payload = JSON.parse(data);
                        if (Array.isArray(payload.tool_calls)) {
                            for (const toolCall of payload.tool_calls) {
                                toolCalls.push(toolCall);
                                if (onTool) onTool(toolCall);
                            }
                        }
                    } catch (e) {
                        console.warn('[AgenticExecutor] Failed to parse done payload', e);
                    }
                }
            },
            onError: (err) => {
                throw err;
            },
        });

        return {
            success: true,
            content: fullContent,
            toolCalls: toolCalls,
        };
    }

    if (onProgress) {
        onProgress('Awaiting agent response...');
    }

    const response = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
        const errorMessage = data?.error || `Agent run failed (status ${response.status})`;
        throw new Error(errorMessage);
    }

    if (onProgress) {
        onProgress('Finalizing response...');
    }

    return {
        success: true,
        content: data.content || '',
        toolCalls: data.tool_calls || [],
    };
}

/**
 * Execute an agentic task with tool support.
 *
 * The agent receives selected node IDs and graph tools,
 * then autonomously gathers context before producing output.
 *
 * @param {AgenticExecutionOptions} options - Execution options
 * @returns {Promise<AgenticExecutionResult>}
 */
async function executeAgenticTaskLegacy(options) {
    const {
        systemPrompt,
        userMessage,
        selectedNodeIds,
        graph,
        chat,
        model,
        onProgress,
        maxToolCalls = 10,
        allowedTools,
    } = options;

    const legacySystemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${LEGACY_TOOL_CALLS_PROMPT}`
        : LEGACY_TOOL_CALLS_PROMPT;

    logger.enter('executeAgenticTask', {
        selectedNodeIds,
        model,
        maxToolCalls,
    });

    // Get graph tool definitions
    let graphTools = getGraphToolDefinitions(graph);
    if (Array.isArray(allowedTools)) {
        const normalized = allowedTools.map((tool) => String(tool || '').trim()).filter(Boolean);
        if (normalized.length === 0) {
            graphTools = [];
        } else if (!normalized.includes('*')) {
            const allowedSet = new Set(normalized);
            graphTools = graphTools.filter((tool) => allowedSet.has(tool.id));
        }
    }
    const toolMap = new Map(graphTools.map((t) => [t.id, t]));

    // Format tools for LLM (OpenAI format)
    const llmTools = graphTools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.id,
            description: tool.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    tool.parameters.map((p) => [
                        p.name,
                        {
                            type: p.type,
                            description: p.description,
                            ...(p.default !== undefined ? { default: p.default } : {}),
                        },
                    ])
                ),
                required: tool.parameters.filter((p) => p.required).map((p) => p.name),
            },
        },
    }));

    // Build initial messages
    const contextMessage = buildGraphToolsContextMessage(selectedNodeIds, graphTools);
    const messages = [
        { role: 'system', content: legacySystemPrompt },
        { role: 'user', content: `${contextMessage}\n\n---\n\n${userMessage}` },
    ];

    const toolCallHistory = [];
    let iteration = 0;

    try {
        // Agentic loop
        while (iteration < maxToolCalls) {
            iteration++;
            logger.debug(`Agentic iteration ${iteration}/${maxToolCalls}`);
            console.log(`[AgenticExecutor] Iteration ${iteration}/${maxToolCalls}`);

            if (onProgress) {
                onProgress(`Thinking... (iteration ${iteration})`);
            }

            // Call LLM with tools
            const response = await callLLMWithTools(chat, messages, model, llmTools);
            console.log(
                `[AgenticExecutor] LLM response:`,
                response.content?.slice(0, 200),
                'toolCalls:',
                response.toolCalls?.length || 0
            );

            // Check if we have tool calls
            if (response.toolCalls && response.toolCalls.length > 0) {
                // Add assistant message with the response
                messages.push({
                    role: 'assistant',
                    content: response.content || 'I will use tools to gather information.',
                });

                // Process each tool call and collect results
                const toolResults = [];
                for (const toolCall of response.toolCalls) {
                    const toolId = toolCall.function.name;
                    let toolArgs;
                    try {
                        toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                    } catch (e) {
                        toolArgs = toolCall.function.arguments || {};
                    }

                    logger.debug(`Tool call: ${toolId}`, toolArgs);
                    console.log(`[AgenticExecutor] Tool call: ${toolId}`, toolArgs);

                    if (onProgress) {
                        onProgress(`Using tool: ${toolId}`);
                    }

                    // Get tool handler
                    const tool = toolMap.get(toolId);
                    if (!tool) {
                        const errorResult = { success: false, error: `Tool not found: ${toolId}` };
                        toolResults.push({ toolId, result: errorResult });
                        toolCallHistory.push({ toolId, args: toolArgs, result: errorResult });
                        continue;
                    }

                    // Execute tool
                    const toolResult = tool.handler(toolArgs);
                    toolResults.push({ toolId, result: toolResult });
                    toolCallHistory.push({ toolId, args: toolArgs, result: toolResult });
                }

                // Add tool results as a user message so the model can see them
                const resultsText = toolResults
                    .map(
                        ({ toolId, result }) =>
                            `**Tool: ${toolId}**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
                    )
                    .join('\n\n');

                messages.push({
                    role: 'user',
                    content: `Here are the tool results:\n\n${resultsText}\n\n**Next step:** If you need to call another tool, output a JSON code block with tool_calls. Do NOT say "I will call..." - output the actual JSON. If you have all the information you need, write your final answer without any JSON.`,
                });
            } else {
                // No tool calls detected - check if model described intent instead of outputting JSON
                const content = response.content || '';
                const describesIntent =
                    /\b(I will|I'll|Let me|I'm going to|I need to)\b.*\b(call|use|invoke|get|retrieve)\b/i.test(
                        content
                    );

                if (describesIntent && iteration < maxToolCalls - 1) {
                    // Model described what it wants to do instead of doing it
                    logger.debug('Model described intent without JSON, prompting again');
                    console.log('[AgenticExecutor] Model described intent without JSON, prompting again');

                    messages.push({
                        role: 'assistant',
                        content: content,
                    });
                    messages.push({
                        role: 'user',
                        content: `You described what you want to do, but you need to actually output the JSON tool call. Output ONLY the JSON block like this:\n\n\`\`\`json\n{"tool_calls": [{"name": "graph:getPathContent", "arguments": {"nodeIds": ["id1", "id2"]}}]}\n\`\`\`\n\nDo it now - output the JSON:`,
                    });
                    continue;
                }

                // Agent is truly done
                logger.info(`Agent completed after ${iteration} iterations`);
                console.log(`[AgenticExecutor] Agent completed after ${iteration} iterations`);

                logger.exit('executeAgenticTask', {
                    success: true,
                    contentLength: response.content?.length || 0,
                    toolCalls: toolCallHistory.length,
                });

                return {
                    success: true,
                    content: response.content || '',
                    toolCalls: toolCallHistory,
                };
            }
        }

        // Max iterations reached
        logger.warn(`Max tool call iterations (${maxToolCalls}) reached`);

        // Make one final call without tools to get a response
        const finalResponse = await callLLMWithTools(chat, messages, model, []);

        logger.exit('executeAgenticTask', {
            success: true,
            contentLength: finalResponse.content?.length || 0,
            toolCalls: toolCallHistory.length,
            maxIterationsReached: true,
        });

        return {
            success: true,
            content: finalResponse.content || '',
            toolCalls: toolCallHistory,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Agentic execution failed: ${errorMessage}`);

        logger.exit('executeAgenticTask', { success: false, error: errorMessage });

        return {
            success: false,
            content: '',
            toolCalls: toolCallHistory,
            error: errorMessage,
        };
    }
}

/**
 * Execute an agentic task. Prefers the backend OpenAI Agents SDK with
 * a legacy JSON-tool fallback if the backend is unavailable.
 *
 * @param {AgenticExecutionOptions} options
 * @returns {Promise<AgenticExecutionResult>}
 */
export async function executeAgenticTask(options) {
    try {
        return await executeAgenticTaskWithSDK(options);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Agents SDK execution failed, falling back to legacy loop: ${errorMessage}`);
        if (typeof options.onProgress === 'function') {
            options.onProgress('Falling back to legacy agent loop...');
        }
        return await executeAgenticTaskLegacy(options);
    }
}

// =============================================================================
// LLM Integration
// =============================================================================

/**
 * Call LLM with tool support
 *
 * @param {any} chat - Chat instance
 * @param {Object[]} messages - Message history
 * @param {string} model - Model to use
 * @param {Object[]} tools - Tools in OpenAI format
 * @returns {Promise<{content: string|null, toolCalls: Object[]|null}>}
 */
async function callLLMWithTools(chat, messages, model, tools) {
    logger.debug('Calling LLM with tools', { messageCount: messages.length, toolCount: tools.length });

    return new Promise((resolve, reject) => {
        let content = '';

        // Use chat.sendMessage - the standard API
        // Note: Tool calling will be simulated by the agent since sendMessage
        // doesn't support tools directly. The agent will generate tool calls
        // in its response content which we'll parse.
        chat.sendMessage(
            messages,
            model,
            // onChunk
            (chunk) => {
                content += chunk;
            },
            // onDone
            (finalContent) => {
                // Parse tool calls from response if present
                // The model may include tool_calls in JSON format
                const parsed = parseToolCallsFromContent(finalContent);
                resolve({
                    content: parsed.content,
                    toolCalls: parsed.toolCalls,
                });
            },
            // onError
            (error) => {
                reject(error);
            }
        );
    });
}

/**
 * Parse tool calls from LLM response content.
 * Models may respond with tool calls in various formats.
 *
 * @param {string} content - LLM response content
 * @returns {{content: string, toolCalls: Object[]|null}}
 */
function parseToolCallsFromContent(content) {
    // Check for tool calls in OpenAI function call format
    // Look for patterns like: {"tool_calls": [...]} or ```json\n{"tool_calls": [...]}

    // Helper to format tool calls into standard format
    const formatToolCalls = (parsed) => {
        if (!parsed.tool_calls || !Array.isArray(parsed.tool_calls)) {
            return null;
        }
        return parsed.tool_calls.map((tc, index) => ({
            id: tc.id || `call_${Date.now()}_${index}`,
            type: 'function',
            function: {
                name: tc.function?.name || tc.name,
                arguments:
                    typeof tc.function?.arguments === 'string'
                        ? tc.function.arguments
                        : JSON.stringify(tc.function?.arguments || tc.arguments || {}),
            },
        }));
    };

    // Try to find JSON blocks with tool_calls (```json ... ```)
    const jsonBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?"tool_calls"[\s\S]*?\})\s*```/);
    if (jsonBlockMatch) {
        try {
            const parsed = JSON.parse(jsonBlockMatch[1]);
            const toolCalls = formatToolCalls(parsed);
            if (toolCalls) {
                const cleanContent = content.replace(jsonBlockMatch[0], '').trim();
                return { content: cleanContent, toolCalls };
            }
        } catch (e) {
            logger.debug('Failed to parse tool_calls JSON block:', e.message);
        }
    }

    // Try parsing the entire content as JSON if it looks like a tool_calls object
    // This handles cases where the model outputs only the JSON without any wrapper
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"tool_calls"')) {
        try {
            const parsed = JSON.parse(trimmed);
            const toolCalls = formatToolCalls(parsed);
            if (toolCalls) {
                return { content: '', toolCalls };
            }
        } catch (e) {
            logger.debug('Failed to parse content as tool_calls JSON:', e.message);
        }
    }

    // Try to extract JSON object containing tool_calls using bracket matching
    // This handles nested arrays/objects that lazy regex fails on
    const toolCallsIndex = content.indexOf('"tool_calls"');
    if (toolCallsIndex !== -1) {
        // Find the opening brace before "tool_calls"
        let braceStart = content.lastIndexOf('{', toolCallsIndex);
        if (braceStart !== -1) {
            // Find matching closing brace using bracket counting
            let depth = 0;
            let braceEnd = -1;
            for (let i = braceStart; i < content.length; i++) {
                if (content[i] === '{') depth++;
                else if (content[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        braceEnd = i;
                        break;
                    }
                }
            }
            if (braceEnd !== -1) {
                const jsonStr = content.substring(braceStart, braceEnd + 1);
                try {
                    const parsed = JSON.parse(jsonStr);
                    const toolCalls = formatToolCalls(parsed);
                    if (toolCalls) {
                        const cleanContent = (
                            content.substring(0, braceStart) + content.substring(braceEnd + 1)
                        ).trim();
                        return { content: cleanContent, toolCalls };
                    }
                } catch (e) {
                    logger.debug('Failed to parse extracted tool_calls JSON:', e.message);
                }
            }
        }
    }

    // No tool calls found
    return { content, toolCalls: null };
}

// =============================================================================
// Exports
// =============================================================================

export { buildGraphToolsContextMessage, GRAPH_TOOLS_SYSTEM_PROMPT };
