/**
 * Search module - BM25 keyword search for nodes
 *
 * BM25 (Best Matching 25) is a ranking function used by search engines
 * to rank documents based on query terms appearing in each document.
 */

/**
 * BM25 parameters
 */
const BM25_K1 = 1.2; // Term frequency saturation parameter
const BM25_B = 0.75; // Length normalization parameter

/**
 * Tokenize text into lowercase words
 * @param {string} text - Text to tokenize
 * @returns {string[]} Array of tokens
 */
function tokenize(text) {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
        .split(/\s+/)
        .filter((token) => token.length > 0);
}

/**
 * Calculate IDF (Inverse Document Frequency) for a term
 * @param {number} N - Total number of documents
 * @param {number} df - Number of documents containing the term
 * @returns {number} IDF score
 */
function calculateIDF(N, df) {
    if (df === 0) return 0;
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
}

/**
 * BM25 Search Index
 */
class SearchIndex {
    /**
     *
     */
    constructor() {
        this.documents = new Map(); // nodeId -> { tokens, length }
        this.termFrequencies = new Map(); // nodeId -> Map(term -> count)
        this.documentFrequencies = new Map(); // term -> count of documents containing term
        this.avgDocLength = 0;
        this.totalDocuments = 0;
    }

    /**
     * Clear the index
     */
    clear() {
        this.documents.clear();
        this.termFrequencies.clear();
        this.documentFrequencies.clear();
        this.avgDocLength = 0;
        this.totalDocuments = 0;
    }

    /**
     * Add a document (node) to the index
     * @param {string} nodeId - Node ID
     * @param {string} content - Text content to index
     * @param {Object} metadata - Additional metadata (type, etc.)
     */
    addDocument(nodeId, content, metadata = {}) {
        const tokens = tokenize(content);

        // Store document info
        this.documents.set(nodeId, {
            tokens,
            length: tokens.length,
            content,
            ...metadata,
        });

        // Count term frequencies for this document
        const tf = new Map();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }
        this.termFrequencies.set(nodeId, tf);

        // Update document frequencies
        const uniqueTerms = new Set(tokens);
        for (const term of uniqueTerms) {
            this.documentFrequencies.set(term, (this.documentFrequencies.get(term) || 0) + 1);
        }

