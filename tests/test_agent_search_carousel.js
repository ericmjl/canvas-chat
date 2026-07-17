/**
 * Tests for agent search → carousel integration.
 *
 * Verifies that createNodeFromInstruction produces a SEARCH node carrying
 * searchResults (carousel data) when the backend instruction includes
 * search_results — mirroring the /search command's carousel model instead
 * of the old REFERENCE-node fan-out.
 *
 * Also verifies that a note created after a search auto-links to the search
 * node (the synthesis note becomes a child of the search node, not linked
 * via ref/link_from to separate reference nodes).
 */
import {
    test,
    assertEqual,
    assertTrue,
    assertFalse,
    NodeType,
    TestGraph,
    createTestNode,
    createTestEdge,
} from './test_setup.js';
import { createNodeFromInstruction } from '../src/canvas_chat/static/js/agent-utils.js';
import { createNode, createEdge, EdgeType } from '../src/canvas_chat/static/js/graph-types.js';

/**
 * Minimal mock canvas — createNodeFromInstruction only needs zoomToSelectionAnimated,
 * renderNode, and updateAllEdges to not throw.
 */
function mockCanvas() {
    return {
        zoomToSelectionAnimated: () => {},
        renderNode: () => {},
        updateAllEdges: () => {},
    };
}

test('Agent search instruction creates SEARCH node with carousel searchResults', () => {
    const graph = new TestGraph();
    const canvas = mockCanvas();

    const instruction = {
        type: 'search',
        ref: 'search-latest',
        title: 'Search: quantum computing',
        content: '**Search (DuckDuckGo):** "quantum computing"\n\n*Found 3 results*',
        search_results: [
            { title: 'A', url: 'http://a', snippet: 'snip A', selected: true, expanded: false },
            { title: 'B', url: 'http://b', snippet: 'snip B', selected: true, expanded: false },
        ],
        search_carousel_index: 0,
    };

    const parentId = 'parent-1';
    graph.addNode(createTestNode(parentId, NodeType.HUMAN, 'question'));

    const newNodeId = createNodeFromInstruction(
        instruction,
        parentId,
        new Map(),
        graph,
        canvas,
        createNode,
        createEdge,
        NodeType,
        EdgeType,
        () => {},
        () => {}
    );

    assertTrue(newNodeId !== null, 'Should return a node ID');

    const searchNode = graph.getNode(newNodeId);
    assertTrue(searchNode !== undefined, 'Node should exist in graph');
    assertEqual(searchNode.type, NodeType.SEARCH, 'Should be a SEARCH node');

    // The key assertion: searchResults is set as a JSON string (carousel)
    assertTrue(searchNode.searchResults, 'searchResults field should be set');
    const parsed = JSON.parse(searchNode.searchResults);
    assertEqual(parsed.length, 2, 'Should have 2 carousel results');
    assertEqual(parsed[0].title, 'A', 'First result title matches');
    assertEqual(parsed[1].url, 'http://b', 'Second result url matches');
    assertTrue(parsed[0].selected, 'Results default to selected=true');
    assertEqual(searchNode.searchCarouselIndex, 0, 'Carousel index starts at 0');
});

test('Agent search instruction does NOT create separate REFERENCE nodes', () => {
    const graph = new TestGraph();
    const canvas = mockCanvas();

    const instruction = {
        type: 'search',
        ref: 'search-latest',
        title: 'Search: test',
        content: 'Search content',
        search_results: [
            { title: 'R1', url: 'http://r1', snippet: 's1', selected: true, expanded: false },
            { title: 'R2', url: 'http://r2', snippet: 's2', selected: true, expanded: false },
            { title: 'R3', url: 'http://r3', snippet: 's3', selected: true, expanded: false },
        ],
        search_carousel_index: 0,
    };

    const parentId = 'parent-1';
    graph.addNode(createTestNode(parentId, NodeType.HUMAN, 'q'));

    const searchId = createNodeFromInstruction(
        instruction, parentId, new Map(),
        graph, canvas, createNode, createEdge, NodeType, EdgeType,
        () => {}, () => {}
    );

    // Only 2 nodes should exist: the parent HUMAN + the SEARCH node.
    // NO reference fan-out nodes.
    const allNodes = graph.getAllNodes();
    assertEqual(allNodes.length, 2, 'Should have exactly parent + search node (no fan-out)');

    const refNodes = allNodes.filter((n) => n.type === NodeType.REFERENCE);
    assertEqual(refNodes.length, 0, 'Should have ZERO reference nodes');
});

