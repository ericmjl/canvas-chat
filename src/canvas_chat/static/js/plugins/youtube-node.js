/**
 * YouTube Node Plugin (Built-in)
 *
 * Provides YouTube node protocol for YouTube videos with transcript.
 * Video is embedded in main content, transcript is in output panel.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { NodeType } from '../graph-types.js';

class YouTubeNode extends BaseNode {
    getTypeLabel() {
        return 'YouTube Video';
    }

    getTypeIcon() {
        return '▶️';
    }

    getAdditionalActions() {
        return [Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS];
    }

    /**
     * Get summary text for semantic zoom (shown when zoomed out)
     * Use video title from metadata instead of transcript content
     */
    getSummaryText(canvas) {
        // Priority: user-set title > video title from metadata > fallback
        if (this.node.title) return this.node.title;
        const videoTitle = this.node.metadata?.title;
        if (videoTitle) return videoTitle;
        return 'YouTube Video';
    }

    /**
     * Render the main node content.
     * For YouTube videos: embed video iframe only (no transcript preview).
     */
    renderContent() {
        const videoId = this.node.metadata?.video_id || this.node.youtubeVideoId;
        if (!videoId) {
            // Fallback to markdown if no video ID
            return this.renderMarkdown(this.node.content);
        }

        // Embed YouTube video only (no transcript preview)
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

    /**
     * Check if node has output panel (transcript drawer).
     */
    hasOutput() {
        return true; // Always show transcript in drawer
    }

    /**
     * Render output panel (transcript drawer).
     */
    renderOutputPanel() {
        // Transcript is stored in node.content
        return `
            <div class="youtube-transcript-content">
                ${this.renderMarkdown(this.node.content)}
            </div>
        `;
    }

    /**
     * Render markdown content.
     */
    renderMarkdown(content) {
        if (!content) return '';
        // Use marked if available, otherwise return as-is
        if (typeof marked !== 'undefined') {
            return marked.parse(content);
        }
        return content;
    }
}

// Register YouTube node protocol
NodeRegistry.register({
    type: NodeType.YOUTUBE,
    protocol: YouTubeNode,
});

export { YouTubeNode };
