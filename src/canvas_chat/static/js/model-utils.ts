/**
 * Model utilities for API key and base URL lookup.
 * Extracted from chat.js for plugin reusability.
 */

import { storage } from './storage.js';
import { apiUrl as apiUrlUtil } from './utils.js';

/**
 * Custom model configuration with per-model API overrides.
 * @typedef {Object} CustomModel
 * @property {string} id - LiteLLM-compatible model ID (e.g., "openai/gpt-4.1-mini")
 * @property {string} name - Display name
 * @property {string} provider - Provider name for API key lookup
 * @property {number} context_window - Context window size in tokens
 * @property {string|null} [base_url] - Per-model base URL (optional)
 */

/**
 * Get API key for a model.
 * @param {string} model - Model ID (e.g., "gpt-4o", "dall-e-3")
 * @returns {string|null} - API key or null if not found
 */
export function getApiKeyForModel(model) {
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
    // Check if this is a custom model with per-model base_url
    /** @type {CustomModel[]} */
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
    return apiUrlUtil(endpoint);
};
