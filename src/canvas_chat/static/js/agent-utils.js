/**
 * Agent Utilities - Shared functions for agent-based features
 *
 * Extracted from AgentFeature so that RealtimeAgentPlugin and future
 * agent variants can reuse the same node creation, viewport context,
 * and code execution logic without duplicating code.
 */

import { getDefaultNodeSize, TAG_COLORS } from './graph-types.js';

const COLOR_NAME_MAP = {
    red: '#ffc9c9',
    orange: '#ffd8a8',
    yellow: '#fff3bf',
    green: '#c0eb75',
    blue: '#a5d8ff',
    purple: '#d0bfff',
    pink: '#fcc2d7',
    gray: '#e9ecef',
    grey: '#e9ecef',
};

/**
 * Read the canvas tag catalog.
 *
 * @param {Object} graph - CRDTGraph instance
 * @returns {{ allTags: Object, availableTags: Array, availableColors: Array }}
 */
function tagCatalog(graph) {
    const allTags = graph.getAllTags ? graph.getAllTags() : {};
    const availableTags = Object.values(allTags).map((tag) => ({
        name: tag.name,
        color: tag.color,
    }));
    const usedColors = new Set(Object.keys(allTags));
    const availableColors = TAG_COLORS.filter((color) => !usedColors.has(color));
    return { allTags, availableTags, availableColors };
}

/**
 * Gather visible viewport context for LLM awareness.
 *
 * Tag catalog is included even when the viewport is unavailable so voice
 * and text agents can still create and rename tags.
 *
 * @param {Object} graph - CRDTGraph instance
 * @param {Object} canvas - Canvas instance
 * @returns {Object} { nodes: Array, available_tags: Array, available_colors: Array }
 */
function gatherViewportContext(graph, canvas) {
    const { allTags, availableTags, availableColors } = tagCatalog(graph);
    const viewBox = canvas.viewBox;
    if (!viewBox) {
        return { nodes: [], available_tags: availableTags, available_colors: availableColors };
    }

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

    const nodes = visible.map((node) => {
        const nodeTagColors = node.tags || [];
        const nodeTagNames = nodeTagColors
            .map((color) => {
                const tag = allTags[color];
                return tag ? tag.name : null;
            })
            .filter(Boolean);
        return {
            id: node.id,
            type: node.type,
            title: node.title || '',
            content: (node.content || '').substring(0, 2000),
            tags: nodeTagNames,
        };
    });

    return { nodes, available_tags: availableTags, available_colors: availableColors };
}

/**
 * Format viewport context for the text agent's prompt.
 *
 * Mirrors the voice-session system prompt: visible nodes (with tag names),
 * the tag catalog, and how many color slots are free.
 *
 * @param {Object} viewport - Result of gatherViewportContext
 * @returns {string} Prompt section, or '' when the canvas has nothing to show
 */
function formatViewportForPrompt(viewport) {
    const nodes = viewport.nodes || [];
    const tags = viewport.available_tags || [];
    const freeColors = viewport.available_colors || [];
    if (nodes.length === 0 && tags.length === 0) return '';

    const lines = [];
    if (nodes.length > 0) {
        lines.push('## Visible canvas nodes');
        for (const node of nodes) {
            const label = node.title || node.type;
            const tagStr = node.tags && node.tags.length ? ` [tags: ${node.tags.join(', ')}]` : '';
            const preview = (node.content || '').substring(0, 500) || '(empty)';
            lines.push(`[${node.type}] ${label} (id: ${node.id})${tagStr}:\n${preview}`);
        }
    }
    if (tags.length > 0) {
        lines.push('## Available tags');
        for (const tag of tags) {
            lines.push(`- ${tag.name} (color: ${tag.color})`);
        }
    }
    if (freeColors.length > 0) {
        lines.push(`Free tag colors for creating new tags: ${freeColors.length} available`);
    } else if (tags.length > 0) {
        lines.push('All 8 tag slots are in use. Remove a tag before creating a new one.');
    }
    lines.push(
        "Tag color names: red, orange, yellow, green, blue, purple, pink, gray. " +
            "When the user says 'the green tag', use tag_color_name='green'."
    );
    return lines.join('\n\n');
}

