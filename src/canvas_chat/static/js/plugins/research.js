/**
 * Research Feature Module
 *
 * Handles the /search and /research commands.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */

import { NodeType, EdgeType, createNode, createEdge } from '../graph-types.js';
import { storage } from '../storage.js';
import { readSSEStream, normalizeText } from '../sse.js';
import { apiUrl } from '../utils.js';
import { FeaturePlugin } from '../feature-plugin.js';
import { fetchUrlContent } from '../web-grounding.js';

/** @type {number} */
const MAX_RESEARCH_ACTIVITY_LINES = 300;

/**
 * Max characters of a fetched page stored on a "View content" child node.
 * Bounds per-result size for both display and reply-context injection.
 * @type {number}
 */
const SEARCH_PAGE_BODY_MAX_CHARS = 8000;

/**
 * Append a line to the research activity log, trimming oldest lines when over budget.
 * @param {string|undefined} currentLog
 * @param {string} line
 * @returns {string}
 */
function appendResearchActivityLine(currentLog, line) {
    const trimmed = (line || '').trim();
    if (!trimmed) {
        return currentLog || '';
    }
    const prev = currentLog || '';
    const lines = prev ? prev.split('\n') : [];
    lines.push(trimmed);
    while (lines.length > MAX_RESEARCH_ACTIVITY_LINES) {
        lines.shift();
    }
    return lines.join('\n');
}

