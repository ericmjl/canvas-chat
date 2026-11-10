/**
 * Tests for canvas-format.js (JSON Canvas interoperability, issue #246)
 */

import {
    test,
    tests,
    assertEqual,
    assertTrue,
    assertFalse,
    assertDeepEqual,
    assertThrows,
    NodeType,
    EdgeType,
} from './test_setup.js';
import {
    createEdge,
    createFlashcardNode,
    createMatrixNode,
    createNode,
} from '../src/canvas_chat/static/js/graph-types.js';
import { fromJsonCanvas, isJsonCanvas, toJsonCanvas } from '../src/canvas_chat/static/js/canvas-format.js';
import { Storage } from '../src/canvas_chat/static/js/storage.js';

// ============================================================
// Fixtures
// ============================================================

/**
 * Build a small but varied session: chat thread, note, reference with URL,
 * flashcard, matrix, fractional positions, tags, and a dangling edge.
 * @returns {Object} Session
 */
function buildSession() {
    const human = createNode(NodeType.HUMAN, 'What is JSON Canvas?', {
        id: 'h1',
        position: { x: 100.4, y: 200.6 },
        tags: ['#a5d8ff'],
    });
    const ai = createNode(NodeType.AI, 'An open format for infinite canvases.', {
        id: 'a1',
        position: { x: 100, y: 500 },
        model: 'openai/gpt-4o',
    });
    const ref = createNode(NodeType.REFERENCE, '**JSON Canvas spec**', {
        id: 'r1',
        position: { x: 800, y: 500 },
        url: 'https://jsoncanvas.org/spec/1.0/',
    });
    const card = createFlashcardNode('What does JSON Canvas define?', 'Nodes and edges', {
        id: 'f1',
        position: { x: 100, y: 900 },
    });
    const matrix = createMatrixNode('Compare formats', ['h1'], ['Obsidian', 'Canvas-Chat'], ['Open?'], {
        id: 'm1',
        position: { x: 900, y: 900 },
    });
    matrix.cells['0-0'] = { content: 'Yes', filled: true };
    // Shapes produced by /fetch and /youtube: no `url` field on the node.
    const fetched = createNode(NodeType.FETCH_RESULT, '**[Spec page](https://jsoncanvas.org/)**\n\nBody text', {
        id: 'w1',
        position: { x: 1600, y: 500 },
        title: 'Spec page',
    });
    const video = createNode(NodeType.YOUTUBE, 'Transcript text', {
        id: 'y1',
        position: { x: 1600, y: 900 },
        youtubeVideoId: 'abc123',
    });

    return {
        id: 'sess-1',
        name: 'Interop test',
        created_at: 1710000000000,
        updated_at: 1710000001000,
        tags: { '#a5d8ff': { name: 'Question', color: '#a5d8ff' } },
        nodes: [human, ai, ref, card, matrix, fetched, video],
        edges: [
            createEdge('h1', 'a1', EdgeType.REPLY),
            createEdge('a1', 'r1', EdgeType.REFERENCE),
            createEdge('a1', 'f1', EdgeType.GENERATES),
            createEdge('a1', 'missing-node', EdgeType.REPLY),
        ],
    };
}

/**
 * Recursively sort object keys so deep comparisons ignore key order.
 * @param {*} value - Value to normalize
 * @returns {*} Normalized value
 */
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((k) => [k, canonical(value[k])])
        );
    }
    return value;
}

// ============================================================
// Export (toJsonCanvas)
// ============================================================

test('toJsonCanvas: fetched pages and YouTube nodes export as links', () => {
    const doc = toJsonCanvas(buildSession());
    const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
    assertEqual(byId.w1.type, 'link');
    assertEqual(byId.w1.url, 'https://jsoncanvas.org/');
    assertEqual(byId.y1.type, 'link');
    assertEqual(byId.y1.url, 'https://www.youtube.com/watch?v=abc123');
});

test('toJsonCanvas: document namespace carries format version 2 and session metadata', () => {
    const doc = toJsonCanvas(buildSession());
    assertEqual(doc.canvasChat.version, 2);
    assertEqual(doc.canvasChat.sessionId, 'sess-1');
    assertEqual(doc.canvasChat.sessionName, 'Interop test');
    assertEqual(doc.canvasChat.created_at, 1710000000000);
    assertDeepEqual(doc.canvasChat.tags, { '#a5d8ff': { name: 'Question', color: '#a5d8ff' } });
});

