/**
 * Utility functions shared across the application.
 * Pure functions with no side effects, extracted from app.js.
 */

import { NodeType } from './graph-types.js';

// =============================================================================
// URL Detection and Extraction
// =============================================================================

/**
 * Get the base path from the current URL.
 * Detects the base path when deployed behind a load balancer or reverse proxy.
 * @returns {string} The base path (always ends with /, or empty string for root)
 */
function getBasePath() {
    // Get the current pathname
    const pathname = window.location.pathname;

    // If we're at the root, return empty string (no base path)
    if (pathname === '/' || pathname === '') {
        return '';
    }

    // If pathname ends with /, that's the base path
    if (pathname.endsWith('/')) {
        return pathname;
    }

    // Otherwise, remove the last segment (filename) and add /
    // For example: /thing/stuff/before/it -> /thing/stuff/before/it/
    // Or: /thing/stuff/before/it/index.html -> /thing/stuff/before/it/
    const basePath = pathname.replace(/\/[^/]*$/, '');
    return basePath + '/';
}

/**
 * Get the full API URL for an endpoint.
 * Prepends the base path to support deployment behind load balancers.
 * @param {string} endpoint - The API endpoint (e.g., '/api/chat' or 'api/chat')
 * @returns {string} The full API URL with base path (always starts with /)
 */
function apiUrl(endpoint) {
    // Normalize endpoint: remove leading / if present
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

    // Get base path
    const basePath = getBasePath();

    // Combine: basePath already ends with / or is empty
    // Result should always start with /
    if (basePath === '') {
        return '/' + normalizedEndpoint;
    }
    return basePath + normalizedEndpoint;
}

/**
 * Detect if content is a URL (used by handleNote to route to handleNoteFromUrl)
 * @param {string} content - The content to check
 * @returns {boolean} True if content is a URL
 */
function isUrlContent(content) {
    const urlPattern = /^https?:\/\/[^\s]+$/;
    return urlPattern.test(content.trim());
}

/**
 * Extract URL from Reference node content (format: **[Title](url)**)
 * @param {string} content - The node content
 * @returns {string|null} The URL or null if not found
 */
