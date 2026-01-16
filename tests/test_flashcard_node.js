/**
 * Tests for Flashcard node plugin
 * Verifies that the flashcard node plugin works correctly when loaded
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

console.log('\n=== Flashcard Node Plugin Tests ===\n');

// Test: Flashcard node plugin is registered
await asyncTest('Flashcard node plugin is registered', async () => {
    // Import flashcard-node.js to trigger registration
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    // Check if NodeRegistry has the flashcard type
    const { NodeRegistry } = await import('../src/canvas_chat/static/js/node-registry.js');
    assertTrue(NodeRegistry.isRegistered('flashcard'), 'Flashcard node type should be registered');

    const protocol = NodeRegistry.getProtocolClass('flashcard');
    assertTrue(protocol !== undefined, 'Flashcard protocol class should exist');
});

// Test: FlashcardNode protocol methods
await asyncTest('FlashcardNode implements protocol methods', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    // Test protocol methods
    const testNode = createNode(NodeType.FLASHCARD, 'What is 2+2?', {
        back: '4',
    });
    const wrapped = wrapNode(testNode);

    assertEqual(wrapped.getTypeLabel(), 'Flashcard', 'Type label should be Flashcard');
    assertEqual(wrapped.getTypeIcon(), '🎴', 'Type icon should be 🎴');
});

// Test: FlashcardNode getSummaryText with title
await asyncTest('FlashcardNode getSummaryText returns title when available', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = createNode(NodeType.FLASHCARD, 'What is 2+2?', {
        title: 'Math Basics',
        back: '4',
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = { truncate: (text) => text };
    const summary = wrapped.getSummaryText(mockCanvas);
    assertEqual(summary, 'Math Basics', 'Summary text should return title when available');
});

// Test: FlashcardNode getSummaryText without title
await asyncTest('FlashcardNode getSummaryText returns truncated question when no title', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = createNode(NodeType.FLASHCARD, 'What is the capital of France?', {
        back: 'Paris',
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {
        truncate: (text, len) => {
            if (text.length <= len) return text;
            return text.substring(0, len) + '...';
        },
    };
    const summary = wrapped.getSummaryText(mockCanvas);
    assertTrue(summary.length <= 60, 'Summary text should be truncated to 60 chars');
    assertTrue(summary.includes('capital'), 'Summary should include question content');
});

// Test: FlashcardNode getSummaryText strips markdown
await asyncTest('FlashcardNode getSummaryText strips markdown characters', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = createNode(NodeType.FLASHCARD, '# What is **2+2**?', {
        back: '4',
    });
    const wrapped = wrapNode(node);

    // Mock canvas for getSummaryText
    const mockCanvas = {
        truncate: (text, len) => text,
    };
    const summary = wrapped.getSummaryText(mockCanvas);
    assertTrue(!summary.includes('#'), 'Should strip # markdown');
    assertTrue(!summary.includes('**'), 'Should strip ** markdown');
    assertTrue(summary.includes('What is'), 'Should include plain text');
});

// Test: FlashcardNode renderContent
await asyncTest('FlashcardNode renderContent generates correct HTML', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = createNode(NodeType.FLASHCARD, 'What is 2+2?', {
        back: '4',
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('flashcard-container'), 'Should contain flashcard-container class');
    assertTrue(html.includes('flashcard-card'), 'Should contain flashcard-card class');
    assertTrue(html.includes('flashcard-front'), 'Should contain flashcard-front class');
    assertTrue(html.includes('flashcard-back'), 'Should contain flashcard-back class');
    assertTrue(html.includes('What is 2+2?'), 'Should contain question');
    assertTrue(html.includes('4'), 'Should contain answer');
    assertTrue(html.includes('Question'), 'Should contain Question label');
    assertTrue(html.includes('Answer'), 'Should contain Answer label');
});

// Test: FlashcardNode renderContent with SRS status (new)
await asyncTest('FlashcardNode renderContent shows "New" status for new cards', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = createNode(NodeType.FLASHCARD, 'Question', {
        back: 'Answer',
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('flashcard-status'), 'Should contain flashcard-status');
    assertTrue(html.includes('new'), 'Should have new status class');
    assertTrue(html.includes('New'), 'Should show "New" status text');
});

// Test: FlashcardNode renderContent with SRS status (due)
await asyncTest('FlashcardNode renderContent shows "Due" status for overdue cards', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const pastDate = new Date(Date.now() - 86400000); // Yesterday
    const node = createNode(NodeType.FLASHCARD, 'Question', {
        back: 'Answer',
        srs: {
            nextReviewDate: pastDate.toISOString(),
        },
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('due'), 'Should have due status class');
    assertTrue(html.includes('Due'), 'Should show "Due" status text');
});

// Test: FlashcardNode renderContent with SRS status (learning)
await asyncTest('FlashcardNode renderContent shows learning status for future due cards', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const futureDate = new Date(Date.now() + 2 * 86400000); // 2 days from now
    const node = createNode(NodeType.FLASHCARD, 'Question', {
        back: 'Answer',
        srs: {
            nextReviewDate: futureDate.toISOString(),
        },
    });
    const wrapped = wrapNode(node);

    // Mock canvas for renderContent
    const mockCanvas = {
        escapeHtml: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);

    assertTrue(html.includes('learning'), 'Should have learning status class');
    assertTrue(html.includes('Due in'), 'Should show "Due in X days" status text');
});

// Test: FlashcardNode getActions
await asyncTest('FlashcardNode getActions returns correct actions in expected order', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = createNode(NodeType.FLASHCARD, 'Question', {
        back: 'Answer',
    });
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();

    // FlashcardNode hides edit-content from defaults, adds FLIP_CARD, REVIEW_CARD, EDIT_CONTENT
    assertTrue(Array.isArray(actions), 'Actions should be an array');
    assertTrue(actions.length === 5, 'Should have exactly 5 actions (REPLY, COPY, FLIP_CARD, REVIEW_CARD, EDIT_CONTENT)');

    // Check for expected actions (defaults + additional)
    const actionIds = actions.map((a) => a.id);
    assertTrue(actionIds.includes('reply'), 'Should include REPLY');
    assertTrue(actionIds.includes('copy'), 'Should include COPY');
    assertTrue(actionIds.includes('flip-card'), 'Should include FLIP_CARD');
    assertTrue(actionIds.includes('review-card'), 'Should include REVIEW_CARD');
    assertTrue(actionIds.includes('edit-content'), 'Should include EDIT_CONTENT');

    // Verify no duplicates
    const uniqueIds = new Set(actionIds);
    assertTrue(uniqueIds.size === actions.length, 'Actions should not have duplicates');
});

// Test: FlashcardNode isScrollable
await asyncTest('FlashcardNode isScrollable returns true', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = { type: NodeType.FLASHCARD, content: 'Question', back: 'Answer' };
    const wrapped = wrapNode(node);
    assertTrue(wrapped.isScrollable(), 'FlashcardNode should be scrollable');
});

// Test: FlashcardNode wrapNode integration
await asyncTest('wrapNode returns FlashcardNode for FLASHCARD type', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = {
        type: NodeType.FLASHCARD,
        content: 'Question',
        back: 'Answer',
    };
    const wrapped = wrapNode(node);

    // Verify it's wrapped correctly (not BaseNode)
    assertTrue(wrapped.getTypeLabel() === 'Flashcard', 'Should return Flashcard node protocol');
    assertTrue(wrapped.getTypeIcon() === '🎴', 'Should have flashcard icon');
    const actions = wrapped.getComputedActions();
    const actionIds = actions.map((a) => a.id);
    assertTrue(actionIds.includes('flip-card'), 'Should have FLIP_CARD action');
    assertTrue(actions.length === 5, 'Should have 5 actions (REPLY, COPY, FLIP_CARD, REVIEW_CARD, EDIT_CONTENT)');
});

// Test: FlashcardNode handles edge cases
await asyncTest('FlashcardNode handles missing content', async () => {
    // Import flashcard-node.js to register the plugin
    await import('../src/canvas_chat/static/js/plugins/flashcard-node.js');

    const node = {
        type: NodeType.FLASHCARD,
        id: 'test',
        position: { x: 0, y: 0 },
        width: 400,
        height: 280,
        created_at: Date.now(),
        tags: [],
    };
    const wrapped = wrapNode(node);

    // Should still work with missing content
    assertEqual(wrapped.getTypeLabel(), 'Flashcard', 'Should return type label even with missing content');
    assertEqual(wrapped.getTypeIcon(), '🎴', 'Should return type icon even with missing content');
    const mockCanvas = {
        escapeHtml: (text) => text,
        truncate: (text) => text,
    };
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('No question'), 'Should show "No question" placeholder');
    assertTrue(html.includes('No answer'), 'Should show "No answer" placeholder');
    const actions = wrapped.getComputedActions();
    assertTrue(Array.isArray(actions) && actions.length === 5, 'Should return actions even with missing content');
});

console.log('\n✅ All Flashcard node plugin tests passed!\n');
