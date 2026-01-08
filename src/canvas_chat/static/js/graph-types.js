/**
 * Graph Types and Factory Functions
 *
 * Shared constants and node/edge creation utilities used by
 * both CRDTGraph and other modules.
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
    FLASHCARD: 'flashcard', // Spaced repetition flashcard
    FACTCHECK: 'factcheck' // Fact-checking verdict node
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
    [NodeType.FACTCHECK]: { width: 640, height: 480 },

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

// Export for use in browser (window) and Node.js (module.exports)
if (typeof window !== 'undefined') {
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
}

// CommonJS export for Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        NodeType,
        EdgeType,
        TAG_COLORS,
        DEFAULT_NODE_SIZES,
        getDefaultNodeSize,
        createNode,
        createEdge,
        createMatrixNode,
        createCellNode,
        createRowNode,
        createColumnNode
    };
}
