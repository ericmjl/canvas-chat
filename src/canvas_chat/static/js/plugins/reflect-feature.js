/**
 * Reflect Feature Plugin
 *
 * Provides the /reflect command for analyzing conversation paths
 * and creating synthesis reflections.
 *
 * Usage:
 * - Press /reflect on a leaf node
 * - Agent analyzes the path from leaf back to branch point
 * - Creates a REFLECTION node with synthesized insights
 * - Displays results in a sidepanel with links to reflection nodes
 */

import { FeaturePlugin } from '../feature-plugin.js';
import {
    findLeafToBranchPath,
    gatherReflectionContext,
    attachReflectionToPath,
    addReflectionToNodeMetadata,
} from '../agent/reflection-utils.js';
import { executeReflection } from '../agent/reflection-agent.js';
import { NodeType, EdgeType, createNode } from '../graph-types.js';
import { reflectionLogger as logger } from '../agent/debug-logger.js';
import { createAgentDefinition } from '../agent/agent-types.js';
import { storage } from '../storage.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Reflection result for UI display
 * @typedef {Object} ReflectionResultUI
 * @property {string} reflectionNodeId - Created reflection node ID
 * @property {string} synthesis - The synthesized reflection text
 * @property {string} leafNodeId - Original leaf node
 * @property {string} branchNodeId - Branch point
 * @property {number} pathLength - Number of nodes in path
 * @property {string[]} pathNodeIds - All nodes in the path
 */

// =============================================================================
// Reflect Feature Plugin
// =============================================================================

export class ReflectFeature extends FeaturePlugin {
    /**
     * @param {AppContext} context - Application context
     */
    constructor(context) {
        super(context);

        // runController is accessed via getter from FeaturePlugin base class

        // Track active reflections for UI
        /** @type {Map<string, ReflectionResultUI>} */
        this.activeReflections = new Map();

        // Track reflection progress
        /** @type {Map<string, {status: string, progress: number}>} */
        this.reflectionProgress = new Map();

        logger.info('[ReflectFeature] Initialized');
    }

    /**
     * Get slash commands provided by this plugin
     * @returns {Array<{command: string, description: string, placeholder: string}>}
     */
    getSlashCommands() {
        return [
            {
                command: '/reflect',
                description: 'Analyze the path to this node and create a reflection',
                placeholder: 'Reflecting on conversation path...',
                requiresSelection: true,
                requiresSelectionMessage: 'Please select a node to reflect on',
            },
        ];
    }

    /**
     * Get the AgentDefinition for this feature.
     * Uses 'feature' engine for direct dispatch (reflection handled internally).
     * @returns {import('../agent/agent-types.js').AgentDefinition}
     */
    getAgentDefinition() {
        return createAgentDefinition({
            id: 'reflect-agent',
            name: 'Reflect Agent',
            engine: 'feature', // Feature handles reflection execution internally
            systemPrompt: 'Analyze conversation paths and synthesize reflections.',
            description: 'Analyzes conversation paths and creates reflection synthesis',
        });
    }

