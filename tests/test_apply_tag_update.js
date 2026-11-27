/**
 * Tests for applyTagUpdate and the viewport tag catalog.
 */

import { test, tests, TestGraph, createNode, NodeType, TAG_COLORS } from './test_setup.js';
import {
    applyTagUpdate,
    formatViewportForPrompt,
    gatherViewportContext,
} from '../src/canvas_chat/static/js/agent-utils.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function stubCanvas(viewBox = null) {
    return {
        viewBox,
        rendered: [],
        renderNode(node) {
            this.rendered.push(node.id);
        },
    };
}

function apply(graph, canvas, instruction) {
    const toasts = [];
    let saved = 0;
    const message = applyTagUpdate(
        instruction,
        graph,
        canvas,
        () => {
            saved += 1;
        },
        (msg) => toasts.push(msg)
    );
    return { message, toasts, saved };
}

test('applyTagUpdate adds and removes a tag by name', () => {
    const graph = new TestGraph();
    const canvas = stubCanvas();
    const color = TAG_COLORS[0];
    graph.createTag(color, 'Important');
    const node = createNode(NodeType.NOTE, 'Plot of the data', { title: 'Plot' });
    graph.addNode(node);

    const added = apply(graph, canvas, {
        action: 'add',
        tag_name: 'important',
        node_ids: [node.id],
    });
    assert(graph.nodeHasTag(node.id, color), 'Tag should be on the node');
    assert(added.message.includes('Added'), added.message);
    assert(added.saved === 1, 'Session should be saved');
    assert(canvas.rendered.includes(node.id), 'Node should be repainted');

    const removed = apply(graph, canvas, {
        action: 'remove',
        tag_name: 'Important',
        node_ids: [node.id],
    });
    assert(!graph.nodeHasTag(node.id, color), 'Tag should be removed');
    assert(removed.message.includes('Removed'), removed.message);
});

test('applyTagUpdate creates a tag in the first free color and can rename by color name', () => {
    const graph = new TestGraph();
    const canvas = stubCanvas();
    const node = createNode(NodeType.NOTE, 'Follow up');
    graph.addNode(node);

    const created = apply(graph, canvas, {
        action: 'create',
        tag_name: 'Follow-up',
        node_ids: [node.id],
    });
    assert(graph.getTag(TAG_COLORS[0])?.name === 'Follow-up', 'First free color should be named');
    assert(graph.nodeHasTag(node.id, TAG_COLORS[0]), 'Create should apply the tag');
    assert(created.toasts.length === 0, 'Success should not toast');

    const renamed = apply(graph, canvas, {
        action: 'rename',
        tag_name: 'Review',
        tag_color_name: 'green',
    });
    assert(graph.getTag(TAG_COLORS[3])?.name === 'Review', 'Green slot should be renamed');
    assert(renamed.message.includes('Review'), renamed.message);
});

test('applyTagUpdate reports missing tags and unknown colors', () => {
    const graph = new TestGraph();
    const canvas = stubCanvas();
    graph.createTag(TAG_COLORS[1], 'Source');

    const missing = apply(graph, canvas, {
        action: 'add',
        tag_name: 'Nope',
        node_ids: ['missing-node'],
    });
    assert(missing.toasts.length === 1, 'Missing tag should toast');
    assert(missing.message.includes('Source'), missing.message);
    assert(missing.saved === 0, 'Failed update should not save');

    const unknown = apply(graph, canvas, {
        action: 'rename',
        tag_name: 'Review',
        tag_color_name: 'chartreuse',
    });
    assert(unknown.message.includes('Unknown tag color'), unknown.message);
    assert(graph.getTag(TAG_COLORS[3]) === null, 'Unknown color should not create a tag');
});

test('gatherViewportContext keeps the tag catalog when the viewport is missing', () => {
    const graph = new TestGraph();
    graph.createTag(TAG_COLORS[3], 'Review');
    const ctx = gatherViewportContext(graph, stubCanvas(null));
    assert(Array.isArray(ctx.nodes) && ctx.nodes.length === 0, 'No viewBox means no nodes');
    assert(ctx.available_tags.some((tag) => tag.name === 'Review'), 'Catalog should include Review');
    assert(ctx.available_colors.length === TAG_COLORS.length - 1, 'Used color should be excluded');
    assert(!ctx.available_colors.includes(TAG_COLORS[3]), 'Green should be in use');
});

test('formatViewportForPrompt includes node ids and tag names', () => {
    const graph = new TestGraph();
    const color = TAG_COLORS[3];
    graph.createTag(color, 'Review');
    const node = createNode(NodeType.NOTE, 'A plotted result', {
        title: 'Plot',
        position: { x: 10, y: 10 },
    });
    graph.addNode(node);
    graph.addTagToNode(node.id, color);

    const canvas = stubCanvas({ x: 0, y: 0, width: 2000, height: 2000 });
    const ctx = gatherViewportContext(graph, canvas);
    const prompt = formatViewportForPrompt(ctx);
    assert(prompt.includes(node.id), 'Prompt should include the node id');
    assert(prompt.includes('Review'), 'Prompt should include the tag name');
    assert(prompt.includes('Plot'), 'Prompt should include the title');
});

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
console.log(`\nTests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
