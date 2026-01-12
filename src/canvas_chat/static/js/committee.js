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

        // Store state for tracking active committee
        this._activeCommittee = {
            opinionNodeIds: opinionNodes.map((n) => n.id),
            reviewNodeIds: [],
            synthesisNodeId: synthesisNode.id,
            abortControllers: new Map(), // nodeId -> AbortController
        };

        // Generate opinions in parallel (like matrix cell fills)
        const opinionPromises = opinionNodes.map((node, index) => {
            return this.generateOpinion(node, selectedModels[index], messages, index);
        });

        try {
            // Wait for all opinions to complete
            const opinions = await Promise.all(opinionPromises);

            // If includeReview, generate reviews in parallel
            if (includeReview) {
                const reviewPromises = opinionNodes.map((opinionNode, index) => {
                    return this.generateReview(
                        opinionNode,
                        selectedModels[index],
                        messages,
                        opinions,
                        index,
                        basePos,
                        startX,
                        spacing,
                        verticalOffset,
                        reviewNodes,
                        reviewNodeMap
                    );
                });

                await Promise.all(reviewPromises);
            }

            // Generate synthesis after opinions (and reviews if enabled)
            await this.generateSynthesis(
                synthesisNode,
                chairmanModel,
                messages,
                opinions,
                includeReview ? reviewNodes : opinionNodes
            );

            // Cleanup
            this._activeCommittee = null;
            this.saveSession();
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Committee generation aborted');
            } else {
                console.error('Committee error:', err);
                // Show error in synthesis node
                this.canvas.updateNodeContent(synthesisNode.id, `**Error**\n\n${err.message}`, false);
            }
            this._activeCommittee = null;
            this.saveSession();
        }
    }

    /**
     * Generate an opinion from a single model.
     * @param {Object} opinionNode - The opinion node
     * @param {string} model - Model ID
     * @param {Array} messages - Conversation context
     * @param {number} index - Opinion index
     * @returns {Promise<string>} - The opinion content
     */
    async generateOpinion(opinionNode, model, messages, index) {
        const modelName = this.getModelDisplayName(model);
        const nodeId = opinionNode.id;

        // Create abort controller for this opinion
        const abortController = new AbortController();
        this._activeCommittee.abortControllers.set(nodeId, abortController);

        // Register with StreamingManager
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context: { model, index },
        });

        // Show stop button
        this.canvas.showStopButton(nodeId);

        return new Promise((resolve, reject) => {
            let fullContent = '';

            this.chat.sendMessage(
                messages,
                model,
                // onChunk
                (chunk, accumulated) => {
                    fullContent = accumulated;
                    this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${accumulated}`, true);
                },
                // onDone
                (finalContent) => {
                    fullContent = finalContent;
                    this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${finalContent}`, false);
                    this.canvas.hideStopButton(nodeId);
                    this.graph.updateNode(nodeId, { content: `**${modelName}**\n\n${finalContent}` });
                    this.streamingManager.unregister(nodeId);
                    this._activeCommittee.abortControllers.delete(nodeId);
                    this.saveSession();
                    resolve(finalContent);
                },
                // onError
                (err) => {
                    // Handle abort gracefully
                    if (err.name === 'AbortError') {
                        console.log(`[Committee] Opinion ${index} aborted`);
                        this.canvas.hideStopButton(nodeId);
                        this.streamingManager.unregister(nodeId);
                        this._activeCommittee.abortControllers.delete(nodeId);
                        resolve(''); // Resolve with empty to allow other opinions to continue
                        return;
                    }
                    // Real errors
                    this.canvas.hideStopButton(nodeId);
                    this.streamingManager.unregister(nodeId);
                    this._activeCommittee.abortControllers.delete(nodeId);
                    reject(err);
                },
                abortController // Pass the abort controller
            );
        });
    }

    /**
     * Generate a review from a model reviewing other opinions.
     * @param {Object} opinionNode - The opinion node to review
     * @param {string} model - Model ID
     * @param {Array} messages - Conversation context
     * @param {Array} opinions - All opinion contents
     * @param {number} reviewerIndex - Index of this reviewer
     * @param {Object} basePos - Base position
     * @param {number} startX - Starting X position
     * @param {number} spacing - Node spacing
     * @param {number} verticalOffset - Vertical offset
     * @param {Array} reviewNodes - Array to push review node to
     * @param {Object} reviewNodeMap - Map of reviewer index to node ID
     * @returns {Promise<string>} - The review content
     */
    async generateReview(
        opinionNode,
        model,
        messages,
        opinions,
        reviewerIndex,
        basePos,
        startX,
        spacing,
        verticalOffset,
        reviewNodes,
        reviewNodeMap
    ) {
        const modelName = this.getModelDisplayName(model);

        // Create review node
        const reviewY = basePos.y + verticalOffset * 2;
        const reviewNode = createNode(NodeType.REVIEW, `**${modelName} Review**\n\n*Reviewing other opinions...*`, {
            position: {
                x: startX + reviewerIndex * spacing,
                y: reviewY,
            },
            model: model,
        });

        this.graph.addNode(reviewNode);
        this.canvas.renderNode(reviewNode);
        reviewNodes.push(reviewNode);
        reviewNodeMap[reviewerIndex] = reviewNode.id;

        // Edge from opinion to review
        const reviewEdge = createEdge(opinionNode.id, reviewNode.id, EdgeType.REVIEW);
        this.graph.addEdge(reviewEdge);
        this.canvas.renderEdge(reviewEdge, opinionNode.position, reviewNode.position);

        // Track this review node
        this._activeCommittee.reviewNodeIds.push(reviewNode.id);

        // Create abort controller for this review
        const abortController = new AbortController();
        this._activeCommittee.abortControllers.set(reviewNode.id, abortController);

        // Register with StreamingManager
        this.streamingManager.register(reviewNode.id, {
            abortController,
            featureId: 'committee',
            context: { model, reviewerIndex },
        });

        // Show stop button
        this.canvas.showStopButton(reviewNode.id);

        // Build review prompt with all opinions
        const reviewMessages = [
            ...messages,
            {
                role: 'assistant',
                content: `Here are opinions from multiple models:\n\n${opinions.map((op, i) => `Opinion ${i + 1}:\n${op}`).join('\n\n')}`,
            },
            {
                role: 'user',
                content: 'Please review these opinions, identifying strengths, weaknesses, and areas of disagreement.',
            },
        ];

        return new Promise((resolve, reject) => {
            let fullContent = '';

            this.chat.sendMessage(
                reviewMessages,
                model,
                // onChunk
                (chunk, accumulated) => {
                    fullContent = accumulated;
                    this.canvas.updateNodeContent(reviewNode.id, `**${modelName} Review**\n\n${accumulated}`, true);
                },
                // onDone
                (finalContent) => {
                    fullContent = finalContent;
                    this.canvas.updateNodeContent(reviewNode.id, `**${modelName} Review**\n\n${finalContent}`, false);
                    this.canvas.hideStopButton(reviewNode.id);
                    this.graph.updateNode(reviewNode.id, { content: `**${modelName} Review**\n\n${finalContent}` });
                    this.streamingManager.unregister(reviewNode.id);
                    this._activeCommittee.abortControllers.delete(reviewNode.id);
                    this.saveSession();
                    resolve(finalContent);
                },
                // onError
                (err) => {
                    // Handle abort gracefully
                    if (err.name === 'AbortError') {
                        console.log(`[Committee] Review ${reviewerIndex} aborted`);
                        this.canvas.hideStopButton(reviewNode.id);
                        this.streamingManager.unregister(reviewNode.id);
                        this._activeCommittee.abortControllers.delete(reviewNode.id);
                        resolve(''); // Resolve with empty to allow other reviews to continue
                        return;
                    }
                    // Real errors
                    this.canvas.hideStopButton(reviewNode.id);
                    this.streamingManager.unregister(reviewNode.id);
                    this._activeCommittee.abortControllers.delete(reviewNode.id);
                    reject(err);
                },
                abortController // Pass the abort controller
            );
        });
    }

    /**
     * Generate synthesis from the chairman model.
     * @param {Object} synthesisNode - The synthesis node
     * @param {string} chairmanModel - Chairman model ID
     * @param {Array} messages - Conversation context
     * @param {Array} opinions - All opinion contents
     * @param {Array} sourceNodes - Opinion or review nodes to connect from
     * @returns {Promise<void>}
     */
    async generateSynthesis(synthesisNode, chairmanModel, messages, opinions, sourceNodes) {
        const chairmanName = this.getModelDisplayName(chairmanModel);
        const nodeId = synthesisNode.id;

        // Connect source nodes (opinions or reviews) to synthesis
        for (const sourceNode of sourceNodes) {
            const synthEdge = createEdge(sourceNode.id, synthesisNode.id, EdgeType.SYNTHESIS);
            this.graph.addEdge(synthEdge);
            this.canvas.renderEdge(synthEdge, sourceNode.position, synthesisNode.position);
        }

        // Create abort controller for synthesis
        const abortController = new AbortController();
        this._activeCommittee.abortControllers.set(nodeId, abortController);

        // Register with StreamingManager
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context: { model: chairmanModel },
        });

        // Show stop button
        this.canvas.showStopButton(nodeId);

        // Build synthesis prompt
        const synthesisMessages = [
            ...messages,
            {
                role: 'assistant',
                content: `Here are opinions from multiple models:\n\n${opinions.map((op, i) => `Opinion ${i + 1}:\n${op}`).join('\n\n')}`,
            },
            {
                role: 'user',
                content:
                    'Please synthesize these opinions into a coherent response, highlighting areas of consensus and noting any important differences.',
            },
        ];

        return new Promise((resolve, reject) => {
            let fullContent = '';

            this.chat.sendMessage(
                synthesisMessages,
                chairmanModel,
                // onChunk
                (chunk, accumulated) => {
                    fullContent = accumulated;
                    this.canvas.updateNodeContent(nodeId, `**Synthesis (${chairmanName})**\n\n${accumulated}`, true);
                },
                // onDone
                (finalContent) => {
                    fullContent = finalContent;
                    this.canvas.updateNodeContent(nodeId, `**Synthesis (${chairmanName})**\n\n${finalContent}`, false);
                    this.canvas.hideStopButton(nodeId);
                    this.graph.updateNode(nodeId, {
                        content: `**Synthesis (${chairmanName})**\n\n${finalContent}`,
                    });
                    this.streamingManager.unregister(nodeId);
                    this._activeCommittee.abortControllers.delete(nodeId);
                    this.saveSession();
                    resolve();
                },
                // onError
                (err) => {
                    // Handle abort gracefully
                    if (err.name === 'AbortError') {
                        console.log('[Committee] Synthesis aborted');
                        this.canvas.hideStopButton(nodeId);
                        this.streamingManager.unregister(nodeId);
                        this._activeCommittee.abortControllers.delete(nodeId);
                        resolve(); // Resolve to prevent rejection
                        return;
                    }
                    // Real errors
                    this.canvas.hideStopButton(nodeId);
                    this.streamingManager.unregister(nodeId);
                    this._activeCommittee.abortControllers.delete(nodeId);
                    reject(err);
                },
                abortController // Pass the abort controller
            );
        });
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
     * Aborts all individual streams.
     */
    abort() {
        if (this._activeCommittee) {
            // Abort all individual abort controllers
            for (const [nodeId, abortController] of this._activeCommittee.abortControllers) {
                abortController.abort();
                this.streamingManager.unregister(nodeId);
            }

            this._activeCommittee.abortControllers.clear();
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
