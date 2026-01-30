/**
 * Example Agent-Backed Feature Plugin
 *
 * This plugin demonstrates how to create a feature plugin that uses the new
 * Base Agent + Sub-Agent architecture. Agent-backed plugins delegate execution
 * to a registered agent, which provides:
 *
 * - Explicit, traceable execution via Run Nodes in the DAG
 * - Support for delegation via sub-agents
 * - Memory primitives (retain/recall/reflect)
 * - Plans and progress visibility for long-running operations
 * - Human-in-the-loop approval flows
 *
 * To use this plugin:
 * 1. Add plugin path to config.yaml:
 *      plugins:
 *        - path: ./src/canvas_chat/static/js/example-plugins/example-agent-plugin.js
 * 2. Run with: uvx canvas-chat launch --config config.yaml
 * 3. Use the /analyze command in the chat input
 *
 * @module example-agent-plugin
 */

import { FeaturePlugin, PRIORITY } from '/static/js/feature-plugin.js';
import { FeatureRegistry } from '/static/js/feature-registry.js';
import {
    createAgentDefinition,
    createRunRequest,
    createRunContext,
    EventType,
    RunStatusType,
    enableAgentDebug,
} from '/static/js/agent/index.js';

// =============================================================================
// Agent Definitions
// =============================================================================

/**
 * Define the analyzer agent - a simple agent that analyzes selected nodes
 * and provides structured insights.
 */
const ANALYZER_AGENT = createAgentDefinition({
    id: 'analyzer',
    name: 'Content Analyzer',
    // model: optional - uses app-level default model when not specified
    systemPrompt: `You are a content analyzer. When given text content, you:
1. Identify the main topics and themes
2. Extract key facts and claims
3. Note any questions or uncertainties
4. Suggest related topics to explore

Format your analysis as structured markdown with clear sections.`,
    allowedTools: [], // No tools needed for this simple agent
    budgets: {
        maxTokens: 10000,
        maxToolCalls: 0,
        timeoutMs: 60000, // 1 minute
    },
    defaultOutputNodeType: 'ai',
    description: 'Analyzes content and provides structured insights',
});

/**
 * Define the research coordinator agent - demonstrates sub-agent delegation
 */
const RESEARCH_COORDINATOR_AGENT = createAgentDefinition({
    id: 'research-coordinator',
    name: 'Research Coordinator',
    // model: optional - uses app-level default model when not specified
    systemPrompt: `You are a research coordinator. You:
1. Break down research questions into sub-tasks
2. Delegate to specialist sub-agents
3. Synthesize findings into a coherent report

Always create a plan before starting research.`,
    allowedTools: ['web_search', 'fetch_url'],
    budgets: {
        maxTokens: 50000,
        maxToolCalls: 10,
        timeoutMs: 300000, // 5 minutes
    },
    // Sub-agents for delegation
    subagents: {
        searcher: createAgentDefinition({
            id: 'searcher',
            name: 'Web Searcher',
            // model: inherits from app default
            systemPrompt: 'You search the web for relevant information on a specific topic.',
            allowedTools: ['web_search'],
            budgets: {
                maxTokens: 5000,
                maxToolCalls: 3,
                timeoutMs: 60000,
            },
        }),
        summarizer: createAgentDefinition({
            id: 'summarizer',
            name: 'Content Summarizer',
            // model: inherits from app default
            systemPrompt: 'You summarize content into concise, actionable insights.',
            allowedTools: [],
            budgets: {
                maxTokens: 5000,
                maxToolCalls: 0,
                timeoutMs: 30000,
            },
        }),
    },
    hitl: {
        requireApprovalForTools: false,
        requireApprovalForSubagents: false, // Auto-approve sub-agents
        requireApprovalForMutations: true,
        alwaysApproveTools: ['web_search'],
        alwaysBlockTools: [],
    },
    defaultOutputNodeType: 'research',
    description: 'Coordinates research tasks with sub-agent delegation',
});

// =============================================================================
// Feature Plugin Implementation
// =============================================================================

/**
 * AnalyzerFeature - Example agent-backed feature plugin
 *
 * This demonstrates:
 * - Registering agents with the RunController
 * - Creating run requests from slash commands
 * - Handling agent events for UI updates
 * - Displaying run progress and artifacts
 */
