/**
 * Chat module - LLM communication with SSE streaming
 */

class Chat {
    constructor() {
        this.currentModel = null;
        this.models = [];
        this.isStreaming = false;
        this.abortController = null;
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
     * Get API key for the current model's provider
     */
    getApiKeyForModel(model) {
        const provider = model.split('/')[0].toLowerCase();
        return storage.getApiKeyForProvider(provider);
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
     */
    async sendMessage(messages, model, onChunk, onDone, onError) {
        if (this.isStreaming) {
            this.abort();
        }

        this.isStreaming = true;
        this.abortController = new AbortController();

        const apiKey = this.getApiKeyForModel(model);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages,
                    model,
                    api_key: apiKey,
                    temperature: 0.7,
                }),
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                
                // Normalize CRLF to LF before parsing (SSE uses CRLF per HTTP spec)
                buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                
                // Process SSE events
                // SSE format: events are separated by double newlines
                // Each event can have multiple "data:" lines (for content with newlines)
                const events = buffer.split('\n\n');
                buffer = events.pop() || ''; // Keep incomplete event in buffer

                for (const event of events) {
                    if (!event.trim()) continue;
                    
                    const lines = event.split('\n');
                    let eventType = 'message';
                    let dataLines = [];
                    
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.slice(7).trim();
                        } else if (line.startsWith('data: ')) {
                            dataLines.push(line.slice(6));
                        } else if (line.startsWith('data:')) {
                            // Handle "data:" with no space (empty line)
                            dataLines.push(line.slice(5));
                        }
                    }
                    
                    // Join data lines with newlines (SSE spec)
                    const data = dataLines.join('\n').replace(/\r$/gm, '');
                    
                    if (eventType === 'done') {
                        // Stream complete
                        break;
                    } else if (eventType === 'error') {
                        throw new Error(data || 'Unknown error');
                    } else if (eventType === 'message' && data) {
                        fullContent += data;
                        onChunk(data, fullContent);
                    }
                }
            }

            this.isStreaming = false;
            onDone(fullContent);

        } catch (err) {
            this.isStreaming = false;
            
            if (err.name === 'AbortError') {
                console.log('Request aborted');
                return;
            }
            
            console.error('Chat error:', err);
            onError(err);
        }
    }

    /**
     * Summarize a branch of conversation
     */
    async summarize(messages, model) {
        const apiKey = this.getApiKeyForModel(model);

        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages,
                    model,
                    api_key: apiKey,
                }),
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

    /**
     * Abort current streaming request
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isStreaming = false;
    }
}

// Export singleton
const chat = new Chat();
