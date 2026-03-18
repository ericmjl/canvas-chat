# Chat Module: LLM Communication

**Created**: 2026-03-16
**Status**: Design Phase
**Component**: Frontend JavaScript Module

## Context and Design Philosophy

The Chat module serves as the primary interface between Canvas-Chat and Large Language Model providers. Its existence is fundamental to the application's core purpose: enabling users to have conversations with AI models that are then visualized as nodes on a graph canvas.

### Why a Dedicated Chat Module?

The HLD establishes that Canvas-Chat is fundamentally a chat application with a visual second. The Chat module embodies this philosophy by providing:

1. **Streaming-First Experience**: LLM responses appear token-by-token as they're generated, giving users immediate feedback and reducing perceived latency.

2. **Provider Agnosticism**: Users can switch between OpenAI, Anthropic, Google, GitHub Copilot, and custom endpoints without changing their workflow. The Chat module abstracts these differences.

3. **Local-First Key Management**: API keys never leave the browser (except when sent directly to providers). The module retrieves keys from localStorage and includes them in requests, ensuring no server-side key storage is required.

4. **Graceful Error Handling**: LLM APIs can fail for many reasons (auth expiry, rate limits, network issues). The Chat module provides consistent error handling with user-friendly messages and retry capabilities.

## Technical Details

### Architecture Overview

The Chat module consists of three key files:

| File      | Purpose                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `chat.js` | Main Chat class - provider abstraction, model fetching, message sending         |
| `sse.js`  | SSE parsing utilities - stream reading, text normalization                      |
| `app.js`  | Integration layer - orchestrates chat with graph, canvas, and streaming manager |

The flow from user input to streamed response:

```text
User types message
    ↓
App.handleSend() - creates human node
    ↓
App.resolveContext() - builds conversation context from graph
    ↓
App.streamWithAbort() - sends request and handles streaming
    ↓
Chat class (via buildLLMRequest) - builds request body with credentials
    ↓
Backend /api/chat - proxies to LiteLLM
    ↓
SSE stream → readSSEStream → onChunk callbacks
    ↓
Canvas updates node content in real-time
```

### Server-Sent Events (SSE) Streaming

The streaming implementation uses the browser's Fetch API with a ReadableStream to process SSE events incrementally.

#### Frontend SSE Handling

The `readSSEStream` function in `sse.js` handles the SSE protocol:

```javascript
async function readSSEStream(response, handlers) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer

        for (const event of events) {
            const parsed = parseSSEEvent(event);
            if (parsed.eventType === 'message' && parsed.data) {
                handlers.onEvent('message', parsed.data);
            } else if (parsed.eventType === 'done') {
                handlers.onDone();
                return;
            } else if (parsed.eventType === 'error') {
                handlers.onError(new Error(parsed.data));
                return;
            }
        }
    }
}
```

#### Backend SSE Generation

The backend uses LiteLLM with async generation to stream responses:

```python
@app.post("/api/chat")
async def chat(request: ChatRequest, http_request: Request):
    async def generate():
        try:
            response = await litellm.acompletion(**kwargs)
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield {"event": "message", "data": content}
            yield {"event": "done", "data": ""}
        except litellm.AuthenticationError as e:
            yield {"event": "error", "data": f"Authentication failed: {e}"}
        # ... error handling

    return EventSourceResponse(generate())
```

#### Text Normalization

LLM tokenization can produce artifacts like spaces before punctuation. The `normalizeText` function addresses this:

```javascript
function normalizeText(text) {
    return text
        .replace(/ - /g, '-') // "matter - of" → "matter-of"
        .replace(/ +([.,!?;:)\]}])/g, '$1') // "hello ," → "hello,"
        .replace(/([[({]) +/g, '$1') // "( hello" → "(hello"
        .replace(/ +'/g, "'") // "don ' t" → "don't"
        .replace(/' +/g, "'") // "don 't" → "don't"
        .replace(/ {2,}/g, ' ') // multiple spaces → single
        .trim();
}
```

### Provider Abstraction

