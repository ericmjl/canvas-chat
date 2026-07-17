/**
 * Agent Plugin (Built-in)
 *
 * Frontend-driven ReAct loop. The agent calls tools (auto-generated from
 * slash commands) to gather information, then calls `respond` to synthesize.
 *
 * Architecture:
 * - Frontend manages the ReAct loop (this file)
 * - Backend is a stateless LLM proxy (`/api/agent/completion`)
 * - Tools dispatch to the SAME feature handlers as slash commands
 *   (via featureRegistry.handleSlashCommand) — no parallel implementations
 *
 * Edge semantics: a new node is always "in response to" an older node.
 * Edges are created ONLY via createLinkedNode (parent → child). The agent
 * never calls graph.addEdge directly — bidirectional edges are impossible
 * by construction.
 *
 * Graph structure:
 *   User → Agent(thinking) → Search1
 *                          → Search2
 *                          → Code
 *   Search1 → Synthesis(AI)
 *   Search2 → Synthesis(AI)
 *   Code    → Synthesis(AI)
 *
 * Activated via `/agent` slash command.
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { EdgeType, NodeType, createNode, createEdge } from '../graph-types.js';
import { apiUrl } from '../utils.js';
import { readSSEStream } from '../sse.js';
import { executeCodeOnNode as _executeCodeOnNode, gatherViewportContext as _gatherViewportContext } from '../agent-utils.js';
import { fetchUrlContent } from '../web-grounding.js';

const MAX_AGENT_TOOL_CALLS = 30;

// Commands excluded from agent tools:
// - /agent: prevents recursion
// - /code: replaced with custom code tool (takes actual Python code)
// - /matrix: needs interactive modal for rows/columns
// - /fetch: models hallucinate URLs instead of searching. Search returns
//   real URLs in snippets; users can /fetch manually or use "View content".
// - /git, /youtube: specific URL-input tools less useful for general agent tasks
const EXCLUDED_COMMANDS = ['/agent', '/code', '/matrix', '/fetch', '/git', '/youtube'];

/**
 * Strip <think>...</think> tags emitted by reasoning models (e.g. Qwen),
 * and remove markdown code fences (```python ... ```) that the model wraps
 * around code. Both break execution if left in.
 * @param {string} text
 * @returns {string}
 */
function stripThinking(text) {
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Strip markdown code fences: ```python\ncode\n``` or ```\ncode\n```
    cleaned = cleaned.trim();
    if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        lines.shift(); // remove opening ```python or ```
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
            lines.pop(); // remove closing ```
        }
        cleaned = lines.join('\n');
    }
    return cleaned.trim();
}

/**
 *
 */
class AgentFeature extends FeaturePlugin {
    /**
     *
     */
    get id() {
        return 'agent';
    }

    /**
     *
     */
    getSlashCommands() {
        return [
            {
                command: '/agent',
                description: 'Agentic mode — AI uses tools and creates nodes',
                placeholder: 'What would you like the agent to do?',
            },
        ];
    }

    /**
     *
     * @param command
     * @param args
     * @param _context
     */
    async handleCommand(command, args, _context) {
        if (command !== '/agent') return false;
        if (!args || !args.trim()) {
            this.showToast('Please provide a message for the agent.');
            return true;
        }
        const parentIds = this.canvas.getSelectedNodeIds();
        await this.runAgent(args.trim(), parentIds);
        return true;
    }

    // ═══════════════════════════════════════════════════════════
    //  Logging
    // ═══════════════════════════════════════════════════════════

