# Low-Level Design: ImageGenerationFeature

**Created**: 2026-03-16
**Status**: Implementation
**Module**: ImageGenerationFeature (AI image generation)

## Context and Design Philosophy

ImageGenerationFeature brings AI-powered image generation directly into the visual canvas workflow. The design philosophy centers on three principles. First, seamless integration means users can generate images without leaving the canvas context, combining image generation with chat, research, and other features. Second, provider choice offers flexibility through multiple backends (DALL-E, Gemini, Ollama), allowing users to balance quality, speed, cost, and privacy based on their needs. Third, visual feedback provides immediate canvas-based feedback with loading states, progress indicators, and error handling displayed directly on the generated image node.

The feature builds on the existing image analysis workflow documented in `use-images.md`. Where that document covers analyzing uploaded images with vision-capable LLMs, this feature covers the inverse: generating new images from text prompts.

## Technical Overview

### Slash Command Entry Point

The feature is accessed via the `/image` slash command, registered in FeatureRegistry and handled by `ImageGenerationFeature.handleCommand()`:

```text
/image A serene mountain lake at sunset with snow-capped peaks
```

When invoked, the command:

1. Parses the prompt from command arguments
2. Checks for selected nodes to use as conversation context
3. Optionally combines selected text with additional instructions
4. Opens the settings modal for model and parameter selection

The command accepts optional arguments that are combined with any selected node content:

```text
# With selected node text + additional instructions
/image make it more vibrant and add birds
```

The prompt is built by combining `selectedContext` and `additionalInstructions` with a separator:

```javascript
if (selectedContext && additionalInstructions) {
    prompt = `${selectedContext}\n\nAdditional instructions: ${additionalInstructions}`;
}
```

### Settings Modal

The ImageGeneration settings modal (`image-generation-settings-modal`) provides provider and parameter configuration:

**Model Selection** (dropdown):

| Model ID                              | Provider | Description                |
| ------------------------------------- | -------- | -------------------------- |
| `dall-e-3`                            | OpenAI   | Best quality, slower       |
| `dall-e-2`                            | OpenAI   | Lower cost, faster         |
| `gemini/imagen-4.0-generate-001`      | Google   | Fast generation            |

