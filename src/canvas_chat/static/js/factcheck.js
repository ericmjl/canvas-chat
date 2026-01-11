/**
 * Factcheck Feature Module
 *
 * Handles the /factcheck command for verifying claims with web search.
 * Extracted from app.js for modularity.
 *
 * Dependencies (injected via constructor):
 * - graph: CRDTGraph instance
 * - canvas: Canvas instance
 * - getModelPicker: function returning modelPicker element
 * - saveSession: function to persist session
 * - buildLLMRequest: function to build LLM request with base_url
 *
 * Global dependencies:
 * - chat: For API calls (getApiKeyForModel, sendMessageNonStreaming)
 * - storage: For Exa API key (hasExaApiKey, getExaApiKey)
 * - createNode, createEdge: Node/edge factory functions
 * - NodeType, EdgeType: Type constants
 */

import { NodeType, EdgeType, createNode, createEdge } from './graph-types.js';
import { storage } from './storage.js';
import { chat } from './chat.js';
import { apiUrl } from './utils.js';
import { FeaturePlugin } from './feature-plugin.js';

/**
 * FactcheckFeature - Handles /factcheck command for verifying claims with web search.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
class FactcheckFeature extends FeaturePlugin {
    /**
     * Create a FactcheckFeature instance.
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);

        // Factcheck-specific dependency (not in base FeaturePlugin)
        this.getModelPicker = () => context.modelPicker;

        // Modal state
        this._factcheckData = null;
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     */
    async onLoad() {
        console.log('[FactcheckFeature] Loaded');
    }

    /**
     * Handle /factcheck slash command - verify claims with web search
     * @param {string} input - The user's input (claim or vague reference)
     * @param {string} context - Optional context from selected nodes
     */
    async handleFactcheck(input, context = null) {
        console.log('[Factcheck] Starting with input:', input, 'context:', context);

        const model = this.getModelPicker().value;

        // Get parent node IDs for positioning
        let parentIds = this.canvas.getSelectedNodeIds();
        if (parentIds.length === 0) {
            const leaves = this.graph.getLeafNodes();
            if (leaves.length > 0) {
                leaves.sort((a, b) => b.created_at - a.created_at);
                parentIds = [leaves[0].id];
            }
        }

        // Create a loading node immediately for feedback
        const loadingNode = createNode(NodeType.FACTCHECK, '🔄 **Analyzing text for claims...**', {
            position: this.graph.autoPosition(parentIds),
        });
        this.graph.addNode(loadingNode);
        this.canvas.renderNode(loadingNode);

        // Connect to parent nodes
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, loadingNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(edge);
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, loadingNode.position);
        }

        this.canvas.clearSelection();
        this.canvas.panToNodeAnimated(loadingNode.id);

        try {
            // If context provided but input is vague, refine it
            let effectiveInput = input;
            if (context && context.trim() && (!input || input.length < 20)) {
                console.log('[Factcheck] Refining vague input with context');
                this.canvas.updateNodeContent(loadingNode.id, '🔄 **Refining query...**', true);

                const refineResponse = await fetch(apiUrl('/api/refine-query'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildLLMRequest({
                            user_query: input || 'verify this',
                            context: context,
                            command_type: 'factcheck',
                        })
                    ),
                });
                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    effectiveInput = refineData.refined_query;
                    console.log('[Factcheck] Refined to:', effectiveInput);
                } else {
                    console.warn('[Factcheck] Refine failed, using context directly');
                    effectiveInput = context;
                }
            }

            // Use context as input if no direct input provided
            if (!effectiveInput && context) {
                effectiveInput = context;
            }

            console.log('[Factcheck] Final effectiveInput:', effectiveInput);
            this.canvas.updateNodeContent(loadingNode.id, '🔄 **Extracting claims...**', true);

            // Extract individual claims from input
            const claims = await this.extractFactcheckClaims(effectiveInput, model);

            if (claims.length === 0) {
                // No claims found - update loading node with error message
                const errorContent =
                    '**No verifiable claims found.**\n\nPlease provide specific factual statements to verify.';
                this.canvas.updateNodeContent(loadingNode.id, errorContent, false);
                this.graph.updateNode(loadingNode.id, { content: errorContent });
                this.saveSession();
                return;
            }

            if (claims.length > 5) {
                // Too many claims - show modal for selection
                // Store the loading node ID so we can reuse it after modal
                // Get API key (may be null in admin mode, backend handles it)
                const apiKey = chat.getApiKeyForModel(model);
                this._factcheckData = {
                    claims: claims,
                    parentIds: parentIds,
                    model: model,
                    apiKey: apiKey,
                    loadingNodeId: loadingNode.id,
                };
                this.canvas.updateNodeContent(
                    loadingNode.id,
                    `🔄 **Found ${claims.length} claims.** Select which to verify...`,
                    false
                );
                this.showFactcheckModal(claims);
                return;
            }

            // Proceed directly with all claims (≤5) - reuse the loading node
            // Get API key (may be null in admin mode, backend handles it)
            const apiKey = chat.getApiKeyForModel(model);
            await this.executeFactcheck(claims, parentIds, model, apiKey, loadingNode.id);
        } catch (err) {
            console.error('Factcheck error:', err);
            // Update loading node with error
            const errorContent = `**Fact-check failed**\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(loadingNode.id, errorContent, false);
            this.graph.updateNode(loadingNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    /**
     * Show the factcheck claim selection modal
     * @param {string[]} claims - Array of extracted claims
     */
    showFactcheckModal(claims) {
        const modal = document.getElementById('factcheck-modal');
        const claimsList = document.getElementById('factcheck-claims-list');
        const selectAll = document.getElementById('factcheck-select-all');

        // Clear previous claims
        claimsList.innerHTML = '';

        // Populate claims list (first 5 pre-selected)
        claims.forEach((claim, index) => {
            const item = document.createElement('label');
            item.className = 'factcheck-claim-item';
            if (index < 5) {
                item.classList.add('selected');
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = index;
            checkbox.checked = index < 5;
            checkbox.addEventListener('change', () => this.updateFactcheckSelection());

            const textSpan = document.createElement('span');
            textSpan.className = 'claim-text';
            textSpan.textContent = claim;

            item.appendChild(checkbox);
            item.appendChild(textSpan);
            claimsList.appendChild(item);

            // Click on label toggles checkbox
            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        });

        // Reset select all state
        selectAll.checked = false;
        selectAll.indeterminate = claims.length > 5;

        // Update selection state
        this.updateFactcheckSelection();

        // Show modal
        modal.style.display = 'flex';
    }

    /**
     * Close the factcheck modal
     * @param {boolean} [cancelled=true] - Whether the modal was cancelled (vs executed)
     */
    closeFactcheckModal(cancelled = true) {
        const modal = document.getElementById('factcheck-modal');
        modal.style.display = 'none';

        // If cancelled and there's a loading node, remove it
        if (cancelled && this._factcheckData?.loadingNodeId) {
            const loadingNodeId = this._factcheckData.loadingNodeId;
            this.canvas.removeNode(loadingNodeId);
            this.graph.removeNode(loadingNodeId);
            this.saveSession();
        }

        this._factcheckData = null;
    }

    /**
     * Handle select all checkbox change
     * @param {boolean} checked - Whether select all is checked
     */
    handleFactcheckSelectAll(checked) {
        const checkboxes = document.querySelectorAll('#factcheck-claims-list input[type="checkbox"]');
        checkboxes.forEach((cb) => {
            cb.checked = checked;
        });
        this.updateFactcheckSelection();
    }

    /**
     * Update factcheck selection UI and validation
     */
    updateFactcheckSelection() {
        const checkboxes = document.querySelectorAll('#factcheck-claims-list input[type="checkbox"]');
        const selectAll = document.getElementById('factcheck-select-all');
        const selectedClaims = [];

        checkboxes.forEach((cb) => {
            const item = cb.closest('.factcheck-claim-item');
            if (cb.checked) {
                selectedClaims.push(parseInt(cb.value));
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Update select all state and label
        const totalCount = checkboxes.length;
        const selectedCount = selectedClaims.length;
        selectAll.checked = selectedCount === totalCount;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;

        // Update the label text based on state
        const labelText = selectAll.parentElement.querySelector('.checkbox-text');
        if (labelText) {
            labelText.textContent = selectedCount === totalCount ? 'Deselect All' : 'Select All';
        }

        // Update count display
        const countEl = document.getElementById('factcheck-selection-count');
        const isValid = selectedCount >= 1;

        countEl.textContent = `${selectedCount} of ${totalCount} selected`;
        countEl.classList.toggle('valid', isValid);
        countEl.classList.toggle('invalid', !isValid);

        // Show/hide limit warning (informational, not blocking)
        const warningEl = document.getElementById('factcheck-limit-warning');
        if (warningEl) {
            warningEl.style.display = selectedCount > 5 ? 'inline' : 'none';
        }

        // Enable/disable execute button (only require at least 1 selected)
        document.getElementById('factcheck-execute-btn').disabled = !isValid;
    }

    /**
     * Execute factcheck from modal with selected claims
     */
    async executeFactcheckFromModal() {
        if (!this._factcheckData) return;

        const checkboxes = document.querySelectorAll('#factcheck-claims-list input[type="checkbox"]:checked');
        const selectedIndices = Array.from(checkboxes).map((cb) => parseInt(cb.value));
        const selectedClaims = selectedIndices.map((i) => this._factcheckData.claims[i]);

        // Store data before closing modal (close nullifies _factcheckData)
        const { parentIds, model, apiKey, loadingNodeId } = this._factcheckData;

        // Close modal (not cancelled - we're executing)
        this.closeFactcheckModal(false);

        // Execute with selected claims, reusing the loading node
        await this.executeFactcheck(selectedClaims, parentIds, model, apiKey, loadingNodeId);
    }

    /**
     * Execute factcheck for the given claims
     * Creates a FACTCHECK node (or reuses existing) and verifies each claim in parallel
     * @param {string[]} claims - Array of claims to verify
     * @param {string[]} parentIds - Parent node IDs
     * @param {string} model - LLM model to use
     * @param {string} apiKey - API key for the model
     * @param {string} [existingNodeId] - Optional existing node ID to reuse
     */
    async executeFactcheck(claims, parentIds, model, apiKey, existingNodeId = null) {
        // Create the claims data with initial state
        const claimsData = claims.map((claim) => ({
            text: claim,
            status: 'checking', // checking | verified | partially_true | misleading | false | unverifiable | error
            verdict: null,
            explanation: null,
            sources: [],
        }));

        const nodeContent = this.buildFactcheckContent(claimsData);

        let factcheckNode;
        if (existingNodeId) {
            // Reuse existing node
            factcheckNode = this.graph.getNode(existingNodeId);
            factcheckNode.claims = claimsData;
            factcheckNode.content = nodeContent;
            this.graph.updateNode(existingNodeId, { content: nodeContent, claims: claimsData });
            this.canvas.renderNode(factcheckNode);
        } else {
            // Create new node
            factcheckNode = createNode(NodeType.FACTCHECK, nodeContent, {
                position: this.graph.autoPosition(parentIds),
                claims: claimsData,
            });

            this.graph.addNode(factcheckNode);
            this.canvas.renderNode(factcheckNode);

            // Connect to parent nodes
            for (const parentId of parentIds) {
                const edge = createEdge(parentId, factcheckNode.id, EdgeType.REFERENCE);
                this.graph.addEdge(edge);
                const parentNode = this.graph.getNode(parentId);
                this.canvas.renderEdge(edge, parentNode.position, factcheckNode.position);
            }

            this.canvas.panToNodeAnimated(factcheckNode.id);
        }

        this.canvas.clearSelection();
        this.saveSession();

        // Verify each claim in parallel
        const verificationPromises = claims.map((claim, index) =>
            this.verifyClaim(factcheckNode.id, index, claim, model, apiKey)
        );

        await Promise.allSettled(verificationPromises);

        // Final save after all verifications complete
        this.saveSession();
    }

    /**
     * Build the content string for a FACTCHECK node
     * @param {Object[]} claimsData - Array of claim data objects
     * @returns {string} - Formatted content for the node
     */
    buildFactcheckContent(claimsData) {
        const lines = [`**FACTCHECK · ${claimsData.length} claim${claimsData.length !== 1 ? 's' : ''}**\n`];

        claimsData.forEach((claim, index) => {
            const badge = this.getVerdictBadge(claim.status);
            lines.push(`${badge} **Claim ${index + 1}:** ${claim.text}`);

            if (claim.status === 'checking') {
                lines.push(`_Checking..._\n`);
            } else if (claim.explanation) {
                lines.push(`${claim.explanation}`);
                if (claim.sources && claim.sources.length > 0) {
                    lines.push(`**Sources:** ${claim.sources.map((s) => `[${s.title}](${s.url})`).join(', ')}`);
                }
                lines.push('');
            }
        });

        return lines.join('\n');
    }

    /**
     * Get the emoji badge for a verdict status
     * @param {string} status - The verdict status
     * @returns {string} - Emoji badge
     */
    getVerdictBadge(status) {
        const badges = {
            checking: '🔄',
            verified: '✅',
            partially_true: '⚠️',
            misleading: '🔶',
            false: '❌',
            unverifiable: '❓',
            error: '⚠️',
        };
        return badges[status] || '❓';
    }

    /**
     * Verify a single claim using web search and LLM analysis
     * @param {string} nodeId - The FACTCHECK node ID
     * @param {number} claimIndex - Index of the claim in the claims array
     * @param {string} claim - The claim text to verify
     * @param {string} model - LLM model to use
     * @param {string} apiKey - API key for the model
     */
    async verifyClaim(nodeId, claimIndex, claim, model, apiKey) {
        const node = this.graph.getNode(nodeId);
        if (!node || !node.claims) return;

        try {
            // 1. Generate search queries for this claim
            const queries = await this.generateFactcheckQueries(claim, model, apiKey);

            // 2. Perform web searches
            const hasExa = storage.hasExaApiKey();
            const exaKey = hasExa ? storage.getExaApiKey() : null;

            const searchResults = [];
            for (const query of queries.slice(0, 3)) {
                // Max 3 queries per claim
                try {
                    let response;
                    if (hasExa) {
                        response = await fetch(apiUrl('/api/exa/search'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                query: query,
                                api_key: exaKey,
                                num_results: 3,
                            }),
                        });
                    } else {
                        response = await fetch(apiUrl('/api/ddg/search'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                query: query,
                                max_results: 5,
                            }),
                        });
                    }

                    if (response.ok) {
                        const data = await response.json();
                        searchResults.push(...data.results);
                    }
                } catch (searchErr) {
                    console.warn('Search query failed:', query, searchErr);
                }
            }

            // Deduplicate results by URL
            const uniqueResults = [];
            const seenUrls = new Set();
            for (const result of searchResults) {
                if (!seenUrls.has(result.url)) {
                    seenUrls.add(result.url);
                    uniqueResults.push(result);
                }
            }

            // 3. Analyze search results to produce verdict
            const verdict = await this.analyzeClaimVerdict(claim, uniqueResults, model, apiKey);

            // 4. Update the claim in the node
            node.claims[claimIndex] = {
                ...node.claims[claimIndex],
                status: verdict.status,
                verdict: verdict.verdict,
                explanation: verdict.explanation,
                sources: verdict.sources,
            };

            // Update node data and re-render with protocol
            const newContent = this.buildFactcheckContent(node.claims);
            this.graph.updateNode(nodeId, { content: newContent, claims: node.claims });
            this.canvas.renderNode(this.graph.getNode(nodeId));
        } catch (err) {
            console.error('Claim verification error:', err);

            // Mark claim as error
            node.claims[claimIndex] = {
                ...node.claims[claimIndex],
                status: 'error',
                explanation: `Verification failed: ${err.message}`,
                sources: [],
            };

            const newContent = this.buildFactcheckContent(node.claims);
            this.graph.updateNode(nodeId, { content: newContent, claims: node.claims });
            this.canvas.renderNode(this.graph.getNode(nodeId));
        }
    }

    /**
     * Extract verifiable claims from input text using LLM
     * @param {string} input - Text containing potential claims
     * @param {string} model - LLM model to use
     * @param {string} apiKey - API key for the model
     * @returns {Promise<string[]>} - Array of extracted claims (max 10)
     */
    async extractFactcheckClaims(input, model) {
        const systemPrompt = `You are a fact-checking assistant. Your task is to extract discrete, verifiable factual claims from the given text.

Rules:
1. Extract factual claims that can potentially be verified through research
2. Each claim should be a single, standalone statement
3. Rephrase fragments into complete, clear statements if needed
4. Maximum 10 claims - prioritize the most significant ones
5. Be inclusive - if something looks like a factual assertion, include it
6. Political statements about countries' actions or positions ARE verifiable claims

Respond with a JSON array of claim strings. Example:
["The Eiffel Tower is 330 meters tall", "Paris is the capital of France"]

If the input contains no factual content at all (e.g., just greetings or questions), respond with an empty array: []`;

        console.log('[Factcheck] Extracting claims from:', input);

        // Get API key (may be null in admin mode, backend handles it)
        const apiKey = chat.getApiKeyForModel(model);

        const response = await chat.sendMessageNonStreaming(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: input },
            ],
            model,
            apiKey
        );

        console.log('[Factcheck] LLM response:', response);

        try {
            // Parse JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const claims = JSON.parse(jsonMatch[0]);
                console.log('[Factcheck] Parsed claims:', claims);
                return claims.filter((c) => typeof c === 'string' && c.trim().length > 0);
            }
            console.warn('[Factcheck] No JSON array found in response');
            return [];
        } catch (e) {
            console.warn('[Factcheck] Failed to parse claims:', e);
            return [];
        }
    }

    /**
     * Generate search queries to verify a claim
     * @param {string} claim - The claim to verify
     * @param {string} model - LLM model to use
     * @param {string} apiKey - API key for the model
     * @returns {Promise<string[]>} - Array of search queries (2-3)
     */
    async generateFactcheckQueries(claim, model, apiKey) {
        const systemPrompt = `You are a fact-checking assistant. Generate 2-3 search queries to verify the given claim.

Guidelines:
1. Create queries that would find authoritative sources (news, official documents, Wikipedia, etc.)
2. Include the key entities and facts from the claim
3. Vary query phrasing to find different perspectives
4. Add keywords like "fact check", "true", or "false" if helpful

Respond with a JSON array of query strings. Example:
["Eiffel Tower height meters", "How tall is Eiffel Tower Wikipedia", "Eiffel Tower official dimensions"]`;

        const response = await chat.sendMessageNonStreaming(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: claim },
            ],
            model,
            apiKey
        );

        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const queries = JSON.parse(jsonMatch[0]);
                return queries.filter((q) => typeof q === 'string' && q.trim().length > 0);
            }
            return [claim]; // Fallback to claim itself as query
        } catch (e) {
            console.warn('Failed to parse queries:', e);
            return [claim];
        }
    }

    /**
     * Analyze search results to produce a verdict for a claim
     * @param {string} claim - The claim being verified
     * @param {Object[]} searchResults - Array of search results with title, url, snippet
     * @param {string} model - LLM model to use
     * @param {string} apiKey - API key for the model
     * @returns {Promise<Object>} - Verdict object with status, explanation, sources
     */
    async analyzeClaimVerdict(claim, searchResults, model, apiKey) {
        if (searchResults.length === 0) {
            return {
                status: 'unverifiable',
                verdict: 'UNVERIFIABLE',
                explanation: 'No relevant sources found to verify this claim.',
                sources: [],
            };
        }

        // Format search results for the prompt
        const resultsText = searchResults
            .slice(0, 8)
            .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet || ''}`)
            .join('\n\n');

        const systemPrompt = `You are a fact-checking assistant. Analyze the search results to verify the given claim.

Your verdict must be one of:
- VERIFIED: The claim is accurate and supported by reliable sources
- PARTIALLY_TRUE: The claim is mostly correct but contains inaccuracies or missing context
- MISLEADING: The claim is technically true but presented in a misleading way
- FALSE: The claim is factually incorrect
- UNVERIFIABLE: Cannot determine truth due to lack of reliable sources

Respond in this exact JSON format:
{
  "verdict": "VERIFIED|PARTIALLY_TRUE|MISLEADING|FALSE|UNVERIFIABLE",
  "explanation": "Brief explanation of why this verdict was reached (1-2 sentences)",
  "sources": [
    {"title": "Source title", "url": "https://example.com"}
  ]
}

Include only the most relevant sources (max 3) that support your verdict.`;

        const userPrompt = `CLAIM: ${claim}

SEARCH RESULTS:
${resultsText}`;

        const response = await chat.sendMessageNonStreaming(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            model,
            apiKey
        );

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                const statusMap = {
                    VERIFIED: 'verified',
                    PARTIALLY_TRUE: 'partially_true',
                    MISLEADING: 'misleading',
                    FALSE: 'false',
                    UNVERIFIABLE: 'unverifiable',
                };
                return {
                    status: statusMap[result.verdict] || 'unverifiable',
                    verdict: result.verdict,
                    explanation: result.explanation || 'No explanation provided.',
                    sources: Array.isArray(result.sources) ? result.sources.slice(0, 3) : [],
                };
            }
            throw new Error('No JSON found in response');
        } catch (e) {
            console.warn('Failed to parse verdict:', e);
            return {
                status: 'unverifiable',
                verdict: 'UNVERIFIABLE',
                explanation: 'Failed to analyze search results.',
                sources: [],
            };
        }
    }
}

export { FactcheckFeature };
