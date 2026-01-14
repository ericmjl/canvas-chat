/**
 * Unit tests for BM25 search algorithm.
 * Run with: node tests/test_search.js
 *
 * Tests search/indexing functionality without external API calls.
 *
 * NOTE: This file loads actual source files to test real implementations,
 * not copies. This ensures tests catch bugs in production code.
 */

// Set up minimal browser-like environment for source file
global.window = global;
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
global.indexedDB = {
    open: () => ({ onsuccess: null, onerror: null }),
};

import { assertEqual, assertTrue } from './test_helpers/assertions.js';

// Import ES modules
const { SearchIndex, tokenize, calculateIDF, getNodeTypeIcon, NODE_TYPE_ICONS, BM25_K1, BM25_B } =
    await import('../src/canvas_chat/static/js/search.js');

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

function assertGreaterThan(actual, expected, message = '') {
    if (actual <= expected) {
        throw new Error(message || `Expected ${actual} > ${expected}`);
    }
}

// ============================================================
// tokenize tests
// ============================================================

test('tokenize: splits and lowercases', () => {
    assertEqual(tokenize('Hello World!'), ['hello', 'world']);
});

test('tokenize: handles punctuation', () => {
    assertEqual(tokenize('Hello, world!'), ['hello', 'world']);
});

test('tokenize: handles multiple spaces', () => {
    assertEqual(tokenize('Hello    world'), ['hello', 'world']);
});

test('tokenize: handles empty string', () => {
    assertEqual(tokenize(''), []);
});

test('tokenize: handles null/undefined', () => {
    assertEqual(tokenize(null), []);
    assertEqual(tokenize(undefined), []);
});

test('tokenize: preserves numbers', () => {
    assertEqual(tokenize('Version 2.0'), ['version', '2', '0']);
});

test('tokenize: handles special characters', () => {
    assertEqual(tokenize('C++ & Python'), ['c', 'python']);
});

// ============================================================
// calculateIDF tests
// ============================================================

test('calculateIDF: returns 0 for term not in any document', () => {
    assertEqual(calculateIDF(10, 0), 0);
});

test('calculateIDF: higher IDF for rare terms', () => {
    const idfRare = calculateIDF(100, 1);
    const idfCommon = calculateIDF(100, 50);
    assertGreaterThan(idfRare, idfCommon, 'Rare term should have higher IDF');
});

test('calculateIDF: increases with total documents', () => {
    const idfSmall = calculateIDF(10, 1);
    const idfLarge = calculateIDF(100, 1);
    assertGreaterThan(idfLarge, idfSmall, 'IDF should increase with more documents');
});

test('calculateIDF: decreases with document frequency', () => {
    const idf1 = calculateIDF(100, 1);
    const idf10 = calculateIDF(100, 10);
    assertGreaterThan(idf1, idf10, 'IDF should decrease as term appears in more documents');
});

// ============================================================
// SearchIndex tests
// ============================================================

test('SearchIndex: finds matching documents', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'machine learning algorithms');
    index.addDocument('2', 'web development basics');
    const results = index.search('machine');
    assertEqual(results.length, 1);
    assertEqual(results[0].nodeId, '1');
});

test('SearchIndex: returns empty array for no matches', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'machine learning');
    const results = index.search('python');
    assertEqual(results.length, 0);
});

test('SearchIndex: returns empty array for empty query', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'test');
    assertEqual(index.search(''), []);
    assertEqual(index.search('   '), []);
});

test('SearchIndex: ranks by relevance score', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'machine learning algorithms');
    index.addDocument('2', 'machine learning deep learning neural networks');
    index.addDocument('3', 'web development');
    const results = index.search('machine learning');
    assertEqual(results.length, 2);
    assertGreaterThan(results[0].score, results[1].score, 'More relevant doc should score higher');
    // Both docs match, but doc-2 has more occurrences of both terms, so should rank higher
    // However, BM25 considers document length, so we just verify scores are in descending order
    assertTrue(results[0].score > 0);
    assertTrue(results[1].score > 0);
});

test('SearchIndex: respects limit parameter', () => {
    const index = new SearchIndex();
    for (let i = 0; i < 20; i++) {
        index.addDocument(`doc-${i}`, `document ${i} test`);
    }
    const results = index.search('test', 5);
    assertEqual(results.length, 5);
});

test('SearchIndex: removes document correctly', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'test document');
    index.addDocument('2', 'another document');
    assertEqual(index.totalDocuments, 2);

    index.removeDocument('1');
    assertEqual(index.totalDocuments, 1);
    assertFalse(index.documents.has('1'));

    const results = index.search('test');
    assertEqual(results.length, 0);
});

test('SearchIndex: clear removes all documents', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'test');
    index.addDocument('2', 'test');
    index.clear();
    assertEqual(index.totalDocuments, 0);
    assertEqual(index.search('test').length, 0);
});

test('SearchIndex: calculates average document length', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'short');
    index.addDocument('2', 'this is a longer document with more words');
    assertTrue(index.avgDocLength > 0);
    assertTrue(index.avgDocLength < 10); // Should be around 5-6
});

test('SearchIndex: generates snippets with context', () => {
    const index = new SearchIndex();
    const longContent =
        'This is a very long document that contains the word machine learning multiple times and discusses various algorithms.';
    index.addDocument('1', longContent);
    const results = index.search('machine');
    assertTrue(results[0].snippet.includes('machine'));
    assertTrue(results[0].snippet.length <= longContent.length);
});

test('SearchIndex: snippet includes ellipsis for long content', () => {
    const index = new SearchIndex();
    const longContent = 'Beginning ' + 'word '.repeat(50) + 'machine learning ' + 'end '.repeat(50);
    index.addDocument('1', longContent);
    const results = index.search('machine');
    assertTrue(results[0].snippet.includes('...'));
});

test('SearchIndex: handles case-insensitive search', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'Machine Learning');
    const results1 = index.search('machine');
    const results2 = index.search('MACHINE');
    assertEqual(results1.length, 1);
    assertEqual(results2.length, 1);
    assertEqual(results1[0].nodeId, results2[0].nodeId);
});

test('SearchIndex: multiple query terms', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'machine learning algorithms');
    index.addDocument('2', 'machine vision');
    index.addDocument('3', 'deep learning');
    const results = index.search('machine learning');
    // All three match (doc1: both terms, doc2: machine, doc3: learning)
    // But doc1 should rank highest because it has both terms
    assertTrue(results.length >= 1);
    assertEqual(results[0].nodeId, '1'); // Should rank highest
    assertGreaterThan(results[0].score, results.find((r) => r.nodeId === '2')?.score || 0);
});

test('SearchIndex: stores metadata', () => {
    const index = new SearchIndex();
    index.addDocument('1', 'test content', { type: 'ai', custom: 'value' });
    const results = index.search('test');
    assertEqual(results[0].type, 'ai');
    assertEqual(results[0].metadata.custom, 'value');
});

// ============================================================
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
