/**
 * Graph module - DAG data structure for conversation nodes
 */

/**
 * Node types
 */
const NodeType = {
    HUMAN: 'human',
    AI: 'ai',
    NOTE: 'note',
    SUMMARY: 'summary',
    REFERENCE: 'reference',
    SEARCH: 'search',      // Web search query node
    RESEARCH: 'research',  // Exa deep research node
    HIGHLIGHT: 'highlight', // Excerpted text or image from another node
    MATRIX: 'matrix',      // Cross-product evaluation table
    CELL: 'cell',          // Pinned cell from a matrix
    ROW: 'row',            // Extracted row from a matrix
    COLUMN: 'column',      // Extracted column from a matrix
    FETCH_RESULT: 'fetch_result', // Fetched content from URL (via Exa)
    PDF: 'pdf',            // Imported PDF document
    OPINION: 'opinion',    // Committee member's opinion
    SYNTHESIS: 'synthesis', // Chairman's synthesized answer
    REVIEW: 'review',      // Committee member's review of other opinions
    IMAGE: 'image',        // Uploaded image for analysis
    FLASHCARD: 'flashcard' // Spaced repetition flashcard
};

/**
 * Default node sizes by type.
 * All nodes have fixed dimensions with scrollable content.
 * - Large (640x480): LLM-generated content, documents, research
 * - Small (420x200): User input, short content, extracted items
 */
const DEFAULT_NODE_SIZES = {
    // Large nodes (640x480) - LLM content, documents
    [NodeType.AI]: { width: 640, height: 480 },
    [NodeType.SUMMARY]: { width: 640, height: 480 },
    [NodeType.RESEARCH]: { width: 640, height: 480 },
    [NodeType.FETCH_RESULT]: { width: 640, height: 480 },
    [NodeType.PDF]: { width: 640, height: 480 },
    [NodeType.OPINION]: { width: 640, height: 480 },
    [NodeType.SYNTHESIS]: { width: 640, height: 480 },
    [NodeType.REVIEW]: { width: 640, height: 480 },
    [NodeType.NOTE]: { width: 640, height: 480 },
    [NodeType.IMAGE]: { width: 640, height: 480 },

    // Small nodes (420x200) - User input, short content
    [NodeType.HUMAN]: { width: 420, height: 200 },
    [NodeType.REFERENCE]: { width: 420, height: 200 },
    [NodeType.SEARCH]: { width: 420, height: 200 },
    [NodeType.HIGHLIGHT]: { width: 420, height: 300 },  // Slightly taller for excerpts
    [NodeType.CELL]: { width: 420, height: 300 },
    [NodeType.ROW]: { width: 500, height: 300 },
    [NodeType.COLUMN]: { width: 500, height: 300 },

    // Matrix nodes - wider for table layout
    [NodeType.MATRIX]: { width: 600, height: 400 },

    // Flashcard nodes - compact for Q/A display
    [NodeType.FLASHCARD]: { width: 400, height: 280 }
};

/**
 * Get default size for a node type
 * @param {string} type - Node type
 * @returns {{width: number, height: number}} Default dimensions
 */
function getDefaultNodeSize(type) {
    return DEFAULT_NODE_SIZES[type] || { width: 420, height: 200 };
}

/**
 * Edge types
 */
const EdgeType = {
    REPLY: 'reply',           // Normal reply to a node
    BRANCH: 'branch',         // Branch from text selection
    MERGE: 'merge',           // Multi-select merge
    REFERENCE: 'reference',   // Reference link
    SEARCH_RESULT: 'search_result', // Link from search to results
    HIGHLIGHT: 'highlight',   // Link from source to highlighted excerpt
    MATRIX_CELL: 'matrix_cell', // Link from pinned cell to matrix
    OPINION: 'opinion',       // Human → OPINION nodes (committee)
    SYNTHESIS: 'synthesis',   // OPINION/REVIEW → SYNTHESIS node (committee)
    REVIEW: 'review',         // OPINION → REVIEW nodes (committee)
    GENERATES: 'generates'    // Source node → generated flashcards
};

/**
 * Excalidraw color palette for tags (8 colors max)
 */
const TAG_COLORS = [
    '#ffc9c9',  // light red
    '#ffd8a8',  // light orange
    '#fff3bf',  // light yellow
    '#c0eb75',  // light green
    '#a5d8ff',  // light blue
    '#d0bfff',  // light purple
    '#fcc2d7',  // light pink
    '#e9ecef',  // light gray
];

