/**
 * Web grounding utilities for optional search-based context injection.
 * Used by Committee (and future features) to ground LLM answers with web search results.
 */

import { apiUrl } from './utils.js';
import { storage } from './storage.js';

/**
 * Derive a search query from a question and optional context using the refine-query API.
 * @param {string} question - The user question (e.g. committee question)
 * @param {string} contextString - Optional context (e.g. selected node contents), can be empty
 * @param {function(Object): Object} buildLLMRequest - App's buildLLMRequest; receives params and returns request body with model, api_key, etc.
 * @param {string} model - Model ID to use for refine-query (e.g. first committee member's model)
 * @returns {Promise<string>} Refined search query, or original question if refine fails or returns empty
 */
export async function deriveSearchQuery(question, contextString, buildLLMRequest, model) {
    try {
        const body = buildLLMRequest({
            user_query: question,
            context: contextString || '',
            command_type: 'search',
            model: model,
        });
        const response = await fetch(apiUrl('/api/refine-query'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) return question;
        const data = await response.json();
        const refined = data.refined_query && data.refined_query.trim();
        return refined || question;
    } catch (err) {
        console.warn('[web-grounding] deriveSearchQuery failed:', err);
        return question;
    }
}

/**
 * Run a web search using Exa (if key present) or DuckDuckGo.
 * @param {string} query - Search query string
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>} Deduplicated results by url
 */
export async function runWebSearch(query) {
    const hasExa = storage.hasExaApiKey();
    const exaKey = hasExa ? storage.getExaApiKey() : null;

    try {
        let response;
        if (hasExa) {
            response = await fetch(apiUrl('/api/exa/search'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    api_key: exaKey,
                    num_results: 5,
                }),
            });
        } else {
            response = await fetch(apiUrl('/api/ddg/search'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    max_results: 10,
                }),
            });
        }
        if (!response.ok) return [];
        const data = await response.json();
        const results = data.results || [];
        const seen = new Set();
        const out = [];
        for (const r of results) {
            const url = r.url || '';
            if (url && !seen.has(url)) {
                seen.add(url);
                out.push({
                    title: r.title || '',
                    url: url,
                    snippet: r.snippet || '',
                });
            }
        }
        return out;
    } catch (err) {
        console.warn('[web-grounding] runWebSearch failed:', err);
        return [];
    }
}

/**
 * Fetch full page content for a single URL via /api/fetch-url.
 * @param {string} url - URL to fetch
 * @returns {Promise<{title: string, content: string} | null>} Title and content, or null on failure
 */
export async function fetchUrlContent(url) {
    try {
        const response = await fetch(apiUrl('/api/fetch-url'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        const content = data.content && typeof data.content === 'string' ? data.content.trim() : '';
        if (!content) return null;
        return {
            title: data.title || '',
            content,
        };
    } catch (err) {
        console.warn('[web-grounding] fetchUrlContent failed for', url, err);
        return null;
    }
}

/**
 * Enrich web search results with fetched page content (full text) for each URL.
 * Fetches content in sequence to avoid overloading the server. On per-URL failure, keeps snippet only.
 * @param {Array<{title: string, url: string, snippet: string}>} searchResults - Results from runWebSearch
 * @returns {Promise<Array<{title: string, url: string, snippet: string, content?: string}>>} Same results with content added when fetch succeeds
 */
export async function enrichSearchResultsWithContent(searchResults) {
    if (!searchResults || searchResults.length === 0) return searchResults;
    const enriched = [];
    for (const r of searchResults) {
        const fetched = await fetchUrlContent(r.url);
        if (fetched) {
            enriched.push({ ...r, content: fetched.content });
        } else {
            enriched.push({ ...r });
        }
    }
    return enriched;
}

/**
 * Append a single user message containing formatted web search results to the messages array.
 * Uses title/URL/snippet only. Full page content is handled by feature-specific pipelines
 * (e.g. matrix grounded pipeline) to avoid clogging the context window.
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @param {Array<{title: string, url: string, snippet: string}>} searchResults - Web search results
 * @returns {Array<{role: string, content: string}>} New array with one additional user message
 */
export function appendWebContextToMessages(messages, searchResults) {
    const lines = ['Web search results (use to ground your answer):', ''];
    if (searchResults.length === 0) {
        lines.push('No results found.');
    } else {
        searchResults.forEach((r, i) => {
            lines.push(`[${i + 1}] ${r.title}`);
            lines.push(r.url);
            if (r.snippet) {
                lines.push(r.snippet);
            }
            lines.push('');
        });
    }
    const content = lines.join('\n').trim();
    return [...messages, { role: 'user', content }];
}
