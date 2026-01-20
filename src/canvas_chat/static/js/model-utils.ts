/**
 * Model utilities for API key and base URL lookup.
 * Extracted from chat.js for plugin reusability.
 */

import { storage } from './storage.js';
import { apiUrl as apiUrlUtil } from './utils.js';

/**
 * Custom model configuration with per-model API overrides.
 */
export interface CustomModel {
    id: string;
    name: string;
    provider: string;
    context_window: number;
    base_url?: string | null;
}

/**
 * Get API key for a model.
 * @param model - Model ID (e.g., "gpt-4o", "dall-e-3")
 * @returns API key or null if not found
 */
export function getApiKeyForModel(model: string | null | undefined): string | null {
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
 * @param modelId - The model ID
 * @returns Base URL to use, or null if none configured
 */
export function getBaseUrlForModel(modelId: string): string | null {
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
 * @param endpoint - The API endpoint (e.g., '/api/chat' or 'api/chat')
 * @returns The full API URL with base path (always starts with /)
 */
export const apiUrl = (endpoint: string): string => {
    return apiUrlUtil(endpoint);
};
