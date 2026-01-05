/**
 * Unit tests for UI/DOM manipulation using jsdom simulation.
 * Run with: node tests/test_ui.js
 *
 * Tests DOM manipulation without requiring a browser or external API calls.
 */

import { JSDOM } from 'jsdom';

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

function assertEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(actual, message = '') {
    if (actual !== true) {
        throw new Error(message || `Expected true, got ${actual}`);
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
        cancelable: true
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
        pretendToBeVisual: true
    });
    const { document } = dom.window;

    const node = {
        id: 'node-1',
        type: 'human',
        content: 'Hello world',
        position: { x: 100, y: 200 },
        width: 420,
        height: 200
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
        pretendToBeVisual: true
    });
    const { document } = dom.window;

    const node = {
        id: 'node-2',
        type: 'ai',
        content: 'Response',
        position: { x: 0, y: 0 },
        width: 640,
        height: 480
    };

    const wrapper = simulateRenderNode(document, node);
    assertEqual(wrapper.getAttribute('width'), '640');
    assertEqual(wrapper.getAttribute('height'), '480');
});

test('Node rendering: includes delete button', () => {
    const dom = new JSDOM('<!DOCTYPE html><svg></svg>', {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    const { document } = dom.window;

    const node = {
        id: 'node-3',
        type: 'note',
        content: 'Note',
        position: { x: 0, y: 0 }
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
    const node2 = createMockNodeWithTags(document, 'node-2', []);  // No tags
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
    const node1 = createMockNodeWithTags(document, 'node-1', ['#ffc9c9', '#a5d8ff']);  // Both tags
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
    const dom = new JSDOM('<!DOCTYPE html><div class="node"><div class="node-tags"><div class="node-tag" data-color="#ffc9c9">Tag</div></div></div>');
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

/**
 * Simulate the highlightTextInHtml logic from canvas.js
 * This handles text selections that span multiple block elements where
 * selection.toString() produces newlines but joined text nodes do not.
 */
function highlightTextInHtml(document, html, text) {
    if (!text || !html) return html;

    // Create a temporary element to parse the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Use TreeWalker to collect all text nodes
    const walker = document.createTreeWalker(temp, 4 /* NodeFilter.SHOW_TEXT */);
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }

    if (textNodes.length === 0) return html;

    // Build the full text WITH position mapping
    // Add a space between text nodes to simulate block element boundaries
    // charMap[i] = { nodeIndex, charIndex } maps each char in fullText to its source
    // charIndex of -1 means it's a synthetic space between nodes
    let fullText = '';
    const charMap = [];

    for (let nodeIndex = 0; nodeIndex < textNodes.length; nodeIndex++) {
        // Add a space between text nodes (simulates block boundaries)
        if (nodeIndex > 0) {
            charMap.push({ nodeIndex: -1, charIndex: -1 }); // synthetic space
            fullText += ' ';
        }

        const content = textNodes[nodeIndex].textContent;
        for (let charIndex = 0; charIndex < content.length; charIndex++) {
            charMap.push({ nodeIndex, charIndex });
            fullText += content[charIndex];
        }
    }

    // Normalize whitespace: collapse all whitespace sequences to single space, trim
    const normalizeWs = (str) => str.replace(/\s+/g, ' ').trim();

    const normalizedFull = normalizeWs(fullText);
    const normalizedSearch = normalizeWs(text);

    // Find match in normalized strings (case-insensitive)
    const matchStartNorm = normalizedFull.toLowerCase().indexOf(normalizedSearch.toLowerCase());
    if (matchStartNorm === -1) return html;
    const matchEndNorm = matchStartNorm + normalizedSearch.length;

    // Build mapping from normalized positions to original positions
    // normalizedToOriginal[i] = original index in fullText for normalized char i
    const normalizedToOriginal = [];
    let inWhitespace = false;
    let leadingTrimmed = true;

    for (let i = 0; i < fullText.length; i++) {
        const ch = fullText[i];
        if (/\s/.test(ch)) {
            if (!inWhitespace && !leadingTrimmed) {
                // First whitespace char after non-whitespace maps to the normalized space
                normalizedToOriginal.push(i);
            }
            inWhitespace = true;
        } else {
            leadingTrimmed = false;
            inWhitespace = false;
            normalizedToOriginal.push(i);
        }
    }

    // Get original positions for match boundaries
    if (matchStartNorm >= normalizedToOriginal.length) return html;
    const origStart = normalizedToOriginal[matchStartNorm];
    const origEnd = matchEndNorm <= normalizedToOriginal.length
        ? normalizedToOriginal[matchEndNorm - 1] + 1
        : fullText.length;

    // Find which text nodes overlap with [origStart, origEnd)
    const nodesToProcess = [];

    for (let nodeIndex = 0; nodeIndex < textNodes.length; nodeIndex++) {
        const textNode = textNodes[nodeIndex];
        const nodeLen = textNode.textContent.length;

        // Find the range of this node in fullText
        let nodeStartInFull = -1;
        let nodeEndInFull = -1;
        for (let i = 0; i < charMap.length; i++) {
            if (charMap[i].nodeIndex === nodeIndex) {
                if (nodeStartInFull === -1) nodeStartInFull = i;
                nodeEndInFull = i + 1;
            }
        }

        if (nodeStartInFull === -1) continue;

        // Check overlap with [origStart, origEnd)
        if (nodeEndInFull > origStart && nodeStartInFull < origEnd) {
            const overlapStart = Math.max(0, origStart - nodeStartInFull);
            const overlapEnd = Math.min(nodeLen, origEnd - nodeStartInFull);

            nodesToProcess.push({
                node: textNode,
                overlapStart,
                overlapEnd
            });
        }
    }

    // Process nodes in reverse order to avoid invalidating positions
    for (let i = nodesToProcess.length - 1; i >= 0; i--) {
        const { node: textNode, overlapStart, overlapEnd } = nodesToProcess[i];
        const content = textNode.textContent;

        const before = content.slice(0, overlapStart);
        const match = content.slice(overlapStart, overlapEnd);
        const after = content.slice(overlapEnd);

        // Skip if match portion is only whitespace (avoid extraneous highlights)
        if (!match.trim()) continue;

        const fragment = document.createDocumentFragment();

        if (before) {
            fragment.appendChild(document.createTextNode(before));
        }

        const mark = document.createElement('mark');
        mark.className = 'source-highlight';
        mark.textContent = match;
        fragment.appendChild(mark);

        if (after) {
            fragment.appendChild(document.createTextNode(after));
        }

        textNode.parentNode.replaceChild(fragment, textNode);
    }

    return temp.innerHTML;
}

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
    const text = 'The Machinery of Change\n\nIn a dynamic path system, we decompose the total risk into a series of additive "layers."\n\nWhere:\n\nis the Baseline Hazard';

    const result = highlightTextInHtml(document, html, text);
    assertIncludes(result, '<mark class="source-highlight">The Machinery of Change</mark>');
    assertIncludes(result, '<mark class="source-highlight">In a dynamic path system');
    assertIncludes(result, '<mark class="source-highlight">Where:</mark>');
    assertIncludes(result, '<mark class="source-highlight">Baseline Hazard</mark>');
});

// ============================================================
// Blockquote stripping tests (for highlight node excerpt extraction)
// ============================================================

/**
 * Simulate the excerpt text extraction from highlight node content
 * Strips "> " prefix from each line (blockquote format)
 */
function extractExcerptText(content) {
    let excerptText = content || '';
    excerptText = excerptText
        .split('\n')
        .map(line => line.startsWith('> ') ? line.slice(2) : line)
        .join('\n');
    return excerptText;
}

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
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