function extractUrlFromReferenceNode(content) {
    // Match markdown link pattern: [text](url)
    const match = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (match && match[2]) {
        return match[2];
    }
    return null;
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format a technical error into a user-friendly message
 * @param {Error|string} error - The error to format
 * @returns {{ title: string, description: string, canRetry: boolean }}
 */
function formatUserError(error) {
    const errMsg = error?.message || String(error);
    const errLower = errMsg.toLowerCase();

    // Timeout errors
    if (errLower.includes('timeout') || errLower.includes('etimedout') || errLower.includes('took too long')) {
        return {
            title: 'Request timed out',
            description: 'The server is taking too long to respond. This may be due to high load.',
            canRetry: true,
        };
    }

    // Authentication errors
    if (errLower.includes('401') || errLower.includes('unauthorized') || errLower.includes('invalid api key')) {
        return {
            title: 'Authentication failed',
            description: 'Your API key may be invalid or expired. Please check your settings.',
            canRetry: false,
        };
    }

    // Rate limit errors
    if (errLower.includes('429') || errLower.includes('rate limit') || errLower.includes('too many requests')) {
        return {
            title: 'Rate limit reached',
            description: 'Too many requests. Please wait a moment before trying again.',
            canRetry: true,
        };
    }

    // Server errors
    if (
        errLower.includes('500') ||
        errLower.includes('502') ||
        errLower.includes('503') ||
        errLower.includes('server error')
    ) {
        return {
            title: 'Server error',
            description: 'The server encountered an error. Please try again later.',
            canRetry: true,
        };
    }

    // Network errors
    if (errLower.includes('failed to fetch') || errLower.includes('network') || errLower.includes('connection')) {
        return {
            title: 'Network error',
            description: 'Could not connect to the server. Please check your internet connection.',
            canRetry: true,
        };
    }

    // Context length errors
    if (errLower.includes('context length') || errLower.includes('too long') || errLower.includes('maximum context')) {
        return {
            title: 'Message too long',
            description: 'The conversation is too long for this model. Try selecting fewer nodes.',
            canRetry: false,
        };
    }

    // Default error
    return {
        title: 'Something went wrong',
        description: errMsg || 'An unexpected error occurred. Please try again.',
        canRetry: true,
    };
}

// =============================================================================
// Text Utilities
// =============================================================================

/**
 * Truncate text to a maximum length
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text with ellipsis
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
}

/**
 * Escape HTML special characters
 * @param {string} text - The text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtmlText(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// Matrix Formatting
// =============================================================================

/**
 * Format a matrix node as a markdown table
 * @param {Object} matrixNode - The matrix node
 * @returns {string} Markdown table representation
 */
function formatMatrixAsText(matrixNode) {
    const { context, rowItems, colItems, cells } = matrixNode;

    let text = `## ${context}\n\n`;

    // Header row
    text += '| |';
    for (const colItem of colItems) {
        text += ` ${colItem} |`;
    }
    text += '\n';

    // Separator row
    text += '|---|';
    for (let c = 0; c < colItems.length; c++) {
        text += '---|';
    }
    text += '\n';

    // Data rows
    for (let r = 0; r < rowItems.length; r++) {
        text += `| ${rowItems[r]} |`;
        for (let c = 0; c < colItems.length; c++) {
            const cellKey = `${r}-${c}`;
            const cell = cells[cellKey];
            const content = cell && cell.content ? cell.content.replace(/\n/g, ' ').replace(/\|/g, '\\|') : '';
            text += ` ${content} |`;
        }
        text += '\n';
    }

    return text;
}

// =============================================================================
// LLM Message Building
// =============================================================================

/**
 * Build messages for LLM API from resolved context.
 * Handles multimodal content (images + text).
 *
 * When a user sends a message with image nodes in context, the images
 * should be combined with the user's text into a single multimodal message.
 *
 * @param {Array} contextMessages - Messages from graph.resolveContext()
 * @returns {Array} - Messages formatted for the LLM API
 */
function buildMessagesForApi(contextMessages) {
    const result = [];
    let pendingImages = []; // Collect consecutive image messages

    for (let i = 0; i < contextMessages.length; i++) {
        const msg = contextMessages[i];

        if (msg.imageData) {
            // Collect image for potential merging
            pendingImages.push({
                type: 'image_url',
                image_url: {
                    url: `data:${msg.mimeType};base64,${msg.imageData}`,
                },
            });
        } else if (msg.content) {
            // Text message - check if we should merge with pending images
            if (pendingImages.length > 0 && msg.role === 'user') {
                // Merge images with this text message
                result.push({
                    role: 'user',
                    content: [...pendingImages, { type: 'text', text: msg.content }],
                });
                pendingImages = [];
            } else {
                // Flush any pending images as separate messages first
                for (const imgPart of pendingImages) {
                    result.push({
                        role: 'user',
                        content: [imgPart],
                    });
                }
                pendingImages = [];

                // Add text message
                result.push({
                    role: msg.role,
                    content: msg.content,
                });
            }
        }
    }

    // Flush any remaining pending images
    for (const imgPart of pendingImages) {
        result.push({
            role: 'user',
            content: [imgPart],
        });
    }

    return result;
}

// =============================================================================
// Spaced Repetition (SM-2 Algorithm)
// =============================================================================

/**
 * SM-2 Spaced Repetition Algorithm implementation.
 * quality: 0-2 = fail, 3 = hard, 4 = good, 5 = easy
 *
 * @param {Object} srs - Current SRS state {interval, easeFactor, repetitions, nextReviewDate, lastReviewDate}
 * @param {number} quality - Response quality (0-5)
 * @returns {Object} - New SRS state
 */
function applySM2(srs, quality) {
    const result = { ...srs };

    if (quality < 3) {
        // Failed: reset to beginning
        result.repetitions = 0;
        result.interval = 1;
    } else {
        // Passed: calculate new interval
        if (result.repetitions === 0) {
            result.interval = 1;
        } else if (result.repetitions === 1) {
            result.interval = 6;
        } else {
            result.interval = Math.round(result.interval * result.easeFactor);
        }

        // Update ease factor based on quality
        result.easeFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
        result.easeFactor = Math.max(1.3, result.easeFactor);
        result.repetitions++;
    }

    result.lastReviewDate = new Date().toISOString();
    result.nextReviewDate = new Date(Date.now() + result.interval * 86400000).toISOString();

    return result;
}

/**
 * Check if a flashcard is due for review.
 * A card is due if:
 * - It's a FLASHCARD node AND
 * - nextReviewDate is null (new card) OR
 * - nextReviewDate is in the past or now
 *
 * @param {Object} card - Node object
 * @returns {boolean} - Whether the card is due
 */
function isFlashcardDue(card) {
    if (card.type !== NodeType.FLASHCARD) return false;
    if (!card.srs || !card.srs.nextReviewDate) return true; // New card
    return new Date(card.srs.nextReviewDate) <= new Date();
}

/**
 * Filter an array of nodes to get only due flashcards.
 * Pure function for testing.
 *
 * @param {Array} nodes - Array of node objects
 * @returns {Array} - Array of flashcard nodes that are due for review
 */
function getDueFlashcards(nodes) {
    const now = Date.now();
    return nodes
        .filter((n) => n.type === NodeType.FLASHCARD)
        .filter((n) => !n.srs?.nextReviewDate || new Date(n.srs.nextReviewDate) <= now);
}

// =============================================================================
// Image Processing
// =============================================================================

/**
 * Resize an image file to max dimensions, returns base64 data URL.
 *
 * @param {File} file - The image file to resize
 * @param {number} maxDimension - Maximum width or height (default 2048)
 * @returns {Promise<string>} - The resized image as a data URL
 */
async function resizeImage(file, maxDimension = 2048) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            // Only resize if needed
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // JPEG for photos (smaller), PNG if original was PNG (transparency)
            const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const quality = outputType === 'image/jpeg' ? 0.85 : undefined;
            const dataUrl = canvas.toDataURL(outputType, quality);

            URL.revokeObjectURL(img.src); // Clean up
            resolve(dataUrl);
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };
        img.src = URL.createObjectURL(file);
    });
}

// =============================================================================
// Exports
// =============================================================================

export {
    getBasePath,
    apiUrl,
    isUrlContent,
    extractUrlFromReferenceNode,
    formatUserError,
    truncateText,
    escapeHtmlText,
    buildMessagesForApi,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    resizeImage,
};
