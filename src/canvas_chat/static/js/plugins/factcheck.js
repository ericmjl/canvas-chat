/**
 * Factcheck Plugin (Built-in)
 *
 * Provides factcheck nodes for claim verification with verdicts.
 * This is a self-contained plugin that combines:
 * - FactcheckNode protocol (custom node rendering)
 * - FactcheckFeature (slash command and event handling)
 */

import { NodeType, EdgeType, createNode, createEdge } from '../graph-types.js';
import { storage } from '../storage.js';
import { chat } from '../chat.js';
import { apiUrl } from '../utils.js';
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { FeaturePlugin } from '../feature-plugin.js';

// =============================================================================
// Factcheck Node Protocol
// =============================================================================

/**
 * Factcheck Node Protocol Class
 * Defines how factcheck nodes are rendered and what actions they support.
 */
class FactcheckNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Factcheck';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '🔍';
    }

    /**
     * Get summary text for the node (shown when zoomed out)
     * @param {Canvas} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        const claims = this.node.claims || [];
        const count = claims.length;
        if (count === 0) return 'Fact Check';
        return `Fact Check · ${count} claim${count !== 1 ? 's' : ''}`;
    }

    /**
     * Render the content for the factcheck node
     * @param {Canvas} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        const claims = this.node.claims || [];
        if (claims.length === 0) {
            return canvas.renderMarkdown(this.node.content || 'No claims to verify.');
        }

        // Render accordion-style claims
        const claimsHtml = claims
            .map((claim, index) => {
                const badge = this.getVerdictBadge(claim.status);
                const statusClass = claim.status || 'checking';
                const isChecking = claim.status === 'checking';

                let detailsHtml = '';
                if (!isChecking && claim.explanation) {
                    const sourcesHtml = (claim.sources || [])
                        .map(
                            (s) =>
                                `<a href="${canvas.escapeHtml(s.url)}" target="_blank" rel="noopener">${canvas.escapeHtml(s.title || s.url)}</a>`
                        )
                        .join(', ');

                    detailsHtml = `
                    <div class="factcheck-details">
                        <p>${canvas.escapeHtml(claim.explanation)}</p>
                        ${sourcesHtml ? `<div class="factcheck-sources"><strong>Sources:</strong> ${sourcesHtml}</div>` : ''}
                    </div>
                `;
                }

                return `
                <div class="factcheck-claim ${statusClass}" data-claim-index="${index}">
                    <div class="factcheck-claim-header">
                        <span class="factcheck-badge">${badge}</span>
                        <span class="factcheck-claim-text">${canvas.escapeHtml(claim.text)}</span>
                        ${isChecking ? '<span class="loading-spinner factcheck-inline-spinner"></span>' : '<span class="factcheck-toggle">▼</span>'}
                    </div>
                    ${detailsHtml}
                </div>
            `;
            })
            .join('');

        return `<div class="factcheck-claims">${claimsHtml}</div>`;
    }

    /**
     * Get the verdict badge emoji for a status
     * @param {string} status
     * @returns {string}
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
     * Get action buttons for this node
     * @returns {Array<string>}
     */
    getActions() {
        return [Actions.COPY];
    }

    /**
     * Get CSS classes for content wrapper
     * @returns {string}
     */
    getContentClasses() {
        return 'factcheck-content';
    }

    /**
     * Factcheck-specific event bindings for claim accordion
     * @returns {Array<Object>}
     */
    getEventBindings() {
        return [
            {
                selector: '.factcheck-claim-header',
                multiple: true,
                handler: (_nodeId, e, _canvas) => {
                    const claimEl = e.currentTarget.closest('.factcheck-claim');
                    if (claimEl && !claimEl.classList.contains('checking')) {
                        // Toggle expanded state (multiple can be open)
                        claimEl.classList.toggle('expanded');
                    }
                },
            },
        ];
    }
}

// Register with NodeRegistry
NodeRegistry.register({
    type: 'factcheck',
    protocol: FactcheckNode,
    defaultSize: { width: 640, height: 480 },
});

// Export FactcheckNode for testing
export { FactcheckNode };

