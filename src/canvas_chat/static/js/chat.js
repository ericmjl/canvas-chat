/**
 * Chat module - LLM communication with SSE streaming
 */

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
            const response = await fetch('/api/models');
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
            const response = await fetch('/api/provider-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, api_key: apiKey })
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
        const model = this.models.find(m => m.id === modelId);
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

            const response = await fetch('/api/chat', {
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

            await SSE.readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'message' && data) {
                        fullContent += data;
                        onChunk(data, fullContent);
                    }
                },
                onDone: () => {
                    onDone(SSE.normalizeText(fullContent));
                },
                onError: (err) => {
                    throw err;
                }
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

        const response = await fetch('/api/chat', {
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

        await SSE.readSSEStream(response, {
            onEvent: (eventType, data) => {
                if (eventType === 'message' && data) {
                    fullContent += data;
                }
            },
            onDone: () => {},
            onError: (err) => {
                throw err;
            }
        });

        return SSE.normalizeText(fullContent);
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

            const response = await fetch('/api/summarize', {
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
            const response = await fetch(`/api/token-count?text=${encodeURIComponent(text)}&model=${encodeURIComponent(model)}`);
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

// Export singleton
const chat = new Chat();

// CommonJS export for Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Chat, chat };
}
