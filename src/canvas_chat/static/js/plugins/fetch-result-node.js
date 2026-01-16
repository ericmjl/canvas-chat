/**
 * Fetch Result Node Plugin (Built-in)
 *
 * Provides fetch result nodes for fetched content from URLs (via Exa API).
 * Fetch result nodes display the raw fetched content and support actions like
 * resummarizing, editing, and creating flashcards.
 * For YouTube videos: video is embedded in main content, transcript is in output panel.
 */
import { BaseNode, Actions } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

class FetchResultNode extends BaseNode {
    getTypeLabel() {
        return 'Fetched Content';
    }

    getTypeIcon() {
        return '📄';
    }

    getAdditionalActions() {
        return [Actions.RESUMMARIZE, Actions.CREATE_FLASHCARDS];
    }

    /**
     * Render the main node content.
     * For YouTube videos, show embedded video. Otherwise, show markdown content.
     */
    renderContent(canvas) {
        // If this is a YouTube video, show embedded video in main content
        if (this.node.youtubeVideoId) {
            const videoId = this.node.youtubeVideoId;
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
     */
    hasOutput() {
        // YouTube videos always have transcripts in the output panel
        return !!this.node.youtubeVideoId;
    }

    /**
     * Render the output panel content (transcript for YouTube videos)
     */
    renderOutputPanel(canvas) {
        const videoId = this.node.youtubeVideoId;
        if (!videoId) {
            return '';
        }

        // Extract transcript from content (everything after the header/metadata)
        // Content format: "**[Title](URL)**\n\n**Video ID:** ...\n\n**URL:** ...\n\n**Language:** ...\n\n---\n\n**[timestamp]** text..."
        const content = this.node.content || '';

        // Find the transcript section (after the "---" separator)
        const transcriptStart = content.indexOf('---\n\n');
        if (transcriptStart === -1) {
            // Fallback: show full content if separator not found
            return canvas.renderMarkdown(content);
        }

        // Extract transcript (everything after "---\n\n")
        const transcript = content.substring(transcriptStart + 5); // Skip "---\n\n"

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
