/**
 * Unit tests for UI/DOM manipulation using jsdom simulation.
 * Run with: node tests/test_ui.js
 *
 * Tests DOM manipulation without requiring a browser or external API calls.
 */

import { JSDOM } from 'jsdom';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

// Import ES modules
const { highlightTextInHtml, extractExcerptText, normalizeKatexDuplication, alignStart, alignEnd, findMatchRegion } =
    await import('../src/canvas_chat/static/js/highlight-utils.js');

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        failed++;
    }
}

function assertFalse(actual, message = '') {
    if (actual !== false) {
        throw new Error(message || `Expected false, got ${actual}`);
    }
}

function assertIncludes(str, substr, message = '') {
    if (!str.includes(substr)) {
        throw new Error(message || `Expected "${str}" to include "${substr}"`);
    }
}

// ============================================================
// DOM manipulation tests
// ============================================================

test('DOM: create and append element', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    const { document } = dom.window;
    const container = document.getElementById('container');
    const div = document.createElement('div');
    div.className = 'test-node';
    div.textContent = 'Hello';
    container.appendChild(div);

    assertTrue(container.contains(div));
    assertEqual(div.className, 'test-node');
    assertEqual(div.textContent, 'Hello');
});

test('DOM: querySelector finds elements', () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <div id="container">
            <div class="node">Node 1</div>
            <div class="node">Node 2</div>
        </div>
    `);
    const { document } = dom.window;
    const nodes = document.querySelectorAll('.node');
    assertEqual(nodes.length, 2);
    assertEqual(nodes[0].textContent, 'Node 1');
});

test('DOM: setAttribute and getAttribute', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;
    const div = document.querySelector('div');
    div.setAttribute('data-node-id', 'node-123');
    div.setAttribute('x', '100');
    div.setAttribute('y', '200');

    assertEqual(div.getAttribute('data-node-id'), 'node-123');
    assertEqual(div.getAttribute('x'), '100');
    assertEqual(div.getAttribute('y'), '200');
});

test('DOM: classList add/remove/toggle', () => {
    const dom = new JSDOM('<!DOCTYPE html><div class="initial"></div>');
    const { document } = dom.window;
    const div = document.querySelector('div');

    div.classList.add('zoom-full');
    assertTrue(div.classList.contains('zoom-full'));

    div.classList.remove('initial');
    assertFalse(div.classList.contains('initial'));

    div.classList.toggle('zoom-summary');
    assertTrue(div.classList.contains('zoom-summary'));

    div.classList.toggle('zoom-summary');
    assertFalse(div.classList.contains('zoom-summary'));
});

test('DOM: innerHTML manipulation', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    const { document } = dom.window;
    const container = document.getElementById('container');

    container.innerHTML = '<div class="node"><span class="content">Test</span></div>';
    const node = container.querySelector('.node');
    const content = container.querySelector('.content');

    assertTrue(node !== null);
    assertEqual(content.textContent, 'Test');
});

test('DOM: insertAdjacentHTML', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"><div class="existing">Existing</div></div>');
    const { document } = dom.window;
    const container = document.getElementById('container');
    const existing = container.querySelector('.existing');

    existing.insertAdjacentHTML('beforebegin', '<div class="before">Before</div>');
    existing.insertAdjacentHTML('afterend', '<div class="after">After</div>');

    const before = container.querySelector('.before');
    const after = container.querySelector('.after');

    assertTrue(before !== null);
    assertTrue(after !== null);
    assertEqual(before.textContent, 'Before');
    assertEqual(after.textContent, 'After');
});

test('DOM: style manipulation', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;
    const div = document.querySelector('div');

    div.style.width = '640px';
    div.style.height = '480px';
    div.style.display = 'none';

    assertEqual(div.style.width, '640px');
    assertEqual(div.style.height, '480px');
    assertEqual(div.style.display, 'none');
});

test('DOM: event listener registration', () => {
    const dom = new JSDOM('<!DOCTYPE html><button id="btn">Click</button>');
    const { document } = dom.window;
    const button = document.getElementById('btn');

    let clicked = false;
    button.addEventListener('click', () => {
        clicked = true;
    });

    // Simulate click
    const event = new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
    });
    button.dispatchEvent(event);

    assertTrue(clicked);
});

test('DOM: removeChild', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"><div class="node">Node</div></div>');
    const { document } = dom.window;
    const container = document.getElementById('container');
    const node = container.querySelector('.node');

    assertTrue(container.contains(node));
    container.removeChild(node);
    assertFalse(container.contains(node));
});

test('DOM: dataset access', () => {
    const dom = new JSDOM('<!DOCTYPE html><div data-node-id="123" data-resize="e"></div>');
    const { document } = dom.window;
    const div = document.querySelector('div');

    assertEqual(div.dataset.nodeId, '123');
    assertEqual(div.dataset.resize, 'e');

    div.dataset.nodeId = '456';
    assertEqual(div.getAttribute('data-node-id'), '456');
});

// ============================================================
// Node rendering simulation tests
// ============================================================

/**
 * Simulate node rendering logic
 */
function simulateRenderNode(document, node) {
    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    wrapper.setAttribute('x', node.position.x.toString());
    wrapper.setAttribute('y', node.position.y.toString());
    wrapper.setAttribute('width', (node.width || 420).toString());
    wrapper.setAttribute('height', (node.height || 200).toString());
    wrapper.setAttribute('data-node-id', node.id);

    const div = document.createElement('div');
    div.className = `node ${node.type}`;
    div.innerHTML = `
        <div class="node-header">
            <span class="node-type">${node.type}</span>
            <button class="node-action delete-btn">🗑️</button>
        </div>
        <div class="node-content">${node.content || ''}</div>
    `;

    wrapper.appendChild(div);
    return wrapper;
}

test('Node rendering: creates correct structure', () => {
    const dom = new JSDOM('<!DOCTYPE html><svg id="nodes-layer"></svg>', {
        url: 'http://localhost',
        pretendToBeVisual: true,
    });
    const { document } = dom.window;

    const node = {
        id: 'node-1',
        type: 'human',
        content: 'Hello world',
        position: { x: 100, y: 200 },
        width: 420,
        height: 200,
    };

    const wrapper = simulateRenderNode(document, node);
    const nodesLayer = document.getElementById('nodes-layer');
    nodesLayer.appendChild(wrapper);

    assertEqual(wrapper.getAttribute('x'), '100');
    assertEqual(wrapper.getAttribute('y'), '200');
    assertEqual(wrapper.getAttribute('data-node-id'), 'node-1');

    const div = wrapper.querySelector('.node');
    assertTrue(div.classList.contains('human'));
    assertIncludes(div.innerHTML, 'Hello world');
});

test('Node rendering: sets correct attributes', () => {
    const dom = new JSDOM('<!DOCTYPE html><svg></svg>', {
        url: 'http://localhost',
        pretendToBeVisual: true,
    });
    const { document } = dom.window;

    const node = {
        id: 'node-2',
        type: 'ai',
        content: 'Response',
        position: { x: 0, y: 0 },
        width: 640,
        height: 480,
    };

    const wrapper = simulateRenderNode(document, node);
    assertEqual(wrapper.getAttribute('width'), '640');
    assertEqual(wrapper.getAttribute('height'), '480');
});

test('Node rendering: includes delete button', () => {
    const dom = new JSDOM('<!DOCTYPE html><svg></svg>', {
        url: 'http://localhost',
        pretendToBeVisual: true,
    });
    const { document } = dom.window;

    const node = {
        id: 'node-3',
        type: 'note',
        content: 'Note',
        position: { x: 0, y: 0 },
    };

    const wrapper = simulateRenderNode(document, node);
    const deleteBtn = wrapper.querySelector('.delete-btn');
    assertTrue(deleteBtn !== null);
    assertIncludes(deleteBtn.textContent, '🗑️');
});

// ============================================================
// Zoom class manipulation tests
// ============================================================

/**
 * Simulate zoom class update logic
 */
function updateZoomClass(container, scale) {
    container.classList.remove('zoom-full', 'zoom-summary', 'zoom-mini');

    if (scale > 0.6) {
        container.classList.add('zoom-full');
    } else if (scale > 0.35) {
        container.classList.add('zoom-summary');
    } else {
        container.classList.add('zoom-mini');
    }
}

test('Zoom class: updates correctly for full zoom', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="canvas"></div>');
    const { document } = dom.window;
    const container = document.getElementById('canvas');

    updateZoomClass(container, 0.8);
    assertTrue(container.classList.contains('zoom-full'));
    assertFalse(container.classList.contains('zoom-summary'));
    assertFalse(container.classList.contains('zoom-mini'));
});

test('Zoom class: updates correctly for summary zoom', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="canvas"></div>');
    const { document } = dom.window;
    const container = document.getElementById('canvas');

    updateZoomClass(container, 0.5);
    assertTrue(container.classList.contains('zoom-summary'));
    assertFalse(container.classList.contains('zoom-full'));
    assertFalse(container.classList.contains('zoom-mini'));
});

test('Zoom class: updates correctly for mini zoom', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="canvas"></div>');
    const { document } = dom.window;
    const container = document.getElementById('canvas');

    updateZoomClass(container, 0.2);
    assertTrue(container.classList.contains('zoom-mini'));
    assertFalse(container.classList.contains('zoom-full'));
    assertFalse(container.classList.contains('zoom-summary'));
});

test('Zoom class: removes old classes before adding new', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="canvas" class="zoom-full"></div>');
    const { document } = dom.window;
    const container = document.getElementById('canvas');

    updateZoomClass(container, 0.3);
    assertTrue(container.classList.contains('zoom-mini'));
    assertFalse(container.classList.contains('zoom-full'));
});

// ============================================================
// Tag highlighting tests
// ============================================================

/**
 * Create a mock node element structure for tag highlighting tests
 */
function createMockNodeWithTags(document, nodeId, tags = []) {
    const wrapper = document.createElement('foreignObject');
    wrapper.setAttribute('data-node-id', nodeId);

    const div = document.createElement('div');
    div.className = 'node human';

    // Add tag chips if tags provided
    if (tags.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'node-tags';
        for (const color of tags) {
            const tagChip = document.createElement('div');
            tagChip.className = 'node-tag';
            tagChip.dataset.color = color;
            tagChip.textContent = 'Tag';
            tagsContainer.appendChild(tagChip);
        }
        div.appendChild(tagsContainer);
    }

    wrapper.appendChild(div);
    return wrapper;
}

/**
 * Simulate the highlightNodesByTag logic
 */
function highlightNodesByTag(nodeElements, edgeElements, tagColor) {
    // Clear previous highlights
    for (const wrapper of nodeElements.values()) {
        const node = wrapper.querySelector('.node');
        if (node) {
            node.classList.remove('faded', 'tag-highlighted');
        }
    }
    for (const edge of edgeElements.values()) {
        edge.classList.remove('faded');
    }

    if (!tagColor) return; // Clear mode

    // Apply faded to non-tagged, highlight to tagged
    for (const wrapper of nodeElements.values()) {
        const node = wrapper.querySelector('.node');
        if (!node) continue;

        const hasTag = wrapper.querySelector(`.node-tag[data-color="${tagColor}"]`);
        if (hasTag) {
            node.classList.add('tag-highlighted');
        } else {
            node.classList.add('faded');
        }
    }
}

test('Tag highlighting: highlights nodes with matching tag', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    const { document } = dom.window;

    const nodeElements = new Map();
    const node1 = createMockNodeWithTags(document, 'node-1', ['#ffc9c9']);
    const node2 = createMockNodeWithTags(document, 'node-2', ['#a5d8ff']);
    const node3 = createMockNodeWithTags(document, 'node-3', ['#ffc9c9']);
    nodeElements.set('node-1', node1);
    nodeElements.set('node-2', node2);
    nodeElements.set('node-3', node3);

    highlightNodesByTag(nodeElements, new Map(), '#ffc9c9');

    // Nodes with matching tag should be highlighted
    assertTrue(node1.querySelector('.node').classList.contains('tag-highlighted'));
    assertTrue(node3.querySelector('.node').classList.contains('tag-highlighted'));
    assertFalse(node1.querySelector('.node').classList.contains('faded'));
    assertFalse(node3.querySelector('.node').classList.contains('faded'));

    // Node without matching tag should be faded
    assertTrue(node2.querySelector('.node').classList.contains('faded'));
    assertFalse(node2.querySelector('.node').classList.contains('tag-highlighted'));
});

test('Tag highlighting: fades nodes without matching tag', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    const { document } = dom.window;

    const nodeElements = new Map();
    const node1 = createMockNodeWithTags(document, 'node-1', ['#ffc9c9']);
    const node2 = createMockNodeWithTags(document, 'node-2', []); // No tags
    nodeElements.set('node-1', node1);
    nodeElements.set('node-2', node2);

    highlightNodesByTag(nodeElements, new Map(), '#ffc9c9');

    assertTrue(node2.querySelector('.node').classList.contains('faded'));
    assertFalse(node2.querySelector('.node').classList.contains('tag-highlighted'));
});

test('Tag highlighting: clears all highlighting when null passed', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    const { document } = dom.window;

    const nodeElements = new Map();
    const node1 = createMockNodeWithTags(document, 'node-1', ['#ffc9c9']);
    const node2 = createMockNodeWithTags(document, 'node-2', ['#a5d8ff']);
    nodeElements.set('node-1', node1);
    nodeElements.set('node-2', node2);

    // First highlight
    highlightNodesByTag(nodeElements, new Map(), '#ffc9c9');
    assertTrue(node1.querySelector('.node').classList.contains('tag-highlighted'));
    assertTrue(node2.querySelector('.node').classList.contains('faded'));

    // Then clear
    highlightNodesByTag(nodeElements, new Map(), null);
    assertFalse(node1.querySelector('.node').classList.contains('tag-highlighted'));
    assertFalse(node1.querySelector('.node').classList.contains('faded'));
    assertFalse(node2.querySelector('.node').classList.contains('tag-highlighted'));
    assertFalse(node2.querySelector('.node').classList.contains('faded'));
});

test('Tag highlighting: switching tags updates highlighting', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    const { document } = dom.window;

    const nodeElements = new Map();
    const node1 = createMockNodeWithTags(document, 'node-1', ['#ffc9c9']);
    const node2 = createMockNodeWithTags(document, 'node-2', ['#a5d8ff']);
    nodeElements.set('node-1', node1);
    nodeElements.set('node-2', node2);

    // Highlight red tags
    highlightNodesByTag(nodeElements, new Map(), '#ffc9c9');
    assertTrue(node1.querySelector('.node').classList.contains('tag-highlighted'));
    assertTrue(node2.querySelector('.node').classList.contains('faded'));

    // Switch to blue tags
    highlightNodesByTag(nodeElements, new Map(), '#a5d8ff');
    assertTrue(node2.querySelector('.node').classList.contains('tag-highlighted'));
    assertTrue(node1.querySelector('.node').classList.contains('faded'));
    assertFalse(node1.querySelector('.node').classList.contains('tag-highlighted'));
});

test('Tag highlighting: node with multiple tags matches any', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>');
    const { document } = dom.window;

    const nodeElements = new Map();
    const node1 = createMockNodeWithTags(document, 'node-1', ['#ffc9c9', '#a5d8ff']); // Both tags
    nodeElements.set('node-1', node1);

    // Should match red
    highlightNodesByTag(nodeElements, new Map(), '#ffc9c9');
    assertTrue(node1.querySelector('.node').classList.contains('tag-highlighted'));

    // Should also match blue
    highlightNodesByTag(nodeElements, new Map(), '#a5d8ff');
    assertTrue(node1.querySelector('.node').classList.contains('tag-highlighted'));
});

// ============================================================
// Tag chip click behavior tests
// ============================================================

/**
 * Simulate click target checking for node selection
 * Returns true if the click should select the node
 */
function shouldSelectNodeOnClick(target) {
    // Skip resize handles
    if (target.closest('.resize-handle')) return false;
    // Skip tag chips - clicking a tag should highlight by tag, not select node
    if (target.closest('.node-tag')) return false;
    return true;
}

test('Tag chip click: does not select node when clicking tag chip', () => {
    const dom = new JSDOM(
        '<!DOCTYPE html><div class="node"><div class="node-tags"><div class="node-tag" data-color="#ffc9c9">Tag</div></div></div>'
    );
    const { document } = dom.window;

    const tagChip = document.querySelector('.node-tag');
    assertFalse(shouldSelectNodeOnClick(tagChip));
});

test('Tag chip click: selects node when clicking node content', () => {
    const dom = new JSDOM('<!DOCTYPE html><div class="node"><div class="node-content">Content</div></div>');
    const { document } = dom.window;

    const content = document.querySelector('.node-content');
    assertTrue(shouldSelectNodeOnClick(content));
});

test('Tag chip click: does not select node when clicking resize handle', () => {
    const dom = new JSDOM('<!DOCTYPE html><div class="node"><div class="resize-handle"></div></div>');
    const { document } = dom.window;

    const handle = document.querySelector('.resize-handle');
    assertFalse(shouldSelectNodeOnClick(handle));
});

// ============================================================
// Source text highlighting tests (highlightTextInHtml)
// ============================================================

// Note: highlightTextInHtml is imported from highlight-utils.js at the top of this file

test('highlightTextInHtml: simple single paragraph match', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    const html = '<p>Hello world, this is a test.</p>';
    const text = 'world';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">world</mark>');
    assertIncludes(result, 'Hello ');
    assertIncludes(result, ', this is a test.');
});

test('highlightTextInHtml: match spanning multiple elements (inline)', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    const html = '<p>Hello <strong>beautiful</strong> world</p>';
    const text = 'beautiful world';

    const result = highlightTextInHtml(document, html, text);
    // Should highlight text in both the strong and the following text node
    assertIncludes(result, '<mark class="source-highlight">beautiful</mark>');
    assertIncludes(result, '<mark class="source-highlight"> world</mark>');
});

test('highlightTextInHtml: match with newlines in search text (cross-block selection)', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    // Simulates rendered markdown with heading and paragraph
    const html = '<h2>The Heading</h2><p>Some paragraph text here.</p>';
    // When user selects across blocks, selection.toString() produces newlines
    const text = 'The Heading\n\nSome paragraph';

    const result = highlightTextInHtml(document, html, text);
    // Should highlight both the heading and part of the paragraph
    assertIncludes(result, '<mark class="source-highlight">The Heading</mark>');
    assertIncludes(result, '<mark class="source-highlight">Some paragraph</mark>');
});

test('highlightTextInHtml: handles bullet list selection', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    const html = '<p>Where:</p><ul><li>First item</li><li>Second item</li></ul>';
    // Selection across paragraph and list items with newlines
    const text = 'Where:\n\nFirst item\nSecond';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">Where:</mark>');
    assertIncludes(result, '<mark class="source-highlight">First item</mark>');
    assertIncludes(result, '<mark class="source-highlight">Second</mark>');
});

test('highlightTextInHtml: case insensitive matching', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    const html = '<p>Hello World</p>';
    const text = 'hello world';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">Hello World</mark>');
});

test('highlightTextInHtml: no match returns original html', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    const html = '<p>Hello world</p>';
    const text = 'goodbye';

    const result = highlightTextInHtml(document, html, text);
    assertEqual(result, html);
});

test('highlightTextInHtml: empty text returns original html', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    const html = '<p>Hello world</p>';
    const text = '';

    const result = highlightTextInHtml(document, html, text);
    assertEqual(result, html);
});

test('highlightTextInHtml: handles extra whitespace in search text', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    const html = '<p>Hello world</p>';
    // Search text with extra spaces (e.g., from copy-paste)
    const text = 'Hello    world';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">Hello world</mark>');
});

test('highlightTextInHtml: complex markdown structure with heading, paragraph, and list', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    // Simulates rendered markdown like the user's screenshot
    const html = `
        <h2>The Machinery of Change</h2>
        <p>In a dynamic path system, we decompose the total risk into a series of additive "layers."</p>
        <p>Where:</p>
        <ul>
            <li>is the <strong>Baseline Hazard</strong>, representing the background</li>
        </ul>
    `;
    // Selection across heading, paragraph, and into the list
    const text =
        'The Machinery of Change\n\nIn a dynamic path system, we decompose the total risk into a series of additive "layers."\n\nWhere:\n\nis the Baseline Hazard';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">The Machinery of Change</mark>');
    assertIncludes(result, '<mark class="source-highlight">In a dynamic path system');
    assertIncludes(result, '<mark class="source-highlight">Where:</mark>');
    assertIncludes(result, '<mark class="source-highlight">Baseline Hazard</mark>');
});

// ============================================================
// KaTeX math rendering tests (tables with rendered math)
// ============================================================

test('highlightTextInHtml: KaTeX table with duplication artifacts', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    // Actual KaTeX-rendered table cell with MathML + katex-html
    const html = `<tr>
<td>Base Model</td>
<td>20.00* (<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mn>0.13</mn><mo>±</mo></mrow><annotation encoding="application/x-tex">0.13 ±</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="mord">0.13</span><span class="mord">±</span></span></span></span>0.08)</td>
<td>0.00* (N/A)</td>
</tr>`;

    // User's selection includes KaTeX duplication (number appears twice due to MathML + katex-html)
    const text = 'Base Model\t20.00* (\n0.13\n±\n0.13±0.08)\t0.00* (N/A)';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">');
    assertIncludes(result, 'Base Model');
});

test('highlightTextInHtml: skips MathML text nodes', () => {
    const dom = new JSDOM('<!DOCTYPE html><div></div>');
    const { document } = dom.window;

    // KaTeX renders both MathML (for accessibility) and visual HTML
    const html = `<span class="katex">
        <span class="katex-mathml"><math><mn>0.13</mn><mo>±</mo></math></span>
        <span class="katex-html" aria-hidden="true"><span class="mord">0.13</span><span class="mord">±</span></span>
    </span>`;

    // Selection of just the visible content
    const text = '0.13±';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">');
});

test('normalizeKatexDuplication: removes number±number± pattern', () => {
    // This tests the helper function that normalizes KaTeX selection artifacts
    const input = '0.13 ± 0.13±0.08';
    const expected = '0.13±0.08';
    const result = normalizeKatexDuplication(input);
    assertEqual(result.replace(/\s+/g, ' ').trim(), expected);
});

test('normalizeKatexDuplication: handles newlines in selection', () => {
    const input = '0.13\n±\n0.13±0.08';
    const result = normalizeKatexDuplication(input);
    assertIncludes(result, '0.13±');
    assertIncludes(result, '0.08');
});

// ============================================================
// Blockquote stripping tests (for highlight node excerpt extraction)
// ============================================================

// Note: extractExcerptText is imported from highlight-utils.js at the top of this file

test('extractExcerptText: single line blockquote', () => {
    const content = '> Hello world';
    const result = extractExcerptText(content);
    assertEqual(result, 'Hello world');
});

test('extractExcerptText: multiline blockquote', () => {
    const content = '> Line one\n> Line two\n> Line three';
    const result = extractExcerptText(content);
    assertEqual(result, 'Line one\nLine two\nLine three');
});

test('extractExcerptText: blockquote with empty lines', () => {
    const content = '> Heading\n> \n> Paragraph';
    const result = extractExcerptText(content);
    assertEqual(result, 'Heading\n\nParagraph');
});

test('extractExcerptText: mixed blockquote and non-blockquote lines', () => {
    const content = '> Quoted line\nNon-quoted line\n> Another quoted';
    const result = extractExcerptText(content);
    assertEqual(result, 'Quoted line\nNon-quoted line\nAnother quoted');
});

test('extractExcerptText: no blockquote prefix', () => {
    const content = 'Plain text without blockquote';
    const result = extractExcerptText(content);
    assertEqual(result, 'Plain text without blockquote');
});

test('extractExcerptText: empty content', () => {
    const content = '';
    const result = extractExcerptText(content);
    assertEqual(result, '');
});

// ============================================================
// Alignment algorithm tests (for robust text matching)
// ============================================================

// Note: alignStart, alignEnd, findMatchRegion are imported from highlight-utils.js

test('alignStart: finds exact match position', () => {
    const result = alignStart('world', 'Hello world, this is a test.');
    assertEqual(result, 6);
});

test('alignStart: handles case insensitive matching', () => {
    const result = alignStart('WORLD', 'Hello world');
    assertEqual(result, 6);
});

test('alignStart: handles whitespace differences', () => {
    const result = alignStart('Hello   world', 'Hello world');
    assertEqual(result, 0);
});

test('alignStart: returns -1 for no match', () => {
    const result = alignStart('xyz', 'Hello world');
    assertEqual(result, -1);
});

test('alignEnd: finds end position correctly', () => {
    const result = alignEnd('world', 'Hello world');
    assertEqual(result, 11);
});

test('alignEnd: handles trailing punctuation', () => {
    const result = alignEnd('test.', 'This is a test.');
    assertEqual(result, 15);
});

test('findMatchRegion: simple word match', () => {
    const result = findMatchRegion('world', 'Hello world, this is a test.');
    assertEqual(result.start, 6);
    assertEqual(result.end, 11);
});

test('findMatchRegion: cross-block with newlines', () => {
    const target = 'The Heading Some paragraph text here.';
    const query = 'The Heading\n\nSome paragraph';
    const result = findMatchRegion(query, target);
    assertEqual(target.substring(result.start, result.end), 'The Heading Some paragraph');
});

test('findMatchRegion: KaTeX duplication handling', () => {
    const target = '66.00 (0.18±0.58)';
    const query = '66.00 (\n0.18\n±\n0.18±0.58)';
    const result = findMatchRegion(query, target);
    assertEqual(target.substring(result.start, result.end), '66.00 (0.18±0.58)');
});

test('findMatchRegion: long KaTeX table row', () => {
    const target = 'RLM (no sub-calls) 66.00 (0.18±0.58) 17.34 (1.77±1.23)';
    const query = 'RLM (no sub-calls)\t66.00 (\n0.18\n±\n0.18±0.58)\t17.34 (\n1.77\n±\n1.77±1.23)';
    const result = findMatchRegion(query, target);
    assertEqual(target.substring(result.start, result.end), target);
});

test('findMatchRegion: returns null for no match', () => {
    const result = findMatchRegion('xyz', 'Hello world');
    assertEqual(result, null);
});

// ============================================================
// Drawer animation skip logic tests
// ============================================================

/**
 * Simulates the shouldAnimate decision logic from canvas.js renderOutputPanel().
 * Animation should only run on the first render of a drawer, not on re-renders.
 *
 * @param {boolean} outputExpanded - Whether the drawer is in expanded state
 * @param {boolean} skipAnimation - Explicit flag to skip animation
 * @param {boolean} hadExistingPanel - Whether a panel already existed before this render
 * @returns {boolean} - Whether animation should run
 */
function shouldAnimateDrawer(outputExpanded, skipAnimation, hadExistingPanel) {
    return outputExpanded && !skipAnimation && !hadExistingPanel;
}

test('Drawer animation: animates on first render when expanded', () => {
    const result = shouldAnimateDrawer(
        true, // outputExpanded
        false, // skipAnimation
        false // hadExistingPanel (first render)
    );
    assertTrue(result, 'Should animate on first render when expanded');
});

test('Drawer animation: skips animation when collapsed', () => {
    const result = shouldAnimateDrawer(
        false, // outputExpanded (collapsed)
        false, // skipAnimation
        false // hadExistingPanel
    );
    assertFalse(result, 'Should not animate when drawer is collapsed');
});

test('Drawer animation: skips animation when skipAnimation is true', () => {
    const result = shouldAnimateDrawer(
        true, // outputExpanded
        true, // skipAnimation (explicit skip)
        false // hadExistingPanel
    );
    assertFalse(result, 'Should not animate when skipAnimation is explicitly true');
});

test('Drawer animation: skips animation when re-rendering existing panel', () => {
    const result = shouldAnimateDrawer(
        true, // outputExpanded
        false, // skipAnimation
        true // hadExistingPanel (re-render)
    );
    assertFalse(result, 'Should not animate when replacing an existing panel');
});

test('Drawer animation: skips when both skipAnimation and hadExistingPanel are true', () => {
    const result = shouldAnimateDrawer(
        true, // outputExpanded
        true, // skipAnimation
        true // hadExistingPanel
    );
    assertFalse(result, 'Should not animate when both skip flags are true');
});

test('Drawer animation: skips when collapsed even if first render', () => {
    const result = shouldAnimateDrawer(
        false, // outputExpanded (collapsed)
        false, // skipAnimation
        false // hadExistingPanel (first render)
    );
    assertFalse(result, 'Should not animate collapsed drawer even on first render');
});

/**
 * Simulates the drawer render flow during package installation.
 * Tests the sequence of calls and animation decisions.
 */
test('Drawer animation: installation flow - first message animates, subsequent do not', () => {
    // Simulate the outputPanels Map
    const outputPanels = new Map();

    // Track animation calls
    const animationCalls = [];

    // Simulate renderOutputPanel logic
    function simulateRenderOutputPanel(nodeId, outputExpanded, skipAnimation) {
        const existingPanel = outputPanels.get(nodeId);
        const hadExistingPanel = !!existingPanel;

        // Remove existing if present (simulated)
        if (existingPanel) {
            outputPanels.delete(nodeId);
        }

        // Create new panel
        outputPanels.set(nodeId, { id: nodeId });

        // Decide whether to animate
        const shouldAnimate = outputExpanded && !skipAnimation && !hadExistingPanel;
        animationCalls.push({ nodeId, shouldAnimate, hadExistingPanel });

        return shouldAnimate;
    }

    // First progress message - creates drawer, should animate
    const firstRender = simulateRenderOutputPanel('node-1', true, false);
    assertTrue(firstRender, 'First render should animate');

    // Second progress message - re-renders, should NOT animate
    const secondRender = simulateRenderOutputPanel('node-1', true, false);
    assertFalse(secondRender, 'Second render should not animate (existing panel)');

    // Third progress message - re-renders, should NOT animate
    const thirdRender = simulateRenderOutputPanel('node-1', true, false);
    assertFalse(thirdRender, 'Third render should not animate (existing panel)');

    // Verify animation was only called once
    const animatedCount = animationCalls.filter((c) => c.shouldAnimate).length;
    assertEqual(animatedCount, 1);
});

test('Drawer animation: different nodes animate independently', () => {
    const outputPanels = new Map();

    function simulateRenderOutputPanel(nodeId, outputExpanded) {
        const hadExistingPanel = outputPanels.has(nodeId);
        outputPanels.set(nodeId, { id: nodeId });
        return outputExpanded && !hadExistingPanel;
    }

    // First node, first render - animates
    assertTrue(simulateRenderOutputPanel('node-1', true));

    // Second node, first render - animates (different node)
    assertTrue(simulateRenderOutputPanel('node-2', true));

    // First node, second render - does not animate
    assertFalse(simulateRenderOutputPanel('node-1', true));

    // Second node, second render - does not animate
    assertFalse(simulateRenderOutputPanel('node-2', true));
});

// ============================================================
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
