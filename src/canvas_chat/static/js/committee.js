/**
 * Committee Feature Module
 *
 * Handles the /committee slash command which consults multiple LLMs
 * and synthesizes their responses.
 */

import { NodeType, EdgeType, createNode, createEdge } from './graph-types.js';
import { FeaturePlugin } from './feature-plugin.js';
import { storage } from './storage.js';
import { readSSEStream } from './sse.js';
import { apiUrl } from './utils.js';

/**
 * CommitteeFeature class manages committee consultation functionality.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
class CommitteeFeature extends FeaturePlugin {
    /**
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);

        // Committee state
        this._committeeData = null;
        this._activeCommittee = null;
    }

    /**
     * Lifecycle hook: called when plugin is loaded
     */
    async onLoad() {
        console.log('[CommitteeFeature] Loaded');
    }

    /**
     * Event subscriptions for this feature
     */
    getEventSubscriptions() {
        return {
            // Listen for committee-related events if needed
        };
    }

    /**
     * Handle /committee slash command - show modal to configure LLM committee.
     * This is the main slash command handler called by FeatureRegistry.
     * @param {string} command - The command string (e.g., '/committee')
     * @param {string} args - The question to ask the committee
     * @param {Object} context - Execution context (selected nodes, etc.)
     */
    async handleCommittee(command, args, context) {
        const question = args.trim();
        const contextText = context?.text || null;

        // Store data for the modal
        this._committeeData = {
            question: question,
            context: contextText,
            selectedModels: [],
            chairmanModel: this.modelPicker.value,
            includeReview: false,
        };

        // Get the question textarea and populate it
        const questionTextarea = document.getElementById('committee-question');
        questionTextarea.value = question;

        // Populate model checkboxes
        const modelsGrid = document.getElementById('committee-models-grid');
        modelsGrid.innerHTML = '';

        // Get recently used models for pre-selection
        const recentModels = storage.getRecentModels();
        const currentModel = this.modelPicker.value;

        // Get all available models from the model picker
        const availableModels = Array.from(this.modelPicker.options).map((opt) => ({
            id: opt.value,
            name: opt.textContent,
        }));

        // Pre-select up to 3 models: current + 2 most recent (excluding current)
        const preSelected = new Set();
        preSelected.add(currentModel);
        for (const modelId of recentModels) {
            if (preSelected.size >= 3) break;
            if (availableModels.some((m) => m.id === modelId)) {
                preSelected.add(modelId);
            }
        }

        // Create checkboxes for each model
        for (const model of availableModels) {
            const item = document.createElement('label');
            item.className = 'committee-model-item';
            if (preSelected.has(model.id)) {
                item.classList.add('selected');
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = model.id;
            checkbox.checked = preSelected.has(model.id);
            checkbox.addEventListener('change', () => this.updateCommitteeSelection());

            const nameSpan = document.createElement('span');
            nameSpan.className = 'model-name';
            nameSpan.textContent = model.name;

            item.appendChild(checkbox);
            item.appendChild(nameSpan);
            modelsGrid.appendChild(item);

            // Click on label toggles checkbox
            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        }

        // Populate chairman dropdown
        const chairmanSelect = document.getElementById('committee-chairman');
        chairmanSelect.innerHTML = '';
        for (const model of availableModels) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            chairmanSelect.appendChild(option);
        }
        chairmanSelect.value = currentModel;

        // Reset review checkbox
        document.getElementById('committee-include-review').checked = false;

        // Update selection state
        this.updateCommitteeSelection();

        // Show modal
        document.getElementById('committee-modal').style.display = 'flex';
    }

    /**
     * Update committee selection UI and validation.
     */
    updateCommitteeSelection() {
        const checkboxes = document.querySelectorAll('#committee-models-grid input[type="checkbox"]');
        const selectedModels = [];

        checkboxes.forEach((cb) => {
            const item = cb.closest('.committee-model-item');
            if (cb.checked) {
                selectedModels.push(cb.value);
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Update count display
        const countEl = document.getElementById('committee-models-count');
        const count = selectedModels.length;
        const isValid = count >= 2 && count <= 5;

        countEl.textContent = `${count} selected (2-5 required)`;
        countEl.classList.toggle('valid', isValid);
        countEl.classList.toggle('invalid', !isValid);

        // Enable/disable execute button
        document.getElementById('committee-execute-btn').disabled = !isValid;

        // Store selected models
        if (this._committeeData) {
            this._committeeData.selectedModels = selectedModels;
        }
    }

    /**
     * Close the committee modal and clear state.
     */
    closeModal() {
        document.getElementById('committee-modal').style.display = 'none';
        this._committeeData = null;
    }

    /**
     * Execute the committee consultation.
     */
    async executeCommittee() {
        if (!this._committeeData) return;

        const { question, context: _context, selectedModels } = this._committeeData;
        const chairmanModel = document.getElementById('committee-chairman').value;
        const includeReview = document.getElementById('committee-include-review').checked;

        // Close modal
        document.getElementById('committee-modal').style.display = 'none';

        // Track recently used models
        for (const modelId of selectedModels) {
            storage.addRecentModel(modelId);
        }
        storage.addRecentModel(chairmanModel);

        // Get selected nodes for conversation context
        const selectedIds = this.canvas.getSelectedNodeIds();

        // Build conversation context from selected nodes
        const messages = [];
        if (selectedIds.length > 0) {
            for (const id of selectedIds) {
                const node = this.graph.getNode(id);
                if (node && node.content) {
                    const role = node.type === NodeType.HUMAN ? 'user' : 'assistant';
                    messages.push({ role, content: node.content });
                }
            }
        }

        // Add the question as the final user message
        messages.push({ role: 'user', content: question });

        // Create human node for the question
        const humanNode = createNode(NodeType.HUMAN, `/committee ${question}`, {
            position: this.graph.autoPosition(selectedIds),
        });
        this.graph.addNode(humanNode);
        this.canvas.renderNode(humanNode);

        // Create edges from selected nodes
        for (const parentId of selectedIds) {
            const edge = createEdge(parentId, humanNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, humanNode.position);
        }

        // Calculate positions for opinion nodes (fan layout)
        const basePos = humanNode.position;
        const spacing = 380;
        const verticalOffset = 200;
        const totalWidth = (selectedModels.length - 1) * spacing;
        const startX = basePos.x - totalWidth / 2;

        // Create opinion nodes for each model
        const opinionNodes = [];
        const opinionNodeMap = {}; // index -> nodeId

        for (let i = 0; i < selectedModels.length; i++) {
            const modelId = selectedModels[i];
            const modelName = this.getModelDisplayName(modelId);

            const opinionNode = createNode(NodeType.OPINION, `*Waiting for ${modelName}...*`, {
                position: {
                    x: startX + i * spacing,
                    y: basePos.y + verticalOffset,
                },
                model: modelId,
            });

            this.graph.addNode(opinionNode);
            this.canvas.renderNode(opinionNode);

            // Edge from human to opinion
            const edge = createEdge(humanNode.id, opinionNode.id, EdgeType.OPINION);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, humanNode.position, opinionNode.position);

            opinionNodes.push(opinionNode);
            opinionNodeMap[i] = opinionNode.id;
        }

        // Create synthesis node (will be connected after opinions complete)
        const synthesisY = basePos.y + verticalOffset * (includeReview ? 3 : 2);
        const synthesisNode = createNode(NodeType.SYNTHESIS, '*Waiting for opinions...*', {
            position: { x: basePos.x, y: synthesisY },
            model: chairmanModel,
        });
        this.graph.addNode(synthesisNode);
        this.canvas.renderNode(synthesisNode);

        // Review nodes (if enabled) - will be created when review starts
        const reviewNodes = [];
        const reviewNodeMap = {}; // reviewer_index -> nodeId

        // Clear input and save
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        // Pan to see the committee
        this.canvas.centerOnAnimated(basePos.x, basePos.y + verticalOffset, 300);

        // Build base request to check if we're in admin mode
        const baseRequest = this.buildLLMRequest({});
        const isAdminMode = !baseRequest.api_key; // Admin mode doesn't include api_key

        // Collect API keys by provider for all models (in normal mode)
        // In admin mode, backend handles credentials so we pass empty object
        const apiKeys = isAdminMode ? {} : storage.getApiKeysForModels([...selectedModels, chairmanModel]);

        // Get base URL if configured (only in normal mode)
        const baseUrl = isAdminMode ? null : storage.getBaseUrl() || null;

        // Track accumulated content for each opinion/review
        const opinionContents = {};
        const reviewContents = {};
        let synthesisContent = '';

        // Create abort controller for this committee session (shared, only used if ALL nodes stopped)
        const abortController = new AbortController();

        // Track paused nodes - these ignore incoming chunks but backend continues streaming
        const pausedNodes = new Set();

        // Helper to check if a node is paused
        const isNodePaused = (nodeId) => pausedNodes.has(nodeId);

        // Helper to create stop/continue callbacks for committee nodes
        const createNodeCallbacks = (nodeId, getContentFn) => ({
            onStop: () => {
                // Frontend-only pause - add to paused set, append stopped message
                pausedNodes.add(nodeId);
                const currentContent = getContentFn();
                const stoppedContent = currentContent + '\n\n*[Generation paused]*';
                this.canvas.updateNodeContent(nodeId, stoppedContent, false);
                this.graph.updateNode(nodeId, { content: stoppedContent });
            },
            onContinue: async () => {
                // Resume accepting chunks - remove stopped message, mark as streaming again
                pausedNodes.delete(nodeId);
                const node = this.graph.getNode(nodeId);
                if (node) {
                    // Remove the stopped message suffix
                    let content = node.content;
                    if (content.endsWith('\n\n*[Generation paused]*')) {
                        content = content.slice(0, -'\n\n*[Generation paused]*'.length);
                    }
                    this.canvas.updateNodeContent(nodeId, content, true);
                    this.graph.updateNode(nodeId, { content });
                }
            },
        });

        // Register all opinion nodes with StreamingManager (no groupId - each independent)
        for (let i = 0; i < opinionNodes.length; i++) {
            const node = opinionNodes[i];
            const index = i;
            const callbacks = createNodeCallbacks(node.id, () => {
                const model = selectedModels[index];
                const modelName = this.getModelDisplayName(model);
                return `**${modelName}**\n\n${opinionContents[index] || ''}`;
            });
            this.streamingManager.register(node.id, {
                // Don't pass abortController - we handle pause in onStop callback
                // abortController is shared across all nodes and would kill the entire SSE
                featureId: 'committee',
                context: { question, humanNodeId: humanNode.id, index },
                onStop: callbacks.onStop,
                onContinue: callbacks.onContinue,
            });
        }

        // Register synthesis node
        const synthesisCallbacks = createNodeCallbacks(synthesisNode.id, () => {
            const chairmanName = this.getModelDisplayName(chairmanModel);
            return `**Synthesis (${chairmanName})**\n\n${synthesisContent}`;
        });
        this.streamingManager.register(synthesisNode.id, {
            // Don't pass abortController - we handle pause in onStop callback
            // abortController is shared across all nodes and would kill the entire SSE
            featureId: 'committee',
            context: { question, humanNodeId: humanNode.id },
            onStop: synthesisCallbacks.onStop,
            onContinue: synthesisCallbacks.onContinue,
        });

        // Store streaming state for internal tracking
        this._activeCommittee = {
            abortController,
            pausedNodes,
            opinionNodeIds: opinionNodes.map((n) => n.id),
            reviewNodeIds: [],
            synthesisNodeId: synthesisNode.id,
        };

        try {
            const response = await fetch(apiUrl('/api/committee'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    context: messages,
                    models: selectedModels,
                    chairman_model: chairmanModel,
                    api_keys: apiKeys,
                    base_url: baseUrl,
                    include_review: includeReview,
                }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`Committee request failed: ${response.statusText}`);
            }

            // Process SSE stream
            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    let parsed;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = data;
                    }

                    if (eventType === 'opinion_start') {
                        const nodeId = opinionNodeMap[parsed.index];
                        const modelName = this.getModelDisplayName(parsed.model);
                        opinionContents[parsed.index] = '';
                        this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n*Thinking...*`, true);
                        this.canvas.showStopButton(nodeId);
                    } else if (eventType === 'opinion_chunk') {
                        const nodeId = opinionNodeMap[parsed.index];
                        // Always accumulate content (for done event), but skip UI update if paused
                        opinionContents[parsed.index] = (opinionContents[parsed.index] || '') + parsed.content;
                        if (!isNodePaused(nodeId)) {
                            const model = selectedModels[parsed.index];
                            const modelName = this.getModelDisplayName(model);
                            this.canvas.updateNodeContent(
                                nodeId,
                                `**${modelName}**\n\n${opinionContents[parsed.index]}`,
                                true
                            );
                        }
                    } else if (eventType === 'opinion_done') {
                        const nodeId = opinionNodeMap[parsed.index];
                        // Generation complete - remove from paused set and show final content
                        pausedNodes.delete(nodeId);
                        const model = selectedModels[parsed.index];
                        const modelName = this.getModelDisplayName(model);
                        const finalContent = `**${modelName}**\n\n${parsed.full_content}`;
                        this.canvas.updateNodeContent(nodeId, finalContent, false);
                        this.canvas.hideStopButton(nodeId);
                        this.canvas.hideContinueButton(nodeId);
                        this.graph.updateNode(nodeId, { content: finalContent });
                    } else if (eventType === 'review_start') {
                        // Create review node for this reviewer
                        const reviewerIndex = parsed.reviewer_index;
                        const modelName = this.getModelDisplayName(parsed.model);

                        // Position review nodes between opinions and synthesis
                        const reviewY = basePos.y + verticalOffset * 2;
                        const reviewNode = createNode(
                            NodeType.REVIEW,
                            `**${modelName} Review**\n\n*Reviewing other opinions...*`,
                            {
                                position: {
                                    x: startX + reviewerIndex * spacing,
                                    y: reviewY,
                                },
                                model: parsed.model,
                            }
                        );

                        this.graph.addNode(reviewNode);
                        this.canvas.renderNode(reviewNode);
                        reviewNodes.push(reviewNode);
                        reviewNodeMap[reviewerIndex] = reviewNode.id;

                        // Edge from opinion to its review
                        const opinionNodeId = opinionNodeMap[reviewerIndex];
                        const opinionNode = this.graph.getNode(opinionNodeId);
                        const reviewEdge = createEdge(opinionNodeId, reviewNode.id, EdgeType.REVIEW);
                        this.graph.addEdge(reviewEdge);
                        this.canvas.renderEdge(reviewEdge, opinionNode.position, reviewNode.position);

                        reviewContents[reviewerIndex] = '';

                        // Register review node with StreamingManager (no groupId - each independent)
                        const reviewCallbacks = createNodeCallbacks(reviewNode.id, () => {
                            const model = selectedModels[reviewerIndex];
                            const modelName = this.getModelDisplayName(model);
                            return `**${modelName} Review**\n\n${reviewContents[reviewerIndex] || ''}`;
                        });
                        this.streamingManager.register(reviewNode.id, {
                            // Don't pass abortController - we handle pause in onStop callback
                            // abortController is shared across all nodes and would kill the entire SSE
                            featureId: 'committee',
                            context: { question, humanNodeId: humanNode.id, reviewerIndex },
                            onStop: reviewCallbacks.onStop,
                            onContinue: reviewCallbacks.onContinue,
                        });
                        this.canvas.showStopButton(reviewNode.id);

                        if (this._activeCommittee) {
                            this._activeCommittee.reviewNodeIds.push(reviewNode.id);
                        }
                    } else if (eventType === 'review_chunk') {
                        const nodeId = reviewNodeMap[parsed.reviewer_index];
                        if (nodeId) {
                            // Always accumulate content (for done event), but skip UI update if paused
                            reviewContents[parsed.reviewer_index] =
                                (reviewContents[parsed.reviewer_index] || '') + parsed.content;
                            if (!isNodePaused(nodeId)) {
                                const model = selectedModels[parsed.reviewer_index];
                                const modelName = this.getModelDisplayName(model);
                                this.canvas.updateNodeContent(
                                    nodeId,
                                    `**${modelName} Review**\n\n${reviewContents[parsed.reviewer_index]}`,
                                    true
                                );
                            }
                        }
                    } else if (eventType === 'review_done') {
                        const nodeId = reviewNodeMap[parsed.reviewer_index];
                        if (nodeId) {
                            // Generation complete - remove from paused set and show final content
                            pausedNodes.delete(nodeId);
                            const model = selectedModels[parsed.reviewer_index];
                            const modelName = this.getModelDisplayName(model);
                            const finalContent = `**${modelName} Review**\n\n${parsed.full_content}`;
                            this.canvas.updateNodeContent(nodeId, finalContent, false);
                            this.canvas.hideStopButton(nodeId);
                            this.canvas.hideContinueButton(nodeId);
                            this.graph.updateNode(nodeId, { content: finalContent });
                        }
                    } else if (eventType === 'synthesis_start') {
                        // Connect all opinion/review nodes to synthesis
                        const sourceNodes = reviewNodes.length > 0 ? reviewNodes : opinionNodes;
                        for (const node of sourceNodes) {
                            const synthEdge = createEdge(node.id, synthesisNode.id, EdgeType.SYNTHESIS);
                            this.graph.addEdge(synthEdge);
                            this.canvas.renderEdge(synthEdge, node.position, synthesisNode.position);
                        }

                        const chairmanName = this.getModelDisplayName(parsed.model);
                        synthesisContent = '';
                        this.canvas.updateNodeContent(
                            synthesisNode.id,
                            `**Synthesis (${chairmanName})**\n\n*Synthesizing opinions...*`,
                            true
                        );
                        this.canvas.showStopButton(synthesisNode.id);
                    } else if (eventType === 'synthesis_chunk') {
                        // Always accumulate content (for done event), but skip UI update if paused
                        synthesisContent += parsed.content;
                        if (!isNodePaused(synthesisNode.id)) {
                            const chairmanName = this.getModelDisplayName(chairmanModel);
                            this.canvas.updateNodeContent(
                                synthesisNode.id,
                                `**Synthesis (${chairmanName})**\n\n${synthesisContent}`,
                                true
                            );
                        }
                    } else if (eventType === 'synthesis_done') {
                        // Generation complete - remove from paused set and show final content
                        pausedNodes.delete(synthesisNode.id);
                        const chairmanName = this.getModelDisplayName(chairmanModel);
                        const finalContent = `**Synthesis (${chairmanName})**\n\n${parsed.full_content}`;
                        this.canvas.updateNodeContent(synthesisNode.id, finalContent, false);
                        this.canvas.hideStopButton(synthesisNode.id);
                        this.canvas.hideContinueButton(synthesisNode.id);
                        this.graph.updateNode(synthesisNode.id, { content: finalContent });
                    } else if (eventType === 'error') {
                        console.error('Committee error:', parsed.message);
                    }
                },
                onDone: () => {
                    // Unregister all nodes from StreamingManager
                    for (const nodeId of Object.values(opinionNodeMap)) {
                        this.streamingManager.unregister(nodeId);
                    }
                    for (const nodeId of Object.values(reviewNodeMap)) {
                        this.streamingManager.unregister(nodeId);
                    }
                    this.streamingManager.unregister(synthesisNode.id);

                    this._activeCommittee = null;
                    this.saveSession();
                },
                onError: (err) => {
                    console.error('Committee stream error:', err);
                    // Unregister all nodes from StreamingManager
                    for (const nodeId of Object.values(opinionNodeMap)) {
                        this.streamingManager.unregister(nodeId);
                    }
                    for (const nodeId of Object.values(reviewNodeMap)) {
                        this.streamingManager.unregister(nodeId);
                    }
                    this.streamingManager.unregister(synthesisNode.id);
                    this._activeCommittee = null;
                },
            });
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Committee request aborted');
            } else {
                console.error('Committee error:', err);
                // Update synthesis node with error
                this.canvas.updateNodeContent(synthesisNode.id, `**Error**\n\n${err.message}`, false);
            }
            // Unregister all nodes from StreamingManager
            for (const nodeId of Object.values(opinionNodeMap)) {
                this.streamingManager.unregister(nodeId);
            }
            for (const nodeId of Object.values(reviewNodeMap)) {
                this.streamingManager.unregister(nodeId);
            }
            this.streamingManager.unregister(synthesisNode.id);
            this._activeCommittee = null;
            this.saveSession();
        }
    }

    /**
     * Get display name for a model ID.
     * @param {string} modelId - The model ID
     * @returns {string} - Display name for the model
     */
    getModelDisplayName(modelId) {
        const option = this.modelPicker.querySelector(`option[value="${modelId}"]`);
        return option ? option.textContent : modelId.split('/').pop();
    }

    /**
     * Abort the active committee session if one is running.
     * This aborts the entire SSE connection, stopping all nodes.
     */
    abort() {
        if (this._activeCommittee) {
            // Abort the shared controller - this stops the SSE connection entirely
            this._activeCommittee.abortController.abort();

            // Unregister all nodes from StreamingManager
            for (const nodeId of this._activeCommittee.opinionNodeIds) {
                this.streamingManager.unregister(nodeId);
            }
            for (const nodeId of this._activeCommittee.reviewNodeIds) {
                this.streamingManager.unregister(nodeId);
            }
            if (this._activeCommittee.synthesisNodeId) {
                this.streamingManager.unregister(this._activeCommittee.synthesisNodeId);
            }

            this._activeCommittee = null;
        }
    }

    /**
     * Check if a committee session is currently active.
     * @returns {boolean}
     */
    isActive() {
        return this._activeCommittee !== null;
    }
}

// =============================================================================
// Exports
// =============================================================================

export { CommitteeFeature };