test('toJsonCanvas: edges end in an arrow', () => {
    const doc = toJsonCanvas(buildSession(), { includeExtensions: false });
    for (const edge of doc.edges) assertEqual(edge.toEnd, 'arrow');
});

// ============================================================
// Export (toJsonCanvas), continued
// ============================================================

test('toJsonCanvas: nodes use flat integer x/y/width/height', () => {
    const doc = toJsonCanvas(buildSession());
    for (const node of doc.nodes) {
        for (const key of ['x', 'y', 'width', 'height']) {
            assertTrue(Number.isInteger(node[key]), `${node.id}.${key} should be an integer`);
        }
        assertFalse('position' in node, 'position should not be a top-level JSON Canvas field');
    }
    const human = doc.nodes.find((n) => n.id === 'h1');
    assertEqual(human.x, 100);
    assertEqual(human.y, 201);
});

test('toJsonCanvas: maps node types to text and link', () => {
    const doc = toJsonCanvas(buildSession());
    const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));

    assertEqual(byId.h1.type, 'text');
    assertEqual(byId.h1.text, 'What is JSON Canvas?');
    assertEqual(byId.r1.type, 'link');
    assertEqual(byId.r1.url, 'https://jsoncanvas.org/spec/1.0/');
    assertEqual(byId.f1.type, 'text');
    assertTrue(byId.f1.text.includes('What does JSON Canvas define?'));
    assertTrue(byId.f1.text.includes('Nodes and edges'));
});

test('toJsonCanvas: matrix becomes a readable markdown table', () => {
    const doc = toJsonCanvas(buildSession());
    const matrix = doc.nodes.find((n) => n.id === 'm1');
    assertEqual(matrix.type, 'text');
    assertTrue(matrix.text.includes('| | Open? |'), matrix.text);
    assertTrue(matrix.text.includes('| Obsidian | Yes |'), matrix.text);
    assertTrue(matrix.text.includes('| Canvas-Chat |  |'), matrix.text);
});

test('toJsonCanvas: reference without URL falls back to text', () => {
    const node = createNode(NodeType.REFERENCE, 'No link here', { id: 'r2' });
    const doc = toJsonCanvas({ nodes: [node], edges: [] });
    assertEqual(doc.nodes[0].type, 'text');
    assertEqual(doc.nodes[0].text, 'No link here');
});

test('toJsonCanvas: first tag becomes the node color', () => {
    const doc = toJsonCanvas(buildSession());
    assertEqual(doc.nodes.find((n) => n.id === 'h1').color, '#a5d8ff');
    assertFalse('color' in doc.nodes.find((n) => n.id === 'a1'));
});

test('toJsonCanvas: edges use fromNode/toNode and drop dangling edges', () => {
    const doc = toJsonCanvas(buildSession());
    assertEqual(doc.edges.length, 3);
    for (const edge of doc.edges) {
        assertTrue(typeof edge.fromNode === 'string' && typeof edge.toNode === 'string');
        assertFalse('source' in edge);
        assertFalse('target' in edge);
    }
});

test('toJsonCanvas: includeExtensions=false produces spec-only output', () => {
    const doc = toJsonCanvas(buildSession(), { includeExtensions: false });
    assertFalse('canvasChat' in doc);
    for (const item of [...doc.nodes, ...doc.edges]) {
        assertFalse('canvasChat' in item, `${item.id} should have no canvasChat namespace`);
    }
    const allowedNodeKeys = new Set([
        'id',
        'type',
        'x',
        'y',
        'width',
        'height',
        'color',
        'text',
        'file',
        'subpath',
        'url',
        'label',
        'background',
        'backgroundStyle',
    ]);
    for (const node of doc.nodes) {
        for (const key of Object.keys(node)) {
            assertTrue(allowedNodeKeys.has(key), `unexpected key ${key} on node ${node.id}`);
        }
    }
});

test('toJsonCanvas: handles empty and missing input', () => {
    assertDeepEqual(toJsonCanvas({ nodes: [], edges: [] }, { includeExtensions: false }), { nodes: [], edges: [] });
    assertDeepEqual(toJsonCanvas(null, { includeExtensions: false }), { nodes: [], edges: [] });
});

// ============================================================
// Round trip
// ============================================================

