/**
 * URL Fetch Plugin (Built-in)
 *
 * Handles /fetch slash command for generic URL fetching.
 * Creates basic FETCH_RESULT nodes without special rendering.
 * For PDF URLs, owns PDF viewer hydration and pagination (Prev/Next, ←/→).
 * For enhanced UX (file selection, video embedding), use specific commands:
 * - /git for git repositories
 * - /youtube for YouTube videos
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { createEdge, createNode, EdgeType, NodeType } from '../graph-types.js';
import { apiUrl, isUrlContent } from '../utils.js';
import {
    extractTextFromDocument,
    getPdfForNode,
    loadDocument,
    renderPageToCanvas,
} from './pdf-viewer.js';

/**
 * UrlFetchFeature - Handles generic URL fetching and PDF viewer
 */
export class UrlFetchFeature extends FeaturePlugin {
    /**
     * Get slash commands for this feature
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/fetch',
                description: 'Fetch content from URL (basic fetch, no special rendering)',
                placeholder: 'https://...',
            },
        ];
    }

    /**
     * Handle /fetch slash command
     * Generic URL fetching - creates basic FETCH_RESULT nodes.
     * For enhanced UX, use specific commands (/git, /youtube).
     *
     * @param {string} command - The slash command (e.g., '/fetch')
     * @param {string} args - Text after the command (URL)
     * @param {Object} _contextObj - Additional context (unused, kept for interface)
     */
    async handleCommand(command, args, _contextObj) {
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

        // Generic URL fetching - no special cases
        // Backend routes to appropriate handler via UrlFetchRegistry
        // All create basic FETCH_RESULT nodes (no special rendering)
        await this.handleWebUrl(url);
    }

    /**
     * Fetch URL content and create a basic FETCH_RESULT node.
     *
     * Generic URL fetching - creates basic nodes without special rendering.
     * For enhanced UX (file selection, video embedding), use specific commands:
     * - /git for git repositories
     * - /youtube for YouTube videos
     *
     * This uses Jina Reader API (/api/fetch-url) which is free and requires no API key.
     *
     * @param {string} url - The URL to fetch
     * @returns {Promise<void>}
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
            const edge = createEdge(parentId, fetchNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.saveSession?.();
        this.updateEmptyState?.();

        try {
            // Fetch URL content via backend (uses UrlFetchRegistry to route to handler)
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
            const metadata = data.metadata || {};
            const isPdf = metadata.content_type === 'pdf';

            // PDF: backend returns pdf_url; frontend viewer + extraction (hydration) will set content
            const nodeContent = isPdf
                ? ''
                : `**[${data.title}](${url})**\n\n${data.content}`;

            const updateData = {
                content: nodeContent,
                title: data.title,
                metadata,
                versions: isPdf
                    ? []
                    : [
                          {
                              content: nodeContent,
                              timestamp: Date.now(),
                              reason: 'fetched',
                          },
                      ],
            };

            this.graph.updateNode(fetchNode.id, updateData);

            if (isPdf) {
                this.canvas.renderNode(this.graph.getNode(fetchNode.id));
            } else {
                this.canvas.updateNodeContent(fetchNode.id, nodeContent, false);
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
     * Register PDF viewer hydrator and canvas event handlers when the plugin loads.
     */
    async onLoad() {
        if (this.canvas?.setPdfViewerHydrator) {
            this.canvas.setPdfViewerHydrator(this.hydratePdfViewer.bind(this));
        }
    }

    /**
     * Canvas event handlers for PDF pagination (action bar + ←/→) and resize scroll reset.
     * @returns {Object<string, Function>}
     */
    getCanvasEventHandlers() {
        return {
            'pdf-prev-page': (nodeId) => this.handlePdfPrevPage(nodeId),
            'pdf-next-page': (nodeId) => this.handlePdfNextPage(nodeId),
            nodeResize: (nodeId) => this.handlePdfNodeResize(nodeId),
        };
    }

    /**
     * After resizing a PDF node, reset scroll to top so the page top is visible.
     * @param {string} nodeId
     */
    handlePdfNodeResize(nodeId) {
        const node = this.graph?.getNode(nodeId);
        if (!node) return;
        const metadata = node.metadata || {};
        const isPdf =
            metadata.content_type === 'pdf' && (metadata.pdf_url || metadata.pdf_source === 'upload');
        if (!isPdf) return;
        const wrapper = this.canvas?.getNodeWrapper?.(nodeId);
        const contentEl = wrapper?.querySelector?.('.node-content');
        if (contentEl?.querySelector('.pdf-viewer-container')) {
            contentEl.scrollTop = 0;
        }
    }

