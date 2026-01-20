/**
 * Note Plugin (Built-in)
 *
 * Provides note nodes for markdown content.
 * This is a built-in plugin that combines:
 * - NoteNode protocol (custom node rendering)
 * - NoteFeature (slash command and event handling)
 *
 * Note: URL fetching (PDFs, websites, git repos) is handled by UrlFetchFeature (/fetch command).
 */

import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { FeaturePlugin } from '../feature-plugin.js';
import { createNode, NodeType } from '../graph-types.js';
import { createEdge, EdgeType } from '../graph-types.js';

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
     * @returns {string}
     */
    getTypeLabel() {
        return 'Note';
    }

    /**
     * Emoji icon for the node type
     * @returns {string}
     */
    getTypeIcon() {
        return '📝';
    }

    /**
     * Get additional action buttons for this node
     * @returns {Array<string>}
     */
    getAdditionalActions() {
        return [Actions.CREATE_FLASHCARDS];
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
 * Handles the /note slash command for creating note nodes with markdown content.
 * For URL fetching, use /fetch command (handled by UrlFetchFeature).
 */
export class NoteFeature extends FeaturePlugin {
    /**
     * Get slash commands for this feature
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/note',
                description: 'Add a note with markdown content',
                placeholder: 'markdown content...',
            },
        ];
    }

    /**
     * Handle /note slash command
     * @param {string} command - The slash command (e.g., '/note')
     * @param {string} args - Text after the command (markdown content)
     * @param {Object} _contextObj - Additional context (unused, kept for interface)
     */
    async handleCommand(command, args, _contextObj) {
        const content = args.trim();
        if (!content) {
            this.showToast?.('Please provide note content', 'warning');
            return;
        }

        // Create a regular NOTE node with markdown content
        await this.handleNoteFromContent(content);
    }

    /**
     * Create a NOTE node with markdown content
     * @param {string} content - Markdown content for the note
     * @returns {Promise<void>}
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
            const edge = createEdge(parentId, noteNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        // Clear input and save
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        this.saveSession?.();
        this.updateEmptyState?.();
    }
}

console.log('Note plugin loaded (node protocol + feature)');
