/**
 * Search Node Plugin (Built-in)
 *
 * Provides search nodes for web search queries.
 * Search nodes display the search query in the node body and host a carousel
 * of results in the output-panel drawer. Each carousel slide shows one result
 * (title, URL, snippet) with a checkbox to include it in reply context and a
 * "View content" button that fetches the page and creates an opt-in child node.
 *
 * Result data is stored on the node as a JSON string in `searchResults`
 * (`[{ title, url, snippet, selected, expanded }]`) plus `searchCarouselIndex`.
 * The ResearchFeature owns the carousel interactions via canvas events
 * (`searchPrevResult`, `searchNextResult`, `searchToggleSelect`, `searchViewContent`).
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * Parse the searchResults JSON string on a node into an array (empty on failure).
 * @param {Object} node
 * @returns {Array<{title:string,url:string,snippet:string,selected:boolean,expanded:boolean}>}
 */
function getResults(node) {
    if (!node || !node.searchResults) return [];
    try {
        const parsed = JSON.parse(node.searchResults);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * SearchNode - Protocol for search queries with a results carousel drawer.
 */
class SearchNode extends BaseNode {
    /**
     * Get the type label for this node.
     * @returns {string}
     */
    getTypeLabel() {
        return 'Search';
    }

    /**
     * Get the type icon for this node.
     * @returns {string}
     */
    getTypeIcon() {
        return '🔍';
    }

    /**
     * Show the results drawer when this node has search results.
     * @returns {boolean}
     */
    hasOutput() {
        return getResults(this.node).length > 0;
    }

    /**
     * Render the results carousel inside the output panel.
     * One result at a time with prev/next, a context checkbox, and a
     * "View content" button. Buttons emit canvas events (handled by ResearchFeature).
     * @param {Object} canvas - Canvas instance (for escapeHtml)
     * @returns {string} HTML for the output panel body
     */
    renderOutputPanel(canvas) {
        const results = getResults(this.node);
        if (results.length === 0) return '';
        const idx = Math.min(Number(this.node.searchCarouselIndex) || 0, results.length - 1);
        const r = results[idx];
        if (!r) return '';

        const selected = r.selected !== false;
        const expanded = !!r.expanded;
        const fetching = !!r.fetching;
        const escaped = (s) => canvas.escapeHtml(s == null ? '' : String(s));
        const viewLabel = expanded ? 'View node' : fetching ? 'Fetching…' : 'View content';

        return `
            <div class="search-carousel" data-index="${idx}">
                <div class="search-carousel-result">
                    <div class="search-carousel-title">${escaped(r.title) || '<em>(no title)</em>'}</div>
                    <div class="search-carousel-url">${escaped(r.url)}</div>
                    <div class="search-carousel-snippet">${escaped(r.snippet)}</div>
                </div>
                <div class="search-carousel-controls">
                    <label class="search-carousel-select" title="Include this result in reply context">
                        <input type="checkbox" class="search-toggle-select" ${selected ? 'checked' : ''}>
                        <span>Context</span>
                    </label>
                    <button type="button" class="search-view-content" title="Fetch the page and open it as a child node" ${fetching ? 'disabled' : ''}>${escaped(viewLabel)}</button>
                </div>
                <div class="search-carousel-nav">
                    <button type="button" class="search-prev" title="Previous result">◀</button>
                    <span class="search-carousel-counter">${idx + 1} / ${results.length}</span>
                    <button type="button" class="search-next" title="Next result">▶</button>
                </div>
            </div>
        `;
    }

    /**
     * Event bindings for the carousel, applied to the output panel body.
     * Each handler emits a canvas event (with the node id); the ResearchFeature
     * owns the actual logic via getCanvasEventHandlers(). We use function
     * handlers (canvas.emit) rather than string handlers because the
     * output-panel binding path invokes functions only.
     * @returns {Array<Object>}
     */
    getEventBindings() {
        const emit = (name) => (nodeId, _e, canvas) => canvas?.emit?.(name, nodeId);
        return [
            { selector: '.search-prev', handler: emit('searchPrevResult') },
            { selector: '.search-next', handler: emit('searchNextResult') },
            { selector: '.search-toggle-select', event: 'change', handler: emit('searchToggleSelect') },
            { selector: '.search-view-content', handler: emit('searchViewContent') },
        ];
    }
}

NodeRegistry.register({
    type: 'search',
    protocol: SearchNode,
    defaultSize: { width: 420, height: 200 },
});

export { SearchNode };
console.log('Search node plugin loaded');
