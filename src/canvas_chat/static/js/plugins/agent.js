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
import { EdgeType, NodeType, createEdge, createNode, getDefaultNodeSize } from '../graph-types.js';
import { apiUrl } from '../utils.js';
import { readSSEStream } from '../sse.js';

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

        const viewportContext = this.gatherViewportContext();

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
                    viewport_context: viewportContext,
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
     * @returns {Array<Object>}
     */
    gatherViewportContext() {
        const viewBox = this.canvas.viewBox;
        if (!viewBox) return [];

        const allNodes = this.graph.getAllNodes();
        const visible = allNodes.filter((node) => {
            if (!this.graph.isNodeVisible(node.id)) return false;
            const pos = node.position;
            if (!pos) return false;
            const size = getDefaultNodeSize(node.type);
            return (
                pos.x + size.width > viewBox.x &&
                pos.x < viewBox.x + viewBox.width &&
                pos.y + size.height > viewBox.y &&
                pos.y < viewBox.y + viewBox.height
            );
        });

        return visible.map((node) => ({
            id: node.id,
            type: node.type,
            title: node.title || '',
            content: (node.content || '').substring(0, 2000),
        }));
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
        let nodeType;
        let nodeData = {};
        let edgeType = EdgeType.GENERATES;
        let linkFromRefs = instruction.link_from_refs || null;

        switch (instruction.type) {
            case 'search': {
                nodeType = NodeType.SEARCH;
                nodeData.content = instruction.content || '';
                nodeData.title = instruction.title || 'Search';
                nodeData.position = this.graph.autoPosition([parentId]);
                break;
            }
            case 'reference': {
                nodeType = NodeType.REFERENCE;
                nodeData.content = instruction.content || '';
                nodeData.title = instruction.title || '';
                const searchId = lastSearchNodeId?.value || parentId;
                const searchNode = this.graph.getNode(searchId);
                nodeData.position = searchNode
                    ? { x: searchNode.position.x + 400, y: searchNode.position.y + referenceOffsetY }
                    : this.graph.autoPosition([parentId]);
                parentId = searchId;
                edgeType = EdgeType.SEARCH_RESULT;
                break;
            }
            case 'code':
                nodeType = NodeType.CODE;
                nodeData.code = instruction.code || '';
                nodeData.content = instruction.code || '';
                nodeData.title = instruction.title || 'Code';
                break;
            case 'note':
                nodeType = NodeType.NOTE;
                nodeData.content = instruction.content || '';
                nodeData.title = instruction.title || 'Note';
                break;
            case 'image':
                nodeType = NodeType.IMAGE;
                nodeData.imageData = instruction.imageData || '';
                nodeData.mimeType = instruction.mimeType || 'image/png';
                nodeData.title = instruction.title || 'Image';
                break;
            default:
                console.warn('[Agent] Unknown node type:', instruction.type);
                return null;
        }

        if (!nodeData.position) {
            nodeData.position = this.graph.autoPosition([parentId]);
        }

        const newNode = createNode(nodeType, nodeData.content || '', nodeData);
        this.graph.addNode(newNode);
        this.canvas.zoomToSelectionAnimated([newNode.id], 0.8, 300);

        if (linkFromRefs && refToNodeId) {
            const resolvedIds = linkFromRefs
                .map((ref) => refToNodeId.get(ref))
                .filter((id) => id);
            if (resolvedIds.length > 0) {
                for (const srcId of resolvedIds) {
                    const edge = createEdge(srcId, newNode.id, EdgeType.MERGE);
                    this.graph.addEdge(edge);
                }
            } else {
                const edge = createEdge(parentId, newNode.id, edgeType);
                this.graph.addEdge(edge);
            }
        } else {
            const edge = createEdge(parentId, newNode.id, edgeType);
            this.graph.addEdge(edge);
        }

        this.canvas.renderNode(newNode);
        this.canvas.updateAllEdges(this.graph);

        if (nodeType === NodeType.CODE && instruction.code) {
            this.executeCodeOnNode(newNode.id, instruction.code);
        }

        return newNode.id;
    }

    /**
     * @param {string} nodeId
     * @param {string} code
     * @returns {Promise<void>}
     */
    async executeCodeOnNode(nodeId, code) {
        const pyodideRunner = this._context.pyodideRunner;
        if (!pyodideRunner) {
            console.warn('[Agent] Pyodide not available for code execution');
            return;
        }

        this.graph.updateNode(nodeId, {
            executionState: 'running',
            code,
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));

        try {
            const csvDataMap = {};
            const csvNodeIds = this.graph.getNode(nodeId)?.csvNodeIds || [];
            for (const csvId of csvNodeIds) {
                const csvNode = this.graph.getNode(csvId);
                if (csvNode && csvNode.csvData) {
                    const varName = `df${csvNodeIds.indexOf(csvId) + 1}`;
                    csvDataMap[varName] = csvNode.csvData;
                }
            }

            const result = await pyodideRunner.run(code, csvDataMap, (msg) => {
                console.log('[Agent] Pyodide:', msg);
            });

            this.graph.updateNode(nodeId, {
                executionState: 'idle',
                lastError: null,
                outputStdout: result.stdout || null,
                outputHtml: result.resultHtml || null,
                outputText: result.resultText || null,
            });

            if (result.figures && result.figures.length > 0) {
                for (let i = 0; i < result.figures.length; i++) {
                    const fig = result.figures[i];
                    const position = this.graph.autoPosition([nodeId]);

                    if (typeof fig === 'object' && fig.type === 'plotly') {
                        const outputNode = createNode(NodeType.HTML, '', {
                            position,
                            title: result.figures.length === 1 ? 'Plot' : `Plot ${i + 1}`,
                            content: fig.html,
                        });
                        this.graph.addNode(outputNode);
                        this.canvas.panToNodeAnimated(outputNode.id);
                        const edge = createEdge(nodeId, outputNode.id, EdgeType.GENERATES);
                        this.graph.addEdge(edge);
                        this.canvas.renderNode(outputNode);
                    } else {
                        const dataUrl = typeof fig === 'string' ? fig : fig.image;
                        const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                        if (base64Match) {
                            const outputNode = createNode(NodeType.IMAGE, '', {
                                position,
                                title: result.figures.length === 1 ? 'Figure' : `Figure ${i + 1}`,
                                imageData: base64Match[2],
                                mimeType: base64Match[1],
                            });
                            this.graph.addNode(outputNode);
                            this.canvas.panToNodeAnimated(outputNode.id);
                            const edge = createEdge(nodeId, outputNode.id, EdgeType.GENERATES);
                            this.graph.addEdge(edge);
                            this.canvas.renderNode(outputNode);
                        }
                    }
                }
            }

            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.canvas.updateAllEdges(this.graph);
            this.saveSession();
        } catch (error) {
            this.graph.updateNode(nodeId, {
                executionState: 'error',
                lastError: error.message || 'Unknown error',
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.saveSession();
        }
    }
}

export { AgentFeature };
