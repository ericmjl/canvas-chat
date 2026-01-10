/* global NodeRegistry, BaseNode, Actions */
/**
 * Example Plugin: Poll Node
 *
 * This plugin demonstrates how to create a custom node type for canvas-chat.
 * Poll nodes allow users to create simple polls with voting options.
 *
 * To use this plugin:
 * 1. Add <script src="static/js/plugins/example-poll-node.js"></script> to index.html
 *    after node-protocols.js
 * 2. The plugin auto-registers on load
 * 3. Create poll nodes via: NodeRegistry.createNode('poll', '', { question: '...', options: [...] })
 */

(function () {
    'use strict';

    // Wait for NodeRegistry and BaseNode to be available
    if (typeof NodeRegistry === 'undefined' || typeof BaseNode === 'undefined') {
        console.error('PollNode plugin: NodeRegistry or BaseNode not available');
        return;
    }

    /**
     * Poll Node Protocol Class
     * Defines how poll nodes are rendered and what actions they support.
     */
    class PollNode extends BaseNode {
        /**
         * Display label shown in node header
         */
        getTypeLabel() {
            return 'Poll';
        }

        /**
         * Emoji icon for the node type
         */
        getTypeIcon() {
            return '📊';
        }

        /**
         * Summary text for semantic zoom (shown when zoomed out)
         */
        getSummaryText(canvas) {
            // Show question as summary
            const question = this.node.question || 'Poll';
            return canvas.truncate(question, 50);
        }

        /**
         * Render the HTML content for the poll
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

        // CSS styles for poll nodes
        css: `
            .node.poll {
                background: var(--node-poll);
                border-color: var(--node-poll-border);
            }

            .poll-content {
                padding: 0.5rem;
            }

            .poll-question {
                font-weight: bold;
                font-size: 1.1em;
                margin-bottom: 1rem;
                color: #333;
            }

            .poll-options {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .poll-option {
                position: relative;
                padding: 0.75rem;
                background: rgba(255, 255, 255, 0.5);
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.15s;
                overflow: hidden;
            }

            .poll-option:hover {
                background: rgba(255, 255, 255, 0.8);
            }

            .poll-option-bar {
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                background: rgba(59, 130, 246, 0.2);
                transition: width 0.3s ease;
            }

            .poll-option-text {
                position: relative;
                z-index: 1;
            }

            .poll-option-votes {
                position: relative;
                z-index: 1;
                float: right;
                color: #666;
                font-size: 0.9em;
            }

            .poll-total {
                margin-top: 1rem;
                font-size: 0.85em;
                color: #666;
                text-align: right;
            }
        `,

        // CSS variables for theming
        cssVariables: {
            '--node-poll': '#e8f5e9',
            '--node-poll-border': '#81c784',
        },
    });

    console.log('PollNode plugin registered successfully');

    // Example usage (uncomment to test):
    // const pollNode = NodeRegistry.createNode('poll', '', {
    //     question: 'What is your favorite programming language?',
    //     options: ['Python', 'JavaScript', 'Rust', 'Go'],
    //     votes: { 0: 15, 1: 12, 2: 8, 3: 5 }
    // });
})();
