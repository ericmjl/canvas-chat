/**
 * Agent Plugin (Built-in)
 *
 * Provides agentic mode where an LLM can use tools (code execution,
 * image generation, web search, note creation) and create multiple
 * canvas nodes in response to a single user message.
 *
 * Each tool call creates visible nodes on the canvas graph,
 * so the agent "shows its work" visually.
 *
 * Activated via `/agent` slash command.
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { EdgeType, NodeType, createEdge, createNode } from '../graph-types.js';
import { apiUrl } from '../utils.js';
import { readSSEStream } from '../sse.js';
import {
    applyTagUpdate as _applyTagUpdate,
    createNodeFromInstruction as _createNodeFromInstruction,
    executeCodeOnNode as _executeCodeOnNode,
    gatherViewportContext as _gatherViewportContext,
} from '../agent-utils.js';

/**
 *
 */
class AgentFeature extends FeaturePlugin {
    /**
     * @param {Object} context
     */
    constructor(context) {
        super(context);
    }

    /**
     * @returns {string}
     */
    get id() {
        return 'agent';
    }

    /**
     * @returns {Array<Object>}
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
     * @param {string} command
     * @param {string} args
     * @param {Object} _context
     * @returns {Promise<boolean>}
     */
    async handleCommand(command, args, _context) {
        if (command !== '/agent') return false;
        if (!args || !args.trim()) {
            this.showToast('Please provide a message for the agent.');
            return true;
        }
        await this.runAgent(args.trim());
        return true;
    }

