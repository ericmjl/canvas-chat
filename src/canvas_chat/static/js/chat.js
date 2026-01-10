/**
 * Chat module - LLM communication with SSE streaming
 */

import { storage } from './storage.js';
import { apiUrl } from './utils.js';
import { readSSEStream, normalizeText } from './sse.js';

// =============================================================================
// Type Definitions (JSDoc)
// =============================================================================

/**
 * Chat message role
 * @typedef {'user'|'assistant'|'system'} MessageRole
 */

/**
 * Chat message for LLM API
 * @typedef {Object} ChatMessage
 * @property {MessageRole} role - Message role
 * @property {string|Array} content - Text content or multimodal content array
 * @property {string} [nodeId] - Source node ID (internal use)
 * @property {string} [imageData] - Base64 image data (for image messages)
 * @property {string} [mimeType] - Image MIME type (for image messages)
 */

/**
 * LLM request body sent to /api/chat
 * @typedef {Object} LLMRequest
 * @property {ChatMessage[]} messages - Conversation messages
 * @property {string} model - Model ID (e.g., "openai/gpt-4o")
 * @property {string} api_key - API key for the provider
 * @property {number} [temperature] - Sampling temperature (0-2)
 * @property {string} [base_url] - Custom API base URL
 */

/**
 * Model info from /api/models
 * @typedef {Object} ModelInfo
 * @property {string} id - Model ID (e.g., "openai/gpt-4o")
 * @property {string} name - Display name
 * @property {string} provider - Provider name
 * @property {number} context_window - Context window size in tokens
 * @property {string} [base_url] - Per-model base URL (for custom models)
 */

/**
 * Callback for streaming chunks
 * @callback OnChunkCallback
 * @param {string} chunk - New text chunk
 * @param {string} fullContent - Accumulated content so far
 */

/**
 * Callback for stream completion
 * @callback OnDoneCallback
 * @param {string} fullContent - Complete response content
 */

/**
 * Callback for stream errors
 * @callback OnErrorCallback
 * @param {Error} error - Error object
 */

// =============================================================================
// Chat Class
// =============================================================================

class Chat {
    constructor() {
        this.currentModel = null;
        this.models = [];
    }

    /**
     * Fetch available models from the server
     */
    async fetchModels() {
        try {
            const response = await fetch(apiUrl('/api/models'));
            if (response.ok) {
                this.models = await response.json();
                return this.models;
            }
        } catch (err) {
            console.error('Failed to fetch models:', err);
        }
        return [];
    }

    /**
     * Fetch models available for a specific provider using an API key
     * @param {string} provider - Provider name (openai, anthropic, google, groq, github)
     * @param {string} apiKey - The API key for the provider
     * @returns {Promise<Array>} - List of available models
     */
    async fetchProviderModels(provider, apiKey) {
        try {
            const response = await fetch(apiUrl('/api/provider-models'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, api_key: apiKey }),
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (err) {
            console.error(`Failed to fetch ${provider} models:`, err);
        }
        return [];
    }

    /**
     * Get API key for the current model's provider
     */
    getApiKeyForModel(model) {
        const provider = model.split('/')[0].toLowerCase();
        return storage.getApiKeyForProvider(provider);
    }

    /**
     * Get the custom base URL if configured
     */
    getBaseUrl() {
        return storage.getBaseUrl();
    }

    /**
     * Get base URL for a specific model.
     * Custom models may have per-model base URLs that override the global setting.
     * @param {string} modelId - The model ID
     * @returns {string|null} - Base URL to use, or null if none configured
     */
    getBaseUrlForModel(modelId) {
        return storage.getBaseUrlForModel(modelId);
    }

    /**
     * Get context window size for a model
     */
    getContextWindow(modelId) {
        const model = this.models.find((m) => m.id === modelId);
        return model?.context_window || 128000; // Default to 128k
    }

    /**
     * Send a chat message and stream the response
     * @param {Array} messages - Array of {role, content} messages
     * @param {string} model - Model ID
     * @param {Function} onChunk - Callback for each chunk
     * @param {Function} onDone - Callback when complete
     * @param {Function} onError - Callback on error
     * @returns {AbortController} - Controller to abort the request
     */
    async sendMessage(messages, model, onChunk, onDone, onError) {
        const abortController = new AbortController();

        const apiKey = this.getApiKeyForModel(model);
        const baseUrl = this.getBaseUrl();

        try {
            const requestBody = {
                messages,
                model,
                api_key: apiKey,
                temperature: 0.7,
            };

            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }

            const response = await fetch(apiUrl('/api/chat'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            let fullContent = '';

            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'message' && data) {
                        fullContent += data;
                        onChunk(data, fullContent);
                    }
                },
                onDone: () => {
                    onDone(fullContent);
                },
                onError: (err) => {
                    throw err;
                },
            });
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Request aborted');
                return;
            }

            console.error('Chat error:', err);
            onError(err);
        }

        return abortController;
    }

    /**
     * Send a chat message and get a non-streaming response
     * Useful for structured outputs like JSON parsing
     * @param {Array} messages - Array of {role, content} messages
     * @param {string} model - Model ID
     * @param {string} [apiKeyOverride] - Optional API key override (otherwise uses stored key)
     * @returns {Promise<string>} - The full response content
     */
    async sendMessageNonStreaming(messages, model, apiKeyOverride = null) {
        const apiKey = apiKeyOverride || this.getApiKeyForModel(model);
        const baseUrl = this.getBaseUrl();

        const requestBody = {
            messages,
            model,
            api_key: apiKey,
            temperature: 0.3, // Lower temperature for structured outputs
        };

        if (baseUrl) {
            requestBody.base_url = baseUrl;
        }

        const response = await fetch(apiUrl('/api/chat'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error: ${response.status}`);
        }

        // Collect full response from SSE stream
        let fullContent = '';

        await readSSEStream(response, {
            onEvent: (eventType, data) => {
                if (eventType === 'message' && data) {
                    fullContent += data;
                }
            },
            onDone: () => {},
            onError: (err) => {
                throw err;
            },
        });

        return normalizeText(fullContent);
    }

    /**
     * Summarize a branch of conversation
     */
    async summarize(messages, model) {
        const apiKey = this.getApiKeyForModel(model);
        const baseUrl = this.getBaseUrl();

        try {
            const requestBody = {
                messages,
                model,
                api_key: apiKey,
            };

            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }

            const response = await fetch(apiUrl('/api/summarize'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Summarization failed');
            }

            const data = await response.json();
            return data.summary;
        } catch (err) {
            console.error('Summarize error:', err);
            throw err;
        }
    }

    /**
     * Estimate tokens for a piece of text
     */
    async estimateTokens(text, model) {
        try {
            const response = await fetch(
                `/api/token-count?text=${encodeURIComponent(text)}&model=${encodeURIComponent(model)}`
            );
            if (response.ok) {
                const data = await response.json();
                return data.tokens;
            }
        } catch (err) {
            console.error('Token estimation error:', err);
        }
        // Fallback: rough estimate
        return Math.ceil(text.length / 4);
    }
}

// Export class and singleton instance
const chat = new Chat();

export { Chat, chat };