// =============================================================================
// Factcheck Feature Plugin
// =============================================================================

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
     * @returns {Promise<void>}
     */
    async onLoad() {
        console.log('[FactcheckFeature] Loaded');

        // Register plugin modal
        const modalTemplate = `
            <div id="factcheck-main-modal" class="modal" style="display: none">
                <div class="modal-content modal-wide">
                    <div class="modal-header">
                        <h2>Select Claims to Verify</h2>
                        <button class="modal-close" id="factcheck-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="factcheck-modal-subtitle" id="factcheck-modal-subtitle">
                            Found multiple claims. Select which ones to fact-check:
                        </p>

                        <div class="factcheck-select-all-group">
                            <label class="factcheck-checkbox-label">
                                <input type="checkbox" id="factcheck-select-all" />
                                <span class="checkbox-text">Select All</span>
                            </label>
                        </div>

                        <div class="factcheck-claims-list" id="factcheck-claims-list">
                            <!-- Claim checkboxes will be populated by JS -->
                        </div>

                        <div class="factcheck-selection-info">
                            <span class="factcheck-selection-count" id="factcheck-selection-count">0 of 0 selected</span>
                            <span class="factcheck-limit-warning" id="factcheck-limit-warning" style="display: none"
                                >⚠️ Verifying many claims may take longer</span
                            >
                        </div>

                        <div class="modal-actions">
                            <button id="factcheck-cancel-btn" class="secondary-btn">Cancel</button>
                            <button id="factcheck-execute-btn" class="primary-btn" disabled>Verify Selected</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = this.modalManager.registerModal('factcheck', 'main', modalTemplate);

        // Setup event listeners
        modal.querySelector('#factcheck-close').addEventListener('click', () => this.closeFactcheckModal(true));
        modal.querySelector('#factcheck-cancel-btn').addEventListener('click', () => this.closeFactcheckModal(true));
        modal.querySelector('#factcheck-execute-btn').addEventListener('click', () => this.executeFactcheckFromModal());
        modal.querySelector('#factcheck-select-all').addEventListener('change', (e) => {
            this.handleFactcheckSelectAll(e.target.checked);
        });
    }

    /**
     * Handle /factcheck slash command - verify claims with web search
     * @param {string} input - The user's input (claim or vague reference)
     * @param {string} context - Optional context from selected nodes
     */
    /**
     * Handle the /factcheck command
     * @param {string} command - The slash command (e.g., '/factcheck')
     * @param {string} args - Text after the command
     * @param {Object} contextObj - Additional context (e.g., { text: selectedNodesContent })
     */
    async handleFactcheck(command, args, contextObj) {
        // Use args as the input, and contextObj.text as additional context from selected nodes
        const input = args.trim();
        const selectedContext = contextObj?.text || null;

        console.log('[Factcheck] Starting with:', {
            command,
            input,
            selectedContext: selectedContext ? `${selectedContext.substring(0, 100)}...` : null,
            selectedContextLength: selectedContext?.length || 0,
        });

        const model = this.getModelPicker().value;

        // Get parent node IDs for positioning (optional)
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create a loading node immediately for feedback
        const loadingNode = createNode(NodeType.FACTCHECK, '🔄 **Analyzing text for claims...**', {
            position: this.graph.autoPosition(parentIds.length > 0 ? parentIds : []),
        });
        this.graph.addNode(loadingNode);

        // Connect to parent nodes only if they exist
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, loadingNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(edge);
        }

        this.canvas.clearSelection();
        this.canvas.panToNodeAnimated(loadingNode.id);

        try {
            // If selectedContext provided but input is vague, refine it
            let effectiveInput = input;
            if (selectedContext && selectedContext.trim() && (!input || input.length < 20)) {
                console.log('[Factcheck] Refining vague input with context');
                this.canvas.updateNodeContent(loadingNode.id, '🔄 **Refining query...**', true);

                const refineResponse = await fetch(apiUrl('/api/refine-query'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildLLMRequest({
                            user_query: input || 'verify this',
                            context: selectedContext,
                            command_type: 'factcheck',
                        })
                    ),
                });
                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    const refined = refineData.refined_query;
                    // If refine returned empty or just the original vague query, use context directly
                    if (
                        !refined ||
                        refined.trim().length === 0 ||
                        refined === input ||
                        refined === 'verify this' ||
                        refined.length < 10
                    ) {
                        console.warn('[Factcheck] Refine returned unhelpful result, using context directly');
                        effectiveInput = selectedContext;
                    } else {
                        effectiveInput = refined;
                        console.log('[Factcheck] Refined to:', effectiveInput);
                    }
                } else {
                    console.warn('[Factcheck] Refine failed, using context directly');
                    effectiveInput = selectedContext;
                }
            }

            // Use selectedContext as input if no direct input provided
            if (!effectiveInput && selectedContext) {
                effectiveInput = selectedContext;
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
        const modal = this.modalManager.getPluginModal('factcheck', 'main');
        const claimsList = modal.querySelector('#factcheck-claims-list');
        const selectAll = modal.querySelector('#factcheck-select-all');

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
        this.modalManager.showPluginModal('factcheck', 'main');
    }

    /**
     * Close the factcheck modal
     * @param {boolean} [cancelled=true] - Whether the modal was cancelled (vs executed)
     */
    closeFactcheckModal(cancelled = true) {
        this.modalManager.hidePluginModal('factcheck', 'main');

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
        const modal = this.modalManager.getPluginModal('factcheck', 'main');
        const checkboxes = modal.querySelectorAll('#factcheck-claims-list input[type="checkbox"]');
        checkboxes.forEach((cb) => {
            cb.checked = checked;
        });
        this.updateFactcheckSelection();
    }

    /**
     * Update factcheck selection UI and validation
     */
    updateFactcheckSelection() {
        const modal = this.modalManager.getPluginModal('factcheck', 'main');
        const checkboxes = modal.querySelectorAll('#factcheck-claims-list input[type="checkbox"]');
        const selectAll = modal.querySelector('#factcheck-select-all');
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
        const countEl = modal.querySelector('#factcheck-selection-count');
        const isValid = selectedCount >= 1;

        countEl.textContent = `${selectedCount} of ${totalCount} selected`;
        countEl.classList.toggle('valid', isValid);
        countEl.classList.toggle('invalid', !isValid);

        // Show/hide limit warning (informational, not blocking)
        const warningEl = modal.querySelector('#factcheck-limit-warning');
        if (warningEl) {
            warningEl.style.display = selectedCount > 5 ? 'inline' : 'none';
        }

        // Enable/disable execute button (only require at least 1 selected)
        modal.querySelector('#factcheck-execute-btn').disabled = !isValid;
    }

    /**
     * Execute factcheck from modal with selected claims
     */
    async executeFactcheckFromModal() {
        if (!this._factcheckData) return;

        const modal = this.modalManager.getPluginModal('factcheck', 'main');
        const checkboxes = modal.querySelectorAll('#factcheck-claims-list input[type="checkbox"]:checked');
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
            // Reuse existing node - preserve existing claims if they exist
            factcheckNode = this.graph.getNode(existingNodeId);
            const existingClaims = factcheckNode.claims || [];

            // If we have existing claims with the same text, preserve their status
            // Otherwise, use the new claims data
            if (existingClaims.length === claimsData.length) {
                // Try to match existing claims by text and preserve their status
                const preservedClaims = claimsData.map((newClaim, index) => {
                    const existingClaim = existingClaims[index];
                    // If text matches and claim is already verified, preserve it
                    if (existingClaim && existingClaim.text === newClaim.text && existingClaim.status !== 'checking') {
                        return existingClaim; // Keep the existing verified claim
                    }
                    return newClaim; // Use new claim (either new text or still checking)
                });
                claimsData = preservedClaims;
            }

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

            // Connect to parent nodes
            for (const parentId of parentIds) {
                const edge = createEdge(parentId, factcheckNode.id, EdgeType.REFERENCE);
                this.graph.addEdge(edge);
            }

            this.canvas.panToNodeAnimated(factcheckNode.id);
        }

        this.canvas.clearSelection();
        this.saveSession();

        // Verify each claim in parallel
        console.log(`[Factcheck] Starting verification of ${claims.length} claims`);
        const verificationPromises = claims.map((claim, index) =>
            this.verifyClaim(factcheckNode.id, index, claim, model, apiKey).catch((err) => {
                console.error(`[Factcheck] Claim ${index + 1} verification failed:`, err);
                // Update node to show error for this claim
                const node = this.graph.getNode(factcheckNode.id);
                if (node && node.claims) {
                    node.claims[index] = {
                        ...node.claims[index],
                        status: 'error',
                        explanation: `Verification failed: ${err.message}`,
                        sources: [],
                    };
                    const newContent = this.buildFactcheckContent(node.claims);
                    this.graph.updateNode(factcheckNode.id, { content: newContent, claims: node.claims });
                    const updatedNode = this.graph.getNode(factcheckNode.id);
                    if (updatedNode) {
                        this.canvas.renderNode(updatedNode);
                    }
                }
            })
        );

        const results = await Promise.allSettled(verificationPromises);
        console.log(
            `[Factcheck] All verifications complete. Results:`,
            results.map((r, i) => ({
                index: i,
                status: r.status,
                error: r.status === 'rejected' ? r.reason : null,
            }))
        );

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
     * @param {string} _apiKey - API key for the model (unused, fetched internally)
     */
    async verifyClaim(nodeId, claimIndex, claim, model, _apiKey) {
        const node = this.graph.getNode(nodeId);
        if (!node || !node.claims) return;

        try {
            // 1. Generate search queries for this claim
            const queries = await this.generateFactcheckQueries(claim, model);

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
            console.log(`[Factcheck] Analyzing verdict for claim ${claimIndex + 1}:`, claim);
            const verdict = await this.analyzeClaimVerdict(claim, uniqueResults, model);
            console.log(`[Factcheck] Verdict for claim ${claimIndex + 1}:`, verdict);

            // 4. Update the claim in the node
            // Get fresh node reference in case it was updated
            const freshNode = this.graph.getNode(nodeId);
            if (!freshNode || !freshNode.claims) {
                console.warn(`[Factcheck] Node ${nodeId} or claims missing after analysis`);
                return;
            }

            // Create a copy of the claims array to avoid mutation issues
            const updatedClaims = [...freshNode.claims];
            updatedClaims[claimIndex] = {
                ...updatedClaims[claimIndex],
                status: verdict.status,
                verdict: verdict.verdict,
                explanation: verdict.explanation,
                sources: verdict.sources,
            };

            // Update node data and re-render with protocol
            const newContent = this.buildFactcheckContent(updatedClaims);
            this.graph.updateNode(nodeId, { content: newContent, claims: updatedClaims });

            // Get the node again after update to ensure we have the latest
            const updatedNode = this.graph.getNode(nodeId);
            if (updatedNode) {
                // Ensure the node's claims array matches what we just set
                updatedNode.claims = updatedClaims;
                this.canvas.renderNode(updatedNode);
                console.log(`[Factcheck] Updated claim ${claimIndex + 1} status to: ${verdict.status}`);
            } else {
                console.error(`[Factcheck] Failed to get node ${nodeId} after update`);
            }
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
7. IMPORTANT: Even simple statements like "The Earth is flat" or "Water boils at 100°C" ARE verifiable claims - include them!
8. If the input is a numbered list (e.g., "1. Claim one\n2. Claim two"), extract each numbered item as a separate claim
9. If the input is a bulleted list, extract each bullet point as a separate claim
10. Strip numbering/bullets and extract the actual claim text

Respond with a JSON array of claim strings. Example:
["The Eiffel Tower is 330 meters tall", "Paris is the capital of France"]

        If the input contains no factual content at all (e.g., ONLY greetings or questions with no assertions), respond with an empty array: []`;

        console.log('[Factcheck] Extracting claims from:', input);

        // API key is fetched internally by chat.sendMessage()

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input },
        ];

        // Use streaming API with onDone callback to get full response
        const response = await new Promise((resolve, reject) => {
            chat.sendMessage(
                messages,
                model,
                null, // onChunk - not needed
                (fullContent) => resolve(fullContent), // onDone - get full response
                (error) => reject(error) // onError
            );
        });

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
     * @returns {Promise<string[]>} - Array of search queries (2-3)
     */
    async generateFactcheckQueries(claim, model) {
        const systemPrompt = `You are a fact-checking assistant. Generate 2-3 search queries to verify the given claim.

Guidelines:
1. Create queries that would find authoritative sources (news, official documents, Wikipedia, etc.)
2. Include the key entities and facts from the claim
3. Vary query phrasing to find different perspectives
4. Add keywords like "fact check", "true", or "false" if helpful

        Respond with a JSON array of query strings. Example:
["Eiffel Tower height meters", "How tall is Eiffel Tower Wikipedia", "Eiffel Tower official dimensions"]`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: claim },
        ];

        // Use streaming API with onDone callback to get full response
        const response = await new Promise((resolve, reject) => {
            chat.sendMessage(
                messages,
                model,
                null,
                (fullContent) => resolve(fullContent),
                (error) => reject(error)
            );
        });

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
     * @returns {Promise<Object>} - Verdict object with status, explanation, sources
     */
    async analyzeClaimVerdict(claim, searchResults, model) {
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

        console.log(`[Factcheck] Calling LLM to analyze verdict for claim: ${claim.substring(0, 50)}...`);

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];

        // Use streaming API with onDone callback to get full response
        const response = await new Promise((resolve, reject) => {
            chat.sendMessage(
                messages,
                model,
                null,
                (fullContent) => resolve(fullContent),
                (error) => reject(error)
            );
        });

        console.log(`[Factcheck] LLM response received (length: ${response.length})`);

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
                const verdictResult = {
                    status: statusMap[result.verdict] || 'unverifiable',
                    verdict: result.verdict,
                    explanation: result.explanation || 'No explanation provided.',
                    sources: Array.isArray(result.sources) ? result.sources.slice(0, 3) : [],
                };
                console.log(`[Factcheck] Parsed verdict result:`, verdictResult);
                return verdictResult;
            }
            console.warn('[Factcheck] No JSON found in LLM response:', response.substring(0, 200));
            throw new Error('No JSON found in response');
        } catch (e) {
            console.warn('[Factcheck] Failed to parse verdict:', e, 'Response:', response.substring(0, 200));
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
