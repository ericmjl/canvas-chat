/**
 * Poll Plugin (External/Example)
 *
 * Provides poll nodes with LLM-powered generation and interactive voting.
 * This is a self-contained plugin that combines:
 * - PollNode protocol (custom node rendering)
 * - PollFeature (slash command and event handling)
 *
 * To use this plugin:
 * 1. Add plugin path to config.yaml:
 *      plugins:
 *        - path: ./src/canvas_chat/static/js/example-plugins/poll.js
 * 2. Run with: uvx canvas-chat launch --config config.yaml
 * 3. Use /poll command to generate polls from natural language
 */

import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { FeaturePlugin } from '../feature-plugin.js';
import { createNode } from '../graph-types.js';

// =============================================================================
// Poll Node Protocol
// =============================================================================

/**
 * Poll Node Protocol Class
 * Defines how poll nodes are rendered and what actions they support.
 */
class PollNode extends BaseNode {
    /**
     * Display label shown in node header
     * @returns {string}
     */
    getTypeLabel() {
        return 'Poll';
    }

    /**
     * Emoji icon for the node type
     * @returns {string}
     */
    getTypeIcon() {
        return '📊';
    }

    /**
     * Summary text for semantic zoom (shown when zoomed out)
     * @param {Canvas} canvas
     * @returns {string}
     */
    getSummaryText(canvas) {
        // Show question as summary
        const question = this.node.question || 'Poll';
        return canvas.truncate(question, 50);
    }

    /**
     * Render the HTML content for the poll
     * @param {Canvas} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        const question = this.node.question || 'No question set';
        const options = this.node.options || [];
        const votes = this.node.votes || {};

        // Calculate total votes
        const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);

        let html = `<div class="poll-content">`;
        html += `<div class="poll-question">${canvas.escapeHtml(question)}</div>`;
        html += `<div class="poll-options">`;

        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const voteCount = votes[i] || 0;
            const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

            html += `
                <div class="poll-option" data-index="${i}">
                    <div class="poll-option-bar" style="width: ${percentage}%"></div>
                    <span class="poll-option-text">${canvas.escapeHtml(option)}</span>
                    <span class="poll-option-votes">${voteCount} (${percentage}%)</span>
                </div>
            `;
        }

        html += `</div>`;
        html += `<div class="poll-total">Total votes: ${totalVotes}</div>`;
        html += `</div>`;

        return html;
    }

    /**
     * Action buttons for the poll node
     * @returns {Array<Object>}
     */
    getActions() {
        return [
            { id: 'add-option', label: '➕ Add Option', title: 'Add a new option' },
            { id: 'reset-votes', label: '🔄 Reset', title: 'Reset all votes' },
            Actions.COPY,
        ];
    }

    /**
     * Custom event bindings for poll interactions
     * @returns {Array<Object>}
     */
    getEventBindings() {
        return [
            // Click on option to vote
            {
                selector: '.poll-option',
                multiple: true,
                handler: (nodeId, e, canvas) => {
                    const index = parseInt(e.currentTarget.dataset.index);
                    canvas.emit('pollVote', nodeId, index);
                },
            },
            // Add option button
            {
                selector: '.add-option-btn',
                handler: 'pollAddOption',
            },
            // Reset votes button
            {
                selector: '.reset-votes-btn',
                handler: 'pollResetVotes',
            },
        ];
    }

    /**
     * Copy poll results to clipboard
     * @param {Canvas} canvas
     * @param {App} _app
     * @returns {Promise<void>}
     */
    async copyToClipboard(canvas, _app) {
        const question = this.node.question || 'Poll';
        const options = this.node.options || [];
        const votes = this.node.votes || {};

        let text = `${question}\n\n`;
        for (let i = 0; i < options.length; i++) {
            const voteCount = votes[i] || 0;
            text += `${options[i]}: ${voteCount} votes\n`;
        }

        await navigator.clipboard.writeText(text);
        canvas.showCopyFeedback(this.node.id);
    }
}

