/**
 * PowerPoint Node Plugin (Built-in)
 *
 * Drag & drop PPTX into canvas-chat to create a PowerPoint node:
 * - Renders slide images inside the node
 * - Provides a slide navigator drawer (output panel)
 * - Supports extracting a slide as an IMAGE node
 * - Supports per-slide captioning + narrative weaving (user-triggered)
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { FileUploadHandlerPlugin } from '../file-upload-handler-plugin.js';
import { FileUploadRegistry, PRIORITY } from '../file-upload-registry.js';
import { EdgeType, NodeType, createEdge, createNode } from '../graph-types.js';
import { Actions, BaseNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { apiUrl } from '../utils.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * @param {any} slide
 * @returns {{mimeType: string, imageData: string, thumbData: string}}
 */
function getSlideImage(slide) {
    if (!slide) return { mimeType: 'image/png', imageData: '', thumbData: '' };

    // Prefer WebP if present
    if (slide.image_webp) {
        return { mimeType: 'image/webp', imageData: slide.image_webp, thumbData: slide.thumb_webp || slide.image_webp };
    }
    // Fallback to PNG
    if (slide.image_png) {
        return { mimeType: 'image/png', imageData: slide.image_png, thumbData: slide.thumb_png || slide.image_png };
    }

    // Last resort: older backend formats
    if (slide.image && slide.mimeType) {
        return { mimeType: slide.mimeType, imageData: slide.image, thumbData: slide.thumb || slide.image };
    }

    return { mimeType: 'image/png', imageData: '', thumbData: '' };
}

/**
 * Convert a base64-encoded WebP image to PNG base64 in-browser.
 * Used as a fallback for LLM providers that don't accept WebP image inputs.
 *
 * @param {string} webpBase64
 * @returns {Promise<string>} base64 PNG (no data: prefix)
 */
async function webpBase64ToPngBase64(webpBase64) {
    const dataUrl = `data:image/webp;base64,${webpBase64}`;
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load WebP image'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const pngDataUrl = canvas.toDataURL('image/png');
    const match = pngDataUrl.match(/^data:image\/png;base64,(.*)$/);
    if (!match) throw new Error('Failed to convert WebP to PNG');
    return match[1];
}

/**
 * @param {Object} node
 * @param {number} index
 * @returns {string|null}
 */
function getEffectiveSlideTitle(node, index) {
    const titles = node.slideTitles || {};
    if (titles && typeof titles[index] === 'string' && titles[index].trim()) {
        return titles[index].trim();
    }
    const slide = node.pptxData?.slides?.[index];
    if (slide?.title) return String(slide.title);
    return null;
}

/**
 * @param {Object} node
 * @param {number} index
 * @returns {string}
 */
function getSlideStatus(node, index) {
    const statuses = node.slideCaptionStatuses || {};
    return statuses[index] || 'idle'; // idle|queued|running|done|error
}

// =============================================================================
// PowerPoint Node Protocol
// =============================================================================

/**
 *
 */
class PowerPointNode extends BaseNode {
    /**
     *
     * @returns {string}
     */
    getTypeLabel() {
        return 'PowerPoint';
    }

    /**
     *
     * @returns {string}
     */
    getTypeIcon() {
        return '📊';
    }

    /**
     *
     * @returns {Array<Object>}
     */
    getActions() {
        // Keep Reply + Copy; avoid opening the edit-content modal for deck text.
        return [Actions.REPLY, Actions.COPY];
    }

    /**
     *
     * @param {any} _canvas
     * @returns {string}
     */
    getSummaryText(_canvas) {
        // Priority: user-set title > filename title > fallback
        if (this.node.title) return this.node.title;
        if (this.node.filename) return this.node.filename;
        return 'PowerPoint Deck';
    }

    /**
     *
     * @returns {boolean}
     */
    hasOutput() {
        // Always provide the slide drawer (even during processing/error).
        return true;
    }

