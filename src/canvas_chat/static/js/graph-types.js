/**
 * Graph Types and Factory Functions
 *
 * Shared constants and node/edge creation utilities used by
 * both CRDTGraph and other modules.
 */

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Valid node type values
 * @typedef {'human'|'ai'|'note'|'summary'|'reference'|'search'|'research'|'highlight'|'matrix'|'cell'|'row'|'column'|'fetch_result'|'pdf'|'powerpoint'|'opinion'|'synthesis'|'review'|'image'|'flashcard'|'factcheck'|'csv'|'code'|'youtube'|'git_repo'} NodeTypeValue
 */

/**
 * Valid edge type values
 * @typedef {'reply'|'branch'|'merge'|'reference'|'search_result'|'highlight'|'matrix_cell'|'opinion'|'synthesis'|'review'|'generates'} EdgeTypeValue
 */

/**
 * Position in canvas coordinates
 * @typedef {Object} Position
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * Node dimensions
 * @typedef {Object} NodeSize
 * @property {number} width - Width in pixels
 * @property {number} height - Height in pixels
 */

/**
 * Spaced Repetition System data for flashcards
 * @typedef {Object} SRSData
 * @property {number} easeFactor - Difficulty multiplier (min 1.3)
 * @property {number} interval - Days until next review
 * @property {number} repetitions - Number of successful reviews
 * @property {number|null} nextReviewDate - Unix timestamp of next review
 * @property {number|null} lastReviewDate - Unix timestamp of last review
 */

/**
 * Matrix cell data
 * @typedef {Object} MatrixCell
 * @property {string|null} content - Cell content (null if empty)
 * @property {boolean} filled - Whether cell has been filled
 */

/**
 * Base node structure (shared by all node types)
 * @typedef {Object} BaseNode
 * @property {string} id - Unique identifier (UUID)
 * @property {NodeTypeValue} type - Node type
 * @property {string} content - Main content (markdown)
 * @property {Position} position - Canvas position
 * @property {number} width - Width in pixels
 * @property {number} height - Height in pixels
 * @property {number} created_at - Unix timestamp
 * @property {string|null} model - LLM model ID (for AI-generated nodes)
 * @property {string|null} selection - Selected text (for branch nodes)
 * @property {string[]} tags - Array of tag color keys
 * @property {string|null} title - User-editable title
 * @property {string|null} summary - Auto-generated summary
 * @property {boolean} [collapsed] - Whether children are collapsed
 */

/**
 * Matrix node structure (extends BaseNode)
 * @typedef {Object} MatrixNode
 * @property {string} id - Node ID
 * @property {string} type - Node type
 * @property {string} content - Node content
 * @property {Object} position - Node position {x, y}
 * @property {number} [width] - Node width
 * @property {number} [height] - Node height
 * @property {Object} [metadata] - Additional metadata
 * @property {string[]} tags - Array of tag color keys
 * @property {string|null} title - User-editable title
 * @property {string|null} summary - Auto-generated summary
 * @property {boolean} [collapsed] - Whether children are collapsed
 * @property {string} context - Matrix context
 * @property {string[]} contextNodeIds - Context node IDs
 * @property {string[]} rowItems - Row items
 * @property {string[]} colItems - Column items
 * @property {Object.<string, MatrixCell>} cells - Matrix cells
 * @property {string} [indexColWidth] - Index column width
 */

/**
 * Flashcard node structure (extends BaseNode)
 * @typedef {Object} FlashcardNode
 * @property {string} id - Node ID
 * @property {string} type - Node type
 * @property {string} content - Node content
 * @property {Object} position - Node position {x, y}
 * @property {number} [width] - Node width
 * @property {number} [height] - Node height
 * @property {Object} [metadata] - Additional metadata
 * @property {string[]} tags - Array of tag color keys
 * @property {string|null} title - User-editable title
 * @property {string|null} summary - Auto-generated summary
 * @property {boolean} [collapsed] - Whether children are collapsed
 * @property {string} question - Flashcard question
 * @property {string} answer - Flashcard answer
 * @property {SRSData} [srs] - Spaced repetition data
 */

/**
 * Cell node structure (extends BaseNode)
 * @typedef {Object} CellNode
 * @property {string} id - Node ID
 * @property {string} type - Node type
 * @property {string} content - Node content
 * @property {Object} position - Node position {x, y}
 * @property {number} [width] - Node width
 * @property {number} [height] - Node height
 * @property {Object} [metadata] - Additional metadata
 * @property {string[]} tags - Array of tag color keys
 * @property {string|null} title - User-editable title
 * @property {string|null} summary - Auto-generated summary
 * @property {boolean} [collapsed] - Whether children are collapsed
 * @property {string} matrixId - Parent matrix ID
 * @property {number} rowIndex - Row index
 * @property {number} colIndex - Column index
 * @property {string} rowItem - Row item label
 * @property {string} colItem - Column item label
 */

