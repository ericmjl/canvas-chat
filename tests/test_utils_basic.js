/**
 * Tests for utils.js
 * Tests utility functions: URL extraction, text formatting, error formatting, etc.
 */

import {
    test,
    assertEqual,
    assertTrue,
    assertFalse,
    assertNull,
    extractUrlFromReferenceNode,
    formatMatrixAsText,
    formatUserError,
    escapeHtmlText,
    truncateText,
    isUrlContent
} from './test_setup.js';

// ============================================================
// extractUrlFromReferenceNode tests
// ============================================================

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
// formatMatrixAsText tests
// ============================================================

test('formatMatrixAsText: basic 2x2 matrix', () => {
    const matrix = {
        context: 'Compare products',
        rowItems: ['Product A', 'Product B'],
        colItems: ['Price', 'Quality'],
        cells: {
            '0-0': { content: '$10', filled: true },
            '0-1': { content: 'Good', filled: true },
            '1-0': { content: '$20', filled: true },
            '1-1': { content: 'Excellent', filled: true }
        }
    };

    const result = formatMatrixAsText(matrix);
    assertTrue(result.includes('## Compare products'), 'Should have header');
    assertTrue(result.includes('| Product A |'), 'Should have row item');
    assertTrue(result.includes('$10'), 'Should have cell content');
    assertTrue(result.includes('Excellent'), 'Should have cell content');
});

test('formatMatrixAsText: empty cells', () => {
    const matrix = {
        context: 'Empty matrix',
        rowItems: ['Row 1'],
        colItems: ['Col 1'],
        cells: {
            '0-0': { content: null, filled: false }
        }
    };

    const result = formatMatrixAsText(matrix);
    assertTrue(result.includes('## Empty matrix'), 'Should have header');
    assertTrue(result.includes('| Row 1 |'), 'Should have row item');
});

test('formatMatrixAsText: cell content with newlines gets flattened', () => {
    const matrix = {
        context: 'Test',
        rowItems: ['Row'],
        colItems: ['Col'],
        cells: {
            '0-0': { content: 'Line 1\nLine 2', filled: true }
        }
    };

    const result = formatMatrixAsText(matrix);
    assertTrue(result.includes('Line 1 Line 2'), 'Newlines should be replaced with spaces');
    assertFalse(result.includes('Line 1\nLine 2'), 'Should not contain literal newlines in cell');
});

test('formatMatrixAsText: cell content with pipe characters gets escaped', () => {
    const matrix = {
        context: 'Test',
        rowItems: ['Row'],
        colItems: ['Col'],
        cells: {
            '0-0': { content: 'A | B', filled: true }
        }
    };

    const result = formatMatrixAsText(matrix);
    assertTrue(result.includes('A \\| B'), 'Pipe characters should be escaped');
});

// ============================================================
// formatUserError tests
// ============================================================

test('formatUserError: timeout detection', () => {
    const result = formatUserError({ message: 'Request timeout' });
    assertEqual(result.title, 'Request timed out');
    assertTrue(result.canRetry);
});

test('formatUserError: ETIMEDOUT detection', () => {
    const result = formatUserError({ message: 'ETIMEDOUT error' });
    assertEqual(result.title, 'Request timed out');
});

test('formatUserError: authentication error detection', () => {
    const result = formatUserError({ message: '401 Unauthorized' });
    assertEqual(result.title, 'Authentication failed');
    assertFalse(result.canRetry);
});

test('formatUserError: invalid API key detection', () => {
    const result = formatUserError({ message: 'Invalid API key' });
    assertEqual(result.title, 'Authentication failed');
});

test('formatUserError: rate limit detection', () => {
    const result = formatUserError({ message: '429 Rate limit exceeded' });
    assertEqual(result.title, 'Rate limit reached');
    assertTrue(result.canRetry);
});

test('formatUserError: server error detection', () => {
    const result = formatUserError({ message: '500 Internal Server Error' });
    assertEqual(result.title, 'Server error');
    assertTrue(result.canRetry);
});

test('formatUserError: network error detection', () => {
    const result = formatUserError({ message: 'Failed to fetch' });
    assertEqual(result.title, 'Network error');
    assertTrue(result.canRetry);
});

test('formatUserError: context length error detection', () => {
    const result = formatUserError({ message: 'Context length exceeded' });
    assertEqual(result.title, 'Message too long');
    assertFalse(result.canRetry);
});

test('formatUserError: default error handling', () => {
    const result = formatUserError({ message: 'Unknown error' });
    assertEqual(result.title, 'Something went wrong');
    assertTrue(result.canRetry);
    assertTrue(result.description.includes('Unknown error'));
});

test('formatUserError: handles string errors', () => {
    const result = formatUserError('Some error string');
    assertEqual(result.title, 'Something went wrong');
    assertTrue(result.description.includes('Some error string'));
});

test('formatUserError: handles null/undefined', () => {
    const result = formatUserError(null);
    assertEqual(result.title, 'Something went wrong');
    // When null, String(null) = "null", so description will be "null" or "An unexpected error occurred"
    assertTrue(result.description.includes('null') || result.description.includes('unexpected'));
});

// ============================================================
// escapeHtml tests
// ============================================================

test('escapeHtml: escapes angle brackets', () => {
    assertEqual(escapeHtmlText('<script>'), '&lt;script&gt;');
});

test('escapeHtml: escapes ampersand', () => {
    assertEqual(escapeHtmlText('A & B'), 'A &amp; B');
});

test('escapeHtml: escapes quotes', () => {
    assertEqual(escapeHtmlText('"hello"'), '&quot;hello&quot;');
});

test('escapeHtml: handles empty string', () => {
    assertEqual(escapeHtmlText(''), '');
});