    /**
     * Append an entry to the agent log in the side drawer.
     * @param {string} type - tool-call|tool-result|text|error|respond
     * @param {string} label - Short label
     * @param {string} [detail] - Optional detail text
     */
    log(type, label, detail) {
        if (this._context.appendAgentLog) {
            this._context.appendAgentLog(type, label, detail);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Utility
    // ═══════════════════════════════════════════════════════════

    /**
     *
     */
    gatherViewportContext() {
        return _gatherViewportContext(this.graph, this.canvas);
    }

    // ═══════════════════════════════════════════════════════════
    //  Tool Building
    // ═══════════════════════════════════════════════════════════

    /**
     *
     */
    buildAgentTools() {
        // Merge two sources:
        // 1. BUILTIN_SLASH_COMMANDS (search, research, committee, factcheck) —
        //    these don't implement getSlashCommands() on their feature classes
        // 2. featureRegistry.getSlashCommandsWithMetadata() — features that
        //    self-declare via getSlashCommands()
        const BUILTIN = [
            { command: '/search', description: 'Search the web for information', placeholder: 'search query' },
            { command: '/research', description: 'Deep research on a topic', placeholder: 'research topic' },
            { command: '/committee', description: 'Consult multiple LLMs and synthesize', placeholder: 'question' },
            { command: '/factcheck', description: 'Verify claims with web search', placeholder: 'claims to verify' },
        ];

        const registryCommands = this._context.featureRegistry
            ? this._context.featureRegistry.getSlashCommandsWithMetadata()
            : [];

        const allCommands = [...BUILTIN, ...registryCommands];

        const tools = allCommands
            .filter((cmd) => !EXCLUDED_COMMANDS.includes(cmd.command))
            .map((cmd) => ({
                type: 'function',
                function: {
                    name: cmd.command.replace('/', ''),
                    description: cmd.description,
                    parameters: {
                        type: 'object',
                        properties: {
                            input: {
                                type: 'string',
                                description: cmd.placeholder || 'Input for this command',
                            },
                        },
                        required: ['input'],
                    },
                },
            }));

        tools.push({
            type: 'function',
            function: {
                name: 'code',
                description:
                    'Execute Python code and return stdout, results, and figures. Plotly is the default plotting library.',
                parameters: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', description: 'Python code to execute' },
                    },
                    required: ['code'],
                },
            },
        });

        tools.push({
            type: 'function',
            function: {
                name: 'respond',
                description:
                    'Provide your final response/synthesis. Call this when you have enough information to answer.',
                parameters: {
                    type: 'object',
                    properties: {
                        content: { type: 'string', description: 'Your response (supports markdown)' },
                        context_nodes: {
                            type: 'array',
                            items: { type: 'string' },
                            description:
                                'Refs of tool-created nodes to link as parents of this response (e.g. ["node-1", "node-3"]). Omit to link all tool nodes.',
                        },
                    },
                    required: ['content'],
                },
            },
        });

        return tools;
    }

    /**
     *
     * @param tools
     */
    buildSystemPrompt(tools) {
        const toolDocs = tools
            .filter((t) => t.function.name !== 'respond')
            .map((t) => `- ${t.function.name}: ${t.function.description}`)
            .join('\n');

        return (
            'You are a research assistant on a visual canvas.\n' +
            'Every tool call creates a visible node. The user sees your work.\n\n' +
            '## WORKFLOW\n' +
            '1. Does the task need facts, data, or current information you don\'t have?\n' +
            '   If YES → SEARCH FIRST. Never fabricate data — always search for real\n' +
            '   numbers, measurements, facts before using them in code or notes.\n' +
            '   If NO (pure computation, coding, logic) → skip to code/respond.\n' +
            '2. For research tasks: do 5-10 searches covering different facets\n' +
            '   before synthesizing.\n' +
            '3. After gathering data: optionally use code to analyze/visualize\n' +
            '   the real data you found.\n' +
            '4. Call respond with your synthesis when done.\n\n' +
            '## Tools\n' +
            toolDocs +
            '\n- respond: Final synthesis. Call when done.\n\n' +
            'Each tool node gets a ref (node-1, node-2, ...). Use these in\n' +
            "respond's context_nodes to link your synthesis to specific results.\n\n" +
            '## How tools work\n' +
            '- search: Pass a query string like "duck bill length measurements".\n' +
            '  Returns real web results. This is ALWAYS your first step.\n' +
            '- code: Python code. Use ONLY to visualize/analyze data you found\n' +
            '  via search. NEVER put fabricated/hallucinated data in code.\n' +
            '- respond: Your final answer. Include real findings from searches.\n\n' +
            '## Rules\n' +
            '- NEVER fabricate data. If you need numbers, search for them first.\n' +
            '- NEVER guess URLs. Only fetch URLs from search results.\n' +
            '- If code errors, read the error and retry with fixed code.\n' +
            '- Do NOT wrap code in markdown fences or <think> tags.\n\n' +
            '## Python rules (code tool)\n' +
            '- Separate import lines: NEVER comma-separated\n' +
            '  BAD:  import numpy as np, plotly.graph_objects as go\n' +
            '  GOOD: import numpy as np\\nimport plotly.graph_objects as go\n' +
            '- Available: numpy, pandas, scipy, matplotlib, plotly, seaborn,\n' +
            '  scikit-learn, sympy, networkx\n' +
            '- Runs in Pyodide (browser WASM). No file I/O, no network.'
        );
    }

    // ═══════════════════════════════════════════════════════════
    //  Agent Loop (frontend ReAct)
    // ═══════════════════════════════════════════════════════════