test('Agent note after search links to search node as child', () => {
    const graph = new TestGraph();
    const canvas = mockCanvas();

    const parentId = 'parent-1';
    graph.addNode(createTestNode(parentId, NodeType.HUMAN, 'question'));

    // Step 1: Agent searches
    const searchInstruction = {
        type: 'search',
        ref: 'search-latest',
        title: 'Search: topic',
        content: 'Search content',
        search_results: [
            { title: 'R', url: 'http://r', snippet: 's', selected: true, expanded: false },
        ],
        search_carousel_index: 0,
    };

    const searchId = createNodeFromInstruction(
        searchInstruction, parentId, new Map(),
        graph, canvas, createNode, createEdge, NodeType, EdgeType,
        () => {}, () => {}
    );

    // The agent tracks lastToolParentId = searchId after a search
    const lastToolParentId = searchId;

    // Step 2: Agent creates a synthesis note (no link_from)
    const noteInstruction = {
        type: 'note',
        title: 'Summary',
        content: 'Based on the search results...',
    };

    const noteId = createNodeFromInstruction(
        noteInstruction, lastToolParentId, new Map(),
        graph, canvas, createNode, createEdge, NodeType, EdgeType,
        () => {}, () => {}
    );

    assertTrue(noteId !== null, 'Note should be created');

    // The note should be linked FROM the search node (GENERATES edge)
    const edges = graph.getAllEdges();
    const noteEdges = edges.filter((e) => e.target === noteId);
    assertEqual(noteEdges.length, 1, 'Note should have exactly one incoming edge');
    assertEqual(noteEdges[0].source, searchId, 'Edge source should be the search node');

    // Only 3 nodes: parent + search + note (no reference fan-out)
    assertEqual(graph.getAllNodes().length, 3, 'Should have parent + search + note');
});

test('Agent search without search_results field still works (backward compat)', () => {
    const graph = new TestGraph();
    const canvas = mockCanvas();

    const instruction = {
        type: 'search',
        title: 'Search: legacy',
        content: 'Search content',
        // No search_results field — legacy instruction
    };

    const parentId = 'parent-1';
    graph.addNode(createTestNode(parentId, NodeType.HUMAN, 'q'));

    const nodeId = createNodeFromInstruction(
        instruction, parentId, new Map(),
        graph, canvas, createNode, createEdge, NodeType, EdgeType,
        () => {}, () => {}
    );

    assertTrue(nodeId !== null, 'Should still create a search node');
    const node = graph.getNode(nodeId);
    assertEqual(node.type, NodeType.SEARCH, 'Should be SEARCH type');
    assertFalse(node.searchResults, 'searchResults should not be set');
});

test('Agent note with parent_nodes creates edges from referenced nodes', () => {
    const graph = new TestGraph();
    const canvas = mockCanvas();
    const refToNodeId = new Map();

    const parentId = 'parent-1';
    graph.addNode(createTestNode(parentId, NodeType.HUMAN, 'q'));

    // Simulate two searches, assigned refs node-1 and node-2
    const search1 = {
        type: 'search',
        ref: 'node-1',
        title: 'Search A',
        content: 'A',
        search_results: [{ title: 'R', url: 'http://r', snippet: 's', selected: true, expanded: false }],
        search_carousel_index: 0,
    };
    const search2 = {
        type: 'search',
        ref: 'node-2',
        title: 'Search B',
        content: 'B',
        search_results: [{ title: 'R2', url: 'http://r2', snippet: 's2', selected: true, expanded: false }],
        search_carousel_index: 0,
    };

    const id1 = createNodeFromInstruction(
        search1, parentId, refToNodeId,
        graph, canvas, createNode, createEdge, NodeType, EdgeType,
        () => {}, () => {}
    );
    refToNodeId.set('node-1', id1);

    const id2 = createNodeFromInstruction(
        search2, parentId, refToNodeId,
        graph, canvas, createNode, createEdge, NodeType, EdgeType,
        () => {}, () => {}
    );
    refToNodeId.set('node-2', id2);

    // Create a synthesis note linked to BOTH searches via parent_nodes
    const noteInstruction = {
        type: 'note',
        title: 'Synthesis',
        content: 'Combining A and B...',
        link_from_refs: ['node-1', 'node-2'],
    };

    const noteId = createNodeFromInstruction(
        noteInstruction, parentId, refToNodeId,
        graph, canvas, createNode, createEdge, NodeType, EdgeType,
        () => {}, () => {}
    );

    assertTrue(noteId !== null, 'Note should be created');

    // The note should have GENERATES edges from BOTH search nodes
    const edges = graph.getAllEdges();
    const noteEdges = edges.filter((e) => e.target === noteId);
    assertEqual(noteEdges.length, 2, 'Note should have 2 incoming edges (from both searches)');

    const sources = noteEdges.map((e) => e.source).sort();
    assertEqual(sources[0], id1, 'First edge from search node-1');
    assertEqual(sources[1], id2, 'Second edge from search node-2');
});
