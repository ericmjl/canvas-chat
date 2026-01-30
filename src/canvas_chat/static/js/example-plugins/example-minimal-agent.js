/**
 * Minimal Agent-Backed Plugin Example
 *
 * This is the simplest possible agent-backed plugin to demonstrate the pattern.
 * It shows how to:
 * 1. Define an agent
 * 2. Create a run request
 * 3. Handle the run lifecycle
 *
 * For a more complete example, see example-agent-plugin.js
 */

import { FeaturePlugin, PRIORITY } from '/static/js/feature-plugin.js';
import { FeatureRegistry } from '/static/js/feature-registry.js';
import { createAgentDefinition, createRunRequest, createRunContext, EventType } from '/static/js/agent/index.js';

// Step 1: Define your agent
const MY_AGENT = createAgentDefinition({
    id: 'my-simple-agent',
    name: 'Simple Agent',
    // model: optional - omit to use app-level default model
    systemPrompt: 'You are a helpful assistant that provides concise answers.',
    allowedTools: [],
    budgets: {
        maxTokens: 5000,
        maxToolCalls: 0,
        timeoutMs: 30000,
    },
});

class MinimalAgentFeature extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.graph = context.graph;
        this.canvas = context.canvas;
    }

    async onLoad() {
        // Step 2: Register agent with RunController
        if (this.context.runController) {
            this.context.runController.registerAgent(MY_AGENT);
            console.log('[MinimalAgentFeature] Agent registered');
        }
    }

    getSlashCommands() {
        return [
            {
                command: '/simple',
                description: 'Run simple agent task',
                placeholder: 'Task description...',
            },
        ];
    }

    async handleCommand(command, args, context) {
        if (command !== '/simple') return false;

        // Step 3: Create run context and request
        const runContext = createRunContext({
            sourceNodeIds: context.selectedNodeIds,
            userQuery: args,
            slashCommand: '/simple',
        });

        const runRequest = createRunRequest(MY_AGENT.id, runContext);

        // Step 4: Execute and handle events
        try {
            for await (const event of this.context.runController.startRun(runRequest)) {
                // Handle events (optional - RunController handles node creation)
                if (event.type === EventType.RUN_COMPLETED) {
                    console.log('[MinimalAgentFeature] Done!', event.data.metrics);
                }
            }
        } catch (error) {
            console.error('[MinimalAgentFeature] Error:', error);
        }

        return true;
    }
}

// Register plugin
if (typeof window !== 'undefined' && window.app) {
    const ctx = {
        graph: window.app.graph,
        canvas: window.app.canvas,
        chat: window.app.chat,
        storage: window.app.storage,
        modalManager: window.app.modalManager,
        undoManager: window.app.undoManager,
        runController: window.app.runController,
    };

    const feature = new MinimalAgentFeature(ctx);
    FeatureRegistry.getInstance().registerFeature(feature, PRIORITY.COMMUNITY);
}

export { MinimalAgentFeature, MY_AGENT };