class AnalyzerFeature extends FeaturePlugin {
    /**
     * @param {import('/static/js/feature-plugin.js').AppContext} context
     */
    constructor(context) {
        super(context);

        // Store references to core APIs
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.chat = context.chat;

        // Agent debug flag - enable for development
        this.debug = false;
    }

    /**
     * Plugin lifecycle: called when plugin is loaded
     */
    async onLoad() {
        console.log('[AnalyzerFeature] Loading agent-backed feature plugin...');

        // Register our agents with the RunController
        // Note: RunController must be initialized in app.js first
        if (this.context.runController) {
            this.context.runController.registerAgent(ANALYZER_AGENT);
            this.context.runController.registerAgent(RESEARCH_COORDINATOR_AGENT);
            console.log('[AnalyzerFeature] Agents registered with RunController');
        } else {
            console.warn(
                '[AnalyzerFeature] RunController not available - agent features will not work',
                'Make sure RunController is initialized in app.js'
            );
        }

        // Enable debug logging if flag is set
        if (this.debug) {
            enableAgentDebug();
        }

        console.log('[AnalyzerFeature] Plugin loaded successfully');
    }

    /**
     * Plugin lifecycle: called when plugin is unloaded
     */
    async onUnload() {
        console.log('[AnalyzerFeature] Plugin unloaded');
    }

    /**
     * Define slash commands for this feature
     * @returns {Array<{command: string, description: string, placeholder?: string}>}
     */
    getSlashCommands() {
        return [
            {
                command: '/analyze',
                description: 'Analyze selected content using the agent architecture',
                placeholder: 'Optional: specific aspect to analyze...',
            },
            {
                command: '/coordinate',
                description: 'Start a coordinated research task with sub-agents',
                placeholder: 'Research question...',
            },
        ];
    }

    /**
     * Handle slash commands
     * @param {string} command - The slash command (e.g., '/analyze')
     * @param {string} args - Arguments after the command
     * @param {Object} context - Command context
     * @returns {Promise<boolean>} - True if command was handled
     */
    async handleCommand(command, args, context) {
        const { selectedNodeIds } = context;

        switch (command) {
            case '/analyze':
                return await this.handleAnalyze(args, selectedNodeIds);
            case '/coordinate':
                return await this.handleCoordinate(args, selectedNodeIds);
            default:
                return false;
        }
    }

    /**
     * Handle /analyze command
     * @param {string} focusArea - Optional focus area for analysis
     * @param {string[]} selectedNodeIds - Selected source nodes
     */
    async handleAnalyze(focusArea, selectedNodeIds) {
        console.log('[AnalyzerFeature] Starting analysis...', { focusArea, selectedNodeIds });

        // Validate we have content to analyze
        if (selectedNodeIds.length === 0) {
            this.canvas.showToast('Please select a node to analyze', 'warning');
            return true;
        }

        // Check if RunController is available
        if (!this.context.runController) {
            this.canvas.showToast('Agent system not initialized', 'error');
            return true;
        }

        // Create run context from selected nodes
        const runContext = createRunContext({
            sourceNodeIds: selectedNodeIds,
            userQuery: focusArea || 'Analyze this content',
            slashCommand: '/analyze',
        });

        // Create run request
        const runRequest = createRunRequest(ANALYZER_AGENT.id, runContext, {
            focusArea: focusArea || null,
        });

        // Execute via RunController and handle events
        try {
            for await (const event of this.context.runController.startRun(runRequest)) {
                await this.handleAgentEvent(event);
            }
            this.canvas.showToast('Analysis complete', 'success');
        } catch (error) {
            console.error('[AnalyzerFeature] Analysis failed:', error);
            this.canvas.showToast(`Analysis failed: ${error.message}`, 'error');
        }

        return true;
    }