The Chat module uses a simple provider naming convention: `provider/model-id`. The provider is extracted from the model string and used to look up the appropriate API key.

#### Provider Detection

```javascript
getApiKeyForModel(model) {
    if (!model) return null;

    // DALL-E uses OpenAI keys despite different model prefix
    if (model.startsWith('dall-e')) {
        return storage.getApiKeyForProvider('openai');
    }

    const provider = model.split('/')[0].toLowerCase();
    return storage.getApiKeyForProvider(provider);
}
```

#### Supported Providers

| Provider       | Model Prefix      | Example Model                  |
| -------------- | ----------------- | ------------------------------ |
| OpenAI         | `openai/`         | `openai/gpt-4o`                |
| Anthropic      | `anthropic/`      | `anthropic/claude-sonnet-4-5`  |
| Google         | `google/`         | `google/gemini-1.5-pro`        |
| Groq           | `groq/`           | `groq/llama-3.1-70b-versatile` |
| GitHub Copilot | `github_copilot/` | `github_copilot/gpt-4o`        |
| Ollama         | (local)           | `ollama/llama3`                |

#### Custom Base URLs

For users with custom LLM endpoints (local models, proxies), the Chat module supports custom base URLs:

```javascript
getBaseUrl() {
    return storage.getBaseUrl();
}

getBaseUrlForModel(modelId) {
    return storage.getBaseUrlForModel(modelId);
}
```

### Message Format

Messages follow the OpenAI chat completion format with role-based messaging:

```javascript
/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'|'system'} role - Message role
 * @property {string|Array} content - Text content or multimodal content array
 * @property {string} [nodeId] - Source node ID (internal use)
 * @property {string} [imageData] - Base64 image data (for image messages)
 * @property {string} [mimeType] - Image MIME type (for image messages)
 */
```

#### Context Resolution

Before sending to the LLM, the App class resolves the conversation context from the graph. This involves:

1. **Finding relevant nodes**: Starting from the parent node, traverse the graph to build context
2. **Truncating if needed**: If context exceeds the model's context window, summarize or truncate
3. **Formatting**: Convert graph nodes to the message format

The `buildMessagesForApi` function (in app.js) handles this transformation. It walks the graph from the selected node back to roots, collecting messages in chronological order.

### Integration with App

The App class orchestrates chat functionality with the graph and canvas:

#### Sending a Message

```javascript
async handleSend() {
    const content = this.chatInput.value.trim();
    if (!content) return;

    // Try slash commands first
    if (await this.tryHandleSlashCommand(content, context)) {
        return;
    }

    // Create human node
    const humanNode = createNode(NodeType.HUMAN, content, { position });
    this.addUserNode(humanNode);

    // Create AI response node
    const aiNode = createNode(NodeType.AI, '', { position, model });
    this.addUserNode(aiNode);

    // Build context and stream
    const messages = buildMessagesForApi(this.graph.resolveContext([humanNode.id]));
    const abortController = new AbortController();

    this.streamWithAbort(aiNode.id, abortController, messages, model,
        // onChunk
        (chunk, fullContent) => {
            this.canvas.updateNodeContent(aiNode.id, fullContent, true);
            this.graph.updateNode(aiNode.id, { content: fullContent });
        },
        // onDone
        (fullContent) => {
            this.canvas.updateNodeContent(aiNode.id, fullContent, false);
            this.graph.updateNode(aiNode.id, { content: fullContent });
            this.saveSession();
        },
        // onError
        (err) => this.showNodeError(aiNode.id, formatUserError(err))
    );
}
```

#### Streaming with Abort

The `streamWithAbort` method combines request building, fetching, and SSE handling:

```javascript
async streamWithAbort(nodeId, abortController, messages, model,
                       onChunk, onDone, onError) {
    const requestBody = this.buildLLMRequest({
        messages,
        temperature: 0.7,
    });

    const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
    });

    await readSSEStream(response, {
        onEvent: (eventType, data) => {
            if (eventType === 'message' && data) {
                onChunk(data, fullContent + data);
            }
        },
        onDone: () => onDone(normalizeText(fullContent)),
        onError: (err) => onError(err),
    });
}
```

