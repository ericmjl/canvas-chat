/**
 * Poll Feature Plugin
 *
 * Provides LLM-powered poll generation from natural language prompts
 * and handles poll node interactions (voting, adding options, resetting votes).
 */

import { FeaturePlugin } from './feature-plugin.js';
import { createNode } from './graph-types.js';

export class PollFeature extends FeaturePlugin {
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
     * @param {Object} contextObj - Additional context (e.g., { text: selectedNodesContent })
     */
    async handleCommand(command, args, contextObj) {
        console.log('[PollFeature] handleCommand called', { command, args, contextObj });
        const input = args.trim();
        if (!input) {
            console.log('[PollFeature] No input provided, showing toast');
            this.showToast?.('Please provide a poll question or description', 'warning');
            return;
        }

        const model = this.modelPicker.value;
        const selectedIds = this.canvas.getSelectedNodeIds();

        // Check for API key
        const apiKey = this.chat.getApiKeyForModel(model);
        console.log('[PollFeature] API key check:', { hasApiKey: !!apiKey, adminMode: this.adminMode, model });
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
        console.log('[PollFeature] Creating loading node:', {
            id: loadingNode.id,
            question: loadingNode.question,
            options: loadingNode.options,
        });
        this.graph.addNode(loadingNode);

        // Verify node was added correctly
        const addedNode = this.graph.getNode(loadingNode.id);
        console.log('[PollFeature] Node after addNode:', {
            question: addedNode?.question,
            options: addedNode?.options,
            hasQuestion: addedNode?.hasOwnProperty('question'),
        });

        // Ensure node is rendered (event-driven rendering should handle this, but ensure it happens)
        // Get fresh node from graph to ensure we have the latest data
        const nodeToRender = this.graph.getNode(loadingNode.id);
        console.log('[PollFeature] Node to render:', {
            id: nodeToRender?.id,
            type: nodeToRender?.type,
            question: nodeToRender?.question,
            options: nodeToRender?.options,
            hasQuestion: nodeToRender?.hasOwnProperty('question'),
            allKeys: nodeToRender ? Object.keys(nodeToRender) : [],
        });

        if (nodeToRender) {
            this.canvas.renderNode(nodeToRender);

            // Verify node was rendered by checking if wrapper exists
            setTimeout(() => {
                const wrapper = this.canvas.nodeElements?.get(loadingNode.id);
                console.log('[PollFeature] Node wrapper after render:', {
                    exists: !!wrapper,
                    hasContent: wrapper ? !!wrapper.querySelector('.node-content') : false,
                });
            }, 100);
        }

        this.canvas.clearSelection();
        this.canvas.panToNodeAnimated(loadingNode.id);

        // Register with StreamingManager for stop/continue support
        const abortController = new AbortController();
        this.streamingManager.register(loadingNode.id, {
            abortController,
            featureId: this.id,
            onStop: (nodeId) => {
                console.log('[PollFeature] Poll generation stopped');
                this.streamingManager.unregister(nodeId);
            },
            onContinue: async (nodeId, state) => {
                // Continue not supported for poll generation (would need to re-prompt)
                this.showToast?.('Cannot continue poll generation. Create a new poll instead.', 'warning');
            },
        });

        // Show stop button (after node is rendered)
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
            this.canvas.showStopButton(loadingNode.id);
        }, 0);

        try {
            console.log('[PollFeature] Starting LLM call for poll generation');

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
                    // Show streaming progress - update question with a simple indicator
                    // The protocol will render this, showing the user that generation is in progress
                    const progressText = accumulated.length > 50
                        ? `🔄 Generating poll... (${accumulated.length} chars)`
                        : '🔄 Generating poll...';

                    // Update the node in the graph
                    this.graph.updateNode(loadingNode.id, {
                        question: progressText,
                        options: [], // Keep options empty during streaming
                    });

                    // Re-render to show progress (always fetch fresh node from graph)
                    const currentNode = this.graph.getNode(loadingNode.id);
                    if (currentNode) {
                        this.canvas.renderNode(currentNode);
                    }
                },
                // onDone - parse JSON and update node
                () => {
                    console.log('[PollFeature] LLM response received, length:', fullResponse?.length || 0);
                    console.log('[PollFeature] LLM response preview:', fullResponse?.substring(0, 200));

                    // Parse JSON response
                    let pollData;
                    try {
                        // Try to find JSON object in the response (handle markdown code blocks)
                        // First try to find JSON in code blocks
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
                        console.log('[PollFeature] Parsed poll data:', pollData);

                        // Validate poll data
                        if (!pollData.question || !Array.isArray(pollData.options) || pollData.options.length === 0) {
                            throw new Error('Invalid poll structure: missing question or options');
                        }

                        // Update node with generated poll data
                        console.log('[PollFeature] Updating node with:', {
                            question: pollData.question,
                            options: pollData.options,
                            optionsLength: pollData.options.length,
                        });

                        // For poll nodes, don't set content - the protocol's renderContent handles rendering
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
                        console.error('[PollFeature] LLM response was:', fullResponse);
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
            console.error('[PollFeature] Error stack:', error.stack);

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
     * Handle voting on a poll option
     * @param {string} nodeId - Poll node ID
     * @param {number} optionIndex - Index of the option being voted for
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
     * Handle adding a new option to a poll
     * @param {string} nodeId - Poll node ID
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
     * Add an option to a poll node
     * @param {string} nodeId - Poll node ID
     * @param {string} option - Option text to add
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
     * Handle resetting all poll votes
     * @param {string} nodeId - Poll node ID
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
     * Reset all votes for a poll node
     * @param {string} nodeId - Poll node ID
     */
    resetPollVotes(nodeId) {
        // Clear all votes
        this.graph.updateNode(nodeId, { votes: {} });
        this.canvas.renderNode(this.graph.getNode(nodeId));
        this.saveSession?.();
    }
}
