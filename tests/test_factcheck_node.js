/**
 * Tests for Factcheck node plugin
 * Verifies that the factcheck node plugin works correctly when loaded
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
import { wrapNode, Actions } from '../src/canvas_chat/static/js/node-protocols.js';

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

console.log('\n=== Factcheck Node Plugin Tests ===\n');

// Test: Factcheck node plugin is registered
await asyncTest('Factcheck node plugin is registered', async () => {
    // Import factcheck-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    // Check if NodeRegistry has the factcheck type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('factcheck'), 'Factcheck node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('factcheck');
    assertTrue(protocol !== undefined, 'Factcheck protocol class should exist');
});

// Test: FactcheckNode protocol methods
await asyncTest('FactcheckNode implements protocol methods', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    // Test protocol methods
    const testNode = createNode(NodeType.FACTCHECK, 'Content', {
        claims: [],
    });
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Factcheck', 'Type label should be Factcheck');
    assertEqual(wrapped.getTypeIcon(), '🔍', 'Type icon should be 🔍');
});

// Test: FactcheckNode getSummaryText with no claims
await asyncTest('FactcheckNode getSummaryText returns "Fact Check" when no claims', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {
        claims: [],
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {};
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'Fact Check', 'Summary text should be "Fact Check" when no claims');
});

// Test: FactcheckNode getSummaryText with claims
await asyncTest('FactcheckNode getSummaryText returns claim count', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {
        claims: [
            { text: 'Claim 1', status: 'verified' },
            { text: 'Claim 2', status: 'false' },
        ],
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {};
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'Fact Check · 2 claims', 'Summary text should include claim count');
});

// Test: FactcheckNode getSummaryText with single claim
await asyncTest('FactcheckNode getSummaryText uses singular for one claim', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {
        claims: [{ text: 'Claim 1', status: 'verified' }],
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {};
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'Fact Check · 1 claim', 'Summary text should use singular "claim"');
});

// Test: FactcheckNode renderContent with no claims
await asyncTest('FactcheckNode renderContent renders markdown when no claims', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'No claims to verify.', {
        claims: [],
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        renderMarkdown: (text) => `<div>${text}</div>`,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('No claims to verify.'), 'Should render markdown content when no claims');
});

// Test: FactcheckNode renderContent with claims
await asyncTest('FactcheckNode renderContent generates accordion HTML for claims', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {
        claims: [
            {
                text: 'Test claim',
                status: 'verified',
                explanation: 'This is verified',
                sources: [{ url: 'https://example.com', title: 'Example' }],
            },
        ],
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('factcheck-claims'), 'Should contain factcheck-claims container');
    assertTrue(html.includes('factcheck-claim'), 'Should contain factcheck-claim elements');
    assertTrue(html.includes('factcheck-claim-header'), 'Should contain claim headers');
    assertTrue(html.includes('Test claim'), 'Should contain claim text');
    assertTrue(html.includes('✅'), 'Should contain verified badge');
    assertTrue(html.includes('This is verified'), 'Should contain explanation');
    assertTrue(html.includes('https://example.com'), 'Should contain source URL');
});

// Test: FactcheckNode getVerdictBadge
await asyncTest('FactcheckNode getVerdictBadge returns correct badges', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {});
    const wrapped = wrapNode(node);

    assertEqual(wrapped.getVerdictBadge('verified'), '✅', 'Should return verified badge');
    assertEqual(wrapped.getVerdictBadge('false'), '❌', 'Should return false badge');
    assertEqual(wrapped.getVerdictBadge('checking'), '🔄', 'Should return checking badge');
    assertEqual(wrapped.getVerdictBadge('partially_true'), '⚠️', 'Should return partially_true badge');
    assertEqual(wrapped.getVerdictBadge('misleading'), '🔶', 'Should return misleading badge');
    assertEqual(wrapped.getVerdictBadge('unverifiable'), '❓', 'Should return unverifiable badge');
    assertEqual(wrapped.getVerdictBadge('error'), '⚠️', 'Should return error badge');
    assertEqual(wrapped.getVerdictBadge('unknown'), '❓', 'Should return default badge for unknown status');
});

// Test: FactcheckNode getActions
await asyncTest('FactcheckNode getActions returns correct actions', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {});
    const wrapped = wrapNode(node);
    const actions = wrapped.getActions();

    // FactcheckNode has only COPY action
    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 1, 'Should have exactly 1 action');
    assertEqual(actions[0], Actions.COPY, 'Should have COPY action');
});

// Test: FactcheckNode getContentClasses
await asyncTest('FactcheckNode getContentClasses returns factcheck-content', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {});
    const wrapped = wrapNode(node);
    const classes = wrapped.getContentClasses();

    assertEqual(classes, 'factcheck-content', 'Should return factcheck-content class');
});

// Test: FactcheckNode getEventBindings
await asyncTest('FactcheckNode getEventBindings returns accordion toggle handler', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = createNode(NodeType.FACTCHECK, 'Content', {});
    const wrapped = wrapNode(node);
    const bindings = wrapped.getEventBindings();

    assertTrue(Array.isArray(bindings), 'Event bindings should be an array');
    assertTrue(bindings.length === 1, 'Should have exactly 1 event binding');
    assertEqual(bindings[0].selector, '.factcheck-claim-header', 'Should bind to claim header');
    assertTrue(bindings[0].multiple === true, 'Should handle multiple elements');
    assertTrue(typeof bindings[0].handler === 'function', 'Handler should be a function');
});

// Test: FactcheckNode isScrollable
await asyncTest('FactcheckNode isScrollable returns true', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = { type: NodeType.FACTCHECK, content: 'Content' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'FactcheckNode should be scrollable');
});

// Test: FactcheckNode wrapNode integration
await asyncTest('wrapNode returns FactcheckNode for FACTCHECK type', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = {
        type: NodeType.FACTCHECK,
        content: 'Content',
        claims: [],
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Factcheck', 'Should return Factcheck node protocol');
    assertTrue(wrapped.getTypeIcon() === '🔍', 'Should have factcheck icon');
    assertTrue(wrapped.getContentClasses() === 'factcheck-content', 'Should have factcheck-content class');
});

// Test: FactcheckNode handles edge cases
await asyncTest('FactcheckNode handles missing claims array', async () => {
    // Import factcheck-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/factcheck.js');

    const node = {
        type: NodeType.FACTCHECK,
        id: 'test',
        position: { x: 0, y: 0 },
        width: 640,
        height: 480,
        created_at: Date.now(),
        tags: [],
    };
    const wrapped = wrapNode(node);

    // Should still work with missing claims
    assertEqual(wrapped.getTypeLabel(), 'Factcheck', 'Should return type label even with missing claims');
    assertEqual(wrapped.getTypeIcon(), '🔍', 'Should return type icon even with missing claims');
    const mockCanvas = {
        renderMarkdown: (text) => `<div>${text}</div>`,
    };
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('No claims to verify.'), 'Should render default message when claims missing');
    const actions = wrapped.getActions();
    assertTrue(Array.isArray(actions) && actions.length === 1, 'Should return actions even with missing claims');
});

console.log('\n✅ All Factcheck node plugin tests passed!\n');
