# Search Module: Low-Level Design

**Created**: 2026-03-16
**Status**: Design Phase
**Parent**: [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The Search module provides BM25-based keyword search across all nodes in the canvas. As a local-first application, Canvas-Chat stores all conversation data in the browser, and users need an efficient way to find relevant content within their growing collection of nodes.

### Why BM25?

The BM25 (Best Matching 25) algorithm is chosen over simpler approaches like raw term frequency for several reasons. First, BM25 naturally handles term frequency saturation through the K1 parameter, meaning that repeating a term many times does not linearly increase relevance. Second, BM25 incorporates document length normalization via the B parameter, ensuring that longer documents are not artificially penalized or boosted simply due to their size. Third, BM25 uses Inverse Document Frequency (IDF) weighting, which gives higher scores to rare terms that are more likely to distinguish relevant documents from irrelevant ones.

### Design Goals

The search module prioritizes three characteristics. Responsiveness is achieved by keeping the entire search index in memory for instant query results. Simplicity means the index is rebuilt on-demand when the search overlay opens, avoiding complex incremental update logic. Finally, UX familiarity is maintained by using the Ctrl+K keyboard shortcut and a modal overlay pattern that users recognize from modern applications like VS Code and Slack.

## Technical Details

### BM25 Algorithm

The BM25 ranking function scores documents based on query term frequency and inverse document frequency, with length normalization applied. The implementation uses the standard BM25 formula:

```text
score(Q, D) = sum over q in Q of:
    IDF(q) * (f(q, D) * (k1 + 1)) / (f(q, D) + k1 * (1 - b + b * |D| / avgdl))
```

#### Parameters

| Parameter | Value | Purpose                             |
| --------- | ----- | ----------------------------------- |
| K1        | 1.2   | Term frequency saturation threshold |
| B         | 0.75  | Length normalization strength       |

The K1 parameter controls how quickly term frequency contributions saturate. A value of 1.2 means that after a term appears roughly once or twice in a document, additional occurrences contribute diminishing returns. This prevents single documents with excessively repeated terms from dominating results.

The B parameter controls the degree of length normalization. At 0.75, documents are moderately normalized for length. A value of 0 would ignore document length entirely, while a value of 1 would fully normalize by relative length.

#### IDF Calculation

The implementation uses a smoothed IDF formula that avoids zero values for rare terms:

```text
IDF(N, df) = log((N - df + 0.5) / (df + 0.5) + 1)
```

This formula ensures that terms appearing in all documents receive a score approaching zero rather than exactly zero, which provides more stable ranking behavior.

### Index Structure

The SearchIndex class maintains three primary data structures:

```javascript
documents: Map<nodeId, { tokens: string[], length: number, content: string, type: string, ... }>
termFrequencies: Map<nodeId, Map<term, count>>
documentFrequencies: Map<term, count>
```

The documents map stores tokenized content and metadata for each indexed node. The termFrequencies map tracks how many times each term appears in each document, enabling efficient score calculation. The documentFrequencies map tracks how many documents contain each term, enabling IDF calculation.

### Index Building

The buildFromNodes method reconstructs the entire search index from the current graph state:

```javascript
buildFromNodes(nodes) {
    this.clear();
    for (const node of nodes) {
        let textToIndex = node.content || '';

        // Matrix nodes: include row/col items
        if (node.type === 'matrix') {
            textToIndex = [node.context || '', ...(node.rowItems || []), ...(node.colItems || [])].join(' ');
        }

        // Cell nodes: include row/col labels
        if (node.type === 'cell') {
            textToIndex = [node.content || '', node.rowItem || '', node.colItem || ''].join(' ');
        }

        // Include title and summary
        if (node.title) textToIndex += ' ' + node.title;
        if (node.summary) textToIndex += ' ' + node.summary;

        if (textToIndex.trim()) {
            this.addDocument(node.id, textToIndex, { type: node.type });
        }
    }
}
```

The index rebuilds from scratch each time because the codebase lacks a mechanism for detecting which nodes have changed since the last index build. Given that most sessions contain fewer than a few hundred nodes, the full rebuild completes in milliseconds, making this approach acceptable.

### Query Execution

The search method executes as follows:

1. Tokenize the query using the same tokenize function used during indexing
2. Iterate over all indexed documents
3. Calculate BM25 score for each document against query tokens
4. Filter documents with score > 0
5. Sort by score descending
6. Return top N results (default 10)

```javascript
search(query, limit = 10) {
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

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
}
```

### Snippet Generation

Search results include snippets that show context around the first matching term. The algorithm finds the earliest occurrence of any query term, then extracts a window of characters centered on that match:

```javascript
_generateSnippet(content, queryTokens) {
    const SNIPPET_LENGTH = 100;
    const CONTEXT_BEFORE = 30;

    // Find earliest match
    let firstMatchIndex = content.length;
    for (const token of queryTokens) {
        const idx = content.toLowerCase().indexOf(token);
        if (idx !== -1 && idx < firstMatchIndex) {
            firstMatchIndex = idx;
        }
    }

    // Extract window, adjust to word boundaries
    let start = Math.max(0, firstMatchIndex - CONTEXT_BEFORE);
    let end = Math.min(content.length, start + SNIPPET_LENGTH);

    // Trim to word boundaries
    if (start > 0) {
        const spaceIdx = content.indexOf(' ', start);
        if (spaceIdx !== -1 && spaceIdx < firstMatchIndex) {
            start = spaceIdx + 1;
        }
    }

    // Add ellipsis
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
}
```

### Tokenization

The tokenize function converts text into lowercase words suitable for indexing and matching:

```javascript
function tokenize(text) {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 0);
}
```

This approach lowercases all text for case-insensitive matching, replaces punctuation with spaces (so "don't" becomes "don t"), splits on whitespace, and filters empty tokens.

### UI Integration

The search UI consists of an overlay modal triggered by the Ctrl+K keyboard shortcut or by clicking the search button in the toolbar. The implementation lives in app.js with the following flow:

#### Opening Search

When the user triggers search, the index is rebuilt to ensure freshness:

```javascript
openSearch() {
    this.rebuildSearchIndex();
    const overlay = document.getElementById('search-overlay');
    overlay.style.display = 'flex';
    document.getElementById('search-input').value = '';
    setTimeout(() => input.focus(), 50);
}
```

#### Handling Input

Each keystroke triggers a search:

```javascript
handleSearchInput() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
        this.renderSearchResults([]);
        return;
    }
    const results = this.searchIndex.search(query, 15);
    this.renderSearchResults(results, query);
}
```

#### Keyboard Navigation

The search overlay supports Arrow Up, Arrow Down, Enter, and Escape for navigation:

- Arrow keys cycle through results with visual selection
- Enter navigates to the selected node and closes the overlay
- Escape closes the overlay without navigation

#### Result Rendering

Results are rendered with the node type icon, type name, and a snippet with highlighted matching terms:

```javascript
renderSearchResults(results, query) {
    const queryTokens = query.toLowerCase().split(/\s+/);

    const html = results.map((result, idx) => {
        const icon = getNodeTypeIcon(result.type);
        let snippet = escapeHtmlText(result.snippet);

        // Highlight matching terms
        for (const token of queryTokens) {
            const regex = new RegExp(`(${escapeRegex(token)})`, 'gi');
            snippet = snippet.replace(regex, '<mark>$1</mark>');
        }

        return `<div class="search-result${idx === 0 ? ' selected' : ''}" data-node-id="${result.nodeId}">
            <span class="search-result-icon">${icon}</span>
            <div class="search-result-content">
                <div class="search-result-type">${capitalize(result.type)}</div>
                <div class="search-result-snippet">${snippet}</div>
            </div>
        </div>`;
    }).join('');
}
```

### Keyboard Shortcut

The search action is registered in the keybindings system:

```javascript
// In keybindings.js
{ action: 'search', keys: ['Ctrl', 'k'], description: 'Search nodes' }
```

The global keydown handler routes this action to openSearch().

## Open Questions and Future Decisions

### Resolved

1. ✅ BM25 algorithm chosen - K1=1.2, B=0.75 standard values
2. ✅ Full index rebuild on search open - ensures freshness for now

### Deferred

1. Incremental index updates - currently full rebuild, optimization for large graphs
2. Fuzzy matching for typo tolerance
3. Phrase search support
4. Additional ranking factors (recency, node type weights)

## References

- **High-Level Design**: [../high-level-design.md](../high-level-design.md)
- **Search Module Implementation**: [../../src/canvas_chat/static/js/search.js](../../src/canvas_chat/static/js/search.js)
- **Search UI Integration**: [../../src/canvas_chat/static/js/app.js](../../src/canvas_chat/static/js/app.js) (lines 4460-4540)
- **Search Tests**: [../../tests/test_search.js](../../tests/test_search.js)
- **BM25 Algorithm**: Robertson and Zaragoza (2009), "The Probabilistic Relevance Framework: BM25 and Beyond"