Ollama (local) models are **populated dynamically** from the local Ollama instance when the modal opens (see [Dynamic Ollama Model Discovery](#dynamic-ollama-model-discovery) below). Each model is assigned an `ollama_image/<name>` ID (e.g. `ollama_image/x/z-image-turbo:latest`, `ollama_image/x/flux2-klein:latest`). If Ollama is not running, a disabled placeholder option is shown.

**Size Options** (dropdown):

| Value       | Dimensions | Use Case              |
| ----------- | ---------- | --------------------- |
| `1024x1024` | Square     | Social media, general |
| `1792x1024` | Landscape  | Wide banners          |
| `1024x1792` | Portrait   | Stories, mobile       |

**Quality Options** (dropdown):

| Value      | Model Support      | Description                |
| ---------- | ------------------ | -------------------------- |
| `hd`       | DALL-E 3           | Higher detail, recommended |
| `standard` | DALL-E 2/3, Imagen | Faster, lower cost         |

The modal is registered in `onLoad()` using the plugin modal system:

```javascript
this.modalManager.registerModal('image-generation', 'settings', modalTemplate);
```

### Provider Abstraction

The frontend determines the provider from the model ID and retrieves the appropriate API key:

```javascript
if (model.startsWith('dall-e')) {
    provider = 'openai';
} else if (model.startsWith('gemini')) {
    provider = 'google';
} else {
    provider = model.split('/')[0]; // e.g., 'ollama_image' for Ollama models
}

const apiKey = this.storage.getApiKeyForProvider(provider);
const baseUrl = this.storage.getBaseUrlForModel(model);
```

This enables the same settings modal to work with any LiteLLM-compatible image generation model.

### Dynamic Ollama Model Discovery

Ollama image models are discovered at runtime rather than hardcoded. When the settings modal opens, `populateOllamaModels()` fetches image-capable models from the backend endpoint `GET /api/ollama/image-models`.

**Backend filtering:** The endpoint calls `fetch_ollama_image_models()`, which performs a two-step discovery:

1. `GET /api/tags` — retrieve all model names (single batch call)
2. `POST /api/show` for each model (concurrent via `asyncio.gather`) — check `capabilities`
3. Filter to only models where `"image" in capabilities`

Ollama's `/api/show` response includes a `capabilities` array that cleanly separates model types:

| Capability | Meaning | Example models |
| ---------- | ------- | -------------- |
| `image` | Image generation | `x/z-image-turbo`, `x/flux2-klein` |
| `completion` | Text/chat | `llama3.2`, `gemma2`, `qwen3.6` |
| `vision` | Can see images (not generate) | `gemma4:12b`, `glm-ocr` |

Vision-capable models have `"vision"` but not `"image"`, so there are no false positives.

```text
Ollama /api/tags     →  fetch_ollama_image_models()
Ollama /api/show (N)  →    filter "image" in capabilities
                      →  GET /api/ollama/image-models
                      →  populateOllamaModels() fills <optgroup> in the dropdown
```

The `/api/show` calls are concurrent to minimize latency (~0.5s for ~10 models over localhost). Each call has a 5s timeout so a hung model doesn't block the entire endpoint. The `asyncio.gather` uses `return_exceptions=True` so a single model failure doesn't affect others.

The dropdown uses an `<optgroup id="image-gen-ollama-group">` as the insertion point. On each modal open:

1. The optgroup shows a "Loading..." placeholder
2. `fetch('/api/ollama/image-models')` runs (non-blocking; modal is already visible)
3. On success: each filtered model becomes an `<option>` inside the optgroup
4. On failure or empty list (Ollama not running, or no image models): a disabled placeholder replaces the options

**Non-blocking guarantee:** The image modal is opened on-demand via the `/image` slash command — it does NOT load on page startup. Canvas-chat loads normally; the filtering only runs when the user explicitly opens the image generation modal.

Because the backend's `/api/generate-image` already handles any `ollama_image/*` model generically, no backend changes are needed to support new Ollama image models — they appear automatically once `ollama pull`-ed and Ollama tags them with the `image` capability.

## Node Types

### Image Node

Generated images are displayed in `NodeType.IMAGE` nodes, which are also used for uploaded images. The node stores:

- **imageData**: Base64-encoded image data
- **mimeType**: Image MIME type (typically `image/png`)
- **content**: Revised prompt (if returned by provider) or error message
- **model**: Model ID used for generation

The default size for image nodes is 640x480 pixels (defined in `graph-types.js`):

```javascript
[NodeType.IMAGE]: { width: 640, height: 480 },
```

### Human Prompt Node

The user's prompt is stored in a `NodeType.HUMAN` node for full conversation traceability:

- **content**: The full prompt including any context from selected nodes
- **Edges**: Connected from parent nodes (selected nodes) via `EdgeType.REPLY`

### Loading State

During generation, the image node displays a loading indicator:

```html
<div class="image-loading">
    <div class="spinner"></div>
    <p>Generating image...</p>
</div>
```

## Edge Types

The ImageGenerationFeature creates edges to maintain conversation flow:

| Edge Type        | From              | To                | Meaning                |
| ---------------- | ----------------- | ----------------- | ---------------------- |
| `EdgeType.REPLY` | Selected nodes    | Human prompt node | Context for the prompt |
| `EdgeType.REPLY` | Human prompt node | Image node        | Generated from prompt  |

## Execution Flow

### Phase 1: Command Parsing

1. User types `/image [optional prompt text]`
2. Slash command menu shows "Generate an image from text"
3. User presses Enter to select
4. `handleCommand()` is invoked with command and arguments
5. Selected node content is retrieved as context

### Phase 2: Modal Display

1. Settings modal opens with default selections
2. User selects model, size, and quality
3. User clicks "Generate Image" or "Cancel"

### Phase 3: Node Creation

If "Generate Image" is clicked:

1. Modal closes
2. Human prompt node is created at auto-positioned location
3. Edges created from selected parent nodes to prompt node
4. Image node created with loading state placeholder
5. Edge created from prompt node to image node
6. Viewport pans to show the new image node

### Phase 4: API Request

1. Build request body with prompt, model, size, quality
2. Determine provider from model ID
3. Retrieve API key from storage for that provider
4. Call backend endpoint `/api/generate-image`

```javascript
const response = await fetch(apiUrl('/api/generate-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        prompt: this.currentPrompt,
        model: model,
        size: size,
        quality: quality,
        n: 1,
        api_key: apiKey,
        base_url: baseUrl,
    }),
});
```

### Phase 5: Response Handling

On success:

1. Extract base64 image data from response
2. Update image node with imageData and mimeType
3. Force re-render to display the image
4. Save session to persist changes

On error:

1. Display error message in image node content
2. Log error details to console
3. Update node with error state
4. Save session

## Backend Implementation

### Endpoint

The backend exposes `/api/generate-image` (FastAPI endpoint in `app.py`):

```python
@app.post("/api/generate-image")
async def generate_image(request: ImageGenerationRequest):
```

### Request Model

```python
class ImageGenerationRequest(BaseModel):
    prompt: str
    model: str = "dall-e-3"
    size: str = "1024x1024"
    quality: str = "hd"
    n: int = 1
    api_key: str | None = None
    base_url: str | None = None
```

### Provider-Specific Handling

**OpenAI (DALL-E)**:

- Uses LiteLLM's `aimage_generation()` for standardized API
- Supports DALL-E 2 and DALL-E 3
- Quality parameter: `hd` or `standard`

**Google (Imagen)**:

- Model ID: `gemini/imagen-4.0-generate-001`
- Uses LiteLLM for API call
- Returns base64-encoded image

**Ollama (Local)**:

- Models discovered dynamically via `GET /api/ollama/image-models` (queries Ollama `/api/tags` + `/api/show`)
- Filtered by `image` capability so text/chat models are excluded
- Model prefix: `ollama_image/`
- Converted to `ollama/` for API call
- Direct HTTP to Ollama's `/api/generate` endpoint
- No API key required (uses dummy value for LiteLLM)
- Quality parameter not supported (set to None)

### Response Format

```javascript
{
    "imageData": "base64-encoded-image-data",
    "mimeType": "image/png",
    "revised_prompt": null | "refined prompt from provider"
}
```

### Error Handling

| Error Type          | HTTP Status | User Message                                        |
| ------------------- | ----------- | --------------------------------------------------- |
| AuthenticationError | 401         | "Authentication failed. Please check your API key." |
| RateLimitError      | 429         | "Rate limit exceeded. Please try again later."      |
| Network Error       | 500         | "Network error. Could not connect to the server."   |
| Other               | 500         | Raw error message                                   |

## Data Structures

### Image Generation State

```javascript
{
    currentPrompt: string,        // Combined prompt from context + args
    parentNodeIds: string[],      // Selected nodes used as context
    model: string,                // Selected model ID
    size: string,                 // Image dimensions
    quality: string,              // 'hd' or 'standard'
}
```

### Node Metadata

Image nodes store generation metadata:

```javascript
{
    imageData: string,    // Base64-encoded image
    mimeType: string,     // e.g., "image/png"
    content: string,     // Revised prompt or error message
    model: string,       // Model ID used
}
```

### Storage Keys

API keys are stored per-provider in localStorage:

| Provider | Storage Key              | Required                |
| -------- | ------------------------ | ----------------------- |
| OpenAI   | `canvas-chat-openai-key` | Yes (unless admin mode) |
| Google   | `canvas-chat-google-key` | Yes (unless admin mode) |
| Ollama   | N/A                      | No (local only)         |

## Integration Points

### FeatureRegistry Registration

ImageGenerationFeature is registered as a built-in feature:

```javascript
import { ImageGenerationFeature } from './plugins/image-generation.js';

registry.registerFeature(new ImageGenerationFeature(ctx), PRIORITY.BUILTIN);
```

### Slash Command

Declared in `getSlashCommands()`:

```javascript
getSlashCommands() {
    return [
        {
            command: '/image',
            description: 'Generate an image from text',
            placeholder: 'optional additional instructions...',
        },
    ];
}
```

### AppContext Dependencies

The feature uses these injected dependencies:

- `this.graph`: Add/update nodes and edges
- `this.canvas`: Render nodes, viewport control, copy to clipboard
- `this.modalManager`: Register and show settings modal
- `this.storage`: Retrieve API keys for providers
- `this.saveSession()`: Persist after generation

## Image Display

### Rendering

Image nodes use the ImageNode protocol from `image-node.js`:

```javascript
renderContent(_canvas) {
    const imgSrc = `data:${this.node.mimeType || 'image/png'};base64,${this.node.imageData}`;
    return `<div class="image-node-content"><img src="${imgSrc}" class="node-image" alt="Image"></div>`;
}
```

### Copy to Clipboard

Generated images can be copied to clipboard using the ImageNode's `copyToClipboard()` method, which leverages Canvas's `copyImageToClipboard()`:

```javascript
async copyToClipboard(canvas, _app) {
    await canvas.copyImageToClipboard(this.node.imageData, this.node.mimeType);
    canvas.showCopyFeedback(this.node.id);
}
```

### CSS Styling

Image nodes use these CSS classes:

- `.image-node-content`: Container for image (flex, centered)
- `.node-image`: The actual image element
- `.image-loading`: Loading state container
- `.spinner`: CSS animation for loading indicator

## Error Handling Reference

### Frontend Errors

The `_getUserFriendlyErrorMessage()` method maps common errors to user-friendly messages:

```javascript
if (message.includes('Authentication failed')) {
    return 'Authentication failed. Please check your API key in Settings.';
}
if (message.includes('Rate limit')) {
    return 'Rate limit exceeded. Please try again later.';
}
if (message.includes('Failed to fetch')) {
    return 'Network error. Could not connect to the server.';
}
```

### Backend Errors

The backend catches and transforms LiteLLM exceptions:

- `AuthenticationError`: Returns 401 with helpful message
- `RateLimitError`: Returns 429 with retry message
- Generic exceptions: Logged with traceback, returns 500

### XSS Prevention

Error messages are escaped before display:

```javascript
escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

## Testing Considerations

### Unit Tests

Pure functions for testing:

- `_getUserFriendlyErrorMessage()`: Error message transformation
- `escapeHtml()`: XSS prevention

### Integration Tests

- `/image` command parsing
- Modal interaction flow
- Node creation and positioning
- API request building

### E2E Tests

- Slash command menu interaction
- Settings modal form submission
- Image node rendering
- Error state display

## Open Questions & Future Decisions

### Resolved

1. **Single vs multiple images**: Single image (n=1) for simplicity; multiple could be added later
2. **Provider determination**: Model ID prefix pattern (`dall-e`, `gemini`, `ollama_image`)
3. **API key storage**: Reuses existing storage.getApiKeyForProvider() pattern
4. **Modal vs inline**: Settings modal provides cleaner UX for model/size selection

### Deferred / Future

1. **Image editing**: Regeneration or inpainting with selected regions
2. **Multiple image generation**: Support n>1 for multiple variations
3. **Style presets**: Quick-select common styles (photorealistic, illustration, etc.)
4. **Seed control**: Reproducible generation with seed parameter
5. **Image-to-image**: Generation based on uploaded reference image
6. **Provider comparison**: Side-by-side generation from multiple providers

## References

- **HLD**: `/docs/high-level-design.md` - Context on multimodal LLM features
- **How-to (Images)**: `/docs/how-to/use-images.md` - Image analysis workflow (inverse feature)
- **Implementation**: `src/canvas_chat/static/js/plugins/image-generation.js` - Full source
- **Node Protocol**: `src/canvas_chat/static/js/plugins/image-node.js` - ImageNode class
- **Backend**: `src/canvas_chat/app.py:1676-1819` - `/api/generate-image` endpoint
- **Node Type**: `src/canvas_chat/static/js/graph-types.js:238` - NodeType.IMAGE
- **Default Size**: `src/canvas_chat/static/js/graph-types.js:269` - IMAGE size (640x480)
- **CSS**: `src/canvas_chat/static/css/nodes.css:1316-1336` - Image node styles
