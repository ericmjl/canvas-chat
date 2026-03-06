/**
 * Tests for Excel node plugin
 * Verifies ExcelNode protocol and Excel file upload handler (one node per sheet).
 */

// Setup global mocks before imports that use them
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
                if (request.onsuccess) request.onsuccess({ target: request });
            }, 0);
            return request;
        },
    };
}

// Stub XLSX (SheetJS) before loading excel-node so handler uses our stub
const addedNodes = [];
const sheetToJsonRows = [['A', 'B'], [1, 2], [3, 4]];
global.XLSX = {
    read: () => ({
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
            Sheet1: {},
            Sheet2: {},
        },
    }),
    utils: {
        sheet_to_json: (_sheet, opts) => (opts && opts.header === 1 ? sheetToJsonRows : []),
    },
};

const { createNode, NodeType } = await import('../src/canvas_chat/static/js/graph-types.js');
const { wrapNode } = await import('../src/canvas_chat/static/js/node-protocols.js');
const { FileUploadRegistry } = await import('../src/canvas_chat/static/js/file-upload-registry.js');
const { assertTrue, assertEqual } = await import('./test_helpers/assertions.js');

async function asyncTest(description, fn) {
    try {
        await fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        process.exit(1);
    }
}

function test(description, fn) {
    try {
        fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        process.exit(1);
    }
}

console.log('\n=== Excel Node Plugin Tests ===\n');

// Mock file with arrayBuffer for handler
class MockExcelFile {
    constructor(name = 'data.xlsx', type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size = 100) {
        this.name = name;
        this.type = type;
        this.size = size;
    }
    arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
    }
}

// -----------------------------------------------------------------------------
// ExcelNode protocol
// -----------------------------------------------------------------------------
await asyncTest('ExcelNode protocol methods', async () => {
    await import('../src/canvas_chat/static/js/plugins/excel-node.js');

    const node = createNode(NodeType.EXCEL, '', {
        filename: 'data.xlsx',
        sheetName: 'Sales',
        rowCount: 10,
        columnCount: 2,
    });
    const wrapped = wrapNode(node);

    assertEqual(wrapped.getTypeLabel(), 'Excel', 'Type label should be Excel');
    assertEqual(wrapped.getTypeIcon(), '📗', 'Type icon should be 📗');
});

await asyncTest('ExcelNode getSummaryText uses title when set', async () => {
    await import('../src/canvas_chat/static/js/plugins/excel-node.js');

    const node = createNode(NodeType.EXCEL, '', {
        title: 'data.xlsx — Sales',
        filename: 'data.xlsx',
        sheetName: 'Sales',
    });
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText({}), 'data.xlsx — Sales', 'Summary should return title');
});

await asyncTest('ExcelNode getSummaryText uses filename and sheet name when no title', async () => {
    await import('../src/canvas_chat/static/js/plugins/excel-node.js');

    const node = createNode(NodeType.EXCEL, '', {
        filename: 'report.xlsx',
        sheetName: 'Q1',
        rowCount: 5,
    });
    const wrapped = wrapNode(node);
    const summary = wrapped.getSummaryText({});
    assertTrue(summary.includes('report.xlsx'), 'Summary should include filename');
    assertTrue(summary.includes('Q1'), 'Summary should include sheet name');
    assertTrue(summary.includes('5 rows'), 'Summary should include row count');
});

// -----------------------------------------------------------------------------
// Excel file upload handler: two sheets → two nodes
// -----------------------------------------------------------------------------
await asyncTest('Excel handler creates one node per sheet with csvData and shape', async () => {
    addedNodes.length = 0;
    const mockGraph = {
        addNode: (n) => {
            addedNodes.push(n);
            return n.id;
        },
        autoPosition: (arr) => ({ x: (arr.length || 0) * 300, y: 0 }),
    };
    const noop = () => {};
    const mockContext = {
        app: {},
        graph: mockGraph,
        canvas: {
            renderNode: noop,
            clearSelection: noop,
            selectNode: noop,
            centerOnAnimated: noop,
        },
        saveSession: noop,
        updateEmptyState: noop,
        showCanvasHint: noop,
    };

    const config = FileUploadRegistry.getAllHandlers().find((h) => h.id === 'excel');
    assertTrue(config !== undefined, 'Excel handler should be registered');
    const HandlerClass = config.handler;
    const handler = new HandlerClass(mockContext);
    const file = new MockExcelFile('data.xlsx');

    const result = await handler.handleUpload(file, null, {});

    assertTrue(addedNodes.length === 2, `Expected 2 nodes, got ${addedNodes.length}`);
    assertTrue(result != null && result.id === addedNodes[addedNodes.length - 1].id, 'Handler should return last node');

    for (let i = 0; i < 2; i++) {
        const n = addedNodes[i];
        assertEqual(n.type, NodeType.EXCEL, `Node ${i} type should be EXCEL`);
        assertTrue(typeof n.csvData === 'string' && n.csvData.length > 0, `Node ${i} should have csvData`);
        assertEqual(n.filename, 'data.xlsx', `Node ${i} filename`);
        assertEqual(n.sheetName, i === 0 ? 'Sheet1' : 'Sheet2', `Node ${i} sheetName`);
        assertTrue(Array.isArray(n.columns), `Node ${i} should have columns`);
        assertEqual(n.title, `data.xlsx — ${i === 0 ? 'Sheet1' : 'Sheet2'}`, `Node ${i} title`);
    }
});

// -----------------------------------------------------------------------------
// File upload dispatch: .xlsx is routed to Excel handler
// -----------------------------------------------------------------------------
test('findHandler routes .xlsx to Excel handler', () => {
    const file = new MockExcelFile('book.xlsx');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found for .xlsx');
    assertEqual(handler.id, 'excel', 'Should be excel handler');
});

test('findHandler routes .xls to Excel handler', () => {
    const file = new MockExcelFile('legacy.xls', 'application/vnd.ms-excel');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found for .xls');
    assertEqual(handler.id, 'excel', 'Should be excel handler');
});
