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

/**
 * Chat class for LLM communication with SSE streaming
 * @class
 */
class Chat {
    /**
     *
     */
    constructor() {
        this.currentModel = null;
        this.models = [];
    }

    /**
     * Fetch available models from the server
     * @returns {Promise<Array<ModelInfo>>} List of available models
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
     * @returns {Promise<Array<ModelInfo>>} List of available models
     */
    async fetchProviderModels(provider, apiKey) {
        try {
            const payload = { provider };
            if (provider !== 'github_copilot') {
                payload.api_key = apiKey;
            }
            const response = await fetch(apiUrl('/api/provider-models'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
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
     * @param {string} model - Model ID (e.g., "openai/gpt-4o")
     * @returns {string|null} API key or null if not found
     */
    getApiKeyForModel(model) {
        if (!model) return null;

        if (model.startsWith('dall-e')) {
            return storage.getApiKeyForProvider('openai');
        }

        const provider = model.split('/')[0].toLowerCase();
        return storage.getApiKeyForProvider(provider);
    }

    /**
     * Get the custom base URL if configured
     * @returns {string|null} Base URL or null if not configured
     */
    getBaseUrl() {
        return storage.getBaseUrl();
    }

    /**
     * Get base URL for a specific model.
     * Custom models may have per-model base URLs that override the global setting.
     * @param {string} modelId - The model ID
     * @returns {string|null} Base URL to use, or null if none configured
     */
    getBaseUrlForModel(modelId) {
        return storage.getBaseUrlForModel(modelId);
    }

    /**
     * Ensure GitHub Copilot authentication is fresh
     * @param {string} model - Model ID
     * @returns {Promise<string|null>} API key or null
     */
    async ensureCopilotAuthFresh(model) {
        if (!model?.startsWith('github_copilot/')) {
            return this.getApiKeyForModel(model);
        }

        const auth = storage.getCopilotAuth();
        if (!auth?.accessToken) {
            return this.getApiKeyForModel(model);
        }

        const now = Math.floor(Date.now() / 1000);
        const expiresAt = auth.expiresAt || 0;
        const shouldRefresh = !auth.apiKey || (expiresAt > 0 && expiresAt - now <= 120);
        if (!shouldRefresh) {
            return auth.apiKey;
        }

        try {
            const response = await fetch(apiUrl('/api/github-copilot/auth/refresh'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: auth.accessToken }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to refresh Copilot token');
            }
            const data = await response.json();
            storage.saveCopilotAuth({
                accessToken: auth.accessToken,
                apiKey: data.api_key,
                expiresAt: data.expires_at,
            });
            return data.api_key;
        } catch (err) {
            console.error('Copilot auto-refresh failed:', err);
            if (storage.isCopilotAuthExpired()) {
                storage.clearCopilotAuth();
                this.notifyCopilotAuthRequired('Your Copilot session expired. Please re-authenticate to continue.');
                return null;
            }
            return auth.apiKey || null;
        }
    }

    /**
     * Notify that Copilot authentication is required
     * @param {string} message - Error message
     */
    notifyCopilotAuthRequired(message) {
        window.dispatchEvent(
            new CustomEvent('copilot-auth-required', {
                detail: { message },
            })
        );
    }

    /**
     * Handle Copilot authentication errors
     * @param {Error} err - Error object
     * @returns {Error} Processed error
     */
    handleCopilotAuthError(err) {
        if (!err?.message) {
            return err;
        }
        const marker = 'COPILOT_AUTH_REQUIRED';
        if (!err.message.includes(marker)) {
            return err;
        }
        const cleaned = err.message.replace(marker, '').replace(':', '').trim();
        this.notifyCopilotAuthRequired(cleaned || 'GitHub Copilot authentication required.');
        return new Error(cleaned || 'GitHub Copilot authentication required.');
    }

    /**
     * Get context window size for a model
     * @param {string} modelId - Model ID
     * @returns {number} Context window size in tokens
     */
    getContextWindow(modelId) {
        const model = this.models.find((m) => m.id === modelId);
        return model?.context_window || 128000; // Default to 128k
    }

    /**
     * Send a chat message and stream the response
     * @param {Array<ChatMessage>} messages - Array of {role, content} messages
     * @param {string} model - Model ID (e.g., "openai/gpt-4o")
     * @param {OnChunkCallback|null} onChunk - Callback for each chunk, or null
     * @param {OnDoneCallback} onDone - Callback when complete
     * @param {OnErrorCallback} onError - Callback on error
     * @param {AbortController} [abortController] - Optional abort controller
     * @returns {Promise<string>} Normalized full response content
     */
    async sendMessage(messages, model, onChunk, onDone, onError, abortController = null) {
        if (!abortController) {
            abortController = new AbortController();
        }

        const apiKey = await this.ensureCopilotAuthFresh(model);
        const baseUrl = this.getBaseUrl();

        const requestBody = {
            messages,
            model,
            api_key: apiKey,
            temperature: 0.3,
        };

        if (baseUrl) {
            requestBody.base_url = baseUrl;
        }

        try {
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

            let fullContent = '';

            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'message' && data) {
                        fullContent += data;
                        if (onChunk) {
                            onChunk(data, fullContent);
                        }
                    }
                },
                onDone: () => {
                    if (onDone) {
                        onDone(normalizeText(fullContent));
                    }
                },
                onError: (err) => {
                    if (onError) {
                        onError(err);
                    }
                    throw err;
                },
            });

            const normalized = normalizeText(fullContent);
            return normalized;
        } catch (err) {
            const handledError = this.handleCopilotAuthError(err);
            console.error('Chat error:', handledError);
            if (onError) {
                onError(handledError);
            }
            throw handledError;
        }
    }

    /**
     * Summarize a branch of conversation
     * @param {Array<ChatMessage>} messages - Conversation messages
     * @param {string} model - Model ID
     * @returns {Promise<string>} Summary text
     */
    async summarize(messages, model) {
        const apiKey = await this.ensureCopilotAuthFresh(model);
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
            const handledError = this.handleCopilotAuthError(err);
            console.error('Summarize error:', handledError);
            throw handledError;
        }
    }

    /**
     * Estimate tokens for a piece of text
     * @param {string} text - Text to estimate
     * @param {string} model - Model ID
     * @returns {Promise<number>} Estimated token count
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
