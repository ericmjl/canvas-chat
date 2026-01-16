/**
 * Tests for flashcards.js
 * Tests SM-2 spaced repetition algorithm, flashcard due detection, and FlashcardNode.
 */

import {
    applySM2,
    assertEqual,
    assertFalse,
    assertNull,
    assertTrue,
    getDueFlashcards,
    isFlashcardDue,
    NodeType,
    test,
    wrapNode
} from './test_setup.js';

// Mock canvas for testing renderContent
const mockCanvas = {
    escapeHtml: (text) => {
        if (text == null) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    truncate: (text, maxLength) => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength - 1) + '…';
    },
    renderMarkdown: (text) => `<div>${text}</div>`,
    showCopyFeedback: () => {}
};

// ============================================================
// SM-2 Spaced Repetition Algorithm tests
// ============================================================

test('applySM2: first correct answer (quality 4) sets interval to 1', () => {
    const srs = { interval: 0, easeFactor: 2.5, repetitions: 0, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 1);
});

test('applySM2: second correct answer (quality 4) sets interval to 6', () => {
    const srs = { interval: 1, easeFactor: 2.5, repetitions: 1, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(result.interval, 6);
    assertEqual(result.repetitions, 2);
});

test('applySM2: third correct answer multiplies interval by easeFactor', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(result.interval, 15); // 6 * 2.5 = 15
    assertEqual(result.repetitions, 3);
});

test('applySM2: failed answer (quality 1) resets repetitions and interval', () => {
    const srs = { interval: 15, easeFactor: 2.5, repetitions: 5, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 1);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 0);
});

test('applySM2: easy answer (quality 5) increases easeFactor', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 5);
    assertTrue(result.easeFactor > 2.5, 'Ease factor should increase for easy answers');
});

test('applySM2: hard answer (quality 3) decreases easeFactor', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 3);
    assertTrue(result.easeFactor < 2.5, 'Ease factor should decrease for hard answers');
});

test('applySM2: easeFactor minimum is 1.3', () => {
    const srs = { interval: 6, easeFactor: 1.35, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    // Multiple hard answers to try to push below 1.3
    let result = applySM2(srs, 3);
    result = applySM2(result, 3);
    result = applySM2(result, 3);
    assertTrue(result.easeFactor >= 1.3, 'Ease factor should not go below 1.3');
});

test('applySM2: sets nextReviewDate based on interval', () => {
    const srs = { interval: 1, easeFactor: 2.5, repetitions: 1, nextReviewDate: null, lastReviewDate: null };
    const before = Date.now();
    const result = applySM2(srs, 4);
    const after = Date.now();

    const nextReview = new Date(result.nextReviewDate).getTime();
    // interval is 6 days = 6 * 86400000 ms
    const expectedMin = before + (6 * 86400000);
    const expectedMax = after + (6 * 86400000);

    assertTrue(nextReview >= expectedMin - 1000, 'nextReviewDate should be at least 6 days in future');
    assertTrue(nextReview <= expectedMax + 1000, 'nextReviewDate should be about 6 days in future');
});

test('applySM2: sets lastReviewDate to current time', () => {
    const srs = { interval: 1, easeFactor: 2.5, repetitions: 0, nextReviewDate: null, lastReviewDate: null };
    const before = Date.now();
    const result = applySM2(srs, 4);
    const after = Date.now();

    const lastReview = new Date(result.lastReviewDate).getTime();
    assertTrue(lastReview >= before - 1000, 'lastReviewDate should be around now');
    assertTrue(lastReview <= after + 1000, 'lastReviewDate should be around now');
});

test('applySM2: quality 0 resets like any fail', () => {
    const srs = { interval: 15, easeFactor: 2.5, repetitions: 5, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 0);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 0);
});

test('applySM2: quality 2 resets (fail threshold is < 3)', () => {
    const srs = { interval: 15, easeFactor: 2.5, repetitions: 5, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 2);
    assertEqual(result.interval, 1);
    assertEqual(result.repetitions, 0);
});

