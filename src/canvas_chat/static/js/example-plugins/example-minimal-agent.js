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

import { FeaturePlugin } from '/static/js/feature-plugin.js';
import { FeatureRegistry, PRIORITY } from '/static/js/feature-registry.js';
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

/**
 *
 */
class MinimalAgentFeature extends FeaturePlugin {
    /**
     *
     * @param context
     */
    constructor(context) {
        super(context);
        this.canvas = context.canvas;
    }

    /**
     *
     */
    async onLoad() {
        // Step 2: Register agent with RunController
        if (this._context.runController) {
            this._context.runController.registerAgent(MY_AGENT);
            console.log('[MinimalAgentFeature] Agent registered');
        }
    }

    /**
     *
     */
    getSlashCommands() {
        return [
            {
                command: '/simple',
                description: 'Run simple agent task',
                placeholder: 'Task description...',
            },
        ];
    }

    /**
     *
     * @param command
     * @param args
     * @param context
     */
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
            for await (const event of this._context.runController.startRun(runRequest)) {
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
let registerFeature = null;

if (typeof window !== 'undefined') {
    let registering = false;
    let registered = false;
    let attempts = 0;
    const maxAttempts = 120; // ~30s at 250ms intervals
    registerFeature = (app) => {
        if (registered || registering) return;
        if (attempts >= maxAttempts) {
            console.warn('[MinimalAgentFeature] Gave up registering after max attempts');
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
                id: 'example-minimal-agent',
                feature: MinimalAgentFeature,
                slashCommands: [{ command: '/simple', handler: 'handleCommand' }],
                priority: PRIORITY.COMMUNITY,
            })
            .then(() => {
                registered = true;
                console.log('[MinimalAgentFeature] Registered with FeatureRegistry');
            })
            .catch((err) => {
                registering = false;
                attempts += 1;
                console.error('[MinimalAgentFeature] Failed to register with FeatureRegistry:', err);
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

/**
 *
 * @param app
 */
export function registerPlugin(app) {
    if (typeof window === 'undefined' || !registerFeature) {
        return;
    }
    registerFeature(app || window.app);
}

export { MinimalAgentFeature, MY_AGENT };
