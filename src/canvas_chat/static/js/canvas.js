/**
 * Canvas module - SVG-based pan/zoom canvas with node rendering
 */

class Canvas {
    // Static flag to track if marked has been configured (only configure once)
    static markedConfigured = false;

    constructor(containerId, svgId) {
        this.container = document.getElementById(containerId);
        this.svg = document.getElementById(svgId);
        this.nodesLayer = document.getElementById('nodes-layer');
        this.edgesLayer = document.getElementById('edges-layer');

        // Viewport state
        this.viewBox = { x: 0, y: 0, width: 1000, height: 800 };
        this.scale = 1;
        this.minScale = 0.1;
        this.maxScale = 3;

        // Interaction state
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.isDraggingNode = false;
        this.draggedNode = null;
        this.dragOffset = { x: 0, y: 0 };
        this.dragStartPos = null;  // Track start position for undo

        // Node elements map
        this.nodeElements = new Map();
        this.edgeElements = new Map();

        // Track nodes where user has manually scrolled (to pause auto-scroll)
        this.userScrolledNodes = new Set();

        // Selection state
        this.selectedNodes = new Set();
        this.hoveredNode = null;

        // Callbacks
        this.onNodeSelect = null;
        this.onNodeDeselect = null;
        this.onNodeMove = null;
        this.onNodeResize = null;
        this.onNodeReply = null;
        this.onNodeBranch = null;
        this.onNodeSummarize = null;
        this.onNodeFetchSummarize = null;
        this.onNodeDelete = null;
        this.onNodeCopy = null;  // For copying node content
        this.onNodeTitleEdit = null;  // For editing node title in semantic zoom
        this.onNodeStopGeneration = null;  // For stopping LLM generation
        this.onNodeContinueGeneration = null;  // For continuing stopped generation
        this.onNodeRetry = null;  // For retrying failed operations
        this.onNodeDismissError = null;  // For dismissing error nodes
        this.onNodeFitToViewport = null;  // For resizing node to 80% of viewport
        this.onNodeResetSize = null;  // For resetting node to default size
        this.onNodeEditContent = null;  // For editing node content (FETCH_RESULT)
        this.onNodeResummarize = null;  // For re-summarizing edited content
        this.onNodeNavigate = null;  // For navigating to parent/child nodes
        this.onNavParentClick = null;  // For handling parent navigation button click
        this.onNavChildClick = null;  // For handling child navigation button click

        // PDF drag & drop callback
        this.onPdfDrop = null;  // For handling PDF file drops

        // Image drag & drop callback
        this.onImageDrop = null;  // For handling image file drops

        // Image click callback (for images in node content)
        this.onImageClick = null;  // For handling clicks on images in node content

        // Reply tooltip state
        this.branchTooltip = null;
        this.activeSelectionNodeId = null;
        this.pendingSelectedText = null;  // Store selected text when tooltip opens

        // Navigation popover state
        this.navPopover = null;
        this.activeNavNodeId = null;

        // No-nodes-visible hint
        this.noNodesHint = document.getElementById('no-nodes-hint');
        this.noNodesHintTimeout = null;

        // Cache for node type labels and icons (avoid creating wrapper instances repeatedly)
        this.nodeTypeLabelCache = new Map();
        this.nodeTypeIconCache = new Map();

        this.init();
    }

    init() {
        this.updateViewBox();
        this.setupEventListeners();
        this.handleResize();
        this.createBranchTooltip();
        this.createImageTooltip();
        this.createNavPopover();
    }