test('applySM2: does not mutate original srs object', () => {
    const srs = { interval: 6, easeFactor: 2.5, repetitions: 2, nextReviewDate: null, lastReviewDate: null };
    const result = applySM2(srs, 4);
    assertEqual(srs.interval, 6, 'Original interval should not change');
    assertEqual(srs.repetitions, 2, 'Original repetitions should not change');
    assertNull(srs.lastReviewDate, 'Original lastReviewDate should not change');
});

// ============================================================
// Due flashcard detection tests
// ============================================================

test('isFlashcardDue: new card without SRS data is due', () => {
    const card = { type: NodeType.FLASHCARD, content: 'Q', question: 'Q', answer: 'A' };
    assertTrue(isFlashcardDue(card), 'New card should be due');
});

test('isFlashcardDue: card with null nextReviewDate is due', () => {
    const card = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        question: 'Q',
        answer: 'A',
        srs: { nextReviewDate: null }
    };
    assertTrue(isFlashcardDue(card), 'Card with null nextReviewDate should be due');
});

test('isFlashcardDue: card with past nextReviewDate is due', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const card = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        question: 'Q',
        answer: 'A',
        srs: { nextReviewDate: yesterday }
    };
    assertTrue(isFlashcardDue(card), 'Card with past nextReviewDate should be due');
});

test('isFlashcardDue: card with future nextReviewDate is not due', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const card = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        question: 'Q',
        answer: 'A',
        srs: { nextReviewDate: tomorrow }
    };
    assertFalse(isFlashcardDue(card), 'Card with future nextReviewDate should not be due');
});

test('isFlashcardDue: non-flashcard node returns false', () => {
    const node = { type: NodeType.AI, content: 'response' };
    assertFalse(isFlashcardDue(node), 'Non-flashcard node should not be due');
});

// ============================================================
// getDueFlashcards filter tests
// ============================================================

test('getDueFlashcards: returns empty array when no nodes', () => {
    const result = getDueFlashcards([]);
    assertEqual(result.length, 0);
});

test('getDueFlashcards: returns empty array when no flashcards', () => {
    const nodes = [
        { type: NodeType.AI, content: 'response' },
        { type: NodeType.HUMAN, content: 'question' }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 0);
});

test('getDueFlashcards: returns new flashcard (no SRS data)', () => {
    const nodes = [
        { id: 'fc-1', type: NodeType.FLASHCARD, content: 'Q1', question: 'Q1', answer: 'A1' }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1);
    assertEqual(result[0].id, 'fc-1');
});

test('getDueFlashcards: returns flashcard with null nextReviewDate', () => {
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            question: 'Q1',
            answer: 'A1',
            srs: { nextReviewDate: null }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1);
});

test('getDueFlashcards: returns flashcard with past nextReviewDate', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            question: 'Q1',
            answer: 'A1',
            srs: { nextReviewDate: yesterday }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1);
});

test('getDueFlashcards: excludes flashcard with future nextReviewDate', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            question: 'Q1',
            answer: 'A1',
            srs: { nextReviewDate: tomorrow }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 0);
});

test('getDueFlashcards: mixed nodes returns only due flashcards', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nodes = [
        { id: 'ai-1', type: NodeType.AI, content: 'response' },
        { id: 'fc-1', type: NodeType.FLASHCARD, content: 'Q1', question: 'Q1', answer: 'A1', srs: { nextReviewDate: yesterday } },
        { id: 'fc-2', type: NodeType.FLASHCARD, content: 'Q2', question: 'Q2', answer: 'A2', srs: { nextReviewDate: tomorrow } },
        { id: 'fc-3', type: NodeType.FLASHCARD, content: 'Q3', question: 'Q3', answer: 'A3' } // No SRS data
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 2);
    assertEqual(result[0].id, 'fc-1');
    assertEqual(result[1].id, 'fc-3');
});

test('getDueFlashcards: handles boundary case - review date is now', () => {
    const now = new Date().toISOString();
    const nodes = [
        {
            id: 'fc-1',
            type: NodeType.FLASHCARD,
            content: 'Q1',
            question: 'Q1',
            answer: 'A1',
            srs: { nextReviewDate: now }
        }
    ];
    const result = getDueFlashcards(nodes);
    assertEqual(result.length, 1, 'Card with review date exactly now should be due');
});

