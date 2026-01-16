/**
 * Tests for FetchResultNode protocol metadata handling.
 *
 * Guards against regression where metadata.content_type wasn't read correctly
 * for determining node rendering (YouTube video embed vs markdown).
 */

import { test, assertTrue, assertEqual, FetchResultNode } from './test_setup.js';

// Mock canvas for testing
const mockCanvas = {
    renderMarkdown: (content) => `<div class="markdown">${content}</div>`,
};

// ============================================================================
// Tests for FetchResultNode metadata reading
// ============================================================================

test('FetchResultNode renders YouTube video when metadata.content_type is youtube', () => {
    const node = {
        id: 'youtube-node',
        type: 'fetch_result',
        content: 'Transcript text here...',
        metadata: {
            content_type: 'youtube',
            video_id: 'dQw4w9WgXcQ',
        },
    };

    const protocol = new FetchResultNode(node);
    const content = protocol.renderContent(mockCanvas);

    // Should render YouTube embed iframe
    assertTrue(
        content.includes('youtube.com/embed/dQw4w9WgXcQ'),
        'Should render YouTube embed with video ID from metadata'
    );
    assertTrue(content.includes('iframe'), 'Should render as iframe');
});

test('FetchResultNode falls back to youtubeVideoId for backward compatibility', () => {
    // Old format node without metadata
    const node = {
        id: 'old-youtube-node',
        type: 'fetch_result',
        content: 'Transcript...',
        youtubeVideoId: 'oldFormat123',
        // No metadata field
    };

    const protocol = new FetchResultNode(node);
    const content = protocol.renderContent(mockCanvas);

    // Should still render YouTube embed using legacy youtubeVideoId
    assertTrue(
        content.includes('youtube.com/embed/oldFormat123'),
        'Should fall back to youtubeVideoId property'
    );
});

test('FetchResultNode renders markdown for non-YouTube content', () => {
    const node = {
        id: 'html-node',
        type: 'fetch_result',
        content: '# Fetched HTML content',
        metadata: {
            content_type: 'html',
        },
    };

    const protocol = new FetchResultNode(node);
    const content = protocol.renderContent(mockCanvas);

    // Should render markdown, not iframe
    assertTrue(content.includes('markdown'), 'Should render as markdown');
    assertTrue(!content.includes('iframe'), 'Should not render iframe');
});

test('FetchResultNode renders markdown when metadata is missing', () => {
    const node = {
        id: 'no-metadata-node',
        type: 'fetch_result',
        content: '# Some content',
        // No metadata
    };

    const protocol = new FetchResultNode(node);
    const content = protocol.renderContent(mockCanvas);

    // Should render markdown as fallback
    assertTrue(content.includes('markdown'), 'Should render as markdown when no metadata');
});

test('FetchResultNode hasOutput returns true for YouTube videos', () => {
    const node = {
        id: 'youtube-with-output',
        type: 'fetch_result',
        content: 'Transcript...',
        metadata: {
            content_type: 'youtube',
            video_id: 'abc123',
        },
    };

    const protocol = new FetchResultNode(node);

    assertTrue(protocol.hasOutput(), 'YouTube videos should have output (transcript drawer)');
});

test('FetchResultNode hasOutput returns false for non-YouTube', () => {
    const node = {
        id: 'html-no-output',
        type: 'fetch_result',
        content: 'HTML content',
        metadata: {
            content_type: 'html',
        },
    };

    const protocol = new FetchResultNode(node);

    assertTrue(!protocol.hasOutput(), 'Non-YouTube content should not have output panel');
});

test('FetchResultNode getTypeLabel returns correct label for content types', () => {
    const youtubeNode = {
        id: 'yt',
        type: 'fetch_result',
        content: '',
        metadata: { content_type: 'youtube' },
    };

    const pdfNode = {
        id: 'pdf',
        type: 'fetch_result',
        content: '',
        metadata: { content_type: 'pdf' },
    };

    const gitNode = {
        id: 'git',
        type: 'fetch_result',
        content: '',
        metadata: { content_type: 'git' },
    };

    const defaultNode = {
        id: 'default',
        type: 'fetch_result',
        content: '',
    };

    assertEqual(new FetchResultNode(youtubeNode).getTypeLabel(), 'YouTube Video');
    assertEqual(new FetchResultNode(pdfNode).getTypeLabel(), 'PDF');
    assertEqual(new FetchResultNode(gitNode).getTypeLabel(), 'Git Repository');
    assertEqual(new FetchResultNode(defaultNode).getTypeLabel(), 'Fetched');
});

test('FetchResultNode getTypeIcon returns correct icon for content types', () => {
    const youtubeNode = {
        id: 'yt',
        type: 'fetch_result',
        content: '',
        metadata: { content_type: 'youtube' },
    };

    const pdfNode = {
        id: 'pdf',
        type: 'fetch_result',
        content: '',
        metadata: { content_type: 'pdf' },
    };

    assertEqual(new FetchResultNode(youtubeNode).getTypeIcon(), '▶️');
    assertEqual(new FetchResultNode(pdfNode).getTypeIcon(), '📑');
});

// Tests are automatically collected by the test runner