test('round trip: session → JSON Canvas → session is lossless', () => {
    const session = buildSession();
    const restored = fromJsonCanvas(JSON.parse(JSON.stringify(toJsonCanvas(session))));

    assertDeepEqual(canonical(restored.nodes), canonical(session.nodes));
    // The dangling edge is dropped; everything else survives unchanged.
    assertDeepEqual(canonical(restored.edges), canonical(session.edges.filter((e) => e.target !== 'missing-node')));
    assertEqual(restored.name, 'Interop test');
    assertEqual(restored.id, 'sess-1');
    assertDeepEqual(restored.tags, session.tags);
});

test('round trip: text edited in another tool is picked up', () => {
    const doc = toJsonCanvas(buildSession());
    doc.nodes.find((n) => n.id === 'a1').text = 'Edited in Obsidian';
    const restored = fromJsonCanvas(doc);
    const ai = restored.nodes.find((n) => n.id === 'a1');
    assertEqual(ai.content, 'Edited in Obsidian');
    assertEqual(ai.type, NodeType.AI);
    assertEqual(ai.model, 'openai/gpt-4o');
});

test('round trip: generated flashcard text does not overwrite content', () => {
    const restored = fromJsonCanvas(toJsonCanvas(buildSession()));
    const card = restored.nodes.find((n) => n.id === 'f1');
    assertEqual(card.content, 'What does JSON Canvas define?');
    assertEqual(card.question, 'What does JSON Canvas define?');
    assertEqual(card.answer, 'Nodes and edges');
});

test('round trip: node with fractional position moved in another tool keeps its new position', () => {
    const doc = toJsonCanvas(buildSession());
    const human = doc.nodes.find((n) => n.id === 'h1'); // exported from {100.4, 200.6}
    human.x = 300;
    human.y = 400;
    human.width = 500;
    const restored = fromJsonCanvas(doc).nodes.find((n) => n.id === 'h1');
    assertDeepEqual(restored.position, { x: 300, y: 400 });
    assertEqual(restored.width, 500);
});

test('round trip: node moved in another tool keeps its new position', () => {
    const doc = toJsonCanvas(buildSession());
    const ai = doc.nodes.find((n) => n.id === 'a1');
    ai.x = 42;
    ai.y = 84;
    const restored = fromJsonCanvas(doc);
    assertDeepEqual(restored.nodes.find((n) => n.id === 'a1').position, { x: 42, y: 84 });
});

// ============================================================
// Import of plain JSON Canvas (e.g. from Obsidian)
// ============================================================

const obsidianCanvas = {
    nodes: [
        { id: 't1', type: 'text', x: 0, y: 0, width: 250, height: 60, text: '# Hello\nFrom Obsidian', color: '1' },
        { id: 'l1', type: 'link', x: 300, y: 0, width: 400, height: 400, url: 'https://obsidian.md' },
        { id: 'fl', type: 'file', x: 0, y: 300, width: 400, height: 400, file: 'Notes/Ideas.md', subpath: '#Top' },
        { id: 'g1', type: 'group', x: -50, y: -50, width: 900, height: 900, label: 'Research' },
    ],
    edges: [
        { id: 'e1', fromNode: 't1', fromSide: 'right', toNode: 'l1', toSide: 'left', label: 'cites' },
        { id: 'e2', fromNode: 't1', toNode: 'ghost' },
    ],
};

test('fromJsonCanvas: small Obsidian nodes are enlarged and the layout spread to match', () => {
    const session = fromJsonCanvas(obsidianCanvas);
    const byId = Object.fromEntries(session.nodes.map((n) => [n.id, n]));
    // t1 is 250x60; it must grow to the 360x200 minimum (height factor 200/60).
    assertEqual(byId.t1.width, 360);
    assertEqual(byId.t1.height, 200);
    // Positions scale by the same factor, so t1 (now 360 wide) still ends before l1.
    assertEqual(byId.l1.position.x, Math.round((300 * 200) / 60));
    assertTrue(byId.t1.position.x + byId.t1.width <= byId.l1.position.x);
    // Nodes already large enough keep their size.
    assertEqual(byId.l1.width, 400);
    assertEqual(byId.l1.height, 400);
});

test('fromJsonCanvas: superset files keep their exact geometry', () => {
    const restored = fromJsonCanvas(toJsonCanvas(buildSession()));
    assertDeepEqual(restored.nodes.find((n) => n.id === 'a1').position, { x: 100, y: 500 });
});