// ============================================================
// FlashcardNode tests
// ============================================================

test('FlashcardNode: getTypeLabel returns Flashcard', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', question: 'Q', answer: 'A', srs: null };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeLabel(), 'Flashcard');
});

test('FlashcardNode: getTypeIcon returns card emoji', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', question: 'Q', answer: 'A', srs: null };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getTypeIcon(), '🎴');
});

test('FlashcardNode: getSummaryText returns truncated question', () => {
    const node = { type: NodeType.FLASHCARD, content: 'What is the capital of France?', question: 'What is the capital of France?', answer: 'Paris', srs: null };
    const wrapped = wrapNode(node);
    const summary = wrapped.getSummaryText(mockCanvas);
    assertTrue(summary.includes('What is the capital'), 'Should include question content');
});

test('FlashcardNode: getSummaryText prefers title over content', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Question', question: 'Question', answer: 'Answer', title: 'Geography Card', srs: null };
    const wrapped = wrapNode(node);
    assertEqual(wrapped.getSummaryText(mockCanvas), 'Geography Card');
});

test('FlashcardNode: renderContent includes question and answer', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Test Question', question: 'Test Question', answer: 'Test Answer', back: 'Test Answer', srs: null };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('Test Question'), 'Should include question');
    assertTrue(html.includes('Test Answer'), 'Should include answer');
    assertTrue(html.includes('flashcard-front'), 'Should have front section');
    assertTrue(html.includes('flashcard-back'), 'Should have back section');
});

test('FlashcardNode: renderContent shows New status for new cards', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', question: 'Q', answer: 'A', srs: null };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status new'), 'Should have new status class');
    assertTrue(html.includes('>New<'), 'Should show New text');
});

test('FlashcardNode: renderContent shows Due status for overdue cards', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
    const node = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        question: 'Q',
        answer: 'A',
        srs: { nextReviewDate: pastDate, repetitions: 1, easeFactor: 2.5, interval: 1 }
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status due'), 'Should have due status class');
    assertTrue(html.includes('>Due<'), 'Should show Due text');
});

test('FlashcardNode: renderContent shows learning status for future cards', () => {
    const futureDate = new Date(Date.now() + 3 * 86400000).toISOString(); // 3 days from now
    const node = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        question: 'Q',
        answer: 'A',
        srs: { nextReviewDate: futureDate, repetitions: 2, easeFactor: 2.5, interval: 3 }
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status learning'), 'Should have learning status class');
    assertTrue(html.includes('Due in'), 'Should show days until due');
});

test('FlashcardNode: renderContent shows learning status for failed cards (repetitions=0)', () => {
    // When a card is failed, SM-2 resets repetitions to 0 but still sets a future nextReviewDate
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const node = {
        type: NodeType.FLASHCARD,
        content: 'Q',
        question: 'Q',
        answer: 'A',
        srs: { nextReviewDate: futureDate, repetitions: 0, easeFactor: 2.5, interval: 1 }
    };
    const wrapped = wrapNode(node);
    const html = wrapped.renderContent(mockCanvas);
    assertTrue(html.includes('flashcard-status learning'), 'Should have learning status class even with repetitions=0');
    assertTrue(html.includes('Due tomorrow'), 'Should show Due tomorrow');
});

test('FlashcardNode: getComputedActions includes FLIP_CARD', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', question: 'Q', answer: 'A', srs: null };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertTrue(actions.some(a => a.id === 'flip-card'), 'Should include flip-card action');
    assertTrue(actions.some(a => a.id === 'edit-content'), 'Should include edit-content action');
    assertTrue(actions.some(a => a.id === 'copy'), 'Should include copy action');
    assertTrue(actions.some(a => a.id === 'reply'), 'Should include reply action');
});

test('FlashcardNode: getComputedActions includes REVIEW_CARD', () => {
    const node = { type: NodeType.FLASHCARD, content: 'Q', question: 'Q', answer: 'A', srs: null };
    const wrapped = wrapNode(node);
    const actions = wrapped.getComputedActions();
    assertTrue(actions.some(a => a.id === 'review-card'), 'FlashcardNode should include review-card action');
});