    /**
     * Handle the /reflect command
     * @param {string} command - The command that was executed
     * @param {string} args - Command arguments
     * @param {Object} context - Command execution context
     * @returns {Promise<void>}
     */
    async handleCommand(command, args, context) {
        console.log('[ReflectFeature] handleCommand called:', command, args, context);
        if (command !== '/reflect') {
            console.log('[ReflectFeature] Command mismatch, returning');
            return;
        }

        logger.enter('ReflectFeature.handleCommand', { command, args, hasContext: !!context });

        try {
            // Get the selected node from context (passed by BaseAgent)
            const selectedNodeIds = context?.selectedNodeIds || [];
            console.log('[ReflectFeature] selectedNodeIds:', selectedNodeIds);

            if (selectedNodeIds.length === 0) {
                logger.warn('No node selected for reflection');
                this.showToast?.('Please select a node to reflect on', 'warning');
                return;
            }

            const selectedNodeId = selectedNodeIds[0];
            const selectedNode = this.graph.getNode(selectedNodeId);
            console.log('[ReflectFeature] selectedNode:', selectedNode?.id, selectedNode?.type);

            if (!selectedNode) {
                logger.warn('Selected node not found in graph');
                this.showToast?.('Selected node not found', 'warning');
                return;
            }

            logger.info(`Starting reflection on node: ${selectedNode.id.slice(0, 8)}`);
            console.log('[ReflectFeature] Starting reflection execution...');
            this.showToast?.('🔍 Starting reflection agent...', 'info');

            // Create a progress tracker
            const progressNodeId = crypto.randomUUID();
            this.reflectionProgress.set(progressNodeId, { status: 'running', progress: 0 });

            console.log('[ReflectFeature] Calling executeReflection with:', {
                selectedNodeId: selectedNode.id,
                model: this.getCurrentModel(),
                modelPickerValue: this.modelPicker?.value,
            });

            // Show agent status in bottom bar
            this.showAgentStatus?.('🔮 Starting reflection analysis...');

            // Execute reflection using the agentic approach
            // Agent will use graph tools to gather context autonomously
            const reflectionResult = await executeReflection({
                selectedNodeId: selectedNode.id,
                graph: this.graph,
                chat: this.chat,
                model: this.getCurrentModel(),
                onProgress: (msg) => {
                    logger.debug(`Reflection progress: ${msg}`);
                    console.log('[ReflectFeature] Progress:', msg);
                    // Update agent status in bottom bar
                    this.showAgentStatus?.(`🔮 ${msg}`);
                    if (this.reflectionProgress.has(progressNodeId)) {
                        this.reflectionProgress.get(progressNodeId).status = msg;
                    }
                },
            });

            // Hide agent status
            this.hideAgentStatus?.();

            console.log('[ReflectFeature] executeReflection returned:', reflectionResult);
            logger.info(`Reflection completed. Creating reflection node...`);

            // Find the path for metadata (now just for node creation context)
            const path = findLeafToBranchPath(selectedNode.id, this.graph);

            // Create a REFLECTION node in the graph
            const reflectionNode = createNode(NodeType.REFLECTION, reflectionResult.synthesis, {
                position: {
                    x: selectedNode.position.x + 700,
                    y: selectedNode.position.y,
                },
                title: `🔮 Reflection`,
            });

            // Add metadata linking to the run + display configuration
            reflectionNode.metadata = {
                reflectionRunId: reflectionResult.reflectionRunId,
                leafNodeId: path.leafNodeId,
                branchNodeId: path.branchNodeId,
                pathNodeIds: path.nodeIds,
                pathLength: path.nodeIds.length,
                toolCalls: reflectionResult.toolCalls?.length || 0,
                createdAt: Date.now(),
                // Data-driven display - BaseNode reads this automatically
                display: {
                    typeLabel: 'Reflection',
                    typeIcon: '🔮',
                    subtitle: `${path.nodeIds.length} nodes analyzed`,
                    actions: ['reply', 'copy'],
                },
            };

            // Add to graph
            this.graph.addNode(reflectionNode);
            logger.info(`Created reflection node: ${reflectionNode.id.slice(0, 8)}`);

            // Attach edges
            attachReflectionToPath(reflectionNode.id, path.branchNodeId, path.leafNodeId, this.graph);

            // Update node metadata
            const leafNode = this.graph.getNode(path.leafNodeId);
            const branchNode = this.graph.getNode(path.branchNodeId);
            addReflectionToNodeMetadata(leafNode, reflectionNode.id);
            addReflectionToNodeMetadata(branchNode, reflectionNode.id);
            this.graph.updateNode(leafNode);
            this.graph.updateNode(branchNode);

            // Render the new reflection node
            this.canvas.renderNode(reflectionNode);

            // Show reflection in sidepanel
            const resultUI = {
                reflectionNodeId: reflectionNode.id,
                synthesis: reflectionResult.synthesis,
                leafNodeId: path.leafNodeId,
                branchNodeId: path.branchNodeId,
                pathLength: path.nodeIds.length,
                pathNodeIds: path.nodeIds,
            };
            this.activeReflections.set(reflectionNode.id, resultUI);

            // Emit event to show sidepanel
            if (this.canvas.onReflectionComplete) {
                this.canvas.onReflectionComplete(resultUI);
            }

            logger.exit('ReflectFeature.handleCommand', {
                reflectionNodeId: reflectionNode.id.slice(0, 8),
                synthesisLength: reflectionResult.synthesis.length,
            });
        } catch (error) {
            // Hide agent status on error
            this.hideAgentStatus?.();
            console.error('[ReflectFeature] Error in handleCommand:', error);
            logger.error(`Reflection failed: ${error.message}`);
            this.showToast?.(`❌ Reflection failed: ${error.message}`, 'error');
            logger.exit('ReflectFeature.handleCommand', { error: error.message });
        }
    }