// Layout utilities are imported from layout.js (loaded before this file)
// Access them via window.layoutUtils to avoid variable conflicts in test environments

/**
 * Create a new node
 */
function createNode(type, content, options = {}) {
    // All nodes have fixed dimensions with scrollable content
    const defaultSize = getDefaultNodeSize(type);

    return {
        id: crypto.randomUUID(),
        type,
        content,
        position: options.position || { x: 0, y: 0 },
        width: options.width || defaultSize.width,
        height: options.height || defaultSize.height,
        created_at: Date.now(),
        model: options.model || null,
        selection: options.selection || null, // For branch-from-selection
        tags: options.tags || [],  // Array of color keys
        title: options.title || null,  // User-editable short title (overrides summary)
        summary: options.summary || null,  // Auto-generated summary for semantic zoom
        ...options
    };
}

/**
 * Create a matrix node for cross-product evaluation
 * @param {string} context - User-provided context for the evaluation
 * @param {string[]} contextNodeIds - Array of node IDs that provide context
 * @param {string[]} rowItems - Array of row item strings
 * @param {string[]} colItems - Array of column item strings
 * @param {object} options - Additional options (position, etc.)
 */
function createMatrixNode(context, contextNodeIds, rowItems, colItems, options = {}) {
    // Initialize empty cells object
    const cells = {};
    for (let r = 0; r < rowItems.length; r++) {
        for (let c = 0; c < colItems.length; c++) {
            cells[`${r}-${c}`] = { content: null, filled: false };
        }
    }

    return {
        id: crypto.randomUUID(),
        type: NodeType.MATRIX,
        content: '', // Not used for display
        context,     // User-provided context for the evaluation
        contextNodeIds, // Array of source node IDs that provide context
        rowItems,    // Array of row item strings
        colItems,    // Array of column item strings
        cells,       // Object keyed by "rowIdx-colIdx"
        position: options.position || { x: 0, y: 0 },
        created_at: Date.now(),
        ...options
    };
}

/**
 * Create a cell node (pinned from a matrix)
 */
function createCellNode(matrixId, rowIndex, colIndex, rowItem, colItem, content, options = {}) {
    return {
        id: crypto.randomUUID(),
        type: NodeType.CELL,
        content,
        matrixId,
        rowIndex,
        colIndex,
        rowItem,
        colItem,
        position: options.position || { x: 0, y: 0 },
        created_at: Date.now(),
        ...options
    };
}

/**
 * Create a row node (extracted row from a matrix)
 */
function createRowNode(matrixId, rowIndex, rowItem, colItems, cellContents, options = {}) {
    // Format content as a list of column items and their cell contents
    let content = `**Row: ${rowItem}**\n\n`;
    for (let c = 0; c < colItems.length; c++) {
        const cellContent = cellContents[c];
        if (cellContent) {
            content += `### ${colItems[c]}\n${cellContent}\n\n`;
        } else {
            content += `### ${colItems[c]}\n*(empty)*\n\n`;
        }
    }

    return {
        id: crypto.randomUUID(),
        type: NodeType.ROW,
        content: content.trim(),
        matrixId,
        rowIndex,
        rowItem,
        position: options.position || { x: 0, y: 0 },
        created_at: Date.now(),
        ...options
    };
}

/**
 * Create a column node (extracted column from a matrix)
 */
function createColumnNode(matrixId, colIndex, colItem, rowItems, cellContents, options = {}) {
    // Format content as a list of row items and their cell contents
    let content = `**Column: ${colItem}**\n\n`;
    for (let r = 0; r < rowItems.length; r++) {
        const cellContent = cellContents[r];
        if (cellContent) {
            content += `### ${rowItems[r]}\n${cellContent}\n\n`;
        } else {
            content += `### ${rowItems[r]}\n*(empty)*\n\n`;
        }
    }

    return {
        id: crypto.randomUUID(),
        type: NodeType.COLUMN,
        content: content.trim(),
        matrixId,
        colIndex,
        colItem,
        position: options.position || { x: 0, y: 0 },
        created_at: Date.now(),
        ...options
    };
}

/**
 * Create a new edge
 */
