/**
 * Tests for Matrix node plugin
 * Verifies that the matrix node plugin works correctly when loaded
 */

// Setup global mocks FIRST, before any imports that might use them
if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
    };
}

if (!global.indexedDB) {
    global.indexedDB = {
        open: () => {
            const request = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: {
                    transaction: () => ({
                        objectStore: () => ({
                            get: () => ({ onsuccess: null, onerror: null }),
                            put: () => ({ onsuccess: null, onerror: null }),
                            delete: () => ({ onsuccess: null, onerror: null }),
                        }),
                    }),
                },
            };
            setTimeout(() => {
                if (request.onsuccess) {
                    request.onsuccess({ target: request });
                }
            }, 0);
            return request;
        },
    };
}

// Now import modules
import { assertTrue, assertEqual } from './test_helpers/assertions.js';
import { createNode, NodeType } from '../src/canvas_chat/static/js/graph-types.js';
import { wrapNode, HeaderButtons } from '../src/canvas_chat/static/js/node-protocols.js';

async function asyncTest(description, fn) {
    try {
        await fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        if (error.stack) {
            console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        }
        process.exit(1);
    }
}

console.log('\n=== Matrix Node Plugin Tests ===\n');

// Test: Matrix node plugin is registered
await asyncTest('Matrix node plugin is registered', async () => {
    // Import matrix-node.js to trigger registration
    await import('../src/canvas_chat/static/js/matrix-node.js');

    // Check if NodeRegistry has the matrix type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('matrix'), 'Matrix node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('matrix');
    assertTrue(protocol !== undefined, 'Matrix protocol class should exist');
});

// Test: MatrixNode protocol methods
await asyncTest('MatrixNode implements protocol methods', async () => {
    // Import matrix-node.js to register the plugin
    await import('../src/canvas_chat/static/js/matrix-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.MATRIX, '', {
        context: 'Test Matrix',
        rowItems: ['Row1'],
        colItems: ['Col1'],
        cells: {},
    });
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Matrix', 'Type label should be Matrix');
    assertEqual(wrapped.getTypeIcon(), '📊', 'Type icon should be 📊');
});

// Test: MatrixNode getActions returns empty array
await asyncTest('MatrixNode getActions returns empty array', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        context: 'Test',
        rowItems: [],
        colItems: [],
        cells: {},
    });
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 0, 'Should have no actions (uses internal actions)');
});

// Test: MatrixNode getContentClasses
await asyncTest('MatrixNode getContentClasses returns matrix-table-container', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        context: 'Test',
        rowItems: [],
        colItems: [],
        cells: {},
    });
    const wrapped = wrapNode(node);
    const classes = wrapped.getContentClasses();

    assertEqual(classes, 'matrix-table-container', 'Should return matrix-table-container class');
});

// Test: MatrixNode getSummaryText with title
await asyncTest('MatrixNode getSummaryText returns title when present', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        title: 'My Matrix',
        context: 'Test',
        rowItems: ['Row1'],
        colItems: ['Col1'],
        cells: {},
    });
    const wrapped = wrapNode(node);

    const mockCanvas = { truncate: (text) => text };
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'My Matrix', 'Should return title when present');
});

// Test: MatrixNode getSummaryText with context and dimensions
await asyncTest('MatrixNode getSummaryText generates from context and dimensions', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        context: 'Model Comparison',
        rowItems: ['GPT-4', 'Claude'],
        colItems: ['Speed', 'Accuracy'],
        cells: {},
    });
    const wrapped = wrapNode(node);

    const mockCanvas = { truncate: (text) => text };
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'Model Comparison (2×2)', 'Should generate summary from context and dimensions');
});

// Test: MatrixNode getHeaderButtons
await asyncTest('MatrixNode getHeaderButtons returns correct buttons', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        context: 'Test',
        rowItems: [],
        colItems: [],
        cells: {},
    });
    const wrapped = wrapNode(node);
    const buttons = wrapped.getHeaderButtons();

    assertTrue(Array.isArray(buttons), 'Header buttons should be an array');
    assertTrue(buttons.includes(HeaderButtons.STOP), 'Should include STOP button for cell fills');
    assertTrue(buttons.includes(HeaderButtons.DELETE), 'Should include DELETE button');
});

// Test: MatrixNode renderContent generates table HTML
await asyncTest('MatrixNode renderContent generates table HTML', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        context: 'Test Matrix',
        rowItems: ['Row1'],
        colItems: ['Col1'],
        cells: {},
    });
    const wrapped = wrapNode(node);

    const mockCanvas = {
        escapeHtml: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('matrix-table'), 'Should contain matrix-table');
    assertTrue(html.includes('matrix-context'), 'Should contain matrix-context');
    assertTrue(html.includes('matrix-actions'), 'Should contain matrix-actions');
    assertTrue(html.includes('Test Matrix'), 'Should contain context text');
    assertTrue(html.includes('Row1'), 'Should contain row item');
    assertTrue(html.includes('Col1'), 'Should contain column item');
});

// Test: MatrixNode renderContent with filled cells
await asyncTest('MatrixNode renderContent shows filled cells', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        context: 'Test',
        rowItems: ['Row1'],
        colItems: ['Col1'],
        cells: {
            '0-0': { filled: true, content: 'Filled content' },
        },
    });
    const wrapped = wrapNode(node);

    const mockCanvas = {
        escapeHtml: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('matrix-cell filled'), 'Should contain filled cell class');
    assertTrue(html.includes('Filled content'), 'Should contain cell content');
});

// Test: MatrixNode getEventBindings
await asyncTest('MatrixNode getEventBindings returns event bindings', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = createNode(NodeType.MATRIX, '', {
        context: 'Test',
        rowItems: [],
        colItems: [],
        cells: {},
    });
    const wrapped = wrapNode(node);
    const bindings = wrapped.getEventBindings();

    assertTrue(Array.isArray(bindings), 'Event bindings should be an array');
    assertTrue(bindings.length > 0, 'Should have event bindings');

    // Check for key bindings
    const cellBinding = bindings.find((b) => b.selector === '.matrix-cell');
    assertTrue(cellBinding !== undefined, 'Should have matrix-cell binding');
    assertTrue(cellBinding.multiple === true, 'Should handle multiple cells');
    assertTrue(typeof cellBinding.handler === 'function', 'Handler should be a function');
});

// Test: MatrixNode isScrollable
await asyncTest('MatrixNode isScrollable returns true', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = { type: NodeType.MATRIX, content: '' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'MatrixNode should be scrollable');
});

// Test: MatrixNode wrapNode integration
await asyncTest('wrapNode returns MatrixNode for MATRIX type', async () => {
    await import('../src/canvas_chat/static/js/matrix-node.js');

    const node = {
        type: NodeType.MATRIX,
        content: '',
        context: 'Test',
        rowItems: [],
        colItems: [],
        cells: {},
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Matrix', 'Should return Matrix node protocol');
    assertTrue(wrapped.getTypeIcon() === '📊', 'Should have matrix icon');
    assertTrue(wrapped.getContentClasses() === 'matrix-table-container', 'Should have matrix content class');
});

console.log('\n✅ All Matrix node plugin tests passed!\n');
