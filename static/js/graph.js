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
    HIGHLIGHT: 'highlight' // Excerpted text from another node
};

/**
 * Edge types
 */
const EdgeType = {
    REPLY: 'reply',           // Normal reply to a node
    BRANCH: 'branch',         // Branch from text selection
    MERGE: 'merge',           // Multi-select merge
    REFERENCE: 'reference',   // Reference link
    SEARCH_RESULT: 'search_result', // Link from search to results
    HIGHLIGHT: 'highlight'    // Link from source to highlighted excerpt
};

/**
 * Create a new node
 */
function createNode(type, content, options = {}) {
    return {
        id: crypto.randomUUID(),
        type,
        content,
        position: options.position || { x: 0, y: 0 },
        created_at: Date.now(),
        model: options.model || null,
        selection: options.selection || null, // For branch-from-selection
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
        
        // Indexes for fast lookups
        this.outgoingEdges = new Map(); // nodeId -> [edges where node is source]
        this.incomingEdges = new Map(); // nodeId -> [edges where node is target]
        
        // Load from data if provided
        if (data.nodes) {
            for (const node of data.nodes) {
                this.nodes.set(node.id, node);
            }
        }
        if (data.edges) {
            for (const edge of data.edges) {
                this.addEdgeToIndex(edge);
            }
            this.edges = data.edges;
        }
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
        const sorted = Array.from(allAncestors.values())
            .filter(node => [NodeType.HUMAN, NodeType.AI, NodeType.SUMMARY].includes(node.type))
            .sort((a, b) => a.created_at - b.created_at);
        
        // Convert to message format for API
        return sorted.map(node => ({
            role: node.type === NodeType.HUMAN ? 'user' : 'assistant',
            content: node.content,
            nodeId: node.id
        }));
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
        const NODE_WIDTH = 320;
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
        
        while (attempts < maxAttempts && this.wouldOverlap(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
            // Move down to find free space
            candidatePos.y += NODE_HEIGHT + VERTICAL_GAP;
            attempts++;
        }
        
        // If still overlapping after max attempts, try moving right
        if (this.wouldOverlap(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
            candidatePos.x += NODE_WIDTH + HORIZONTAL_GAP;
            candidatePos.y = initialY;
            
            attempts = 0;
            while (attempts < maxAttempts && this.wouldOverlap(candidatePos, NODE_WIDTH, NODE_HEIGHT, allNodes)) {
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
        const PADDING = 20;  // Minimum gap between nodes
        
        for (const node of nodes) {
            const nodeWidth = node.width || 320;
            const nodeHeight = node.height || 200;
            
            // Check bounding box overlap
            const noOverlap = 
                pos.x + width + PADDING < node.position.x ||  // new is left of existing
                pos.x > node.position.x + nodeWidth + PADDING ||  // new is right of existing
                pos.y + height + PADDING < node.position.y ||  // new is above existing
                pos.y > node.position.y + nodeHeight + PADDING;   // new is below existing
            
            if (!noOverlap) {
                return true;  // There is overlap
            }
        }
        
        return false;  // No overlap with any node
    }

    /**
     * Auto-layout all nodes using topological sort and greedy placement.
     * Parents are always positioned before children.
     */
    autoLayout() {
        const NODE_WIDTH = 360;
        const NODE_HEIGHT = 220;
        const HORIZONTAL_GAP = 120;
        const VERTICAL_GAP = 40;
        const START_X = 100;
        const START_Y = 100;

        const allNodes = this.getAllNodes();
        if (allNodes.length === 0) return;

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

        // Step 3: Greedy placement - position each node avoiding overlaps
        const positioned = []; // Array of { x, y, width, height }
        
        for (const node of sorted) {
            const layer = layers.get(node.id);
            const x = START_X + layer * (NODE_WIDTH + HORIZONTAL_GAP);
            const nodeHeight = node.height || NODE_HEIGHT;
            const nodeWidth = node.width || NODE_WIDTH;
            
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
            for (let i = 1; i <= 20; i++) {
                searchOffsets.push(i * (NODE_HEIGHT + VERTICAL_GAP));
                searchOffsets.push(-i * (NODE_HEIGHT + VERTICAL_GAP));
            }
            
            for (const offset of searchOffsets) {
                const testY = Math.max(START_Y, idealY + offset);
                
                // Check if this position overlaps with any positioned node
                let hasOverlap = false;
                for (const pos of positioned) {
                    // Check bounding box overlap
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
     * Serialize to plain object for storage
     */
    toJSON() {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges
        };
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
}

// Export for use in other modules
window.Graph = Graph;
window.NodeType = NodeType;
window.EdgeType = EdgeType;
window.createNode = createNode;
window.createEdge = createEdge;
