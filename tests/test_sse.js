/**
 * Tests for sse.js - SSE parsing and text normalization utilities
 *
 * Tests normalizeText(), parseSSEEvent(), readSSEStream(), and streamSSEContent()
 * These are critical infrastructure used by all streaming LLM features.
 */

import { JSDOM } from 'jsdom';
import { TextEncoder, TextDecoder } from 'util';
import { test, assertEqual, assertTrue, assertFalse } from './test_setup.js';

// Setup jsdom BEFORE importing sse.js (which may use window)
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Import the module AFTER setting up globals
const { normalizeText, parseSSEEvent, readSSEStream } = await import('../src/canvas_chat/static/js/sse.js');

// =============================================================================
// normalizeText Tests
// =============================================================================

test('normalizeText handles null/undefined', () => {
    assertEqual(normalizeText(null), null, 'null should return null');
    assertEqual(normalizeText(undefined), undefined, 'undefined should return undefined');
});

test('normalizeText trims whitespace', () => {
    assertEqual(normalizeText('  hello  '), 'hello', 'should trim whitespace');
    assertEqual(normalizeText('\nhello\n'), 'hello', 'should trim newlines');
});

test('normalizeText fixes hyphenated words', () => {
    assertEqual(normalizeText('matter - of'), 'matter-of', 'should fix space around hyphen');
    assertEqual(normalizeText('state - of - the - art'), 'state-of-the-art', 'should fix multiple hyphens');
});

test('normalizeText removes spaces before punctuation', () => {
    assertEqual(normalizeText('hello , world'), 'hello, world', 'should remove space before comma');
    assertEqual(normalizeText('hello .'), 'hello.', 'should remove space before period');
    assertEqual(normalizeText('hello !'), 'hello!', 'should remove space before exclamation');
    assertEqual(normalizeText('hello ?'), 'hello?', 'should remove space before question mark');
    assertEqual(normalizeText('hello )'), 'hello)', 'should remove space before closing paren');
    assertEqual(normalizeText('hello ]'), 'hello]', 'should remove space before closing bracket');
    assertEqual(normalizeText('hello }'), 'hello}', 'should remove space before closing brace');
});

test('normalizeText removes spaces after opening brackets', () => {
    assertEqual(normalizeText('( hello'), '(hello', 'should remove space after opening paren');
    assertEqual(normalizeText('[ hello'), '[hello', 'should remove space after opening bracket');
    assertEqual(normalizeText('{ hello'), '{hello', 'should remove space after opening brace');
});

test('normalizeText fixes apostrophes in contractions', () => {
    assertEqual(normalizeText("don ' t"), "don't", 'should fix space before apostrophe');
    assertEqual(normalizeText("it ' s"), "it's", 'should fix contraction apostrophe');
    assertEqual(normalizeText("don' t"), "don't", 'should fix space after apostrophe');
    assertEqual(normalizeText("it 's"), "it's", 'should fix space around apostrophe');
});

test('normalizeText collapses multiple spaces', () => {
    assertEqual(normalizeText('hello    world'), 'hello world', 'should collapse multiple spaces');
    assertEqual(normalizeText('a   b  c'), 'a b c', 'should handle mixed spacing');
});

test('normalizeText handles real LLM output artifacts', () => {
    // Real example: "Here is a list :\n1 . Item one\n2 . Item two"
    const input = 'Here is a list :\n1 . Item one\n2 . Item two';
    const expected = 'Here is a list:\n1. Item one\n2. Item two';
    assertEqual(normalizeText(input), expected, 'should fix numbered list artifacts');

    // Real example: "The answer is 42 ."
    const input2 = 'The answer is 42 .';
    assertEqual(normalizeText(input2), 'The answer is 42.', 'should fix space before period after number');
});

// =============================================================================
// parseSSEEvent Tests
// =============================================================================

test('parseSSEEvent parses basic message', () => {
    const result = parseSSEEvent('data: hello world');
    assertEqual(result.eventType, 'message', 'should default to message event');
    assertEqual(result.data, 'hello world', 'should extract data');
});

test('parseSSEEvent parses explicit event type', () => {
    const result = parseSSEEvent('event: done\ndata: completed');
    assertEqual(result.eventType, 'done', 'should extract event type');
    assertEqual(result.data, 'completed', 'should extract data');
});

test('parseSSEEvent handles event without space', () => {
    const result = parseSSEEvent('event:done\ndata:completed');
    assertEqual(result.eventType, 'done', 'should handle event without space');
    assertEqual(result.data, 'completed', 'should extract data');
});

test('parseSSEEvent handles data without space', () => {
    const result = parseSSEEvent('data:hello');
    assertEqual(result.data, 'hello', 'should handle data without space');
});

test('parseSSEEvent joins multiple data lines', () => {
    const result = parseSSEEvent('data: line1\ndata: line2\ndata: line3');
    assertEqual(result.data, 'line1\nline2\nline3', 'should join data lines with newlines');
});