    /**
     * Go to previous page in a PDF viewer node.
     * @param {string} nodeId
     */
    handlePdfPrevPage(nodeId) {
        const wrapper = this.canvas?.getNodeWrapper?.(nodeId);
        const container = wrapper?.querySelector?.('.pdf-viewer-container');
        const state = container?._pdfState;
        if (state && state.currentPage > 1) {
            const newPage = state.currentPage - 1;
            state.showPage(newPage);
            this.scrollOutputPanelToPage(nodeId, newPage);
        }
    }

    /**
     * Go to next page in a PDF viewer node.
     * @param {string} nodeId
     */
    handlePdfNextPage(nodeId) {
        const wrapper = this.canvas?.getNodeWrapper?.(nodeId);
        const container = wrapper?.querySelector?.('.pdf-viewer-container');
        const state = container?._pdfState;
        if (state && state.currentPage < state.numPages) {
            const newPage = state.currentPage + 1;
            state.showPage(newPage);
            this.scrollOutputPanelToPage(nodeId, newPage);
        }
    }

    /**
     * Scroll the node's output panel to the given PDF page heading.
     * @param {string} nodeId - Node ID
     * @param {number} pageNum - 1-based page number
     */
    scrollOutputPanelToPage(nodeId, pageNum) {
        const outputPanel = this.canvas?.outputPanels?.get(nodeId);
        if (!outputPanel) return;
        const panelBody = outputPanel.querySelector('.code-output-panel-body');
        const heading = panelBody?.querySelector(`#pdf-page-${pageNum}`);
        if (heading && panelBody) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Hydrate a PDF viewer container: load PDF, render first page, extract text, set pagination state.
     * Called by canvas when it finds .pdf-viewer-container[data-pdf-hydrated="false"].
     * @param {Element} wrapper - Node wrapper element
     * @param {Object} node - Node data
     */
    hydratePdfViewer(wrapper, node) {
        const container = wrapper.querySelector?.('.pdf-viewer-container[data-pdf-hydrated="false"]');
        if (!container || !this.graph) return;

        const nodeId = container.getAttribute('data-node-id');
        const pdfUrl = container.getAttribute('data-pdf-url');
        const pdfSource = container.getAttribute('data-pdf-source');

        (async () => {
            try {
                let source = pdfUrl || null;
                if (pdfSource === 'upload' && nodeId) {
                    source = await getPdfForNode(nodeId);
                }
                if (!source) return;

                const pdfDoc = await loadDocument(source);
                const numPages = pdfDoc.numPages;
                const canvasEl = container.querySelector('.pdf-viewer-canvas');
                const pageWrap = container.querySelector('.pdf-viewer-page');
                const pageInfo = container.querySelector('.pdf-viewer-page-info');
                const loadingEl = container.querySelector('.pdf-viewer-loading');

                const scale = 1.5;
                const state = { currentPage: 1, numPages };

                const showPage = async (pageNum) => {
                    if (!canvasEl) return;
                    state.currentPage = pageNum;
                    await renderPageToCanvas(pdfDoc, pageNum, canvasEl, scale);
                    if (pageInfo) pageInfo.textContent = `Page ${pageNum} of ${numPages}`;
                };

                state.showPage = showPage;
                container._pdfState = state;

                if (canvasEl && pageWrap && loadingEl) {
                    await showPage(1);
                    loadingEl.style.display = 'none';
                    pageWrap.style.display = 'block';
                }
                if (pageInfo && state.numPages <= 1) pageInfo.textContent = `Page 1 of ${state.numPages}`;

                const text = await extractTextFromDocument(pdfDoc);
                const title = node.title || 'PDF';
                const newContent = `**[${title}]**\n\n${text}`;
                if (!(node.content || '').trim()) {
                    this.graph.updateNode(nodeId, { content: newContent, outputExpanded: true });
                    const summaryEl = wrapper.querySelector('.node-summary .summary-text');
                    if (summaryEl && this.canvas?.truncate) {
                        const plain = (newContent || '').replace(/[#*_`>\[\]()!]/g, '').trim();
                        summaryEl.textContent = this.canvas.truncate(plain, 60);
                    }
                }
                container.setAttribute('data-pdf-hydrated', 'true');
                const contentEl = wrapper.querySelector('.node-content');
                if (contentEl) contentEl.scrollTop = 0;
            } catch (err) {
                container._pdfState = null;
                const loadingEl = container.querySelector('.pdf-viewer-loading');
                if (loadingEl) {
                    loadingEl.textContent = `Failed to load PDF: ${err.message}`;
                }
                const content = `**(PDF load failed)**\n\n${err.message}`;
                this.graph.updateNode(nodeId, { content });
                const summaryEl = wrapper.querySelector('.node-summary .summary-text');
                if (summaryEl && this.canvas?.truncate) {
                    summaryEl.textContent = this.canvas.truncate(err.message, 60);
                }
                container.setAttribute('data-pdf-hydrated', 'true');
            }
        })();
    }
}

console.log('URL Fetch plugin loaded');