    /**
     *
     * @param {any} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        const processing = this.node.processing || { state: 'idle' };
        const slides = this.node.pptxData?.slides || [];
        const slideCount = this.node.pptxData?.slideCount ?? this.node.slide_count ?? slides.length ?? 0;

        if (processing.state === 'converting') {
            const msg = processing.message || 'Converting slides… this may take up to a minute.';
            return `
                <div class="pptx-processing">
                    <div class="pptx-processing-inner">
                        <div class="spinner"></div>
                        <div class="pptx-processing-text">${canvas.escapeHtml(msg)}</div>
                    </div>
                </div>
            `;
        }

        if (!slides || slides.length === 0) {
            // Fallback to markdown content if we have any (e.g., error message)
            return canvas.renderMarkdown(this.node.content || '*No slides available*');
        }

        const current = Math.max(0, Math.min(this.node.currentSlideIndex || 0, slides.length - 1));
        const slide = slides[current];
        const title = getEffectiveSlideTitle(this.node, current);
        const { mimeType, imageData } = getSlideImage(slide);
        const imgSrc = imageData ? `data:${mimeType};base64,${imageData}` : '';
        const renderingMode = this.node.metadata?.rendering_mode;

        const disabled = slides.length <= 1 ? 'disabled' : '';

        return `
            <div class="pptx-node">
                <div class="pptx-slide">
                    ${imgSrc ? `<img class="pptx-slide-image" src="${imgSrc}" alt="Slide ${current + 1}">` : '<div class="pptx-slide-missing">No slide image</div>'}
                </div>
                <div class="pptx-controls">
                    <button class="pptx-nav-btn pptx-prev" ${disabled} title="Previous slide (ArrowLeft)">◀</button>
                    <div class="pptx-counter">
                        Slide ${current + 1} of ${slideCount || slides.length}
                    </div>
                    <button class="pptx-nav-btn pptx-next" ${disabled} title="Next slide (ArrowRight)">▶</button>
                </div>
                <div class="pptx-slide-title">
                    ${title ? `"${canvas.escapeHtml(title)}"` : `<span class="pptx-slide-title-missing">No title</span>`}
                </div>
                <div class="pptx-actions">
                    <button class="pptx-action-btn pptx-extract" title="Extract this slide as an image node">Extract</button>
                    <button class="pptx-action-btn pptx-caption" title="Caption this slide with AI">Caption</button>
                </div>
                ${
                    renderingMode === 'placeholder'
                        ? `<div class="pptx-rendering-note">Slide images are placeholders (LibreOffice not available).</div>`
                        : ''
                }
            </div>
        `;
    }

    /**
     *
     * @param {any} canvas
     * @returns {string}
     */
    renderOutputPanel(canvas) {
        const slides = this.node.pptxData?.slides || [];
        const processing = this.node.processing || { state: 'idle' };

        if (processing.state === 'converting') {
            const msg = processing.message || 'Converting slides…';
            return `
                <div class="pptx-drawer">
                    <div class="pptx-drawer-header">Slides</div>
                    <div class="pptx-processing">
                        <div class="pptx-processing-inner">
                            <div class="spinner"></div>
                            <div class="pptx-processing-text">${canvas.escapeHtml(msg)}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (!slides || slides.length === 0) {
            return `
                <div class="pptx-drawer">
                    <div class="pptx-drawer-header">Slides</div>
                    <div class="pptx-drawer-empty"><em>No slides available</em></div>
                </div>
            `;
        }

        const current = Math.max(0, Math.min(this.node.currentSlideIndex || 0, slides.length - 1));

        const itemsHtml = slides
            .map((slide, i) => {
                const title = getEffectiveSlideTitle(this.node, i);
                const { mimeType, thumbData } = getSlideImage(slide);
                const thumbSrc = thumbData ? `data:${mimeType};base64,${thumbData}` : '';
                const isCurrent = i === current;
                const status = getSlideStatus(this.node, i);
                const statusLabel =
                    status === 'running'
                        ? '<span class="pptx-slide-status"><span class="spinner pptx-inline-spinner"></span> Captioning</span>'
                        : status === 'queued'
                          ? '<span class="pptx-slide-status">Queued</span>'
                          : status === 'done'
                            ? '<span class="pptx-slide-status">✓ Captioned</span>'
                            : status === 'error'
                              ? '<span class="pptx-slide-status pptx-error">Error</span>'
                              : '';

                return `
                    <div class="pptx-slide-row ${isCurrent ? 'current' : ''}" data-slide-index="${i}">
                        <button class="pptx-slide-select" title="Go to slide ${i + 1}">
                            ${thumbSrc ? `<img class="pptx-thumb" src="${thumbSrc}" alt="Slide ${i + 1}">` : '<div class="pptx-thumb-missing"></div>'}
                        </button>
                        <div class="pptx-slide-meta">
                            <div class="pptx-slide-line">
                                <span class="pptx-slide-num">Slide ${i + 1}</span>
                                ${statusLabel}
                            </div>
                            <div class="pptx-slide-title-row">
                                <input class="pptx-title-input" type="text" value="${canvas.escapeHtml(title || '')}" placeholder="(no title)" data-slide-index="${i}">
                                <button class="pptx-title-save" title="Save title" data-slide-index="${i}">Save</button>
                                <button class="pptx-auto-title" title="Auto-title with AI" data-slide-index="${i}">Auto-title</button>
                            </div>
                            <div class="pptx-slide-actions-row">
                                <button class="pptx-caption-slide" data-slide-index="${i}">Caption</button>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');

        return `
            <div class="pptx-drawer">
                <div class="pptx-drawer-header">Slides</div>
                <div class="pptx-slide-list">
                    ${itemsHtml}
                </div>
                <div class="pptx-drawer-footer">
                    <button class="pptx-caption-all" title="Caption all slides (sequential)">Caption all slides</button>
                    <button class="pptx-weave" title="Weave captions into a narrative">Weave story</button>
                </div>
            </div>
        `;
    }

    /**
     *
     * @returns {Array<Object>}
     */
    getEventBindings() {
        return [
            // Node body navigation
            { selector: '.pptx-prev', handler: 'pptxPrevSlide' },
            { selector: '.pptx-next', handler: 'pptxNextSlide' },
            {
                selector: '.pptx-extract',
                handler: 'pptxExtractSlide',
            },
            {
                selector: '.pptx-caption',
                handler: (_nodeId, e, canvas) => {
                    const nodeId = this.node.id;
                    const index = this.node.currentSlideIndex || 0;
                    e?.preventDefault?.();
                    canvas.emit('pptxCaptionSlide', nodeId, index);
                },
            },

            // Drawer: slide selection
            {
                selector: '.pptx-slide-select',
                multiple: true,
                handler: (_nodeId, e, canvas) => {
                    const row = e.currentTarget.closest('.pptx-slide-row');
                    const idx = Number(row?.dataset?.slideIndex);
                    if (!Number.isFinite(idx)) return;
                    canvas.emit('pptxGoToSlide', this.node.id, idx);
                },
            },

            // Drawer: title save + auto-title
            {
                selector: '.pptx-title-save',
                multiple: true,
                handler: (_nodeId, e, canvas) => {
                    const idx = Number(e.currentTarget.dataset.slideIndex);
                    const input = e.currentTarget
                        .closest('.pptx-slide-title-row')
                        ?.querySelector('.pptx-title-input');
                    const title = input?.value ?? '';
                    canvas.emit('pptxSetSlideTitle', this.node.id, idx, title);
                },
            },
            {
                selector: '.pptx-auto-title',
                multiple: true,
                handler: (_nodeId, e, canvas) => {
                    const idx = Number(e.currentTarget.dataset.slideIndex);
                    canvas.emit('pptxAutoTitle', this.node.id, idx);
                },
            },

            // Drawer: caption per slide
            {
                selector: '.pptx-caption-slide',
                multiple: true,
                handler: (_nodeId, e, canvas) => {
                    const idx = Number(e.currentTarget.dataset.slideIndex);
                    canvas.emit('pptxCaptionSlide', this.node.id, idx);
                },
            },

            // Drawer: batch actions
            { selector: '.pptx-caption-all', handler: (_nodeId, _e, canvas) => canvas.emit('pptxCaptionAll', this.node.id) },
            { selector: '.pptx-weave', handler: (_nodeId, _e, canvas) => canvas.emit('pptxWeaveNarrative', this.node.id) },
        ];
    }

    /**
     *
     * @returns {Object<string, Object>}
     */
    getKeyboardShortcuts() {
        const shortcuts = super.getKeyboardShortcuts();
        // Allow left/right navigation when node is selected and not in an input.
        shortcuts.ArrowLeft = { action: 'prev-slide', handler: 'pptxPrevSlide' };
        shortcuts.ArrowRight = { action: 'next-slide', handler: 'pptxNextSlide' };
        return shortcuts;
    }
}

NodeRegistry.register({
    type: NodeType.POWERPOINT,
    protocol: PowerPointNode,
    defaultSize: { width: 480, height: 400 },
});

export { PowerPointNode };

// =============================================================================
// File Upload Handler (Frontend)
// =============================================================================

/**
 *
 */
class PowerPointFileUploadHandler extends FileUploadHandlerPlugin {
    /**
     *
     * @param {File} file
     * @param {Object|null} position
     * @param {Object} _context
     * @returns {Promise<Object>}
     */
    async handleUpload(file, position = null, _context = {}) {
        // Validate file type (best-effort; browsers may not set file.type)
        const isPptxByExt = file.name?.toLowerCase?.().endsWith('.pptx');
        const isPptByExt = file.name?.toLowerCase?.().endsWith('.ppt');
        const isPptxByMime =
            file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        const isPptByMime = file.type === 'application/vnd.ms-powerpoint';

        if (!(isPptxByExt || isPptByExt || isPptxByMime || isPptByMime)) {
            throw new Error('Please select a PowerPoint file (.pptx).');
        }

        // Validate file size (50 MB)
        const MAX_SIZE = 50 * 1024 * 1024;
        this.validateFile(file, MAX_SIZE, 'PowerPoint');

        const nodePosition = position || this.graph.autoPosition([]);
        const pptxNode = createNode(NodeType.POWERPOINT, '', {
            position: nodePosition,
            title: file.name,
            filename: file.name,
            processing: { state: 'converting', message: `Converting ${file.name}…` },
            currentSlideIndex: 0,
            pptxData: { slides: [], slideCount: 0 },
            outputExpanded: true,
            outputPanelHeight: 260,
        });

        this.addNodeToCanvas(pptxNode);
        this.canvas.selectNode(pptxNode.id);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(apiUrl('/api/upload-file'), {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to process PowerPoint');
            }

            const data = await response.json();

            // Update node and re-render (protocol-driven UI)
            this.graph.updateNode(pptxNode.id, {
                content: data.content || '',
                title: data.title || file.name,
                pptxData: {
                    slides: data.slides || [],
                    slideCount: data.slide_count || (data.slides ? data.slides.length : 0),
                },
                currentSlideIndex: 0,
                processing: { state: 'idle' },
                metadata: {
                    ...(data.metadata || {}),
                    content_type: 'powerpoint',
                    source: 'upload',
                    slide_count: data.slide_count || (data.slides ? data.slides.length : 0),
                },
                outputExpanded: true,
                outputPanelHeight: 260,
            });

            const updated = this.graph.getNode(pptxNode.id);
            if (updated) {
                this.canvas.renderNode(updated);
            }

            this.showCanvasHint('PowerPoint loaded! Use the drawer to navigate slides.');
            return pptxNode;
        } catch (err) {
            this.graph.updateNode(pptxNode.id, {
                processing: { state: 'error', message: err.message || 'Failed to process PowerPoint' },
            });
            const updated = this.graph.getNode(pptxNode.id);
            if (updated) this.canvas.renderNode(updated);
            this.handleError(pptxNode.id, file, err);
            throw err;
        }
    }
}

FileUploadRegistry.register({
    id: 'pptx',
    mimeTypes: [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint',
    ],
    extensions: ['.pptx', '.ppt'],
    handler: PowerPointFileUploadHandler,
    priority: PRIORITY.BUILTIN,
});

// =============================================================================
// Feature Plugin (Canvas Event Handlers + LLM Orchestration)
// =============================================================================

/**
 *
 */
class PowerPointFeature extends FeaturePlugin {
    /**
     *
     */
    async onLoad() {
        // Skip CSS injection in non-browser environments (e.g., unit tests)
        if (typeof document === 'undefined') return;

        // Inject plugin CSS for node + drawer (kept self-contained)
        // Note: This reuses global .spinner styles; we only provide layout/spacing.
        this.injectCSS(
            `
            .node.powerpoint .node-content { padding: 0; }
            .pptx-node { display: flex; flex-direction: column; height: 100%; }
            .pptx-slide { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); }
            .pptx-slide-image { max-width: 100%; max-height: 100%; object-fit: contain; }
            .pptx-slide-missing { color: var(--text-muted); font-size: 12px; padding: 12px; }
            .pptx-controls { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-top: 1px solid var(--bg-secondary); }
            .pptx-counter { font-size: 12px; color: var(--text-secondary); }
            .pptx-nav-btn { border: 1px solid var(--bg-secondary); background: var(--bg-primary); color: var(--text-primary); border-radius: 6px; padding: 4px 8px; cursor: pointer; }
            .pptx-nav-btn:disabled { opacity: 0.5; cursor: default; }
            .pptx-slide-title { padding: 0 10px 8px 10px; font-size: 12px; color: var(--text-secondary); }
            .pptx-slide-title-missing { color: var(--text-muted); }
            .pptx-actions { display: flex; gap: 8px; padding: 0 10px 10px 10px; }
            .pptx-action-btn { border: 1px solid var(--bg-secondary); background: var(--bg-primary); color: var(--text-primary); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
            .pptx-rendering-note { padding: 0 10px 10px 10px; font-size: 11px; color: var(--text-muted); }
            .pptx-processing { height: 100%; display: flex; align-items: center; justify-content: center; padding: 16px; }
            .pptx-processing-inner { display: flex; flex-direction: column; gap: 10px; align-items: center; text-align: center; }
            .pptx-processing-text { font-size: 12px; color: var(--text-secondary); }

            /* Drawer */
            .pptx-drawer { display: flex; flex-direction: column; gap: 8px; }
            .pptx-drawer-header { font-weight: 600; font-size: 12px; color: var(--text-primary); }
            .pptx-slide-list { display: flex; flex-direction: column; gap: 8px; }
            .pptx-slide-row { display: grid; grid-template-columns: 64px 1fr; gap: 10px; padding: 8px; border: 1px solid var(--bg-secondary); border-radius: 8px; background: var(--bg-primary); }
            .pptx-slide-row.current { outline: 2px solid var(--accent); background: var(--selection-bg); }
            .pptx-slide-select { border: none; background: transparent; padding: 0; cursor: pointer; }
            .pptx-thumb { width: 64px; height: 48px; object-fit: cover; border-radius: 6px; border: 1px solid var(--bg-secondary); background: var(--bg-secondary); }
            .pptx-thumb-missing { width: 64px; height: 48px; border-radius: 6px; border: 1px dashed var(--bg-secondary); background: var(--bg-secondary); }
            .pptx-slide-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            .pptx-slide-num { font-size: 12px; font-weight: 600; color: var(--text-primary); }
            .pptx-slide-status { font-size: 11px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; }
            .pptx-slide-status.pptx-error { color: var(--color-error, #ef4444); }
            .pptx-inline-spinner.spinner { width: 14px; height: 14px; border-width: 2px; }
            .pptx-title-input { width: 100%; padding: 4px 6px; font-size: 12px; border: 1px solid var(--bg-secondary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); }
            .pptx-slide-title-row { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; margin-top: 4px; }
            .pptx-title-save, .pptx-auto-title, .pptx-caption-slide { border: 1px solid var(--bg-secondary); background: var(--bg-primary); color: var(--text-primary); border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
            .pptx-slide-actions-row { display: flex; justify-content: flex-end; margin-top: 6px; }
            .pptx-drawer-footer { display: flex; gap: 8px; padding-top: 4px; }
            .pptx-caption-all, .pptx-weave { flex: 1; border: 1px solid var(--bg-secondary); background: var(--bg-primary); color: var(--text-primary); border-radius: 8px; padding: 8px 10px; cursor: pointer; font-size: 12px; }
            `,
            'plugin-styles-powerpoint'
        );
    }