/**
 * Create a canvas node from a backend instruction object.
 *
 * All graph/canvas dependencies are passed explicitly so this function
 * is not coupled to any specific plugin class.
 *
 * @param {Object} instruction - Node creation instruction from backend
 * @param {string} parentId - Default parent node ID to link from
 * @param {Map} refToNodeId - Map from backend ref labels (e.g. 'node-1') to frontend node IDs
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

    switch (instruction.type) {
        case 'search': {
            nodeType = _NodeType.SEARCH;
            nodeData.content = instruction.content || '';
            nodeData.title = instruction.title || 'Search';
            nodeData.position = graph.autoPosition([parentId]);
            // Carousel results from the backend (mirrors /search in
            // research.js): stored as a JSON string so SearchNode protocol
            // and resolveContextWithSearchResults read them identically.
            if (instruction.search_results) {
                nodeData.searchResults = JSON.stringify(instruction.search_results);
                nodeData.searchCarouselIndex = instruction.search_carousel_index ?? 0;
            }
            break;
        }
        case 'reference': {
            // Retained for backward compatibility — the agent no longer
            // emits reference fan-out for search (results live in the
            // carousel). "View content" child REFERENCE nodes are created
            // client-side by ResearchFeature, not through this path.
            nodeType = _NodeType.REFERENCE;
            nodeData.content = instruction.content || '';
            nodeData.title = instruction.title || '';
            if (instruction.url) nodeData.url = instruction.url;
            nodeData.position = graph.autoPosition([parentId]);
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

    // If the instruction specifies parent_nodes refs (e.g. ['node-1', 'node-3']),
    // create GENERATES edges from those nodes. Otherwise, edge from default parent.
    const linkFromRefs = instruction.link_from_refs || null;
    if (linkFromRefs && refToNodeId) {
        const resolvedIds = linkFromRefs
            .map((ref) => refToNodeId.get(ref))
            .filter((id) => id);
        if (resolvedIds.length > 0) {
            for (const srcId of resolvedIds) {
                graph.addEdge(_createEdge(srcId, newNode.id, _EdgeType.GENERATES));
            }
        } else {
            graph.addEdge(_createEdge(parentId, newNode.id, edgeType));
        }
    } else {
        graph.addEdge(_createEdge(parentId, newNode.id, edgeType));
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

/**
 * Notify the user and return the same message for the agent tool result.
 *
 * @param {Function} showToast - Toast notification callback
 * @param {string} message
 * @returns {string}
 */
function tagResult(showToast, message) {
    if (showToast) showToast(message);
    return message;
}

/**
 * Refresh tag chips and the tag drawer without clearing the selection.
 *
 * canvas.renderGraph() wipes selection. Node tag chips already repaint from
 * nodeUpdated for add/remove; rename only emits tagUpdated, which nothing
 * listens for, so renamed tags are repainted here. The drawer slots live on
 * App.renderTagSlots.
 *
 * @param {Object} graph - CRDTGraph instance
 * @param {Object} canvas - Canvas instance
 * @param {string[]} nodeIds - Nodes to repaint; empty repaints every node
 */
function refreshTagDisplay(graph, canvas, nodeIds) {
    let ids = nodeIds || [];
    if (ids.length === 0 && typeof graph.getAllNodes === 'function') {
        ids = graph.getAllNodes().map((node) => node.id);
    }
    if (typeof canvas.renderNode === 'function') {
        for (const nodeId of ids) {
            const node = graph.getNode(nodeId);
            if (node) canvas.renderNode(node);
        }
    }
    const app = typeof window !== 'undefined' ? window.app : null;
    if (app && typeof app.renderTagSlots === 'function') {
        app.renderTagSlots();
    }
}

