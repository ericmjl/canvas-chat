/**
 * Search Node Plugin (Built-in)
 *
 * Provides search nodes for web search queries.
 * Search nodes display the search query and are created by ResearchFeature
 * when users run the /search command.
 */
import { BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

class SearchNode extends BaseNode {
    getTypeLabel() {
        return 'Search';
    }

    getTypeIcon() {
        return '🔍';
    }
}

NodeRegistry.register({
    type: 'search',
    protocol: SearchNode,
    defaultSize: { width: 420, height: 200 },
});

export { SearchNode };
console.log('Search node plugin loaded');