function createEdge(sourceId, targetId, type = EdgeType.REPLY, options = {}) {
    return {
        id: crypto.randomUUID(),
        source: sourceId,
        target: targetId,
        type,
        ...options
    };
}

/**
 * Graph class - manages nodes and edges
 */
class Graph {
    constructor(data = {}) {
        this.nodes = new Map();
        this.edges = [];

        // Tag definitions: color -> { name, color }
        // Max 8 tags, one per color
        this.tags = {};

        // Indexes for fast lookups
        this.outgoingEdges = new Map(); // nodeId -> [edges where node is source]
        this.incomingEdges = new Map(); // nodeId -> [edges where node is target]

        // Load from data if provided
        if (data.nodes) {
            for (const node of data.nodes) {
                // Ensure tags array exists for older nodes
                if (!node.tags) node.tags = [];
                this.nodes.set(node.id, node);
            }
        }
        if (data.edges) {
            for (const edge of data.edges) {
                this.addEdgeToIndex(edge);
            }
            this.edges = data.edges;
        }
        if (data.tags) {
            this.tags = data.tags;
        }
    }

    // --- Tag Management ---

    /**
     * Create or update a tag for a color
     * @param {string} color - The color hex code (must be in TAG_COLORS)
     * @param {string} name - The tag name
     */
    createTag(color, name) {
        if (!TAG_COLORS.includes(color)) {
            throw new Error(`Invalid tag color: ${color}`);
        }
        this.tags[color] = { name, color };
    }

    /**
     * Update a tag's name
     * @param {string} color - The color hex code
     * @param {string} name - The new tag name
     */
    updateTag(color, name) {
        if (this.tags[color]) {
            this.tags[color].name = name;
        }
    }

    /**
     * Delete a tag and remove it from all nodes
     * @param {string} color - The color hex code
     */
    deleteTag(color) {
        delete this.tags[color];

        // Remove from all nodes
        for (const node of this.nodes.values()) {
            if (node.tags) {
                node.tags = node.tags.filter(t => t !== color);
            }
        }
    }

    /**
     * Get a tag by color
     * @param {string} color - The color hex code
     * @returns {Object|null} The tag or null
     */
    getTag(color) {
        return this.tags[color] || null;
    }

    /**
     * Get all defined tags
     * @returns {Object} Map of color -> tag
     */
    getAllTags() {
        return this.tags;
    }

    /**
     * Add a tag to a node
     * @param {string} nodeId - The node ID
     * @param {string} color - The tag color
     */
    addTagToNode(nodeId, color) {
        const node = this.nodes.get(nodeId);
        if (node && this.tags[color]) {
            if (!node.tags) node.tags = [];
            if (!node.tags.includes(color)) {
                node.tags.push(color);
            }
        }
    }

    /**
     * Remove a tag from a node
     * @param {string} nodeId - The node ID
     * @param {string} color - The tag color
     */
    removeTagFromNode(nodeId, color) {
        const node = this.nodes.get(nodeId);
        if (node && node.tags) {
            node.tags = node.tags.filter(t => t !== color);
        }
    }

    /**
     * Check if a node has a tag
     * @param {string} nodeId - The node ID
     * @param {string} color - The tag color
     * @returns {boolean}
     */
    nodeHasTag(nodeId, color) {
        const node = this.nodes.get(nodeId);
        return node && node.tags && node.tags.includes(color);
    }

    /**
     * Add edge to lookup indexes
     */
    addEdgeToIndex(edge) {
        if (!this.outgoingEdges.has(edge.source)) {
            this.outgoingEdges.set(edge.source, []);
        }
        this.outgoingEdges.get(edge.source).push(edge);

        if (!this.incomingEdges.has(edge.target)) {
            this.incomingEdges.set(edge.target, []);
        }
        this.incomingEdges.get(edge.target).push(edge);
    }

    /**
     * Remove edge from lookup indexes
     */
    removeEdgeFromIndex(edge) {
        const outgoing = this.outgoingEdges.get(edge.source);
        if (outgoing) {
            const idx = outgoing.findIndex(e => e.id === edge.id);
            if (idx !== -1) outgoing.splice(idx, 1);
        }

        const incoming = this.incomingEdges.get(edge.target);
        if (incoming) {
            const idx = incoming.findIndex(e => e.id === edge.id);
            if (idx !== -1) incoming.splice(idx, 1);
        }
    }

