/**
 * Tests for web-grounding.js (appendWebContextToMessages and related helpers).
 */

import { test, assertEqual, assertTrue, assertDeepEqual } from './test_setup.js';
import { appendWebContextToMessages } from '../src/canvas_chat/static/js/web-grounding.js';

test('appendWebContextToMessages: appends one user message with formatted results', () => {
    const messages = [{ role: 'user', content: 'What languages to learn?' }];
    const searchResults = [
        { title: 'Python Guide', url: 'https://example.com/python', snippet: 'Python is popular.' },
        { title: 'Rust', url: 'https://example.com/rust', snippet: 'Rust is fast.' },
    ];
    const out = appendWebContextToMessages(messages, searchResults);
    assertEqual(out.length, 2);
    assertEqual(out[0].role, 'user');
    assertEqual(out[0].content, 'What languages to learn?');
    assertEqual(out[1].role, 'user');
    assertTrue(out[1].content.includes('Web search results (use to ground your answer)'));
    assertTrue(out[1].content.includes('[1] Python Guide'));
    assertTrue(out[1].content.includes('https://example.com/python'));
    assertTrue(out[1].content.includes('Python is popular.'));
    assertTrue(out[1].content.includes('[2] Rust'));
    assertTrue(out[1].content.includes('https://example.com/rust'));
});

test('appendWebContextToMessages: does not mutate input messages', () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    const copy = [...messages];
    const searchResults = [{ title: 'T', url: 'https://u', snippet: 'S' }];
    appendWebContextToMessages(messages, searchResults);
    assertDeepEqual(messages, copy);
});

test('appendWebContextToMessages: empty results appends "No results found"', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const out = appendWebContextToMessages(messages, []);
    assertEqual(out.length, 2);
    assertTrue(out[1].content.includes('Web search results'));
    assertTrue(out[1].content.includes('No results found'));
});

test('appendWebContextToMessages: empty messages array', () => {
    const messages = [];
    const searchResults = [{ title: 'A', url: 'https://a', snippet: 'B' }];
    const out = appendWebContextToMessages(messages, searchResults);
    assertEqual(out.length, 1);
    assertEqual(out[0].role, 'user');
    assertTrue(out[0].content.includes('[1] A'));
});