/**
 * Row node structure (extends BaseNode)
 * @typedef {Object} RowNode
 * @property {string} id - Node ID
 * @property {string} type - Node type
 * @property {string} content - Node content
 * @property {Object} position - Node position {x, y}
 * @property {number} [width] - Node width
 * @property {number} [height] - Node height
 * @property {Object} [metadata] - Additional metadata
 * @property {string[]} tags - Array of tag color keys
 * @property {string|null} title - User-editable title
 * @property {string|null} summary - Auto-generated summary
 * @property {boolean} [collapsed] - Whether children are collapsed
 * @property {string} matrixId - Parent matrix ID
 * @property {number} rowIndex - Row index
 * @property {string} rowItem - Row item label
 */

/**
 * Column node structure (extends BaseNode)
 * @typedef {Object} ColumnNode
 * @property {string} id - Node ID
 * @property {string} type - Node type
 * @property {string} content - Node content
 * @property {Object} position - Node position {x, y}
 * @property {number} [width] - Node width
 * @property {number} [height] - Node height
 * @property {Object} [metadata] - Additional metadata
 * @property {string[]} tags - Array of tag color keys
 * @property {string|null} title - User-editable title
 * @property {string|null} summary - Auto-generated summary
 * @property {boolean} [collapsed] - Whether children are collapsed
 * @property {string} matrixId - Parent matrix ID
 * @property {number} colIndex - Column index
 * @property {string} colItem - Column item label
 */

/**
 * Union type for all node types
 * @typedef {BaseNode|MatrixNode|FlashcardNode|CellNode|RowNode|ColumnNode} Node
 */

/**
 * Edge structure
 * @typedef {Object} Edge
 * @property {string} id - Unique identifier (UUID)
 * @property {string} source - Source node ID
 * @property {string} target - Target node ID
 * @property {EdgeTypeValue} type - Edge type
 */

/**
 * Options for creating a node
 * @typedef {Object} CreateNodeOptions
 * @property {Position} [position] - Initial position
 * @property {number} [width] - Custom width
 * @property {number} [height] - Custom height
 * @property {string} [model] - LLM model ID
 * @property {string} [selection] - Selected text
 * @property {string[]} [tags] - Initial tags
 * @property {string} [title] - Initial title
 * @property {string} [summary] - Initial summary
 */

/**
 * Options for creating a matrix node
 * @typedef {Object} CreateMatrixOptions
 * @property {Position} [position] - Initial position
 * @property {number} [width] - Custom width
 * @property {number} [height] - Custom height
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Node types enumeration
 * @type {Object.<string, NodeTypeValue>}
 */
const NodeType = {
    HUMAN: 'human',
    AI: 'ai',
    NOTE: 'note',
    SUMMARY: 'summary',
    REFERENCE: 'reference',
    SEARCH: 'search', // Web search query node
    RESEARCH: 'research', // Exa deep research node
    HIGHLIGHT: 'highlight', // Excerpted text or image from another node
    MATRIX: 'matrix', // Cross-product evaluation table
    CELL: 'cell', // Pinned cell from a matrix
    ROW: 'row', // Extracted row from a matrix
    COLUMN: 'column', // Extracted column from a matrix
    FETCH_RESULT: 'fetch_result', // Fetched content from URL (generic)
    PDF: 'pdf', // Imported PDF document
    POWERPOINT: 'powerpoint', // Imported PowerPoint deck (PPTX)
    YOUTUBE: 'youtube', // YouTube video with transcript
    GIT_REPO: 'git_repo', // Git repository with file selection
    OPINION: 'opinion', // Committee member's opinion
    SYNTHESIS: 'synthesis', // Chairman's synthesized answer
    REVIEW: 'review', // Committee member's review of other opinions
    IMAGE: 'image', // Uploaded image for analysis
    FLASHCARD: 'flashcard', // Spaced repetition flashcard
    FACTCHECK: 'factcheck', // Fact-checking verdict node
    CSV: 'csv', // Uploaded CSV data for analysis
    CODE: 'code', // Python code for execution
};

/**
 * Default node sizes by type.
 * All nodes have fixed dimensions with scrollable content.
 * - Large (640x480): LLM-generated content, documents, research
 * - Small (420x200): User input, short content, extracted items
 * @type {Object.<NodeTypeValue, NodeSize>}
 */
