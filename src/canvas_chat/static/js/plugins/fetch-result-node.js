/**
 * Fetch Result Node Plugin (Built-in)
 *
 * Provides fetch result nodes for fetched content from URLs (via Exa API).
 * Fetch result nodes display the raw fetched content and support actions like
 * resummarizing, editing, and creating flashcards.
 * For YouTube videos: video is embedded in main content, transcript is in output panel.
 */
import { Actions, BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

/**
 * FetchResultNode - Protocol for fetched content display
 */
class FetchResultNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        // Show content-type-specific labels
        const metadata = this.node.metadata || {};
        const contentType = metadata.content_type;

        if (contentType === 'pdf') {
            return 'PDF';
        } else if (contentType === 'youtube') {
            return 'YouTube Video';
        } else if (contentType === 'git') {
            return 'Git Repository';
        }

        return 'Fetched Content';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        // Show content-type-specific icons
        const metadata = this.node.metadata || {};
        const contentType = metadata.content_type;

        if (contentType === 'pdf') {
            return '📑';
        } else if (contentType === 'youtube') {
            return '▶️';
        } else if (contentType === 'git') {
            return '📦';
        }

        return '📄';
    }

    /**
     * Get additional action buttons for this node
     * @returns {Array<string>}
     */
    getAdditionalActions() {
        return [Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS];
    }

    /**
     * Render the main node content.
     * For YouTube videos, show embedded video. Otherwise, show markdown content.
     * @param {Canvas} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        // Read metadata (unified format)
        const metadata = this.node.metadata || {};
        const contentType = metadata.content_type;

        // If this is a YouTube video, show embedded video in main content
        // Support both old format (youtubeVideoId) and new format (metadata.video_id)
        const videoId = this.node.youtubeVideoId || metadata.video_id;

        if (contentType === 'youtube' && videoId) {
            const embedUrl = `https://www.youtube.com/embed/${videoId}`;

            return `
                <div class="youtube-embed-container youtube-embed-main">
                    <iframe
                        src="${embedUrl}"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        class="youtube-embed-iframe"
                    ></iframe>
                </div>
            `;
        }

        // Default: render markdown content
        return canvas.renderMarkdown(this.node.content || '');
    }

    /**
     * Check if this node has output (transcript for YouTube videos)
     * @returns {boolean}
     */
    hasOutput() {
        // YouTube videos always have transcripts in the output panel
        // Support both old format (youtubeVideoId) and new format (metadata.video_id)
        const metadata = this.node.metadata || {};
        return !!(this.node.youtubeVideoId || (metadata.content_type === 'youtube' && metadata.video_id));
    }

    /**
     * Render the output panel content (transcript for YouTube videos)
     * @param {Canvas} canvas
     * @returns {string}
     */
    renderOutputPanel(canvas) {
        // Support both old format (youtubeVideoId) and new format (metadata.video_id)
        const metadata = this.node.metadata || {};
        const videoId = this.node.youtubeVideoId || metadata.video_id;

        if (!videoId || metadata.content_type !== 'youtube') {
            return '';
        }

        // For YouTube videos, content IS the transcript (no extraction needed)
        const transcript = this.node.content || '';

        // Render transcript as markdown
        return canvas.renderMarkdown(transcript);
    }
}

NodeRegistry.register({
    type: 'fetch_result',
    protocol: FetchResultNode,
    defaultSize: { width: 640, height: 480 },
});

export { FetchResultNode };
console.log('Fetch result node plugin loaded');
