/**
 * Example MCP Tool Plugin
 *
 * This plugin demonstrates how to use MCP (Model Context Protocol) tools
 * with the agent architecture. MCP tools are capability plugins that provide
 * structured interfaces for agents to interact with external systems.
 *
 * Key concepts:
 * - Tools are registered in the ToolRegistry
 * - Agents declare allowed tools in their definition
 * - Tools are invoked through the host context with permission checking
 * - MCP servers provide remote tool implementations
 *
 * To use this plugin:
 * 1. Add to config.yaml:
 *      plugins:
 *        - path: ./src/canvas_chat/static/js/example-plugins/example-mcp-tool-plugin.js
 * 2. Configure MCP servers (optional):
 *      agents:
 *        mcp_servers:
 *          - name: "local-tools"
 *            url: "http://localhost:3000/mcp"
 *            tools: ["*"]
 * 3. Use the /tools command to list available tools
 * 4. Use /search-web to search using the web_search tool
 *
 * @module example-mcp-tool-plugin
 */

import { FeaturePlugin } from '/static/js/feature-plugin.js';
import { FeatureRegistry, PRIORITY } from '/static/js/feature-registry.js';
import {
    createAgentDefinition,
    createRunRequest,
    createRunContext,
    EventType,
    toolRegistry,
    createToolDefinition,
    enableAgentDebug,
} from '/static/js/agent/index.js';

// =============================================================================
// Custom Tool Definitions
// =============================================================================

/**
 * Example: Register a custom tool for text analysis.
 * This demonstrates how plugins can add their own tools.
 */
const textAnalysisTool = createToolDefinition({
    id: 'text_analysis',
    name: 'Text Analysis',
    description: 'Analyze text for sentiment, entities, and key phrases',
    category: 'transform',
    parameters: [
        {
            name: 'text',
            type: 'string',
            description: 'The text to analyze',
            required: true,
        },
        {
            name: 'analysis_types',
            type: 'array',
            description: 'Types of analysis: sentiment, entities, key_phrases',
            required: false,
        },
    ],
    returns: {
        type: 'object',
        description: 'Analysis results with sentiment, entities, and key phrases',
    },
    // Custom handler for this tool
    handler: async (params) => {
        const { text, analysis_types = ['sentiment', 'entities', 'key_phrases'] } = params;

        // Simulate analysis (in production, call an actual NLP service)
        const result = {
            text_length: text.length,
            word_count: text.split(/\s+/).length,
        };

        if (analysis_types.includes('sentiment')) {
            // Simple sentiment heuristic
            const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'happy'];
            const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'sad', 'angry'];
            const words = text.toLowerCase().split(/\s+/);
            const positive = words.filter((w) => positiveWords.some((p) => w.includes(p))).length;
            const negative = words.filter((w) => negativeWords.some((n) => w.includes(n))).length;
            result.sentiment = {
                positive: positive,
                negative: negative,
                score: positive - negative,
                label: positive > negative ? 'positive' : negative > positive ? 'negative' : 'neutral',
            };
        }

        if (analysis_types.includes('entities')) {
            // Simple entity extraction (capitalized words)
            const entities = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
            result.entities = [...new Set(entities)];
        }

        if (analysis_types.includes('key_phrases')) {
            // Simple key phrase extraction (2-3 word sequences)
            const words = text.split(/\s+/);
            const phrases = [];
            for (let i = 0; i < words.length - 1; i++) {
                phrases.push(words.slice(i, i + 2).join(' '));
                if (i < words.length - 2) {
                    phrases.push(words.slice(i, i + 3).join(' '));
                }
            }
            result.key_phrases = phrases.slice(0, 5);
        }

        return result;
    },
});

/**
 * Example: Calculator tool for numeric operations
 */
