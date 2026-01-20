/**
 * YouTube Feature Plugin (Built-in)
 *
 * Handles /youtube slash command for fetching YouTube videos with transcript.
 * Creates FETCH_RESULT nodes with video embedding and transcript drawer.
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';
import { isUrlContent, apiUrl } from '../utils.js';

/**
 * YouTubeFeature - Handles YouTube video fetching
 */
export class YouTubeFeature extends FeaturePlugin {
    /**
     * Get slash commands for this feature
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/youtube',
                description: 'Fetch YouTube video with transcript',
                placeholder: 'https://youtube.com/watch?v=...',
            },
        ];
    }

    /**
     * Handle /youtube slash command
     * @param {string} command - The slash command (e.g., '/youtube')
     * @param {string} args - Text after the command (URL)
     * @param {Object} _contextObj - Additional context (unused, kept for interface)
     */
    async handleCommand(command, args, _contextObj) {
        const url = args.trim();
        if (!url) {
            this.showToast?.('Please provide a YouTube URL', 'warning');
            return;
        }

        // Validate it's actually a URL
        if (!isUrlContent(url)) {
            this.showToast?.('Please provide a valid URL', 'warning');
            return;
        }

        // Get selected nodes for positioning
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create placeholder node
        const fetchNode = createNode(NodeType.YOUTUBE, `Fetching YouTube video...`, {
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
            // Fetch via backend (uses YouTubeHandler via UrlFetchRegistry)
            const response = await fetch(apiUrl('/api/fetch-url'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to fetch YouTube video');
            }

            const data = await response.json();

            // Extract metadata
            const metadata = data.metadata || {};
            const contentType = metadata.content_type;
            const videoId = metadata.video_id;

            if (contentType !== 'youtube' || !videoId) {
                throw new Error('URL is not a valid YouTube video');
            }

            // Extract transcript (everything after "---\n\n" separator)
            let nodeContent = data.content;
            const transcriptStart = data.content.indexOf('---\n\n');
            if (transcriptStart !== -1) {
                // Use just the transcript as content (for LLM context)
                nodeContent = data.content.substring(transcriptStart + 5); // Skip "---\n\n"
            }

            // Update node with YouTube-specific configuration
            const updateData = {
                content: nodeContent, // Just transcript for LLM context
                metadata: metadata,
                youtubeVideoId: videoId, // Backward compatibility
                outputExpanded: true, // Open drawer by default to show transcript
                outputPanelHeight: 400,
                versions: [
                    {
                        content: nodeContent,
                        timestamp: Date.now(),
                        reason: 'fetched',
                    },
                ],
            };

            this.graph.updateNode(fetchNode.id, updateData);

            // Full re-render to show video in main content and transcript in drawer
            const updatedNode = this.graph.getNode(fetchNode.id);
            if (updatedNode) {
                this.canvas.renderNode(updatedNode);
            }

            this.saveSession?.();
        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to fetch YouTube video**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(fetchNode.id, errorContent, false);
            this.graph.updateNode(fetchNode.id, { content: errorContent });
            this.saveSession?.();
        }
    }

    /**
     *
     */
    async onLoad() {
        console.log('[YouTubeFeature] Loaded');
    }
}

console.log('[YouTubeFeature] Plugin loaded');