    /**
     * Create the floating reply tooltip element with input field
     */
    createBranchTooltip() {
        this.branchTooltip = document.createElement('div');
        this.branchTooltip.className = 'reply-tooltip';
        this.branchTooltip.innerHTML = `
            <div class="reply-tooltip-selection">
                <span class="reply-tooltip-selection-text"></span>
            </div>
            <div class="reply-tooltip-input-row">
                <input type="text" class="reply-tooltip-input" placeholder="Type your reply..." />
                <button class="reply-tooltip-btn" title="Send (Enter)">→</button>
            </div>
        `;
        this.branchTooltip.style.display = 'none';
        document.body.appendChild(this.branchTooltip);

        const input = this.branchTooltip.querySelector('.reply-tooltip-input');
        const btn = this.branchTooltip.querySelector('.reply-tooltip-btn');

        // Handle submit via button click
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.submitReplyTooltip();
        });

        // Handle submit via Enter key (but allow slash command menu to override)
        input.addEventListener('keydown', (e) => {
            // Check if slash command menu should handle this
            if (this.onReplyInputKeydown && this.onReplyInputKeydown(e)) {
                return; // Slash command menu handled it
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.submitReplyTooltip();
            } else if (e.key === 'Escape') {
                this.hideBranchTooltip();
            }
        });

        // Prevent click inside tooltip from triggering outside click handler
        this.branchTooltip.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        // Store reference to input for external access
        this.replyTooltipInput = input;
    }

    /**
     * Get the reply tooltip input element (for attaching slash command menu)
     */
    getReplyTooltipInput() {
        return this.replyTooltipInput;
    }

    /**
     * Submit the reply from the tooltip
     */
    submitReplyTooltip() {
        const input = this.branchTooltip.querySelector('.reply-tooltip-input');
        const replyText = input.value.trim();
        const selectedText = this.pendingSelectedText;

        if (selectedText && this.activeSelectionNodeId && this.onNodeBranch) {
            // Pass both the selected text and the user's reply
            this.onNodeBranch(this.activeSelectionNodeId, selectedText, replyText);
        }

        this.hideBranchTooltip();
        window.getSelection().removeAllRanges();
        input.value = '';
    }

    /**
     * Show the reply tooltip near the selection
     * NOTE: Do NOT auto-focus the input - this would clear the text selection
     */
    showBranchTooltip(x, y) {
        // Store the selected text before showing (selection may change later)
        const selection = window.getSelection();
        this.pendingSelectedText = selection.toString().trim();

        // Update the selection preview text
        const selectionTextEl = this.branchTooltip.querySelector('.reply-tooltip-selection-text');
        if (selectionTextEl) {
            // Truncate if too long, but show full text on hover
            const maxLength = 100;
            const displayText = this.pendingSelectedText.length > maxLength
                ? this.pendingSelectedText.slice(0, maxLength) + '…'
                : this.pendingSelectedText;
            selectionTextEl.textContent = `"${displayText}"`;
            selectionTextEl.title = this.pendingSelectedText; // Full text on hover
        }

        this.branchTooltip.style.display = 'block';
        this.branchTooltip.style.left = `${x}px`;
        this.branchTooltip.style.top = `${y}px`;
    }

    /**
     * Hide the reply tooltip
     */
    hideBranchTooltip() {
        this.branchTooltip.style.display = 'none';
        this.activeSelectionNodeId = null;
        this.pendingSelectedText = null;
        // Clear the input and selection preview
        const input = this.branchTooltip.querySelector('.reply-tooltip-input');
        if (input) input.value = '';
        const selectionTextEl = this.branchTooltip.querySelector('.reply-tooltip-selection-text');
        if (selectionTextEl) selectionTextEl.textContent = '';
    }

    /**
     * Create the floating image action tooltip with action buttons
     */
    createImageTooltip() {
        this.imageTooltip = document.createElement('div');
        this.imageTooltip.className = 'image-tooltip';
        this.imageTooltip.innerHTML = `
            <div class="image-tooltip-preview">
                <img class="image-tooltip-img" src="" alt="Selected image">
            </div>
            <div class="image-tooltip-actions">
                <button class="image-tooltip-btn ask-btn" title="Ask about this image">💬 Ask</button>
                <button class="image-tooltip-btn extract-btn" title="Extract to canvas">📤 Extract</button>
            </div>
        `;
        this.imageTooltip.style.display = 'none';
        document.body.appendChild(this.imageTooltip);

        // State
        this.pendingImageSrc = null;
        this.pendingImageNodeId = null;

        // Ask button - select image node and focus chat
        const askBtn = this.imageTooltip.querySelector('.ask-btn');
        askBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleImageAsk();
        });

        // Extract button - create an IMAGE node from this image
        const extractBtn = this.imageTooltip.querySelector('.extract-btn');
        extractBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleImageExtract();
        });

        // Prevent click inside tooltip from triggering outside click handler
        this.imageTooltip.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * Show the image tooltip near the clicked image
     */
    showImageTooltip(imgSrc, position) {
        // Store image info
        this.pendingImageSrc = imgSrc;

        // Update preview image
        const previewImg = this.imageTooltip.querySelector('.image-tooltip-img');
        if (previewImg) {
            previewImg.src = imgSrc;
        }

        this.imageTooltip.style.display = 'block';
        this.imageTooltip.style.left = `${position.x - 100}px`;  // Center horizontally
        this.imageTooltip.style.top = `${position.y - 10}px`;
    }

    /**
     * Hide the image tooltip
     */
    hideImageTooltip() {
        this.imageTooltip.style.display = 'none';
        this.pendingImageSrc = null;
        this.pendingImageNodeId = null;
    }

    /**
     * Handle "Ask" action from image tooltip
     * Extracts image and focuses chat input
     */
    handleImageAsk() {
        if (this.pendingImageSrc && this.pendingImageNodeId && this.onImageClick) {
            this.onImageClick(this.pendingImageNodeId, this.pendingImageSrc, { action: 'ask' });
        }
        this.hideImageTooltip();
    }

    /**
     * Handle "Extract" action from image tooltip
     * Creates a new IMAGE node with this image
     */
    handleImageExtract() {
        if (this.pendingImageSrc && this.pendingImageNodeId && this.onImageClick) {
            this.onImageClick(this.pendingImageNodeId, this.pendingImageSrc, { action: 'extract' });
        }
        this.hideImageTooltip();
    }

    /**
     * Create the navigation popover for showing multiple parent/child nodes
     */
    createNavPopover() {
        this.navPopover = document.createElement('div');
        this.navPopover.className = 'nav-popover';
        this.navPopover.innerHTML = `
            <div class="nav-popover-title"></div>
            <div class="nav-popover-list"></div>
        `;
        this.navPopover.style.display = 'none';
        document.body.appendChild(this.navPopover);

        // Prevent click inside popover from triggering outside click handler
        this.navPopover.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * Show the navigation popover with a list of nodes to navigate to
     * @param {string} direction - 'parent' or 'child'
     * @param {Array} nodes - Array of node objects to show
     * @param {Object} position - {x, y} position for the popover
     */
    showNavPopover(direction, nodes, position) {
        if (!nodes || nodes.length === 0) return;

        const titleEl = this.navPopover.querySelector('.nav-popover-title');
        const listEl = this.navPopover.querySelector('.nav-popover-list');

        // Set title
        titleEl.textContent = direction === 'parent' ? 'Parents' : 'Children';

        // Build list items
        listEl.innerHTML = nodes.map(node => {
            const wrapped = wrapNode(node);
            const icon = wrapped.getTypeIcon();
            const label = wrapped.getTypeLabel();
            const summary = wrapped.getSummaryText(this);
            const truncatedSummary = summary.length > 40 ? summary.slice(0, 40) + '...' : summary;

            return `
                <div class="nav-popover-item" data-node-id="${node.id}">
                    <span class="nav-popover-icon">${icon}</span>
                    <span class="nav-popover-label">${this.escapeHtml(label)}</span>
                    <span class="nav-popover-summary">${this.escapeHtml(truncatedSummary)}</span>
                </div>
            `;
        }).join('');

        // Add click handlers to items
        listEl.querySelectorAll('.nav-popover-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const nodeId = item.getAttribute('data-node-id');
                this.hideNavPopover();
                if (this.onNodeNavigate) {
                    this.onNodeNavigate(nodeId);
                }
            });
        });

        // Position and show
        this.navPopover.style.display = 'block';
        this.navPopover.style.left = `${position.x}px`;
        this.navPopover.style.top = `${position.y}px`;
    }

    /**
     * Hide the navigation popover
     */
    hideNavPopover() {
        this.navPopover.style.display = 'none';
        this.activeNavNodeId = null;
    }

    /**
     * Handle navigation button click
     * @param {string} nodeId - The current node ID
     * @param {string} direction - 'parent' or 'child'
     * @param {Array} nodes - Array of parent or child nodes
     * @param {HTMLElement} button - The button element that was clicked
     */
    handleNavButtonClick(nodeId, direction, nodes, button) {
        if (!nodes || nodes.length === 0) {
            // No nodes to navigate to - do nothing
            return;
        }

        if (nodes.length === 1) {
            // Single node - navigate directly
            if (this.onNodeNavigate) {
                this.onNodeNavigate(nodes[0].id);
            }
        } else {
            // Multiple nodes - show popover
            const rect = button.getBoundingClientRect();
            const position = {
                x: rect.left,
                y: direction === 'parent' ? rect.top - 10 : rect.bottom + 10
            };
            this.activeNavNodeId = nodeId;
            this.showNavPopover(direction, nodes, position);
        }
    }

    /**
     * Update the navigation button states for a node.
     * Enables/disables buttons based on whether there are parents/children.
     *
     * @param {string} nodeId - The node ID
     * @param {number} parentCount - Number of parent nodes
     * @param {number} childCount - Number of child nodes
     */
    updateNavButtonStates(nodeId, parentCount, childCount) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const navParentBtn = wrapper.querySelector('.nav-parent-btn');
        const navChildBtn = wrapper.querySelector('.nav-child-btn');

        if (navParentBtn) {
            if (parentCount === 0) {
                navParentBtn.classList.add('disabled');
                navParentBtn.title = 'No parent nodes';
            } else {
                navParentBtn.classList.remove('disabled');
                navParentBtn.title = parentCount === 1 ? 'Go to parent node' : `Go to parent (${parentCount} available)`;
            }
        }

        if (navChildBtn) {
            if (childCount === 0) {
                navChildBtn.classList.add('disabled');
                navChildBtn.title = 'No child nodes';
            } else {
                navChildBtn.classList.remove('disabled');
                navChildBtn.title = childCount === 1 ? 'Go to child node' : `Go to child (${childCount} available)`;
            }
        }
    }

    /**
     * Update navigation button states for all nodes in a graph.
     *
     * @param {Graph} graph - The graph instance with parent/child relationships
     */
    updateAllNavButtonStates(graph) {
        for (const node of graph.getAllNodes()) {
            const parents = graph.getParents(node.id);
            const children = graph.getChildren(node.id);
            this.updateNavButtonStates(node.id, parents.length, children.length);
        }
    }

    /**
     * Get the center of the visible viewport in SVG coordinates
     */
    getViewportCenter() {
        return {
            x: this.viewBox.x + this.viewBox.width / 2,
            y: this.viewBox.y + this.viewBox.height / 2
        };
    }

    setupEventListeners() {
        // Mouse pan (click and drag)
        this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.container.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.container.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Wheel events: pinch-to-zoom (ctrlKey) or two-finger pan
        this.container.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Touch events for mobile/tablet
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.container.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Gesture events (Safari)
        this.container.addEventListener('gesturestart', this.handleGestureStart.bind(this), { passive: false });
        this.container.addEventListener('gesturechange', this.handleGestureChange.bind(this), { passive: false });
        this.container.addEventListener('gestureend', this.handleGestureEnd.bind(this));

        // Resize
        window.addEventListener('resize', this.handleResize.bind(this));

        // Double-click to fit
        this.container.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        // Text selection handling for reply tooltip
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
        document.addEventListener('mousedown', (e) => {
            // Hide tooltips/popovers when clicking outside of them
            if (!e.target.closest('.reply-tooltip')) {
                this.hideBranchTooltip();
            }
            if (!e.target.closest('.image-tooltip')) {
                this.hideImageTooltip();
            }
            if (!e.target.closest('.nav-popover') && !e.target.closest('.nav-parent-btn') && !e.target.closest('.nav-child-btn')) {
                this.hideNavPopover();
            }
        });

        // PDF drag & drop handling
        this.container.addEventListener('dragover', this.handleDragOver.bind(this));
        this.container.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.container.addEventListener('drop', this.handleDrop.bind(this));

        // Initialize touch state
        this.touchState = {
            touches: [],
            lastDistance: 0,
            lastCenter: { x: 0, y: 0 },
            isPinching: false
        };
        this.gestureState = {
            startScale: 1,
            isGesturing: false
        };
    }

    /**
     * Handle text selection changes to show/hide branch tooltip
     */
    handleSelectionChange() {
        // If user is interacting with the tooltip (e.g., typing in input), don't update
        if (this.branchTooltip && this.branchTooltip.contains(document.activeElement)) {
            return;
        }

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (!selectedText) {
            // No selection - but only hide if user isn't focused on tooltip
            if (!this.branchTooltip.contains(document.activeElement)) {
                // Check if tooltip is visible and we have pending text (user clicked into input)
                if (this.pendingSelectedText && this.branchTooltip.style.display !== 'none') {
                    // Keep tooltip open - user is working with it
                    return;
                }
                this.hideBranchTooltip();
            }
            return;
        }

        // Check if selection is within a node's content
        const anchorNode = selection.anchorNode;
        if (!anchorNode) return;

        const nodeContent = anchorNode.parentElement?.closest('.node-content');
        if (!nodeContent) return;

        const nodeWrapper = nodeContent.closest('.node-wrapper');
        if (!nodeWrapper) return;

        // Get the node ID from the wrapper
        const nodeId = nodeWrapper.getAttribute('data-node-id');
        if (!nodeId) return;

        this.activeSelectionNodeId = nodeId;

        // Position tooltip above the selection
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Position above and centered on the selection
        const tooltipX = rect.left + rect.width / 2 - 140; // Center the tooltip (tooltip is ~280px wide)
        const tooltipY = rect.top - 100; // Above the selection (tooltip is ~90px tall now with preview)

        this.showBranchTooltip(tooltipX, tooltipY);
    }

    // --- PDF Drag & Drop Handlers ---

    /**
     * Handle dragover event for PDF drop zone
     */
    handleDragOver(e) {
        // Check if dragging files
        if (!e.dataTransfer.types.includes('Files')) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.showDropZone();
    }

    /**
     * Handle dragleave event for PDF drop zone
     */
    handleDragLeave(e) {
        // Only hide if leaving the container entirely (not entering a child)
        if (!this.container.contains(e.relatedTarget)) {
            this.hideDropZone();
        }
    }

    /**
     * Handle drop event for PDF and image files
     */
    handleDrop(e) {
        e.preventDefault();
        this.hideDropZone();

        // Get dropped files
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        // Convert drop position to SVG coordinates
        const position = this.clientToSvg(e.clientX, e.clientY);

        // Check for PDF file first
        const pdfFile = Array.from(files).find(f => f.type === 'application/pdf');
        if (pdfFile && this.onPdfDrop) {
            this.onPdfDrop(pdfFile, position);
            return;
        }

        // Check for image file
        const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
        if (imageFile && this.onImageDrop) {
            this.onImageDrop(imageFile, position);
            return;
        }
    }

    /**
     * Show the PDF drop zone overlay
     */
    showDropZone() {
        const overlay = document.getElementById('drop-zone-overlay');
        if (overlay) {
            overlay.classList.add('visible');
        }
    }

    /**
     * Hide the PDF drop zone overlay
     */
    hideDropZone() {
        const overlay = document.getElementById('drop-zone-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
        }
    }

    handleResize() {
        const rect = this.container.getBoundingClientRect();
        this.viewBox.width = rect.width / this.scale;
        this.viewBox.height = rect.height / this.scale;
        this.updateViewBox();
    }

    updateViewBox() {
        this.svg.setAttribute('viewBox',
            `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`
        );

        // Update zoom level class for semantic zoom
        this.container.classList.remove('zoom-full', 'zoom-summary', 'zoom-mini');

        if (this.scale > 0.6) {
            this.container.classList.add('zoom-full');
        } else if (this.scale > 0.35) {
            this.container.classList.add('zoom-summary');
        } else {
            this.container.classList.add('zoom-mini');
        }

        // Check if any nodes are visible and update hint
        this.updateNoNodesHint();
    }

    /**
     * Check if any nodes are visible in the current viewport
     */
    hasVisibleNodes() {
        if (this.nodeElements.size === 0) return false;

        const vb = this.viewBox;

        for (const [nodeId, wrapper] of this.nodeElements) {
            const x = parseFloat(wrapper.getAttribute('x')) || 0;
            const y = parseFloat(wrapper.getAttribute('y')) || 0;
            const width = parseFloat(wrapper.getAttribute('width')) || 320;
            const height = parseFloat(wrapper.getAttribute('height')) || 200;

            // Check if node rectangle overlaps with viewBox
            const nodeRight = x + width;
            const nodeBottom = y + height;
            const vbRight = vb.x + vb.width;
            const vbBottom = vb.y + vb.height;

            if (x < vbRight && nodeRight > vb.x && y < vbBottom && nodeBottom > vb.y) {
                return true;
            }
        }

        return false;
    }

    /**
     * Update the no-nodes-visible hint with progressive fade-in
     */
    updateNoNodesHint() {
        if (!this.noNodesHint) return;

        // Clear any pending timeout
        if (this.noNodesHintTimeout) {
            clearTimeout(this.noNodesHintTimeout);
            this.noNodesHintTimeout = null;
        }

        const hasNodes = this.nodeElements.size > 0;
        const hasVisible = this.hasVisibleNodes();

        if (hasNodes && !hasVisible) {
            // Show hint after a short delay (progressive reveal)
            this.noNodesHint.style.display = 'block';
            this.noNodesHintTimeout = setTimeout(() => {
                this.noNodesHint.classList.add('visible');
            }, 300);
        } else {
            // Hide hint immediately
            this.noNodesHint.classList.remove('visible');
            // After transition, hide completely
            this.noNodesHintTimeout = setTimeout(() => {
                if (!this.noNodesHint.classList.contains('visible')) {
                    this.noNodesHint.style.display = 'none';
                }
            }, 500);
        }
    }

    handleMouseDown(e) {
        // Ignore if clicking on a node
        if (e.target.closest('.node')) {
            return;
        }

        // Check for click on empty space (deselect)
        if (e.target === this.svg || e.target.closest('#edges-layer')) {
            if (!e.ctrlKey && !e.metaKey) {
                this.clearSelection();
            }
        }

        // Start panning
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.container.style.cursor = 'grabbing';
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            const dx = (e.clientX - this.panStart.x) / this.scale;
            const dy = (e.clientY - this.panStart.y) / this.scale;

            this.viewBox.x -= dx;
            this.viewBox.y -= dy;

            this.panStart = { x: e.clientX, y: e.clientY };
            this.updateViewBox();
        } else if (this.isDraggingNode && this.draggedNode) {
            const point = this.clientToSvg(e.clientX, e.clientY);
            const newX = point.x - this.dragOffset.x;
            const newY = point.y - this.dragOffset.y;

            // Update visual position
            const wrapper = this.nodeElements.get(this.draggedNode.id);
            if (wrapper) {
                wrapper.setAttribute('x', newX);
                wrapper.setAttribute('y', newY);
            }

            // Update edges
            this.updateEdgesForNode(this.draggedNode.id, { x: newX, y: newY });
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.container.style.cursor = 'grab';
        }

        if (this.isDraggingNode && this.draggedNode) {
            const wrapper = this.nodeElements.get(this.draggedNode.id);
            if (wrapper) {
                const newPos = {
                    x: parseFloat(wrapper.getAttribute('x')),
                    y: parseFloat(wrapper.getAttribute('y'))
                };

                // Remove dragging class
                const nodeEl = wrapper.querySelector('.node');
                if (nodeEl) nodeEl.classList.remove('dragging');

                // Callback to persist position (pass old position for undo)
                if (this.onNodeMove) {
                    this.onNodeMove(this.draggedNode.id, newPos, this.dragStartPos);
                }
            }

            this.isDraggingNode = false;
            this.draggedNode = null;
            this.dragStartPos = null;
        }
    }

    handleWheel(e) {
        const rect = this.container.getBoundingClientRect();

        // Check if this is a pinch-to-zoom gesture (ctrlKey is set by trackpad pinch)
        // IMPORTANT: Check this FIRST before scrollable content check, because pinch-to-zoom
        // should always control canvas zoom, even when cursor is over a node
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();

            // Pinch to zoom
            // deltaY is negative when zooming in (fingers spreading)
            const zoomFactor = 1 - e.deltaY * 0.01;
            const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));

            if (newScale === this.scale) return;

            // Zoom towards mouse/gesture position
            const pointBefore = this.clientToSvg(e.clientX, e.clientY);

            this.scale = newScale;
            this.viewBox.width = rect.width / this.scale;
            this.viewBox.height = rect.height / this.scale;

            const pointAfter = this.clientToSvg(e.clientX, e.clientY);

            this.viewBox.x += pointBefore.x - pointAfter.x;
            this.viewBox.y += pointBefore.y - pointAfter.y;

            this.updateViewBox();
        } else {
            // Regular two-finger scroll (pan) - check if we should scroll node content instead
            const scrollableContent = e.target.closest('.node-content');
            if (scrollableContent) {
                // Check if this content element is actually scrollable (has overflow: auto/scroll)
                const style = window.getComputedStyle(scrollableContent);
                const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                                     style.overflowX === 'auto' || style.overflowX === 'scroll';

                if (isScrollable) {
                    // Check if content can scroll in the wheel direction
                    const canScrollUp = scrollableContent.scrollTop > 0;
                    const canScrollDown = scrollableContent.scrollTop < (scrollableContent.scrollHeight - scrollableContent.clientHeight - 1);
                    const canScrollLeft = scrollableContent.scrollLeft > 0;
                    const canScrollRight = scrollableContent.scrollLeft < (scrollableContent.scrollWidth - scrollableContent.clientWidth - 1);

                    // Determine scroll direction from wheel delta
                    const scrollingDown = e.deltaY > 0;
                    const scrollingUp = e.deltaY < 0;
                    const scrollingRight = e.deltaX > 0;
                    const scrollingLeft = e.deltaX < 0;

                    // If content can scroll in the requested direction, let it scroll naturally
                    const shouldScrollVertically = (scrollingDown && canScrollDown) || (scrollingUp && canScrollUp);
                    const shouldScrollHorizontally = (scrollingRight && canScrollRight) || (scrollingLeft && canScrollLeft);

                    if (shouldScrollVertically || shouldScrollHorizontally) {
                        // Let the content scroll - prevent canvas from panning
                        e.preventDefault();
                        // Manually scroll the content to ensure it works in foreignObject
                        if (shouldScrollVertically) {
                            scrollableContent.scrollTop += e.deltaY;
                        }
                        if (shouldScrollHorizontally) {
                            scrollableContent.scrollLeft += e.deltaX;
                        }
                        return;
                    }
                }
            }

            e.preventDefault();

            // Two-finger pan (regular scroll)
            const dx = e.deltaX / this.scale;
            const dy = e.deltaY / this.scale;

            this.viewBox.x += dx;
            this.viewBox.y += dy;

            this.updateViewBox();
        }
    }

    handleDoubleClick(e) {
        // Double-click on empty space to fit content (with smooth animation)
        if (e.target === this.svg || e.target.closest('#edges-layer')) {
            this.fitToContentAnimated(400);
        }
    }

    // --- Touch Event Handlers (for mobile/tablet) ---

    handleTouchStart(e) {
        const touches = Array.from(e.touches);
        this.touchState.touches = touches.map(t => ({ x: t.clientX, y: t.clientY }));

        if (touches.length === 2) {
            // Two fingers - prepare for pinch/pan
            // Always capture two-finger gestures, even on nodes, to prevent viewport zoom
            e.preventDefault();
            this.touchState.isPinching = true;
            this.touchState.lastDistance = this.getTouchDistance(touches);
            this.touchState.lastCenter = this.getTouchCenter(touches);
        } else if (touches.length === 1) {
            // Single finger on a node - allow native behavior (text selection, scrolling)
            if (e.target.closest('.node')) return;

            // Single finger on canvas - could be pan
            this.touchState.lastCenter = { x: touches[0].clientX, y: touches[0].clientY };
        }
    }

    handleTouchMove(e) {
        const touches = Array.from(e.touches);

        if (touches.length === 2 && this.touchState.isPinching) {
            // Always handle pinch-zoom, even if gesture is over a node
            e.preventDefault();

            const currentDistance = this.getTouchDistance(touches);
            const currentCenter = this.getTouchCenter(touches);

            // Pinch zoom
            const scaleFactor = currentDistance / this.touchState.lastDistance;
            const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * scaleFactor));

            if (newScale !== this.scale) {
                const rect = this.container.getBoundingClientRect();
                const pointBefore = this.clientToSvg(currentCenter.x, currentCenter.y);

                this.scale = newScale;
                this.viewBox.width = rect.width / this.scale;
                this.viewBox.height = rect.height / this.scale;

                const pointAfter = this.clientToSvg(currentCenter.x, currentCenter.y);
                this.viewBox.x += pointBefore.x - pointAfter.x;
                this.viewBox.y += pointBefore.y - pointAfter.y;
            }

            // Pan while pinching
            const dx = (currentCenter.x - this.touchState.lastCenter.x) / this.scale;
            const dy = (currentCenter.y - this.touchState.lastCenter.y) / this.scale;
            this.viewBox.x -= dx;
            this.viewBox.y -= dy;

            this.touchState.lastDistance = currentDistance;
            this.touchState.lastCenter = currentCenter;
            this.updateViewBox();

        } else if (touches.length === 1 && !this.touchState.isPinching) {
            // Single finger on a node - allow native behavior
            if (e.target.closest('.node')) return;

            // Single finger pan on canvas
            e.preventDefault();

            const dx = (touches[0].clientX - this.touchState.lastCenter.x) / this.scale;
            const dy = (touches[0].clientY - this.touchState.lastCenter.y) / this.scale;

            this.viewBox.x -= dx;
            this.viewBox.y -= dy;

            this.touchState.lastCenter = { x: touches[0].clientX, y: touches[0].clientY };
            this.updateViewBox();
        }
    }

    handleTouchEnd(e) {
        const touches = Array.from(e.touches);
        this.touchState.touches = touches.map(t => ({ x: t.clientX, y: t.clientY }));

        if (touches.length < 2) {
            this.touchState.isPinching = false;
        }
        if (touches.length === 1) {
            this.touchState.lastCenter = { x: touches[0].clientX, y: touches[0].clientY };
        }
    }

    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getTouchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    // --- Safari Gesture Event Handlers ---
    // These handle pinch-to-zoom on Safari. We always capture these gestures
    // (even on nodes) to prevent the browser's viewport zoom from activating.

    handleGestureStart(e) {
        e.preventDefault();
        this.gestureState.startScale = this.scale;
        this.gestureState.isGesturing = true;
    }

    handleGestureChange(e) {
        e.preventDefault();
        if (!this.gestureState.isGesturing) return;

        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.gestureState.startScale * e.scale));

        if (newScale !== this.scale) {
            const rect = this.container.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const pointBefore = this.clientToSvg(centerX, centerY);

            this.scale = newScale;
            this.viewBox.width = rect.width / this.scale;
            this.viewBox.height = rect.height / this.scale;

            const pointAfter = this.clientToSvg(centerX, centerY);
            this.viewBox.x += pointBefore.x - pointAfter.x;
            this.viewBox.y += pointBefore.y - pointAfter.y;

            this.updateViewBox();
        }
    }

    handleGestureEnd(e) {
        e.preventDefault();
        this.gestureState.isGesturing = false;
    }

    /**
     * Convert client coordinates to SVG coordinates
     */
    clientToSvg(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: this.viewBox.x + (clientX - rect.left) / this.scale,
            y: this.viewBox.y + (clientY - rect.top) / this.scale
        };
    }

    /**
     * Fit the viewport to show all nodes
     */
    fitToContent(padding = 50) {
        const nodes = Array.from(this.nodeElements.values());
        if (nodes.length === 0) return;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const wrapper of nodes) {
            const x = parseFloat(wrapper.getAttribute('x'));
            const y = parseFloat(wrapper.getAttribute('y'));
            const width = parseFloat(wrapper.getAttribute('width')) || 420;
            const height = parseFloat(wrapper.getAttribute('height')) || 200;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
        }

        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        const rect = this.container.getBoundingClientRect();
        const scaleX = rect.width / contentWidth;
        const scaleY = rect.height / contentHeight;
        this.scale = Math.min(scaleX, scaleY, 1);

        this.viewBox.x = minX - padding;
        this.viewBox.y = minY - padding;
        this.viewBox.width = rect.width / this.scale;
        this.viewBox.height = rect.height / this.scale;

        this.updateViewBox();
    }

    /**
     * Center on a specific position (instant)
     */
    centerOn(x, y) {
        const rect = this.container.getBoundingClientRect();
        this.viewBox.x = x - (rect.width / this.scale) / 2;
        this.viewBox.y = y - (rect.height / this.scale) / 2;
        this.updateViewBox();
    }

    /**
     * Smoothly animate to center on a specific position
     */
    centerOnAnimated(x, y, duration = 300) {
        const rect = this.container.getBoundingClientRect();
        const endX = x - (rect.width / this.scale) / 2;
        const endY = y - (rect.height / this.scale) / 2;

        const startX = this.viewBox.x;
        const startY = this.viewBox.y;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

            this.viewBox.x = startX + (endX - startX) * eased;
            this.viewBox.y = startY + (endY - startY) * eased;
            this.updateViewBox();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Pan to center a specific node in the viewport (instant)
     */
    panToNode(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const x = parseFloat(wrapper.getAttribute('x'));
        const y = parseFloat(wrapper.getAttribute('y'));
        const width = parseFloat(wrapper.getAttribute('width')) || 420;
        const height = parseFloat(wrapper.getAttribute('height')) || 200;

        // Center on the node's center point
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        this.centerOn(centerX, centerY);
    }

    /**
     * Smoothly pan to center a specific node in the viewport
     */
    panToNodeAnimated(nodeId, duration = 300) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const x = parseFloat(wrapper.getAttribute('x'));
        const y = parseFloat(wrapper.getAttribute('y'));
        const width = parseFloat(wrapper.getAttribute('width')) || 420;
        const height = parseFloat(wrapper.getAttribute('height')) || 200;

        const centerX = x + width / 2;
        const centerY = y + height / 2;

        this.centerOnAnimated(centerX, centerY, duration);
    }

    /**
     * Animate nodes to new positions with smooth transitions
     * @param {Object} graph - The graph with updated node positions
     * @param {Object} options - Animation options
     * @param {number} options.duration - Animation duration in ms (default 500)
     * @param {string|null} options.focusNodeId - Node to keep centered (null for fit-to-content)
     * @param {boolean} options.keepViewport - If true, don't change viewport at all (default false)
     */
    animateToLayout(graph, options = {}) {
        const duration = options.duration || 500;
        const focusNodeId = options.focusNodeId || null;
        const keepViewport = options.keepViewport || false;

        // Collect start and end positions for each node
        const animations = [];
        for (const node of graph.getAllNodes()) {
            const wrapper = this.nodeElements.get(node.id);
            if (!wrapper) continue;

            const startX = parseFloat(wrapper.getAttribute('x'));
            const startY = parseFloat(wrapper.getAttribute('y'));
            const endX = node.position.x;
            const endY = node.position.y;

            // Only animate if position changed
            if (startX !== endX || startY !== endY) {
                animations.push({
                    nodeId: node.id,
                    wrapper,
                    startX,
                    startY,
                    endX,
                    endY
                });
            }
        }

        if (animations.length === 0) {
            // No position changes, just update edges
            this.updateAllEdges(graph);
            if (!focusNodeId && !keepViewport) {
                this.fitToContentAnimated(duration);
            }
            return;
        }

        // Calculate viewport animation if fitting to content (and not keeping viewport)
        let viewportAnim = null;
        if (!focusNodeId && !keepViewport) {
            viewportAnim = this.calculateFitToContentViewport(graph, 50);
        }

        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (ease-out cubic)
            const eased = 1 - Math.pow(1 - progress, 3);

            // Update node positions
            for (const anim of animations) {
                const x = anim.startX + (anim.endX - anim.startX) * eased;
                const y = anim.startY + (anim.endY - anim.startY) * eased;

                anim.wrapper.setAttribute('x', x);
                anim.wrapper.setAttribute('y', y);
            }

            // Update all edges
            this.updateAllEdges(graph);

            // Animate viewport if fitting to content
            if (viewportAnim) {
                this.viewBox.x = viewportAnim.startX + (viewportAnim.endX - viewportAnim.startX) * eased;
                this.viewBox.y = viewportAnim.startY + (viewportAnim.endY - viewportAnim.startY) * eased;
                this.viewBox.width = viewportAnim.startWidth + (viewportAnim.endWidth - viewportAnim.startWidth) * eased;
                this.viewBox.height = viewportAnim.startHeight + (viewportAnim.endHeight - viewportAnim.startHeight) * eased;
                this.scale = viewportAnim.startScale + (viewportAnim.endScale - viewportAnim.startScale) * eased;
                this.updateViewBox();
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Animation complete - update hint visibility
                this.updateNoNodesHint();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Calculate the target viewport for fit-to-content
     */
    calculateFitToContentViewport(graph, padding = 50) {
        const nodes = graph.getAllNodes();
        if (nodes.length === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const node of nodes) {
            const wrapper = this.nodeElements.get(node.id);
            const width = wrapper ? parseFloat(wrapper.getAttribute('width')) || 420 : 420;
            const height = wrapper ? parseFloat(wrapper.getAttribute('height')) || 200 : 200;

            // Use the TARGET position from graph
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + width);
            maxY = Math.max(maxY, node.position.y + height);
        }

        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        const rect = this.container.getBoundingClientRect();
        const scaleX = rect.width / contentWidth;
        const scaleY = rect.height / contentHeight;
        const endScale = Math.min(scaleX, scaleY, 1);

        return {
            startX: this.viewBox.x,
            startY: this.viewBox.y,
            startWidth: this.viewBox.width,
            startHeight: this.viewBox.height,
            startScale: this.scale,
            endX: minX - padding,
            endY: minY - padding,
            endWidth: rect.width / endScale,
            endHeight: rect.height / endScale,
            endScale
        };
    }

    /**
     * Animated version of fitToContent
     */
    fitToContentAnimated(duration = 500) {
        const nodes = Array.from(this.nodeElements.values());
        if (nodes.length === 0) return;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const wrapper of nodes) {
            const x = parseFloat(wrapper.getAttribute('x'));
            const y = parseFloat(wrapper.getAttribute('y'));
            const width = parseFloat(wrapper.getAttribute('width')) || 420;
            const height = parseFloat(wrapper.getAttribute('height')) || 200;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
        }

        const padding = 50;
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        const rect = this.container.getBoundingClientRect();
        const scaleX = rect.width / contentWidth;
        const scaleY = rect.height / contentHeight;
        const endScale = Math.min(scaleX, scaleY, 1);

        const startX = this.viewBox.x;
        const startY = this.viewBox.y;
        const startWidth = this.viewBox.width;
        const startHeight = this.viewBox.height;
        const startScale = this.scale;

        const endX = minX - padding;
        const endY = minY - padding;
        const endWidth = rect.width / endScale;
        const endHeight = rect.height / endScale;

        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            this.viewBox.x = startX + (endX - startX) * eased;
            this.viewBox.y = startY + (endY - startY) * eased;
            this.viewBox.width = startWidth + (endWidth - startWidth) * eased;
            this.viewBox.height = startHeight + (endHeight - startHeight) * eased;
            this.scale = startScale + (endScale - startScale) * eased;
            this.updateViewBox();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Get the visible viewport dimensions in screen pixels
     */
    getViewportDimensions() {
        const rect = this.container.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }

    /**
     * Resize a node to fit 80% of the visible viewport
     * Makes content scrollable if it overflows
     */
    resizeNodeToViewport(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const viewport = this.getViewportDimensions();

        // Calculate 80% of viewport in canvas coordinates
        // We use screen pixels directly since we want consistent sizing regardless of zoom
        const targetWidth = Math.round(viewport.width * 0.8 / this.scale);
        const targetHeight = Math.round(viewport.height * 0.8 / this.scale);

        // Apply new dimensions
        wrapper.setAttribute('width', targetWidth);
        wrapper.setAttribute('height', targetHeight);

        // Mark node as "viewport-fitted" so CSS can apply scrolling
        const node = wrapper.querySelector('.node');
        if (node) {
            node.classList.add('viewport-fitted');
            // Set explicit height for content scrolling
            node.style.height = '100%';
        }

        // Update edges after resize
        const x = parseFloat(wrapper.getAttribute('x'));
        const y = parseFloat(wrapper.getAttribute('y'));
        this.updateEdgesForNode(nodeId, { x, y });

        // Notify callback to persist dimensions
        if (this.onNodeResize) {
            this.onNodeResize(nodeId, targetWidth, targetHeight);
        }

        // Center the node in viewport
        this.panToNodeAnimated(nodeId, 300);
    }

    /**
     * Update all edges based on current node positions in graph
     */
    updateAllEdges(graph) {
        for (const edge of graph.getAllEdges()) {
            const sourceWrapper = this.nodeElements.get(edge.source);
            const targetWrapper = this.nodeElements.get(edge.target);

            if (sourceWrapper && targetWrapper) {
                const sourcePos = {
                    x: parseFloat(sourceWrapper.getAttribute('x')),
                    y: parseFloat(sourceWrapper.getAttribute('y'))
                };
                const targetPos = {
                    x: parseFloat(targetWrapper.getAttribute('x')),
                    y: parseFloat(targetWrapper.getAttribute('y'))
                };

                this.renderEdge(edge, sourcePos, targetPos);
            }
        }
    }

    // --- Node Rendering ---

    /**
     * Render a node to the canvas
     */
    renderNode(node) {
        // Remove existing if present
        this.removeNode(node.id);

        // Wrap node with protocol class
        const wrapped = wrapNode(node);

        // Use stored dimensions or defaults
        // Matrix nodes need more width
        const isMatrix = node.type === NodeType.MATRIX;
        const width = node.width || (isMatrix ? 500 : 420);
        const minHeight = node.height || (isMatrix ? 300 : 100);

        // Create foreignObject wrapper
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        wrapper.setAttribute('class', 'node-wrapper');
        wrapper.setAttribute('x', node.position.x);
        wrapper.setAttribute('y', node.position.y);
        wrapper.setAttribute('width', width);
        wrapper.setAttribute('height', minHeight);
        wrapper.setAttribute('data-node-id', node.id);

        // Create node HTML
        const div = document.createElement('div');
        // Apply viewport-fitted class if node has explicit stored dimensions (enables scrollable content)
        const hasExplicitSize = node.width && node.height;
        div.className = `node ${node.type}${hasExplicitSize ? ' viewport-fitted' : ''}`;
        div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        div.style.width = '100%';

        // Matrix nodes need fixed height to allow shrinking; others use min-height
        // Nodes with explicit dimensions also need fixed height for scrolling
        // Note: We don't set overflow:hidden here - inner containers handle their own overflow
        // This allows tags (positioned outside the node) to remain visible
        if (isMatrix || hasExplicitSize) {
            div.style.height = '100%';
        } else {
            div.style.minHeight = '100%';
        }

        // Matrix nodes return full HTML structure from renderContent()
        if (isMatrix) {
            div.innerHTML = wrapped.renderContent(this);
        } else {
            // Get values from protocol
            const summaryText = wrapped.getSummaryText(this);
            const typeIcon = wrapped.getTypeIcon();
            const typeLabel = wrapped.getTypeLabel();
            const contentHtml = wrapped.renderContent(this);
            const actions = wrapped.getActions();
            const headerButtons = wrapped.getHeaderButtons();

            // Build action buttons HTML
            const actionsHtml = actions.map(action => {
                const actionClass = action.id === 'reply' ? 'reply-btn' :
                                  action.id === 'branch' ? 'branch-btn' :
                                  action.id === 'summarize' ? 'summarize-btn' :
                                  action.id === 'fetch-summarize' ? 'fetch-summarize-btn' :
                                  action.id === 'edit-content' ? 'edit-content-btn' :
                                  action.id === 'resummarize' ? 'resummarize-btn' :
                                  action.id === 'copy' ? 'copy-btn' : '';
                return `<button class="node-action ${actionClass}" title="${this.escapeHtml(action.title)}">${this.escapeHtml(action.label)}</button>`;
            }).join('');

            // Build header buttons HTML
            const headerButtonsHtml = headerButtons.map(btn => {
                const displayStyle = btn.hidden ? 'style="display:none;"' : '';
                return `<button class="header-btn ${btn.id}-btn" title="${this.escapeHtml(btn.title)}" ${displayStyle}>${this.escapeHtml(btn.label)}</button>`;
            }).join('');

            div.innerHTML = `
                <div class="node-summary" title="Double-click to edit title">
                    <span class="node-type-icon">${typeIcon}</span>
                    <span class="summary-text">${this.escapeHtml(summaryText)}</span>
                </div>
                <div class="node-header">
                    <div class="drag-handle" title="Drag to move">
                        <span class="grip-dot"></span><span class="grip-dot"></span>
                        <span class="grip-dot"></span><span class="grip-dot"></span>
                        <span class="grip-dot"></span><span class="grip-dot"></span>
                    </div>
                    <span class="node-type">${this.escapeHtml(typeLabel)}</span>
                    <span class="node-model">${this.escapeHtml(node.model || '')}</span>
                    ${headerButtonsHtml}
                </div>
                <div class="node-content">${contentHtml}</div>
                <div class="node-actions">
                    ${actionsHtml}
                </div>
                <div class="resize-handle resize-e" data-resize="e"></div>
                <div class="resize-handle resize-s" data-resize="s"></div>
                <div class="resize-handle resize-se" data-resize="se"></div>
            `;
        }

        // Render tags as a fundamental property of ALL nodes (regardless of type)
        // Tags are inserted as the first child so they render outside the left edge
        const tagsHtml = this.renderNodeTags(node);
        if (tagsHtml) {
            div.insertAdjacentHTML('afterbegin', tagsHtml);
        }

        wrapper.appendChild(div);
        this.nodesLayer.appendChild(wrapper);
        this.nodeElements.set(node.id, wrapper);

        // Auto-size height after render based on actual content
        // Skip auto-sizing for scrollable node types - they have fixed dimensions
        const isScrollableType = wrapped.isScrollable();
        if (!isScrollableType) {
            // Use requestAnimationFrame to ensure DOM has rendered
            requestAnimationFrame(() => {
                const contentHeight = div.offsetHeight;
                // Use the larger of: stored height, content height, or minimum height
                const finalHeight = Math.max(contentHeight + 10, node.height || 100, 100);
                wrapper.setAttribute('height', finalHeight);
            });
        }

        // Setup node event listeners
        this.setupNodeEvents(wrapper, node);

        return wrapper;
    }

    /**
     * Setup event listeners for a node
     */
    setupNodeEvents(wrapper, node) {
        const div = wrapper.querySelector('.node');

        // Click to select
        div.addEventListener('click', (e) => {
            if (e.target.closest('.node-action')) return;
            if (e.target.closest('.resize-handle')) return;

            if (e.ctrlKey || e.metaKey) {
                // Multi-select toggle
                if (this.selectedNodes.has(node.id)) {
                    this.deselectNode(node.id);
                } else {
                    this.selectNode(node.id, true);
                }
            } else {
                // Single select
                this.clearSelection();
                this.selectNode(node.id, false);
            }
        });

        // Drag to move - only via drag handle
        const dragHandle = div.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();

                this.isDraggingNode = true;
                this.draggedNode = node;

                // Store starting position for undo
                this.dragStartPos = { ...node.position };

                const point = this.clientToSvg(e.clientX, e.clientY);
                this.dragOffset = {
                    x: point.x - node.position.x,
                    y: point.y - node.position.y
                };

                div.classList.add('dragging');
            });
        }

        // When zoomed out, allow dragging from anywhere on the node
        div.addEventListener('mousedown', (e) => {
            // Only activate when zoomed out (summary or mini view)
            if (this.scale > 0.6) return;

            // Don't interfere with buttons or resize handles
            if (e.target.closest('button') || e.target.closest('.resize-handle')) return;

            e.stopPropagation();
            e.preventDefault();

            this.isDraggingNode = true;
            this.draggedNode = node;

            // Store starting position for undo
            this.dragStartPos = { ...node.position };

            const point = this.clientToSvg(e.clientX, e.clientY);
            this.dragOffset = {
                x: point.x - node.position.x,
                y: point.y - node.position.y
            };

            div.classList.add('dragging');
        });

        // Resize handles
        const resizeHandles = div.querySelectorAll('.resize-handle');
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();

                const resizeType = handle.dataset.resize;
                const startX = e.clientX;
                const startY = e.clientY;
                const startWidth = parseFloat(wrapper.getAttribute('width'));
                const startHeight = parseFloat(wrapper.getAttribute('height'));

                const onMouseMove = (moveEvent) => {
                    const dx = (moveEvent.clientX - startX) / this.scale;
                    const dy = (moveEvent.clientY - startY) / this.scale;

                    let newWidth = startWidth;
                    let newHeight = startHeight;

                    if (resizeType.includes('e')) {
                        newWidth = Math.max(200, startWidth + dx);
                    }

                    wrapper.setAttribute('width', newWidth);

                    const isMatrixNode = div.classList.contains('matrix');

                    if (resizeType.includes('s')) {
                        // Allow height to shrink freely (just usability minimum)
                        // Mark as viewport-fitted so content scrolls when needed
                        newHeight = Math.max(100, startHeight + dy);
                        wrapper.setAttribute('height', newHeight);
                        div.classList.add('viewport-fitted');
                        div.style.height = '100%';
                    } else if (resizeType === 'e' && !isMatrixNode) {
                        // If only resizing width (east), keep height the same
                        // Content will wrap, and if it overflows, scrollbar will appear
                        // Mark as viewport-fitted so content scrolls when needed
                        div.classList.add('viewport-fitted');
                        div.style.height = '100%';
                        // Height stays at startHeight (already set above)
                    }
                    // If just resizing east on a matrix, don't change height at all

                    // Update edges
                    this.updateEdgesForNode(node.id, node.position);
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    // Save new dimensions
                    const finalWidth = parseFloat(wrapper.getAttribute('width'));
                    const finalHeight = parseFloat(wrapper.getAttribute('height'));

                    if (this.onNodeResize) {
                        this.onNodeResize(node.id, finalWidth, finalHeight);
                    }
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });

        // Action buttons
        const replyBtn = div.querySelector('.reply-btn');
        const summarizeBtn = div.querySelector('.summarize-btn');
        const fetchSummarizeBtn = div.querySelector('.fetch-summarize-btn');
        const deleteBtn = div.querySelector('.delete-btn');

        if (replyBtn) {
            replyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeReply) this.onNodeReply(node.id);
            });
        }

        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeSummarize) this.onNodeSummarize(node.id);
            });
        }

        if (fetchSummarizeBtn) {
            fetchSummarizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeFetchSummarize) this.onNodeFetchSummarize(node.id);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeDelete) this.onNodeDelete(node.id);
            });
        }

        // Copy button - use callback if available, otherwise use protocol directly
        const copyBtn = div.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (this.onNodeCopy) {
                    // Use app callback (handles matrix formatting)
                    await this.onNodeCopy(node.id);
                } else {
                    // Fallback: use protocol directly, providing a minimal app for matrix formatting
                    try {
                        const wrapped = wrapNode(node);
                        const fallbackApp = {
                            // Generic matrix formatting to avoid errors when app is not available
                            formatMatrixAsText(matrix) {
                                try {
                                    const { context, rowItems, colItems, cells } = matrix;
                                    let text = `## ${context}\n\n| |`;
                                    for (const colItem of colItems) {
                                        text += ` ${colItem} |`;
                                    }
                                    text += '\n|---|';
                                    for (let c = 0; c < colItems.length; c++) {
                                        text += '---|';
                                    }
                                    text += '\n';
                                    for (let r = 0; r < rowItems.length; r++) {
                                        text += `| ${rowItems[r]} |`;
                                        for (let c = 0; c < colItems.length; c++) {
                                            const cellKey = `${r}-${c}`;
                                            const cell = cells[cellKey];
                                            const content = cell && cell.content ? cell.content.replace(/\n/g, ' ').replace(/\|/g, '\\|') : '';
                                            text += ` ${content} |`;
                                        }
                                        text += '\n';
                                    }
                                    return text;
                                } catch (e) {
                                    return JSON.stringify(matrix);
                                }
                            },
                        };
                        await wrapped.copyToClipboard(this, fallbackApp);
                    } catch (err) {
                        console.error('Failed to copy:', err);
                    }
                }
            });
        }

        // Edit content button (FETCH_RESULT nodes)
        const editContentBtn = div.querySelector('.edit-content-btn');
        if (editContentBtn) {
            editContentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeEditContent) this.onNodeEditContent(node.id);
            });
        }

        // Re-summarize button (FETCH_RESULT nodes)
        const resummarizeBtn = div.querySelector('.resummarize-btn');
        if (resummarizeBtn) {
            resummarizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeResummarize) this.onNodeResummarize(node.id);
            });
        }

        // Stop generation button (AI nodes only)
        const stopBtn = div.querySelector('.stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeStopGeneration) this.onNodeStopGeneration(node.id);
            });
        }

        // Continue generation button (AI nodes only)
        const continueBtn = div.querySelector('.continue-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeContinueGeneration) this.onNodeContinueGeneration(node.id);
            });
        }

        // Fit to viewport button
        const fitViewportBtn = div.querySelector('.fit-viewport-btn');
        if (fitViewportBtn) {
            fitViewportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeFitToViewport) this.onNodeFitToViewport(node.id);
            });
        }

        // Reset size button
        const resetSizeBtn = div.querySelector('.reset-size-btn');
        if (resetSizeBtn) {
            resetSizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeResetSize) this.onNodeResetSize(node.id);
            });
        }

        // Navigation buttons - parent
        const navParentBtn = div.querySelector('.nav-parent-btn');
        if (navParentBtn) {
            navParentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNavParentClick) {
                    this.onNavParentClick(node.id, navParentBtn);
                }
            });
        }

        // Navigation buttons - child
        const navChildBtn = div.querySelector('.nav-child-btn');
        if (navChildBtn) {
            navChildBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNavChildClick) {
                    this.onNavChildClick(node.id, navChildBtn);
                }
            });
        }

        // Matrix-specific event handlers
        if (node.type === NodeType.MATRIX) {
            // Cell click handlers (for filling or viewing)
            const cells = div.querySelectorAll('.matrix-cell');
            cells.forEach(cell => {
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = parseInt(cell.dataset.row);
                    const col = parseInt(cell.dataset.col);

                    if (cell.classList.contains('filled')) {
                        // View filled cell
                        if (this.onMatrixCellView) {
                            this.onMatrixCellView(node.id, row, col);
                        }
                    } else {
                        // Fill empty cell
                        if (this.onMatrixCellFill) {
                            this.onMatrixCellFill(node.id, row, col);
                        }
                    }
                });
            });

            // Edit button
            const editBtn = div.querySelector('.matrix-edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onMatrixEdit) {
                        this.onMatrixEdit(node.id);
                    }
                });
            }

            // Fill all button
            const fillAllBtn = div.querySelector('.matrix-fill-all-btn');
            if (fillAllBtn) {
                fillAllBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onMatrixFillAll) {
                        this.onMatrixFillAll(node.id);
                    }
                });
            }

            // Copy context button
            const copyContextBtn = div.querySelector('.matrix-context-copy');
            if (copyContextBtn) {
                copyContextBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        await navigator.clipboard.writeText(node.context);
                        const originalText = copyContextBtn.textContent;
                        copyContextBtn.textContent = '✓';
                        setTimeout(() => {
                            copyContextBtn.textContent = originalText;
                        }, 1500);
                    } catch (err) {
                        console.error('Failed to copy:', err);
                    }
                });
            }

            // Row header click handlers (to extract row as node)
            const rowHeaders = div.querySelectorAll('.row-header[data-row]');
            rowHeaders.forEach(header => {
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = parseInt(header.dataset.row);
                    if (this.onMatrixRowExtract) {
                        this.onMatrixRowExtract(node.id, row);
                    }
                });
            });

            // Column header click handlers (to extract column as node)
            const colHeaders = div.querySelectorAll('.col-header[data-col]');
            colHeaders.forEach(header => {
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const col = parseInt(header.dataset.col);
                    if (this.onMatrixColExtract) {
                        this.onMatrixColExtract(node.id, col);
                    }
                });
            });
        }

        // Track user scroll to pause auto-scroll during streaming
        // If user scrolls up (not at bottom), we stop auto-scrolling
        const contentEl = div.querySelector('.node-content');
        if (contentEl) {
            contentEl.addEventListener('scroll', () => {
                // Check if user has scrolled away from bottom
                const isAtBottom = contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight < 50;
                if (!isAtBottom) {
                    this.userScrolledNodes.add(node.id);
                } else {
                    // If user scrolled back to bottom, re-enable auto-scroll
                    this.userScrolledNodes.delete(node.id);
                }
            });
        }

        // Double-click on summary to edit title
        const nodeSummary = div.querySelector('.node-summary');
        if (nodeSummary) {
            nodeSummary.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (this.onNodeTitleEdit) {
                    this.onNodeTitleEdit(node.id);
                }
            });
        }

        // Click on images in node content (for asking about or extracting images)
        // Only for node types that can contain rich markdown/HTML with images
        const nodeContentEl = div.querySelector('.node-content');
        if (nodeContentEl && this.isRichContentNodeType(node.type)) {
            nodeContentEl.addEventListener('click', (e) => {
                const clickedImg = e.target.closest('img');
                if (clickedImg) {
                    e.stopPropagation();
                    // Get image src and position for tooltip
                    const imgSrc = clickedImg.src;
                    const rect = clickedImg.getBoundingClientRect();

                    // Store node ID and show tooltip
                    this.pendingImageNodeId = node.id;
                    this.showImageTooltip(imgSrc, {
                        x: rect.left + rect.width / 2,
                        y: rect.top
                    });
                }
            });
        }
    }

    /**
     * Update node content (for streaming)
     */
    updateNodeContent(nodeId, content, isStreaming = false) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const contentEl = wrapper.querySelector('.node-content');
        if (contentEl) {
            // During streaming, use plain text for performance
            // After streaming completes, render markdown
            if (isStreaming) {
                contentEl.textContent = content;
                contentEl.classList.add('streaming');

                // Auto-scroll to bottom during streaming (unless user manually scrolled up)
                if (!this.userScrolledNodes.has(nodeId)) {
                    contentEl.scrollTop = contentEl.scrollHeight;
                }
            } else {
                contentEl.innerHTML = this.renderMarkdown(content);
                contentEl.classList.remove('streaming');

                // Streaming complete: snap to top and clear scroll tracking
                contentEl.scrollTop = 0;
                this.userScrolledNodes.delete(nodeId);
            }
        }

        // Update the summary text (shown when zoomed out)
        // Only update when not streaming, to avoid flickering
        if (!isStreaming) {
            const summaryTextEl = wrapper.querySelector('.node-summary .summary-text');
            if (summaryTextEl) {
                // Strip markdown and truncate for summary display
                const plainText = (content || '').replace(/[#*_`>\[\]()!]/g, '').trim();
                summaryTextEl.textContent = this.truncate(plainText, 60);
            }
        }

        // Update height - but skip for scrollable node types which have fixed dimensions
        const div = wrapper.querySelector('.node');
        if (div && !div.classList.contains('viewport-fitted')) {
            wrapper.setAttribute('height', div.offsetHeight + 10);
        }
    }

    /**
     * Update a matrix cell (for streaming cell fills)
     */
    updateMatrixCell(nodeId, row, col, content, isStreaming = false) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const cell = wrapper.querySelector(`.matrix-cell[data-row="${row}"][data-col="${col}"]`);
        if (!cell) return;

        if (isStreaming) {
            cell.classList.add('loading');
            cell.classList.remove('empty');
            cell.classList.add('filled');
            cell.innerHTML = `<div class="matrix-cell-content">${this.escapeHtml(content)}</div>`;
        } else {
            cell.classList.remove('loading');
            cell.classList.add('filled');
            cell.classList.remove('empty');
            cell.innerHTML = `<div class="matrix-cell-content">${this.escapeHtml(content)}</div>`;
        }
    }

    /**
     * Highlight a specific cell in a matrix node
     */
    highlightMatrixCell(matrixNodeId, row, col) {
        const wrapper = this.nodeElements.get(matrixNodeId);
        if (!wrapper) return;

        const cell = wrapper.querySelector(`.matrix-cell[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.add('highlighted');
        }
    }

    /**
     * Clear all matrix cell highlights
     */
    clearMatrixCellHighlights() {
        const highlightedCells = this.nodesLayer.querySelectorAll('.matrix-cell.highlighted');
        highlightedCells.forEach(cell => cell.classList.remove('highlighted'));
    }

    /**
     * Highlight specific text within a node's content
     * @param {string} nodeId - The node to highlight text in
     * @param {string} text - The text to highlight
     */
    highlightTextInNode(nodeId, text) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper || !text) return;

        const contentEl = wrapper.querySelector('.node-content');
        if (!contentEl) return;

        // Store original HTML if not already stored
        if (!contentEl.dataset.originalHtml) {
            contentEl.dataset.originalHtml = contentEl.innerHTML;
        }

        // Get the text content and find the match
        const originalHtml = contentEl.dataset.originalHtml;

        // Create a case-insensitive regex to find the text
        // Escape special regex characters in the search text
        const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedText})`, 'gi');

        // Replace matching text with highlighted version
        // We need to be careful not to break HTML tags
        const highlightedHtml = this.highlightTextInHtml(originalHtml, text);
        contentEl.innerHTML = highlightedHtml;

        // Scroll the highlight into view within the node if needed
        const mark = contentEl.querySelector('.source-highlight');
        if (mark) {
            mark.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    /**
     * Helper to highlight text within HTML without breaking tags.
     * Handles text that spans across multiple HTML elements (e.g., across <strong> boundaries).
     * @param {string} html - Original HTML content
     * @param {string} text - Text to highlight
     * @returns {string} HTML with highlighted text
     */
    highlightTextInHtml(html, text) {
        if (!text || !html) return html;

        // Create a temporary element to parse the HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Use TreeWalker to collect all text nodes
        const walker = document.createTreeWalker(temp, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        if (textNodes.length === 0) return html;

        // Combine all text and find the match position
        const fullText = textNodes.map(n => n.textContent).join('');
        const lowerFull = fullText.toLowerCase();
        const lowerSearch = text.toLowerCase();
        const matchStart = lowerFull.indexOf(lowerSearch);

        if (matchStart === -1) return html;

        const matchEnd = matchStart + text.length;

        // Walk through text nodes and wrap the matching portions
        let currentPos = 0;
        const nodesToProcess = [];

        for (const textNode of textNodes) {
            const nodeStart = currentPos;
            const nodeEnd = currentPos + textNode.textContent.length;

            // Check if this node overlaps with the match
            if (nodeEnd > matchStart && nodeStart < matchEnd) {
                // Calculate overlap within this node
                const overlapStart = Math.max(0, matchStart - nodeStart);
                const overlapEnd = Math.min(textNode.textContent.length, matchEnd - nodeStart);

                nodesToProcess.push({
                    node: textNode,
                    overlapStart,
                    overlapEnd
                });
            }

            currentPos = nodeEnd;
        }

        // Process nodes in reverse order to avoid invalidating positions
        for (let i = nodesToProcess.length - 1; i >= 0; i--) {
            const { node: textNode, overlapStart, overlapEnd } = nodesToProcess[i];
            const content = textNode.textContent;

            const before = content.slice(0, overlapStart);
            const match = content.slice(overlapStart, overlapEnd);
            const after = content.slice(overlapEnd);

            const fragment = document.createDocumentFragment();

            if (before) {
                fragment.appendChild(document.createTextNode(before));
            }

            const mark = document.createElement('mark');
            mark.className = 'source-highlight';
            mark.textContent = match;
            fragment.appendChild(mark);

            if (after) {
                fragment.appendChild(document.createTextNode(after));
            }

            textNode.parentNode.replaceChild(fragment, textNode);
        }

        return temp.innerHTML;
    }

    /**
     * Clear all source text highlights from nodes
     */
    clearSourceTextHighlights() {
        // Find all nodes with stored original HTML and restore them
        const wrappers = this.nodesLayer.querySelectorAll('.node-wrapper');
        for (const wrapper of wrappers) {
            const contentEl = wrapper.querySelector('.node-content');
            if (contentEl && contentEl.dataset.originalHtml) {
                contentEl.innerHTML = contentEl.dataset.originalHtml;
                delete contentEl.dataset.originalHtml;
            }
        }
    }

    /**
     * Show the stop button on a node (during streaming).
     * The button is in the node header next to the delete button so it doesn't
     * move as content streams in - important for parallel generations where
     * each node needs its own accessible stop control.
     */
    showStopButton(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const stopBtn = wrapper.querySelector('.stop-btn');
        const continueBtn = wrapper.querySelector('.continue-btn');

        if (stopBtn) stopBtn.style.display = 'inline-flex';
        if (continueBtn) continueBtn.style.display = 'none';
    }

    /**
     * Hide the stop button on a node (when streaming completes)
     */
    hideStopButton(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const stopBtn = wrapper.querySelector('.stop-btn');
        if (stopBtn) stopBtn.style.display = 'none';
    }

    /**
     * Show the continue button on a node (after stopping).
     * Allows resuming generation for this specific node.
     */
    showContinueButton(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const stopBtn = wrapper.querySelector('.stop-btn');
        const continueBtn = wrapper.querySelector('.continue-btn');

        if (stopBtn) stopBtn.style.display = 'none';
        if (continueBtn) continueBtn.style.display = 'inline-flex';
    }

    /**
     * Hide the continue button on a node
     */
    hideContinueButton(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const continueBtn = wrapper.querySelector('.continue-btn');
        if (continueBtn) continueBtn.style.display = 'none';
    }

    /**
     * Show an error state on a node with retry/dismiss buttons
     */
    showNodeError(nodeId, errorInfo) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const contentEl = wrapper.querySelector('.node-content');
        const div = wrapper.querySelector('.node');

        if (contentEl) {
            const errorHtml = `
                <div class="error-content">
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">${this.escapeHtml(errorInfo.title)}</div>
                    <div class="error-description">${this.escapeHtml(errorInfo.description)}</div>
                    <div class="error-actions">
                        ${errorInfo.canRetry ? '<button class="error-retry-btn">🔄 Retry</button>' : ''}
                        <button class="error-dismiss-btn">✕ Dismiss</button>
                    </div>
                </div>
            `;
            contentEl.innerHTML = errorHtml;

            // Add error class to node
            if (div) div.classList.add('error-node');

            // Setup button handlers
            const retryBtn = contentEl.querySelector('.error-retry-btn');
            const dismissBtn = contentEl.querySelector('.error-dismiss-btn');

            if (retryBtn) {
                retryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onNodeRetry) this.onNodeRetry(nodeId);
                });
            }

            if (dismissBtn) {
                dismissBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onNodeDismissError) this.onNodeDismissError(nodeId);
                });
            }
        }
    }

    /**
     * Clear error state on a node
     */
    clearNodeError(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const div = wrapper.querySelector('.node');
        if (div) div.classList.remove('error-node');
    }

    /**
     * Show brief copy feedback on a node
     */
    showCopyFeedback(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const div = wrapper.querySelector('.node');
        if (div) {
            div.classList.add('copy-flash');
            setTimeout(() => {
                div.classList.remove('copy-flash');
            }, 300);
        }
    }

    /**
     * Remove a node from the canvas
     */
    removeNode(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (wrapper) {
            wrapper.remove();
            this.nodeElements.delete(nodeId);
        }
        this.selectedNodes.delete(nodeId);
    }

    /**
     * Select a node
     */
    selectNode(nodeId, isMulti = false) {
        if (!isMulti) {
            this.clearSelection();
        }

        this.selectedNodes.add(nodeId);
        const wrapper = this.nodeElements.get(nodeId);
        if (wrapper) {
            wrapper.querySelector('.node')?.classList.add('selected');
            wrapper.querySelector('.node')?.classList.remove('faded');
        }

        this.updateFadedState();

        if (this.onNodeSelect) {
            this.onNodeSelect(Array.from(this.selectedNodes));
        }
    }

    /**
     * Deselect a node
     */
    deselectNode(nodeId) {
        this.selectedNodes.delete(nodeId);
        const wrapper = this.nodeElements.get(nodeId);
        if (wrapper) {
            wrapper.querySelector('.node')?.classList.remove('selected');
        }

        this.updateFadedState();

        if (this.onNodeDeselect) {
            this.onNodeDeselect(Array.from(this.selectedNodes));
        }
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        for (const nodeId of this.selectedNodes) {
            const wrapper = this.nodeElements.get(nodeId);
            if (wrapper) {
                wrapper.querySelector('.node')?.classList.remove('selected');
            }
        }
        this.selectedNodes.clear();

        this.updateFadedState();

        if (this.onNodeDeselect) {
            this.onNodeDeselect([]);
        }
    }

    /**
     * Update faded state for all nodes based on selection
     */
    updateFadedState() {
        const hasSelection = this.selectedNodes.size > 0;

        for (const [nodeId, wrapper] of this.nodeElements) {
            const node = wrapper.querySelector('.node');
            if (!node) continue;

            if (hasSelection && !this.selectedNodes.has(nodeId)) {
                node.classList.add('faded');
            } else {
                node.classList.remove('faded');
            }
        }
    }

    /**
     * Get selected node IDs
     */
    getSelectedNodeIds() {
        return Array.from(this.selectedNodes);
    }

    /**
     * Get actual rendered dimensions for all nodes
     * Returns Map of nodeId -> { width, height }
     */
    getNodeDimensions() {
        const dimensions = new Map();
        const TAG_WIDTH = 100; // Approximate width of tag labels on the left

        for (const [nodeId, wrapper] of this.nodeElements) {
            const width = parseFloat(wrapper.getAttribute('width')) || 420;
            const height = parseFloat(wrapper.getAttribute('height')) || 200;

            // Check if node has tags - if so, add tag width to bounding box
            const tagsEl = wrapper.querySelector('.node-tags');
            const tagCount = tagsEl ? tagsEl.querySelectorAll('.node-tag').length : 0;
            const effectiveWidth = tagCount > 0 ? width + TAG_WIDTH : width;

            dimensions.set(nodeId, { width: effectiveWidth, height });
        }

        return dimensions;
    }

    /**
     * Highlight context ancestors
     */
    highlightContext(ancestorIds) {
        // Clear previous highlights
        for (const wrapper of this.nodeElements.values()) {
            wrapper.querySelector('.node')?.classList.remove('context-ancestor');
        }
        for (const edge of this.edgeElements.values()) {
            edge.classList.remove('context-highlight');
        }

        // Apply new highlights
        for (const nodeId of ancestorIds) {
            const wrapper = this.nodeElements.get(nodeId);
            if (wrapper && !this.selectedNodes.has(nodeId)) {
                wrapper.querySelector('.node')?.classList.add('context-ancestor');
            }
        }
    }

    // --- Edge Rendering ---

    /**
     * Render an edge as a bezier curve
     */
    renderEdge(edge, sourcePos, targetPos) {
        // Remove existing
        this.removeEdge(edge.id);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', `edge ${edge.type}`);
        path.setAttribute('data-edge-id', edge.id);
        path.setAttribute('data-source', edge.source);
        path.setAttribute('data-target', edge.target);

        // Get node dimensions from DOM
        const sourceWrapper = this.nodeElements.get(edge.source);
        const targetWrapper = this.nodeElements.get(edge.target);

        const sourceWidth = sourceWrapper ? parseFloat(sourceWrapper.getAttribute('width')) || 420 : 420;
        const sourceHeight = sourceWrapper ? parseFloat(sourceWrapper.getAttribute('height')) || 100 : 100;
        const targetWidth = targetWrapper ? parseFloat(targetWrapper.getAttribute('width')) || 420 : 420;
        const targetHeight = targetWrapper ? parseFloat(targetWrapper.getAttribute('height')) || 100 : 100;

        // Calculate bezier curve with dynamic connection points
        const d = this.calculateBezierPath(
            sourcePos, { width: sourceWidth, height: sourceHeight },
            targetPos, { width: targetWidth, height: targetHeight }
        );
        path.setAttribute('d', d);

        // Add arrowhead
        const isCell = edge.type === 'matrix-cell';
        path.setAttribute('marker-end', isCell ? 'url(#arrowhead-cell)' : 'url(#arrowhead)');

        this.edgesLayer.appendChild(path);
        this.edgeElements.set(edge.id, path);

        return path;
    }

    /**
     * Calculate the best connection point on a node's border
     * Returns {x, y, side} where side is 'top', 'bottom', 'left', 'right'
     */
    getConnectionPoint(nodePos, nodeSize, otherCenter) {
        const center = {
            x: nodePos.x + nodeSize.width / 2,
            y: nodePos.y + nodeSize.height / 2
        };

        // Calculate angle from this node's center to the other node's center
        const dx = otherCenter.x - center.x;
        const dy = otherCenter.y - center.y;
        const angle = Math.atan2(dy, dx);

        // Determine which side to connect based on angle
        // Right: -45° to 45°, Bottom: 45° to 135°, Left: 135° to -135°, Top: -135° to -45°
        const PI = Math.PI;
        let side, x, y;

        if (angle >= -PI/4 && angle < PI/4) {
            // Right side
            side = 'right';
            x = nodePos.x + nodeSize.width;
            y = center.y;
        } else if (angle >= PI/4 && angle < 3*PI/4) {
            // Bottom side
            side = 'bottom';
            x = center.x;
            y = nodePos.y + nodeSize.height;
        } else if (angle >= -3*PI/4 && angle < -PI/4) {
            // Top side
            side = 'top';
            x = center.x;
            y = nodePos.y;
        } else {
            // Left side
            side = 'left';
            x = nodePos.x;
            y = center.y;
        }

        return { x, y, side };
    }

    /**
     * Calculate bezier curve path between two nodes with dynamic connection points
     */
    calculateBezierPath(sourcePos, sourceSize, targetPos, targetSize) {
        // Calculate centers
        const sourceCenter = {
            x: sourcePos.x + sourceSize.width / 2,
            y: sourcePos.y + sourceSize.height / 2
        };
        const targetCenter = {
            x: targetPos.x + targetSize.width / 2,
            y: targetPos.y + targetSize.height / 2
        };

        // Get optimal connection points
        const sourcePoint = this.getConnectionPoint(sourcePos, sourceSize, targetCenter);
        const targetPoint = this.getConnectionPoint(targetPos, targetSize, sourceCenter);

        // Calculate control points based on which sides are connected
        const distance = Math.sqrt(
            Math.pow(targetPoint.x - sourcePoint.x, 2) +
            Math.pow(targetPoint.y - sourcePoint.y, 2)
        );
        const controlOffset = Math.min(distance * 0.4, 150);

        let cp1x, cp1y, cp2x, cp2y;

        // Control point direction based on exit/entry side
        switch (sourcePoint.side) {
            case 'right':  cp1x = sourcePoint.x + controlOffset; cp1y = sourcePoint.y; break;
            case 'left':   cp1x = sourcePoint.x - controlOffset; cp1y = sourcePoint.y; break;
            case 'top':    cp1x = sourcePoint.x; cp1y = sourcePoint.y - controlOffset; break;
            case 'bottom': cp1x = sourcePoint.x; cp1y = sourcePoint.y + controlOffset; break;
        }

        switch (targetPoint.side) {
            case 'right':  cp2x = targetPoint.x + controlOffset; cp2y = targetPoint.y; break;
            case 'left':   cp2x = targetPoint.x - controlOffset; cp2y = targetPoint.y; break;
            case 'top':    cp2x = targetPoint.x; cp2y = targetPoint.y - controlOffset; break;
            case 'bottom': cp2x = targetPoint.x; cp2y = targetPoint.y + controlOffset; break;
        }

        return `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetPoint.x} ${targetPoint.y}`;
    }

    /**
     * Update edge positions when a node moves
     */
    updateEdgesForNode(nodeId, newPos) {
        for (const [edgeId, path] of this.edgeElements) {
            const sourceId = path.getAttribute('data-source');
            const targetId = path.getAttribute('data-target');

            if (sourceId === nodeId || targetId === nodeId) {
                // Get wrappers for dimensions
                const sourceWrapper = this.nodeElements.get(sourceId);
                const targetWrapper = this.nodeElements.get(targetId);

                if (sourceWrapper && targetWrapper) {
                    const sourcePos = {
                        x: parseFloat(sourceWrapper.getAttribute('x')),
                        y: parseFloat(sourceWrapper.getAttribute('y'))
                    };
                    const targetPos = {
                        x: parseFloat(targetWrapper.getAttribute('x')),
                        y: parseFloat(targetWrapper.getAttribute('y'))
                    };
                    const sourceSize = {
                        width: parseFloat(sourceWrapper.getAttribute('width')) || 420,
                        height: parseFloat(sourceWrapper.getAttribute('height')) || 100
                    };
                    const targetSize = {
                        width: parseFloat(targetWrapper.getAttribute('width')) || 420,
                        height: parseFloat(targetWrapper.getAttribute('height')) || 100
                    };

                    // Update if this is the moved node
                    if (sourceId === nodeId) {
                        sourcePos.x = newPos.x;
                        sourcePos.y = newPos.y;
                    }
                    if (targetId === nodeId) {
                        targetPos.x = newPos.x;
                        targetPos.y = newPos.y;
                    }

                    const d = this.calculateBezierPath(sourcePos, sourceSize, targetPos, targetSize);
                    path.setAttribute('d', d);
                }
            }
        }
    }

    /**
     * Remove an edge from the canvas
     */
    removeEdge(edgeId) {
        const path = this.edgeElements.get(edgeId);
        if (path) {
            path.remove();
            this.edgeElements.delete(edgeId);
        }
    }

    // --- Utilities ---

    getNodeTypeLabel(type) {
        // Use cached value if available
        if (this.nodeTypeLabelCache.has(type)) {
            return this.nodeTypeLabelCache.get(type);
        }
        // Use protocol pattern for consistency
        const mockNode = { type, content: '' };
        const wrapped = wrapNode(mockNode);
        const label = wrapped.getTypeLabel();
        this.nodeTypeLabelCache.set(type, label);
        return label;
    }

    getNodeTypeIcon(type) {
        // Use cached value if available
        if (this.nodeTypeIconCache.has(type)) {
            return this.nodeTypeIconCache.get(type);
        }
        // Use protocol pattern for consistency
        const mockNode = { type, content: '' };
        const wrapped = wrapNode(mockNode);
        const icon = wrapped.getTypeIcon();
        this.nodeTypeIconCache.set(type, icon);
        return icon;
    }

    /**
     * Check if a node type can contain rich content (markdown with images)
     * Used to determine if image click handlers should be attached
     */
    isRichContentNodeType(type) {
        const richTypes = [
            NodeType.FETCH_RESULT,
            NodeType.PDF,
            NodeType.NOTE,
            NodeType.AI,
            NodeType.RESEARCH,
            NodeType.REFERENCE
        ];
        return richTypes.includes(type);
    }

    getNodeSummaryText(node) {
        // Use protocol pattern
        const wrapped = wrapNode(node);
        return wrapped.getSummaryText(this);
    }

    escapeHtml(text) {
        return escapeHtmlText(text);
    }

    truncate(text, maxLength) {
        return truncateText(text, maxLength);
    }

    /**
     * Copy an image to the clipboard.
     * Converts base64 image data to a PNG blob and writes to clipboard.
     *
     * @param {string} imageData - Base64 encoded image data (without data URL prefix)
     * @param {string} mimeType - MIME type of the image (e.g., 'image/png', 'image/jpeg')
     */
    async copyImageToClipboard(imageData, mimeType) {
        // Convert base64 to blob
        const byteCharacters = atob(imageData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        // Clipboard API only supports PNG for images
        // If the source is not PNG, we need to convert it
        if (mimeType === 'image/png') {
            const blob = new Blob([byteArray], { type: 'image/png' });
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
        } else {
            // Convert to PNG using canvas
            const blob = new Blob([byteArray], { type: mimeType || 'image/png' });
            const imageBitmap = await createImageBitmap(blob);

            const canvas = document.createElement('canvas');
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);

            const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': pngBlob })
            ]);
        }
    }

    /**
     * Render tags for a node (left side, post-it style with arrows)
     */
    renderNodeTags(node) {
        if (!node.tags || node.tags.length === 0) {
            return '';
        }

        // Get tag definitions from the graph (accessed via app.graph)
        const graph = window.app?.graph;
        if (!graph) return '';

        const tagsHtml = node.tags.map(color => {
            const tag = graph.getTag(color);
            if (!tag) return '';
            return `<div class="node-tag" data-color="${color}">${this.escapeHtml(tag.name)}</div>`;
        }).filter(h => h).join('');

        if (!tagsHtml) return '';

        return `<div class="node-tags">${tagsHtml}</div>`;
    }


    /**
     * Configure marked.js with KaTeX and other extensions (called once)
     */
    static configureMarked() {
        if (Canvas.markedConfigured) {
            console.log('[Canvas] marked already configured, skipping');
            return;
        }

        if (typeof marked === 'undefined') {
            console.warn('[Canvas] marked.js not available yet');
            return;
        }

        console.log('[Canvas] Configuring marked.js...');
        console.log('[Canvas] marked available:', typeof marked !== 'undefined');
        console.log('[Canvas] markedKatex available:', typeof markedKatex !== 'undefined');
        console.log('[Canvas] katex available:', typeof katex !== 'undefined');

        try {
            // Configure KaTeX extension first (if available)
            if (typeof markedKatex !== 'undefined') {
                console.log('[Canvas] Configuring KaTeX extension...');
                marked.use(markedKatex({
                    throwOnError: false,
                    nonStandard: true  // Enables \(...\) and \[...\] delimiters
                }));
                console.log('[Canvas] KaTeX extension configured');
            } else {
                console.warn('[Canvas] markedKatex not available - math rendering will not work');
            }

            // Configure marked with custom link renderer and other options
            marked.use({
                breaks: true,   // Convert \n to <br> within paragraphs
                gfm: true,      // GitHub Flavored Markdown
                renderer: {
                    link({ href, title, text }) {
                        const titleAttr = title ? ` title="${title}"` : '';
                        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
                    }
                }
            });

            Canvas.markedConfigured = true;
            console.log('[Canvas] marked.js configuration complete');
        } catch (e) {
            console.error('[Canvas] Error configuring marked:', e);
        }
    }

    /**
     * Render markdown to HTML with math support
     */
    renderMarkdown(text) {
        if (!text) return '';

        // Ensure marked is configured (only happens once)
        Canvas.configureMarked();

        // Check if marked is available
        if (typeof marked !== 'undefined') {
            try {
                // Extract and render math BEFORE markdown processing
                // This avoids marked's backslash escaping breaking math delimiters
                const mathBlocks = [];
                let processedText = text;

                // Extract \[...\] display math
                processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
                    const placeholder = `<!--KATEX_DISPLAY_${mathBlocks.length}-->`;
                    mathBlocks.push({ type: 'display', content: content });
                    return placeholder;
                });

                // Extract \(...\) inline math
                processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
                    const placeholder = `<!--KATEX_INLINE_${mathBlocks.length}-->`;
                    mathBlocks.push({ type: 'inline', content: content });
                    return placeholder;
                });

                // Extract $$...$$ display math
                processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
                    const placeholder = `<!--KATEX_DISPLAY_${mathBlocks.length}-->`;
                    mathBlocks.push({ type: 'display', content: content });
                    return placeholder;
                });

                // Parse markdown (placeholders pass through as HTML comments)
                let result = marked.parse(processedText);

                // Render math with KaTeX and replace placeholders
                if (typeof katex !== 'undefined' && mathBlocks.length > 0) {
                    for (let i = 0; i < mathBlocks.length; i++) {
                        const block = mathBlocks[i];
                        const displayPlaceholder = `<!--KATEX_DISPLAY_${i}-->`;
                        const inlinePlaceholder = `<!--KATEX_INLINE_${i}-->`;

                        try {
                            const renderedMath = katex.renderToString(block.content, {
                                displayMode: block.type === 'display',
                                throwOnError: false
                            });

                            if (block.type === 'display') {
                                result = result.replace(displayPlaceholder, renderedMath);
                            } else {
                                result = result.replace(inlinePlaceholder, renderedMath);
                            }
                        } catch (mathError) {
                            console.warn('[Canvas] KaTeX error for:', block.content, mathError);
                            // Show the original LaTeX on error
                            const errorHtml = `<span class="katex-error">${this.escapeHtml(block.type === 'display' ? `\\[${block.content}\\]` : `\\(${block.content}\\)`)}</span>`;
                            result = result.replace(block.type === 'display' ? displayPlaceholder : inlinePlaceholder, errorHtml);
                        }
                    }
                }

                // Debug logging for math content
                if (text.includes('\\[') || text.includes('\\(') || text.includes('$$')) {
                    console.log('[Canvas] Rendering markdown with math:', {
                        input: text.substring(0, 100),
                        mathBlocksFound: mathBlocks.length,
                        output: result.substring(0, 200),
                        hasKatex: result.includes('katex')
                    });
                }
                return result;
            } catch (e) {
                console.error('[Canvas] Markdown parsing error:', e);
                return this.escapeHtml(text);
            }
        }

        // Fallback to escaped HTML if marked not loaded
        console.warn('[Canvas] marked not available, escaping HTML');
        return this.escapeHtml(text);
    }

    /**
     * Clear all nodes and edges from canvas
     */
    clear() {
        this.nodesLayer.innerHTML = '';
        this.edgesLayer.innerHTML = '';
        this.nodeElements.clear();
        this.edgeElements.clear();
        this.selectedNodes.clear();
    }

    /**
     * Render entire graph
     */
    renderGraph(graph) {
        this.clear();

        // Render nodes first
        for (const node of graph.getAllNodes()) {
            this.renderNode(node);
        }

        // Render edges after a frame to allow node heights to settle
        // (renderNode uses requestAnimationFrame to measure content height)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                for (const edge of graph.getAllEdges()) {
                    const sourceNode = graph.getNode(edge.source);
                    const targetNode = graph.getNode(edge.target);
                    if (sourceNode && targetNode) {
                        this.renderEdge(edge, sourceNode.position, targetNode.position);
                    }
                }
            });
        });
    }
}

// Export
window.Canvas = Canvas;