const DEFAULT_NODE_SIZES = {
    // Large nodes (640x480) - LLM content, documents
    [NodeType.AI]: { width: 640, height: 480 },
    [NodeType.SUMMARY]: { width: 640, height: 480 },
    [NodeType.RESEARCH]: { width: 640, height: 480 },
    [NodeType.FETCH_RESULT]: { width: 640, height: 480 },
    [NodeType.PDF]: { width: 640, height: 480 },
    [NodeType.POWERPOINT]: { width: 480, height: 400 },
    [NodeType.YOUTUBE]: { width: 640, height: 480 },
    [NodeType.GIT_REPO]: { width: 640, height: 480 },
    [NodeType.OPINION]: { width: 640, height: 480 },
    [NodeType.SYNTHESIS]: { width: 640, height: 480 },
    [NodeType.REVIEW]: { width: 640, height: 480 },
    [NodeType.NOTE]: { width: 640, height: 480 },
    [NodeType.IMAGE]: { width: 640, height: 480 },
    [NodeType.FACTCHECK]: { width: 640, height: 480 },
    [NodeType.CSV]: { width: 640, height: 480 },
    [NodeType.CODE]: { width: 640, height: 400 },

    // Small nodes (420x200) - User input, short content
    [NodeType.HUMAN]: { width: 420, height: 200 },
    [NodeType.REFERENCE]: { width: 420, height: 200 },
    [NodeType.SEARCH]: { width: 420, height: 200 },
    [NodeType.HIGHLIGHT]: { width: 420, height: 300 }, // Slightly taller for excerpts
    [NodeType.CELL]: { width: 420, height: 300 },
    [NodeType.ROW]: { width: 500, height: 300 },
    [NodeType.COLUMN]: { width: 500, height: 300 },

    // Matrix nodes - wider for table layout
    [NodeType.MATRIX]: { width: 600, height: 400 },

    // Flashcard nodes - compact for Q/A display
    [NodeType.FLASHCARD]: { width: 400, height: 280 },
};

/**
 * Edge types enumeration
 * @type {Object.<string, EdgeTypeValue>}
 */
const EdgeType = {
    REPLY: 'reply', // Normal reply to a node
    BRANCH: 'branch', // Branch from text selection
    MERGE: 'merge', // Multi-select merge
    REFERENCE: 'reference', // Reference link
    SEARCH_RESULT: 'search_result', // Link from search to results
    HIGHLIGHT: 'highlight', // Link from source to highlighted excerpt
    MATRIX_CELL: 'matrix_cell', // Link from pinned cell to matrix
    OPINION: 'opinion', // Human → OPINION nodes (committee)
    SYNTHESIS: 'synthesis', // OPINION/REVIEW → SYNTHESIS node (committee)
    REVIEW: 'review', // OPINION → REVIEW nodes (committee)
    GENERATES: 'generates', // Source node → generated flashcards
};

/**
 * Excalidraw color palette for tags (8 colors max)
 * @type {string[]}
 */
const TAG_COLORS = [
    '#ffc9c9', // light red
    '#ffd8a8', // light orange
    '#fff3bf', // light yellow
    '#c0eb75', // light green
    '#a5d8ff', // light blue
    '#d0bfff', // light purple
    '#fcc2d7', // light pink
    '#e9ecef', // light gray
];

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Get default size for a node type
 * @param {NodeTypeValue} type - Node type
 * @returns {NodeSize} Default dimensions
 */
function getDefaultNodeSize(type) {
    return DEFAULT_NODE_SIZES[type] || { width: 420, height: 200 };
}

/**
 * Create a new node
 * @param {NodeTypeValue} type - Node type
 * @param {string} content - Node content (markdown)
 * @param {CreateNodeOptions} [options={}] - Additional options
 * @returns {BaseNode} New node object
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
        tags: options.tags || [], // Array of color keys
        title: options.title || null, // User-editable short title (overrides summary)
        summary: options.summary || null, // Auto-generated summary for semantic zoom
        ...options,
    };
}

/**
 * Create a matrix node for cross-product evaluation
 * @param {string} context - User-provided context for the evaluation
 * @param {string[]} contextNodeIds - Array of node IDs that provide context
 * @param {string[]} rowItems - Array of row item strings
 * @param {string[]} colItems - Array of column item strings
 * @param {CreateMatrixOptions} [options={}] - Additional options
 * @returns {MatrixNode} New matrix node object
 */