        // Update stats
        this.totalDocuments++;
        this._updateAvgLength();
    }

    /**
     * Remove a document from the index
     * @param {string} nodeId - Node ID to remove
     */
    removeDocument(nodeId) {
        const doc = this.documents.get(nodeId);
        if (!doc) return;

        // Update document frequencies
        const tf = this.termFrequencies.get(nodeId);
        if (tf) {
            for (const term of tf.keys()) {
                const df = this.documentFrequencies.get(term) || 0;
                if (df <= 1) {
                    this.documentFrequencies.delete(term);
                } else {
                    this.documentFrequencies.set(term, df - 1);
                }
            }
        }

        this.documents.delete(nodeId);
        this.termFrequencies.delete(nodeId);
        this.totalDocuments--;
        this._updateAvgLength();
    }

    /**
     * Update average document length
     */
    _updateAvgLength() {
        if (this.totalDocuments === 0) {
            this.avgDocLength = 0;
            return;
        }

        let totalLength = 0;
        for (const doc of this.documents.values()) {
            totalLength += doc.length;
        }
        this.avgDocLength = totalLength / this.totalDocuments;
    }

    /**
     * Calculate BM25 score for a document given a query
     * @param {string} nodeId - Node ID
     * @param {string[]} queryTokens - Query tokens
     * @returns {number} BM25 score
     */
    _scoreBM25(nodeId, queryTokens) {
        const doc = this.documents.get(nodeId);
        const tf = this.termFrequencies.get(nodeId);

        if (!doc || !tf) return 0;

        const N = this.totalDocuments;
        const avgdl = this.avgDocLength || 1;
        const dl = doc.length;

        let score = 0;

        for (const term of queryTokens) {
            const termFreq = tf.get(term) || 0;
            if (termFreq === 0) continue;

            const df = this.documentFrequencies.get(term) || 0;
            const idf = calculateIDF(N, df);

            // BM25 formula
            const numerator = termFreq * (BM25_K1 + 1);
            const denominator = termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl));

            score += idf * (numerator / denominator);
        }

        return score;
    }

    /**
     * Search for documents matching the query
     * @param {string} query - Search query
     * @param {number} limit - Maximum number of results (default 10)
     * @returns {Array<{nodeId: string, score: number, content: string, snippet: string, metadata: Object}>}
     */
    search(query, limit = 10) {
        if (!query || !query.trim()) return [];

        const queryTokens = tokenize(query);
        if (queryTokens.length === 0) return [];

        const results = [];

        for (const [nodeId, doc] of this.documents) {
            const score = this._scoreBM25(nodeId, queryTokens);

            if (score > 0) {
                results.push({
                    nodeId,
                    score,
                    content: doc.content,
                    snippet: this._generateSnippet(doc.content, queryTokens),
                    type: doc.type,
                    metadata: doc,
                });
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, limit);
    }

    /**
     * Generate a snippet with highlighted query terms
     * @param {string} content - Full content
     * @param {string[]} queryTokens - Query tokens
     * @returns {string} Snippet with context around first match
     */
    _generateSnippet(content, queryTokens) {
        const SNIPPET_LENGTH = 100;
        const CONTEXT_BEFORE = 30;

        const lowerContent = content.toLowerCase();

        // Find first occurrence of any query term
        let firstMatchIndex = content.length;
        for (const token of queryTokens) {
            const idx = lowerContent.indexOf(token);
            if (idx !== -1 && idx < firstMatchIndex) {
                firstMatchIndex = idx;
            }
        }

        if (firstMatchIndex === content.length) {
            // No match found, return beginning of content
            return content.slice(0, SNIPPET_LENGTH) + (content.length > SNIPPET_LENGTH ? '...' : '');
        }

        // Calculate snippet bounds
        let start = Math.max(0, firstMatchIndex - CONTEXT_BEFORE);
        let end = Math.min(content.length, start + SNIPPET_LENGTH);

        // Adjust start to word boundary
        if (start > 0) {
            const spaceIdx = content.indexOf(' ', start);
            if (spaceIdx !== -1 && spaceIdx < firstMatchIndex) {
                start = spaceIdx + 1;
            }
        }

        let snippet = content.slice(start, end);

        // Add ellipsis
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        return snippet;
    }

    /**
     * Rebuild index from an array of nodes
     * @param {Array<{id: string, content: string, type: string}>} nodes
     */
    buildFromNodes(nodes) {
        this.clear();

        for (const node of nodes) {
            // Index content and any other relevant text fields
            let textToIndex = node.content || '';

            // For matrix nodes, index the context and items
            if (node.type === 'matrix') {
                textToIndex = [node.context || '', ...(node.rowItems || []), ...(node.colItems || [])].join(' ');
            }

            // For cell nodes, include row/col items
            if (node.type === 'cell') {
                textToIndex = [node.content || '', node.rowItem || '', node.colItem || ''].join(' ');
            }

            // Include title and summary if present
            if (node.title) textToIndex += ' ' + node.title;
            if (node.summary) textToIndex += ' ' + node.summary;

            if (textToIndex.trim()) {
                this.addDocument(node.id, textToIndex, { type: node.type });
            }
        }
    }
}

/**
 * Node type icons for search results
 */
const NODE_TYPE_ICONS = {
    human: '👤',
    ai: '🤖',
    note: '📝',
    summary: '📋',
    reference: '🔗',
    search: '🔍',
    research: '📚',
    highlight: '✨',
    matrix: '📊',
    cell: '🔲',
};

/**
 * Get icon for node type
 * @param {string} type - Node type
 * @returns {string} Emoji icon
 */
function getNodeTypeIcon(type) {
    return NODE_TYPE_ICONS[type] || '📄';
}

export { SearchIndex, tokenize, calculateIDF, getNodeTypeIcon, NODE_TYPE_ICONS, BM25_K1, BM25_B };