The AbortController enables stopping generation mid-stream. When the user clicks "Stop", the abort signal is triggered, causing the fetch to throw an AbortError which is caught and handled gracefully.

#### StreamingManager Integration

The StreamingManager tracks active streams and shows stop/continue controls:

```javascript
this.streamingManager.register(aiNode.id, {
    abortController,
    featureId: 'ai',
    context: { messages, model, humanNodeId },
    onContinue: async (nodeId, state) => {
        await this.continueAIResponse(nodeId, state.context);
    },
});
```

This design enables multiple simultaneous AI generations (one per node), each with its own stop control in the node header.

## API Reference

### Chat Class Methods

| Method                   | Signature                                                                         | Description                          |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------ |
| `fetchModels`            | `() => Promise<ModelInfo[]>`                                                      | Fetch available models from server   |
| `fetchProviderModels`    | `(provider: string, apiKey: string) => Promise<ModelInfo[]>`                      | Fetch models for a specific provider |
| `getApiKeyForModel`      | `(model: string) => string \| null`                                               | Get API key for a model's provider   |
| `getBaseUrl`             | `() => string \| null`                                                            | Get custom base URL if configured    |
| `getBaseUrlForModel`     | `(modelId: string) => string \| null`                                             | Get per-model base URL override      |
| `ensureCopilotAuthFresh` | `(model: string) => Promise<string \| null>`                                      | Refresh Copilot token if needed      |
| `sendMessage`            | `(messages, model, onChunk, onDone, onError, abortController) => Promise<string>` | Send message and stream response     |
| `summarize`              | `(messages: ChatMessage[], model: string) => Promise<string>`                     | Summarize a conversation branch      |
| `estimateTokens`         | `(text: string, model: string) => Promise<number>`                                | Estimate token count for text        |
| `getContextWindow`       | `(modelId: string) => number`                                                     | Get context window size for model    |

### SSE Event Types

| Event     | Data          | Description                   |
| --------- | ------------- | ----------------------------- |
| `message` | text chunk    | New content from LLM          |
| `done`    | (empty)       | Stream completed successfully |
| `error`   | error message | Stream failed with error      |

### Request Format (Frontend to Backend)

```javascript
{
    messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
    ],
    model: 'openai/gpt-4o',
    api_key: 'sk-...',           // From localStorage
    base_url: 'https://api.openai.com/v1',  // Optional, for custom endpoints
    temperature: 0.3
}
```

## Open Questions & Future Decisions

### Resolved

1. ✅ Context resolution via graph traversal - decided to traverse from selected node back to roots

### Deferred

1. Context window management - how to handle very long conversations
2. Multimodal content support
3. Streaming reliability improvements
4. Provider-specific feature detection

## References to HLD

This LLD supports several design decisions from the High-Level Design:

1. **Streaming-First** (HLD Section 4.4): The SSE implementation delivers responses token-by-token with stop/continue controls in each node header.

2. **Bring Your Own Keys** (HLD Section 4.2): API keys are retrieved from localStorage and sent with requests. The backend proxies requests without storing keys.

3. **Plugin-Extensible** (HLD Section 4.3): The Chat module's sendMessage capability is used by feature plugins (Committee, Factcheck) to query LLMs. The StreamingManager coordinates multiple concurrent streams.

4. **Local-First** (HLD Section 4.1): All conversation state stays in the browser. The backend is a thin proxy that never stores user data.

## References

- **HLD**: `/docs/high-level-design.md`
- **Implementation**: `src/canvas_chat/static/js/chat.js` - Main Chat class
- **SSE Utilities**: `src/canvas_chat/static/js/sse.js` - Stream parsing
- **Streaming Manager**: `src/canvas_chat/static/js/streaming-manager.js` - Concurrent streams

1. **Chat-First, Visual Second** (HLD Section 2): The Chat module is the core interaction. The visual canvas displays what the Chat module produces.