function createMatrixNode(context, contextNodeIds, rowItems, colItems, options = {}) {
    // Initialize empty cells object
    /** @type {Object.<string, MatrixCell>} */
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
        context, // User-provided context for the evaluation
        contextNodeIds, // Array of source node IDs that provide context
        rowItems, // Array of row item strings
        colItems, // Array of column item strings
        cells, // Object keyed by "rowIdx-colIdx"
        position: options.position || { x: 0, y: 0 },
        width: options.width || DEFAULT_NODE_SIZES[NodeType.MATRIX].width,
        height: options.height || DEFAULT_NODE_SIZES[NodeType.MATRIX].height,
        created_at: Date.now(),
        tags: [],
        title: null,
        summary: null,
        model: null,
        selection: null,
        ...options,
    };
}

/**
 * Create a cell node (pinned from a matrix)
 * @param {string} matrixId - Parent matrix node ID
 * @param {number} rowIndex - Row index in matrix
 * @param {number} colIndex - Column index in matrix
 * @param {string} rowItem - Row item label
 * @param {string} colItem - Column item label
 * @param {string} content - Cell content
 * @param {CreateNodeOptions} [options={}] - Additional options
 * @returns {CellNode} New cell node object
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
        width: options.width || DEFAULT_NODE_SIZES[NodeType.CELL].width,
        height: options.height || DEFAULT_NODE_SIZES[NodeType.CELL].height,
        created_at: Date.now(),
        tags: [],
        title: null,
        summary: null,
        model: null,
        selection: null,
        ...options,
    };
}

/**
 * Create a row node (extracted row from a matrix)
 * @param {string} matrixId - Parent matrix node ID
 * @param {number} rowIndex - Row index in matrix
 * @param {string} rowItem - Row item label
 * @param {string[]} colItems - Column item labels
 * @param {Array.<string|null>} cellContents - Cell contents for each column
 * @param {CreateNodeOptions} [options={}] - Additional options
 * @returns {RowNode} New row node object
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
        width: options.width || DEFAULT_NODE_SIZES[NodeType.ROW].width,
        height: options.height || DEFAULT_NODE_SIZES[NodeType.ROW].height,
        created_at: Date.now(),
        tags: [],
        title: null,
        summary: null,
        model: null,
        selection: null,
        ...options,
    };
}

/**
 * Create a column node (extracted column from a matrix)
 * @param {string} matrixId - Parent matrix node ID
 * @param {number} colIndex - Column index in matrix
 * @param {string} colItem - Column item label
 * @param {string[]} rowItems - Row item labels
 * @param {Array.<string|null>} cellContents - Cell contents for each row
 * @param {CreateNodeOptions} [options={}] - Additional options
 * @returns {ColumnNode} New column node object
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
        width: options.width || DEFAULT_NODE_SIZES[NodeType.COLUMN].width,
        height: options.height || DEFAULT_NODE_SIZES[NodeType.COLUMN].height,
        created_at: Date.now(),
        tags: [],
        title: null,
        summary: null,
        model: null,
        selection: null,
        ...options,
    };
}

/**
 * Create a flashcard node
 * @param {string} question - Flashcard question
 * @param {string} answer - Flashcard answer
 * @param {CreateNodeOptions} [options={}] - Additional options
 * @returns {FlashcardNode} New flashcard node object
 */
function createFlashcardNode(question, answer, options = {}) {
    return {
        id: crypto.randomUUID(),
        type: NodeType.FLASHCARD,
        content: question, // Primary content is the question
        question,
        answer,
        position: options.position || { x: 0, y: 0 },
        width: options.width || DEFAULT_NODE_SIZES[NodeType.FLASHCARD].width,
        height: options.height || DEFAULT_NODE_SIZES[NodeType.FLASHCARD].height,
        created_at: Date.now(),
        tags: options.tags || [],
        title: null,
        summary: null,
        model: options.model || null,
        selection: null,
        srs: {
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewDate: null,
            lastReviewDate: null,
        },
        ...options,
    };
}

/**
 * Create a new edge
 * @param {string} sourceId - Source node ID
 * @param {string} targetId - Target node ID
 * @param {EdgeTypeValue} [type='reply'] - Edge type
 * @param {Object} [options={}] - Additional options
 * @returns {Edge} New edge object
 */
function createEdge(sourceId, targetId, type = EdgeType.REPLY, options = {}) {
    return {
        id: crypto.randomUUID(),
        source: sourceId,
        target: targetId,
        type,
        ...options,
    };
}

// =============================================================================
// Exports
// =============================================================================

export {
    DEFAULT_NODE_SIZES, EdgeType, NodeType, TAG_COLORS, createCellNode, createColumnNode, createEdge, createFlashcardNode, createMatrixNode, createNode, createRowNode, getDefaultNodeSize
};
