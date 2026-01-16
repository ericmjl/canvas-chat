/**
 * Fetch Result Node Plugin (Built-in)
 *
 * Provides fetch result nodes for fetched content from URLs (via Exa API).
 * Fetch result nodes display the raw fetched content and support actions like
 * resummarizing, editing, and creating flashcards.
 * For YouTube videos, also provides video embedding in the output panel.
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
     * Check if this node has output (e.g., YouTube video to embed)
     */
    hasOutput() {
        return !!this.node.youtubeVideoId;
    }

    /**
     * Render the output panel content (YouTube video embed)
     */
    renderOutputPanel(canvas) {
        const videoId = this.node.youtubeVideoId;
        if (!videoId) {
            return '';
        }

        // Embed YouTube video using iframe
        // Use responsive embed with 16:9 aspect ratio
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;

        return `
            <div class="youtube-embed-container">
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
}

NodeRegistry.register({
    type: 'fetch_result',
    protocol: FetchResultNode,
    defaultSize: { width: 640, height: 480 },
});

export { FetchResultNode };
console.log('Fetch result node plugin loaded');
