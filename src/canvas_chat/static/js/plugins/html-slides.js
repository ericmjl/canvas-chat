/**
 * HTML Slides Node Plugin (Built-in)
 *
 * Provides an output node for single-file HTML presentations (html-presentations skill format).
 * - Store full HTML in node.htmlSlidesContent
 * - Embed in iframe with Prev/Next toolbar; postMessage bridge for external nav
 * - /slides slash command: paste HTML or provide topic for LLM-generated slides
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { EdgeType, NodeType, createEdge, createNode } from '../graph-types.js';
import { Actions, BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Detect if the user pasted raw HTML (vs a topic phrase).
 * @param {string} args - Trimmed slash command args
 * @returns {boolean}
 */
function isPastedHtml(args) {
    const t = args.trim();
    return t.startsWith('<!') || t.includes('<div class="deck"');
}

/**
 * Extract title from HTML string (first <title>...</title>).
 * @param {string} html
 * @returns {string}
 */
function extractTitleFromHtml(html) {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return (m && m[1].trim()) ? m[1].trim() : 'Slides';
}

/**
 * Inject a script before </body> so the iframe can receive postMessage and dispatch keydown.
 * Enables Prev/Next toolbar buttons to drive the deck's keyboard nav.
 * @param {string} html - Full HTML string
 * @returns {string}
 */
function injectPostMessageBridge(html) {
    const script = `
<script>
window.addEventListener('message', function(e) {
  if (e.data === 'next') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  if (e.data === 'prev') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
});
</script>
`;
    if (html.includes('</body>')) {
        return html.replace('</body>', script + '\n</body>');
    }
    return html + script;
}

/**
 * Strip markdown code fence or preamble and return raw HTML.
 * Handles: ```html ... ```, ``` ... ```, or preamble text before <!DOCTYPE / <html>.
 * @param {string} text
 * @returns {string}
 */
function stripMarkdownHtmlWrapper(text) {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    // Code fence (optional "html" tag)
    const fence = /```(?:html)?\s*\n?([\s\S]*?)```/;
    const fenceMatch = trimmed.match(fence);
    if (fenceMatch) return fenceMatch[1].trim();
    // Preamble before HTML: take from <!DOCTYPE or <html to end
    const htmlStart = trimmed.search(/<\s*!?\s*DOCTYPE\s+html|<\s*html\s/i);
    if (htmlStart >= 0) return trimmed.slice(htmlStart).trim();
    return trimmed;
}

// =============================================================================
// HTML Slides System Prompt (html-presentations skill–compatible output)
// =============================================================================

const SLIDES_SYSTEM_PROMPT = `You are a precise HTML slide generator. Output exactly one self-contained HTML file: no markdown, no code fence, no preamble.

Requirements:
- Single file: all CSS and JavaScript inline in that HTML.
- Structure: a container with class "deck", and children with class "slide"; the active slide has class "active".
- Navigation: Space/Right/Arrow for next, Shift+Space/Left/Arrow for previous; Escape for overview grid.
- Bottom nav bar: prev/next buttons and progress dots.
- Use CSS custom properties for theming (e.g. --bg, --fg, --accent).
- No external resources: no CDN, no images from URLs. Inline SVG is fine.

Output only the raw HTML document (DOCTYPE, html, head, body, and all content). Nothing else.`;

// Blob URLs for iframe src (keyed by nodeId) so we can revoke on re-render and avoid memory leaks
const blobUrlsByNodeId = new Map();

// =============================================================================
// HtmlSlidesNode Protocol
// =============================================================================

/**
 * Node protocol for HTML slides (single-file presentation embedded in node).
 */
class HtmlSlidesNode extends BaseNode {
    /**
     * @returns {string}
     */
    getTypeLabel() {
        return 'Slides';
    }

    /**
     * @returns {string}
     */
    getTypeIcon() {
        return '📽️';
    }

    /**
     * @returns {Array<Object>}
     */
    getActions() {
        return [Actions.REPLY, Actions.COPY];
    }

    /**
     * @param {any} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        if (this.node.title) return this.node.title;
        return 'HTML Slides';
    }

    /**
     * No output panel; everything is in the node body.
     * @returns {boolean}
     */
    hasOutput() {
        return false;
    }