// Register the poll node type
NodeRegistry.register({
    type: 'poll',
    protocol: PollNode,
    defaultSize: { width: 400, height: 300 },
    css: `
        .poll-content {
            padding: 12px;
        }

        .poll-question {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--text-color);
        }

        .poll-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
        }

        .poll-option {
            position: relative;
            padding: 10px;
            background: var(--node-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            cursor: pointer;
            overflow: hidden;
            transition: all 0.15s ease;
        }

        .poll-option:hover {
            background: var(--hover-bg);
            border-color: var(--primary-color);
        }

        .poll-option-bar {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            background: var(--primary-color);
            opacity: 0.1;
            transition: width 0.3s ease;
            pointer-events: none;
        }

        .poll-option-text {
            position: relative;
            z-index: 1;
            font-size: 14px;
            color: var(--text-color);
        }

        .poll-option-votes {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
        }

        .poll-total {
            font-size: 12px;
            color: var(--text-muted);
            text-align: right;
        }
    `,
    cssVariables: {
        '--node-poll-bg': 'var(--node-bg)',
    },
});

// =============================================================================
// Poll Feature Plugin
// =============================================================================

/**
 * Poll Feature Plugin
 * Provides LLM-powered poll generation from natural language prompts
 * and handles poll node interactions (voting, adding options, resetting votes).
 */
