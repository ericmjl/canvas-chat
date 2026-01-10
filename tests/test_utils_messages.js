/**
 * Tests for buildMessagesForApi function.
 * Tests multimodal message building for LLM API.
 */

import {
    test,
    assertEqual,
    assertTrue,
    buildMessagesForApi
} from './test_setup.js';

// ============================================================
// buildMessagesForApi tests
// ============================================================

test('buildMessagesForApi: simple text messages', () => {
    const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 2);
    assertEqual(result[0].role, 'user');
    assertEqual(result[0].content, 'Hello');
    assertEqual(result[1].role, 'assistant');
    assertEqual(result[1].content, 'Hi there');
});

test('buildMessagesForApi: merges images with user text', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', content: 'What is this?' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 2);
    assertEqual(result[0].content[0].type, 'image_url');
    assertEqual(result[0].content[1].type, 'text');
    assertEqual(result[0].content[1].text, 'What is this?');
});

test('buildMessagesForApi: separates images from assistant messages', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'assistant', content: 'Response' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 2);
    assertEqual(result[0].role, 'user');
    assertEqual(result[1].role, 'assistant');
});

test('buildMessagesForApi: multiple images merge with user text', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'user', content: 'Analyze these' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    assertEqual(result[0].content.length, 3);
    assertEqual(result[0].content[0].type, 'image_url');
    assertEqual(result[0].content[1].type, 'image_url');
    assertEqual(result[0].content[2].type, 'text');
});

test('buildMessagesForApi: trailing images become separate messages', () => {
    const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', imageData: 'img1', mimeType: 'image/png' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 2);
    assertEqual(result[0].content, 'Hello');
    assertEqual(result[1].role, 'user');
    assertEqual(result[1].content[0].type, 'image_url');
});

// ============================================================
// buildMessagesForApi edge cases and complex scenarios
// ============================================================

test('buildMessagesForApi: images separated by assistant message become separate', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'assistant', content: 'This is an image' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'user', content: 'What about this one?' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 3);
    // First image should be separate (flushed before assistant message)
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 1);
    assertEqual(result[0].content[0].type, 'image_url');
    // Assistant message
    assertEqual(result[1].role, 'assistant');
    assertEqual(result[1].content, 'This is an image');
    // Second image merged with user text
    assertEqual(result[2].role, 'user');
    assertTrue(Array.isArray(result[2].content));
    assertEqual(result[2].content.length, 2);
    assertEqual(result[2].content[0].type, 'image_url');
    assertEqual(result[2].content[1].type, 'text');
});

test('buildMessagesForApi: images at start of context become separate if no user text follows', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'assistant', content: 'Response' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 3);
    // First image
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 1);
    // Second image
    assertEqual(result[1].role, 'user');
    assertTrue(Array.isArray(result[1].content));
    assertEqual(result[1].content.length, 1);
    // Assistant message
    assertEqual(result[2].role, 'assistant');
});

test('buildMessagesForApi: image-only context (no text messages)', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'user', imageData: 'img3', mimeType: 'image/png' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 3);
    // All images should be separate messages
    for (let i = 0; i < 3; i++) {
        assertEqual(result[i].role, 'user');
        assertTrue(Array.isArray(result[i].content));
        assertEqual(result[i].content.length, 1);
        assertEqual(result[i].content[0].type, 'image_url');
    }
});

test('buildMessagesForApi: empty content messages are skipped', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', content: '' },  // Empty content
        { role: 'user', content: 'What is this?' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    // Images should merge with the non-empty text
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 2);
    assertEqual(result[0].content[0].type, 'image_url');
    assertEqual(result[0].content[1].type, 'text');
    assertEqual(result[0].content[1].text, 'What is this?');
});

test('buildMessagesForApi: messages with neither content nor imageData are skipped', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user' },  // No content, no imageData
        { role: 'user', content: 'What is this?' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    // Images should merge with the text message
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 2);
});

test('buildMessagesForApi: very long text message with images', () => {
    const longText = 'A'.repeat(10000);  // Very long text
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'user', content: longText }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 3);
    assertEqual(result[0].content[0].type, 'image_url');
    assertEqual(result[0].content[1].type, 'image_url');
    assertEqual(result[0].content[2].type, 'text');
    assertEqual(result[0].content[2].text, longText);
});