test('escapeHtml: handles null/undefined', () => {
    assertEqual(escapeHtmlText(null), '');
    assertEqual(escapeHtmlText(undefined), '');
});

// ============================================================
// truncate tests
// ============================================================

test('truncate: returns original if shorter than max', () => {
    assertEqual(truncateText('hello', 10), 'hello');
});

test('truncate: truncates and adds ellipsis', () => {
    // truncateText uses slice(0, maxLength - 1) + '…', so maxLength=8 gives 7 chars + ellipsis
    assertEqual(truncateText('hello world', 8), 'hello w…');
});

test('truncate: handles exact length', () => {
    assertEqual(truncateText('hello', 5), 'hello');
});

test('truncate: handles empty string', () => {
    assertEqual(truncateText('', 10), '');
});

test('truncate: handles null/undefined', () => {
    assertEqual(truncateText(null, 10), '');
    assertEqual(truncateText(undefined, 10), '');
});

// ============================================================
// URL detection tests (for /note command)
// ============================================================

test('isUrl: detects http URL', () => {
    assertTrue(isUrlContent('http://example.com'));
});

test('isUrl: detects https URL', () => {
    assertTrue(isUrlContent('https://example.com'));
});

test('isUrl: detects URL with path', () => {
    assertTrue(isUrlContent('https://example.com/path/to/page'));
});

test('isUrl: detects URL with query params', () => {
    assertTrue(isUrlContent('https://example.com/page?id=123&ref=abc'));
});

test('isUrl: detects URL with fragment', () => {
    assertTrue(isUrlContent('https://example.com/page#section'));
});

test('isUrl: detects complex URL', () => {
    assertTrue(isUrlContent('https://pmc.ncbi.nlm.nih.gov/articles/PMC12514551/'));
});

test('isUrl: trims whitespace', () => {
    assertTrue(isUrlContent('  https://example.com  '));
});

test('isUrl: rejects plain text', () => {
    assertFalse(isUrlContent('This is just some text'));
});

test('isUrl: rejects markdown', () => {
    assertFalse(isUrlContent('# Heading\n\nSome content'));
});

test('isUrl: rejects URL embedded in text', () => {
    assertFalse(isUrlContent('Check out https://example.com for more'));
});

test('isUrl: rejects URL without protocol', () => {
    assertFalse(isUrlContent('example.com'));
});

test('isUrl: rejects ftp URLs', () => {
    assertFalse(isUrlContent('ftp://files.example.com'));
});

test('isUrl: rejects empty string', () => {
    assertFalse(isUrlContent(''));
});

test('isUrl: rejects whitespace only', () => {
    assertFalse(isUrlContent('   '));
});

// ============================================================
// isPdfUrl tests (for PDF URL detection)
// ============================================================

/**
 * Detect if a URL points to a PDF file.
 * This pattern is used in app.js to route /note commands with PDF URLs
 * to the PDF import handler instead of the regular note handler.
 */
function isPdfUrl(url) {
    return /\.pdf(\?.*)?$/i.test(url.trim());
}

test('isPdfUrl: detects .pdf extension', () => {
    assertTrue(isPdfUrl('https://example.com/document.pdf'));
});

test('isPdfUrl: detects .PDF uppercase extension', () => {
    assertTrue(isPdfUrl('https://example.com/document.PDF'));
});

test('isPdfUrl: detects mixed case .Pdf extension', () => {
    assertTrue(isPdfUrl('https://example.com/document.Pdf'));
});

test('isPdfUrl: detects .pdf with query parameters', () => {
    assertTrue(isPdfUrl('https://example.com/document.pdf?id=123'));
});

test('isPdfUrl: detects .pdf with multiple query parameters', () => {
    assertTrue(isPdfUrl('https://example.com/document.pdf?id=123&ref=abc'));
});

test('isPdfUrl: detects .pdf in path with subdirectories', () => {
    assertTrue(isPdfUrl('https://example.com/path/to/document.pdf'));
});

test('isPdfUrl: trims whitespace', () => {
    assertTrue(isPdfUrl('  https://example.com/document.pdf  '));
});

test('isPdfUrl: rejects non-PDF URLs', () => {
    assertFalse(isPdfUrl('https://example.com/document.html'));
});

test('isPdfUrl: rejects .txt files', () => {
    assertFalse(isPdfUrl('https://example.com/document.txt'));
});

test('isPdfUrl: rejects .doc files', () => {
    assertFalse(isPdfUrl('https://example.com/document.doc'));
});

test('isPdfUrl: rejects .docx files', () => {
    assertFalse(isPdfUrl('https://example.com/document.docx'));
});

test('isPdfUrl: rejects URL with pdf in path but different extension', () => {
    assertFalse(isPdfUrl('https://example.com/pdf/document.html'));
});

test('isPdfUrl: rejects URL with pdf in domain', () => {
    assertFalse(isPdfUrl('https://pdf.example.com/document'));
});

test('isPdfUrl: rejects URL with pdf in query but no .pdf extension', () => {
    assertFalse(isPdfUrl('https://example.com/document?type=pdf'));
});

test('isPdfUrl: rejects plain text', () => {
    assertFalse(isPdfUrl('This is not a URL'));
});

test('isPdfUrl: rejects empty string', () => {
    assertFalse(isPdfUrl(''));
});

test('isPdfUrl: rejects URL without extension', () => {
    assertFalse(isPdfUrl('https://example.com/document'));
});

test('isPdfUrl: handles arxiv-style PDF URLs', () => {
    assertTrue(isPdfUrl('https://arxiv.org/pdf/1234.5678.pdf'));
});

test('isPdfUrl: handles nature-style PDF URLs', () => {
    assertTrue(isPdfUrl('https://www.nature.com/articles/article.pdf'));
});
