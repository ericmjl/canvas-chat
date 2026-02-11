/**
 * Committee Feature Module
 *
 * Handles the /committee slash command which consults multiple LLMs
 * and synthesizes their responses.
 */

import { NodeType, EdgeType, createNode, createEdge } from '../graph-types.js';
import { FeaturePlugin } from '../feature-plugin.js';
import { storage } from '../storage.js';
import { executeAgenticTask } from '../agent/agentic-executor.js';

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

const COMMITTEE_ALLOWED_TOOLS = [
    'graph:getNodeContent',
    'graph:getPathContent',
    'graph:getRelatedNodes',
    'graph:findPathToRoot',
];

/**
 * Escape a string for regex usage.
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove the heading + stopped indicator from node content.
 * @param {string} content
 * @param {string} headerLabel
 * @returns {string}
 */
function stripHeader(content, headerLabel) {
    return content
        .replace(new RegExp(`^\\*\\*${escapeRegExp(headerLabel)}\\*\\*\\n\\n`), '')
        .replace(/\n\n\*\[Generation stopped\]\*$/, '');
}

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

        // Create human node for the question
        const humanNode = createNode(NodeType.HUMAN, `/committee ${question}`, {
            position: this.graph.autoPosition(selectedIds),
        });
        this.graph.addNode(humanNode);
        this.canvas.renderNode(humanNode);

        const contextNodeIds = Array.from(new Set([humanNode.id, ...selectedIds]));

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
            return this.generateOpinion(node, member.model, question, contextNodeIds, index, member.persona);
        });

        try {
            // Wait for all opinions to complete
            await Promise.all(opinionPromises);

            // If includeReview, generate reviews in parallel
            if (includeReview) {
                const reviewPromises = opinionNodes.map((opinionNode, index) => {
                    const member = members[index];
                    return this.generateReview(
                        opinionNode,
                        member.model,
                        question,
                        contextNodeIds,
                        opinionNodes.map((node) => node.id),
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
                question,
                contextNodeIds,
                includeReview ? reviewNodes : opinionNodes,
                includeReview
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
     * @param {string} question - Original question
     * @param {string[]} selectedNodeIds - Nodes available for context
     * @param {number} index - Opinion index
     * @param {string} persona - Optional persona system prompt
     * @returns {Promise<string>} - The opinion content
     */
    async generateOpinion(opinionNode, model, question, selectedNodeIds, index, persona = '') {
        const modelName = this.getModelDisplayName(model);
        const nodeId = opinionNode.id;

        // Create abort controller for this opinion
        const abortController = new AbortController();
        this._activeCommittee.abortControllers.set(nodeId, abortController);

        // Register with StreamingManager (auto-shows stop button)
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: 'committee',
            context: { model, modelName, question, selectedNodeIds, index, nodeId, persona },
            onContinue: async (nodeId, state) => {
                // Continue opinion generation from where it left off
                await this.continueOpinion(nodeId, state.context);
            },
        });

        // Build label with persona if provided
        const label = persona ? `${persona} (${modelName})` : modelName;
        const headerLabel = label;
        const systemPrompt = [
            persona ? `Persona: ${persona}` : null,
            'You are a committee member providing a thoughtful opinion.',
            'Use the available graph tools to gather context from the selected nodes before answering.',
            'If context is missing, call tools to retrieve it.',
        ]
            .filter(Boolean)
            .join('\n');
        const userMessage = `Question:\n${question}\n\nProvide your opinion with reasoning, evidence, and uncertainties.`;

        try {
            const content = await this._runAgenticCommitteeTask({
                nodeId,
                model,
                headerLabel,
                systemPrompt,
                userMessage,
                selectedNodeIds,
            });
            this.streamingManager.unregister(nodeId);
            this._activeCommittee.abortControllers.delete(nodeId);
            return content;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`[Committee] Opinion ${index} aborted`);
                this._activeCommittee.abortControllers.delete(nodeId);
                return '';
            }
            this.canvas.hideStopButton(nodeId);
            this.streamingManager.unregister(nodeId);
            this._activeCommittee.abortControllers.delete(nodeId);
            throw err;
        }
    }

    /**
     * Generate a review from a model reviewing other opinions.
     * @param {Object} opinionNode - The opinion node to review
     * @param {string} model - Model ID
     * @param {string} question - Original question
     * @param {string[]} selectedNodeIds - Nodes available for context
     * @param {string[]} opinionNodeIds - Opinion node IDs
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
        question,
        selectedNodeIds,
        opinionNodeIds,
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
                question,
                selectedNodeIds,
                opinionNodeIds,
                reviewerIndex,
                nodeId: reviewNode.id,
                persona,
            },
            onContinue: async (nodeId, state) => {
                // Continue review generation from where it left off
                await this.continueReview(nodeId, state.context);
            },
        });

        const headerLabel = `${label} Review`;
        const systemPrompt = [
            persona ? `Persona: ${persona}` : null,
            'You are reviewing the committee opinions for rigor and gaps.',
            'Use graph tools to read all opinion nodes before critiquing.',
        ]
            .filter(Boolean)
            .join('\n');
        const userMessage = [
            `Question:\n${question}`,
            '',
            `Opinion node IDs: ${opinionNodeIds.join(', ')}`,
            '',
            'Review the opinions. Identify strengths, weaknesses, disagreements, and missing evidence. Be concise.',
        ].join('\n');

        try {
            const reviewContent = await this._runAgenticCommitteeTask({
                nodeId: reviewNode.id,
                model,
                headerLabel,
                systemPrompt,
                userMessage,
                selectedNodeIds: Array.from(new Set([...selectedNodeIds, ...opinionNodeIds])),
            });
            this.streamingManager.unregister(reviewNode.id);
            this._activeCommittee.abortControllers.delete(reviewNode.id);
            return reviewContent;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`[Committee] Review ${reviewerIndex} aborted`);
                this._activeCommittee.abortControllers.delete(reviewNode.id);
                return '';
            }
            this.streamingManager.unregister(reviewNode.id);
            this._activeCommittee.abortControllers.delete(reviewNode.id);
            throw err;
        }
    }

    /**
     * Generate synthesis from the chairman model.
     * @param {Object} synthesisNode - The synthesis node
     * @param {string} chairmanModel - Chairman model ID
     * @param {string} question - Original question
     * @param {string[]} selectedNodeIds - Nodes available for context
     * @param {Array} sourceNodes - Opinion or review nodes to connect from
     * @param {boolean} includeReview - Whether reviews were included
     * @returns {Promise<void>}
     */
    async generateSynthesis(synthesisNode, chairmanModel, question, selectedNodeIds, sourceNodes, includeReview = false) {
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
                question,
                selectedNodeIds,
                includeReview,
                sourceNodeIds: sourceNodes.map((node) => node.id),
                nodeId,
            },
            onContinue: async (nodeId, state) => {
                // Continue synthesis generation from where it left off
                await this.continueSynthesis(nodeId, state.context);
            },
        });

        const headerLabel = `Synthesis (${chairmanName})`;
        const systemPrompt = [
            'You are the committee chairman synthesizing multiple perspectives.',
            includeReview
                ? 'Use graph tools to read all opinion and review nodes before writing the final synthesis.'
                : 'Use graph tools to read all opinion nodes before writing the final synthesis.',
        ].join('\n');
        const sourceNodeIds = sourceNodes.map((node) => node.id);
        const userMessage = [
            `Question:\n${question}`,
            '',
            `Source node IDs: ${sourceNodeIds.join(', ')}`,
            '',
            'Synthesize the committee input into a coherent response. Highlight consensus and key disagreements.',
        ].join('\n');

        try {
            await this._runAgenticCommitteeTask({
                nodeId,
                model: chairmanModel,
                headerLabel,
                systemPrompt,
                userMessage,
                selectedNodeIds: Array.from(new Set([...selectedNodeIds, ...sourceNodeIds])),
            });
            this.streamingManager.unregister(nodeId);
            this._activeCommittee.abortControllers.delete(nodeId);
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[Committee] Synthesis aborted');
                this._activeCommittee.abortControllers.delete(nodeId);
                return;
            }
            this.streamingManager.unregister(nodeId);
            this._activeCommittee.abortControllers.delete(nodeId);
            throw err;
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
     * @param {Object} context - Saved context with model, question, persona, etc.
     */
    async continueOpinion(nodeId, context) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const { model, modelName, question, selectedNodeIds, persona, opinionNodeIds } = context;
        const label = persona ? `${persona} (${modelName})` : modelName;
        const headerLabel = label;

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
        const currentContent = stripHeader(node.content || '', headerLabel);
        const systemPrompt = [
            persona ? `Persona: ${persona}` : null,
            'You are a committee member providing a thoughtful opinion.',
            'Use the available graph tools to gather context from the selected nodes before answering.',
        ]
            .filter(Boolean)
            .join('\n');
        const userMessage = [
            `Question:\n${question}`,
            '',
            'Continue your opinion from this draft:',
            currentContent,
            '',
            'Continue from where you left off.',
        ].join('\n');

        try {
            await this._runAgenticCommitteeTask({
                nodeId,
                model,
                headerLabel,
                systemPrompt,
                userMessage,
                selectedNodeIds: Array.from(new Set([...(selectedNodeIds || []), ...(opinionNodeIds || [])])),
            });
            this.streamingManager.unregister(nodeId);
            this.saveSession();
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`[Committee] Opinion continuation aborted`);
            } else {
                console.error('[Committee] Opinion continuation error:', err);
                const errorContent = currentContent + `\n\n*Error continuing: ${err.message}*`;
                this.canvas.updateNodeContent(nodeId, `**${headerLabel}**\n\n${errorContent}`, false);
                this.graph.updateNode(nodeId, { content: `**${headerLabel}**\n\n${errorContent}` });
            }
            this.streamingManager.unregister(nodeId);
            this.saveSession();
        }
    }

    /**
     * Continue review generation from where it was stopped.
     * @param {string} nodeId - The review node ID
     * @param {Object} context - Saved context with model, question, persona, etc.
     */
    async continueReview(nodeId, context) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const { model, modelName, question, selectedNodeIds, persona } = context;
        const label = persona ? `${persona} (${modelName})` : modelName;
        const headerLabel = `${label} Review`;

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
        const currentContent = stripHeader(node.content || '', headerLabel);
        const systemPrompt = [
            persona ? `Persona: ${persona}` : null,
            'You are reviewing the committee opinions for rigor and gaps.',
            'Use graph tools to read all opinion nodes before critiquing.',
        ]
            .filter(Boolean)
            .join('\n');
        const userMessage = [
            `Question:\n${question}`,
            '',
            'Continue your review from this draft:',
            currentContent,
            '',
            'Continue from where you left off.',
        ].join('\n');

        try {
            await this._runAgenticCommitteeTask({
                nodeId,
                model,
                headerLabel,
                systemPrompt,
                userMessage,
                selectedNodeIds,
            });
            this.streamingManager.unregister(nodeId);
            this.saveSession();
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`[Committee] Review continuation aborted`);
            } else {
                console.error('[Committee] Review continuation error:', err);
                const errorContent = currentContent + `\n\n*Error continuing: ${err.message}*`;
                this.canvas.updateNodeContent(nodeId, `**${headerLabel}**\n\n${errorContent}`, false);
                this.graph.updateNode(nodeId, { content: `**${headerLabel}**\n\n${errorContent}` });
            }
            this.streamingManager.unregister(nodeId);
            this.saveSession();
        }
    }

    /**
     * Continue synthesis generation from where it was stopped.
     * @param {string} nodeId - The synthesis node ID
     * @param {Object} context - Saved context with model, question, etc.
     */
    async continueSynthesis(nodeId, context) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const { model, chairmanName, question, selectedNodeIds, sourceNodeIds } = context;
        const headerLabel = `Synthesis (${chairmanName})`;

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
        const currentContent = stripHeader(node.content || '', headerLabel);
        const systemPrompt = [
            'You are the committee chairman synthesizing multiple perspectives.',
            'Use graph tools to read all opinion and review nodes before writing the final synthesis.',
        ].join('\n');
        const userMessage = [
            `Question:\n${question}`,
            '',
            'Continue your synthesis from this draft:',
            currentContent,
            '',
            'Continue from where you left off.',
        ].join('\n');

        try {
            await this._runAgenticCommitteeTask({
                nodeId,
                model,
                headerLabel,
                systemPrompt,
                userMessage,
                selectedNodeIds: Array.from(new Set([...(selectedNodeIds || []), ...(sourceNodeIds || [])])),
            });
            this.streamingManager.unregister(nodeId);
            this.saveSession();
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`[Committee] Synthesis continuation aborted`);
            } else {
                console.error('[Committee] Synthesis continuation error:', err);
                const errorContent = currentContent + `\n\n*Error continuing: ${err.message}*`;
                this.canvas.updateNodeContent(nodeId, `**${headerLabel}**\n\n${errorContent}`, false);
                this.graph.updateNode(nodeId, { content: `**${headerLabel}**\n\n${errorContent}` });
            }
            this.streamingManager.unregister(nodeId);
            this.saveSession();
        }
    }

    /**
     * Run a committee stage with the agentic executor and update the node.
     * @param {Object} options
     * @param {string} options.nodeId
     * @param {string} options.model
     * @param {string} options.headerLabel
     * @param {string} options.systemPrompt
     * @param {string} options.userMessage
     * @param {string[]} options.selectedNodeIds
     * @returns {Promise<string>}
     */
    async _runAgenticCommitteeTask(options) {
        const { nodeId, model, headerLabel, systemPrompt, userMessage, selectedNodeIds } = options;
        let fullContent = '';

        const updateContent = (content, streaming) => {
            this.canvas.updateNodeContent(nodeId, `**${headerLabel}**\n\n${content}`, streaming);
        };

        const result = await executeAgenticTask({
            systemPrompt,
            userMessage,
            selectedNodeIds,
            graph: this.graph,
            chat: this.chat,
            model,
            maxToolCalls: 8,
            allowedTools: COMMITTEE_ALLOWED_TOOLS,
            onProgress: (message) => {
                if (!fullContent) {
                    updateContent(`*${message}*`, true);
                }
            },
            onToken: (chunk, accumulated) => {
                fullContent = accumulated;
                updateContent(fullContent, true);
            },
            onTool: (toolCall) => {
                if (!fullContent && toolCall?.toolId) {
                    updateContent(`*Using ${toolCall.toolId}...*`, true);
                }
            },
        });

        if (!result.success) {
            throw new Error(result.error || 'Agentic execution failed');
        }

        if (result.content) {
            fullContent = result.content;
        }

        updateContent(fullContent, false);
        this.graph.updateNode(nodeId, { content: `**${headerLabel}**\n\n${fullContent}` });
        this.saveSession();
        return fullContent;
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
