# Consolidated Image Generation Plugin Implementation

## Summary

Implemented a plugin-based image generation system similar to the file upload handler pattern. The system allows multiple image generation providers (OpenAI, Google, Ollama) to be implemented as separate handler plugins and registered dynamically.

## Files Created

### Core Infrastructure

- `src/canvas_chat/image_generation_handler_plugin.py` - Base class for image generation handlers
- `src/canvas_chat/image_generation_registry.py` - Registry for managing handlers

### Handler Plugins

- `src/canvas_chat/plugins/openai_image_handler.py` - OpenAI DALL-E handler (dall-e-3, dall-e-2)
- `src/canvas_chat/plugins/google_image_handler.py` - Google Imagen handler (gemini/imagen-4.0-generate-001)
- `src/canvas_chat/plugins/ollama_image_handler.py` - Ollama handler (experimental, local)

### Tests

- `tests/test_image_generation_handlers.py` - Comprehensive tests for registry and handlers

## Files Modified

- `src/canvas_chat/plugins/__init__.py` - Added image generation handler imports
- `src/canvas_chat/app.py` - Refactored `/api/generate-image` endpoint to use registry

## Architecture

### Request/Response Models

- `ImageGenerationRequest` - Request with prompt, model, size, quality, api_key, base_url, and extra_params
- `ImageGenerationResponse` - Response with image_data (base64), mime_type, and revised_prompt

### Base Plugin Class

`ImageGenerationHandlerPlugin` - Abstract base class requiring `generate_image()` method

### Registry

`ImageGenerationRegistry` - Manages handlers with:

- Priority-based lookup (BUILTIN=100, OFFICIAL=50, COMMUNITY=10)
- Model self-discovery (handlers declare supported models)
- Handler lifecycle management

### Handler Pattern

Each handler:

1. Extends `ImageGenerationHandlerPlugin`
2. Implements `async generate_image(request) -> ImageGenerationResponse`
3. Registers with `ImageGenerationRegistry.register(id, models, handler, priority, description)`

## Usage

### Adding a New Handler

```python
from canvas_chat.image_generation_handler_plugin import (
    ImageGenerationHandlerPlugin,
    ImageGenerationRequest,
    ImageGenerationResponse,
)
from canvas_chat.image_generation_registry import ImageGenerationRegistry, PRIORITY

class MyProviderHandler(ImageGenerationHandlerPlugin):
    async def generate_image(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        # Generate image with custom provider
        return ImageGenerationResponse(
            image_data="base64...",
            mime_type="image/png",
            revised_prompt="...",
        )

ImageGenerationRegistry.register(
    id="my-provider",
    models=["my-model-1", "my-model-2"],
    handler=MyProviderHandler,
    priority=PRIORITY.COMMUNITY,
    description="My provider image generation",
)
```

### API Endpoint

The `/api/generate-image` endpoint now uses the registry:

1. Validates API key
2. Finds appropriate handler via `ImageGenerationRegistry.find_handler(model)`
3. Instantiates handler and calls `generate_image()`
4. Returns base64 image data to client

## Testing

All tests pass:

- 130 Python tests (including 20 new image generation tests)
- 70 JavaScript tests

Test coverage includes:

- Handler registration and lookup
- Priority-based selection
- Request/response model validation
- Error handling for invalid configurations
- Abstract base class enforcement

## Benefits

1. **Extensibility** - New providers can be added without modifying core code
2. **Self-Discovery** - Handlers declare supported models for automatic discovery
3. **Priority System** - Multiple handlers can support same model; highest priority wins
4. **Consistency** - Mirrors file upload handler pattern for consistency
5. **Testing** - Each handler can be tested independently
6. **Type Safety** - Pydantic models for request/response validation

## Implementation Notes

- PRIORITY is a dict (not a class), accessed as `PRIORITY["BUILTIN"]`
- Handlers automatically import and register when `canvas_chat.plugins` is imported
- Ollama handler is marked experimental (requires local server)
- All handlers use litellm.aimage_generation() for actual API calls
