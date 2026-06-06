/**
 * Agent Utilities - Shared functions for agent-based features
 *
 * Extracted from AgentFeature so that RealtimeAgentPlugin and future
 * agent variants can reuse the same node creation, viewport context,
 * and code execution logic without duplicating code.
 */

import { getDefaultNodeSize } from './graph-types.js';

/**
 * Gather visible viewport context for LLM awareness.
 *
 * @param {Object} graph - CRDTGraph instance
 * @param {Object} canvas - Canvas instance
 * @returns {Array<Object>} Array of visible node summaries
 */
function gatherViewportContext(graph, canvas) {
    const viewBox = canvas.viewBox;
    if (!viewBox) return [];

    const allNodes = graph.getAllNodes();
    const visible = allNodes.filter((node) => {
        if (!graph.isNodeVisible(node.id)) return false;
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
 * Create a canvas node from a backend instruction object.
 *
 * All graph/canvas dependencies are passed explicitly so this function
 * is not coupled to any specific plugin class.
 *
 * @param {Object} instruction - Node creation instruction from backend
 * @param {string} parentId - Default parent node ID to link from
 * @param {Object} lastSearchNodeId - { value: string|null } tracks last search node
 * @param {number} referenceOffsetY - Vertical offset for stacking reference nodes
 * @param {Map} refToNodeId - Map from backend ref labels to frontend node IDs
 * @param {Object} graph - CRDTGraph instance
 * @param {Object} canvas - Canvas instance
 * @param {Function} _createNode - createNode factory (from graph-types.js)
 * @param {Function} _createEdge - createEdge factory (from graph-types.js)
 * @param {Object} _NodeType - NodeType enum (from graph-types.js)
 * @param {Object} _EdgeType - EdgeType enum (from graph-types.js)
 * @param {Function} saveSession - Save session callback
 * @param {Function} executeCodeFn - (nodeId, code) => Promise<void> for code execution
 * @returns {string|null} New node ID, or null on failure
 */
function createNodeFromInstruction(
    instruction,
    parentId,
    lastSearchNodeId,
    referenceOffsetY,
    refToNodeId,
    graph,
    canvas,
    _createNode,
    _createEdge,
    _NodeType,
    _EdgeType,
    saveSession,
    executeCodeFn
) {
    let nodeType;
    let nodeData = {};
    let edgeType = _EdgeType.GENERATES;
    let linkFromRefs = instruction.link_from_refs || null;

    switch (instruction.type) {
        case 'search': {
            nodeType = _NodeType.SEARCH;
            nodeData.content = instruction.content || '';
            nodeData.title = instruction.title || 'Search';
            nodeData.position = graph.autoPosition([parentId]);
            break;
        }
        case 'reference': {
            nodeType = _NodeType.REFERENCE;
            nodeData.content = instruction.content || '';
            nodeData.title = instruction.title || '';
            const searchId = lastSearchNodeId?.value || parentId;
            const searchNode = graph.getNode(searchId);
            nodeData.position = searchNode
                ? { x: searchNode.position.x + 400, y: searchNode.position.y + referenceOffsetY }
                : graph.autoPosition([parentId]);
            parentId = searchId;
            edgeType = _EdgeType.SEARCH_RESULT;
            break;
        }
        case 'code':
            nodeType = _NodeType.CODE;
            nodeData.code = instruction.code || '';
            nodeData.content = instruction.code || '';
            nodeData.title = instruction.title || 'Code';
            break;
        case 'note':
            nodeType = _NodeType.NOTE;
            nodeData.content = instruction.content || '';
            nodeData.title = instruction.title || 'Note';
            break;
        case 'image':
            nodeType = _NodeType.IMAGE;
            nodeData.imageData = instruction.imageData || '';
            nodeData.mimeType = instruction.mimeType || 'image/png';
            nodeData.title = instruction.title || 'Image';
            break;
        default:
            console.warn('[agent-utils] Unknown node type:', instruction.type);
            return null;
    }

    if (!nodeData.position) {
        nodeData.position = graph.autoPosition([parentId]);
    }

    const newNode = _createNode(nodeType, nodeData.content || '', nodeData);
    graph.addNode(newNode);
    canvas.zoomToSelectionAnimated([newNode.id], 0.8, 300);

    if (linkFromRefs && refToNodeId) {
        const resolvedIds = linkFromRefs
            .map((ref) => refToNodeId.get(ref))
            .filter((id) => id);
        if (resolvedIds.length > 0) {
            for (const srcId of resolvedIds) {
                const edge = _createEdge(srcId, newNode.id, _EdgeType.MERGE);
                graph.addEdge(edge);
            }
        } else {
            const edge = _createEdge(parentId, newNode.id, edgeType);
            graph.addEdge(edge);
        }
    } else {
        const edge = _createEdge(parentId, newNode.id, edgeType);
        graph.addEdge(edge);
    }

    canvas.renderNode(newNode);
    canvas.updateAllEdges(graph);

    if (nodeType === _NodeType.CODE && instruction.code) {
        executeCodeFn(newNode.id, instruction.code);
    }

    return newNode.id;
}

/**
 * Execute Python code on a code node using Pyodide.
 *
 * @param {string} nodeId - Code node ID
 * @param {string} code - Python code to execute
 * @param {Object} graph - CRDTGraph instance
 * @param {Object} canvas - Canvas instance
 * @param {Object|null} pyodideRunner - Pyodide runner instance
 * @param {Function} saveSession - Save session callback
 * @param {Function} _createNode - createNode factory
 * @param {Function} _createEdge - createEdge factory
 * @param {Object} _NodeType - NodeType enum
 * @param {Object} _EdgeType - EdgeType enum
 * @returns {Promise<void>}
 */
async function executeCodeOnNode(
    nodeId,
    code,
    graph,
    canvas,
    pyodideRunner,
    saveSession,
    _createNode,
    _createEdge,
    _NodeType,
    _EdgeType
) {
    if (!pyodideRunner) {
        console.warn('[agent-utils] Pyodide not available for code execution');
        return;
    }

    graph.updateNode(nodeId, {
        executionState: 'running',
        code,
    });
    canvas.renderNode(graph.getNode(nodeId));

    try {
        const csvDataMap = {};
        const csvNodeIds = graph.getNode(nodeId)?.csvNodeIds || [];
        for (const csvId of csvNodeIds) {
            const csvNode = graph.getNode(csvId);
            if (csvNode && csvNode.csvData) {
                const varName = `df${csvNodeIds.indexOf(csvId) + 1}`;
                csvDataMap[varName] = csvNode.csvData;
            }
        }

        const result = await pyodideRunner.run(code, csvDataMap, (msg) => {
            console.log('[agent-utils] Pyodide:', msg);
        });

        graph.updateNode(nodeId, {
            executionState: 'idle',
            lastError: null,
            outputStdout: result.stdout || null,
            outputHtml: result.resultHtml || null,
            outputText: result.resultText || null,
        });

        if (result.figures && result.figures.length > 0) {
            for (let i = 0; i < result.figures.length; i++) {
                const fig = result.figures[i];
                const position = graph.autoPosition([nodeId]);

                if (typeof fig === 'object' && fig.type === 'plotly') {
                    const outputNode = _createNode(_NodeType.HTML, '', {
                        position,
                        title: result.figures.length === 1 ? 'Plot' : `Plot ${i + 1}`,
                        content: fig.html,
                    });
                    graph.addNode(outputNode);
                    canvas.panToNodeAnimated(outputNode.id);
                    const edge = _createEdge(nodeId, outputNode.id, _EdgeType.GENERATES);
                    graph.addEdge(edge);
                    canvas.renderNode(outputNode);
                } else {
                    const dataUrl = typeof fig === 'string' ? fig : fig.image;
                    const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (base64Match) {
                        const outputNode = _createNode(_NodeType.IMAGE, '', {
                            position,
                            title: result.figures.length === 1 ? 'Figure' : `Figure ${i + 1}`,
                            imageData: base64Match[2],
                            mimeType: base64Match[1],
                        });
                        graph.addNode(outputNode);
                        canvas.panToNodeAnimated(outputNode.id);
                        const edge = _createEdge(nodeId, outputNode.id, _EdgeType.GENERATES);
                        graph.addEdge(edge);
                        canvas.renderNode(outputNode);
                    }
                }
            }
        }

        canvas.renderNode(graph.getNode(nodeId));
        canvas.updateAllEdges(graph);
        saveSession();
    } catch (error) {
        graph.updateNode(nodeId, {
            executionState: 'error',
            lastError: error.message || 'Unknown error',
        });
        canvas.renderNode(graph.getNode(nodeId));
        saveSession();
    }
}

export { createNodeFromInstruction, executeCodeOnNode, gatherViewportContext };
