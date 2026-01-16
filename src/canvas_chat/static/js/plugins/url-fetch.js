/**
 * URL Fetch Plugin (Built-in)
 *
 * Handles /fetch slash command for fetching URLs (PDFs, websites, git repos).
 * This is a self-contained feature plugin that coordinates with other plugins
 * (like GitRepoFeature) to handle different URL types.
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';
import { isUrlContent, apiUrl } from '../utils.js';

export class UrlFetchFeature extends FeaturePlugin {
    getSlashCommands() {
        return [
            {
                command: '/fetch',
                description: 'Fetch content from URL (PDF, website, or git repo)',
                placeholder: 'https://...',
            },
        ];
    }

    /**
     * Handle /fetch slash command
     * @param {string} command - The slash command (e.g., '/fetch')
     * @param {string} args - Text after the command (URL)
     * @param {Object} contextObj - Additional context (e.g., { text: selectedNodesContent })
     */
    async handleCommand(command, args, contextObj) {
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

        // Check if URL supports file selection (e.g., git repos) via backend registry
        // This uses the unified backend UrlFetchRegistry to determine handler
        const supportsFileSelection = await this.checkUrlSupportsFileSelection(url);

        if (supportsFileSelection) {
            // URL supports file selection - delegate to GitRepoFeature for now
            // (In future, this could be more generic and route to any handler that supports file selection)
            try {
                const gitRepoFeature = this.featureRegistry?.getFeature('git-repo');
                if (gitRepoFeature) {
                    await gitRepoFeature.handleGitUrl(url);
                    return;
                }
            } catch (err) {
                console.warn('[UrlFetchFeature] GitRepoFeature not available, falling back to regular fetch:', err);
                // Fall through to regular URL fetching
            }
        }

        // Check if URL is a PDF
        const isPdfUrl = /\.pdf(\?.*)?$/i.test(url);

        if (isPdfUrl) {
            // Fetch PDF and extract text
            await this.handlePdfUrl(url);
        } else {
            // Fetch URL content via unified backend endpoint
            // Backend will route to appropriate handler via UrlFetchRegistry
            await this.handleWebUrl(url);
        }
    }

    /**
     * Check if URL supports file selection by querying backend registry
     * @param {string} url - URL to check
     * @returns {Promise<boolean>} True if URL supports file selection
     */
    async checkUrlSupportsFileSelection(url) {
        try {
            // Try to list files - if endpoint exists and handler supports it, URL supports file selection
            const response = await fetch(apiUrl('/api/url-fetch/list-files'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, git_credentials: {} }), // Empty credentials for check
            });

            // If we get a response (even if it fails due to auth), the handler supports file listing
            // Only return false if handler doesn't exist or doesn't support file listing
            if (response.status === 400) {
                const error = await response.json();
                // "not supported by any registered handler" means no handler for this URL
                // "does not support file listing" means handler exists but no file selection
                if (error.detail?.includes('not supported by any registered handler') ||
                    error.detail?.includes('does not support file listing')) {
                    return false;
                }
                // Other 400 errors (like auth) mean the handler exists and supports file listing
                return true;
            }

            // 200 means handler exists and supports file listing
            return response.ok;
        } catch (err) {
            // Network error or other issue - assume no file selection support
            console.warn('[UrlFetchFeature] Error checking file selection support:', err);
            return false;
        }
    }

    /**
     * Fetch URL content and create a FETCH_RESULT node.
     *
     * This uses Jina Reader API (/api/fetch-url) which is free and requires no API key.
     * This is intentionally separate from handleNodeFetchSummarize which uses Exa API.
     *
     * Design rationale (see docs/explanation/url-fetching.md):
     * - /fetch <url> should "just work" without any API configuration (zero-friction)
     * - Exa API (used by fetch+summarize) offers higher quality but requires API key
     * - Both create FETCH_RESULT nodes with the same structure for consistency
     *
     * @param {string} url - The URL to fetch
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
            const edge = createEdge(
                parentId,
                fetchNode.id,
                parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY
            );
            this.graph.addEdge(edge);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.saveSession?.();
        this.updateEmptyState?.();

        try {
            // Fetch URL content via backend (uses Jina Reader API, free, no API key required)
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

            // For YouTube videos: extract transcript from content, show video in main content
            let nodeContent = data.content;
            if (data.video_id) {
                // Extract transcript (everything after "---\n\n" separator)
                const transcriptStart = data.content.indexOf('---\n\n');
                if (transcriptStart !== -1) {
                    // Use just the transcript as content (for LLM context)
                    nodeContent = data.content.substring(transcriptStart + 5); // Skip "---\n\n"
                }
            } else {
                // For non-YouTube URLs, use full content with title
                nodeContent = `**[${data.title}](${url})**\n\n${data.content}`;
            }

            this.canvas.updateNodeContent(fetchNode.id, nodeContent, false);

            // Store YouTube video ID if present (for embedding)
            const updateData = {
                content: nodeContent,
                versions: [
                    {
                        content: nodeContent,
                        timestamp: Date.now(),
                        reason: 'fetched',
                    },
                ],
            };
            if (data.video_id) {
                updateData.youtubeVideoId = data.video_id;
                // Open drawer by default for YouTube videos to show transcript
                updateData.outputExpanded = true;
            }
            this.graph.updateNode(fetchNode.id, updateData);

            // Re-render node to show output panel if YouTube video is present
            if (data.video_id) {
                const updatedNode = this.graph.getNode(fetchNode.id);
                if (updatedNode) {
                    this.canvas.renderNode(updatedNode);
                }
            }

            this.saveSession?.();
        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to fetch URL**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(fetchNode.id, errorContent, false);
            this.graph.updateNode(fetchNode.id, { content: errorContent });
            this.saveSession?.();
        }
    }

    /**
     * Fetch a PDF from URL and create a PDF node with extracted text.
     * @param {string} url - The URL of the PDF to fetch
     */
    async handlePdfUrl(url) {
        // Get selected nodes (if any) to link the PDF to
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create a placeholder node while fetching
        const pdfNode = createNode(NodeType.PDF, `Fetching PDF from:\n${url}...`, {
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(pdfNode);

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(
                parentId,
                pdfNode.id,
                parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY
            );
            this.graph.addEdge(edge);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        this.saveSession?.();
        this.updateEmptyState?.();

        // Pan to the new node
        this.canvas.centerOnAnimated(pdfNode.position.x + 160, pdfNode.position.y + 100, 300);

        try {
            // Fetch PDF content via backend
            const response = await fetch(apiUrl('/api/fetch-pdf'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to fetch PDF');
            }

            const data = await response.json();

            // Update the node with the extracted content
            this.canvas.updateNodeContent(pdfNode.id, data.content, false);
            this.graph.updateNode(pdfNode.id, {
                content: data.content,
                title: data.title,
                page_count: data.page_count,
            });
            this.saveSession?.();
        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to fetch PDF**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(pdfNode.id, errorContent, false);
            this.graph.updateNode(pdfNode.id, { content: errorContent });
            this.saveSession?.();
        }
    }
}

console.log('URL Fetch plugin loaded');
