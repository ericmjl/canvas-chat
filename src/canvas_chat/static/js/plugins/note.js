/**
 * Note Plugin (Built-in)
 *
 * Provides note nodes for markdown content and URL fetching.
 * This is a built-in plugin that combines:
 * - NoteNode protocol (custom node rendering)
 * - NoteFeature (slash command and event handling)
 */

import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';
import { isUrlContent, apiUrl } from '../utils.js';

// =============================================================================
// Note Node Protocol
// =============================================================================

/**
 * Note Node Protocol Class
 * Defines how note nodes are rendered and what actions they support.
 */
class NoteNode extends BaseNode {
    /**
     * Display label shown in node header
     */
    getTypeLabel() {
        return 'Note';
    }

    /**
     * Emoji icon for the node type
     */
    getTypeIcon() {
        return '📝';
    }

    /**
     * Action buttons for the note node
     */
    getActions() {
        return [Actions.REPLY, Actions.EDIT_CONTENT, Actions.CREATE_FLASHCARDS, Actions.COPY];
    }
}

// Register the note node type
NodeRegistry.register({
    type: 'note',
    protocol: NoteNode,
    defaultSize: { width: 640, height: 480 },
    // Note: CSS styles for note nodes are in nodes.css (no custom CSS needed)
});

// Export NoteNode for testing
export { NoteNode };

// =============================================================================
// Note Feature Plugin
// =============================================================================

/**
 * Note Feature Plugin
 * Handles the /note slash command for creating note nodes.
 * Supports both markdown content and URL fetching.
 */
export class NoteFeature extends FeaturePlugin {
    getSlashCommands() {
        return [
            {
                command: '/note',
                description: 'Add a note or fetch URL content',
                placeholder: 'markdown or https://...',
            },
        ];
    }

    /**
     * Handle /note slash command
     * @param {string} command - The slash command (e.g., '/note')
     * @param {string} args - Text after the command (markdown content or URL)
     * @param {Object} contextObj - Additional context (e.g., { text: selectedNodesContent })
     */
    async handleCommand(command, args, contextObj) {
        const content = args.trim();
        if (!content) {
            this.showToast?.('Please provide note content or a URL', 'warning');
            return;
        }

        // Check if content is a URL using the same utility as app.js
        const isUrl = isUrlContent(content);

        if (isUrl) {
            // Handle URL fetching
            const isPdfUrl = /\.pdf(\?.*)?$/i.test(content);

            if (isPdfUrl) {
                // Fetch PDF and extract text
                await this.handleNoteFromPdfUrl(content);
            } else {
                // Fetch URL content and create a FETCH_RESULT node
                await this.handleNoteFromUrl(content);
            }
        } else {
            // Create a regular NOTE node with markdown content
            await this.handleNoteFromContent(content);
        }
    }

    /**
     * Create a NOTE node with markdown content
     * @param {string} content - Markdown content for the note
     */
    async handleNoteFromContent(content) {
        // Get selected nodes (if any) to link the note to
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create NOTE node with the provided content
        const noteNode = createNode(NodeType.NOTE, content, {
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(noteNode);

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(
                parentId,
                noteNode.id,
                parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY
            );
            this.graph.addEdge(edge);
        }

        // Clear input and save
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        this.saveSession?.();
        this.updateEmptyState?.();

        // Pan to the new note
        this.canvas.centerOnAnimated(noteNode.position.x + 160, noteNode.position.y + 100, 300);
    }

    /**
     * Fetch URL content and create a FETCH_RESULT node.
     *
     * This uses Jina Reader API (/api/fetch-url) which is free and requires no API key.
     * This is intentionally separate from handleNodeFetchSummarize which uses Exa API.
     *
     * Design rationale (see docs/explanation/url-fetching.md):
     * - /note <url> should "just work" without any API configuration (zero-friction)
     * - Exa API (used by fetch+summarize) offers higher quality but requires API key
     * - Both create FETCH_RESULT nodes with the same structure for consistency
     *
     * @param {string} url - The URL to fetch
     */
    async handleNoteFromUrl(url) {
        // Check if URL is a git repository and delegate to GitRepoFeature
        try {
            const gitRepoFeature = this.featureRegistry?.getFeature('git-repo');
            if (gitRepoFeature && gitRepoFeature.isGitRepositoryUrl(url)) {
                // Delegate to GitRepoFeature
                await gitRepoFeature.handleGitUrl(url);
                return;
            }
        } catch (err) {
            // GitRepoFeature not available, fall through to regular URL fetching
            console.warn('[NoteFeature] GitRepoFeature not available, using regular fetch:', err);
        }

        // Fall through to regular URL fetching (existing logic)
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

            // Update the node with the fetched content (matching app.js format)
            const fetchedContent = `**[${data.title}](${url})**\n\n${data.content}`;
            this.canvas.updateNodeContent(fetchNode.id, fetchedContent, false);
            this.graph.updateNode(fetchNode.id, {
                content: fetchedContent,
                versions: [
                    {
                        content: fetchedContent,
                        timestamp: Date.now(),
                        reason: 'fetched',
                    },
                ],
            });
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
    async handleNoteFromPdfUrl(url) {
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

console.log('Note plugin loaded (node protocol + feature)');