    /**
     * Add a node to the graph
     */
    addNode(node) {
        this.nodes.set(node.id, node);
        return node;
    }

    /**
     * Get a node by ID
     */
    getNode(id) {
        return this.nodes.get(id);
    }

    /**
     * Update a node
     */
    updateNode(id, updates) {
        const node = this.nodes.get(id);
        if (node) {
            Object.assign(node, updates);
        }
        return node;
    }

    /**
     * Remove a node and its connected edges
     */
    removeNode(id) {
        // Remove connected edges
        const incoming = this.incomingEdges.get(id) || [];
        const outgoing = this.outgoingEdges.get(id) || [];

        for (const edge of [...incoming, ...outgoing]) {
            this.removeEdge(edge.id);
        }

        this.nodes.delete(id);
        this.incomingEdges.delete(id);
        this.outgoingEdges.delete(id);
    }

    /**
     * Add an edge to the graph
     */
    addEdge(edge) {
        this.edges.push(edge);
        this.addEdgeToIndex(edge);
        return edge;
    }

    /**
     * Remove an edge by ID
     */
    removeEdge(edgeId) {
        const idx = this.edges.findIndex(e => e.id === edgeId);
        if (idx !== -1) {
            const edge = this.edges[idx];
            this.removeEdgeFromIndex(edge);
            this.edges.splice(idx, 1);
        }
    }

    /**
     * Get parent nodes (nodes that have edges pointing to this node)
     */
    getParents(nodeId) {
        const incoming = this.incomingEdges.get(nodeId) || [];
        return incoming.map(edge => this.nodes.get(edge.source)).filter(Boolean);
    }

    /**
     * Get child nodes (nodes that this node has edges pointing to)
     */
    getChildren(nodeId) {
        const outgoing = this.outgoingEdges.get(nodeId) || [];
        return outgoing.map(edge => this.nodes.get(edge.target)).filter(Boolean);
    }

    /**
     * Get all ancestors of a node (for context resolution)
     * Returns nodes in topological order (oldest first)
     */
    getAncestors(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const ancestors = [];
        const parents = this.getParents(nodeId);

        for (const parent of parents) {
            // Recursively get ancestors of parents
            ancestors.push(...this.getAncestors(parent.id, visited));
            ancestors.push(parent);
        }

        return ancestors;
    }

    /**
     * Get all ancestor edges (for highlighting context path)
     */
    getAncestorEdges(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const edges = [];
        const incoming = this.incomingEdges.get(nodeId) || [];

        for (const edge of incoming) {
            edges.push(edge);
            edges.push(...this.getAncestorEdges(edge.source, visited));
        }

        return edges;
    }

    /**
     * Resolve context for one or more nodes
     * Returns messages in chronological order, deduplicated
     */
    resolveContext(nodeIds) {
        const allAncestors = new Map();

        // Collect ancestors from all selected nodes
        for (const nodeId of nodeIds) {
            const node = this.getNode(nodeId);
            if (node) {
                allAncestors.set(node.id, node);
            }

            const ancestors = this.getAncestors(nodeId);
            for (const ancestor of ancestors) {
                allAncestors.set(ancestor.id, ancestor);
            }
        }

        // Convert to array and sort by created_at
        // Include all node types in context - any node in the DAG history is relevant
        const sorted = Array.from(allAncestors.values())
            .sort((a, b) => a.created_at - b.created_at);

        // Convert to message format for API
        // User-generated content types are mapped to 'user' role, AI-generated to 'assistant'
        const userTypes = [NodeType.HUMAN, NodeType.HIGHLIGHT, NodeType.NOTE, NodeType.IMAGE];
        return sorted.map(node => {
            const msg = {
                role: userTypes.includes(node.type) ? 'user' : 'assistant',
                content: node.content,
                nodeId: node.id
            };
            // Include image data if present (for IMAGE and HIGHLIGHT nodes with images)
            if (node.imageData) {
                msg.imageData = node.imageData;
                msg.mimeType = node.mimeType;
            }
            return msg;
        });
    }

    /**
     * Get all ancestor node IDs for highlighting
     */
    getAncestorIds(nodeIds) {
        const ancestorIds = new Set();

        for (const nodeId of nodeIds) {
            ancestorIds.add(nodeId);
            const ancestors = this.getAncestors(nodeId);
            for (const ancestor of ancestors) {
                ancestorIds.add(ancestor.id);
            }
        }

        return ancestorIds;
    }

