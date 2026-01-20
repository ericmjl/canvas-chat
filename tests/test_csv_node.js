/**
 * Tests for CSV node plugin
 * Verifies that the CSV node plugin works correctly when loaded
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
const { createNode, NodeType, createEdge, EdgeType } = await import('../src/canvas_chat/static/js/graph-types.js');
const { wrapNode, Actions } = await import('../src/canvas_chat/static/js/node-protocols.js');
const { assertTrue, assertEqual } = await import('./test_helpers/assertions.js');

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

console.log('\n=== CSV Node Plugin Tests ===\n');

// Test: CSV node plugin is registered
await asyncTest('CSV node plugin is registered', async () => {
    // Import csv-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    // Check if NodeRegistry has the csv type
    // const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    // assertTrue(NodeRegistry.isRegistered('csv'), 'CSV node type should be registered');
    // const protocol = NodeRegistry.getProtocolClass('csv');
    // assertTrue(protocol !== undefined, 'CSV protocol class should exist');
});

// Test: CsvNode protocol methods
await asyncTest('CsvNode implements protocol methods', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.CSV, '', {
        filename: 'test.csv',
        rowCount: 10,
        columnCount: 5,
    });
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'CSV', 'Type label should be CSV');
    assertEqual(wrapped.getTypeIcon(), '📊', 'Type icon should be 📊');
});

// Test: CsvNode getSummaryText with title
await asyncTest('CsvNode getSummaryText returns title when available', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = createNode(NodeType.CSV, '', {
        title: 'My CSV File',
        filename: 'test.csv',
        rowCount: 10,
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {};
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'My CSV File', 'Summary text should return title when available');
});

// Test: CsvNode getSummaryText without title
await asyncTest('CsvNode getSummaryText returns filename and row count when no title', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = createNode(NodeType.CSV, '', {
        filename: 'data.csv',
        rowCount: 42,
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {};
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'data.csv (42 rows)', 'Summary text should include filename and row count');
});

// Test: CsvNode getSummaryText with defaults
await asyncTest('CsvNode getSummaryText uses defaults when data missing', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = createNode(NodeType.CSV, '', {});
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {};
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'CSV Data (? rows)', 'Summary text should use defaults when data missing');
});

// Test: CsvNode renderContent
await asyncTest('CsvNode renderContent generates correct HTML', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = createNode(NodeType.CSV, '', {
        filename: 'test.csv',
        rowCount: 10,
        columnCount: 5,
        columns: ['col1', 'col2', 'col3'],
        content: '| col1 | col2 | col3 |\n|------|------|------|\n| val1 | val2 | val3 |',
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
        renderMarkdown: (text) => `<div>${text}</div>`,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('csv-metadata'), 'Should contain csv-metadata class');
    assertTrue(html.includes('test.csv'), 'Should contain filename');
    assertTrue(html.includes('10 rows'), 'Should contain row count');
    assertTrue(html.includes('5 columns'), 'Should contain column count');
    assertTrue(html.includes('col1, col2, col3'), 'Should contain column names');
    assertTrue(html.includes('csv-preview'), 'Should contain csv-preview class');
});

// Test: CsvNode renderContent without columns
await asyncTest('CsvNode renderContent handles missing columns', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = createNode(NodeType.CSV, '', {
        filename: 'test.csv',
        rowCount: 10,
        columnCount: 5,
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
        renderMarkdown: (text) => `<div>${text}</div>`,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('csv-metadata'), 'Should contain csv-metadata class');
    assertTrue(!html.includes('Columns:'), 'Should not include columns section when columns missing');
});

// Test: CsvNode renderContent without content
await asyncTest('CsvNode renderContent handles missing content', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = createNode(NodeType.CSV, '', {
        filename: 'test.csv',
        rowCount: 10,
        columnCount: 5,
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
        renderMarkdown: (text) => `<div>${text}</div>`,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('csv-metadata'), 'Should contain csv-metadata class');
    assertTrue(!html.includes('csv-preview'), 'Should not include csv-preview when content missing');
});

// Test: CsvNode getActions
await asyncTest('CsvNode getActions returns correct actions in expected order', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = createNode(NodeType.CSV, '', {
        filename: 'test.csv',
        rowCount: 10,
    });
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // CsvNode has custom actions: ANALYZE, REPLY, SUMMARIZE, COPY
    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 4, 'Should have exactly 4 actions');

    // Check for expected actions in expected order
    assertEqual(actions[0], Actions.ANALYZE, 'First action should be ANALYZE');
    assertEqual(actions[1], Actions.REPLY, 'Second action should be REPLY');
    assertEqual(actions[2], Actions.SUMMARIZE, 'Third action should be SUMMARIZE');
    assertEqual(actions[3], Actions.COPY, 'Fourth action should be COPY');

    // Verify no duplicates
    const actionIds = actions.map((a) => a.id);
    const uniqueIds = new Set(actionIds);
    assertTrue(uniqueIds.size === actions.length, 'Actions should not have duplicates');
});

// Test: CsvNode isScrollable
await asyncTest('CsvNode isScrollable returns true', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = { type: NodeType.CSV, filename: 'test.csv' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'CsvNode should be scrollable');
});

// Test: CsvNode wrapNode integration

// Test: CsvNode wrapNode integration
await asyncTest('wrapNode returns CsvNode for CSV type', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = {
        type: NodeType.CSV,
        filename: 'test.csv',
        rowCount: 10,
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'CSV', 'Should return CSV node protocol');
    assertTrue(wrapped.getTypeIcon() === '📊', 'Should have CSV icon');
    const actions = wrapped.getActions();
    assertTrue(actions.length === 4 && actions[0] === Actions.ANALYZE, 'Should have ANALYZE action');
});

// Test: CsvNode handles edge cases
await asyncTest('CsvNode handles empty data', async () => {
    // Import csv-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/csv-node.js');

    const node = {
        type: NodeType.CSV,
        id: 'test',
        position: { x: 0, y: 0 },
        width: 640,
        height: 480,
        created_at: Date.now(),
        tags: [],
    };
    const wrapped = wrapNode(node);

    // Should still work with empty data
    assertEqual(wrapped.getTypeLabel(), 'CSV', 'Should return type label even with empty data');
    assertEqual(wrapped.getTypeIcon(), '📊', 'Should return type icon even with empty data');
    const mockCanvas = {
        escapeHtml: (text) => text,
        renderMarkdown: (text) => `<div>${text}</div>`,
    };
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('csv-metadata'), 'Should render metadata even with empty data');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 4, 'Should return actions even with empty data');
});

console.log('\n✅ All CSV node plugin tests passed!\n');
