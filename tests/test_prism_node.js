/**
 * Tests for Prism node plugin
 * Verifies PrismNode protocol and Prism .pzfx file upload handler (one node per table).
 */

import { JSDOM } from 'jsdom';

// Provide DOMParser for Prism handler (uses parseFromString in browser)
global.DOMParser = class DOMParser {
    parseFromString(str, contentType) {
        return new JSDOM(str, { contentType: contentType || 'text/xml' }).window.document;
    }
};

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

// Minimal .pzfx XML: one table with title, two columns (X and Y), two rows
const MINIMAL_PZFX = `<?xml version="1.0"?>
<GraphPadPrismFile xmlns="http://graphpad.com/prism/Prism.htm">
  <Table>
    <Title>Experiment 1</Title>
    <XColumn>
      <Subcolumn><d>Sample1</d></Subcolumn>
      <Subcolumn><d>Sample2</d></Subcolumn>
    </XColumn>
    <YColumn>
      <Subcolumn><d>10</d></Subcolumn>
      <Subcolumn><d>20</d></Subcolumn>
    </YColumn>
  </Table>
</GraphPadPrismFile>`;

// Two tables
const TWO_TABLES_PZFX = `<?xml version="1.0"?>
<GraphPadPrismFile xmlns="http://graphpad.com/prism/Prism.htm">
  <Table>
    <Title>Table A</Title>
    <XColumn><Subcolumn><d>a</d></Subcolumn></XColumn>
    <YColumn><Subcolumn><d>1</d></Subcolumn></YColumn>
  </Table>
  <Table>
    <Title>Table B</Title>
    <XColumn><Subcolumn><d>x</d></Subcolumn><Subcolumn><d>y</d></Subcolumn></XColumn>
    <YColumn><Subcolumn><d>5</d></Subcolumn><Subcolumn><d>6</d></Subcolumn></YColumn>
  </Table>
</GraphPadPrismFile>`;

class MockPrismFile {
    constructor(content = MINIMAL_PZFX, name = 'experiment.pzfx') {
        this.name = name;
        this.type = 'application/octet-stream';
        this.size = content.length;
        this._content = content;
    }
    text() {
        return Promise.resolve(this._content);
    }
}

const addedNodes = [];

console.log('\n=== Prism Node Plugin Tests ===\n');

// -----------------------------------------------------------------------------
// PrismNode protocol
// -----------------------------------------------------------------------------
await asyncTest('PrismNode protocol methods', async () => {
    await import('../src/canvas_chat/static/js/plugins/prism-node.js');

    const node = createNode(NodeType.PRISM, '', {
        filename: 'exp.pzfx',
        tableTitle: 'Table 1',
        tableIndex: 0,
        rowCount: 5,
    });
    const wrapped = wrapNode(node);

    assertEqual(wrapped.getTypeLabel(), 'Prism', 'Type label should be Prism');
    assertEqual(wrapped.getTypeIcon(), '📈', 'Type icon should be 📈');
});

await asyncTest('PrismNode getSummaryText uses title when set', async () => {
    await import('../src/canvas_chat/static/js/plugins/prism-node.js');

    const node = createNode(NodeType.PRISM, '', {
        title: 'exp.pzfx — Table 1',
        filename: 'exp.pzfx',
        tableTitle: 'Table 1',
    });
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText({}), 'exp.pzfx — Table 1', 'Summary should return title');
});

// -----------------------------------------------------------------------------
// Prism file upload handler: one table → one node
// -----------------------------------------------------------------------------
await asyncTest('Prism handler creates one node for single table with csvData', async () => {
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

    await import('../src/canvas_chat/static/js/plugins/prism-node.js');
    const config = FileUploadRegistry.getAllHandlers().find((h) => h.id === 'prism');
    assertTrue(config !== undefined, 'Prism handler should be registered');

    const handler = new config.handler(mockContext);
    const file = new MockPrismFile(MINIMAL_PZFX, 'exp.pzfx');

    const result = await handler.handleUpload(file, null, {});

    assertTrue(addedNodes.length === 1, `Expected 1 node, got ${addedNodes.length}`);
    assertTrue(result != null && result.id === addedNodes[0].id, 'Handler should return created node');

    const n = addedNodes[0];
    assertEqual(n.type, NodeType.PRISM, 'Node type should be PRISM');
    assertTrue(typeof n.csvData === 'string' && n.csvData.length > 0, 'Node should have csvData');
    assertEqual(n.filename, 'exp.pzfx', 'filename');
    assertTrue(n.tableTitle != null || n.tableIndex != null, 'Should have tableTitle or tableIndex');
    assertEqual(n.title, 'exp.pzfx — Experiment 1', 'title should be filename — table title');
});

// -----------------------------------------------------------------------------
// Prism handler: two tables → two nodes
// -----------------------------------------------------------------------------
await asyncTest('Prism handler creates one node per table for multi-table file', async () => {
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

    const config = FileUploadRegistry.getAllHandlers().find((h) => h.id === 'prism');
    const handler = new config.handler(mockContext);
    const file = new MockPrismFile(TWO_TABLES_PZFX, 'multi.pzfx');

    await handler.handleUpload(file, null, {});

    assertTrue(addedNodes.length === 2, `Expected 2 nodes, got ${addedNodes.length}`);
    assertEqual(addedNodes[0].type, NodeType.PRISM, 'First node type');
    assertEqual(addedNodes[1].type, NodeType.PRISM, 'Second node type');
    assertTrue(addedNodes[0].csvData.length > 0 && addedNodes[1].csvData.length > 0, 'Both should have csvData');
    assertEqual(addedNodes[0].title, 'multi.pzfx — Table A', 'First node title');
    assertEqual(addedNodes[1].title, 'multi.pzfx — Table B', 'Second node title');
});

// -----------------------------------------------------------------------------
// File upload dispatch: .pzfx routed to Prism handler
// -----------------------------------------------------------------------------
test('findHandler routes .pzfx to Prism handler', () => {
    const file = new MockPrismFile(MINIMAL_PZFX, 'file.pzfx');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found for .pzfx');
    assertEqual(handler.id, 'prism', 'Should be prism handler');
});
