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
import { PDF_NEXT_PAGE, PDF_PREV_PAGE } from './pdf-viewer.js';

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
     * PDF nodes get Prev/Next page in the action bar; all get Summarize and Flashcards.
     * @returns {Array<{id: string, label: string, title: string}>}
     */
    getAdditionalActions() {
        const metadata = this.node.metadata || {};
        const isPdf =
            metadata.content_type === 'pdf' && (metadata.pdf_url || metadata.pdf_source === 'upload');
        const pdfActions = isPdf ? [PDF_PREV_PAGE, PDF_NEXT_PAGE] : [];
        return [...pdfActions, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS];
    }

    /**
     * Keyboard shortcuts. PDF nodes get ArrowLeft/ArrowRight for prev/next page.
     * @returns {Object.<string, {action: string, handler: string}>}
     */
    getKeyboardShortcuts() {
        const base = super.getKeyboardShortcuts();
        const metadata = this.node.metadata || {};
        const isPdf =
            metadata.content_type === 'pdf' && (metadata.pdf_url || metadata.pdf_source === 'upload');
        if (isPdf) {
            base.ArrowLeft = { action: 'pdf-prev-page', handler: 'pdf-prev-page' };
            base.ArrowRight = { action: 'pdf-next-page', handler: 'pdf-next-page' };
        }
        return base;
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

        // PDF: show viewer container when we have a PDF source (url or upload)
        // Hydration (load PDF, render first page, extract text) runs from canvas after mount
        const pdfUrl = metadata.pdf_url;
        const pdfSource = metadata.pdf_source;
        if (contentType === 'pdf' && (pdfUrl || pdfSource === 'upload')) {
            const safeUrl = pdfUrl ? pdfUrl.replace(/"/g, '&quot;') : '';
            return `
                <div class="pdf-viewer-container" data-node-id="${this.node.id}" ${pdfUrl ? `data-pdf-url="${safeUrl}"` : 'data-pdf-source="upload"'} data-pdf-hydrated="false">
                    <div class="pdf-viewer-page-info" aria-live="polite">Page 1 of 1</div>
                    <div class="pdf-viewer-loading">Loading PDF…</div>
                    <div class="pdf-viewer-page" style="display:none;">
                        <canvas class="pdf-viewer-canvas" aria-label="PDF page"></canvas>
                        <div class="pdf-viewer-text-layer" aria-hidden="true"></div>
                    </div>
                </div>
            `;
        }

        // Legacy PDF nodes (no pdf_url): show extracted text as markdown
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
