/**
 * PowerPoint Node Plugin (Built-in)
 *
 * Drag & drop PPTX into canvas-chat to create a PowerPoint node:
 * - Renders slide images inside the node
 * - Provides a slide navigator drawer (output panel)
 * - Supports extracting a slide as an IMAGE node
 * - Supports user-triggered structured caption+title generation (text-only)
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
    const statuses = node.slideEnrichStatuses || node.slideCaptionStatuses || {};
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
     * Add PowerPoint-specific actions to the bottom action bar.
     * @returns {Array<{id: string, label: string, title: string}>}
     */
    getAdditionalActions() {
        const processing = this.node.processing || { state: 'idle' };
        const slides = this.node.pptxData?.slides || [];

        if (processing.state === 'converting') return [];
        if (!slides || slides.length === 0) return [];

        return [
            {
                id: 'pptxEnrichCurrent',
                label: '🖼️ Caption+Title',
                title: 'Generate title + one-paragraph caption for the current slide',
            },
            {
                id: 'pptxWeaveNarrative',
                label: '🧵 Weave narrative',
                title: 'Weave slide titles + captions into a narrative',
            },
        ];
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
                <div class="pptx-slide-caption">
                    ${
                        (this.node.slideCaptions || {})[current]
                            ? canvas.escapeHtml((this.node.slideCaptions || {})[current])
                            : '<span class="pptx-slide-caption-missing">No caption</span>'
                    }
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
                        ? '<span class="pptx-slide-status"><span class="spinner pptx-inline-spinner"></span> Generating</span>'
                        : status === 'queued'
                          ? '<span class="pptx-slide-status">Queued</span>'
                          : status === 'done'
                            ? '<span class="pptx-slide-status">✓ Done</span>'
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
                                <button class="pptx-enrich-slide" title="Generate title + one-paragraph caption" data-slide-index="${i}">Caption+Title</button>
                            </div>
                            ${
                                (this.node.slideCaptions || {})[i]
                                    ? `<div class="pptx-slide-caption-preview">${canvas.escapeHtml((this.node.slideCaptions || {})[i])}</div>`
                                    : '<div class="pptx-slide-caption-preview pptx-slide-caption-missing">(no caption)</div>'
                            }
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
                    <button class="pptx-enrich-all" title="Generate title + one-paragraph caption for all slides">Caption+Title all slides</button>
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
                selector: '.pptx-slide-image',
                handler: (_nodeId, e, canvas) => {
                    const img = e?.currentTarget;
                    if (!img?.src) return;

                    const rect = img.getBoundingClientRect();
                    const current = this.node.currentSlideIndex || 0;
                    const title = getEffectiveSlideTitle(this.node, current);
                    const imageTitle = title ? `Slide ${current + 1}: ${title}` : `Slide ${current + 1}`;

                    // Mirror the PDF/webpage image UX: click image → tooltip with Extract.
                    canvas.pendingImageNodeId = this.node.id;
                    canvas.showImageTooltip(
                        img.src,
                        { x: rect.left + rect.width / 2, y: rect.top },
                        { title: imageTitle }
                    );
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
                selector: '.pptx-enrich-slide',
                multiple: true,
                handler: (_nodeId, e, canvas) => {
                    const idx = Number(e.currentTarget.dataset.slideIndex);
                    canvas.emit('pptxEnrichSlide', this.node.id, idx);
                },
            },

            // Drawer: batch actions
            { selector: '.pptx-enrich-all', handler: (_nodeId, _e, canvas) => canvas.emit('pptxEnrichAll', this.node.id) },
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
            .pptx-slide-caption { padding: 0 10px 10px 10px; font-size: 11px; color: var(--text-secondary); line-height: 1.35; }
            .pptx-slide-caption-missing { color: var(--text-muted); }
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
            .pptx-title-save, .pptx-enrich-slide { border: 1px solid var(--bg-secondary); background: var(--bg-primary); color: var(--text-primary); border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 11px; }
            .pptx-slide-caption-preview { margin-top: 6px; font-size: 11px; color: var(--text-secondary); line-height: 1.35; max-height: 4.2em; overflow: auto; }
            .pptx-slide-caption-missing { color: var(--text-muted); }
            .pptx-drawer-footer { display: flex; gap: 8px; padding-top: 4px; }
            .pptx-enrich-all, .pptx-weave { flex: 1; border: 1px solid var(--bg-secondary); background: var(--bg-primary); color: var(--text-primary); border-radius: 8px; padding: 8px 10px; cursor: pointer; font-size: 12px; }

            /* Weave narrative modal */
            .pptx-weave-presets { display: flex; flex-direction: column; gap: 8px; }
            .pptx-weave-presets-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
            .pptx-weave-presets-header label { font-weight: 600; }
            .pptx-weave-presets-status { font-size: 12px; color: var(--text-secondary); }
            .pptx-weave-presets-loading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
            .pptx-weave-presets-list { display: grid; grid-template-columns: 1fr; gap: 8px; }
            .pptx-weave-preset { display: block; border: 1px solid var(--bg-secondary); border-radius: 10px; padding: 10px; background: var(--bg-primary); cursor: pointer; }
            .pptx-weave-preset:hover { border-color: var(--accent); }
            .pptx-weave-preset input { margin-right: 8px; }
            .pptx-weave-preset-title { font-weight: 600; font-size: 13px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
            .pptx-weave-preset-desc { font-size: 12px; color: var(--text-secondary); margin-top: 4px; line-height: 1.35; }
            .pptx-weave-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
            .pptx-weave-controls .full { grid-column: 1 / -1; }
            .pptx-weave-controls label { font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px; }
            .pptx-weave-controls input, .pptx-weave-controls select, .pptx-weave-controls textarea {
                width: 100%;
                border: 1px solid var(--bg-secondary);
                background: var(--bg-primary);
                color: var(--text-primary);
                border-radius: 8px;
                padding: 8px 10px;
                font-size: 13px;
            }
            .pptx-weave-controls textarea { min-height: 70px; resize: vertical; }
            `,
            'plugin-styles-powerpoint'
        );

        // Register weave narrative modal
        const modalTemplate = `
            <div id="powerpoint-weave-modal" class="modal" style="display: none">
                <div class="modal-content modal-wide">
                    <div class="modal-header">
                        <h2>Weave narrative</h2>
                        <button class="modal-close" id="pptx-weave-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="pptx-weave-presets">
                            <div class="pptx-weave-presets-header">
                                <label>Presets (AI-suggested)</label>
                                <span class="pptx-weave-presets-status" id="pptx-weave-presets-status">Loading…</span>
                            </div>
                            <div class="pptx-weave-presets-loading" id="pptx-weave-presets-loading">
                                <div style="display: inline-flex; align-items: center; gap: 10px">
                                    <div class="spinner"></div>
                                    <span class="pptx-weave-presets-status">Generating suggestions…</span>
                                </div>
                                <button id="pptx-weave-suggest-cancel-btn" class="secondary-btn">Cancel</button>
                            </div>
                            <div class="pptx-weave-presets-list" id="pptx-weave-presets-list"></div>
                        </div>

                        <div class="pptx-weave-controls">
                            <div class="full">
                                <label for="pptx-weave-voice">Voice / persona</label>
                                <textarea id="pptx-weave-voice" placeholder="e.g., warm, confident, a bit playful."></textarea>
                            </div>
                            <div>
                                <label for="pptx-weave-audience">Audience</label>
                                <input id="pptx-weave-audience" type="text" placeholder="e.g., engineering leadership" />
                            </div>
                            <div>
                                <label for="pptx-weave-length">Length</label>
                                <select id="pptx-weave-length">
                                    <option value="short">Short</option>
                                    <option value="medium" selected>Medium</option>
                                    <option value="long">Long</option>
                                </select>
                            </div>
                            <div>
                                <label for="pptx-weave-structure">Output structure</label>
                                <select id="pptx-weave-structure">
                                    <option value="narrative" selected>Narrative</option>
                                    <option value="executive_summary">Executive summary</option>
                                    <option value="speaker_notes">Speaker notes</option>
                                </select>
                            </div>
                            <div>
                                <label for="pptx-weave-inclusion">Slide inclusion</label>
                                <select id="pptx-weave-inclusion">
                                    <option value="all">All slides</option>
                                    <option value="captioned_only" selected>Only captioned slides</option>
                                </select>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button id="pptx-weave-cancel-btn" class="secondary-btn">Cancel</button>
                            <button id="pptx-weave-generate-btn" class="primary-btn" disabled>Generate</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.modalManager.registerModal('powerpoint', 'weave', modalTemplate);
        const modal = this.modalManager.getPluginModal('powerpoint', 'weave');
        this._pptxWeaveModal = modal;

        // Modal event listeners
        const closeBtn = modal.querySelector('#pptx-weave-close');
        const cancelBtn = modal.querySelector('#pptx-weave-cancel-btn');
        const generateBtn = modal.querySelector('#pptx-weave-generate-btn');
        const suggestCancelBtn = modal.querySelector('#pptx-weave-suggest-cancel-btn');
        const presetsList = modal.querySelector('#pptx-weave-presets-list');

        closeBtn?.addEventListener('click', () => this._closeWeaveNarrativeModal());
        cancelBtn?.addEventListener('click', () => this._closeWeaveNarrativeModal());
        suggestCancelBtn?.addEventListener('click', () => this._cancelWeaveSuggestions());

        // Preset selection (radio cards)
        presetsList?.addEventListener('change', (e) => {
            const target = /** @type {HTMLInputElement|null} */ (e.target);
            if (!target || target.name !== 'pptx-weave-preset') return;
            this._selectWeavePreset(target.value);
        });

        // Enable generate after any control change (once we have a nodeId)
        const controlIds = [
            '#pptx-weave-voice',
            '#pptx-weave-audience',
            '#pptx-weave-length',
            '#pptx-weave-structure',
            '#pptx-weave-inclusion',
        ];
        for (const sel of controlIds) {
            const el = modal.querySelector(sel);
            el?.addEventListener('input', () => this._updateWeaveGenerateEnabled());
            el?.addEventListener('change', () => this._updateWeaveGenerateEnabled());
        }

        generateBtn?.addEventListener('click', () => this._handleWeaveGenerateClick());
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
            pptxEnrichCurrent: this.enrichCurrentSlide.bind(this),
            pptxEnrichSlide: this.enrichSlide.bind(this),
            pptxEnrichAll: this.enrichAllSlides.bind(this),
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
        if (!updated) return;

        // Avoid full re-render when possible: re-rendering destroys and rebuilds the output
        // panel, which causes the drawer to "flash" and can steal focus from inputs.
        const patched = this._patchPowerPointDomInPlace(updated);
        if (!patched) {
            this.canvas.renderNode(updated);
        }
    }

    /**
     * Update PowerPoint node DOM without full Canvas.renderNode().
     * Returns true if we successfully patched the DOM in-place.
     *
     * @param {Object} node
     * @returns {boolean}
     */
    _patchPowerPointDomInPlace(node) {
        // In unit tests, Canvas may be a lightweight stub; fall back to renderNode.
        if (!this.canvas?.nodeElements || !this.canvas?.outputPanels) return false;

        const wrapper = this.canvas.nodeElements.get(node.id);
        if (!wrapper) return false;

        const nodeEl = wrapper.querySelector('.node');
        if (!nodeEl) return false;

        const contentEl = nodeEl.querySelector('.node-content');
        if (!contentEl) return false;

        const slides = node.pptxData?.slides || [];
        const processing = node.processing || { state: 'idle' };
        if (processing.state === 'converting') return false;
        if (!slides || slides.length === 0) return false;

        // --- Patch node body (current slide image + counter + title) ---
        const pptxRoot = contentEl.querySelector('.pptx-node');
        if (!pptxRoot) return false;

        const current = Math.max(0, Math.min(node.currentSlideIndex || 0, slides.length - 1));
        const slide = slides[current];
        const { mimeType, imageData } = getSlideImage(slide);
        const imgSrc = imageData ? `data:${mimeType};base64,${imageData}` : '';

        const slideEl = pptxRoot.querySelector('.pptx-slide');
        if (slideEl) {
            if (imgSrc) {
                const img = slideEl.querySelector('img.pptx-slide-image');
                if (img) {
                    img.src = imgSrc;
                    img.alt = `Slide ${current + 1}`;
                } else {
                    slideEl.innerHTML = `<img class="pptx-slide-image" src="${imgSrc}" alt="Slide ${current + 1}">`;
                }
            } else {
                slideEl.innerHTML = '<div class="pptx-slide-missing">No slide image</div>';
            }
        }

        const counterEl = pptxRoot.querySelector('.pptx-counter');
        if (counterEl) {
            const slideCount = node.pptxData?.slideCount ?? node.slide_count ?? slides.length ?? 0;
            counterEl.textContent = `Slide ${current + 1} of ${slideCount || slides.length}`;
        }

        const titleEl = pptxRoot.querySelector('.pptx-slide-title');
        if (titleEl) {
            const title = getEffectiveSlideTitle(node, current);
            if (title) {
                titleEl.textContent = `"${title}"`;
            } else {
                titleEl.innerHTML = '<span class="pptx-slide-title-missing">No title</span>';
            }
        }

        const captionEl = pptxRoot.querySelector('.pptx-slide-caption');
        if (captionEl) {
            const caption = (node.slideCaptions || {})[current];
            if (caption && String(caption).trim()) {
                captionEl.textContent = String(caption).trim();
            } else {
                captionEl.innerHTML = '<span class="pptx-slide-caption-missing">No caption</span>';
            }
        }

        // --- Patch drawer (current row highlight + caption status labels) ---
        const panelWrapper = this.canvas.outputPanels.get(node.id);
        const panelBody = panelWrapper?.querySelector?.('.code-output-panel-body');
        if (panelBody) {
            // Ensure a single "current" row.
            panelBody.querySelectorAll('.pptx-slide-row.current').forEach((el) => el.classList.remove('current'));
            const currentRow = panelBody.querySelector(`.pptx-slide-row[data-slide-index="${current}"]`);
            if (currentRow) currentRow.classList.add('current');

            // Update per-slide caption status labels without rebuilding the drawer.
            panelBody.querySelectorAll('.pptx-slide-row[data-slide-index]').forEach((row) => {
                const idx = Number(row.dataset.slideIndex);
                if (!Number.isFinite(idx)) return;
                const status = getSlideStatus(node, idx);
                const line = row.querySelector('.pptx-slide-line');
                if (!line) return;

                const existing = line.querySelector('.pptx-slide-status');
                if (status === 'idle') {
                    existing?.remove();
                    return;
                }

                const statusEl = existing || document.createElement('span');
                statusEl.className = `pptx-slide-status${status === 'error' ? ' pptx-error' : ''}`;

                if (status === 'running') {
                    statusEl.innerHTML = '<span class="spinner pptx-inline-spinner"></span> Generating';
                } else if (status === 'queued') {
                    statusEl.textContent = 'Queued';
                } else if (status === 'done') {
                    statusEl.textContent = '✓ Done';
                } else {
                    statusEl.textContent = 'Error';
                }

                if (!existing) line.appendChild(statusEl);
            });

            // Update title inputs + caption previews without rebuilding the drawer.
            panelBody.querySelectorAll('.pptx-slide-row[data-slide-index]').forEach((row) => {
                const idx = Number(row.dataset.slideIndex);
                if (!Number.isFinite(idx)) return;

                // Title input (only update if not actively being edited)
                const input = row.querySelector('.pptx-title-input');
                const effectiveTitle = getEffectiveSlideTitle(node, idx) || '';
                if (input && document.activeElement !== input) {
                    input.value = effectiveTitle;
                }

                // Caption preview
                const caption = (node.slideCaptions || {})[idx];
                const preview = row.querySelector('.pptx-slide-caption-preview');
                if (preview) {
                    if (caption && String(caption).trim()) {
                        preview.classList.remove('pptx-slide-caption-missing');
                        preview.textContent = String(caption).trim();
                    } else {
                        preview.classList.add('pptx-slide-caption-missing');
                        preview.textContent = '(no caption)';
                    }
                }
            });
        }

        return true;
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
     * Generate title + one-paragraph caption for a single slide.
     * @param {string} nodeId
     * @param {number} slideIndex
     * @returns {Promise<void>}
     */
    async enrichSlide(nodeId, slideIndex) {
        const node = this._getPptxNode(nodeId);
        const idx = Number(slideIndex);
        if (!node || !Number.isFinite(idx)) return;

        const slide = node.pptxData?.slides?.[idx];
        if (!slide) return;

        const statuses = { ...(node.slideEnrichStatuses || node.slideCaptionStatuses || {}) };
        const errors = { ...(node.slideEnrichErrors || {}) };
        statuses[idx] = 'running';
        delete errors[idx];
        this._updateAndRerender(nodeId, { slideEnrichStatuses: statuses, slideEnrichErrors: errors });

        try {
            const existingTitle = getEffectiveSlideTitle(node, idx) || '';
            const slideText = slide.text_content || '';

            const requestBody = this.buildLLMRequest({
                slide_text: slideText,
                slide_title: existingTitle,
                filename: node.filename || node.title || null,
            });

            const response = await fetch(apiUrl('/api/pptx/caption-title-slide'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to caption+title slide');
            }

            const data = await response.json();
            const refreshed = this._getPptxNode(nodeId) || node;

            const nextTitles = { ...(refreshed.slideTitles || {}) };
            const nextCaptions = { ...(refreshed.slideCaptions || {}) };
            const nextStatuses = { ...(refreshed.slideEnrichStatuses || refreshed.slideCaptionStatuses || {}) };
            nextStatuses[idx] = 'done';

            if (data?.title) nextTitles[idx] = String(data.title).trim();
            if (data?.caption) nextCaptions[idx] = String(data.caption).trim();

            this._updateAndRerender(nodeId, {
                slideTitles: nextTitles,
                slideCaptions: nextCaptions,
                slideEnrichStatuses: nextStatuses,
            });
            this.saveSession?.();
        } catch (err) {
            const refreshed = this._getPptxNode(nodeId) || node;
            const nextStatuses = { ...(refreshed.slideEnrichStatuses || refreshed.slideCaptionStatuses || {}) };
            const nextErrors = { ...(refreshed.slideEnrichErrors || {}) };

            nextStatuses[idx] = 'error';
            nextErrors[idx] = String(err?.message || err);

            this._updateAndRerender(nodeId, { slideEnrichStatuses: nextStatuses, slideEnrichErrors: nextErrors });
            this.showToast?.(nextErrors[idx], 'error');
        }
    }

    /**
     * Generate title + one-paragraph caption for the current slide (node action button).
     * @param {string} nodeId
     * @returns {Promise<void>}
     */
    async enrichCurrentSlide(nodeId) {
        const node = this._getPptxNode(nodeId);
        if (!node) return;
        const idx = node.currentSlideIndex || 0;
        await this.enrichSlide(nodeId, idx);
    }

    /**
     * Generate title + one-paragraph captions for all slides (single structured call).
     * @param {string} nodeId
     * @returns {Promise<void>}
     */
    async enrichAllSlides(nodeId) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;

        // Mark all as running
        const statuses = { ...(node.slideEnrichStatuses || node.slideCaptionStatuses || {}) };
        for (let i = 0; i < slides.length; i++) {
            statuses[i] = 'running';
        }
        this._updateAndRerender(nodeId, { slideEnrichStatuses: statuses });

        try {
            const payloadSlides = slides.map((s, i) => ({
                title: getEffectiveSlideTitle(node, i) || '',
                text_content: s.text_content || '',
            }));

            const requestBody = this.buildLLMRequest({
                slides: payloadSlides,
                filename: node.filename || node.title || null,
            });

            const response = await fetch(apiUrl('/api/pptx/caption-title-deck'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to caption+title all slides');
            }

            const data = await response.json();
            const outSlides = Array.isArray(data?.slides) ? data.slides : [];
            if (outSlides.length !== slides.length) {
                throw new Error(`Expected ${slides.length} slides, got ${outSlides.length}`);
            }

            const refreshed = this._getPptxNode(nodeId) || node;
            const nextTitles = { ...(refreshed.slideTitles || {}) };
            const nextCaptions = { ...(refreshed.slideCaptions || {}) };
            const nextStatuses = { ...(refreshed.slideEnrichStatuses || refreshed.slideCaptionStatuses || {}) };

            for (let i = 0; i < outSlides.length; i++) {
                const item = outSlides[i] || {};
                if (item.title) nextTitles[i] = String(item.title).trim();
                if (item.caption) nextCaptions[i] = String(item.caption).trim();
                nextStatuses[i] = 'done';
            }

            this._updateAndRerender(nodeId, {
                slideTitles: nextTitles,
                slideCaptions: nextCaptions,
                slideEnrichStatuses: nextStatuses,
            });
            this.saveSession?.();
        } catch (err) {
            const refreshed = this._getPptxNode(nodeId) || node;
            const nextStatuses = { ...(refreshed.slideEnrichStatuses || refreshed.slideCaptionStatuses || {}) };
            for (let i = 0; i < slides.length; i++) {
                nextStatuses[i] = 'error';
            }
            this._updateAndRerender(nodeId, { slideEnrichStatuses: nextStatuses });
            this.showToast?.(String(err?.message || err), 'error');
        }
    }

    /**
     * Weave slide titles + captions into a narrative summary.
     * This creates a new AI node and streams into it (text-only).
     *
     * @param {string} nodeId
     * @returns {Promise<void>}
     */
    async weaveNarrative(nodeId) {
        // In test/non-browser environments, don't attempt modal/DOM work.
        if (typeof document === 'undefined') return;
        this.openWeaveNarrativeModal(nodeId);
    }

    /**
     * Open the weave narrative modal for a given deck.
     * Suggestions are generated automatically on open.
     *
     * @param {string} nodeId
     * @returns {void}
     */
    openWeaveNarrativeModal(nodeId) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;

        const modal = this.modalManager?.getPluginModal?.('powerpoint', 'weave') || this._pptxWeaveModal;
        if (!modal) {
            // If modal isn't available, fall back to a reasonable default.
            this._runWeaveNarrative(nodeId, this._getDefaultWeaveSettings());
            return;
        }

        // Reset per-run state
        this._weaveModalState = {
            nodeId,
            presets: [],
            selectedPresetId: null,
        };

        // Reset UI
        this._resetWeaveModalUi(modal);

        // Show modal and start fetching suggestions
        this.modalManager.showPluginModal('powerpoint', 'weave');
        this._startWeaveSuggestionsFetch(nodeId);
    }

    /**
     * @returns {{voice: string, audience: string, length: string, structure: string, inclusion: string}}
     */
    _getDefaultWeaveSettings() {
        return {
            voice: 'Warm, confident, and clear.',
            audience: '',
            length: 'medium',
            structure: 'narrative',
            inclusion: 'captioned_only',
        };
    }

    /**
     * @param {HTMLElement} modal
     * @returns {void}
     */
    _resetWeaveModalUi(modal) {
        modal.querySelector('#pptx-weave-presets-status').textContent = 'Loading…';
        modal.querySelector('#pptx-weave-presets-loading').style.display = 'flex';
        modal.querySelector('#pptx-weave-presets-list').innerHTML = '';

        const defaults = this._getDefaultWeaveSettings();
        modal.querySelector('#pptx-weave-voice').value = defaults.voice;
        modal.querySelector('#pptx-weave-audience').value = defaults.audience;
        modal.querySelector('#pptx-weave-length').value = defaults.length;
        modal.querySelector('#pptx-weave-structure').value = defaults.structure;
        modal.querySelector('#pptx-weave-inclusion').value = defaults.inclusion;

        modal.querySelector('#pptx-weave-generate-btn').disabled = true;
    }

    /**
     * Cancel in-flight suggestions generation (if any), but keep the modal open.
     * @returns {void}
     */
    _cancelWeaveSuggestions() {
        if (this._weaveSuggestionsAbortController) {
            this._weaveSuggestionsAbortController.abort();
            this._weaveSuggestionsAbortController = null;
        }
        const modal = this.modalManager?.getPluginModal?.('powerpoint', 'weave') || this._pptxWeaveModal;
        if (!modal) return;
        modal.querySelector('#pptx-weave-presets-loading').style.display = 'none';
        modal.querySelector('#pptx-weave-presets-status').textContent = 'Suggestions cancelled';
        this._updateWeaveGenerateEnabled();
    }

    /**
     * Close weave narrative modal and clear per-run state.
     * @returns {void}
     */
    _closeWeaveNarrativeModal() {
        this._cancelWeaveSuggestions();
        this.modalManager?.hidePluginModal?.('powerpoint', 'weave');
        this._weaveModalState = null;
    }

    /**
     * @param {string} presetId
     * @returns {void}
     */
    _selectWeavePreset(presetId) {
        if (!this._weaveModalState) return;
        const presets = this._weaveModalState.presets || [];
        const preset = presets.find((p) => p.id === presetId) || null;
        this._weaveModalState.selectedPresetId = presetId;

        const modal = this.modalManager?.getPluginModal?.('powerpoint', 'weave') || this._pptxWeaveModal;
        if (!modal) return;

        if (preset) {
            if (preset.voice != null) modal.querySelector('#pptx-weave-voice').value = preset.voice;
            if (preset.audience_hint != null) modal.querySelector('#pptx-weave-audience').value = preset.audience_hint;
            if (preset.length) modal.querySelector('#pptx-weave-length').value = preset.length;
            if (preset.structure) modal.querySelector('#pptx-weave-structure').value = preset.structure;
            if (preset.inclusion) modal.querySelector('#pptx-weave-inclusion').value = preset.inclusion;
        }

        this._updateWeaveGenerateEnabled();
    }

    /**
     * Enable/disable Generate button based on modal state.
     * @returns {void}
     */
    _updateWeaveGenerateEnabled() {
        const modal = this.modalManager?.getPluginModal?.('powerpoint', 'weave') || this._pptxWeaveModal;
        if (!modal) return;
        const btn = modal.querySelector('#pptx-weave-generate-btn');
        if (!btn) return;
        btn.disabled = !this._weaveModalState?.nodeId;
    }

    /**
     * @returns {void}
     */
    _handleWeaveGenerateClick() {
        const modal = this.modalManager?.getPluginModal?.('powerpoint', 'weave') || this._pptxWeaveModal;
        if (!modal) return;
        const nodeId = this._weaveModalState?.nodeId;
        if (!nodeId) return;

        const settings = {
            voice: String(modal.querySelector('#pptx-weave-voice')?.value || ''),
            audience: String(modal.querySelector('#pptx-weave-audience')?.value || ''),
            length: String(modal.querySelector('#pptx-weave-length')?.value || 'medium'),
            structure: String(modal.querySelector('#pptx-weave-structure')?.value || 'narrative'),
            inclusion: String(modal.querySelector('#pptx-weave-inclusion')?.value || 'captioned_only'),
        };

        this._closeWeaveNarrativeModal();
        this._runWeaveNarrative(nodeId, settings);
    }

    /**
     * Kick off AI suggestions fetch and render presets on completion.
     *
     * @param {string} nodeId
     * @returns {Promise<void>}
     */
    async _startWeaveSuggestionsFetch(nodeId) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;

        const modal = this.modalManager?.getPluginModal?.('powerpoint', 'weave') || this._pptxWeaveModal;
        if (!modal) return;

        // Abort any prior request
        if (this._weaveSuggestionsAbortController) {
            this._weaveSuggestionsAbortController.abort();
        }
        const abortController = new AbortController();
        this._weaveSuggestionsAbortController = abortController;

        // Prepare compact deck summary
        const captions = node.slideCaptions || {};
        const summarySlides = [];
        for (let i = 0; i < Math.min(slides.length, 25); i++) {
            const title = getEffectiveSlideTitle(node, i) || '';
            const caption = captions[i] ? String(captions[i]).trim() : '';
            if (!title && !caption) continue;
            summarySlides.push({ index: i, title, caption });
        }

        const requestBody = this.buildLLMRequest({
            slides: summarySlides,
            filename: node.filename || node.title || null,
        });

        try {
            const resp = await fetch(apiUrl('/api/pptx/narrative-style-suggestions'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to generate style suggestions');
            }

            const data = await resp.json();
            const presets = Array.isArray(data?.presets) ? data.presets : [];
            if (!this._weaveModalState || this._weaveModalState.nodeId !== nodeId) return;
            this._weaveModalState.presets = presets;

            this._renderWeavePresets(presets);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            // Even if suggestions fail, keep modal usable with simple fallbacks.
            const fallback = this._getFallbackWeavePresets();
            if (this._weaveModalState && this._weaveModalState.nodeId === nodeId) {
                this._weaveModalState.presets = fallback;
            }
            this._renderWeavePresets(fallback);
        } finally {
            if (this._weaveSuggestionsAbortController === abortController) {
                this._weaveSuggestionsAbortController = null;
            }
        }
    }

    /**
     * @returns {Array<{id: string, label: string, description: string, voice?: string, length?: string, structure?: string, audience_hint?: string, inclusion?: string}>}
     */
    _getFallbackWeavePresets() {
        return [
            {
                id: 'story',
                label: 'Story arc',
                description: 'A coherent narrative that flows slide-to-slide with a clear throughline.',
                voice: 'Warm, confident, and clear.',
                length: 'medium',
                structure: 'narrative',
                audience_hint: '',
                inclusion: 'captioned_only',
            },
            {
                id: 'exec',
                label: 'Executive summary',
                description: 'High-level summary: goals, key points, and recommended next steps.',
                voice: 'Direct, crisp, and business-friendly.',
                length: 'short',
                structure: 'executive_summary',
                audience_hint: 'Leadership / stakeholders',
                inclusion: 'captioned_only',
            },
            {
                id: 'speaker',
                label: 'Speaker notes',
                description: 'Slide-by-slide speaker notes that are easy to present from.',
                voice: 'Conversational and engaging.',
                length: 'long',
                structure: 'speaker_notes',
                audience_hint: '',
                inclusion: 'all',
            },
        ];
    }

    /**
     * @param {Array<Object>} presets
     * @returns {void}
     */
    _renderWeavePresets(presets) {
        const modal = this.modalManager?.getPluginModal?.('powerpoint', 'weave') || this._pptxWeaveModal;
        if (!modal) return;

        const loading = modal.querySelector('#pptx-weave-presets-loading');
        const statusEl = modal.querySelector('#pptx-weave-presets-status');
        const listEl = modal.querySelector('#pptx-weave-presets-list');
        loading.style.display = 'none';
        statusEl.textContent = presets.length ? `${presets.length} options` : 'No suggestions available';
        listEl.innerHTML = '';

        for (const p of presets) {
            const id = String(p.id || '');
            const label = String(p.label || 'Preset');
            const desc = String(p.description || '');
            const item = document.createElement('label');
            item.className = 'pptx-weave-preset';

            const titleRow = document.createElement('div');
            titleRow.className = 'pptx-weave-preset-title';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'pptx-weave-preset';
            input.value = id || `preset_${Math.random().toString(16).slice(2)}`;

            const titleText = document.createElement('span');
            titleText.textContent = label;

            const descEl = document.createElement('div');
            descEl.className = 'pptx-weave-preset-desc';
            descEl.textContent = desc;

            titleRow.appendChild(input);
            titleRow.appendChild(titleText);
            item.appendChild(titleRow);
            item.appendChild(descEl);
            listEl.appendChild(item);
        }

        // Default-select first preset if present
        if (presets.length > 0) {
            const firstId = String(presets[0].id || '');
            const firstRadio = listEl.querySelector('input[name="pptx-weave-preset"]');
            if (firstRadio) firstRadio.checked = true;
            this._selectWeavePreset(firstId);
        } else {
            this._updateWeaveGenerateEnabled();
        }
    }

    /**
     * Run narrative generation with the chosen settings and stream into a new AI node.
     *
     * @param {string} nodeId
     * @param {{voice: string, audience: string, length: string, structure: string, inclusion: string}} settings
     * @returns {Promise<void>}
     */
    async _runWeaveNarrative(nodeId, settings) {
        const node = this._getPptxNode(nodeId);
        const slides = node?.pptxData?.slides || [];
        if (!node || slides.length === 0) return;

        const captions = node.slideCaptions || {};
        const items = [];
        for (let i = 0; i < slides.length; i++) {
            const title = getEffectiveSlideTitle(node, i) || '';
            const caption = captions[i] ? String(captions[i]).trim() : '';

            const hasCaption = !!caption;
            const include =
                settings.inclusion === 'all' ? true : settings.inclusion === 'captioned_only' ? hasCaption : true;

            if (!include) continue;
            if (!title && !caption) continue;
            items.push({ idx: i, title, caption });
        }

        if (items.length === 0) {
            this.showToast?.('No titles/captions found yet. Run Caption+Title first.', 'error');
            return;
        }

        if (!this._app?.streamWithAbort || !this.streamingManager?.register) {
            this.showToast?.('Streaming infrastructure not available', 'error');
            return;
        }

        const model = this.modelPicker?.value;
        const titleSuffix =
            settings.structure === 'executive_summary'
                ? 'Executive summary'
                : settings.structure === 'speaker_notes'
                  ? 'Speaker notes'
                  : 'Narrative';
        const aiNode = createNode(NodeType.AI, '', {
            position: this.graph.autoPosition([nodeId]),
            model: (model || '').split('/').pop(),
            title: `Deck: ${titleSuffix}`,
        });

        if (this._app?.addUserNode) {
            this._app.addUserNode(aiNode);
        } else {
            // Test harness / fallback
            this.graph.addNode(aiNode);
            this.canvas.renderNode(aiNode);
        }
        this.graph.addEdge(createEdge(nodeId, aiNode.id, EdgeType.REPLY));
        this.updateCollapseButtonForNode?.(nodeId);
        this.saveSession?.();

        // UX: select + center on the new narrative node
        this.canvas.selectNode?.(aiNode.id);
        this.canvas.centerOnAnimated?.(aiNode.position.x + 160, aiNode.position.y + 100, 300);

        const lengthRule =
            settings.length === 'short'
                ? 'Aim for ~3 short paragraphs.'
                : settings.length === 'long'
                  ? 'Aim for ~8 short paragraphs.'
                  : 'Aim for ~5 short paragraphs.';

        const structureRule =
            settings.structure === 'executive_summary'
                ? 'Write an executive summary with a short heading, then 5-10 bullet points, then "Next steps".'
                : settings.structure === 'speaker_notes'
                  ? 'Write slide-by-slide speaker notes. For each slide, include a short "Say:" paragraph and (optional) "Emphasize:" line.'
                  : 'Write a coherent narrative from start to finish. No bullet points.';

        const audienceRule = settings.audience ? `Audience: ${settings.audience}\n` : '';
        const voiceRule = settings.voice ? `Voice/persona: ${settings.voice}\n` : '';

        const systemPrompt =
            `You are a skilled writer.\n\n` +
            audienceRule +
            voiceRule +
            `Task: weave the slide deck into a cohesive output.\n\n` +
            `Rules:\n- Use only the provided slide titles and one-paragraph captions.\n- Do not invent facts.\n- ${lengthRule}\n- ${structureRule}\n`;

        const userPrompt =
            `Slide notes (ordered):\n\n` +
            items
                .map((s) => {
                    const t = s.title ? `Title: ${s.title}\n` : '';
                    const c = s.caption ? `Caption: ${s.caption}\n` : '';
                    return `Slide ${s.idx + 1}:\n${t}${c}`.trim();
                })
                .join('\n\n') +
            `\n\nWrite the output now.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];

        const abortController = new AbortController();
        this.streamingManager.register(aiNode.id, {
            abortController,
            featureId: 'powerpoint',
            context: { messages, model },
            onContinue: async (id, state) => {
                await this._app.continueAIResponse(id, state.context);
            },
        });

        this._app.streamWithAbort(
            aiNode.id,
            abortController,
            messages,
            model,
            // onChunk
            (_chunk, fullContent) => {
                this.canvas.updateNodeContent(aiNode.id, fullContent, true);
                this.graph.updateNode(aiNode.id, { content: fullContent });
            },
            // onDone
            (fullContent) => {
                this.streamingManager.unregister(aiNode.id);
                this.canvas.updateNodeContent(aiNode.id, fullContent, false);
                this.graph.updateNode(aiNode.id, { content: fullContent });
                this.saveSession?.();
                this.generateNodeSummary?.(aiNode.id);
            },
            // onError
            (err) => {
                this.streamingManager.unregister(aiNode.id);
                const msg = String(err?.message || err);
                const errorContent = `*Error generating narrative: ${msg}*`;
                this.canvas.updateNodeContent(aiNode.id, errorContent, false);
                this.graph.updateNode(aiNode.id, { content: errorContent });
                this.saveSession?.();
                this.showToast?.(msg, 'error');
            }
        );
    }
}

export { PowerPointFeature };
