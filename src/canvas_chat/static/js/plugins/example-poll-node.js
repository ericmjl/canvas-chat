/**
 * Example Plugin: Poll Node
 *
 * This plugin demonstrates how to create a custom node type for canvas-chat.
 * Poll nodes allow users to create simple polls with voting options.
 *
 * To use this plugin:
 * 1. Add plugin path to config.yaml:
 *      plugins:
 *        - path: /path/to/example-poll-node.js
 * 2. Run with: uvx canvas-chat launch --admin-mode --config config.yaml
 * 3. Create poll nodes via: createNode('poll', '', { question: '...', options: [...] })
 */

import { BaseNode, Actions } from '/static/js/node-protocols.js';
import { NodeRegistry } from '/static/js/node-registry.js';

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

console.log('Poll node plugin loaded');
