/**
 * Unit tests for JavaScript utility functions.
 * Run with: node tests/test_utils.js
 * 
 * Tests pure functions that don't require DOM or API calls.
 */

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
    if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertNull(actual) {
    if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    }
}

// ============================================================
// extractUrlFromReferenceNode tests
// ============================================================

/**
 * Extract URL from Reference node content (format: **[Title](url)**)
 * This is a copy of the function from app.js for testing
 */
function extractUrlFromReferenceNode(content) {
    // Match markdown link pattern: [text](url)
    const match = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (match && match[2]) {
        return match[2];
    }
    return null;
}

// Test cases
test('extractUrlFromReferenceNode: standard markdown link', () => {
    const content = '**[Article Title](https://example.com/article)**\n\nSome snippet text.';
    assertEqual(extractUrlFromReferenceNode(content), 'https://example.com/article');
});

test('extractUrlFromReferenceNode: link with query params', () => {
    const content = '**[Search Result](https://example.com/page?id=123&ref=abc)**';
    assertEqual(extractUrlFromReferenceNode(content), 'https://example.com/page?id=123&ref=abc');
});

test('extractUrlFromReferenceNode: link with special characters in title', () => {
    const content = '**[Title with "quotes" & special chars](https://example.com)**';
    assertEqual(extractUrlFromReferenceNode(content), 'https://example.com');
});

test('extractUrlFromReferenceNode: simple link without bold', () => {
    const content = '[Plain Link](https://plain.example.com)';
    assertEqual(extractUrlFromReferenceNode(content), 'https://plain.example.com');
});

test('extractUrlFromReferenceNode: no link in content', () => {
    const content = 'Just some plain text without any links.';
    assertNull(extractUrlFromReferenceNode(content));
});

test('extractUrlFromReferenceNode: empty content', () => {
    const content = '';
    assertNull(extractUrlFromReferenceNode(content));
});

test('extractUrlFromReferenceNode: malformed link - missing closing paren', () => {
    const content = '[Title](https://example.com';
    assertNull(extractUrlFromReferenceNode(content));
});

test('extractUrlFromReferenceNode: multiple links - returns first', () => {
    const content = '[First](https://first.com) and [Second](https://second.com)';
    assertEqual(extractUrlFromReferenceNode(content), 'https://first.com');
});

test('extractUrlFromReferenceNode: real Reference node format', () => {
    const content = `**[Climate Change Effects on Agriculture](https://www.nature.com/articles/climate-ag)**

Rising temperatures and changing precipitation patterns are affecting crop yields worldwide.

*2024-01-15*`;
    assertEqual(extractUrlFromReferenceNode(content), 'https://www.nature.com/articles/climate-ag');
});

// ============================================================
// Summary
// ============================================================

console.log('\n-------------------');
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
