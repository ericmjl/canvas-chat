/**
 * Model utilities for API key and base URL lookup.
 * Extracted from chat.js for plugin reusability.
 */

/**
 * Get API key for a model.
 * @param {string} model - Model ID (e.g., "gpt-4o", "dall-e-3")
 * @returns {string|null} - API key or null if not found
 */
export function getApiKeyForModel(model) {
    const { storage } = import('./storage.js');
    if (!model) return null;

    // DALL-E models use OpenAI provider
    if (model.startsWith('dall-e')) {
        return storage.getApiKeyForProvider('openai');
    }

    // Extract provider from model ID (e.g., "gemini/imagen-4.0" -> "gemini")
    const provider = model.split('/')[0].toLowerCase();
    return storage.getApiKeyForProvider(provider);
}

/**
 * Get base URL for a specific model.
 * @param {string} modelId - The model ID
 * @returns {string|null} - Base URL to use, or null if none configured
 */
export function getBaseUrlForModel(modelId) {
    const { storage } = import('./storage.js');
    // Check if this is a custom model with per-model base_url
    const customModels = storage.getCustomModels();
    const customModel = customModels.find((m) => m.id === modelId);

    if (customModel && customModel.base_url) {
        return customModel.base_url;
    }

    // Fall back to global base URL
    return storage.getBaseUrl();
}

/**
 * Get the full API URL for an endpoint.
 * Re-exported from utils.js for test compatibility.
 * @param {string} endpoint - The API endpoint (e.g., '/api/chat' or 'api/chat')
 * @returns {string} The full API URL with base path (always starts with /)
 */
export const apiUrl = (endpoint) => {
    const { apiUrl: apiUrlUtil } = import('./utils.js');
    return apiUrlUtil(endpoint);
};
