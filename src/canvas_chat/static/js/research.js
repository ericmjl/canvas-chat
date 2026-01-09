/**
 * Research Feature Module
 *
 * Handles the /search and /research commands.
 * Extracted from app.js for modularity.
 *
 * Dependencies (injected via constructor):
 * - graph: CRDTGraph instance
 * - canvas: Canvas instance
 * - saveSession: function to persist session
 * - updateEmptyState: function to update UI empty state
 * - buildLLMRequest: function to build LLM request with base_url
 * - generateNodeSummary: function to generate summary for a node
 * - showSettingsModal: function to show settings modal
 * - getModelPicker: function returning modelPicker element
 * - registerStreaming: function to register abort controller for stop button
 * - unregisterStreaming: function to unregister streaming state
 *
 * Global dependencies:
 * - storage: For Exa API key (hasExaApiKey, getExaApiKey)
 * - createNode, createEdge: Node/edge factory functions
 * - NodeType, EdgeType: Type constants
 * - SSE: Server-sent events utilities
 */

class ResearchFeature {
    /**
     * Create a ResearchFeature instance.
     * @param {Object} context - Dependencies injected from App
     */
    constructor(context) {
        this.graph = context.graph;
        this.canvas = context.canvas;
        this.saveSession = context.saveSession;
        this.updateEmptyState = context.updateEmptyState;
        this.buildLLMRequest = context.buildLLMRequest;
        this.generateNodeSummary = context.generateNodeSummary;
        this.showSettingsModal = context.showSettingsModal;
        this.getModelPicker = context.getModelPicker;
        this.registerStreaming = context.registerStreaming;
        this.unregisterStreaming = context.unregisterStreaming;
    }