    /**
     * Find root nodes (nodes with no parents)
     */
    getRootNodes() {
        const roots = [];
        for (const [id, node] of this.nodes) {
            const incoming = this.incomingEdges.get(id) || [];
            if (incoming.length === 0) {
                roots.push(node);
            }
        }
        return roots;
    }

    /**
     * Find leaf nodes (nodes with no children)
     */
    getLeafNodes() {
        const leaves = [];
        for (const [id, node] of this.nodes) {
            const outgoing = this.outgoingEdges.get(id) || [];
            if (outgoing.length === 0) {
                leaves.push(node);
            }
        }
        return leaves;
    }

    /**
     * Estimate token count for context
     * Very rough: ~4 chars per token
     */
    estimateTokens(nodeIds) {
        const context = this.resolveContext(nodeIds);
        const totalChars = context.reduce((sum, msg) => sum + msg.content.length, 0);
        return Math.ceil(totalChars / 4);
    }

    /**
     * Auto-position a new node relative to its parents, avoiding overlaps
     */
    autoPosition(parentIds) {
        const NODE_WIDTH = 420;
        const NODE_HEIGHT = 200;  // Estimated default height
        const HORIZONTAL_GAP = 80;
        const VERTICAL_GAP = 30;

        let initialX, initialY;

        if (parentIds.length === 0) {
            // First node - center of viewport
            initialX = 100;
            initialY = 100;
        } else {
            const parents = parentIds.map(id => this.getNode(id)).filter(Boolean);

            if (parents.length === 1) {
                // Single parent - position to the right
                const parent = parents[0];
                const parentWidth = parent.width || NODE_WIDTH;
                initialX = parent.position.x + parentWidth + HORIZONTAL_GAP;
                initialY = parent.position.y;
            } else {
                // Multiple parents (merge) - position to the right of rightmost parent
                const rightmost = parents.reduce((max, p) => {
                    const pRight = p.position.x + (p.width || NODE_WIDTH);
                    const maxRight = max.position.x + (max.width || NODE_WIDTH);
                    return pRight > maxRight ? p : max;
                }, parents[0]);
                const avgY = parents.reduce((sum, p) => sum + p.position.y, 0) / parents.length;

                initialX = rightmost.position.x + (rightmost.width || NODE_WIDTH) + HORIZONTAL_GAP;
                initialY = avgY;
            }
        }

        // Now check for overlaps and adjust position
        const candidatePos = { x: initialX, y: initialY };
        const allNodes = this.getAllNodes();

        // Try to find a non-overlapping position
        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts && window.layoutUtils.wouldOverlapNodes(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
            // Move down to find free space
            candidatePos.y += NODE_HEIGHT + VERTICAL_GAP;
            attempts++;
        }

        // If still overlapping after max attempts, try moving right
        if (window.layoutUtils.wouldOverlapNodes(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
            candidatePos.x += NODE_WIDTH + HORIZONTAL_GAP;
            candidatePos.y = initialY;

            attempts = 0;
            while (attempts < maxAttempts && window.layoutUtils.wouldOverlapNodes(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
                candidatePos.y += NODE_HEIGHT + VERTICAL_GAP;
                attempts++;
            }
        }

        return candidatePos;
    }

    /**
     * Check if a position would overlap with existing nodes
     */
    wouldOverlap(pos, width, height, nodes) {
        return window.layoutUtils.wouldOverlapNodes(pos, width, height, nodes);
    }

    /**
     * Auto-layout all nodes using topological sort and greedy placement.
     * Parents are always positioned before children.
     * @param {Map} dimensions - Optional map of nodeId -> { width, height } from canvas
     */
    autoLayout(dimensions = new Map()) {
        const DEFAULT_WIDTH = 420;
        const DEFAULT_HEIGHT = 220;
        const HORIZONTAL_GAP = 120;
        const VERTICAL_GAP = 40;
        const START_X = 100;
        const START_Y = 100;

        const allNodes = this.getAllNodes();
        if (allNodes.length === 0) return;

        // Helper to get node dimensions
        const getNodeSize = (node) => {
            const dim = dimensions.get(node.id);
            if (dim) {
                return { width: dim.width, height: dim.height };
            }
            return {
                width: node.width || DEFAULT_WIDTH,
                height: node.height || DEFAULT_HEIGHT
            };
        };

        // Step 1: Topological sort using Kahn's algorithm
        const sorted = this.topologicalSort();

        // Step 2: Assign layers (depth from roots)
        const layers = new Map(); // nodeId -> layer
        for (const node of sorted) {
            const parents = this.getParents(node.id);
            if (parents.length === 0) {
                layers.set(node.id, 0);
            } else {
                // Layer is max parent layer + 1
                const maxParentLayer = Math.max(...parents.map(p => layers.get(p.id) || 0));
                layers.set(node.id, maxParentLayer + 1);
            }
        }

        // Step 3: Calculate max width per layer for proper horizontal spacing
        const layerMaxWidth = new Map();
        for (const node of sorted) {
            const layer = layers.get(node.id);
            const { width } = getNodeSize(node);
            const current = layerMaxWidth.get(layer) || 0;
            layerMaxWidth.set(layer, Math.max(current, width));
        }

        // Calculate X offset for each layer
        const layerX = new Map();
        let currentX = START_X;
        const maxLayer = Math.max(...layers.values());
        for (let l = 0; l <= maxLayer; l++) {
            layerX.set(l, currentX);
            currentX += (layerMaxWidth.get(l) || DEFAULT_WIDTH) + HORIZONTAL_GAP;
        }

        // Step 4: Greedy placement - position each node avoiding overlaps
        const positioned = []; // Array of { x, y, width, height }

        for (const node of sorted) {
            const layer = layers.get(node.id);
            const x = layerX.get(layer);
            const { width: nodeWidth, height: nodeHeight } = getNodeSize(node);

            // Determine ideal Y based on parents
            let idealY = START_Y;
            const parents = this.getParents(node.id);
            if (parents.length > 0) {
                // Average Y of parents
                const avgParentY = parents.reduce((sum, p) => sum + p.position.y, 0) / parents.length;
                idealY = avgParentY;
            }

            // Find a Y position that doesn't overlap with existing nodes
            let y = idealY;
            let foundPosition = false;

            // Try the ideal position first, then search up and down
            const searchOffsets = [0];
            for (let i = 1; i <= 30; i++) {
                searchOffsets.push(i * (DEFAULT_HEIGHT / 2 + VERTICAL_GAP));
                searchOffsets.push(-i * (DEFAULT_HEIGHT / 2 + VERTICAL_GAP));
            }

            for (const offset of searchOffsets) {
                const testY = Math.max(START_Y, idealY + offset);

                // Check if this position overlaps with any positioned node
                let hasOverlap = false;
                for (const pos of positioned) {
                    // Check bounding box overlap with padding
                    const horizontalOverlap = !(x + nodeWidth + 20 < pos.x || x > pos.x + pos.width + 20);
                    const verticalOverlap = !(testY + nodeHeight + VERTICAL_GAP < pos.y || testY > pos.y + pos.height + VERTICAL_GAP);

                    if (horizontalOverlap && verticalOverlap) {
                        hasOverlap = true;
                        break;
                    }
                }

                if (!hasOverlap) {
                    y = testY;
                    foundPosition = true;
                    break;
                }
            }

            // Fallback: just place at bottom of all positioned nodes
            if (!foundPosition) {
                const maxY = positioned.reduce((max, pos) => Math.max(max, pos.y + pos.height), START_Y);
                y = maxY + VERTICAL_GAP;
            }

            node.position = { x, y };
            positioned.push({ x, y, width: nodeWidth, height: nodeHeight });
        }
    }

    /**
     * Topological sort using Kahn's algorithm.
     * Returns nodes in order where parents come before children.
     */
    topologicalSort() {
        const allNodes = this.getAllNodes();
        const inDegree = new Map();
        const result = [];

        // Calculate in-degree for each node
        for (const node of allNodes) {
            const incoming = this.incomingEdges.get(node.id) || [];
            inDegree.set(node.id, incoming.length);
        }

        // Start with nodes that have no incoming edges (roots)
        const queue = allNodes.filter(n => inDegree.get(n.id) === 0);

        // Sort initial queue by creation time for consistent ordering
        queue.sort((a, b) => a.created_at - b.created_at);

        while (queue.length > 0) {
            const node = queue.shift();
            result.push(node);

            // Reduce in-degree of children
            const children = this.getChildren(node.id);
            // Sort children by creation time for consistent ordering
            children.sort((a, b) => a.created_at - b.created_at);

            for (const child of children) {
                const newDegree = inDegree.get(child.id) - 1;
                inDegree.set(child.id, newDegree);
                if (newDegree === 0) {
                    queue.push(child);
                }
            }
        }

        // Handle any remaining nodes (cycles - shouldn't happen in a DAG)
        for (const node of allNodes) {
            if (!result.includes(node)) {
                result.push(node);
            }
        }

        return result;
    }

    /**
     * Force-directed layout using simple simulation.
     * Nodes repel each other, edges act as springs.
     * @param {Map} dimensions - Optional map of nodeId -> { width, height } from canvas
     */
    forceDirectedLayout(dimensions = new Map()) {
        const DEFAULT_WIDTH = 420;
        const DEFAULT_HEIGHT = 220;
        const ITERATIONS = 100;
        const REPULSION = 50000;      // Repulsion force between nodes
        const ATTRACTION = 0.05;       // Spring constant for edges
        const DAMPING = 0.85;          // Velocity damping
        const PADDING = 40;            // Padding between nodes for overlap check
        // Extra spacing between connected nodes (added to minimum safe distance)
        const IDEAL_EDGE_LENGTH = 100;

        const allNodes = this.getAllNodes();
        if (allNodes.length === 0) return;

        // Helper to get node dimensions
        const getNodeSize = (node) => {
            const dim = dimensions.get(node.id);
            if (dim) {
                return { width: dim.width, height: dim.height };
            }
            return {
                width: node.width || DEFAULT_WIDTH,
                height: node.height || DEFAULT_HEIGHT
            };
        };

        // Initialize velocities
        const velocities = new Map();
        for (const node of allNodes) {
            velocities.set(node.id, { x: 0, y: 0 });
        }

        // If nodes don't have positions, spread them out initially
        const unpositioned = allNodes.filter(n => !n.position || (n.position.x === 0 && n.position.y === 0));
        if (unpositioned.length > 0) {
            const cols = Math.ceil(Math.sqrt(allNodes.length));
            allNodes.forEach((node, i) => {
                if (!node.position) {
                    node.position = {
                        x: 200 + (i % cols) * 400,
                        y: 200 + Math.floor(i / cols) * 300
                    };
                }
            });
        }

        // Run simulation
        for (let iter = 0; iter < ITERATIONS; iter++) {
            const forces = new Map();
            for (const node of allNodes) {
                forces.set(node.id, { x: 0, y: 0 });
            }

            // Calculate repulsion forces between all pairs
            for (let i = 0; i < allNodes.length; i++) {
                for (let j = i + 1; j < allNodes.length; j++) {
                    const nodeA = allNodes[i];
                    const nodeB = allNodes[j];
                    const sizeA = getNodeSize(nodeA);
                    const sizeB = getNodeSize(nodeB);

                    // Calculate center-to-center distance
                    const centerAx = nodeA.position.x + sizeA.width / 2;
                    const centerAy = nodeA.position.y + sizeA.height / 2;
                    const centerBx = nodeB.position.x + sizeB.width / 2;
                    const centerBy = nodeB.position.y + sizeB.height / 2;

                    const dx = centerBx - centerAx;
                    const dy = centerBy - centerAy;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                    // Check for actual rectangular overlap (not just center distance)
                    const aLeft = nodeA.position.x - PADDING;
                    const aRight = nodeA.position.x + sizeA.width + PADDING;
                    const aTop = nodeA.position.y - PADDING;
                    const aBottom = nodeA.position.y + sizeA.height + PADDING;

                    const bLeft = nodeB.position.x - PADDING;
                    const bRight = nodeB.position.x + sizeB.width + PADDING;
                    const bTop = nodeB.position.y - PADDING;
                    const bBottom = nodeB.position.y + sizeB.height + PADDING;

                    const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
                    const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);
                    const isOverlapping = overlapX > 0 && overlapY > 0;

                    // Repulsion force (Coulomb's law)
                    const force = REPULSION / (distance * distance);
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    // Apply to both nodes in opposite directions
                    forces.get(nodeA.id).x -= fx;
                    forces.get(nodeA.id).y -= fy;
                    forces.get(nodeB.id).x += fx;
                    forces.get(nodeB.id).y += fy;

                    // Strong extra repulsion if bounding boxes actually overlap
                    if (isOverlapping) {
                        // Push apart based on actual overlap amount
                        // Use the minimum overlap axis for efficiency
                        const overlapForce = Math.min(overlapX, overlapY) * 5;
                        const ofx = (dx / distance) * overlapForce;
                        const ofy = (dy / distance) * overlapForce;
                        forces.get(nodeA.id).x -= ofx;
                        forces.get(nodeA.id).y -= ofy;
                        forces.get(nodeB.id).x += ofx;
                        forces.get(nodeB.id).y += ofy;
                    }
                }
            }

            // Calculate attraction forces along edges
            for (const node of allNodes) {
                const children = this.getChildren(node.id);
                const parents = this.getParents(node.id);
                const connected = [...children, ...parents];

                for (const other of connected) {
                    const sizeA = getNodeSize(node);
                    const sizeB = getNodeSize(other);

                    const centerAx = node.position.x + sizeA.width / 2;
                    const centerAy = node.position.y + sizeA.height / 2;
                    const centerBx = other.position.x + sizeB.width / 2;
                    const centerBy = other.position.y + sizeB.height / 2;

                    const dx = centerBx - centerAx;
                    const dy = centerBy - centerAy;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                    // Calculate minimum safe distance based on node sizes
                    // Nodes should be far enough apart that they don't overlap
                    const minSafeDistance = Math.max(
                        (sizeA.width + sizeB.width) / 2 + PADDING,
                        (sizeA.height + sizeB.height) / 2 + PADDING
                    );
                    // Ideal distance is min safe distance plus some extra spacing
                    const idealDistance = minSafeDistance + IDEAL_EDGE_LENGTH;

                    // Spring force (Hooke's law)
                    const displacement = distance - idealDistance;
                    const force = ATTRACTION * displacement;
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    forces.get(node.id).x += fx;
                    forces.get(node.id).y += fy;
                }
            }

            // Apply forces with damping
            for (const node of allNodes) {
                const vel = velocities.get(node.id);
                const force = forces.get(node.id);

                vel.x = (vel.x + force.x) * DAMPING;
                vel.y = (vel.y + force.y) * DAMPING;

                // Limit max velocity
                const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                if (speed > 50) {
                    vel.x = (vel.x / speed) * 50;
                    vel.y = (vel.y / speed) * 50;
                }

                node.position.x += vel.x;
                node.position.y += vel.y;
            }
        }

        // Normalize positions to start from (100, 100)
        let minX = Infinity, minY = Infinity;
        for (const node of allNodes) {
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
        }
        for (const node of allNodes) {
            node.position.x = node.position.x - minX + 100;
            node.position.y = node.position.y - minY + 100;
        }

        // Final pass: resolve any remaining overlaps
        this.resolveOverlaps(allNodes, dimensions);
    }

    /**
     * Resolve any overlapping nodes by nudging them apart.
     * Delegates to the pure function from layout.js.
     * @param {Array} nodes - Array of nodes to check
     * @param {Map} dimensions - Map of nodeId -> { width, height }
     */
    resolveOverlaps(nodes, dimensions = new Map()) {
        window.layoutUtils.resolveOverlaps(nodes, 40, 50, dimensions);
    }

    /**
     * Get all nodes as array
     */
    getAllNodes() {
        return Array.from(this.nodes.values());
    }

    /**
     * Get all edges
     */
    getAllEdges() {
        return this.edges;
    }

    /**
     * Check if graph is empty
     */
    isEmpty() {
        return this.nodes.size === 0;
    }

    /**
     * Serialize graph to JSON-compatible object
     */
    toJSON() {
        return {
            nodes: this.getAllNodes(),
            edges: this.getAllEdges(),
            tags: this.tags
        };
    }
}

// Export for use in other modules
window.Graph = Graph;
window.NodeType = NodeType;
window.EdgeType = EdgeType;
window.TAG_COLORS = TAG_COLORS;
window.DEFAULT_NODE_SIZES = DEFAULT_NODE_SIZES;
window.getDefaultNodeSize = getDefaultNodeSize;
window.createNode = createNode;
window.createEdge = createEdge;
window.createMatrixNode = createMatrixNode;
window.createCellNode = createCellNode;
window.createRowNode = createRowNode;
window.createColumnNode = createColumnNode;
window.wouldOverlapNodes = window.layoutUtils.wouldOverlapNodes;