export class PollFeature extends FeaturePlugin {
    /**
     * Get slash commands for this feature
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/poll',
                description: 'Generate a poll from natural language',
                placeholder: 'e.g., "What should we have for lunch?"',
            },
        ];
    }

    /**
     * Handle /poll slash command - generate poll from natural language
     * @param {string} command - The slash command (e.g., '/poll')
     * @param {string} args - Text after the command (natural language prompt)
     * @param {Object} _contextObj - Additional context (unused, kept for interface)
     * @returns {Promise<void>}
     */
    async handleCommand(command, args, _contextObj) {
        const input = args.trim();
        if (!input) {
            this.showToast?.('Please provide a poll question or description', 'warning');
            return;
        }

        const model = this.modelPicker.value;
        const selectedIds = this.canvas.getSelectedNodeIds();

        // Check for API key
        const apiKey = this.chat.getApiKeyForModel(model);
        if (!apiKey && !this.adminMode) {
            this.showToast?.('Please configure an API key in Settings', 'warning');
            return;
        }

        // Create loading node
        // For poll nodes, don't set content - the protocol's renderContent handles rendering
        const loadingNode = createNode('poll', '', {
            position: this.graph.autoPosition(selectedIds.length > 0 ? selectedIds : []),
            question: '🔄 Generating poll...',
            options: [],
            votes: {},
        });
        this.graph.addNode(loadingNode);

        this.canvas.clearSelection();
        this.canvas.panToNodeAnimated(loadingNode.id);

        // Register with StreamingManager for stop/continue support
        const abortController = new AbortController();
        this.streamingManager.register(loadingNode.id, {
            abortController,
            featureId: this.id,
            onStop: (nodeId) => {
                this.streamingManager.unregister(nodeId);
            },
            onContinue: async (_nodeId, _state) => {
                // Continue not supported for poll generation (would need to re-prompt)
                this.showToast?.('Cannot continue poll generation. Create a new poll instead.', 'warning');
            },
        });

        // Show stop button (after node is rendered)
        setTimeout(() => {
            this.canvas.showStopButton(loadingNode.id);
        }, 0);

        try {
            // Build prompt for LLM
            const prompt = `Generate a poll based on this request: "${input}"

Return ONLY a JSON object with this exact structure (no markdown, no code fences, no explanations):
{
  "question": "The poll question",
  "options": ["Option 1", "Option 2", "Option 3"]
}

Generate 3-5 relevant options. The question should be clear and concise.`;

            const messages = [{ role: 'user', content: prompt }];

            // Stream the LLM response
            let fullResponse = '';
            await this.chat.sendMessage(
                messages,
                model,
                // onChunk - accumulate response for JSON parsing
                (chunk, accumulated) => {
                    fullResponse = accumulated;
                    // Show streaming progress
                    const progressText =
                        accumulated.length > 50
                            ? `🔄 Generating poll... (${accumulated.length} chars)`
                            : '🔄 Generating poll...';

                    // Update the node in the graph
                    this.graph.updateNode(loadingNode.id, {
                        question: progressText,
                        options: [], // Keep options empty during streaming
                    });

                    // Re-render to show progress
                    const currentNode = this.graph.getNode(loadingNode.id);
                    if (currentNode) {
                        this.canvas.renderNode(currentNode);
                    }
                },
                // onDone - parse JSON and update node
                () => {
                    // Parse JSON response
                    let pollData;
                    try {
                        // Try to find JSON object in the response (handle markdown code blocks)
                        const codeBlockMatch = fullResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                        if (codeBlockMatch) {
                            pollData = JSON.parse(codeBlockMatch[1]);
                        } else {
                            // Try to find JSON object directly
                            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                pollData = JSON.parse(jsonMatch[0]);
                            } else {
                                throw new Error('No JSON object found in response');
                            }
                        }

                        // Validate poll data
                        if (!pollData.question || !Array.isArray(pollData.options) || pollData.options.length === 0) {
                            throw new Error('Invalid poll structure: missing question or options');
                        }

                        // Update node with generated poll data
                        this.graph.updateNode(loadingNode.id, {
                            question: pollData.question,
                            options: pollData.options,
                            votes: {},
                        });

                        // Re-render with fresh node from graph
                        const updatedNode = this.graph.getNode(loadingNode.id);
                        if (updatedNode) {
                            this.canvas.renderNode(updatedNode);
                        }

                        this.streamingManager.unregister(loadingNode.id);
                        this.saveSession?.();
                        this.showToast?.('Poll generated successfully', 'success');
                    } catch (parseError) {
                        console.error('[PollFeature] Failed to parse poll JSON:', parseError);
                        this.graph.updateNode(loadingNode.id, {
                            question: input,
                            options: ['Option A', 'Option B', 'Option C'],
                            votes: {},
                        });
                        this.canvas.renderNode(this.graph.getNode(loadingNode.id));
                        this.streamingManager.unregister(loadingNode.id);
                        this.saveSession?.();
                        this.showToast?.('Generated poll with default options (LLM response was invalid)', 'warning');
                    }
                },
                // onError
                (error) => {
                    console.error('[PollFeature] Poll generation error:', error);
                    if (error.name !== 'AbortError') {
                        // Update with fallback data
                        this.graph.updateNode(loadingNode.id, {
                            question: input,
                            options: ['Option A', 'Option B', 'Option C'],
                            votes: {},
                        });
                        this.canvas.renderNode(this.graph.getNode(loadingNode.id));
                        this.showToast?.(`Error: ${error.message}`, 'error');
                    }
                    this.streamingManager.unregister(loadingNode.id);
                    this.saveSession?.();
                },
                abortController.signal
            );
        } catch (error) {
            console.error('[PollFeature] Poll generation error:', error);

            // Update with fallback data
            this.graph.updateNode(loadingNode.id, {
                question: input,
                options: ['Option A', 'Option B', 'Option C'],
                votes: {},
            });

            this.canvas.renderNode(this.graph.getNode(loadingNode.id));
            this.streamingManager.unregister(loadingNode.id);
            this.saveSession?.();
            this.showToast?.(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Return canvas event handlers for poll interactions
     * @returns {Object<string, Function>} Map of event names to handler functions
     */
    getCanvasEventHandlers() {
        return {
            pollVote: this.handlePollVote.bind(this),
            pollAddOption: this.handlePollAddOption.bind(this),
            pollResetVotes: this.handlePollResetVotes.bind(this),
        };
    }

    /**
     * Handle poll vote event
     * @param {string} nodeId
     * @param {number} optionIndex
     */
    handlePollVote(nodeId, optionIndex) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Initialize votes object if it doesn't exist
        if (!node.votes) {
            node.votes = {};
        }

        // Increment vote count for this option
        node.votes[optionIndex] = (node.votes[optionIndex] || 0) + 1;

        // Update graph and re-render
        this.graph.updateNode(nodeId, { votes: node.votes });
        this.canvas.renderNode(node);
        this.saveSession?.();
    }

    /**
     * Handle add option button click
     * @param {string} nodeId
     */
    handlePollAddOption(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Show modal for adding option
        const modal = document.getElementById('poll-add-option-modal');
        if (!modal) {
            // Fallback to prompt if modal doesn't exist
            const newOption = prompt('Enter new poll option:');
            if (!newOption || !newOption.trim()) return;
            this.addOptionToPoll(nodeId, newOption.trim());
            return;
        }

        const input = modal.querySelector('#poll-option-input');
        const addBtn = modal.querySelector('#poll-option-add');
        const cancelBtn = modal.querySelector('#poll-option-cancel');
        const closeBtn = modal.querySelector('#poll-option-close');

        // Reset input
        input.value = '';

        // Show modal
        modal.style.display = 'flex';
        input.focus();

        // Close handler
        const closeModal = () => {
            modal.style.display = 'none';
        };

        // Remove previous handlers to avoid duplicates
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newCloseBtn.addEventListener('click', closeModal);
        newCancelBtn.addEventListener('click', closeModal);

        // Add option handler
        const handleAdd = () => {
            const newOption = input.value.trim();
            if (!newOption) {
                this.showToast?.('Please enter an option', 'warning');
                return;
            }
            this.addOptionToPoll(nodeId, newOption);
            closeModal();
        };

        newAddBtn.addEventListener('click', handleAdd);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
            }
            if (e.key === 'Escape') {
                closeModal();
            }
        });
    }

    /**
     * Add a new option to the poll
     * @param {string} nodeId
     * @param {string} option
     */
    addOptionToPoll(nodeId, option) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Initialize options array if needed
        if (!node.options) {
            node.options = [];
        }

        // Add new option
        node.options.push(option);

        // Update graph and re-render
        this.graph.updateNode(nodeId, { options: node.options });
        this.canvas.renderNode(node);
        this.saveSession?.();
    }

    /**
     * Handle reset votes button click
     * @param {string} nodeId
     */
    handlePollResetVotes(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Show confirmation modal
        const modal = document.getElementById('poll-reset-confirm-modal');
        if (!modal) {
            // Fallback to confirm if modal doesn't exist
            if (!confirm('Reset all votes for this poll?')) return;
            this.resetPollVotes(nodeId);
            return;
        }

        const confirmBtn = modal.querySelector('#poll-reset-confirm');
        const cancelBtn = modal.querySelector('#poll-reset-cancel');
        const closeBtn = modal.querySelector('#poll-reset-close');

        // Show modal
        modal.style.display = 'flex';

        // Close handler
        const closeModal = () => {
            modal.style.display = 'none';
        };

        // Remove previous handlers to avoid duplicates
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newCloseBtn.addEventListener('click', closeModal);
        newCancelBtn.addEventListener('click', closeModal);

        // Confirm handler
        newConfirmBtn.addEventListener('click', () => {
            this.resetPollVotes(nodeId);
            closeModal();
        });
    }

    /**
     * Reset all votes for a poll
     * @param {string} nodeId
     */
    resetPollVotes(nodeId) {
        // Clear all votes
        this.graph.updateNode(nodeId, { votes: {} });
        this.canvas.renderNode(this.graph.getNode(nodeId));
        this.saveSession?.();
    }
}

// Auto-register PollFeature when plugin loads
// This allows the plugin to be self-contained (node protocol + feature)
// Plugins are loaded after app.js, so we wait for the plugin system to be ready
if (typeof window !== 'undefined') {
    const registerFeature = (app) => {
        if (app && app.featureRegistry && app.featureRegistry._appContext) {
            app.featureRegistry
                .register({
                    id: 'poll',
                    feature: PollFeature,
                    slashCommands: [
                        {
                            command: '/poll',
                            handler: 'handleCommand',
                        },
                    ],
                    priority: 500, // OFFICIAL priority for external plugins
                })
                .then(() => {
                    console.log('[Poll Plugin] PollFeature registered successfully');
                })
                .catch((err) => {
                    console.error('[Poll Plugin] Failed to register PollFeature:', err);
                });
        }
    };

    // Try immediate registration if app is already available
    if (window.app) {
        registerFeature(window.app);
    }

    // Also listen for the plugin system ready event
    window.addEventListener('app-plugin-system-ready', (event) => {
        registerFeature(event.detail.app);
    });
}

console.log('Poll plugin loaded (node protocol + feature)');