    /**
     *
     * @param message
     * @param parentIds
     */
    async runAgent(message, parentIds = []) {
        const model = this.modelPicker.value;
        const llmRequest = this.buildLLMRequest({});

        const humanNode = this.graph.createLinkedNode(NodeType.HUMAN, message, parentIds);
        this.canvas.zoomToSelectionAnimated([humanNode.id], 0.8, 300);

        const agentNode = this.graph.createLinkedNode(NodeType.AI, 'Working...', [humanNode.id], {
            model: model.split('/').pop(),
        });
        this.canvas.zoomToSelectionAnimated([agentNode.id], 0.8, 300);
        this.updateCollapseButtonForNode(humanNode.id);

        const tools = this.buildAgentTools();
        const systemPrompt = this.buildSystemPrompt(tools);

        const abortController = new AbortController();
        this.streamingManager.register(agentNode.id, {
            abortController,
            featureId: 'agent',
            context: { model, agentNodeId: agentNode.id },
            onContinue: async () => {
                await this.runAgent('continue');
            },
        });

        // Gather context from parent nodes so the agent knows what the
        // user is replying to (e.g. "redo this" needs the parent's code).
        let userContent = message;
        if (parentIds.length > 0) {
            const contextParts = parentIds
                .map((id) => this.graph.getNode(id))
                .filter((n) => n)
                .map((n) => {
                    const label = n.title || n.type || 'node';
                    const body = (n.content || '').substring(0, 4000);
                    const code = n.code ? `\n\nCode:\n\`\`\`python\n${n.code.substring(0, 4000)}\n\`\`\`` : '';
                    return `--- ${label} ---\n${body}${code}`;
                });
            if (contextParts.length > 0) {
                userContent = `The user is replying to the following canvas node(s):\n\n${contextParts.join('\n\n')}\n\n---\n\nUser message: ${message}`;
            }
        }

        let messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
        ];

        const toolNodes = [];
        let nodeCounter = 0;
        let toolCallCount = 0;
        let lastIterationText = '';