const calculatorTool = createToolDefinition({
    id: 'calculator',
    name: 'Calculator',
    description: 'Perform mathematical calculations',
    category: 'compute',
    parameters: [
        {
            name: 'expression',
            type: 'string',
            description: 'Mathematical expression to evaluate (e.g., "2 + 2 * 3")',
            required: true,
        },
    ],
    returns: {
        type: 'number',
        description: 'Result of the calculation',
    },
    handler: async (params) => {
        const { expression } = params;
        // Safe evaluation using Function constructor (sandbox in production!)
        // This is a simplified example - use a proper math parser in production
        try {
            // Only allow safe characters for math
            if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
                throw new Error('Invalid characters in expression');
            }
            // Replace ^ with ** for exponentiation
            const safeExpr = expression.replace(/\^/g, '**');
            const result = Function(`"use strict"; return (${safeExpr})`)();
            return { result, expression: safeExpr };
        } catch (e) {
            throw new Error(`Calculation error: ${e.message}`);
        }
    },
});

// =============================================================================
// Agent Definitions with Tool Access
// =============================================================================

/**
 * Research agent with web search and fetch capabilities
 */
const RESEARCH_AGENT = createAgentDefinition({
    id: 'web-researcher',
    name: 'Web Researcher',
    // model: uses app default
    systemPrompt: `You are a web research assistant. You have access to web search and URL fetch tools.

When the user asks a question:
1. Use web_search to find relevant information
2. Use fetch_url to retrieve detailed content from promising URLs
3. Synthesize findings into a clear, cited response

Always cite your sources with URLs.`,
    allowedTools: ['web_search', 'fetch_url', 'text_analysis'],
    budgets: {
        maxTokens: 20000,
        maxToolCalls: 5,
        timeoutMs: 120000,
    },
    hitl: {
        requireApprovalForTools: false, // Auto-approve tool calls
        alwaysApproveTools: ['web_search', 'fetch_url'],
    },
    defaultOutputNodeType: 'research',
    description: 'Research agent with web search and URL fetching capabilities',
});

/**
 * Analysis agent with text analysis and calculation tools
 */
const ANALYSIS_AGENT = createAgentDefinition({
    id: 'data-analyst',
    name: 'Data Analyst',
    systemPrompt: `You are a data analysis assistant. You have access to text analysis and calculation tools.

When analyzing content:
1. Use text_analysis to extract insights from text
2. Use calculator for any numeric computations
3. Provide clear explanations of your findings`,
    allowedTools: ['text_analysis', 'calculator', 'transform_text'],
    budgets: {
        maxTokens: 10000,
        maxToolCalls: 10,
        timeoutMs: 60000,
    },
    defaultOutputNodeType: 'ai',
    description: 'Analysis agent with text analysis and calculation capabilities',
});

// =============================================================================
// Feature Plugin Implementation
// =============================================================================

/**
 * MCPToolFeature - Demonstrates MCP tool integration
 */
class MCPToolFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.canvas = context.canvas;
        this.chat = context.chat;
    }

    async onLoad() {
        console.log('[MCPToolFeature] Loading MCP tool plugin...');

        // Register custom tools
        toolRegistry.registerTool(textAnalysisTool);
        toolRegistry.registerTool(calculatorTool);
        console.log('[MCPToolFeature] Custom tools registered');

        // Register agents
        if (this._context.runController) {
            this._context.runController.registerAgent(RESEARCH_AGENT);
            this._context.runController.registerAgent(ANALYSIS_AGENT);
            console.log('[MCPToolFeature] Agents registered');
        }

        // List available tools for debugging
        const tools = toolRegistry.listTools();
        console.log('[MCPToolFeature] Available tools:', tools.map((t) => t.id).join(', '));

        console.log('[MCPToolFeature] Plugin loaded successfully');
    }

    async onUnload() {
        console.log('[MCPToolFeature] Plugin unloaded');
    }

    getSlashCommands() {
        return [
            {
                command: '/tools',
                description: 'List all available MCP tools',
                placeholder: '',
            },
            {
                command: '/search-web',
                description: 'Search the web using the research agent',
                placeholder: 'Enter your search query...',
            },
            {
                command: '/calculate',
                description: 'Perform calculations using the calculator tool',
                placeholder: 'Enter a mathematical expression...',
            },
        ];
    }

    async handleCommand(command, args, context) {
        const { selectedNodeIds } = context;

        switch (command) {
            case '/tools':
                return await this.handleListTools();
            case '/search-web':
                return await this.handleWebSearch(args, selectedNodeIds);
            case '/calculate':
                return await this.handleCalculate(args);
            default:
                return false;
        }
    }

    /**
     * List all available tools
     */
    async handleListTools() {
        const tools = toolRegistry.listTools();

        // Create a note node with tool list
        const toolList = tools
            .map((t) => {
                const params = t.parameters.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ');
                return `### ${t.name} (\`${t.id}\`)\n${t.description}\n- **Category:** ${t.category}\n- **Parameters:** ${params || 'none'}`;
            })
            .join('\n\n');

        const content = `# Available MCP Tools\n\n${toolList}\n\n---\n*${tools.length} tools registered*`;

        // Add as a note node
        const nodeId = crypto.randomUUID();
        this.graph.addNode({
            id: nodeId,
            type: 'ai',
            title: 'Available Tools',
            content: content,
            position: this.canvas.getViewportCenter(),
        });
        this.canvas.selectNode(nodeId);

        this.canvas.showToast(`${tools.length} tools available`, 'success');
        return true;
    }

    /**
     * Web search using research agent
     */
    async handleWebSearch(query, selectedNodeIds) {
        if (!query.trim()) {
            this.canvas.showToast('Please provide a search query', 'warning');
            return true;
        }

        if (!this._context.runController) {
            // Fallback: invoke tool directly
            console.log('[MCPToolFeature] RunController not available, invoking tool directly');
            const result = await toolRegistry.invokeTool('web_search', { query, numResults: 5 });

            if (result.success) {
                const nodeId = crypto.randomUUID();
                this.graph.addNode({
                    id: nodeId,
                    type: 'search',
                    title: `Search: ${query}`,
                    content: JSON.stringify(result.data, null, 2),
                    position: this.canvas.getViewportCenter(),
                });
                this.canvas.selectNode(nodeId);
                this.canvas.showToast('Search complete', 'success');
            } else {
                this.canvas.showToast(`Search failed: ${result.error}`, 'error');
            }
            return true;
        }

        // Use research agent
        const runContext = createRunContext({
            sourceNodeIds: selectedNodeIds,
            userQuery: `Search the web for: ${query}`,
            slashCommand: '/search-web',
        });

        const runRequest = createRunRequest(RESEARCH_AGENT.id, runContext, { query });

        try {
            for await (const event of this._context.runController.startRun(runRequest)) {
                await this.handleAgentEvent(event);
            }
            this.canvas.showToast('Web search complete', 'success');
        } catch (error) {
            console.error('[MCPToolFeature] Web search failed:', error);
            this.canvas.showToast(`Search failed: ${error.message}`, 'error');
        }

        return true;
    }

    /**
     * Text analysis using analysis agent
     */
    async handleTextAnalysis(text, selectedNodeIds) {
        // Get text from selected nodes if not provided
        let textToAnalyze = text.trim();

        if (!textToAnalyze && selectedNodeIds.length > 0) {
            const contents = selectedNodeIds.map((id) => this.graph.getNode(id)?.content).filter(Boolean);
            textToAnalyze = contents.join('\n\n');
        }

        if (!textToAnalyze) {
            this.canvas.showToast('Please provide text or select a node to analyze', 'warning');
            return true;
        }

        // Invoke text analysis tool directly for quick feedback
        console.log('[MCPToolFeature] Analyzing text...');
        const result = await toolRegistry.invokeTool('text_analysis', {
            text: textToAnalyze,
            analysis_types: ['sentiment', 'entities', 'key_phrases'],
        });

        if (result.success) {
            const analysis = result.data;
            const content = `# Text Analysis Results

## Summary
- **Word Count:** ${analysis.word_count}
- **Character Count:** ${analysis.text_length}

## Sentiment
- **Score:** ${analysis.sentiment?.score || 0}
- **Label:** ${analysis.sentiment?.label || 'neutral'}
- **Positive indicators:** ${analysis.sentiment?.positive || 0}
- **Negative indicators:** ${analysis.sentiment?.negative || 0}

## Entities Detected
${analysis.entities?.map((e) => `- ${e}`).join('\n') || '- None detected'}

## Key Phrases
${analysis.key_phrases?.map((p) => `- "${p}"`).join('\n') || '- None extracted'}`;

            const nodeId = crypto.randomUUID();
            this.graph.addNode({
                id: nodeId,
                type: 'ai',
                title: 'Text Analysis',
                content: content,
                position: this.canvas.getViewportCenter(),
            });
            this.canvas.selectNode(nodeId);
            this.canvas.showToast('Analysis complete', 'success');
        } else {
            this.canvas.showToast(`Analysis failed: ${result.error}`, 'error');
        }

        return true;
    }

    /**
     * Calculate expression using calculator tool
     */
    async handleCalculate(expression) {
        if (!expression.trim()) {
            this.canvas.showToast('Please provide a mathematical expression', 'warning');
            return true;
        }

        console.log('[MCPToolFeature] Calculating:', expression);
        const result = await toolRegistry.invokeTool('calculator', { expression });

        if (result.success) {
            const content = `# Calculator Result

**Expression:** \`${expression}\`

**Result:** ${result.data.result}`;

            const nodeId = crypto.randomUUID();
            this.graph.addNode({
                id: nodeId,
                type: 'ai',
                title: `Calc: ${expression}`,
                content: content,
                position: this.canvas.getViewportCenter(),
            });
            this.canvas.selectNode(nodeId);
            this.canvas.showToast(`Result: ${result.data.result}`, 'success');
        } else {
            this.canvas.showToast(`Calculation failed: ${result.error}`, 'error');
        }

        return true;
    }

    /**
     * Handle agent events
     */
    async handleAgentEvent(event) {
        switch (event.type) {
            case EventType.TOOL_CALL_REQUESTED:
                console.log('[MCPToolFeature] Tool call:', event.data.toolId, event.data.params);
                break;
            case EventType.TOOL_CALL_COMPLETED:
                console.log('[MCPToolFeature] Tool result:', event.data.result?.success);
                break;
            case EventType.RUN_COMPLETED:
                console.log('[MCPToolFeature] Run completed');
                break;
            case EventType.RUN_FAILED:
                console.error('[MCPToolFeature] Run failed:', event.data.error);
                break;
        }
    }
}