test('parseSSEEvent handles empty event block', () => {
    const result = parseSSEEvent('');
    assertEqual(result.eventType, 'message', 'should default to message for empty');
    assertEqual(result.data, '', 'should have empty data');
});

test('parseSSEEvent handles error event', () => {
    const result = parseSSEEvent('event: error\ndata: Something went wrong');
    assertEqual(result.eventType, 'error', 'should parse error event');
    assertEqual(result.data, 'Something went wrong', 'should extract error message');
});

// =============================================================================
// readSSEStream Tests
// =============================================================================

/**
 * Create a mock Response object with a ReadableStream
 * @param {string[]} chunks - Array of SSE event strings
 * @returns {Response} Mock Response object
 */
function createMockResponse(chunks) {
    const encoder = new TextEncoder();
    const encodedChunks = chunks.map((chunk) => encoder.encode(chunk));
    let chunkIndex = 0;

    const mockBody = {
        getReader() {
            return {
                async read() {
                    if (chunkIndex >= encodedChunks.length) {
                        return { done: true };
                    }
                    return { done: false, value: encodedChunks[chunkIndex++] };
                },
            };
        },
    };

    return {
        ok: true,
        body: mockBody,
    };
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  ${error.message}`);
        process.exit(1);
    }
}

asyncTest('readSSEStream calls onDone on completion', async () => {
    let onDoneCalled = false;
    let onContent = '';

    const mockResponse = createMockResponse(['data: hello\n\n']);

    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            if (type === 'message') onContent += data;
        },
        onDone: () => {
            onDoneCalled = true;
        },
    });

    assertTrue(onDoneCalled, 'onDone should be called');
    assertEqual(onContent, 'hello', 'should receive content');
});

asyncTest('readSSEStream accumulates message data across chunks', async () => {
    let onContent = '';
    let eventCount = 0;

    const mockResponse = createMockResponse(['data: chunk1\n', 'data: chunk2\n', 'data: chunk3\n\n']);

    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            if (type === 'message') {
                onContent += data;
                eventCount++;
            }
        },
        onDone: () => {},
    });

    // Chunks without \n\n are buffered and sent as one event
    assertEqual(eventCount, 1, 'should receive 1 event (all chunks buffered)');
    assertEqual(onContent, 'chunk1\nchunk2\nchunk3', 'should accumulate all chunk data with newlines');
});

asyncTest('readSSEStream handles done event', async () => {
    let doneCalled = false;
    let finalContent = '';

    const mockResponse = createMockResponse(['data: chunk1\ndata: chunk2\n\nevent: done\n\n']);

    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            if (type === 'message') finalContent += data;
        },
        onDone: () => {
            doneCalled = true;
        },
    });

    assertTrue(doneCalled, 'onDone should be called for done event');
    assertEqual(finalContent, 'chunk1\nchunk2', 'should accumulate message data with newline separator');
});

asyncTest('readSSEStream handles error event', async () => {
    let errorReceived = null;

    const mockResponse = createMockResponse(['event: error\ndata: Something failed\n\n']);

    await readSSEStream(mockResponse, {
        onEvent: () => {},
        onError: (err) => {
            errorReceived = err;
        },
    });

    assertTrue(errorReceived !== null, 'onError should be called');
    assertEqual(errorReceived.message, 'Something failed', 'should pass error message');
});

asyncTest('readSSEStream normalizes CRLF', async () => {
    let content = '';

    const mockResponse = createMockResponse(['data: line1\r\n\r\n']);

    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            if (type === 'message') content += data;
        },
    });

    assertEqual(content, 'line1', 'should handle CRLF line endings');
});

asyncTest('readSSEStream handles partial events across chunks', async () => {
    let content = '';

    const mockResponse = createMockResponse([
        'data: first', // Incomplete - no double newline
        ' chunk\n\n', // Completes the event
    ]);

    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            if (type === 'message') content += data;
        },
    });

    assertEqual(content, 'first chunk', 'should buffer partial events');
});

asyncTest('readSSEStream handles empty data', async () => {
    let onEventCalled = false;

    const mockResponse = createMockResponse(['data: \n\n']);

    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            onEventCalled = true;
        },
        onDone: () => {},
    });

    assertTrue(onEventCalled, 'onEvent should be called even for empty data');
});

asyncTest('readSSEStream handles multiple events', async () => {
    const events = [];

    const mockResponse = createMockResponse([
        'data: first event\n\n',
        'data: second event\n\n',
        'data: third event\n\n',
    ]);

    await readSSEStream(mockResponse, {
        onEvent: (type, data) => {
            if (type === 'message') events.push(data);
        },
        onDone: () => {},
    });

    assertEqual(events.length, 3, 'should receive 3 events');
    assertEqual(events[0], 'first event', 'first event');
    assertEqual(events[1], 'second event', 'second event');
    assertEqual(events[2], 'third event', 'third event');
});
