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
 * 3. (Disabled) This example no longer registers slash commands
 *
 * @module example-agent-plugin
 */

import { FeaturePlugin } from '/static/js/feature-plugin.js';
import { PRIORITY } from '/static/js/feature-registry.js';
import { enableAgentDebug } from '/static/js/agent/index.js';

// =============================================================================
// Feature Plugin Implementation
// =============================================================================

/**
 * AnalyzerFeature - Example agent-backed feature plugin
 * Slash commands were removed; this now serves as a minimal plugin example.
 */
class AnalyzerFeature extends FeaturePlugin {
    /**
     * @param {import('/static/js/feature-plugin.js').AppContext} context
     */
    constructor(context) {
        super(context);

        // Agent debug flag - enable for development
        this.debug = false;
    }

    /**
     * Plugin lifecycle: called when plugin is loaded
     */
    async onLoad() {
        console.log('[AnalyzerFeature] Loading agent-backed feature plugin...');

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
        return [];
    }

    /**
     * Handle slash commands
     * @param {string} command - The slash command (e.g., '/analyze')
     * @param {string} args - Arguments after the command
     * @param {Object} context - Command context
     * @returns {Promise<boolean>} - True if command was handled
     */
    async handleCommand(command, args, context) {
        return false;
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

let registerFeature = null;

if (typeof window !== 'undefined') {
    let registering = false;
    let registered = false;
    let attempts = 0;
    const maxAttempts = 120; // ~30s at 250ms intervals
    registerFeature = (app) => {
        if (registered || registering) return;
        if (attempts >= maxAttempts) {
            console.warn('[AnalyzerFeature] Gave up registering after max attempts');
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
                id: 'example-agent',
                feature: AnalyzerFeature,
                priority: PRIORITY.COMMUNITY,
            })
            .then(() => {
                registered = true;
                console.log('[AnalyzerFeature] Registered with FeatureRegistry');
            })
            .catch((err) => {
                registering = false;
                attempts += 1;
                console.error('[AnalyzerFeature] Failed to register with FeatureRegistry:', err);
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

// Export for testing
export { AnalyzerFeature };
