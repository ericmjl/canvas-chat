"""Ollama API response fixtures for testing."""

# Success response with progress chunks + final image
OLLAMA_SUCCESS_RESPONSE = [
    # Progress chunk 1
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:05.027671Z","response":"","done":false,"completed":1,"total":9}',
    # Progress chunk 2
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:11.930409Z","response":"","done":false,"completed":2,"total":9}',
    # Progress chunk 3
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:11.930621Z","response":"","done":false,"completed":3,"total":9}',
    # Progress chunk 4
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:20.231629Z","response":"","done":false,"completed":4,"total":9}',
    # Progress chunk 5
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:28.717081Z","response":"","done":false,"completed":5,"total":9}',
    # Progress chunk 6
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:37.42957Z","response":"","done":false,"completed":6,"total":9}',
    # Progress chunk 7
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:48.130882Z","response":"","done":false,"completed":7,"total":9}',
    # Progress chunk 8
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:46.220786Z","response":"","done":false,"completed":8,"total":9}',
    # Final chunk with both "image" and "response" fields
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:48.130882Z","response":"iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg==","image":"iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg==","done":true,"done_reason":"stop","total_duration":43676631791,"load_duration":87276541}',
]

# Final chunk with only "image" field
OLLAMA_FINAL_CHUNK_IMAGE_ONLY = '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:48.130882Z","image":"iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg==","done":true,"done_reason":"stop"}'  # noqa: E501

# Final chunk with only "response" field
OLLAMA_FINAL_CHUNK_RESPONSE_ONLY = '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:48.130882Z","response":"iVBORw0KGgoAAAANSUhEUgAAABJRU5ErkJggg==","done":true,"done_reason":"stop"}'  # noqa: E501

# Final chunk with empty "image" and "response"
OLLAMA_FINAL_CHUNK_EMPTY_DATA = '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:48.130882Z","image":"","response":"","done":true}'  # noqa: E501

# Timeout scenario (no final chunk)
OLLAMA_TIMEOUT_RESPONSE = [
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:05.027671Z","response":"","done":false,"completed":1,"total":9}',
    '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:11.930409Z","response":"","done":false,"completed":2,"total":9}',
]

# Error response from Ollama
OLLAMA_ERROR_RESPONSE = '{"error":"model not found"}'  # noqa: E501

# Progress chunk with partial response (edge case)
OLLAMA_PROGRESS_WITH_PARTIAL_RESPONSE = '{"model":"x/z-image-turbo:latest","created_at":"2026-01-24T20:46:11.930409Z","response":"partial_data","done":false,"completed":1,"total":9}'  # noqa: E501
