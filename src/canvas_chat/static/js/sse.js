/**
 * SSE (Server-Sent Events) parsing utilities
 * Shared module for consistent SSE handling across the application
 */

/**
 * Normalize text content from LLM streaming
 * Fixes common tokenization artifacts like spaces before punctuation
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
    if (!text) return text;

    return (
        text
            // Fix hyphenated words split by spaces (e.g., "matter - of" -> "matter-of")
            .replace(/ - /g, '-')
            // Remove spaces before punctuation
            .replace(/ +([.,!?;:)\]}])/g, '$1')
            // Remove spaces after opening brackets/parens
            .replace(/([[({]) +/g, '$1')
            // Fix space around apostrophe in contractions (e.g., "don ' t" -> "don't")
            .replace(/ +'/g, "'")
            .replace(/' +/g, "'")
            // Fix multiple spaces (but preserve single spaces)
            .replace(/ {2,}/g, ' ')
            // Trim leading/trailing whitespace
            .trim()
    );
}

/**
 * Create an SSE stream reader that handles buffering and parsing
 *
 * @param {Response} response - Fetch response with SSE body
 * @param {Object} handlers - Event handlers { onEvent(eventType, data), onDone(), onError(err) }
 * @returns {Promise<void>}
 */
async function readSSEStream(response, handlers) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Normalize CRLF to LF before parsing (SSE uses CRLF per HTTP spec)
            buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            // Process complete SSE events (separated by double newlines)
            const events = buffer.split('\n\n');
            buffer = events.pop() || ''; // Keep incomplete event in buffer

            for (const event of events) {
                if (!event.trim()) continue;

                const parsed = parseSSEEvent(event);
                if (parsed.eventType === 'done') {
                    if (handlers.onDone) handlers.onDone();
                    return;
                } else if (parsed.eventType === 'error') {
                    const err = new Error(parsed.data || 'Unknown SSE error');
                    if (handlers.onError) handlers.onError(err);
                    return;
                } else if (handlers.onEvent) {
                    handlers.onEvent(parsed.eventType, parsed.data);
                }
            }
        }

        // Stream ended without explicit 'done' event
        if (handlers.onDone) handlers.onDone();
    } catch (err) {
        if (handlers.onError) handlers.onError(err);
    }
}

/**
 * Parse a single SSE event block
 *
 * @param {string} eventBlock - Raw SSE event text
 * @returns {{ eventType: string, data: string }}
 */
function parseSSEEvent(eventBlock) {
    const lines = eventBlock.split('\n');
    let eventType = 'message';
    let dataLines = [];

    for (const line of lines) {
        if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
        } else if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
        } else if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6));
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5));
        }
    }

    // Join data lines with newlines (SSE spec allows multiple data: lines)
    const data = dataLines.join('\n');

    return { eventType, data };
}

/**
 * Simple SSE line-by-line parser for streaming content
 * Use this when you need to process each chunk as it arrives
 *
 * @param {Response} response - Fetch response with SSE body
 * @param {Object} handlers - Event handlers { onContent(chunk, fullContent), onDone(fullContent), onError(err), onStatus(status) }
 * @returns {Promise<string>} - The full accumulated content
 */
async function streamSSEContent(response, handlers) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let currentEvent = 'content';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Normalize CRLF to LF
            buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line

            for (const line of lines) {
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    // SSE spec: "data:" may be followed by optional space before content
                    // Handle both "data: content" and "data:content" formats
                    const data = line.startsWith('data: ') ? line.slice(6) : line.slice(5);

                    if (currentEvent === 'content' || currentEvent === 'message') {
                        fullContent += data;
                        if (handlers.onContent) {
                            handlers.onContent(data, fullContent);
                        }
                    } else if (currentEvent === 'status' && handlers.onStatus) {
                        handlers.onStatus(data.trim());
                    } else if (currentEvent === 'sources' && handlers.onSources) {
                        try {
                            handlers.onSources(JSON.parse(data));
                        } catch (e) {
                            console.error('Failed to parse sources:', e);
                        }
                    } else if (currentEvent === 'done') {
                        if (handlers.onDone) handlers.onDone(normalizeText(fullContent));
                        return normalizeText(fullContent);
                    } else if (currentEvent === 'error') {
                        const err = new Error(data || 'Unknown error');
                        if (handlers.onError) handlers.onError(err);
                        throw err;
                    }

                    currentEvent = 'content'; // Reset after processing data
                }
            }
        }

        // Stream ended
        const normalized = normalizeText(fullContent);
        if (handlers.onDone) handlers.onDone(normalized);
        return normalized;
    } catch (err) {
        if (handlers.onError) handlers.onError(err);
        throw err;
    }
}

export { normalizeText, readSSEStream, parseSSEEvent, streamSSEContent };
