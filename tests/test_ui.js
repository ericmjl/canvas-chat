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
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