    /**
     * Handle search command.
     * @param {string} query - The user's search query
     * @param {string} context - Optional context to help refine the query (e.g., selected text)
     */
    async handleSearch(query, context = null) {
        // Check which search provider to use
        const hasExa = storage.hasExaApiKey();
        const exaKey = hasExa ? storage.getExaApiKey() : null;
        const provider = hasExa ? 'Exa' : 'DuckDuckGo';

        // Get selected nodes for positioning
        let parentIds = this.canvas.getSelectedNodeIds();
        if (parentIds.length === 0) {
            const leaves = this.graph.getLeafNodes();
            if (leaves.length > 0) {
                leaves.sort((a, b) => b.created_at - a.created_at);
                parentIds = [leaves[0].id];
            }
        }

        // Create search node with original query initially
        const searchNode = createNode(NodeType.SEARCH, `Searching (${provider}): "${query}"`, {
            position: this.graph.autoPosition(parentIds)
        });

        this.graph.addNode(searchNode);
        this.canvas.renderNode(searchNode);

        // Create edges from parents
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, searchNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(edge);
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, searchNode.position);
        }

        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        // Smoothly pan to search node
        this.canvas.centerOnAnimated(
            searchNode.position.x + 160,
            searchNode.position.y + 100,
            300
        );

        try {
            let effectiveQuery = query;

            // If context is provided, use LLM to generate a better search query
            if (context && context.trim()) {
                this.canvas.updateNodeContent(searchNode.id, `Refining search query...`, true);

                const refineResponse = await fetch(apiUrl('/api/refine-query'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.buildLLMRequest({
                        user_query: query,
                        context: context,
                        command_type: 'search'
                    }))
                });

                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    effectiveQuery = refineData.refined_query;
                    // Update node to show what we're actually searching for
                    this.canvas.updateNodeContent(searchNode.id, `Searching (${provider}): "${effectiveQuery}"`, true);
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
                        num_results: 5
                    })
                });
            } else {
                response = await fetch(apiUrl('/api/ddg/search'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: effectiveQuery,
                        max_results: 10
                    })
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
                searchContent += '\n\n---\n*Tip: For richer search with content extraction, add an Exa API key in Settings.*';
                sessionStorage.setItem('ddg-tip-shown', 'true');
            }

            this.canvas.updateNodeContent(searchNode.id, searchContent, false);
            this.graph.updateNode(searchNode.id, { content: searchContent });

            // Create reference nodes for each result
            let offsetY = 0;
            for (const result of data.results) {
                const resultContent = `**[${result.title}](${result.url})**\n\n${result.snippet}${result.published_date ? `\n\n*${result.published_date}*` : ''}`;

                const resultNode = createNode(NodeType.REFERENCE, resultContent, {
                    position: {
                        x: searchNode.position.x + 400,
                        y: searchNode.position.y + offsetY
                    }
                });

                this.graph.addNode(resultNode);
                this.canvas.renderNode(resultNode);

                // Edge from search to result
                const edge = createEdge(searchNode.id, resultNode.id, EdgeType.SEARCH_RESULT);
                this.graph.addEdge(edge);
                this.canvas.renderEdge(edge, searchNode.position, resultNode.position);

                offsetY += 200; // Space between result nodes
            }

            this.saveSession();

        } catch (err) {
            const errorContent = `**Search (${provider}):** "${query}"\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(searchNode.id, errorContent, false);
            this.graph.updateNode(searchNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    /**
     * Handle research command.
     * @param {string} instructions - The user's research instructions
     * @param {string} context - Optional context to help refine the instructions (e.g., selected text)
     * @param {string} existingNodeId - Optional existing node ID to update instead of creating new node (for continue)
     */
    async handleResearch(instructions, context = null, existingNodeId = null) {
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
            this.graph.updateNode(existingNodeId, { content: restartContent });
        } else {
            // Create new research node
            // Get selected nodes for positioning
            let parentIds = this.canvas.getSelectedNodeIds();
            if (parentIds.length === 0) {
                const leaves = this.graph.getLeafNodes();
                if (leaves.length > 0) {
                    leaves.sort((a, b) => b.created_at - a.created_at);
                    parentIds = [leaves[0].id];
                }
            }

            // Create research node with original instructions initially
            researchNode = createNode(NodeType.RESEARCH, `**Research${providerLabel}:** ${instructions}\n\n*Starting research...*`, {
                position: this.graph.autoPosition(parentIds),
                width: 500,  // Research nodes are wider for markdown reports
                model: model  // Store model for display in header
            });

            this.graph.addNode(researchNode);
            this.canvas.renderNode(researchNode);

            // Create edges from parents
            for (const parentId of parentIds) {
                const edge = createEdge(parentId, researchNode.id, EdgeType.REFERENCE);
                this.graph.addEdge(edge);
                const parentNode = this.graph.getNode(parentId);
                this.canvas.renderEdge(edge, parentNode.position, researchNode.position);
            }

            this.canvas.clearSelection();
            this.saveSession();
            this.updateEmptyState();

            // Smoothly pan to research node
            this.canvas.centerOnAnimated(
                researchNode.position.x + 250,
                researchNode.position.y + 100,
                300
            );
        }

        // Create abort controller for stop button support
        const abortController = new AbortController();
        this.registerStreaming(researchNode.id, abortController, {
            type: 'research',
            originalInstructions: instructions,
            originalContext: context
        });
        this.canvas.showStopButton(researchNode.id);

        // Capture nodeId early to avoid closure issues with parallel research
        const nodeId = researchNode.id;

        try {
            let effectiveInstructions = instructions;

            // If context is provided, use LLM to generate better research instructions
            if (context && context.trim()) {
                this.canvas.updateNodeContent(nodeId, `**Research${providerLabel}:** ${instructions}\n\n*Refining research instructions...*`, true);

                const refineResponse = await fetch(apiUrl('/api/refine-query'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.buildLLMRequest({
                        user_query: instructions,
                        context: context,
                        command_type: 'research'
                    }))
                });

                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    effectiveInstructions = refineData.refined_query;
                    // Update node to show what we're actually researching
                    this.canvas.updateNodeContent(nodeId, `**Research${providerLabel}:** ${instructions}\n*Researching: "${effectiveInstructions}"*\n\n*Starting research...*`, true);
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
                        model: 'exa-research'
                    }),
                    signal: abortController.signal
                });
            } else {
                response = await fetch(apiUrl('/api/ddg/research'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.buildLLMRequest({
                        instructions: effectiveInstructions,
                        context: context || null,
                        max_iterations: 4,
                        max_sources: 40
                    })),
                    signal: abortController.signal
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
            let lastStatus = '';
            let ddgSourcesMd = '';
            let ddgSourceCount = 0;
            let ddgFinalReport = '';

            await SSE.readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'status') {
                        lastStatus = data.trim();
                        if (!hasExa) {
                            const sourcesBlock = ddgSourceCount > 0
                                ? `## Sources (${ddgSourceCount})\n\n${ddgSourcesMd}`
                                : '';
                            const statusContent = `${reportHeader}*${lastStatus}*\n\n${sourcesBlock}`.trim();
                            this.canvas.updateNodeContent(nodeId, statusContent, true);
                        } else {
                            const statusContent = `${reportHeader}*${lastStatus}*`;
                            this.canvas.updateNodeContent(nodeId, statusContent, true);
                        }
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
                        // DDG fallback emits individual sources as JSON
                        try {
                            const source = JSON.parse(data);
                            ddgSourceCount += 1;

                            const title = source.title || 'Untitled';
                            const url = source.url || '';
                            const summary = source.summary || '';
                            const query = source.query ? `\n\n*Query:* \`${source.query}\`` : '';

                            ddgSourcesMd += `### [${title}](${url})${query}\n\n${summary}\n\n---\n\n`;

                            // While the loop runs, show status + growing sources list
                            const sourcesBlock = `## Sources (${ddgSourceCount})\n\n${ddgSourcesMd}`;
                            const statusBlock = lastStatus ? `*${lastStatus}*\n\n` : '';
                            const content = `${reportHeader}${statusBlock}${sourcesBlock}`;
                            this.canvas.updateNodeContent(nodeId, content, true);
                            this.graph.updateNode(nodeId, { content: content });
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
                    this.unregisterStreaming(nodeId);
                    this.canvas.hideStopButton(nodeId);

                    if (!hasExa && ddgFinalReport) {
                        reportContent = reportHeader + ddgFinalReport;
                    }

                    // Normalize the report content
                    reportContent = SSE.normalizeText(reportContent);

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
                    this.unregisterStreaming(nodeId);
                    this.canvas.hideStopButton(nodeId);

                    // Re-throw if not an abort error
                    if (err.name !== 'AbortError') {
                        throw err;
                    }
                }
            });

            this.saveSession();

        } catch (err) {
            // Clean up streaming state
            const nodeId = researchNode.id;
            this.unregisterStreaming(nodeId);
            this.canvas.hideStopButton(nodeId);

            // Check if it was aborted (user clicked stop)
            if (err.name === 'AbortError') {
                // Add stopped indicator to current content
                const node = this.graph.getNode(nodeId);
                if (node) {
                    const stoppedContent = node.content + '\n\n*[Research stopped]*';
                    this.canvas.updateNodeContent(nodeId, stoppedContent, false);
                    this.graph.updateNode(nodeId, { content: stoppedContent });
                }
                this.saveSession();
                return;
            }

            // Other errors - use captured instructions to avoid closure issues
            const errorContent = `**Research${providerLabel}:** ${instructions}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(nodeId, errorContent, false);
            this.graph.updateNode(nodeId, { content: errorContent });
            this.saveSession();
        }
    }
}

// Export for browser
window.ResearchFeature = ResearchFeature;