/**
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function truncateForActivityLog(s, max = 140) {
    if (!s || s.length <= max) {
        return s;
    }
    return `${s.slice(0, max - 1)}…`;
}

/**
 * ResearchFeature - Handles search and research commands with Exa/DuckDuckGo.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
class ResearchFeature extends FeaturePlugin {
    /**
     * Create a ResearchFeature instance.
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);

        // Research-specific dependencies (not in base FeaturePlugin)
        this.getModelPicker = () => context.modelPicker;
        this.showSettingsModal = () => this.modalManager.showSettingsModal();
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     */
    async onLoad() {
        console.log('[ResearchFeature] Loaded');
    }

    /**
     * Refresh or create the research activity output panel after graph updates.
     * @spec RSCH-REQ-005
     * @param {string} nodeId
     */
    _refreshResearchActivityPanel(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) {
            return;
        }
        this.canvas.ensureOutputPanelContent(nodeId, node);
    }

    // ------------------------------------------------------------------------
    // Search results carousel (drawer on the SEARCH node)
    // ------------------------------------------------------------------------
    // The SearchNode protocol renders the carousel and emits canvas events;
    // ResearchFeature owns the logic below. Result state lives on the node as a
    // JSON string (`searchResults`) plus `searchCarouselIndex`.

    /**
     * Canvas event handlers for the search results carousel.
     * @returns {Object}
     */
    getCanvasEventHandlers() {
        return {
            searchPrevResult: (nodeId) => this._searchStep(nodeId, -1),
            searchNextResult: (nodeId) => this._searchStep(nodeId, 1),
            searchToggleSelect: (nodeId) => this._searchToggleSelect(nodeId),
            searchViewContent: (nodeId) => this._searchViewContent(nodeId),
        };
    }

    /**
     * Refresh (or create) the SEARCH node's results drawer after a state change.
     * @param {string} nodeId
     */
    _refreshSearchPanel(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;
        this.canvas.ensureOutputPanelContent(nodeId, node);
    }

    /**
     * Read this node's search results array (parsed from JSON; [] on failure).
     * @param {string} nodeId
     * @returns {Array<Object>}
     */
    _getSearchResults(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node || !node.searchResults) return [];
        try {
            const parsed = JSON.parse(node.searchResults);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    /**
     * Persist search results back to the node and refresh the drawer.
     * @param {string} nodeId
     * @param {Array<Object>} results
     */
    _setSearchResults(nodeId, results) {
        this.graph.updateNode(nodeId, { searchResults: JSON.stringify(results) });
        this._refreshSearchPanel(nodeId);
        this.saveSession();
    }

    /**
     * Move the carousel by `delta`, clamping to the result range.
     * @param {string} nodeId
     * @param {number} delta
     */
    _searchStep(nodeId, delta) {
        const results = this._getSearchResults(nodeId);
        if (results.length === 0) return;
        const current = Number(this.graph.getNode(nodeId).searchCarouselIndex) || 0;
        const next = Math.max(0, Math.min(results.length - 1, current + delta));
        if (next === current) return;
        this.graph.updateNode(nodeId, { searchCarouselIndex: next });
        this._refreshSearchPanel(nodeId);
        this.saveSession();
    }

    /**
     * Toggle the current result's `selected` flag (include-in-context).
     * @param {string} nodeId
     */
    _searchToggleSelect(nodeId) {
        const node = this.graph.getNode(nodeId);
        const results = this._getSearchResults(nodeId);
        const idx = Math.min(Number(node.searchCarouselIndex) || 0, results.length - 1);
        if (idx < 0 || idx >= results.length) return;
        results[idx] = { ...results[idx], selected: !results[idx].selected };
        this._setSearchResults(nodeId, results);
    }

    /**
     * Fetch the current result's page and create an opt-in child REFERENCE node
     * showing the page text, linked to the SEARCH node. Marks the result
     * `expanded` so the carousel reflects state and context uses the full text.
     *
     * Robustness: an in-flight `fetching` flag (stored on the result) guards
     * against double-click duplicates; the latest results are re-read before
     * writing back so concurrent checkbox toggles aren't clobbered; a failed
     * fetch does not flip `expanded` (so the user can retry).
     * @param {string} nodeId
     */
    async _searchViewContent(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;
        const results = this._getSearchResults(nodeId);
        const idx = Math.min(Number(node.searchCarouselIndex) || 0, results.length - 1);
        const result = results[idx];
        if (!result || !result.url) return;
        if (result.fetching) return; // in-flight guard against duplicate child nodes

        // Already expanded: focus the existing child. If the child was deleted,
        // reset the stale flag and fall through to re-fetch.
        if (result.expanded) {
            const child = this._findExpandedChild(nodeId, result.url);
            if (child) {
                this.canvas.zoomToSelectionAnimated([child.id], 0.8, 300);
                return;
            }
        }

        // Mark in-flight and refresh the drawer (button shows "Fetching…").
        this._updateResult(nodeId, idx, { fetching: true });

        let pageText = '';
        try {
            const fetched = await fetchUrlContent(result.url);
            pageText = (fetched && fetched.content) || '';
        } catch (err) {
            console.warn('[ResearchFeature] view-content fetch failed:', err);
        } finally {
            // Re-read the latest results so we don't clobber checkbox toggles
            // made during the await, then clear the in-flight flag.
            const latest = this._getSearchResults(nodeId);
            if (latest[idx]) {
                latest[idx] = { ...latest[idx], fetching: false, expanded: pageText.length > 0 };
                this.graph.updateNode(nodeId, { searchResults: JSON.stringify(latest) });
                this._refreshSearchPanel(nodeId);
            }
        }

        // Nothing to show if the fetch failed — the result stays expandable.
        if (!pageText) return;

        if (pageText.length > SEARCH_PAGE_BODY_MAX_CHARS) {
            pageText = pageText.slice(0, SEARCH_PAGE_BODY_MAX_CHARS);
        }

        // Create the child REFERENCE node carrying the page text (+ url for dedup).
        // autoPosition stacks each new child instead of overlapping them.
        const pos = this.graph.autoPosition([nodeId], NodeType.REFERENCE);
        const childNode = createNode(
            NodeType.REFERENCE,
            `**[${result.title}](${result.url})**\n\n${pageText}`
        );
        childNode.url = result.url;
        childNode.position = pos;
        this.graph.addNode(childNode);
        const edge = createEdge(nodeId, childNode.id, EdgeType.SEARCH_RESULT);
        this.graph.addEdge(edge);
        this.canvas.renderNode(childNode);
        this.canvas.renderEdge(edge, this.graph.getNode(nodeId).position, childNode.position);
        this.updateCollapseButtonForNode?.(nodeId);

        this.canvas.zoomToSelectionAnimated([childNode.id], 0.8, 300);
        this.saveSession();
    }

    /**
     * Merge a patch into one result entry, re-reading the latest array first so
     * concurrent edits to other entries are preserved.
     * @param {string} nodeId
     * @param {number} idx
     * @param {Object} patch
     */
    _updateResult(nodeId, idx, patch) {
        const latest = this._getSearchResults(nodeId);
        if (!latest[idx]) return;
        latest[idx] = { ...latest[idx], ...patch };
        this.graph.updateNode(nodeId, { searchResults: JSON.stringify(latest) });
        this._refreshSearchPanel(nodeId);
    }

    /**
     * Find an existing expanded child REFERENCE node for a URL, if any.
     * @param {string} parentId
     * @param {string} url
     * @returns {Object|undefined}
     */
    _findExpandedChild(parentId, url) {
        return this.graph.getChildren(parentId).find((c) => c.type === NodeType.REFERENCE && c.url === url);
    }

    /**
     * Handle the /search command: store results in a carousel drawer on a single
     * SEARCH node (no REFERENCE-node fan-out). See getCanvasEventHandlers for the
     * carousel interactions (prev/next, context checkbox, view content).
     * @param {string} command - The slash command (e.g., '/search')
     * @param {string} args - Text after the command
     * @param {Object} contextObj - Additional context (e.g., { text: selectedNodesContent })
     */
    async handleSearch(command, args, contextObj) {
        const query = args.trim();
        const selectedContext = contextObj?.text || null;

        console.log('[Research] Search with:', { command, query, selectedContext });

        // Check which search provider to use
        const hasExa = storage.hasExaApiKey();
        const exaKey = hasExa ? storage.getExaApiKey() : null;
        const provider = hasExa ? 'Exa' : 'DuckDuckGo';

        // Get selected nodes for positioning (optional)
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create search node with original query initially
        const searchNode = createNode(NodeType.SEARCH, `Searching (${provider}): "${query}"`, {
            position: this.graph.autoPosition(parentIds.length > 0 ? parentIds : []),
        });

        this.graph.addNode(searchNode);
        this.canvas.panToNodeAnimated(searchNode.id);

        // Create edges from parents only if they exist
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, searchNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(edge);
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, searchNode.position);
        }

        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        try {
            let effectiveQuery = query;

            // If selectedContext is provided, use LLM to generate a better search query
            if (selectedContext && selectedContext.trim()) {
                this.canvas.updateNodeContent(searchNode.id, `Refining search query...`, true);

                const refineResponse = await fetch(apiUrl('/api/refine-query'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildLLMRequest({
                            user_query: query,
                            context: selectedContext,
                            command_type: 'search',
                        })
                    ),
                });

                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    // Only use refined query if it's non-empty
                    if (refineData.refined_query && refineData.refined_query.trim()) {
                        effectiveQuery = refineData.refined_query;
                        // Update node to show what we're actually searching for
                        this.canvas.updateNodeContent(
                            searchNode.id,
                            `Searching (${provider}): "${effectiveQuery}"`,
                            true
                        );
                    }
                }
            }

            // Call appropriate search API based on provider
            let response;
            if (hasExa) {
                response = await fetch(apiUrl('/api/exa/search'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: effectiveQuery,
                        api_key: exaKey,
                        num_results: 5,
                    }),
                });
            } else {
                response = await fetch(apiUrl('/api/ddg/search'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: effectiveQuery,
                        max_results: 10,
                    }),
                });
            }

            if (!response.ok) {
                throw new Error(`Search failed: ${response.statusText}`);
            }

            const data = await response.json();

            // Update search node with result count (show both original and effective query if different)
            let searchContent;
            if (effectiveQuery !== query) {
                searchContent = `**Search (${provider}):** "${query}"\n*Searched for: "${effectiveQuery}"*\n\n*Found ${data.num_results} results*`;
            } else {
                searchContent = `**Search (${provider}):** "${query}"\n\n*Found ${data.num_results} results*`;
            }

            // Add one-time DDG tip for first-time users
            if (!hasExa && !sessionStorage.getItem('ddg-tip-shown')) {
                searchContent +=
                    '\n\n---\n*Tip: For richer search with content extraction, add an Exa API key in Settings.*';
                sessionStorage.setItem('ddg-tip-shown', 'true');
            }

            this.canvas.updateNodeContent(searchNode.id, searchContent, false);
            this.graph.updateNode(searchNode.id, { content: searchContent });

            // Store results on the node as a JSON string (CRDT-safe primitive).
            // All results default to selected=true so they feed reply context;
            // the user curates via the drawer checkboxes. No fan-out nodes are
            // created — results live in the SEARCH node's carousel drawer.
            const searchResults = (data.results || []).map((r) => ({
                title: r.title || '',
                url: r.url || '',
                snippet: r.snippet || '',
                selected: true,
                expanded: false,
            }));
            this.graph.updateNode(searchNode.id, {
                searchResults: JSON.stringify(searchResults),
                searchCarouselIndex: 0,
            });
            this._refreshSearchPanel(searchNode.id);

            this.saveSession();
        } catch (err) {
            const errorContent = `**Search (${provider}):** "${query}"\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(searchNode.id, errorContent, false);
            this.graph.updateNode(searchNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    /**
     * Handle the /research command or internal continue call
     *
     * Supports two calling patterns:
     * 1. Slash command: handleResearch(command, args, contextObj)
     * 2. Internal continue: handleResearch(instructions, context, existingNodeId)
     *
     * @param {string} param1 - Command string (slash) or instructions (internal)
     * @param {string|Object} param2 - Args (slash) or context (internal)
     * @param {Object|string} param3 - Context object (slash) or existingNodeId (internal)
     */
    async handleResearch(param1, param2, param3) {
        // Detect calling pattern
        let instructions, selectedContext, existingNodeId;

        if (param1 === '/research' || param1 === '/search') {
            // Slash command pattern: (command, args, contextObj)
            instructions = param2.trim();
            selectedContext = param3?.text || null;
            existingNodeId = null;
            console.log('[Research] Command with:', { param1, instructions, selectedContext });
        } else {
            // Internal continue pattern: (instructions, context, existingNodeId)
            instructions = param1;
            selectedContext = param2 || null;
            existingNodeId = param3 || null;
            console.log('[Research] Internal with:', { instructions, selectedContext, existingNodeId });
        }

        const hasExa = storage.hasExaApiKey();
        const exaKey = hasExa ? storage.getExaApiKey() : null;

        // Get the model being used (Exa uses 'exa-research', DDG uses selected model)
        const model = hasExa ? 'exa-research' : this.getModelPicker().value;

        let researchNode;
        const providerLabel = hasExa ? '' : ' (DDG)';

        if (existingNodeId) {
            // Continue on existing node
            researchNode = this.graph.getNode(existingNodeId);
            if (!researchNode || researchNode.type !== NodeType.RESEARCH) {
                console.error('Invalid existing node for research continue');
                return;
            }
            // Update model if needed
            if (researchNode.model !== model) {
                this.graph.updateNode(existingNodeId, { model: model });
                this.canvas.renderNode(researchNode);
            }
            // Reset content to show we're restarting
            const restartContent = `**Research${providerLabel}:** ${instructions}\n\n*Restarting research...*`;
            this.canvas.updateNodeContent(existingNodeId, restartContent, true);
            this.graph.updateNode(existingNodeId, {
                content: restartContent,
                researchActivityLog: '',
                researchActivityActive: false,
            });
        } else {
            // Create new research node
            // Get selected nodes for positioning (optional)
            const parentIds = this.canvas.getSelectedNodeIds();

            // Create research node with original instructions initially
            researchNode = createNode(
                NodeType.RESEARCH,
                `**Research${providerLabel}:** ${instructions}\n\n*Starting research...*`,
                {
                    position: this.graph.autoPosition(parentIds.length > 0 ? parentIds : []),
                    width: 500, // Research nodes are wider for markdown reports
                    model: model, // Store model for display in header
                }
            );

            this.graph.addNode(researchNode);
            this.canvas.panToNodeAnimated(researchNode.id);

            // Create edges from parents only if they exist
            for (const parentId of parentIds) {
                const edge = createEdge(parentId, researchNode.id, EdgeType.REFERENCE);
                this.graph.addEdge(edge);
                const parentNode = this.graph.getNode(parentId);
                this.canvas.renderEdge(edge, parentNode.position, researchNode.position);
            }

            this.canvas.clearSelection();
            this.saveSession();
            this.updateEmptyState();
        }

        // Create abort controller for stop button support
        const abortController = new AbortController();

        // Register with StreamingManager for unified stop/continue handling
        const nodeId = researchNode.id;
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'research',
            context: {
                type: 'research',
                originalInstructions: instructions,
                originalContext: selectedContext,
            },
            onContinue: async (nodeId, state, _newAbortController) => {
                // Continue research from where it left off
                await this.handleResearch(
                    state.context.originalInstructions,
                    state.context.originalContext,
                    nodeId // Pass existing node ID to continue on same node
                );
            },
        });
        // StreamingManager auto-shows stop button

        try {
            let effectiveInstructions = instructions;

            // If selectedContext is provided, use LLM to generate better research instructions
            if (selectedContext && selectedContext.trim()) {
                this.canvas.updateNodeContent(
                    nodeId,
                    `**Research${providerLabel}:** ${instructions}\n\n*Refining research instructions...*`,
                    true
                );

                const refineResponse = await fetch(apiUrl('/api/refine-query'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildLLMRequest({
                            user_query: instructions,
                            context: selectedContext,
                            command_type: 'research',
                        })
                    ),
                });

                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    // Only use refined query if it's non-empty
                    if (refineData.refined_query && refineData.refined_query.trim()) {
                        effectiveInstructions = refineData.refined_query;
                        // Update node to show what we're actually researching
                        this.canvas.updateNodeContent(
                            nodeId,
                            `**Research${providerLabel}:** ${instructions}\n*Researching: "${effectiveInstructions}"*\n\n*Starting research...*`,
                            true
                        );
                    }
                }
            }

            // Call research API (SSE stream): Exa if configured, otherwise DDG fallback
            let response;
            if (hasExa) {
                response = await fetch(apiUrl('/api/exa/research'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instructions: effectiveInstructions,
                        api_key: exaKey,
                        model: 'exa-research',
                    }),
                    signal: abortController.signal,
                });
            } else {
                response = await fetch(apiUrl('/api/ddg/research'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        this.buildLLMRequest({
                            instructions: effectiveInstructions,
                            context: selectedContext || null,
                            max_iterations: 4,
                            max_sources: 40,
                        })
                    ),
                    signal: abortController.signal,
                });
            }

            if (!response.ok) {
                throw new Error(`Research failed: ${response.statusText}`);
            }

            // Parse SSE stream using shared utility
            // Capture values in closure to prevent issues with parallel research tasks
            const capturedInstructions = instructions;
            const capturedEffectiveInstructions = effectiveInstructions;
            const capturedProviderLabel = providerLabel;

            // Show both original and refined instructions if different
            let reportHeader;
            if (capturedEffectiveInstructions !== capturedInstructions) {
                reportHeader = `**Research${capturedProviderLabel}:** ${capturedInstructions}\n*Researching: "${capturedEffectiveInstructions}"*\n\n`;
            } else {
                reportHeader = `**Research${capturedProviderLabel}:** ${capturedInstructions}\n\n`;
            }
            let reportContent = reportHeader;
            let sources = [];
            let ddgFinalReport = '';

            // While streaming: keep the node body minimal (topic + short hint). Status, sources, and
            // per-source lines live only in the activity drawer — avoids duplicating the same text.
            const streamingPlaceholderBody = `${reportHeader}\n\n*In progress…*`;

            this.graph.updateNode(nodeId, {
                researchActivityActive: true,
                researchActivityLog: appendResearchActivityLine('', 'Starting research…'),
                content: streamingPlaceholderBody,
            });
            this.canvas.updateNodeContent(nodeId, streamingPlaceholderBody, true);
            this._refreshResearchActivityPanel(nodeId);

            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'status') {
                        const line = data.trim();
                        const n = this.graph.getNode(nodeId);
                        const nextLog = appendResearchActivityLine(n?.researchActivityLog || '', line);
                        this.graph.updateNode(nodeId, { researchActivityLog: nextLog });
                        this._refreshResearchActivityPanel(nodeId);
                    } else if (eventType === 'content') {
                        if (!hasExa) {
                            // DDG fallback sends the final report as one payload
                            ddgFinalReport = data;
                            reportContent = reportHeader + ddgFinalReport;
                            this.canvas.updateNodeContent(nodeId, reportContent, true);
                            this.graph.updateNode(nodeId, { content: reportContent });
                        } else {
                            // Exa sends report chunks progressively
                            if (reportContent.length > reportHeader.length) {
                                reportContent += '\n\n---\n\n';
                            }
                            reportContent += data;
                            this.canvas.updateNodeContent(nodeId, reportContent, true);
                            this.graph.updateNode(nodeId, { content: reportContent });
                        }
                    } else if (eventType === 'source') {
                        // DDG fallback emits individual sources as JSON (activity log only; not the node body)
                        try {
                            const source = JSON.parse(data);
                            const title = source.title || 'Untitled';
                            const url = source.url || '';
                            const srcLine = `Source: ${title}${url ? ` — ${truncateForActivityLog(url)}` : ''}`;
                            const nSrc = this.graph.getNode(nodeId);
                            const logAfterSrc = appendResearchActivityLine(nSrc?.researchActivityLog || '', srcLine);
                            this.graph.updateNode(nodeId, { researchActivityLog: logAfterSrc });
                            this._refreshResearchActivityPanel(nodeId);
                        } catch (e) {
                            console.error('Failed to parse DDG source event:', e);
                        }
                    } else if (eventType === 'sources') {
                        try {
                            sources = JSON.parse(data);
                        } catch (e) {
                            console.error('Failed to parse sources:', e);
                        }
                    }
                },
                onDone: () => {
                    // Clean up streaming state
                    this.streamingManager.unregister(nodeId);

                    this.graph.updateNode(nodeId, { researchActivityActive: false });
                    this._refreshResearchActivityPanel(nodeId);

                    if (!hasExa && ddgFinalReport) {
                        reportContent = reportHeader + ddgFinalReport;
                    }

                    // Normalize the report content
                    reportContent = normalizeText(reportContent);

                    // Add sources to the report if available
                    if (sources.length > 0) {
                        reportContent += '\n\n---\n**Sources:**\n';
                        for (const source of sources) {
                            reportContent += `- [${source.title}](${source.url})\n`;
                        }
                    }
                    this.canvas.updateNodeContent(nodeId, reportContent, false);
                    this.graph.updateNode(nodeId, { content: reportContent });

                    // Generate summary async (don't await)
                    this.generateNodeSummary(nodeId);
                },
                onError: (err) => {
                    // Clean up streaming state on error
                    this.streamingManager.unregister(nodeId);

                    if (err.name === 'AbortError') {
                        const n = this.graph.getNode(nodeId);
                        const log = appendResearchActivityLine(n?.researchActivityLog || '', 'Stopped.');
                        this.graph.updateNode(nodeId, { researchActivityLog: log, researchActivityActive: false });
                        this._refreshResearchActivityPanel(nodeId);
                        return;
                    }
                    throw err;
                },
            });

            this.saveSession();
        } catch (err) {
            // Clean up streaming state
            this.streamingManager.unregister(nodeId);

            // Check if it was aborted (user clicked stop)
            // StreamingManager handles stopped indicator via default onStop behavior
            if (err.name === 'AbortError') {
                const n = this.graph.getNode(nodeId);
                const log = appendResearchActivityLine(n?.researchActivityLog || '', 'Stopped.');
                this.graph.updateNode(nodeId, { researchActivityLog: log, researchActivityActive: false });
                this._refreshResearchActivityPanel(nodeId);
                this.saveSession();
                return;
            }

            // Other errors - use captured instructions to avoid closure issues
            const nErr = this.graph.getNode(nodeId);
            const logErr = appendResearchActivityLine(nErr?.researchActivityLog || '', `Error: ${err.message}`);
            this.graph.updateNode(nodeId, { researchActivityLog: logErr, researchActivityActive: false });
            this._refreshResearchActivityPanel(nodeId);
            const errorContent = `**Research${providerLabel}:** ${instructions}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(nodeId, errorContent, false);
            this.graph.updateNode(nodeId, { content: errorContent });
            this.saveSession();
        }
    }
}

export { ResearchFeature };