    /**
     * Handle /coordinate command - demonstrates sub-agent delegation
     * @param {string} question - Research question
     * @param {string[]} selectedNodeIds - Selected context nodes
     */
    async handleCoordinate(question, selectedNodeIds) {
        console.log('[AnalyzerFeature] Starting coordinated research...', { question, selectedNodeIds });

        if (!question.trim()) {
            this.canvas.showToast('Please provide a research question', 'warning');
            return true;
        }

        if (!this.context.runController) {
            this.canvas.showToast('Agent system not initialized', 'error');
            return true;
        }

        // Create run context
        const runContext = createRunContext({
            sourceNodeIds: selectedNodeIds,
            userQuery: question,
            slashCommand: '/coordinate',
        });

        // Create run request for the coordinator agent
        const runRequest = createRunRequest(RESEARCH_COORDINATOR_AGENT.id, runContext, {
            question,
        });

        // Execute and handle events
        try {
            for await (const event of this.context.runController.startRun(runRequest)) {
                await this.handleAgentEvent(event);
            }
            this.canvas.showToast('Research coordination complete', 'success');
        } catch (error) {
            console.error('[AnalyzerFeature] Coordinated research failed:', error);
            this.canvas.showToast(`Research failed: ${error.message}`, 'error');
        }

        return true;
    }

    /**
     * Handle events from agent execution
     * This demonstrates how to update UI based on agent events
     * @param {import('/static/js/agent/agent-types.js').AgentEvent} event
     */
    async handleAgentEvent(event) {
        switch (event.type) {
            case EventType.RUN_STARTED:
                console.log('[AnalyzerFeature] Run started:', event.data.agentId);
                break;

            case EventType.PLAN_CREATED:
                console.log('[AnalyzerFeature] Plan created:', event.data.plan?.summary);
                // Could show plan in UI
                break;

            case EventType.PROGRESS_UPDATE:
                console.log('[AnalyzerFeature] Progress:', event.data.message);
                // Could update progress indicator
                break;

            case EventType.TOKEN_DELTA:
                // Token streaming - handled by canvas render
                break;

            case EventType.TOOL_CALL_REQUESTED:
                console.log('[AnalyzerFeature] Tool call:', event.data.toolId);
                break;

            case EventType.SUBAGENT_SPAWN_COMPLETED:
                console.log('[AnalyzerFeature] Sub-agent completed:', event.data.agentId);
                break;

            case EventType.ARTIFACT_CREATED:
                console.log('[AnalyzerFeature] Artifact created:', event.data.nodeId);
                // Artifact node already added to graph by RunController
                break;

            case EventType.RUN_COMPLETED:
                console.log('[AnalyzerFeature] Run completed:', event.data.metrics);
                break;

            case EventType.RUN_FAILED:
                console.error('[AnalyzerFeature] Run failed:', event.data.error);
                break;

            case EventType.APPROVAL_REQUESTED:
                // Handle HITL approval - could show modal
                console.log('[AnalyzerFeature] Approval requested:', event.data.actionType);
                // For now, auto-approve (in production, show UI)
                this.context.runController?.resolveApproval(event.runId, true);
                break;
        }
    }

    /**
     * Canvas event handlers for custom node interactions
     * @returns {Object<string, Function>}
     */
    getCanvasEventHandlers() {
        return {
            // Handle clicks on run nodes to show details
            runNodeClick: (nodeId) => {
                const node = this.graph.getNode(nodeId);
                if (node?.type === 'run') {
                    console.log('[AnalyzerFeature] Run node clicked:', node.runId);
                    // Could show run details modal
                }
            },
        };
    }
}

// =============================================================================
// Plugin Registration
// =============================================================================

// Register with the FeatureRegistry when loaded
if (typeof window !== 'undefined' && window.app) {
    // Get context from app
    const ctx = {
        graph: window.app.graph,
        canvas: window.app.canvas,
        chat: window.app.chat,
        storage: window.app.storage,
        modalManager: window.app.modalManager,
        undoManager: window.app.undoManager,
        runController: window.app.runController, // New: agent run controller
    };

    const feature = new AnalyzerFeature(ctx);
    FeatureRegistry.getInstance().registerFeature(feature, PRIORITY.COMMUNITY);
    console.log('[AnalyzerFeature] Registered with FeatureRegistry');
}

// Export for testing
export { AnalyzerFeature, ANALYZER_AGENT, RESEARCH_COORDINATOR_AGENT };