// =============================================================================
// Plugin Registration
// =============================================================================

let registerFeature = null;

if (typeof window !== 'undefined') {
    let registering = false;
    let registered = false;
    let attempts = 0;
    const maxAttempts = 120; // ~30s at 250ms intervals
    registerFeature = (app) => {
        if (registered || registering) return;
        if (attempts >= maxAttempts) {
            console.warn('[MCPToolFeature] Gave up registering after max attempts');
            return;
        }
        const targetApp = app || window.app;
        if (!targetApp || !targetApp.featureRegistry) {
            attempts += 1;
            setTimeout(() => registerFeature(window.app), 250);
            return;
        }
        if (!targetApp.featureRegistry._appContext) {
            attempts += 1;
            setTimeout(() => registerFeature(targetApp), 250);
            return;
        }
        registering = true;
        targetApp.featureRegistry
            .register({
                id: 'mcp-tools',
                feature: MCPToolFeature,
                slashCommands: [
                    { command: '/tools', handler: 'handleCommand' },
                    { command: '/search-web', handler: 'handleCommand' },
                    { command: '/calculate', handler: 'handleCommand' },
                ],
                priority: PRIORITY.COMMUNITY,
            })
            .then(() => {
                registered = true;
                console.log('[MCPToolFeature] Registered with FeatureRegistry');
            })
            .catch((err) => {
                registering = false;
                attempts += 1;
                console.error('[MCPToolFeature] Failed to register with FeatureRegistry:', err);
                setTimeout(() => registerFeature(targetApp), 500);
            });
    };

    if (window.app) {
        registerFeature(window.app);
    }

    window.addEventListener('app-plugin-system-ready', (event) => {
        registerFeature(event.detail?.app || window.app);
    });
}

export function registerPlugin(app) {
    if (typeof window === 'undefined' || !registerFeature) {
        return;
    }
    registerFeature(app || window.app);
}

export { MCPToolFeature, RESEARCH_AGENT, ANALYSIS_AGENT, textAnalysisTool, calculatorTool };