    /**
     * Get canvas event handlers
     * @returns {Object<string, Function>}
     */
    getCanvasEventHandlers() {
        return {
            reflectionNodeClicked: (nodeId) => this.handleReflectionNodeClicked(nodeId),
        };
    }

    /**
     * Handle clicking on a reflection node to show details
     * @param {string} nodeId - Reflection node ID
     */
    handleReflectionNodeClicked(nodeId) {
        logger.enter('ReflectFeature.handleReflectionNodeClicked', { nodeId });

        const reflection = this.activeReflections.get(nodeId);
        if (reflection) {
            this.showReflectionSidepanel(reflection);
        }

        logger.exit('ReflectFeature.handleReflectionNodeClicked');
    }

    /**
     * Show reflection results in sidepanel
     * @param {ReflectionResultUI} result - Reflection result
     */
    showReflectionSidepanel(result) {
        logger.enter('ReflectFeature.showReflectionSidepanel', {
            reflectionNodeId: result.reflectionNodeId.slice(0, 8),
        });

        // Create sidepanel HTML
        const sidepanelHTML = `
            <div class="reflection-sidepanel">
                <div class="reflection-header">
                    <h2>Reflection Analysis</h2>
                    <button class="close-btn" onclick="this.closest('.reflection-sidepanel').remove()">✕</button>
                </div>

                <div class="reflection-summary">
                    <strong>Path Analysis:</strong> ${result.pathLength} nodes from branch to leaf
                </div>

                <div class="reflection-content">
                    ${this.formatReflectionContent(result.synthesis)}
                </div>

                <div class="reflection-nodes">
                    <strong>Path Nodes:</strong>
                    <div class="path-node-list">
                        ${result.pathNodeIds
                            .map((nodeId) => {
                                const node = this.graph.getNode(nodeId);
                                const label = node?.title || node?.type || 'Unknown';
                                return `
                            <div class="path-node" data-node-id="${nodeId}" onclick="selectNode('${nodeId}')">
                                ${label}
                            </div>
                        `;
                            })
                            .join('')}
                    </div>
                </div>

                <div class="reflection-actions">
                    <button class="action-btn" onclick="navigateToNode('${result.reflectionNodeId}')">
                        View Reflection Node
                    </button>
                    <button class="action-btn" onclick="shareReflection('${result.reflectionNodeId}')">
                        Share
                    </button>
                </div>
            </div>
        `;

        // For now, log it - in a real implementation, render to a sidepanel div
        logger.debug(`Sidepanel HTML created: ${sidepanelHTML.length} chars`);

        logger.exit('ReflectFeature.showReflectionSidepanel');
    }

    /**
     * Format reflection content for display
     * @param {string} content - Raw reflection content
     * @returns {string} Formatted HTML
     */
    formatReflectionContent(content) {
        // Convert markdown-like formatting to HTML
        let formatted = content
            .split('\n')
            .map((line) => {
                if (line.startsWith('##')) return `<h3>${line.replace(/^##\s*/, '')}</h3>`;
                if (line.startsWith('#')) return `<h2>${line.replace(/^#\s*/, '')}</h2>`;
                if (line.startsWith('-')) return `<li>${line.replace(/^-\s*/, '')}</li>`;
                if (line.trim() === '') return '<br>';
                return `<p>${line}</p>`;
            })
            .join('');

        return formatted;
    }

    /**
     * Get the current LLM model from settings
     * @returns {string} Model ID
     */
    getCurrentModel() {
        // Get from model picker (injected via FeaturePlugin context)
        // modelPicker.value contains full model ID like 'openai/gpt-4'
        return this.modelPicker?.value || storage.getCurrentModel() || 'openai/gpt-4';
    }

    /**
     * Plugin lifecycle: onLoad
     */
    async onLoad() {
        logger.info('[ReflectFeature] Loaded');
        // Could register modals or other resources here if needed
    }

    /**
     * Plugin lifecycle: onUnload
     */
    async onUnload() {
        logger.info('[ReflectFeature] Unloaded');
        this.activeReflections.clear();
        this.reflectionProgress.clear();
    }
}

export default ReflectFeature;

// =============================================================================
// Note: ReflectionNode no longer needs a custom protocol class.
// Display is now data-driven via node.metadata.display (typeLabel, typeIcon, actions).
// BaseNode reads this automatically, so no NodeRegistry.register() needed.
// =============================================================================

console.log('[ReflectFeature] Loaded (using data-driven display)');