        try {
            // Auto-open the agent log tab in the side drawer
            if (this.openTagDrawer) this.openTagDrawer();
            if (this.switchDrawerTab) this.switchDrawerTab('agent-log');

            this.log('text', 'Agent started', `"${message.substring(0, 80)}${message.length > 80 ? '…' : ''}"`);

            while (toolCallCount < MAX_AGENT_TOOL_CALLS) {
                let iterationText = '';
                let toolCalls = null;

                const response = await fetch(apiUrl('/api/agent/completion'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages,
                        tools,
                        model: llmRequest.model,
                        api_key: llmRequest.api_key || null,
                        base_url: llmRequest.base_url || null,
                        temperature: 0.7,
                    }),
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    const errBody = await response.text();
                    throw new Error(`Agent completion failed: ${response.status} ${errBody}`);
                }

                await readSSEStream(response, {
                    onEvent: (eventType, data) => {
                        if (eventType === 'text') {
                            iterationText += data;
                            lastIterationText = iterationText;
                            const clean = stripThinking(iterationText);
                            this.canvas.updateNodeContent(agentNode.id, clean || 'Working...', true);
                        } else if (eventType === 'tool_calls') {
                            toolCalls = JSON.parse(data);
                        }
                    },
                    onError: (err) => {
                        throw err;
                    },
                });

                if (!toolCalls || toolCalls.length === 0) {
                    // Fallback: model returned text without calling respond.
                    const clean = stripThinking(iterationText) || '(No response)';
                    this.log('text', 'Final text response', clean.substring(0, 200));
                    this.canvas.updateNodeContent(agentNode.id, clean, false);
                    this.graph.updateNode(agentNode.id, { content: clean });
                    this.finishAgent(agentNode.id);
                    return;
                }

                // Check for respond tool
                const respondCall = toolCalls.find((tc) => tc.function.name === 'respond');
                if (respondCall) {
                    const args = JSON.parse(respondCall.function.arguments || '{}');
                    this.log('respond', 'Synthesis (respond)', (args.content || '').substring(0, 200));
                    this.createSynthesis(
                        agentNode.id,
                        stripThinking(args.content || iterationText),
                        args.context_nodes,
                        toolNodes
                    );
                    return;
                }

                // Execute non-respond tools
                messages.push({
                    role: 'assistant',
                    content: iterationText || null,
                    tool_calls: toolCalls.map((tc) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    })),
                });

                for (const call of toolCalls) {
                    toolCallCount++;
                    const args = JSON.parse(call.function.arguments || '{}');
                    const toolName = call.function.name;

                    const argPreview = toolName === 'code'
                        ? `${(args.code || '').substring(0, 100)}…`
                        : JSON.stringify(args).substring(0, 120);
                    this.log('tool-call', `→ ${toolName} (#${toolCallCount})`, argPreview);

                    const result = await this.executeAgentTool(toolName, args, agentNode);

                    this.log('tool-result', `← ${toolName}`, result.content.substring(0, 200));

                    nodeCounter++;
                    const ref = `node-${nodeCounter}`;
                    if (result.nodeId) {
                        toolNodes.push({ ref, nodeId: result.nodeId });
                    }

                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: result.content + `\n\n(Node ref: ${ref})`,
                    });
                }

                this.canvas.updateNodeContent(agentNode.id, 'Working...', false);
                this.graph.updateNode(agentNode.id, { content: 'Working...' });
            }

            // Max tool calls reached — use agent node as synthesis
            this.canvas.updateNodeContent(agentNode.id, '*Reached tool call limit.*', false);
            this.graph.updateNode(agentNode.id, { content: '*Reached tool call limit.*' });
            this.finishAgent(agentNode.id);
        } catch (err) {
            this.streamingManager.unregister(agentNode.id);
            if (err.name === 'AbortError') {
                this.log('error', 'Stopped by user');
                const stopped = lastIterationText ? stripThinking(lastIterationText) + '\n\n*(stopped)*' : '*(stopped)*';
                this.canvas.updateNodeContent(agentNode.id, stopped, false);
                this.graph.updateNode(agentNode.id, { content: stopped });
            } else {
                this.log('error', 'Error', err.message);
                const errorContent = `⚠️ Error: ${err.message}`;
                this.canvas.updateNodeContent(agentNode.id, errorContent, false);
                this.graph.updateNode(agentNode.id, { content: errorContent });
            }
            this.saveSession();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Tool Execution
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute a tool call. Tool nodes are created as children of the
     * agent node (via canvas selection). No edges are created manually.
     *
     * @param {string} toolName
     * @param {Object} args
     * @param {Object} agentNode
     * @returns {Promise<{content: string, nodeId: string|null}>}
     */
    async executeAgentTool(toolName, args, agentNode) {
        if (toolName === 'code') {
            return this.executeCodeTool(args.code || '', agentNode);
        }

        const slashCommand = '/' + toolName;
        const input = args.input || args.query || args.prompt || '';

        // Select the agent node so the feature handler links the new
        // tool node as a child of the agent (parent → child edge via
        // createLinkedNode inside the handler).
        this.canvas.selectNode?.(agentNode.id);
        const beforeIds = new Set(this.graph.getAllNodes().map((n) => n.id));

        try {
            await this._context.featureRegistry.handleSlashCommand(slashCommand, input, {});
        } catch (e) {
            return { content: `Error: ${e.message}`, nodeId: null };
        } finally {
            this.canvas.clearSelection?.();
        }

        const newNodes = this.graph.getAllNodes().filter((n) => !beforeIds.has(n.id));
        const primaryNode = newNodes[0];

        // For search: auto-fetch the top 2 results' full page content so
        // the LLM gets rich data (thousands of words) instead of just
        // snippets (~50 words per result). This prevents excessive
        // re-searching for data that's in the page but not the snippet.
        if (primaryNode && primaryNode.type === NodeType.SEARCH) {
            await this.enrichSearchResults(primaryNode);
        }

        return {
            content: this.extractToolResult(primaryNode, toolName),
            nodeId: primaryNode?.id || null,
        };
    }

    /**
     * Auto-fetch full page content for the top 2 search results.
     * Marks them as expanded on the node (carousel consistency) and
     * stores the fetched text so extractToolResult can include it.
     * @param {Object} searchNode
     */
    async enrichSearchResults(searchNode) {
        let results = [];
        try {
            results = JSON.parse(searchNode.searchResults || '[]');
        } catch { return; }

        const toFetch = results.slice(0, 2).filter((r) => r.url && !r.expanded);
        const fetches = await Promise.allSettled(
            toFetch.map((r) => fetchUrlContent(r.url))
        );

        let changed = false;
        for (let i = 0; i < toFetch.length; i++) {
            const result = fetches[i];
            if (result.status === 'fulfilled' && result.value?.content) {
                const pageContent = result.value.content.slice(0, 6000);
                // Find the matching result index and update it
                const idx = results.indexOf(toFetch[i]);
                if (idx >= 0) {
                    results[idx] = {
                        ...results[idx],
                        expanded: true,
                        pageContent,
                    };
                    changed = true;
                }
            }
        }

        if (changed) {
            this.graph.updateNode(searchNode.id, {
                searchResults: JSON.stringify(results),
            });
        }
    }

    /**
     * Execute Python code: create CODE node as child of agent, auto-execute,
     * wait for output, return it.
     * @param code
     * @param agentNode
     */
    async executeCodeTool(code, agentNode) {
        // Strip thinking tokens that reasoning models leak into code
        const cleanCode = stripThinking(code);
        const codeNode = this.graph.createLinkedNode(NodeType.CODE, cleanCode, [agentNode.id], {
            title: 'Code',
            code: cleanCode,
        });
        this.canvas.zoomToSelectionAnimated([codeNode.id], 0.8, 300);

        await _executeCodeOnNode(
            codeNode.id,
            cleanCode,
            this.graph,
            this.canvas,
            this._context.pyodideRunner,
            () => this.saveSession(),
            createNode,
            createEdge,
            NodeType,
            EdgeType
        );

        const updated = this.graph.getNode(codeNode.id);
        let output = '';
        if (updated?.outputStdout) output += updated.outputStdout;
        if (updated?.lastError) output += `\nError: ${updated.lastError}`;
        if (!output) output = '(Code executed — no stdout output)';

        return { content: output, nodeId: codeNode.id };
    }

    /**
     * Extract tool result text from a node for the LLM.
     * @param node
     * @param toolName
     */
    extractToolResult(node, toolName) {
        if (!node) return `${toolName} completed.`;

        if (node.searchResults) {
            try {
                const results = JSON.parse(node.searchResults);
                return results
                    .map((r, i) => {
                        let text = `[${i}] ${r.title}\n  URL: ${r.url}`;
                        // Include auto-fetched page content if available
                        // (much richer than the snippet alone)
                        if (r.pageContent) {
                            text += `\n  ${r.pageContent}`;
                        } else {
                            text += `\n  ${r.snippet}`;
                        }
                        return text;
                    })
                    .join('\n\n---\n\n');
            } catch {
                /* fall through */
            }
        }

        if (node.outputStdout) return node.outputStdout;
        return node.content || `${toolName} completed.`;
    }

    // ═══════════════════════════════════════════════════════════
    //  Synthesis
    // ═══════════════════════════════════════════════════════════

    /**
     * Create the synthesis node — a NEW AI node whose parents are the
     * specified tool nodes. Edges are toolNode → synthesis (parent → child),
     * created via createLinkedNode. No manual addEdge.
     *
     * The agent (thinking) node stays as-is — it showed "Working..." and
     * any inter-tool reasoning text during the loop.
     *
     * @param {string} agentNodeId - The thinking node (for cleanup)
     * @param {string} content - Synthesis content
     * @param {string[]|null} contextNodeRefs - Refs like ["node-1", "node-3"]
     * @param {Array<{ref:string,nodeId:string}>} toolNodes
     */
    createSynthesis(agentNodeId, content, contextNodeRefs, toolNodes) {
        // Resolve which tool nodes are parents of the synthesis
        let parentNodeIds;
        if (contextNodeRefs && toolNodes.length > 0) {
            const refToNodeId = new Map(toolNodes.map((t) => [t.ref, t.nodeId]));
            parentNodeIds = contextNodeRefs
                .map((ref) => refToNodeId.get(ref))
                .filter((id) => id && id !== agentNodeId);
        } else {
            parentNodeIds = toolNodes.map((t) => t.nodeId).filter((id) => id !== agentNodeId);
        }

        // Create synthesis as a child of the tool nodes
        const synthesisNode = this.graph.createLinkedNode(
            NodeType.AI,
            content,
            parentNodeIds.length > 0 ? parentNodeIds : [agentNodeId],
            { model: this.modelPicker.value.split('/').pop() }
        );
        this.canvas.zoomToSelectionAnimated([synthesisNode.id], 0.8, 300);

        this.finishAgent(agentNodeId);
    }

    // ═══════════════════════════════════════════════════════════
    //  Cleanup
    // ═══════════════════════════════════════════════════════════

    /**
     * Common cleanup after agent finishes (success, error, or abort).
     * @param agentNodeId
     */
    finishAgent(agentNodeId) {
        this.streamingManager.unregister(agentNodeId);
        this.saveSession();
        if (this.generateNodeSummary) {
            this.generateNodeSummary(agentNodeId);
        }
    }
}

export { AgentFeature };