    /**
     * @param {string} message
     * @returns {Promise<void>}
     */
    async runAgent(message) {
        const model = this.modelPicker.value;

        const humanNode = createNode(NodeType.HUMAN, message, {
            position: this.graph.autoPosition([]),
        });
        this.graph.addNode(humanNode);
        this.canvas.zoomToSelectionAnimated([humanNode.id], 0.8, 300);

        const agentNode = createNode(NodeType.AI, 'Working...', {
            position: this.graph.autoPosition([humanNode.id]),
            model: model.split('/').pop(),
        });
        this.graph.addNode(agentNode);
        this.canvas.zoomToSelectionAnimated([agentNode.id], 0.8, 300);

        const agentEdge = createEdge(humanNode.id, agentNode.id, EdgeType.REPLY);
        this.graph.addEdge(agentEdge);
        this.updateCollapseButtonForNode(humanNode.id);

        const ctx = this.gatherViewportContext();

        const apiMessages = [{ role: 'user', content: message }];

        const abortController = new AbortController();

        this.streamingManager.register(agentNode.id, {
            abortController,
            featureId: 'agent',
            context: { messages: apiMessages, model, agentNodeId: agentNode.id },
            onContinue: async () => {
                await this.runAgent('continue');
            },
        });

        let fullContent = '';
        const lastToolParentId = { value: agentNode.id };
        const lastSearchNodeId = { value: null };
        let referenceOffsetY = 0;
        const refToNodeId = new Map();

        try {
            const llmRequest = this.buildLLMRequest({});

            const response = await fetch(apiUrl('/api/agent'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    viewport_context: ctx.nodes || ctx,
                    model: llmRequest.model,
                    api_key: llmRequest.api_key || null,
                    base_url: llmRequest.base_url || null,
                    temperature: 0.7,
                }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Agent request failed: ${response.status} ${errorText}`);
            }

            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'set_parents') {
                        try {
                            const parentIds = JSON.parse(data);
                            if (Array.isArray(parentIds) && parentIds.length > 0) {
                                for (const pid of parentIds) {
                                    const node = this.graph.getNode(pid);
                                    if (node) {
                                        const edgeType = parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY;
                                        const edge = createEdge(pid, humanNode.id, edgeType);
                                        this.graph.addEdge(edge);
                                        this.updateCollapseButtonForNode(pid);
                                    }
                                }
                                this.canvas.updateAllEdges(this.graph);
                                this.canvas.renderNode(this.graph.getNode(humanNode.id));
                            }
                        } catch (e) {
                            console.warn('[Agent] Failed to parse set_parents:', e);
                        }
                    } else if (eventType === 'text') {
                        fullContent += data;
                        this.canvas.updateNodeContent(agentNode.id, fullContent, true);
                        this.graph.updateNode(agentNode.id, { content: fullContent });
                    } else if (eventType === 'node_create') {
                        try {
                            const instruction = JSON.parse(data);
                            if (instruction.type === 'search') {
                                referenceOffsetY = 0;
                            }
                            const newNodeId = this.createNodeFromInstruction(
                                instruction,
                                lastToolParentId.value,
                                lastSearchNodeId,
                                referenceOffsetY,
                                refToNodeId
                            );
                            if (newNodeId) {
                                if (instruction.ref) {
                                    refToNodeId.set(instruction.ref, newNodeId);
                                }
                                if (instruction.type === 'search') {
                                    lastToolParentId.value = newNodeId;
                                    lastSearchNodeId.value = newNodeId;
                                } else if (instruction.type === 'reference') {
                                    referenceOffsetY += 200;
                                } else {
                                    lastToolParentId.value = newNodeId;
                                }
                            }
                        } catch (e) {
                            console.warn('[Agent] Failed to parse node_create:', e);
                        }
                    } else if (eventType === 'tag_update') {
                        try {
                            const tagInstruction = JSON.parse(data);
                            _applyTagUpdate(
                                tagInstruction,
                                this.graph,
                                this.canvas,
                                () => this.saveSession(),
                                (msg) => this.showToast(msg)
                            );
                        } catch (e) {
                            console.warn('[Agent] Failed to parse tag_update:', e);
                        }
                    }
                },
                onDone: () => {
                    this.streamingManager.unregister(agentNode.id);
                    const finalContent = fullContent || '(No text response — see linked nodes for results)';
                    this.canvas.updateNodeContent(agentNode.id, finalContent, false);
                    this.graph.updateNode(agentNode.id, { content: finalContent });
                    this.saveSession();
                    if (this.generateNodeSummary) {
                        this.generateNodeSummary(agentNode.id);
                    }
                },
                onError: (err) => {
                    this.streamingManager.unregister(agentNode.id);
                    const errorLine = `\n\n⚠️ Error: ${err.message}`;
                    fullContent += errorLine;
                    this.canvas.updateNodeContent(agentNode.id, fullContent, false);
                    this.graph.updateNode(agentNode.id, { content: fullContent });
                    this.saveSession();
                },
            });
        } catch (err) {
            this.streamingManager.unregister(agentNode.id);
            if (err.name !== 'AbortError') {
                const errorLine = `\n\n⚠️ Error: ${err.message}`;
                fullContent += errorLine;
                this.canvas.updateNodeContent(agentNode.id, fullContent, false);
                this.graph.updateNode(agentNode.id, { content: fullContent });
            }
            this.saveSession();
        }
    }

    /**
     * @returns {Object}
     */
    gatherViewportContext() {
        return _gatherViewportContext(this.graph, this.canvas);
    }

    /**
     * @param {Object} instruction - Node creation instruction from backend
     * @param {string} parentId - Default parent node ID to link from
     * @param {Object} lastSearchNodeId - { value: string|null } tracks last search node for reference linking
     * @param {number} referenceOffsetY - Vertical offset for stacking reference nodes
     * @param {Map} refToNodeId - Map from backend ref labels to frontend node IDs
     * @returns {string|null} New node ID, or null on failure
     */
    createNodeFromInstruction(instruction, parentId, lastSearchNodeId, referenceOffsetY, refToNodeId) {
        return _createNodeFromInstruction(
            instruction, parentId, lastSearchNodeId, referenceOffsetY, refToNodeId,
            this.graph, this.canvas, createNode, createEdge, NodeType, EdgeType,
            () => this.saveSession(),
            (nodeId, code) => this.executeCodeOnNode(nodeId, code)
        );
    }

    /**
     * @param {string} nodeId
     * @param {string} code
     * @returns {Promise<void>}
     */
    async executeCodeOnNode(nodeId, code) {
        return _executeCodeOnNode(
            nodeId, code,
            this.graph, this.canvas,
            this._context.pyodideRunner,
            () => this.saveSession(),
            createNode, createEdge, NodeType, EdgeType
        );
    }
}

export { AgentFeature };