test('fromJsonCanvas: maps plain JSON Canvas node types', () => {
    const session = fromJsonCanvas(obsidianCanvas);
    const byId = Object.fromEntries(session.nodes.map((n) => [n.id, n]));

    assertEqual(byId.t1.type, NodeType.NOTE);
    assertEqual(byId.t1.content, '# Hello\nFrom Obsidian');
    assertDeepEqual(byId.t1.position, { x: 0, y: 0 });

    assertEqual(byId.l1.type, NodeType.REFERENCE);
    assertEqual(byId.l1.url, 'https://obsidian.md');
    assertTrue(byId.l1.content.includes('https://obsidian.md'));

    assertEqual(byId.fl.type, NodeType.NOTE);
    assertTrue(byId.fl.content.includes('Notes/Ideas.md#Top'));

    assertEqual(byId.g1.type, NodeType.NOTE);
    assertEqual(byId.g1.title, 'Research');

    for (const node of session.nodes) {
        assertTrue(Array.isArray(node.tags), 'tags should be an array');
    }
});

test('fromJsonCanvas: maps edges and drops ones pointing at unknown nodes', () => {
    const session = fromJsonCanvas(obsidianCanvas);
    assertEqual(session.edges.length, 1);
    const [edge] = session.edges;
    assertEqual(edge.source, 't1');
    assertEqual(edge.target, 'l1');
    assertEqual(edge.type, EdgeType.REPLY);
    assertEqual(edge.label, 'cites');
});

test('fromJsonCanvas: empty document', () => {
    const session = fromJsonCanvas({});
    assertDeepEqual(session.nodes, []);
    assertDeepEqual(session.edges, []);
});

test('fromJsonCanvas: rejects native sessions', () => {
    assertThrows(() => fromJsonCanvas(buildSession()));
});

// ============================================================
// Format detection
// ============================================================

test('isJsonCanvas: detects JSON Canvas documents', () => {
    assertTrue(isJsonCanvas(obsidianCanvas));
    assertTrue(isJsonCanvas(toJsonCanvas(buildSession())));
    assertTrue(isJsonCanvas(toJsonCanvas(buildSession(), { includeExtensions: false })));
    assertTrue(isJsonCanvas({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: '' }] }));
    assertTrue(isJsonCanvas({}));
});

test('isJsonCanvas: rejects native sessions and junk', () => {
    assertFalse(isJsonCanvas(buildSession()));
    assertFalse(isJsonCanvas({ id: 's', created_at: 1, nodes: [], edges: [] }));
    assertFalse(isJsonCanvas(null));
    assertFalse(isJsonCanvas([]));
    assertFalse(isJsonCanvas({ nodes: 'nope' }));
});

// ============================================================
// Storage integration
// ============================================================

test('Storage.parseImportData: accepts JSON Canvas and names it after the file', () => {
    const session = new Storage().parseImportData(obsidianCanvas, 'My Board.canvas');
    assertEqual(session.name, 'My Board');
    assertEqual(session.nodes.length, 4);
    assertTrue(typeof session.created_at === 'number');
});

test('Storage.parseImportData: keeps the session name from a superset export', () => {
    const doc = toJsonCanvas(buildSession());
    const session = new Storage().parseImportData(doc, 'whatever.canvas');
    assertEqual(session.name, 'Interop test');
});

test('Storage.parseImportData: v2 .canvaschat export restores the whole session', () => {
    const doc = JSON.parse(JSON.stringify(toJsonCanvas(buildSession())));
    doc.canvasChat.exported_at = '2026-11-10T00:00:00.000Z';
    const session = new Storage().parseImportData(doc, 'Interop test-1.canvaschat');
    const original = buildSession();
    assertEqual(session.id, 'sess-1');
    assertEqual(session.name, 'Interop test');
    assertEqual(session.nodes.length, original.nodes.length);
    assertEqual(session.edges.length, original.edges.length - 1); // dangling edge dropped
    assertDeepEqual(session.tags, original.tags);
});

test('Storage.parseImportData: legacy v1 .canvaschat files still import (migration)', () => {
    const native = { version: 1, ...buildSession() };
    const session = new Storage().parseImportData(native, 'x.canvaschat');
    assertEqual(session, native);
});

test('Storage.parseImportData: rejects invalid files', () => {
    assertThrows(() => new Storage().parseImportData({ id: 'x', created_at: 1, nodes: 'bad' }, 'x.canvaschat'));
});

// ============================================================
// Runner
// ============================================================
let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.error(`  ${err.message}`);
        failed++;
    }
}
console.log(`\n========================================`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('========================================\n');
process.exit(failed > 0 ? 1 : 0);
