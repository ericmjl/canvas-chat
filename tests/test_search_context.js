/**
 * Tests for CRDTGraph.resolveContextWithSearchResults.
 *
 * Verifies that replying to a SEARCH node pulls the node's curated results into
 * the LLM context: selected snippets by default, and the full page text of any
 * result that has been expanded into a child REFERENCE node ("View content").
 *
 * These exercise the REAL resolveContextWithSearchResults on a real CRDTGraph
 * (via TestGraph), not a copy.
 */
import {
    test,
    assertEqual,
    assertTrue,
    NodeType,
    TestGraph,
    createTestNode,
    createTestEdge,
} from './test_setup.js';

/**
 * Build a SEARCH node carrying a searchResults JSON payload.
 * @param {string} id
 * @param {Array<Object>} results
 * @returns {Object}
 */
function searchNodeWith(id, results) {
    const node = createTestNode(id, NodeType.SEARCH, `Search: "q"`);
    node.searchResults = JSON.stringify(results);
    node.searchCarouselIndex = 0;
    return node;
}

test('Search context: selected results are included as context', () => {
    const graph = new TestGraph();
    const search = searchNodeWith('S', [
        { title: 'A', url: 'http://a', snippet: 'snip A', selected: true, expanded: false },
        { title: 'B', url: 'http://b', snippet: 'snip B', selected: true, expanded: false },
    ]);
    const human = createTestNode('H', NodeType.HUMAN, 'reply');
    graph.addNode(search);
    graph.addNode(human);
    graph.addEdge(createTestEdge('S', 'H', 'reply'));

    const ctx = graph.resolveContextWithSearchResults(['H']);

    // human + search + 2 result snippets
    assertEqual(ctx.length, 4);
    const joined = ctx.map((m) => m.content).join('\n');
    assertTrue(joined.includes('snip A'), 'snippet A should be in context');
    assertTrue(joined.includes('snip B'), 'snippet B should be in context');
});

test('Search context: unselected results are excluded', () => {
    const graph = new TestGraph();
    const search = searchNodeWith('S', [
        { title: 'A', url: 'http://a', snippet: 'snip A', selected: true, expanded: false },
        { title: 'B', url: 'http://b', snippet: 'snip B', selected: false, expanded: false },
    ]);
    const human = createTestNode('H', NodeType.HUMAN, 'reply');
    graph.addNode(search);
    graph.addNode(human);
    graph.addEdge(createTestEdge('S', 'H', 'reply'));

    const ctx = graph.resolveContextWithSearchResults(['H']);
    const joined = ctx.map((m) => m.content).join('\n');
    assertTrue(joined.includes('snip A'), 'selected A included');
    assertTrue(!joined.includes('snip B'), 'unselected B excluded');
});

test('Search context: expanded child node text replaces snippet (and dedups by url)', () => {
    const graph = new TestGraph();
    const search = searchNodeWith('S', [
        { title: 'A', url: 'http://a', snippet: 'snip A', selected: true, expanded: true },
    ]);
    const child = createTestNode('C', NodeType.REFERENCE, '**[A](http://a)**\n\nFULL PAGE TEXT');
    child.url = 'http://a';
    const human = createTestNode('H', NodeType.HUMAN, 'reply');
    graph.addNode(search);
    graph.addNode(child);
    graph.addNode(human);
    graph.addEdge(createTestEdge('S', 'C', 'search_result'));
    graph.addEdge(createTestEdge('S', 'H', 'reply'));

    const ctx = graph.resolveContextWithSearchResults(['H']);
    const joined = ctx.map((m) => m.content).join('\n');
    assertTrue(joined.includes('FULL PAGE TEXT'), 'expanded child full text included');
    assertTrue(!joined.includes('snip A'), 'snippet not duplicated when child exists');
});

test('Search context: no SEARCH ancestor behaves like resolveContext', () => {
    const graph = new TestGraph();
    const a = createTestNode('A', NodeType.HUMAN, 'hi');
    const b = createTestNode('B', NodeType.HUMAN, 'reply');
    graph.addNode(a);
    graph.addNode(b);
    graph.addEdge(createTestEdge('A', 'B', 'reply'));

    const base = graph.resolveContext(['B']);
    const enriched = graph.resolveContextWithSearchResults(['B']);
    assertEqual(base.length, enriched.length);
});

test('Search context: SEARCH node without searchResults does not crash or add extras', () => {
    const graph = new TestGraph();
    const search = createTestNode('S', NodeType.SEARCH, 'Search: "q"'); // no searchResults field
    const human = createTestNode('H', NodeType.HUMAN, 'reply');
    graph.addNode(search);
    graph.addNode(human);
    graph.addEdge(createTestEdge('S', 'H', 'reply'));

    const base = graph.resolveContext(['H']);
    const enriched = graph.resolveContextWithSearchResults(['H']);
    assertEqual(base.length, enriched.length); // no extras, no crash
});