test('buildMessagesForApi: multiple assistant messages between user images and text', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'assistant', content: 'First response' },
        { role: 'assistant', content: 'Second response' },
        { role: 'user', content: 'Follow-up question' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 4);
    // Image should be separate (flushed before assistant messages)
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    // Two assistant messages
    assertEqual(result[1].role, 'assistant');
    assertEqual(result[1].content, 'First response');
    assertEqual(result[2].role, 'assistant');
    assertEqual(result[2].content, 'Second response');
    // User text message
    assertEqual(result[3].role, 'user');
    assertEqual(result[3].content, 'Follow-up question');
});

test('buildMessagesForApi: images with different MIME types', () => {
    const messages = [
        { role: 'user', imageData: 'pngdata', mimeType: 'image/png' },
        { role: 'user', imageData: 'jpegdata', mimeType: 'image/jpeg' },
        { role: 'user', imageData: 'webpdata', mimeType: 'image/webp' },
        { role: 'user', content: 'Analyze these images' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    assertEqual(result[0].content.length, 4);
    // Check MIME types are preserved in data URLs
    assertTrue(result[0].content[0].image_url.url.includes('image/png'));
    assertTrue(result[0].content[1].image_url.url.includes('image/jpeg'));
    assertTrue(result[0].content[2].image_url.url.includes('image/webp'));
    assertEqual(result[0].content[3].type, 'text');
});

test('buildMessagesForApi: complex conversation with mixed content', () => {
    const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'user', content: 'What do you see?' },
        { role: 'assistant', content: 'I see two images' },
        { role: 'user', imageData: 'img3', mimeType: 'image/png' },
        { role: 'assistant', content: 'Another image' },
        { role: 'user', content: 'Yes' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 7);
    // First user text
    assertEqual(result[0].role, 'user');
    assertEqual(result[0].content, 'Hello');
    // First assistant
    assertEqual(result[1].role, 'assistant');
    assertEqual(result[1].content, 'Hi there!');
    // Images merged with user text
    assertEqual(result[2].role, 'user');
    assertTrue(Array.isArray(result[2].content));
    assertEqual(result[2].content.length, 3);
    // Second assistant
    assertEqual(result[3].role, 'assistant');
    assertEqual(result[3].content, 'I see two images');
    // Third image (separate, flushed before assistant)
    assertEqual(result[4].role, 'user');
    assertTrue(Array.isArray(result[4].content));
    assertEqual(result[4].content.length, 1);
    // Third assistant
    assertEqual(result[5].role, 'assistant');
    assertEqual(result[5].content, 'Another image');
    // Final user text
    assertEqual(result[6].role, 'user');
    assertEqual(result[6].content, 'Yes');
});

test('buildMessagesForApi: empty messages array returns empty array', () => {
    const messages = [];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 0);
    assertTrue(Array.isArray(result));
});

test('buildMessagesForApi: preserves image data URL format', () => {
    const messages = [
        { role: 'user', imageData: 'base64data123', mimeType: 'image/png' },
        { role: 'user', content: 'Test' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 1);
    const imageUrl = result[0].content[0].image_url.url;
    assertTrue(imageUrl.startsWith('data:image/png;base64,'));
    assertTrue(imageUrl.includes('base64data123'));
});

test('buildMessagesForApi: user text followed by images then more user text', () => {
    const messages = [
        { role: 'user', content: 'First question' },
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'user', content: 'Second question' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 2);
    // First text message
    assertEqual(result[0].role, 'user');
    assertEqual(result[0].content, 'First question');
    // Images merged with second text
    assertEqual(result[1].role, 'user');
    assertTrue(Array.isArray(result[1].content));
    assertEqual(result[1].content.length, 2);
    assertEqual(result[1].content[0].type, 'image_url');
    assertEqual(result[1].content[1].type, 'text');
    assertEqual(result[1].content[1].text, 'Second question');
});

test('buildMessagesForApi: assistant message with content between user images', () => {
    const messages = [
        { role: 'user', imageData: 'img1', mimeType: 'image/png' },
        { role: 'assistant', content: 'I see an image' },
        { role: 'user', imageData: 'img2', mimeType: 'image/jpeg' },
        { role: 'user', content: 'What about this?' }
    ];
    const result = buildMessagesForApi(messages);
    assertEqual(result.length, 3);
    // First image (flushed before assistant)
    assertEqual(result[0].role, 'user');
    assertTrue(Array.isArray(result[0].content));
    // Assistant
    assertEqual(result[1].role, 'assistant');
    assertEqual(result[1].content, 'I see an image');
    // Second image merged with user text
    assertEqual(result[2].role, 'user');
    assertTrue(Array.isArray(result[2].content));
    assertEqual(result[2].content.length, 2);
});
