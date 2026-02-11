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
 * Append a single user message containing formatted web search results to the messages array.
 * Does not mutate the input array.
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
            if (r.snippet) lines.push(r.snippet);
            lines.push('');
        });
    }
    const content = lines.join('\n').trim();
    return [...messages, { role: 'user', content }];
}