    /**
     *
     * @returns {Object<string, Function>}
     */
    getCanvasEventHandlers() {
        return {
            pptxPrevSlide: this.prevSlide.bind(this),
            pptxNextSlide: this.nextSlide.bind(this),
            pptxGoToSlide: this.goToSlide.bind(this),
            pptxExtractSlide: this.extractSlide.bind(this),
            pptxSetSlideTitle: this.setSlideTitle.bind(this),
            pptxAutoTitle: this.autoTitleSlide.bind(this),
            pptxCaptionSlide: this.captionSlide.bind(this),
            pptxCaptionAll: this.captionAllSlides.bind(this),
            pptxWeaveNarrative: this.weaveNarrative.bind(this),
        };
    }

    /**
     * @param {string} nodeId
     * @returns {Object|null}
     */
    _getPptxNode(nodeId) {
        const node = this.graph?.getNode(nodeId);
        if (!node || node.type !== NodeType.POWERPOINT) return null;
        return node;
    }

    /**
     *
     * @param nodeId
     * @param patch
     */
    _updateAndRerender(nodeId, patch) {
        this.graph.updateNode(nodeId, patch);
        const updated = this.graph.getNode(nodeId);
        if (updated) this.canvas.renderNode(updated);
    }

    /**
     *
     * @param nodeId
     */
    prevSlide(nodeId) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;
        const current = node.currentSlideIndex || 0;
        const next = Math.max(0, current - 1);
        this._updateAndRerender(nodeId, { currentSlideIndex: next });
    }

