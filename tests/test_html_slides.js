/**
 * Unit tests for HTML slides plugin helpers.
 * Tests isPastedHtml and stripMarkdownHtmlWrapper (pure functions used by /slides).
 */

import { assertEqual, assertFalse, assertTrue, test } from './test_setup.js';
import { isPastedHtml, stripMarkdownHtmlWrapper } from '../src/canvas_chat/static/js/plugins/html-slides.js';

// =============================================================================
// isPastedHtml
// =============================================================================

test('isPastedHtml: true when starts with <!', () => {
    assertTrue(isPastedHtml('<!DOCTYPE html><html>'));
    assertTrue(isPastedHtml('  <!doctype html>'));
});

test('isPastedHtml: true when contains <div class="deck"', () => {
    assertTrue(isPastedHtml('foo <div class="deck">bar</div>'));
    assertTrue(isPastedHtml('<div class="deck">'));
});

test('isPastedHtml: false for topic-like text', () => {
    assertFalse(isPastedHtml('Introduction to Python'));
    assertFalse(isPastedHtml('Compare REST vs GraphQL'));
    assertFalse(isPastedHtml(''));
});

test('isPastedHtml: false for empty or whitespace', () => {
    assertFalse(isPastedHtml(''));
    assertFalse(isPastedHtml('   '));
});

// =============================================================================
// stripMarkdownHtmlWrapper
// =============================================================================

test('stripMarkdownHtmlWrapper: returns empty for null/undefined', () => {
    assertEqual(stripMarkdownHtmlWrapper(null), '');
    assertEqual(stripMarkdownHtmlWrapper(undefined), '');
});

test('stripMarkdownHtmlWrapper: unwraps ```html ... ```', () => {
    const wrapped = '```html\n<!DOCTYPE html><html><body>Hi</body></html>\n```';
    const out = stripMarkdownHtmlWrapper(wrapped);
    assertTrue(out.includes('<!DOCTYPE html>'));
    assertTrue(out.includes('<body>Hi</body>'));
    assertFalse(out.includes('```'));
});

test('stripMarkdownHtmlWrapper: unwraps ``` ... ``` (no html tag)', () => {
    const wrapped = '```\n<div class="deck">slides</div>\n```';
    const out = stripMarkdownHtmlWrapper(wrapped);
    assertTrue(out.includes('<div class="deck">'));
    assertFalse(out.includes('```'));
});

test('stripMarkdownHtmlWrapper: extracts from preamble to <!DOCTYPE', () => {
    const text = 'Here is your presentation:\n\n<!DOCTYPE html><html><body>Content</body></html>';
    const out = stripMarkdownHtmlWrapper(text);
    assertTrue(out.startsWith('<!DOCTYPE html>'));
    assertTrue(out.includes('Content'));
});

test('stripMarkdownHtmlWrapper: extracts from preamble to <html>', () => {
    const text = 'Generated HTML:\n<html lang="en"><body>Ok</body></html>';
    const out = stripMarkdownHtmlWrapper(text);
    assertTrue(out.includes('<html'));
    assertTrue(out.includes('Ok'));
});

test('stripMarkdownHtmlWrapper: returns trimmed raw content when no fence or preamble', () => {
    const raw = '  <!DOCTYPE html><html></html>  ';
    assertEqual(stripMarkdownHtmlWrapper(raw), '<!DOCTYPE html><html></html>');
});
