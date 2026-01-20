/**
 * Committee Feature Module
 *
 * Handles the /committee slash command which consults multiple LLMs
 * and synthesizes their responses.
 */

import { NodeType, EdgeType, createNode, createEdge } from '../graph-types.js';
import { FeaturePlugin } from '../feature-plugin.js';
import { storage } from '../storage.js';
import { readSSEStream as _readSSEStream } from '../sse.js';
import { apiUrl as _apiUrl } from '../utils.js';

/**
 * Static persona presets for quick selection
 */
const PERSONA_PRESETS = [
    {
        label: 'Skeptical Scientist',
        value: 'You are a skeptical scientist who demands evidence, questions assumptions, and looks for methodological flaws.',
    },
    {
        label: 'Optimistic Entrepreneur',
        value: 'You are an optimistic entrepreneur who sees opportunities, thinks about market potential, and focuses on what could go right.',
    },
    {
        label: 'Cautious Risk Analyst',
        value: 'You are a cautious risk analyst who identifies potential problems, worst-case scenarios, and recommends safeguards.',
    },
    {
        label: 'Creative Brainstormer',
        value: 'You are a creative brainstormer who thinks outside the box, makes unexpected connections, and proposes novel ideas.',
    },
    {
        label: "Devil's Advocate",
        value: "You are a devil's advocate who argues the opposing position, challenges the premise, and tests the strength of arguments.",
    },
    {
        label: 'Pragmatic Engineer',
        value: 'You are a pragmatic engineer who focuses on feasibility, implementation details, and practical constraints.',
    },
    {
        label: 'User Experience Advocate',
        value: 'You are a user experience advocate who thinks from the end-user perspective, focusing on usability and accessibility.',
    },
    {
        label: 'Ethical Reviewer',
        value: 'You are an ethical reviewer who considers moral implications, fairness, and potential harms.',
    },
];

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
     * @returns {Promise<void>}
     */
    async onLoad() {
        console.log('[CommitteeFeature] Loaded');

        // Register plugin modal
        const modalTemplate = `
            <div id="committee-main-modal" class="modal" style="display: none">
                <div class="modal-content modal-wide">
                    <div class="modal-header">
                        <h2>LLM Committee</h2>
                        <button class="modal-close" id="committee-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="committee-question-group">
                            <label for="committee-question">Question</label>
                            <textarea
                                id="committee-question"
                                rows="3"
                                readonly
                                placeholder="Your question will appear here..."
                            ></textarea>
                        </div>

                        <!-- Persona Suggestions Section -->
                        <div class="committee-suggestions-group">
                            <div class="committee-suggestions-header">
                                <label>✨ Suggested Personas</label>
                                <button
                                    id="committee-regenerate-btn"
                                    class="icon-btn"
                                    title="Regenerate suggestions"
                                    style="display: none"
                                >
                                    ↻
                                </button>
                            </div>
                            <div class="committee-suggestions-container" id="committee-suggestions-container">
                                <div class="committee-suggestions-loading">
                                    <span class="loading-spinner"></span> Generating persona suggestions...
                                </div>
                            </div>
                        </div>

                        <!-- Committee Members Section -->
                        <div class="committee-members-group">
                            <div class="committee-members-header">
                                <label>Committee Members</label>
                                <span class="committee-members-count" id="committee-members-count">0 of 2-5 members</span>
                            </div>
                            <div class="committee-members-list" id="committee-members-list">
                                <!-- Member rows will be added dynamically -->
                            </div>
                            <button id="committee-add-member-btn" class="secondary-btn committee-add-member-btn">
                                + Add Member
                            </button>
                        </div>

                        <div class="committee-chairman-group">
                            <label for="committee-chairman">Chairman (synthesizes opinions)</label>
                            <select id="committee-chairman" class="committee-chairman-select">
                                <!-- Options populated by JS -->
                            </select>
                        </div>

                        <div class="committee-options-group">
                            <label class="committee-checkbox-label">
                                <input type="checkbox" id="committee-include-review" />
                                <span class="checkbox-text">Include review stage</span>
                                <span class="checkbox-hint">Each model reviews all other opinions before synthesis</span>
                            </label>
                        </div>

                        <div class="modal-actions">
                            <button id="committee-cancel-btn" class="secondary-btn">Cancel</button>
                            <button id="committee-execute-btn" class="primary-btn" disabled>Consult Committee</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.modalManager.registerModal('committee', 'main', modalTemplate);

        // Committee modal event listeners
        const modal = this.modalManager.getPluginModal('committee', 'main');
        const closeBtn = modal.querySelector('#committee-close');
        const cancelBtn = modal.querySelector('#committee-cancel-btn');
        const executeBtn = modal.querySelector('#committee-execute-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }
        if (executeBtn) {
            executeBtn.addEventListener('click', () => {
                this.executeCommittee();
            });
        }
    }

    /**
     * Event subscriptions for this feature
     * @returns {Object}
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
            members: [], // Array of { model: string, persona: string }
            chairmanModel: this.modelPicker.value,
            includeReview: false,
            personaSuggestions: null,
        };

        // Get modal element for querying
        const modal = this.modalManager.getPluginModal('committee', 'main');

        // Get the question textarea and populate it
        const questionTextarea = modal.querySelector('#committee-question');
        questionTextarea.value = question;

        // Get current model
        const currentModel = this.modelPicker.value;

        // Get all available models from the model picker
        const availableModels = Array.from(this.modelPicker.options).map((opt) => ({
            id: opt.value,
            name: opt.textContent,
        }));

        // Populate chairman dropdown
        const chairmanSelect = modal.querySelector('#committee-chairman');
        chairmanSelect.innerHTML = '';
        for (const model of availableModels) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            chairmanSelect.appendChild(option);
        }
        chairmanSelect.value = currentModel;

        // Reset review checkbox
        modal.querySelector('#committee-include-review').checked = false;

        // Clear members list
        this.renderMembersList();

        // Update count
        this.updateMemberCount();

        // Show modal
        this.modalManager.showPluginModal('committee', 'main');

        // Generate persona suggestions automatically
        await this.generatePersonaSuggestions(question);

        // Setup event listeners (do this once)
        this.setupCommitteeModalEventListeners();
    }

    /**
     * Setup event listeners for committee modal (one-time setup).
     */
    setupCommitteeModalEventListeners() {
        // Prevent duplicate listeners
        if (this._modalListenersSetup) return;
        this._modalListenersSetup = true;

        const modal = this.modalManager.getPluginModal('committee', 'main');
        const addMemberBtn = modal.querySelector('#committee-add-member-btn');
        addMemberBtn.addEventListener('click', () => this.addMember());

        const regenerateBtn = modal.querySelector('#committee-regenerate-btn');
        regenerateBtn.addEventListener('click', () => this.generatePersonaSuggestions(this._committeeData.question));
    }

    /**
     * Generate persona suggestions using LLM.
     * @param question
     */
    async generatePersonaSuggestions(question) {
        const modal = this.modalManager.getPluginModal('committee', 'main');
        const container = modal.querySelector('#committee-suggestions-container');
        const regenerateBtn = modal.querySelector('#committee-regenerate-btn');

        // Create abort controller for cancellation
        const abortController = new AbortController();

        // Show loading state with cancel button
        container.innerHTML = `
            <div class="committee-suggestions-loading">
                <span class="loading-spinner"></span>
                <span>Generating persona suggestions...</span>
                <button class="committee-cancel-suggestions-btn" style="margin-left: 12px;">
                    Cancel
                </button>
            </div>
        `;
        regenerateBtn.style.display = 'none';

        // Handle cancel button click
        const cancelBtn = container.querySelector('.committee-cancel-suggestions-btn');
        cancelBtn.addEventListener('click', () => {
            abortController.abort();
        });

        const model = this.modelPicker.value;

        // Build prompt
        const prompt = `Based on the following question, suggest 3 diverse personas that would provide valuable perspectives for analyzing this problem. Each persona should bring a unique viewpoint that helps explore different angles.

Return ONLY a JSON array with no additional text:
[
  {"title": "short title (2-4 words)", "description": "1-2 sentence description of how this persona approaches problems"},
  ...
]

Question:
${question}`;

        try {
            let fullResponse = '';

            await new Promise((resolve, reject) => {
                this.chat.sendMessage(
                    [{ role: 'user', content: prompt }],
                    model,
                    (chunk) => {
                        fullResponse += chunk;
                    },
                    () => resolve(),
                    (err) => reject(err),
                    { signal: abortController.signal }
                );
            });

            // Parse JSON response
            let suggestions;
            try {
                const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    suggestions = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON array found in response');
                }
            } catch (parseError) {
                console.error('Failed to parse persona suggestions:', parseError, fullResponse);
                throw new Error('Failed to parse suggestions');
            }

            if (!Array.isArray(suggestions) || suggestions.length === 0) {
                throw new Error('No suggestions generated');
            }

            // Store suggestions
            this._committeeData.personaSuggestions = suggestions;

            // Render suggestions
            this.renderPersonaSuggestions(suggestions);
            regenerateBtn.style.display = 'inline-block';
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('[Committee] Persona suggestions cancelled by user');
                container.innerHTML = `
                    <div class="committee-suggestions-error">
                        Cancelled. Add members manually or click "Regenerate suggestions" to try again.
                    </div>
                `;
                regenerateBtn.style.display = 'inline-block';
                regenerateBtn.textContent = 'Regenerate';
                return;
            }
            console.error('Failed to generate persona suggestions:', error);
            container.innerHTML = `
                <div class="committee-suggestions-error">
                    Couldn't generate suggestions. Add members manually or try again.
                </div>
            `;
            regenerateBtn.style.display = 'inline-block';
            regenerateBtn.textContent = 'Try Again';
        }
    }

    /**
     * Render persona suggestions as cards.
     * @param suggestions
     */
    renderPersonaSuggestions(suggestions) {
        const modal = this.modalManager.getPluginModal('committee', 'main');
        const container = modal.querySelector('#committee-suggestions-container');
        const grid = document.createElement('div');
        grid.className = 'committee-suggestions-grid';

        for (let i = 0; i < suggestions.length; i++) {
            const suggestion = suggestions[i];
            const card = document.createElement('div');
            card.className = 'committee-suggestion-card';
            card.dataset.index = i;

            card.innerHTML = `
                <div class="committee-suggestion-content">
                    <div class="committee-suggestion-title">${this.escapeHtml(suggestion.title)}</div>
                    <div class="committee-suggestion-description">${this.escapeHtml(suggestion.description)}</div>
                </div>
                <button class="committee-suggestion-add-btn" data-index="${i}">Add</button>
            `;

            // Add button click handler
            const addBtn = card.querySelector('.committee-suggestion-add-btn');
            addBtn.addEventListener('click', () => {
                this.addMemberFromSuggestion(i);
                card.classList.add('added');
                addBtn.disabled = true;
                addBtn.textContent = 'Added';
            });

            grid.appendChild(card);
        }

        container.innerHTML = '';
        container.appendChild(grid);
    }

    /**
     * Add a member from a suggestion.
     * @param index
     */
    addMemberFromSuggestion(index) {
        const suggestion = this._committeeData.personaSuggestions[index];
        const currentModel = this.modelPicker.value;

        this._committeeData.members.push({
            model: currentModel,
            persona: suggestion.description,
        });

        this.renderMembersList();
        this.updateMemberCount();
    }

    /**
     * Add an empty member to the list.
     */
    addMember() {
        const currentModel = this.modelPicker.value;

        this._committeeData.members.push({
            model: currentModel,
            persona: '',
        });

        this.renderMembersList();
        this.updateMemberCount();
    }

    /**
     * Remove a member from the list.
     * @param index
     */
    removeMember(index) {
        this._committeeData.members.splice(index, 1);
        this.renderMembersList();
        this.updateMemberCount();
    }

    /**
     * Render the members list.
     */
    renderMembersList() {
        const modal = this.modalManager.getPluginModal('committee', 'main');
        const list = modal.querySelector('#committee-members-list');
        list.innerHTML = '';

        const availableModels = Array.from(this.modelPicker.options).map((opt) => ({
            id: opt.value,
            name: opt.textContent,
        }));

        for (let i = 0; i < this._committeeData.members.length; i++) {
            const member = this._committeeData.members[i];
            const row = document.createElement('div');
            row.className = 'committee-member-row';
            row.dataset.index = i;

            // Model selector
            const modelSelect = document.createElement('div');
            modelSelect.className = 'committee-member-model';
            modelSelect.innerHTML = `<label>Model</label>`;
            const select = document.createElement('select');
            select.dataset.index = i;
            for (const model of availableModels) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                if (model.id === member.model) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
            select.addEventListener('change', (e) => {
                this._committeeData.members[i].model = e.target.value;
            });
            modelSelect.appendChild(select);

            // Persona input with preset dropdown
            const personaDiv = document.createElement('div');
            personaDiv.className = 'committee-member-persona';
            personaDiv.innerHTML = `
                <label>Persona (optional)</label>
                <div class="committee-member-persona-input-wrapper">
                    <input type="text"
                           placeholder="e.g., You are a skeptical scientist who..."
                           value="${this.escapeHtml(member.persona)}"
                           data-index="${i}">
                    <button class="committee-member-persona-preset-btn" data-index="${i}" title="Choose preset">▼</button>
                    <div class="committee-member-persona-presets" style="display: none;" data-index="${i}">
                        ${PERSONA_PRESETS.map(
                            (preset) =>
                                `<div class="committee-member-persona-preset-item" data-value="${this.escapeHtml(preset.value)}">${this.escapeHtml(preset.label)}</div>`
                        ).join('')}
                    </div>
                </div>
            `;

            const input = personaDiv.querySelector('input');
            input.addEventListener('input', (e) => {
                this._committeeData.members[i].persona = e.target.value;
            });

            const presetBtn = personaDiv.querySelector('.committee-member-persona-preset-btn');
            const presetsDiv = personaDiv.querySelector('.committee-member-persona-presets');

            presetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close all other preset dropdowns
                document.querySelectorAll('.committee-member-persona-presets').forEach((div) => {
                    if (div !== presetsDiv) div.style.display = 'none';
                });
                presetsDiv.style.display = presetsDiv.style.display === 'none' ? 'block' : 'none';
            });

            presetsDiv.querySelectorAll('.committee-member-persona-preset-item').forEach((item) => {
                item.addEventListener('click', (e) => {
                    const value = e.target.dataset.value;
                    input.value = value;
                    this._committeeData.members[i].persona = value;
                    presetsDiv.style.display = 'none';
                });
            });

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.className = 'committee-member-remove';
            removeBtn.innerHTML = '×';
            removeBtn.title = 'Remove member';
            removeBtn.dataset.index = i;
            removeBtn.disabled = this._committeeData.members.length <= 2;
            removeBtn.addEventListener('click', () => {
                this.removeMember(i);
            });

            row.appendChild(modelSelect);
            row.appendChild(personaDiv);
            row.appendChild(removeBtn);
            list.appendChild(row);
        }

        // Close preset dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.committee-member-persona-input-wrapper')) {
                document.querySelectorAll('.committee-member-persona-presets').forEach((div) => {
                    div.style.display = 'none';
                });
            }
        });
    }

    /**
     * Update member count display and validation.
     */
    updateMemberCount() {
        const count = this._committeeData.members.length;
        const isValid = count >= 2 && count <= 5;

        const modal = this.modalManager.getPluginModal('committee', 'main');
        const countEl = modal.querySelector('#committee-members-count');
        countEl.textContent = `${count} of 2-5 members`;
        countEl.classList.toggle('valid', isValid);
        countEl.classList.toggle('invalid', !isValid);

        // Enable/disable execute button
        modal.querySelector('#committee-execute-btn').disabled = !isValid;
    }

    /**
     * Escape HTML to prevent XSS.
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Close the committee modal and clear state.
     */
    closeModal() {
        this.modalManager.hidePluginModal('committee', 'main');
        this._committeeData = null;
    }

    /**
     * Execute the committee consultation.
     */
    async executeCommittee() {
        if (!this._committeeData) return;

        const { question, context: _context, members } = this._committeeData;
        const modal = this.modalManager.getPluginModal('committee', 'main');
        const chairmanModel = modal.querySelector('#committee-chairman').value;
        const includeReview = modal.querySelector('#committee-include-review').checked;

        // Close modal
        this.modalManager.hidePluginModal('committee', 'main');

        // Track recently used models
        for (const member of members) {
            storage.addRecentModel(member.model);
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
        }

        // Calculate positions for opinion nodes (fan layout)
        const basePos = humanNode.position;
        const spacing = 380;
        const verticalOffset = 200;
        const totalWidth = (members.length - 1) * spacing;
        const startX = basePos.x - totalWidth / 2;

        // Create opinion nodes for each member
        const opinionNodes = [];
        const opinionNodeMap = {}; // index -> nodeId

        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            const modelName = this.getModelDisplayName(member.model);
            const label = member.persona ? `${member.persona} (${modelName})` : modelName;

            const opinionNode = createNode(NodeType.OPINION, `*Waiting for ${label}...*`, {
                position: {
                    x: startX + i * spacing,
                    y: basePos.y + verticalOffset,
                },
                model: member.model,
                persona: member.persona,
            });

            this.graph.addNode(opinionNode);

            // Edge from human to opinion
            const edge = createEdge(humanNode.id, opinionNode.id, EdgeType.OPINION);
            this.graph.addEdge(edge);

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
            const member = members[index];
            return this.generateOpinion(node, member.model, messages, index, member.persona);
        });

        try {
            // Wait for all opinions to complete
            const opinions = await Promise.all(opinionPromises);

            // If includeReview, generate reviews in parallel
            if (includeReview) {
                const reviewPromises = opinionNodes.map((opinionNode, index) => {
                    const member = members[index];
                    return this.generateReview(
                        opinionNode,
                        member.model,
                        messages,
                        opinions,
                        index,
                        basePos,
                        startX,
                        spacing,
                        verticalOffset,
                        reviewNodes,
                        reviewNodeMap,
                        member.persona
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
     * @param {string} persona - Optional persona system prompt
     * @returns {Promise<string>} - The opinion content
     */
    async generateOpinion(opinionNode, model, messages, index, persona = '') {
        const modelName = this.getModelDisplayName(model);
        const nodeId = opinionNode.id;

        // Inject persona as system prompt if provided
        const messagesWithPersona = persona ? [{ role: 'system', content: persona }, ...messages] : messages;

        // Create abort controller for this opinion
        const abortController = new AbortController();
        this._activeCommittee.abortControllers.set(nodeId, abortController);

        // Register with StreamingManager (auto-shows stop button)
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context: { model, modelName, messages: messagesWithPersona, index, nodeId, persona },
            onContinue: async (nodeId, state) => {
                // Continue opinion generation from where it left off
                await this.continueOpinion(nodeId, state.context);
            },
        });

        // Build label with persona if provided
        const label = persona ? `${persona} (${modelName})` : modelName;

        return new Promise((resolve, reject) => {
            let _fullContent = '';

            this.chat.sendMessage(
                messagesWithPersona,
                model,
                // onChunk
                (chunk, accumulated) => {
                    _fullContent = accumulated;
                    this.canvas.updateNodeContent(nodeId, `**${label}**\n\n${accumulated}`, true);
                },
                // onDone
                (finalContent) => {
                    _fullContent = finalContent;
                    this.canvas.updateNodeContent(nodeId, `**${label}**\n\n${finalContent}`, false);
                    this.graph.updateNode(nodeId, { content: `**${label}**\n\n${finalContent}` });
                    this.streamingManager.unregister(nodeId); // Auto-hides stop button
                    this._activeCommittee.abortControllers.delete(nodeId);
                    this.saveSession();
                    resolve(finalContent);
                },
                // onError
                (err) => {
                    // Handle abort gracefully
                    if (err.name === 'AbortError') {
                        console.log(`[Committee] Opinion ${index} aborted`);
                        // Don't unregister - StreamingManager.stop() handles UI state
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
     * @param {string} persona - Optional persona system prompt
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
        reviewNodeMap,
        persona = ''
    ) {
        const modelName = this.getModelDisplayName(model);
        const label = persona ? `${persona} (${modelName})` : modelName;

        // Create review node
        const reviewY = basePos.y + verticalOffset * 2;
        const reviewNode = createNode(NodeType.REVIEW, `**${label} Review**\n\n*Reviewing other opinions...*`, {
            position: {
                x: startX + reviewerIndex * spacing,
                y: reviewY,
            },
            model: model,
            persona: persona,
        });

        this.graph.addNode(reviewNode);
        reviewNodes.push(reviewNode);
        reviewNodeMap[reviewerIndex] = reviewNode.id;

        // Edge from opinion to review
        const reviewEdge = createEdge(opinionNode.id, reviewNode.id, EdgeType.REVIEW);
        this.graph.addEdge(reviewEdge);

        // Track this review node
        this._activeCommittee.reviewNodeIds.push(reviewNode.id);

        // Create abort controller for this review
        const abortController = new AbortController();
        this._activeCommittee.abortControllers.set(reviewNode.id, abortController);

        // Register with StreamingManager
        this.streamingManager.register(reviewNode.id, {
            abortController,
            featureId: 'committee',
            context: {
                model,
                modelName,
                messages,
                opinions,
                reviewerIndex,
                nodeId: reviewNode.id,
                persona,
            },
            onContinue: async (nodeId, state) => {
                // Continue review generation from where it left off
                await this.continueReview(nodeId, state.context);
            },
        });

        // Build review prompt with all opinions
        // Inject persona as system prompt if provided
        const reviewMessages = persona
            ? [
                  { role: 'system', content: persona },
                  ...messages,
                  {
                      role: 'assistant',
                      content: `Here are opinions from multiple models:\n\n${opinions.map((op, i) => `Opinion ${i + 1}:\n${op}`).join('\n\n')}`,
                  },
                  {
                      role: 'user',
                      content:
                          'Please review these opinions, identifying strengths, weaknesses, and areas of disagreement.',
                  },
              ]
            : [
                  ...messages,
                  {
                      role: 'assistant',
                      content: `Here are opinions from multiple models:\n\n${opinions.map((op, i) => `Opinion ${i + 1}:\n${op}`).join('\n\n')}`,
                  },
                  {
                      role: 'user',
                      content:
                          'Please review these opinions, identifying strengths, weaknesses, and areas of disagreement.',
                  },
              ];

        return new Promise((resolve, reject) => {
            let _fullContent = '';

            this.chat.sendMessage(
                reviewMessages,
                model,
                // onChunk
                (chunk, accumulated) => {
                    _fullContent = accumulated;
                    this.canvas.updateNodeContent(reviewNode.id, `**${label} Review**\n\n${accumulated}`, true);
                },
                // onDone
                (finalContent) => {
                    _fullContent = finalContent;
                    this.canvas.updateNodeContent(reviewNode.id, `**${label} Review**\n\n${finalContent}`, false);
                    this.graph.updateNode(reviewNode.id, { content: `**${label} Review**\n\n${finalContent}` });
                    this.streamingManager.unregister(reviewNode.id); // Auto-hides stop button
                    this._activeCommittee.abortControllers.delete(reviewNode.id);
                    this.saveSession();
                    resolve(finalContent);
                },
                // onError
                (err) => {
                    // Handle abort gracefully
                    if (err.name === 'AbortError') {
                        console.log(`[Committee] Review ${reviewerIndex} aborted`);
                        // Don't unregister - StreamingManager.stop() handles UI state
                        this._activeCommittee.abortControllers.delete(reviewNode.id);
                        resolve(''); // Resolve with empty to allow other reviews to continue
                        return;
                    }
                    // Real errors
                    this.streamingManager.unregister(reviewNode.id); // Auto-hides stop button
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
        }

        // Create abort controller for synthesis
        const abortController = new AbortController();
        this._activeCommittee.abortControllers.set(nodeId, abortController);

        // Register with StreamingManager (auto-shows stop button)
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context: {
                model: chairmanModel,
                chairmanName,
                messages,
                opinions,
                nodeId,
            },
            onContinue: async (nodeId, state) => {
                // Continue synthesis generation from where it left off
                await this.continueSynthesis(nodeId, state.context);
            },
        });

        // Build synthesis prompt with persona labels
        // Format each opinion with persona context if available
        const opinionTexts = opinions.map((op, i) => {
            const sourceNode = sourceNodes[i];
            const persona = sourceNode.persona || '';
            const modelName = this.getModelDisplayName(sourceNode.model);
            const label = persona ? `"${persona}" (${modelName})` : modelName;
            return `Opinion from ${label}:\n${op}`;
        });

        const synthesisMessages = [
            ...messages,
            {
                role: 'assistant',
                content: `Here are opinions from multiple models:\n\n${opinionTexts.join('\n\n')}`,
            },
            {
                role: 'user',
                content:
                    'Please synthesize these opinions into a coherent response, highlighting areas of consensus and noting any important differences.',
            },
        ];

        return new Promise((resolve, reject) => {
            let _fullContent = '';

            this.chat.sendMessage(
                synthesisMessages,
                chairmanModel,
                // onChunk
                (chunk, accumulated) => {
                    _fullContent = accumulated;
                    this.canvas.updateNodeContent(nodeId, `**Synthesis (${chairmanName})**\n\n${accumulated}`, true);
                },
                // onDone
                (finalContent) => {
                    _fullContent = finalContent;
                    this.canvas.updateNodeContent(nodeId, `**Synthesis (${chairmanName})**\n\n${finalContent}`, false);
                    this.graph.updateNode(nodeId, {
                        content: `**Synthesis (${chairmanName})**\n\n${finalContent}`,
                    });
                    this.streamingManager.unregister(nodeId); // Auto-hides stop button
                    this._activeCommittee.abortControllers.delete(nodeId);
                    this.saveSession();
                    resolve();
                },
                // onError
                (err) => {
                    // Handle abort gracefully
                    if (err.name === 'AbortError') {
                        console.log('[Committee] Synthesis aborted');
                        // Don't unregister - StreamingManager.stop() handles UI state
                        this._activeCommittee.abortControllers.delete(nodeId);
                        resolve(); // Resolve to prevent rejection
                        return;
                    }
                    // Real errors
                    this.streamingManager.unregister(nodeId); // Auto-hides stop button
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
     * Continue opinion generation from where it was stopped.
     * @param {string} nodeId - The opinion node ID
     * @param {Object} context - Saved context with model, messages, etc.
     */
    async continueOpinion(nodeId, context) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const { model, modelName, messages } = context;

        // Get current content (remove model name header and stopped indicator)
        let currentContent = node.content
            .replace(new RegExp(`^\\*\\*${modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\n\\n`), '')
            .replace(/\n\n\*\[Generation stopped\]\*$/, '');

        // Build continuation messages
        const continueMessages = [
            ...messages,
            { role: 'assistant', content: currentContent },
            { role: 'user', content: 'Please continue your response from where you left off.' },
        ];

        // Create new abort controller
        const abortController = new AbortController();

        // Re-register with StreamingManager
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context,
            onContinue: async (nodeId, state) => {
                await this.continueOpinion(nodeId, state.context);
            },
        });

        // Continue streaming
        this.chat.sendMessage(
            continueMessages,
            model,
            // onChunk
            (chunk, accumulated) => {
                const combinedContent = currentContent + accumulated;
                this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${combinedContent}`, true);
            },
            // onDone
            (finalContent) => {
                const combinedContent = currentContent + finalContent;
                this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${combinedContent}`, false);
                this.graph.updateNode(nodeId, { content: `**${modelName}**\n\n${combinedContent}` });
                this.streamingManager.unregister(nodeId);
                this.saveSession();
            },
            // onError
            (err) => {
                if (err.name === 'AbortError') {
                    console.log(`[Committee] Opinion continuation aborted`);
                } else {
                    console.error('[Committee] Opinion continuation error:', err);
                    const errorContent = currentContent + `\n\n*Error continuing: ${err.message}*`;
                    this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${errorContent}`, false);
                    this.graph.updateNode(nodeId, { content: `**${modelName}**\n\n${errorContent}` });
                }
                this.streamingManager.unregister(nodeId);
                this.saveSession();
            },
            abortController
        );
    }

    /**
     * Continue review generation from where it was stopped.
     * @param {string} nodeId - The review node ID
     * @param {Object} context - Saved context with model, messages, opinions, etc.
     */
    async continueReview(nodeId, context) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const { model, modelName, messages, opinions } = context;

        // Get current content (remove model name header and stopped indicator)
        let currentContent = node.content
            .replace(new RegExp(`^\\*\\*${modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\n\\n`), '')
            .replace(/\n\n\*\[Generation stopped\]\*$/, '');

        // Build continuation messages (include opinions context)
        const continueMessages = [
            ...messages,
            {
                role: 'assistant',
                content: `Here are opinions from multiple models:\n\n${opinions.map((op, i) => `Opinion ${i + 1}:\n${op}`).join('\n\n')}`,
            },
            {
                role: 'user',
                content: 'Please review these opinions, identifying strengths, weaknesses, and areas of disagreement.',
            },
            { role: 'assistant', content: currentContent },
            { role: 'user', content: 'Please continue your review from where you left off.' },
        ];

        // Create new abort controller
        const abortController = new AbortController();

        // Re-register with StreamingManager
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context,
            onContinue: async (nodeId, state) => {
                await this.continueReview(nodeId, state.context);
            },
        });

        // Continue streaming
        this.chat.sendMessage(
            continueMessages,
            model,
            // onChunk
            (chunk, accumulated) => {
                const combinedContent = currentContent + accumulated;
                this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${combinedContent}`, true);
            },
            // onDone
            (finalContent) => {
                const combinedContent = currentContent + finalContent;
                this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${combinedContent}`, false);
                this.graph.updateNode(nodeId, { content: `**${modelName}**\n\n${combinedContent}` });
                this.streamingManager.unregister(nodeId);
                this.saveSession();
            },
            // onError
            (err) => {
                if (err.name === 'AbortError') {
                    console.log(`[Committee] Review continuation aborted`);
                } else {
                    console.error('[Committee] Review continuation error:', err);
                    const errorContent = currentContent + `\n\n*Error continuing: ${err.message}*`;
                    this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${errorContent}`, false);
                    this.graph.updateNode(nodeId, { content: `**${modelName}**\n\n${errorContent}` });
                }
                this.streamingManager.unregister(nodeId);
                this.saveSession();
            },
            abortController
        );
    }

    /**
     * Continue synthesis generation from where it was stopped.
     * @param {string} nodeId - The synthesis node ID
     * @param {Object} context - Saved context with model, messages, opinions, etc.
     */
    async continueSynthesis(nodeId, context) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const { model, chairmanName, messages, opinions } = context;

        // Get current content (remove chairman name header and stopped indicator)
        let currentContent = node.content
            .replace(
                new RegExp(`^\\*\\*${chairmanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(Chairman\\)\\*\\*\\n\\n`),
                ''
            )
            .replace(/\n\n\*\[Generation stopped\]\*$/, '');

        // Build continuation messages (include opinions context)
        const continueMessages = [
            ...messages,
            {
                role: 'assistant',
                content: `Here are all the opinions:\n\n${opinions.map((op, i) => `Opinion ${i + 1}:\n${op}`).join('\n\n')}`,
            },
            {
                role: 'user',
                content: 'As chairman, please synthesize these opinions into a coherent response.',
            },
            { role: 'assistant', content: currentContent },
            { role: 'user', content: 'Please continue your synthesis from where you left off.' },
        ];

        // Create new abort controller
        const abortController = new AbortController();

        // Re-register with StreamingManager
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context,
            onContinue: async (nodeId, state) => {
                await this.continueSynthesis(nodeId, state.context);
            },
        });

        // Continue streaming
        this.chat.sendMessage(
            continueMessages,
            model,
            // onChunk
            (chunk, accumulated) => {
                const combinedContent = currentContent + accumulated;
                this.canvas.updateNodeContent(nodeId, `**${chairmanName} (Chairman)**\n\n${combinedContent}`, true);
            },
            // onDone
            (finalContent) => {
                const combinedContent = currentContent + finalContent;
                this.canvas.updateNodeContent(nodeId, `**${chairmanName} (Chairman)**\n\n${combinedContent}`, false);
                this.graph.updateNode(nodeId, { content: `**${chairmanName} (Chairman)**\n\n${combinedContent}` });
                this.streamingManager.unregister(nodeId);
                this.saveSession();
            },
            // onError
            (err) => {
                if (err.name === 'AbortError') {
                    console.log(`[Committee] Synthesis continuation aborted`);
                } else {
                    console.error('[Committee] Synthesis continuation error:', err);
                    const errorContent = currentContent + `\n\n*Error continuing: ${err.message}*`;
                    this.canvas.updateNodeContent(nodeId, `**${chairmanName} (Chairman)**\n\n${errorContent}`, false);
                    this.graph.updateNode(nodeId, { content: `**${chairmanName} (Chairman)**\n\n${errorContent}` });
                }
                this.streamingManager.unregister(nodeId);
                this.saveSession();
            },
            abortController
        );
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