    /**
     * @param {any} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        const htmlContent = this.node.htmlSlidesContent || '';
        if (this.node.generating) {
            return `
                <div class="html-slides-node html-slides-generating">
                    <div class="html-slides-generating-inner">
                        <div class="spinner"></div>
                        <p class="html-slides-generating-text">${canvas.escapeHtml('Generating slides...')}</p>
                    </div>
                </div>
            `;
        }
        if (!htmlContent.trim()) {
            return `
                <div class="html-slides-node html-slides-empty">
                    <p class="html-slides-placeholder">${canvas.escapeHtml('No slides. Paste HTML or use /slides <topic>')}</p>
                </div>
            `;
        }

        // Use empty src; init handler will set iframe.src to a Blob URL so content loads
        // the same way as "Open in new tab" (avoids srcdoc length/escaping issues)
        return `
            <div class="html-slides-node">
                <div class="html-slides-embed">
                    <iframe
                        class="html-slides-iframe"
                        sandbox="allow-scripts"
                        title="HTML presentation"
                    ></iframe>
                </div>
                <div class="html-slides-toolbar">
                    <button type="button" class="html-slides-prev" title="Previous slide">◀ Prev</button>
                    <button type="button" class="html-slides-next" title="Next slide">Next ▶</button>
                    <button type="button" class="html-slides-open" title="Open in new tab">Open in new tab</button>
                    <button type="button" class="html-slides-download" title="Download as HTML file">Download</button>
                </div>
            </div>
        `;
    }

    /**
     * Event bindings for toolbar: Prev/Next postMessage to iframe, Open opens blob URL.
     * @returns {Array<Object>}
     */
    getEventBindings() {
        return [
            {
                selector: '.html-slides-iframe',
                event: 'init',
                handler: (nodeId, e, canvas) => {
                    const iframe = e?.currentTarget;
                    if (!iframe || !canvas?.graph) return;
                    const node = canvas.graph.getNode(nodeId);
                    const html = node?.htmlSlidesContent;
                    if (!html || !html.trim()) return;
                    // Revoke previous blob URL for this node to avoid leaks on re-render
                    const prev = blobUrlsByNodeId.get(nodeId);
                    if (prev) {
                        URL.revokeObjectURL(prev);
                        blobUrlsByNodeId.delete(nodeId);
                    }
                    const blob = new Blob([injectPostMessageBridge(html)], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    blobUrlsByNodeId.set(nodeId, url);
                    iframe.src = url;
                },
            },
            {
                selector: '.html-slides-prev',
                handler: (nodeId, _e, canvas) => {
                    const wrapper = canvas.getNodeWrapper?.(nodeId);
                    const iframe = wrapper?.querySelector?.('.html-slides-iframe');
                    if (iframe?.contentWindow) {
                        iframe.contentWindow.postMessage('prev', '*');
                    }
                },
            },
            {
                selector: '.html-slides-next',
                handler: (nodeId, _e, canvas) => {
                    const wrapper = canvas.getNodeWrapper?.(nodeId);
                    const iframe = wrapper?.querySelector?.('.html-slides-iframe');
                    if (iframe?.contentWindow) {
                        iframe.contentWindow.postMessage('next', '*');
                    }
                },
            },
            {
                selector: '.html-slides-open',
                handler: (nodeId, _e, canvas) => {
                    const node = canvas.graph?.getNode?.(nodeId);
                    const html = node?.htmlSlidesContent;
                    if (!html) return;
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank', 'noopener');
                    URL.revokeObjectURL(url);
                },
            },
            {
                selector: '.html-slides-download',
                handler: (nodeId, _e, canvas) => {
                    const node = canvas.graph?.getNode?.(nodeId);
                    const html = node?.htmlSlidesContent;
                    if (!html) return;
                    const base = (node?.title || 'slides').replace(/[^a-zA-Z0-9-_.\s]/g, '').trim() || 'slides';
                    const filename = base.endsWith('.html') ? base : `${base}.html`;
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                },
            },
        ];
    }

    /**
     * @param {any} _canvas
     * @returns {string}
     */
    copyToClipboard(_canvas) {
        return this.node.htmlSlidesContent || this.node.content || '';
    }
}

NodeRegistry.register({
    type: NodeType.HTML_SLIDES,
    protocol: HtmlSlidesNode,
    defaultSize: { width: 720, height: 480 },
});

export { HtmlSlidesNode, isPastedHtml, stripMarkdownHtmlWrapper };

// =============================================================================
// Slides Feature (slash command)
// =============================================================================

/**
 * Feature plugin for /slides: create HTML slides node from pasted HTML or LLM-generated content.
 */
export class HtmlSlidesFeature extends FeaturePlugin {
    /**
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/slides',
                description: 'Create HTML slides (topic or paste HTML)',
                placeholder: 'Topic or paste HTML...',
            },
        ];
    }

    /**
     * Handle /slides: paste path creates node with htmlSlidesContent; topic path creates placeholder and streams LLM.
     * @param {string} command - '/slides'
     * @param {string} args - Topic or raw HTML
     * @param {Object} contextObj - Slash command context
     */
    async handleCommand(command, args, contextObj) {
        const trimmed = (args || '').trim();
        const selectedContext = contextObj?.text || null;

        if (!trimmed && !selectedContext) {
            this.showToast?.('Provide a topic or paste HTML, or select a node and describe what slides you want', 'warning');
            return;
        }

        const parentIds = this.canvas.getSelectedNodeIds();
        const position = this.graph.autoPosition(parentIds.length > 0 ? parentIds : []);

        if (isPastedHtml(trimmed)) {
            const title = extractTitleFromHtml(trimmed);
            const node = createNode(NodeType.HTML_SLIDES, '', {
                position,
                title,
                htmlSlidesContent: trimmed,
            });
            this.graph.addNode(node);
            this.canvas.panToNodeAnimated(node.id);
            this.canvas.renderNode(node);
            for (const pid of parentIds) {
                this.graph.addEdge(createEdge(pid, node.id, EdgeType.REPLY));
            }
            this.canvas.clearSelection();
            this.saveSession?.();
            this.updateEmptyState?.();
            return;
        }

        // Topic path: create placeholder and stream from LLM
        const slidesNode = createNode(NodeType.HTML_SLIDES, 'Generating slides...', {
            position,
            title: trimmed.slice(0, 60),
            htmlSlidesContent: '',
            generating: true,
        });
        this.graph.addNode(slidesNode);
        this.canvas.panToNodeAnimated(slidesNode.id);
        this.canvas.renderNode(slidesNode);
        for (const pid of parentIds) {
            this.graph.addEdge(createEdge(pid, slidesNode.id, EdgeType.REPLY));
        }
        this.canvas.clearSelection();
        this.saveSession?.();
        this.updateEmptyState?.();

        const nodeId = slidesNode.id;
        const model = this.modelPicker?.value;

        // Build user message: topic/instruction plus selected node content when present
        let userMessage = trimmed
            ? `Create a short HTML slide presentation on: ${trimmed}`
            : 'Create a short HTML slide presentation from the following content.';
        if (selectedContext && selectedContext.trim()) {
            userMessage += `\n\nUse this as the source material:\n\n---\n${selectedContext.trim()}\n---`;
        }

        const messages = [
            { role: 'system', content: SLIDES_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
        ];

        try {
            await this.chat.sendMessage(
                messages,
                model,
                null, // onChunk: no progressive update
                (fullContent) => {
                    // onDone: fullContent is the complete normalized response
                    const html = stripMarkdownHtmlWrapper(fullContent);
                    if (html) {
                        this.graph.updateNode(nodeId, {
                            htmlSlidesContent: html,
                            content: '',
                            generating: false,
                        });
                        this.canvas.renderNode(this.graph.getNode(nodeId));
                    } else {
                        this.graph.updateNode(nodeId, {
                            content: 'No HTML was generated. Try again or paste HTML directly.',
                            generating: false,
                        });
                        this.canvas.renderNode(this.graph.getNode(nodeId));
                    }
                    this.saveSession?.();
                },
                (err) => {
                    this.graph.updateNode(nodeId, {
                        content: `Failed to generate slides: ${err?.message || 'Unknown error'}`,
                        generating: false,
                    });
                    this.canvas.renderNode(this.graph.getNode(nodeId));
                    this.saveSession?.();
                }
            );
        } catch (err) {
            this.graph.updateNode(nodeId, {
                content: `Failed to generate slides: ${err?.message || 'Unknown error'}`,
                generating: false,
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.saveSession?.();
        }
    }
}
