/**
 * URL Fetch Plugin (Built-in)
 *
 * Handles /fetch slash command for generic URL fetching.
 * Creates basic FETCH_RESULT nodes without special rendering.
 * For enhanced UX (file selection, video embedding), use specific commands:
 * - /git for git repositories
 * - /youtube for YouTube videos
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';
import { isUrlContent, apiUrl } from '../utils.js';

/**
 * UrlFetchFeature - Handles generic URL fetching
 */
export class UrlFetchFeature extends FeaturePlugin {
    /**
     * Get slash commands for this feature
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/fetch',
                description: 'Fetch content from URL (basic fetch, no special rendering)',
                placeholder: 'https://...',
            },
        ];
    }

    /**
     * Handle /fetch slash command
     * Generic URL fetching - creates basic FETCH_RESULT nodes.
     * For enhanced UX, use specific commands (/git, /youtube).
     *
     * @param {string} command - The slash command (e.g., '/fetch')
     * @param {string} args - Text after the command (URL)
     * @param {Object} _contextObj - Additional context (unused, kept for interface)
     */
    async handleCommand(command, args, _contextObj) {
        const url = args.trim();
        if (!url) {
            this.showToast?.('Please provide a URL', 'warning');
            return;
        }

        // Validate it's actually a URL
        if (!isUrlContent(url)) {
            this.showToast?.('Please provide a valid URL', 'warning');
            return;
        }

        // Generic URL fetching - no special cases
        // Backend routes to appropriate handler via UrlFetchRegistry
        // All create basic FETCH_RESULT nodes (no special rendering)
        await this.handleWebUrl(url);
    }

    /**
     * Fetch URL content and create a basic FETCH_RESULT node.
     *
     * Generic URL fetching - creates basic nodes without special rendering.
     * For enhanced UX (file selection, video embedding), use specific commands:
     * - /git for git repositories
     * - /youtube for YouTube videos
     *
     * This uses Jina Reader API (/api/fetch-url) which is free and requires no API key.
     *
     * @param {string} url - The URL to fetch
     * @returns {Promise<void>}
     */
    async handleWebUrl(url) {
        // Get selected nodes (if any) to link the fetched content to
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create a placeholder node while fetching
        const fetchNode = createNode(NodeType.FETCH_RESULT, `Fetching content from:\n${url}...`, {
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(fetchNode);
        this.canvas.clearSelection();

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, fetchNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.saveSession?.();
        this.updateEmptyState?.();

        try {
            // Fetch URL content via backend (uses UrlFetchRegistry to route to handler)
            const response = await fetch(apiUrl('/api/fetch-url'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to fetch URL');
            }

            const data = await response.json();

            // Generic content - always use full content with title
            // No special rendering (that's handled by /git and /youtube commands)
            const nodeContent = `**[${data.title}](${url})**\n\n${data.content}`;

            // Update node (basic FETCH_RESULT, no special rendering)
            const updateData = {
                content: nodeContent,
                metadata: data.metadata || {},
                versions: [
                    {
                        content: nodeContent,
                        timestamp: Date.now(),
                        reason: 'fetched',
                    },
                ],
            };

            this.graph.updateNode(fetchNode.id, updateData);
            this.canvas.updateNodeContent(fetchNode.id, nodeContent, false);

            this.saveSession?.();
        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to fetch URL**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(fetchNode.id, errorContent, false);
            this.graph.updateNode(fetchNode.id, { content: errorContent });
            this.saveSession?.();
        }
    }
}

console.log('URL Fetch plugin loaded');