/**
 * Apply a tag update instruction from the agent tag_node tool.
 *
 * Handles add, remove, create, and rename by resolving tag names to colors
 * and mutating the client-side graph. Tags are not stored on the server.
 *
 * @param {Object} instruction - { action, tag_name, tag_color_name, node_ids }
 * @param {Object} graph - CRDTGraph instance
 * @param {Object} canvas - Canvas instance
 * @param {Function} saveSession - Save session callback
 * @param {Function} showToast - Toast notification callback
 * @returns {string} Result message for the agent loop
 */
function applyTagUpdate(instruction, graph, canvas, saveSession, showToast) {
    const action = instruction.action;
    const tagName = instruction.tag_name;
    const tagColorName = instruction.tag_color_name || '';
    const nodeIds = instruction.node_ids || [];

    if (!tagName) {
        return tagResult(showToast, 'tag_name is required');
    }

    if ((action === 'add' || action === 'remove') && nodeIds.length === 0) {
        return tagResult(showToast, 'node_ids is required for add/remove actions');
    }

    if (action === 'rename') {
        const color = COLOR_NAME_MAP[tagColorName.toLowerCase()] || tagColorName;
        if (!TAG_COLORS.includes(color)) {
            return tagResult(showToast, `Unknown tag color "${tagColorName}"`);
        }
        const existingTag = graph.getTag ? graph.getTag(color) : null;
        if (existingTag) {
            graph.updateTag(color, tagName);
        } else {
            graph.createTag(color, tagName);
        }
        refreshTagDisplay(graph, canvas, []);
        if (typeof saveSession === 'function') saveSession();
        return `Renamed the ${tagColorName || color} tag to "${tagName}"`;
    }

    if (action === 'create') {
        const { availableColors } = tagCatalog(graph);
        const freeColor = availableColors[0];

        if (!freeColor) {
            return tagResult(showToast, 'All 8 tag slots are in use');
        }

        graph.createTag(freeColor, tagName);

        if (nodeIds.length > 0) {
            for (const nodeId of nodeIds) {
                graph.addTagToNode(nodeId, freeColor);
            }
        }

        refreshTagDisplay(graph, canvas, nodeIds);
        if (typeof saveSession === 'function') saveSession();
        const applied = nodeIds.length > 0 ? ` and applied it to ${nodeIds.length} node(s)` : '';
        return `Created tag "${tagName}"${applied}`;
    }

    if (action !== 'add' && action !== 'remove') {
        return tagResult(showToast, `Unknown tag action "${action}"`);
    }

    const { allTags } = tagCatalog(graph);
    const tagEntry = Object.entries(allTags).find((entry) => {
        const tag = entry[1];
        return typeof tag.name === 'string' && tag.name.toLowerCase() === tagName.toLowerCase();
    });

    if (!tagEntry) {
        const available = Object.values(allTags)
            .map((tag) => tag.name)
            .join(', ');
        return tagResult(showToast, `Tag "${tagName}" not found. Available: ${available}`);
    }

    const [color] = tagEntry;

    for (const nodeId of nodeIds) {
        const node = graph.getNode(nodeId);
        if (!node) continue;

        if (action === 'add') {
            graph.addTagToNode(nodeId, color);
        } else if (action === 'remove') {
            graph.removeTagFromNode(nodeId, color);
        }
    }

    refreshTagDisplay(graph, canvas, nodeIds);
    if (typeof saveSession === 'function') saveSession();
    const verb = action === 'remove' ? 'Removed' : 'Added';
    return `${verb} tag "${tagName}" on ${nodeIds.length} node(s)`;
}

export {
    applyTagUpdate,
    COLOR_NAME_MAP,
    createNodeFromInstruction,
    executeCodeOnNode,
    formatViewportForPrompt,
    gatherViewportContext,
};