    /**
     *
     * @param nodeId
     */
    nextSlide(nodeId) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;
        const current = node.currentSlideIndex || 0;
        const next = Math.min(slides.length - 1, current + 1);
        this._updateAndRerender(nodeId, { currentSlideIndex: next });
    }

    /**
     *
     * @param nodeId
     * @param slideIndex
     */
    goToSlide(nodeId, slideIndex) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;
        const idx = Number(slideIndex);
        if (!Number.isFinite(idx)) return;
        const next = Math.max(0, Math.min(idx, slides.length - 1));
        this._updateAndRerender(nodeId, { currentSlideIndex: next });
    }

    /**
     *
     * @param nodeId
     * @param slideIndex
     * @param title
     */
    setSlideTitle(nodeId, slideIndex, title) {
        const node = this._getPptxNode(nodeId);
        if (!node) return;
        const idx = Number(slideIndex);
        if (!Number.isFinite(idx)) return;
        const nextTitles = { ...(node.slideTitles || {}) };
        nextTitles[idx] = String(title || '').trim();
        this._updateAndRerender(nodeId, { slideTitles: nextTitles });
        this.saveSession?.();
    }

    /**
     *
     * @param nodeId
     * @param slideIndex
     */
    async autoTitleSlide(nodeId, slideIndex) {
        const node = this._getPptxNode(nodeId);
        const idx = Number(slideIndex);
        if (!node || !Number.isFinite(idx)) return;
        const slide = node.pptxData?.slides?.[idx];
        if (!slide) return;

        const { mimeType, imageData } = getSlideImage(slide);
        if (!imageData) return;

        // Create a child AI node to hold the title suggestion (so user can see provenance)
        const aiNode = this._createChildAiNode(nodeId, `Auto-title: Slide ${idx + 1}`);

        const model = this.modelPicker?.value;
        const prompt = 'Generate a short, descriptive title for this slide (max 8 words). Return ONLY the title.';

        const messages = [
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: `data:${mimeType};base64,${imageData}` },
                    },
                    { type: 'text', text: prompt },
                ],
            },
        ];

        const titleText = await this._streamIntoAiNode(aiNode.id, messages, model, { featureId: 'powerpoint' }).catch(
            () => null
        );

        if (titleText) {
            this.setSlideTitle(nodeId, idx, titleText.trim().replace(/^"|"$/g, ''));
        }
    }

    /**
     *
     * @param nodeId
     */
    extractSlide(nodeId) {
        const node = this._getPptxNode(nodeId);
        if (!node) return;
        const idx = node.currentSlideIndex || 0;
        const slide = node.pptxData?.slides?.[idx];
        if (!slide) return;

        const { mimeType, imageData } = getSlideImage(slide);
        if (!imageData) return;

        const title = getEffectiveSlideTitle(node, idx);
        const imageNode = createNode(NodeType.IMAGE, '', {
            position: this.graph.autoPosition([nodeId]),
            imageData: imageData,
            mimeType: mimeType,
            title: title ? `Slide ${idx + 1}: ${title}` : `Slide ${idx + 1}`,
        });

        if (this._app?.addUserNode) {
            this._app.addUserNode(imageNode);
        } else {
            // Test harness / fallback
            this.graph.addNode(imageNode);
            this.canvas.renderNode(imageNode);
        }
        this.graph.addEdge(createEdge(nodeId, imageNode.id, EdgeType.HIGHLIGHT));
        this.saveSession?.();
        this.canvas.centerOnAnimated(imageNode.position.x + 160, imageNode.position.y + 100, 300);
    }

    /**
     *
     * @param nodeId
     * @param slideIndex
     */
    async captionSlide(nodeId, slideIndex) {
        const node = this._getPptxNode(nodeId);
        const idx = Number(slideIndex);
        if (!node || !Number.isFinite(idx)) return;
        const slide = node.pptxData?.slides?.[idx];
        if (!slide) return;

        const { mimeType, imageData } = getSlideImage(slide);
        if (!imageData) return;

        // Status -> running
        const nextStatuses = { ...(node.slideCaptionStatuses || {}) };
        nextStatuses[idx] = 'running';
        this._updateAndRerender(nodeId, { slideCaptionStatuses: nextStatuses });

        const aiNode = this._createChildAiNode(nodeId, `Caption: Slide ${idx + 1}`);
        const model = this.modelPicker?.value;
        const slideText = slide.text_content || '';

        const prompt = `Caption this presentation slide. Include key points, any numbers, and what the visual shows.\n\nSlide text (may be incomplete):\n${slideText}`;

        const tryMessages = [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } },
                    { type: 'text', text: prompt },
                ],
            },
        ];

        let finalText = null;
        try {
            finalText = await this._streamIntoAiNode(aiNode.id, tryMessages, model, { featureId: 'powerpoint' });
        } catch (err) {
            // If WebP rejected by provider, retry with PNG conversion
            const msg = String(err?.message || '');
            const looksLikeWebpIssue = mimeType === 'image/webp' && /webp|image|mime|unsupported/i.test(msg);
            if (looksLikeWebpIssue) {
                try {
                    const pngB64 = await webpBase64ToPngBase64(imageData);
                    const retryMessages = [
                        {
                            role: 'user',
                            content: [
                                { type: 'image_url', image_url: { url: `data:image/png;base64,${pngB64}` } },
                                { type: 'text', text: prompt },
                            ],
                        },
                    ];
                    finalText = await this._streamIntoAiNode(aiNode.id, retryMessages, model, { featureId: 'powerpoint' });
                } catch (retryErr) {
                    console.error('[PowerPointFeature] caption retry failed', retryErr);
                    throw retryErr;
                }
            } else {
                throw err;
            }
        } finally {
            const refreshed = this._getPptxNode(nodeId);
            const statuses = { ...(refreshed?.slideCaptionStatuses || {}) };
            statuses[idx] = finalText ? 'done' : 'error';
            const captions = { ...(refreshed?.slideCaptions || {}) };
            if (finalText) captions[idx] = finalText;
            this._updateAndRerender(nodeId, { slideCaptionStatuses: statuses, slideCaptions: captions });
            this.saveSession?.();
        }
    }

    /**
     *
     * @param nodeId
     */
    async captionAllSlides(nodeId) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;

        // Queue all
        const statuses = { ...(node.slideCaptionStatuses || {}) };
        for (let i = 0; i < slides.length; i++) {
            if (statuses[i] !== 'done') statuses[i] = 'queued';
        }
        this._updateAndRerender(nodeId, { slideCaptionStatuses: statuses });

        // Sequentially caption
        for (let i = 0; i < slides.length; i++) {
            const refreshed = this._getPptxNode(nodeId);
            const currentStatus = getSlideStatus(refreshed, i);
            if (currentStatus === 'done') continue;
            await this.captionSlide(nodeId, i);
        }
    }

    /**
     *
     * @param nodeId
     */
    async weaveNarrative(nodeId) {
        const node = this._getPptxNode(nodeId);
        if (!node) return;
        const captions = node.slideCaptions || {};
        const slides = node.pptxData?.slides || [];
        if (!slides.length) return;

        const ordered = [];
        for (let i = 0; i < slides.length; i++) {
            const c = captions[i];
            if (c && String(c).trim()) {
                ordered.push(`Slide ${i + 1}:\n${String(c).trim()}`);
            }
        }
        if (ordered.length === 0) {
            this.showToast?.('No slide captions found. Run "Caption all slides" first.', 'error');
            return;
        }

        const aiNode = this._createChildAiNode(nodeId, 'Narrative: Deck');
        const model = this.modelPicker?.value;
        const prompt = `Weave these slide captions into a coherent narrative from top to bottom.\n\n${ordered.join('\n\n')}`;
        const messages = [{ role: 'user', content: prompt }];
        await this._streamIntoAiNode(aiNode.id, messages, model, { featureId: 'powerpoint' });
    }

    // --- Streaming helpers (reuse App's streaming infra) ---

    /**
     *
     * @param {string} parentNodeId
     * @param {string} title
     * @returns {Object}
     */
    _createChildAiNode(parentNodeId, title) {
        const model = this.modelPicker?.value || '';
        const node = createNode(NodeType.AI, '', {
            position: this.graph.autoPosition([parentNodeId]),
            model: model.split('/').pop(),
            title,
        });
        if (this._app?.addUserNode) {
            this._app.addUserNode(node);
        } else {
            // Test harness / fallback
            this.graph.addNode(node);
            this.canvas.renderNode(node);
        }
        this.graph.addEdge(createEdge(parentNodeId, node.id, EdgeType.REPLY));
        this.updateCollapseButtonForNode?.(parentNodeId);
        this.saveSession?.();
        return node;
    }

    /**
     * Stream an LLM response into an existing AI node and return full content when done.
     * @param {string} nodeId
     * @param {Array} messages
     * @param {string} model
     * @param {{featureId?: string}} [meta]
     * @returns {Promise<string>}
     */
    async _streamIntoAiNode(nodeId, messages, model, meta = {}) {
        if (!this._app?.streamWithAbort || !this.streamingManager?.register) {
            throw new Error('Streaming infrastructure not available');
        }

        const abortController = new AbortController();

        this.streamingManager.register(nodeId, {
            abortController,
            featureId: meta.featureId || 'powerpoint',
            context: { messages, model },
            onContinue: async (id, state) => {
                await this._app.continueAIResponse(id, state.context);
            },
        });

        return await new Promise((resolve, reject) => {
            this._app.streamWithAbort(
                nodeId,
                abortController,
                messages,
                model,
                (chunk, fullContent) => {
                    this.canvas.updateNodeContent(nodeId, fullContent, true);
                    this.graph.updateNode(nodeId, { content: fullContent });
                },
                (fullContent) => {
                    this.streamingManager.unregister(nodeId);
                    this.canvas.updateNodeContent(nodeId, fullContent, false);
                    this.graph.updateNode(nodeId, { content: fullContent });
                    this.saveSession?.();
                    this.generateNodeSummary?.(nodeId);
                    resolve(fullContent);
                },
                (err) => {
                    this.streamingManager.unregister(nodeId);
                    reject(err);
                }
            );
        });
    }
}

export { PowerPointFeature };
