/**
 * Canvas module - SVG-based pan/zoom canvas with node rendering
 */

import { EventEmitter } from './event-emitter.js';
import { NodeType, getDefaultNodeSize } from './graph-types.js';
import { highlightTextInHtml } from './highlight-utils.js';
import { wrapNode } from './node-protocols.js';
import { findScrollableContainer } from './scroll-utils.js';
import { escapeHtmlText, truncateText } from './utils.js';

/**
 *
 */
class Canvas {
    // Static flag to track if marked has been configured (only configure once)
    static markedConfigured = false;

    /**
     *
     * @param containerId
     * @param svgId
     */
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
        this.dragStartPos = null; // Track start position for undo

        // Node elements map
        this.nodeElements = new Map();
        this.edgeElements = new Map();
        this.outputPanels = new Map(); // Track code output panels separately

        // Track nodes where user has manually scrolled (to pause auto-scroll)
        this.userScrolledNodes = new Set();

        // Selection state
        this.selectedNodes = new Set();
        this.hoveredNode = null;

        // Callbacks
        this.onNodeSelect = null;
        this.onNodeDeselect = null;
        this.onNodeMove = null;
        this.onNodeDrag = null; // For real-time position updates during drag (multiplayer sync)
        this.onNodeResize = null;
        this.onNodeResizing = null; // For real-time size updates during resize (multiplayer sync)
        this.onNodeReply = null;
        this.onNodeBranch = null;
        this.onNodeSummarize = null;
        this.onNodeFetchSummarize = null;
        this.onNodeDelete = null;
        this.onNodeCopy = null; // For copying node content
        this.onNodeTitleEdit = null; // For editing node title in semantic zoom
        this.onNodeStopGeneration = null; // For stopping LLM generation
        this.onNodeContinueGeneration = null; // For continuing stopped generation
        this.onNodeRetry = null; // For retrying failed operations
        this.onNodeDismissError = null; // For dismissing error nodes
        this.onNodeFitToViewport = null; // For resizing node to 80% of viewport
        this.onNodeResetSize = null; // For resetting node to default size
        this.onNodeEditContent = null; // For editing node content (FETCH_RESULT)
        this.onNodeNavigate = null; // For navigating to parent/child nodes
        this.onNavParentClick = null; // For handling parent navigation button click
        this.onNavChildClick = null; // For handling child navigation button click
        this.onCreateFlashcards = null; // For generating flashcards from content
        this.onReviewCard = null; // For reviewing a flashcard
        this.onNodeCollapse = null; // For collapsing/expanding node children
        this.onNodeAnalyze = null; // For analyzing CSV data with AI
        this.onNodeRunCode = null; // For executing code in Pyodide

        // PDF drag & drop callback
        this.onPdfDrop = null; // For handling PDF file drops

        // Image drag & drop callback
        this.onImageDrop = null; // For handling image file drops

        // Image click callback (for images in node content)
        this.onImageClick = null; // For handling clicks on images in node content

        // Tag chip click callback (for highlighting nodes by tag)
        this.onTagChipClick = null; // For handling clicks on tag chips

        // Tag remove callback (for removing tag from node)
        this.onTagRemove = null; // For removing a tag from a specific node

        // Reply input keydown callback (for slash command menu integration)
        this.onReplyInputKeydown = null; // For handling keydown in reply tooltip input

        // EventEmitter for new event-based API
        this.events = new EventEmitter();

        // Deferred edge rendering (defensive pattern for async node rendering)
        this.deferredEdges = new Map(); // edgeId -> { edge, sourcePosOrGraph, targetPos }
        this.nodeRenderCallbacks = new Map(); // nodeId -> [callbacks]

        // Reply tooltip state
        this.branchTooltip = null;
        this.activeSelectionNodeId = null;
        this.pendingSelectedText = null; // Store selected text when tooltip opens

        // Navigation popover state
        this.navPopover = null;
        this.activeNavNodeId = null;
        this.navPopoverSelectedIndex = 0; // Currently selected item in popover

        // No-nodes-visible hint
        this.noNodesHint = document.getElementById('no-nodes-hint');
        this.noNodesHintTimeout = null;

        // Cache for node type labels and icons (avoid creating wrapper instances repeatedly)
        this.nodeTypeLabelCache = new Map();
        this.nodeTypeIconCache = new Map();

        this.init();
    }

    /**
     *
     */
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
     * @returns {HTMLInputElement|undefined}
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

        if (selectedText && this.activeSelectionNodeId) {
            // Pass both the selected text and the user's reply
            this.emit('nodeBranch', this.activeSelectionNodeId, selectedText, replyText);
        }

        this.hideBranchTooltip();
        window.getSelection().removeAllRanges();
        input.value = '';
    }

    /**
     * Show the reply tooltip near the selection
     * NOTE: Do NOT auto-focus the input - this would clear the text selection
     * @param x
     * @param y
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
            const displayText =
                this.pendingSelectedText.length > maxLength
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
        this.pendingImageMeta = null;

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
     * @param imgSrc
     * @param position
     * @param meta
     */
    showImageTooltip(imgSrc, position, meta = null) {
        // Store image info
        this.pendingImageSrc = imgSrc;
        this.pendingImageMeta = meta;

        // Update preview image
        const previewImg = this.imageTooltip.querySelector('.image-tooltip-img');
        if (previewImg) {
            previewImg.src = imgSrc;
        }

        this.imageTooltip.style.display = 'block';
        this.imageTooltip.style.left = `${position.x - 100}px`; // Center horizontally
        this.imageTooltip.style.top = `${position.y - 10}px`;
    }

    /**
     * Hide the image tooltip
     */
    hideImageTooltip() {
        this.imageTooltip.style.display = 'none';
        this.pendingImageSrc = null;
        this.pendingImageNodeId = null;
        this.pendingImageMeta = null;
    }

    /**
     * Handle "Ask" action from image tooltip
     * Extracts image and focuses chat input
     */
    handleImageAsk() {
        if (this.pendingImageSrc && this.pendingImageNodeId) {
            this.emit('imageClick', this.pendingImageNodeId, this.pendingImageSrc, {
                action: 'ask',
                ...(this.pendingImageMeta || {}),
            });
        }
        this.hideImageTooltip();
    }

    /**
     * Handle "Extract" action from image tooltip
     * Creates a new IMAGE node with this image
     */
    handleImageExtract() {
        if (this.pendingImageSrc && this.pendingImageNodeId) {
            this.emit('imageClick', this.pendingImageNodeId, this.pendingImageSrc, {
                action: 'extract',
                ...(this.pendingImageMeta || {}),
            });
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
        listEl.innerHTML = nodes
            .map((node) => {
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
            })
            .join('');

        // Add click handlers to items
        listEl.querySelectorAll('.nav-popover-item').forEach((item) => {
            item.addEventListener('click', (_e) => {
                const nodeId = item.getAttribute('data-node-id');
                this.hideNavPopover();
                this.emit('nodeNavigate', nodeId);
            });
        });

        // Reset selection and highlight first item for keyboard navigation
        this.navPopoverSelectedIndex = 0;
        const firstItem = listEl.querySelector('.nav-popover-item');
        if (firstItem) {
            firstItem.classList.add('selected');
        }

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
        this.navPopoverSelectedIndex = 0; // Reset selection
    }

    /**
     * Check if the navigation popover is currently visible
     * @returns {boolean}
     */
    isNavPopoverOpen() {
        return this.navPopover && this.navPopover.style.display !== 'none';
    }

    /**
     * Navigate the popover selection up or down
     * @param {number} direction - -1 for up, +1 for down
     */
    navigatePopoverSelection(direction) {
        if (!this.isNavPopoverOpen()) return;

        const items = this.navPopover.querySelectorAll('.nav-popover-item');
        if (items.length === 0) return;

        // Remove selection from current item
        items[this.navPopoverSelectedIndex]?.classList.remove('selected');

        // Calculate new index with wrapping
        this.navPopoverSelectedIndex = (this.navPopoverSelectedIndex + direction + items.length) % items.length;

        // Add selection to new item and scroll into view
        const newSelected = items[this.navPopoverSelectedIndex];
        newSelected.classList.add('selected');
        newSelected.scrollIntoView({ block: 'nearest' });
    }

    /**
     * Confirm the current popover selection (navigate to selected node)
     */
    confirmPopoverSelection() {
        if (!this.isNavPopoverOpen()) return;

        const items = this.navPopover.querySelectorAll('.nav-popover-item');
        const selected = items[this.navPopoverSelectedIndex];
        if (selected) {
            const nodeId = selected.getAttribute('data-node-id');
            this.hideNavPopover();
            this.emit('nodeNavigate', nodeId);
        }
    }

    /**
     * Get the navigation button element for a node
     * @param {string} nodeId - The node ID
     * @param {string} type - 'parent' or 'child'
     * @returns {HTMLElement|null}
     */
    getNavButton(nodeId, type) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return null;
        return wrapper.querySelector(`.nav-${type}-btn`);
    }

    /**
     * Show a temporary toast message near a node
     * @param {string} message - The message to display
     * @param {string} nodeId - The node ID to position near
     */
    showNavToast(message, nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        // Get node position in viewport
        const rect = wrapper.getBoundingClientRect();

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'nav-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Position above the node center (need to measure after adding to DOM)
        const toastRect = toast.getBoundingClientRect();
        toast.style.left = `${rect.left + rect.width / 2 - toastRect.width / 2}px`;
        toast.style.top = `${rect.top - toastRect.height - 10}px`;

        // Remove after animation completes
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
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
            this.emit('nodeNavigate', nodes[0].id);
        } else {
            // Multiple nodes - show popover
            const rect = button.getBoundingClientRect();
            const position = {
                x: rect.left,
                y: direction === 'parent' ? rect.top - 10 : rect.bottom + 10,
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
                navParentBtn.title =
                    parentCount === 1 ? 'Go to parent node' : `Go to parent (${parentCount} available)`;
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
     * @returns {{x: number, y: number}}
     */
    getViewportCenter() {
        return {
            x: this.viewBox.x + this.viewBox.width / 2,
            y: this.viewBox.y + this.viewBox.height / 2,
        };
    }

    /**
     *
     */
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
            if (
                !e.target.closest('.nav-popover') &&
                !e.target.closest('.nav-parent-btn') &&
                !e.target.closest('.nav-child-btn')
            ) {
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
            isPinching: false,
        };
        this.gestureState = {
            startScale: 1,
            isGesturing: false,
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
     * @param e
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
     * @param e
     */
    handleDragLeave(e) {
        // Only hide if leaving the container entirely (not entering a child)
        if (!this.container.contains(e.relatedTarget)) {
            this.hideDropZone();
        }
    }

    /**
     * Handle drop event for files (uses FileUploadRegistry to find handlers)
     * @param e
     */
    async handleDrop(e) {
        e.preventDefault();
        this.hideDropZone();

        // Get dropped files
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        // Convert drop position to SVG coordinates
        const position = this.clientToSvg(e.clientX, e.clientY);

        // Import FileUploadRegistry (dynamic import to avoid circular dependencies during module load)
        const { FileUploadRegistry } = await import('./file-upload-registry.js');

        // Process first file that has a registered handler
        for (const file of Array.from(files)) {
            const handlerConfig = FileUploadRegistry.findHandler(file);
            if (handlerConfig) {
                // Emit generic fileDrop event with handler info
                this.emit('fileDrop', file, position);
                return;
            }
        }

        // No handler found for any file
        alert(`Unsupported file type. Supported types: ${FileUploadRegistry.getAcceptAttribute()}`);
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

    /**
     *
     */
    handleResize() {
        const rect = this.container.getBoundingClientRect();
        this.viewBox.width = rect.width / this.scale;
        this.viewBox.height = rect.height / this.scale;
        this.updateViewBox();
    }

    /**
     *
     */
    updateViewBox() {
        this.svg.setAttribute(
            'viewBox',
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
     * @returns {boolean}
     */
    hasVisibleNodes() {
        if (this.nodeElements.size === 0) return false;

        const vb = this.viewBox;

        for (const [_nodeId, wrapper] of this.nodeElements) {
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

    /**
     *
     * @param e
     */
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

    /**
     *
     * @param e
     */
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

                // Update output panel position if present (slides from underneath)
                const outputPanel = this.outputPanels.get(this.draggedNode.id);
                if (outputPanel) {
                    const nodeWidth = parseFloat(wrapper.getAttribute('width'));
                    const nodeHeight = parseFloat(wrapper.getAttribute('height'));
                    const panelWidth = parseFloat(outputPanel.getAttribute('width'));
                    const panelOverlap = 10;
                    const panelX = newX + (nodeWidth - panelWidth) / 2;
                    const panelY = newY + nodeHeight - panelOverlap;
                    outputPanel.setAttribute('x', panelX);
                    outputPanel.setAttribute('y', panelY);
                }
            }

            // Update edges
            this.updateEdgesForNode(this.draggedNode.id, { x: newX, y: newY });

            // Callback for real-time sync (e.g., multiplayer)
            this.emit('nodeDrag', this.draggedNode.id, { x: newX, y: newY });
        }
    }

    /**
     *
     * @param {MouseEvent} _e
     */
    handleMouseUp(_e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.container.style.cursor = 'grab';
        }

        if (this.isDraggingNode && this.draggedNode) {
            const wrapper = this.nodeElements.get(this.draggedNode.id);
            if (wrapper) {
                const newPos = {
                    x: parseFloat(wrapper.getAttribute('x')),
                    y: parseFloat(wrapper.getAttribute('y')),
                };

                // Remove dragging class
                const nodeEl = wrapper.querySelector('.node');
                if (nodeEl) nodeEl.classList.remove('dragging');

                // Callback to persist position (pass old position for undo)
                this.emit('nodeMove', this.draggedNode.id, newPos, this.dragStartPos);
            }

            this.isDraggingNode = false;
            this.draggedNode = null;
            this.dragStartPos = null;
        }
    }

    /**
     *
     * @param e
     */
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
            // Find the best scroll container by checking which element actually has overflow
            const scrollableContent = findScrollableContainer(e.target);

            if (scrollableContent) {
                // findScrollableContainer already verified overflow CSS, just check scroll direction
                const canScrollUp = scrollableContent.scrollTop > 0;
                const canScrollDown =
                    scrollableContent.scrollTop < scrollableContent.scrollHeight - scrollableContent.clientHeight - 1;
                const canScrollLeft = scrollableContent.scrollLeft > 0;
                const canScrollRight =
                    scrollableContent.scrollLeft < scrollableContent.scrollWidth - scrollableContent.clientWidth - 1;

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

            e.preventDefault();

            // Two-finger pan (regular scroll)
            const dx = e.deltaX / this.scale;
            const dy = e.deltaY / this.scale;

            this.viewBox.x += dx;
            this.viewBox.y += dy;

            this.updateViewBox();
        }
    }

    /**
     *
     * @param e
     */
    handleDoubleClick(e) {
        // Double-click on empty space to fit content (with smooth animation)
        if (e.target === this.svg || e.target.closest('#edges-layer')) {
            this.fitToContentAnimated(400);
        }
    }

    // --- Touch Event Handlers (for mobile/tablet) ---

    /**
     *
     * @param e
     */
    handleTouchStart(e) {
        const touches = Array.from(e.touches);
        this.touchState.touches = touches.map((t) => ({ x: t.clientX, y: t.clientY }));

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

    /**
     *
     * @param e
     */
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

    /**
     *
     * @param e
     */
    handleTouchEnd(e) {
        const touches = Array.from(e.touches);
        this.touchState.touches = touches.map((t) => ({ x: t.clientX, y: t.clientY }));

        if (touches.length < 2) {
            this.touchState.isPinching = false;
        }
        if (touches.length === 1) {
            this.touchState.lastCenter = { x: touches[0].clientX, y: touches[0].clientY };
        }
    }

    /**
     *
     * @param {Touch[]} touches
     * @returns {number}
     */
    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     *
     * @param {Touch[]} touches
     * @returns {{x: number, y: number}}
     */
    getTouchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    }

    // --- Safari Gesture Event Handlers ---
    // These handle pinch-to-zoom on Safari. We always capture these gestures
    // (even on nodes) to prevent the browser's viewport zoom from activating.

    /**
     *
     * @param e
     */
    handleGestureStart(e) {
        e.preventDefault();
        this.gestureState.startScale = this.scale;
        this.gestureState.isGesturing = true;
    }

    /**
     *
     * @param e
     */
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

    /**
     *
     * @param {TouchEvent} e
     * @returns {void}
     */
    handleGestureEnd(e) {
        e.preventDefault();
        this.gestureState.isGesturing = false;
    }

    /**
     * Convert client coordinates to SVG coordinates
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{x: number, y: number}}
     */
    clientToSvg(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: this.viewBox.x + (clientX - rect.left) / this.scale,
            y: this.viewBox.y + (clientY - rect.top) / this.scale,
        };
    }

    /**
     * Fit the viewport to show all nodes
     * @param padding
     */
    fitToContent(padding = 50) {
        const nodes = Array.from(this.nodeElements.values());
        if (nodes.length === 0) return;

        let minX = Infinity,
            minY = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity;

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
     * @param x
     * @param y
     */
    centerOn(x, y) {
        const rect = this.container.getBoundingClientRect();
        this.viewBox.x = x - rect.width / this.scale / 2;
        this.viewBox.y = y - rect.height / this.scale / 2;
        this.updateViewBox();
    }

    /**
     * Smoothly animate to center on a specific position
     * @param x
     * @param y
     * @param duration
     */
    centerOnAnimated(x, y, duration = 300) {
        const rect = this.container.getBoundingClientRect();
        const endX = x - rect.width / this.scale / 2;
        const endY = y - rect.height / this.scale / 2;

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
     * @param nodeId
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
     * @param nodeId
     * @param duration
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
     * @param {Function} options.onEdgeUpdate - Optional callback for custom edge updating (called each frame)
     */
    animateToLayout(graph, options = {}) {
        const duration = options.duration || 500;
        const focusNodeId = options.focusNodeId || null;
        const keepViewport = options.keepViewport || false;
        const onEdgeUpdate = options.onEdgeUpdate || null;

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
                const animData = {
                    nodeId: node.id,
                    wrapper,
                    startX,
                    startY,
                    endX,
                    endY,
                };

                // Check for output panel and calculate its animation path
                // Output panels are positioned relative to their parent node, so when the node
                // moves during auto-layout, the panel must move in sync to stay attached
                const outputPanel = this.outputPanels.get(node.id);
                if (outputPanel) {
                    const nodeWidth = parseFloat(wrapper.getAttribute('width'));
                    const nodeHeight = parseFloat(wrapper.getAttribute('height'));
                    const panelWidth = parseFloat(outputPanel.getAttribute('width'));
                    // Must match the overlap constant in renderOutputPanel() (line 1888)
                    const panelOverlap = 10;

                    // Calculate start panel position (where it currently is)
                    const startPanelX = startX + (nodeWidth - panelWidth) / 2;
                    const startPanelY = startY + nodeHeight - panelOverlap;

                    // Calculate end panel position (where it should go)
                    const endPanelX = endX + (nodeWidth - panelWidth) / 2;
                    const endPanelY = endY + nodeHeight - panelOverlap;

                    // Store panel animation data
                    animData.outputPanel = outputPanel;
                    animData.startPanelX = startPanelX;
                    animData.startPanelY = startPanelY;
                    animData.endPanelX = endPanelX;
                    animData.endPanelY = endPanelY;
                }

                animations.push(animData);
            }
        }

        if (animations.length === 0) {
            // No position changes, just update edges
            if (onEdgeUpdate) {
                onEdgeUpdate();
            } else {
                this.updateAllEdges(graph);
            }
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

                // Update output panel position if present
                // This keeps the panel attached to its parent node during animation
                // Position calculation matches handleMouseMove() drag logic (lines 916-923)
                if (anim.outputPanel) {
                    const panelX = anim.startPanelX + (anim.endPanelX - anim.startPanelX) * eased;
                    const panelY = anim.startPanelY + (anim.endPanelY - anim.startPanelY) * eased;
                    anim.outputPanel.setAttribute('x', panelX);
                    anim.outputPanel.setAttribute('y', panelY);
                }
            }

            // Update edges - use custom callback if provided
            if (onEdgeUpdate) {
                onEdgeUpdate();
            } else {
                this.updateAllEdges(graph);
            }

            // Animate viewport if fitting to content
            if (viewportAnim) {
                this.viewBox.x = viewportAnim.startX + (viewportAnim.endX - viewportAnim.startX) * eased;
                this.viewBox.y = viewportAnim.startY + (viewportAnim.endY - viewportAnim.startY) * eased;
                this.viewBox.width =
                    viewportAnim.startWidth + (viewportAnim.endWidth - viewportAnim.startWidth) * eased;
                this.viewBox.height =
                    viewportAnim.startHeight + (viewportAnim.endHeight - viewportAnim.startHeight) * eased;
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
     * @param {Object} graph
     * @param {number} padding
     * @returns {Object|null}
     */
    calculateFitToContentViewport(graph, padding = 50) {
        const nodes = graph.getAllNodes();
        if (nodes.length === 0) return null;

        let minX = Infinity,
            minY = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity;

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
            endScale,
        };
    }

    /**
     * Animated version of fitToContent
     * @param duration
     */
    fitToContentAnimated(duration = 500) {
        const nodeIds = Array.from(this.nodeElements.keys());
        if (nodeIds.length === 0) return;

        // Get bounding box of all nodes (with padding)
        const bounds = this.getNodesBoundingBox(nodeIds, 50);

        // Get viewport dimensions
        const rect = this.container.getBoundingClientRect();
        const scaleX = rect.width / bounds.width;
        const scaleY = rect.height / bounds.height;
        const endScale = Math.min(scaleX, scaleY, 1);

        const endX = bounds.x;
        const endY = bounds.y;
        const endWidth = rect.width / endScale;
        const endHeight = rect.height / endScale;

        this.animateViewport({ endX, endY, endWidth, endHeight, endScale, duration });
    }

    /**
     * Get the visible viewport dimensions in screen pixels
     * @returns {{width: number, height: number}}
     */
    getViewportDimensions() {
        const rect = this.container.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }

    /**
     * Get the bounding box containing all specified nodes
     * @param {string[]} nodeIds - Array of node IDs to include
     * @param {number} padding - Padding around the bounding box (default 50)
     * @returns {{x: number, y: number, width: number, height: number}} Bounding box
     */
    getNodesBoundingBox(nodeIds, padding = 50) {
        let minX = Infinity,
            minY = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity;

        for (const nodeId of nodeIds) {
            const wrapper = this.nodeElements.get(nodeId);
            if (!wrapper) continue;

            const x = parseFloat(wrapper.getAttribute('x'));
            const y = parseFloat(wrapper.getAttribute('y'));
            const width = parseFloat(wrapper.getAttribute('width')) || 420;
            const height = parseFloat(wrapper.getAttribute('height')) || 200;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
        }

        // Return with padding applied
        return {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
        };
    }

    /**
     * Animate viewport to target position and scale
     * @param {Object} options - Animation options
     * @param {number} options.endX - Target viewBox.x
     * @param {number} options.endY - Target viewBox.y
     * @param {number} options.endWidth - Target viewBox.width
     * @param {number} options.endHeight - Target viewBox.height
     * @param {number} options.endScale - Target scale
     * @param {number} options.duration - Animation duration in ms (default 300)
     */
    animateViewport({ endX, endY, endWidth, endHeight, endScale, duration = 300 }) {
        const startX = this.viewBox.x;
        const startY = this.viewBox.y;
        const startWidth = this.viewBox.width;
        const startHeight = this.viewBox.height;
        const startScale = this.scale;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-in-out cubic: smoother for combined zoom + pan
            const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

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
     * Zoom to fit the specified nodes in viewport
     * @param {string[]} nodeIds - Array of node IDs to zoom to
     * @param {number} targetFill - How much of viewport to fill (default 0.8 = 80%)
     * @param {number} duration - Animation duration in ms (default 300)
     */
    zoomToSelectionAnimated(nodeIds, targetFill = 0.8, duration = 300) {
        if (!nodeIds || nodeIds.length === 0) return;

        // Get bounding box of selected nodes (with padding)
        const bounds = this.getNodesBoundingBox(nodeIds, 50);

        // Get viewport dimensions in screen pixels
        const viewport = this.getViewportDimensions();

        // Calculate scale needed to fill targetFill of viewport
        const scaleX = (viewport.width * targetFill) / bounds.width;
        const scaleY = (viewport.height * targetFill) / bounds.height;
        const targetScale = Math.min(scaleX, scaleY, this.maxScale);

        // Clamp to min scale
        const endScale = Math.max(targetScale, this.minScale);

        // Calculate viewport dimensions at target scale
        const endWidth = viewport.width / endScale;
        const endHeight = viewport.height / endScale;

        // Center the bounds in viewport
        const boundsCenterX = bounds.x + bounds.width / 2;
        const boundsCenterY = bounds.y + bounds.height / 2;
        const endX = boundsCenterX - endWidth / 2;
        const endY = boundsCenterY - endHeight / 2;

        this.animateViewport({ endX, endY, endWidth, endHeight, endScale, duration });
    }

    /**
     * Resize a node to fit 80% of the visible viewport
     * Makes content scrollable if it overflows
     * @param nodeId
     */
    resizeNodeToViewport(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const viewport = this.getViewportDimensions();

        // Calculate 80% of viewport in canvas coordinates
        // We use screen pixels directly since we want consistent sizing regardless of zoom
        const targetWidth = Math.round((viewport.width * 0.8) / this.scale);
        const targetHeight = Math.round((viewport.height * 0.8) / this.scale);

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
        this.emit('nodeResize', nodeId, targetWidth, targetHeight);

        // Center the node in viewport
        this.panToNodeAnimated(nodeId, 300);
    }

    /**
     * Update all edges based on current node positions in graph
     * @param graph
     */
    updateAllEdges(graph) {
        for (const edge of graph.getAllEdges()) {
            const sourceWrapper = this.nodeElements.get(edge.source);
            const targetWrapper = this.nodeElements.get(edge.target);

            if (sourceWrapper && targetWrapper) {
                const sourcePos = {
                    x: parseFloat(sourceWrapper.getAttribute('x')),
                    y: parseFloat(sourceWrapper.getAttribute('y')),
                };
                const targetPos = {
                    x: parseFloat(targetWrapper.getAttribute('x')),
                    y: parseFloat(targetWrapper.getAttribute('y')),
                };

                this.renderEdge(edge, sourcePos, targetPos);
            }
        }
    }

    // --- Node Rendering ---

    /**
     * Render a node to the canvas
     * @param {Object} node
     * @returns {void}
     */
    renderNode(node) {
        // Preserve selection state (removeNode will clear it)
        const wasSelected = this.selectedNodes.has(node.id);

        // Remove existing if present
        this.removeNode(node.id);

        // Wrap node with protocol class
        const wrapped = wrapNode(node);

        // All nodes have fixed dimensions - use stored or get defaults
        const defaultSize = getDefaultNodeSize(node.type);
        const width = node.width || defaultSize.width;
        const height = node.height || defaultSize.height;

        // Create foreignObject wrapper
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        wrapper.setAttribute('class', 'node-wrapper');
        wrapper.setAttribute('x', node.position.x);
        wrapper.setAttribute('y', node.position.y);
        wrapper.setAttribute('width', width);
        wrapper.setAttribute('height', height);
        wrapper.setAttribute('data-node-id', node.id);

        // Create node HTML
        const div = document.createElement('div');

        // Build node classes: base + type + viewport-fitted
        // Use hyphenated type for DOM (CSS convention) e.g. fetch_result → fetch-result
        const typeClass = node.type.replace(/_/g, '-');
        let nodeClasses = `node ${typeClass} viewport-fitted`;

        div.className = nodeClasses;
        div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        div.style.width = '100%';
        div.style.height = '100%';

        // Get values from protocol
        const summaryText = wrapped.getSummaryText(this);
        const typeIcon = wrapped.getTypeIcon();
        const typeLabel = wrapped.getTypeLabel();
        const contentHtml = wrapped.renderContent(this);
        const actions = wrapped.getComputedActions();
        const headerButtons = wrapped.getHeaderButtons();
        const contentClasses = wrapped.getContentClasses();

        // Build action buttons HTML (may be empty for some node types like Matrix)
        const actionsHtml = actions
            .map((action) => {
                const actionClass =
                    action.id === 'reply'
                        ? 'reply-btn'
                        : action.id === 'branch'
                          ? 'branch-btn'
                          : action.id === 'summarize'
                            ? 'summarize-btn'
                            : action.id === 'fetch-summarize'
                              ? 'fetch-summarize-btn'
                              : action.id === 'edit-content'
                                ? 'edit-content-btn'
                                : action.id === 'copy'
                                  ? 'copy-btn'
                                  : action.id === 'create-flashcards'
                                    ? 'create-flashcards-btn'
                                    : action.id === 'flip-card'
                                      ? 'flip-card-btn'
                                      : action.id === 'review-card'
                                        ? 'review-card-btn'
                                        : action.id === 'analyze'
                                          ? 'analyze-btn'
                                          : action.id === 'edit-code'
                                            ? 'edit-code-btn'
                                            : action.id === 'generate'
                                              ? 'generate-btn'
                                              : action.id === 'run-code'
                                                ? 'run-code-btn'
                                                : '';
                return `<button class="node-action ${actionClass}" data-action-id="${this.escapeHtml(action.id)}" title="${this.escapeHtml(action.title)}">${this.escapeHtml(action.label)}</button>`;
            })
            .join('');

        // Build header buttons HTML
        const headerButtonsHtml = headerButtons
            .map((btn) => {
                // Collapse button is hidden by default, shown dynamically when node has children
                if (btn.id === 'collapse') {
                    return `<button class="header-btn collapse-btn" title="${this.escapeHtml(btn.title)}" style="display:none;">${this.escapeHtml(btn.label)}</button>`;
                }
                const displayStyle = btn.hidden ? 'style="display:none;"' : '';
                return `<button class="header-btn ${btn.id}-btn" title="${this.escapeHtml(btn.title)}" ${displayStyle}>${this.escapeHtml(btn.label)}</button>`;
            })
            .join('');

        // Build content class string (node-content + any extra classes from protocol)
        const contentClassStr = contentClasses ? `node-content ${contentClasses}` : 'node-content';

        // Only render node-actions div if there are actions
        const actionsSection =
            actions.length > 0
                ? `
            <div class="node-actions">
                ${actionsHtml}
            </div>`
                : '';

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
            <div class="${contentClassStr}">${contentHtml}</div>
            ${actionsSection}
            <div class="resize-handle resize-e" data-resize="e"></div>
            <div class="resize-handle resize-s" data-resize="s"></div>
            <div class="resize-handle resize-se" data-resize="se"></div>
        `;

        // Render tags as a fundamental property of ALL nodes (regardless of type)
        // Tags are inserted as the first child so they render outside the left edge
        const tagsHtml = this.renderNodeTags(node);
        if (tagsHtml) {
            div.insertAdjacentHTML('afterbegin', tagsHtml);
        }

        wrapper.appendChild(div);
        this.nodesLayer.appendChild(wrapper);
        this.nodeElements.set(node.id, wrapper);

        // Setup node event listeners
        this.setupNodeEvents(wrapper, node);

        // Render output panel for nodes that support it (if they have output)
        // Check if protocol has hasOutput method and it returns true
        if (wrapped.hasOutput && typeof wrapped.hasOutput === 'function') {
            const hasOutput = wrapped.hasOutput();
            if (hasOutput) {
                this.renderOutputPanel(node, wrapper);
            }
        }

        // Restore selection state if node was previously selected
        if (wasSelected) {
            this.selectedNodes.add(node.id);
            div.classList.add('selected');
        }

        // Notify any edges waiting for this node to finish rendering
        this._notifyNodeRendered(node.id);

        return wrapper;
    }

    /**
     * Render or update the output panel for a code node
     * @param {Object} node - The code node
     * @param {Element} nodeWrapper - The node's foreignObject wrapper
     * @param {Object} options - Render options
     * @param {boolean} options.skipAnimation - Skip the slide-out animation (default: false)
     */
    renderOutputPanel(node, nodeWrapper, options = {}) {
        const { skipAnimation = false } = options;
        const wrapped = wrapNode(node);

        // Track if we're replacing an existing panel (to skip animation)
        const existingPanel = this.outputPanels.get(node.id);
        const hadExistingPanel = !!existingPanel;

        // Remove existing output panel if present
        if (existingPanel) {
            existingPanel.remove();
            this.outputPanels.delete(node.id);
        }

        // Only render if there's output
        // Check if protocol has hasOutput method and it returns true
        if (!wrapped.hasOutput || typeof wrapped.hasOutput !== 'function') {
            return;
        }
        const hasOutput = wrapped.hasOutput();
        if (!hasOutput) {
            return;
        }

        const outputExpanded = node.outputExpanded !== false;

        const nodeX = parseFloat(nodeWrapper.getAttribute('x'));
        const nodeY = parseFloat(nodeWrapper.getAttribute('y'));
        const nodeWidth = parseFloat(nodeWrapper.getAttribute('width'));
        const nodeHeight = parseFloat(nodeWrapper.getAttribute('height'));

        // Panel is 90% width, centered beneath the node
        const panelWidthRatio = 0.9;
        const panelWidth = nodeWidth * panelWidthRatio;
        const panelX = nodeX + (nodeWidth - panelWidth) / 2;

        // Panel slides out from underneath - no gap, overlaps slightly
        const panelOverlap = 10; // Overlap with node bottom to look like sliding from underneath
        const panelY = nodeY + nodeHeight - panelOverlap;

        // Use stored height or default
        const panelHeight = node.outputPanelHeight || 200;

        // Collapsed state: just show a small toggle tab
        const collapsedHeight = 24;
        const actualHeight = outputExpanded ? panelHeight : collapsedHeight;

        // Create foreignObject for output panel
        const panelWrapper = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        panelWrapper.setAttribute('class', 'output-panel-wrapper');
        panelWrapper.setAttribute('x', panelX);
        panelWrapper.setAttribute('y', panelY);
        panelWrapper.setAttribute('width', panelWidth);
        panelWrapper.setAttribute('height', actualHeight + panelOverlap); // Extra for overlap
        panelWrapper.setAttribute('data-node-id', node.id);
        panelWrapper.setAttribute('data-output-panel', 'true');
        panelWrapper.setAttribute('data-panel-height', panelHeight); // Store full height for animations

        // Create panel HTML
        const panelDiv = document.createElement('div');
        panelDiv.className = `code-output-panel ${outputExpanded ? 'expanded' : 'collapsed'}`;
        panelDiv.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        panelDiv.style.width = '100%';
        panelDiv.style.height = '100%';
        panelDiv.style.paddingTop = `${panelOverlap}px`; // Offset for overlap area

        // Minimal design: no header, just content with toggle tab at bottom
        panelDiv.innerHTML = `
            <div class="code-output-panel-inner">
                <div class="code-output-panel-body">
                    ${wrapped.renderOutputPanel(this)}
                </div>
                <div class="code-output-panel-footer">
                    <button class="code-output-toggle" title="${outputExpanded ? 'Collapse output' : 'Expand output'}">
                        ${outputExpanded ? '▲' : '▼'}
                    </button>
                    ${outputExpanded ? '<div class="code-output-resize-handle" title="Drag to resize"></div>' : ''}
                </div>
            </div>
        `;

        panelWrapper.appendChild(panelDiv);

        // Insert BEFORE the node in the DOM so it renders underneath
        nodeWrapper.before(panelWrapper);
        this.outputPanels.set(node.id, panelWrapper);

        // Setup event listeners for panel buttons and resize
        this.setupOutputPanelEvents(panelWrapper, node, nodeWrapper);

        // Initialize syntax highlighting for code in panel (if protocol supports it)
        // Note: wrapped is already declared above (line 1890), so we reuse it
        if (wrapped && wrapped.getEventBindings) {
            const bindings = wrapped.getEventBindings();
            if (bindings && bindings.length > 0) {
                // Apply bindings to the panel content (same pattern as applyProtocolEventBindings)
                const panelBody = panelDiv.querySelector('.code-output-panel-body');
                if (panelBody) {
                    for (const binding of bindings) {
                        const { selector, event = 'click', handler } = binding;

                        // Handle special 'init' event (called once after render, not a DOM event)
                        if (event === 'init') {
                            const element = panelBody.querySelector(selector);
                            if (element && typeof handler === 'function') {
                                // Create a fake event object for init handlers
                                const fakeEvent = { currentTarget: element, target: element };
                                try {
                                    handler(node.id, fakeEvent, this);
                                } catch (err) {
                                    console.error(`Error in init handler for ${selector}:`, err);
                                }
                            }
                            continue;
                        }

                        // For other events, set up listeners
                        const elements = panelBody.querySelectorAll(selector);
                        elements.forEach((element) => {
                            element.addEventListener(event, (e) => {
                                if (typeof handler === 'function') {
                                    handler(node.id, e, this);
                                }
                            });
                        });
                    }
                }
            }
        }

        // Animate initial slide-out if expanded (skip if replacing existing panel or explicitly requested)
        const shouldAnimate = outputExpanded && !skipAnimation && !hadExistingPanel;

        if (shouldAnimate) {
            const panelBody = panelDiv.querySelector('.code-output-panel-body');
            const collapsedHeight = 24;
            const fullHeight = panelHeight + panelOverlap;

            // Start from collapsed state
            panelWrapper.setAttribute('height', collapsedHeight + panelOverlap);
            if (panelBody) {
                panelBody.style.opacity = '0';
            }

            // Animate to expanded state
            const duration = 300;
            const startTime = performance.now();

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);

                const currentHeight =
                    collapsedHeight + panelOverlap + (fullHeight - collapsedHeight - panelOverlap) * eased;
                panelWrapper.setAttribute('height', currentHeight);

                if (panelBody) {
                    panelBody.style.opacity = eased;
                }

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };

            // Small delay before starting animation
            requestAnimationFrame(() => {
                requestAnimationFrame(animate);
            });
        }
    }

    /**
     * Animate output panel expand/collapse
     * @param {string} nodeId - The code node ID
     * @param {boolean} expand - True to expand, false to collapse
     * @param {Function} onComplete - Callback when animation completes
     */
    animateOutputPanel(nodeId, expand, onComplete) {
        const panelWrapper = this.outputPanels.get(nodeId);
        if (!panelWrapper) {
            onComplete?.();
            return;
        }

        const _panelDiv = panelWrapper.querySelector('.code-output-panel');
        const _panelInner = panelWrapper.querySelector('.code-output-panel-inner');
        const panelBody = panelWrapper.querySelector('.code-output-panel-body');

        const panelOverlap = 10;
        const collapsedHeight = 24;
        const fullHeight = parseFloat(panelWrapper.getAttribute('data-panel-height')) || 200;

        const duration = 250; // ms
        const startTime = performance.now();
        const startHeight = parseFloat(panelWrapper.getAttribute('height'));
        const targetHeight = expand ? fullHeight + panelOverlap : collapsedHeight + panelOverlap;

        // Show body immediately when expanding (so it's visible during animation)
        if (expand && panelBody) {
            panelBody.style.display = '';
            panelBody.style.opacity = '0';
        }

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);

            const currentHeight = startHeight + (targetHeight - startHeight) * eased;
            panelWrapper.setAttribute('height', currentHeight);

            // Animate body opacity
            if (panelBody) {
                if (expand) {
                    panelBody.style.opacity = eased;
                } else {
                    panelBody.style.opacity = 1 - eased;
                }
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Animation complete
                if (!expand && panelBody) {
                    panelBody.style.display = 'none';
                }
                onComplete?.();
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Update output panel content without full re-render
     * @param {string} nodeId - The node ID
     * @param {Object} node - The updated node object
     */
    updateOutputPanelContent(nodeId, node) {
        const panelWrapper = this.outputPanels.get(nodeId);
        if (!panelWrapper) return;

        const panelBody = panelWrapper.querySelector('.code-output-panel-body');
        if (!panelBody) return;

        const wrapped = wrapNode(node);
        if (!wrapped || !wrapped.renderOutputPanel) return;

        // Update just the body content
        panelBody.innerHTML = wrapped.renderOutputPanel(this);

        // Re-initialize syntax highlighting if protocol supports it (same pattern as renderOutputPanel)
        if (wrapped && wrapped.getEventBindings) {
            const bindings = wrapped.getEventBindings();
            if (bindings && bindings.length > 0) {
                for (const binding of bindings) {
                    const { selector, event = 'click', handler } = binding;

                    // Handle special 'init' event
                    if (event === 'init') {
                        const element = panelBody.querySelector(selector);
                        if (element && typeof handler === 'function') {
                            const fakeEvent = { currentTarget: element, target: element };
                            try {
                                handler(nodeId, fakeEvent, this);
                            } catch (err) {
                                console.error(`Error in init handler for ${selector}:`, err);
                            }
                        }
                        continue;
                    }

                    // For other events, set up listeners
                    const elements = panelBody.querySelectorAll(selector);
                    elements.forEach((element) => {
                        element.addEventListener(event, (e) => {
                            if (typeof handler === 'function') {
                                handler(nodeId, e, this);
                            }
                        });
                    });
                }
            }
        }
    }

    /**
     * Update output panel toggle button state
     * @param {string} nodeId - The node ID
     * @param {boolean} expanded - Whether panel is expanded
     */
    updateOutputToggleButton(nodeId, expanded) {
        const panelWrapper = this.outputPanels.get(nodeId);
        if (!panelWrapper) return;

        const toggleBtn = panelWrapper.querySelector('.code-output-toggle');
        const footer = panelWrapper.querySelector('.code-output-panel-footer');

        if (toggleBtn) {
            toggleBtn.textContent = expanded ? '▲' : '▼';
            toggleBtn.title = expanded ? 'Collapse output' : 'Expand output';
        }

        // Add/remove resize handle based on expanded state
        if (footer) {
            const existingHandle = footer.querySelector('.code-output-resize-handle');
            if (expanded && !existingHandle) {
                const handle = document.createElement('div');
                handle.className = 'code-output-resize-handle';
                handle.title = 'Drag to resize';
                footer.appendChild(handle);

                // Setup resize event listener on the new handle
                this.setupResizeHandle(handle, panelWrapper, this.graph.getNode(nodeId));
            } else if (!expanded && existingHandle) {
                existingHandle.remove();
            }
        }
    }

    /**
     * Setup resize handle event listener (extracted for reuse)
     * @param resizeHandle
     * @param panelWrapper
     * @param node
     */
    setupResizeHandle(resizeHandle, panelWrapper, node) {
        resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const startY = e.clientY;
            const startHeight = parseFloat(panelWrapper.getAttribute('height'));
            const panelOverlap = 10;

            const onMouseMove = (moveEvent) => {
                const deltaY = (moveEvent.clientY - startY) / this.scale;
                const newHeight = Math.max(100, Math.min(500, startHeight + deltaY)); // Min 100, max 500
                panelWrapper.setAttribute('height', newHeight);
                panelWrapper.setAttribute('data-panel-height', newHeight - panelOverlap);
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                // Save the new height
                const finalHeight = parseFloat(panelWrapper.getAttribute('data-panel-height'));
                this.emit('nodeOutputResize', node.id, finalHeight);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    /**
     *
     * @param {HTMLElement} panelWrapper
     * @param {Object} node
     * @param {HTMLElement} _nodeWrapper
     */
    setupOutputPanelEvents(panelWrapper, node, _nodeWrapper) {
        const toggleBtn = panelWrapper.querySelector('.code-output-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeOutputToggle', node.id);
            });
        }

        // Resize handle for adjusting panel height
        const resizeHandle = panelWrapper.querySelector('.code-output-resize-handle');
        if (resizeHandle) {
            this.setupResizeHandle(resizeHandle, panelWrapper, node);
        }
    }

    /**
     * Apply protocol-defined event bindings to a node element.
     * This enables plugins to define their own event handlers.
     *
     * @param {HTMLElement} div - The node element
     * @param {Object} node - The node data object
     */
    applyProtocolEventBindings(div, node) {
        // Get protocol instance
        const wrapped = wrapNode(node);
        const bindings = wrapped.getEventBindings();

        if (!bindings || bindings.length === 0) return;

        for (const binding of bindings) {
            const { selector, event = 'click', handler, multiple = false } = binding;

            // Handle special 'init' event (called once after render, not a DOM event)
            if (event === 'init') {
                const element = div.querySelector(selector);
                if (element && typeof handler === 'function') {
                    // Create a fake event object for init handlers
                    const fakeEvent = { currentTarget: element, target: element };
                    try {
                        handler(node.id, fakeEvent, this);
                    } catch (err) {
                        console.error(`Error in init handler for ${selector}:`, err);
                    }
                }
                continue;
            }

            // Get elements to bind
            const elements = multiple ? div.querySelectorAll(selector) : [div.querySelector(selector)].filter(Boolean);

            for (const element of elements) {
                element.addEventListener(event, (e) => {
                    e.stopPropagation();

                    if (typeof handler === 'string') {
                        // Handler is an event name to emit
                        this.emit(handler, node.id);
                    } else if (typeof handler === 'function') {
                        // Handler is a function: (nodeId, event, canvas) => void
                        handler(node.id, e, this);
                    }
                });
            }
        }
    }

    /**
     * Setup event listeners for a node
     * @param wrapper
     * @param node
     */
    setupNodeEvents(wrapper, node) {
        const div = wrapper.querySelector('.node');
        // Store nodeId on div for easy access by event handlers
        if (div && !div.dataset.nodeId) {
            div.dataset.nodeId = node.id;
        }

        // IMPORTANT: Use capture phase to ensure node selection happens BEFORE
        // any child element's stopPropagation() can prevent it. This provides
        // uniform selection behavior for ALL node types without special-casing.
        div.addEventListener(
            'click',
            (e) => {
                // Skip resize handles - they shouldn't select
                if (e.target.closest('.resize-handle')) return;

                // Skip tag remove button - it has its own dedicated handler
                if (e.target.closest('.node-tag-remove')) return;

                // Skip tag chips - clicking a tag should highlight by tag, not select node
                if (e.target.closest('.node-tag')) return;

                if (e.ctrlKey || e.metaKey) {
                    // Multi-select toggle
                    if (this.selectedNodes.has(node.id)) {
                        this.deselectNode(node.id);
                    } else {
                        this.selectNode(node.id, true);
                    }
                } else {
                    // Single select (only if not already selected to avoid flicker)
                    if (!this.selectedNodes.has(node.id)) {
                        this.clearSelection();
                        this.selectNode(node.id, false);
                    }
                }
            },
            true
        ); // true = capture phase

        // Drag to move - only via drag handle
        const dragHandle = div.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();

                this.isDraggingNode = true;
                this.draggedNode = node;

                // Get current position from wrapper (not stale node.position)
                // This is critical after layout animations update wrapper x/y
                const currentX = parseFloat(wrapper.getAttribute('x'));
                const currentY = parseFloat(wrapper.getAttribute('y'));

                // Store starting position for undo
                this.dragStartPos = { x: currentX, y: currentY };

                const point = this.clientToSvg(e.clientX, e.clientY);
                this.dragOffset = {
                    x: point.x - currentX,
                    y: point.y - currentY,
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

            // Get current position from wrapper (not stale node.position)
            // This is critical after layout animations update wrapper x/y
            const currentX = parseFloat(wrapper.getAttribute('x'));
            const currentY = parseFloat(wrapper.getAttribute('y'));

            // Store starting position for undo
            this.dragStartPos = { x: currentX, y: currentY };

            const point = this.clientToSvg(e.clientX, e.clientY);
            this.dragOffset = {
                x: point.x - currentX,
                y: point.y - currentY,
            };

            div.classList.add('dragging');
        });

        // Resize handles
        const resizeHandles = div.querySelectorAll('.resize-handle');
        resizeHandles.forEach((handle) => {
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

                    // Check if node protocol wants to prevent height change on east-only resize
                    const wrapped = wrapNode(node);
                    const preventHeightChange = wrapped.shouldPreventHeightChangeOnEastResize
                        ? wrapped.shouldPreventHeightChangeOnEastResize()
                        : false;

                    if (resizeType.includes('s')) {
                        // Allow height to shrink freely (just usability minimum)
                        // Mark as viewport-fitted so content scrolls when needed
                        newHeight = Math.max(100, startHeight + dy);
                        wrapper.setAttribute('height', newHeight);
                        div.classList.add('viewport-fitted');
                        div.style.height = '100%';
                    } else if (resizeType === 'e' && !preventHeightChange) {
                        // If only resizing width (east), keep height the same
                        // Content will wrap, and if it overflows, scrollbar will appear
                        // Mark as viewport-fitted so content scrolls when needed
                        div.classList.add('viewport-fitted');
                        div.style.height = '100%';
                        // Height stays at startHeight (already set above)
                    }
                    // If preventHeightChange is true (e.g., matrix nodes), don't change height at all

                    // Update edges - read current position from wrapper, not stale node.position
                    const currentPos = {
                        x: parseFloat(wrapper.getAttribute('x')),
                        y: parseFloat(wrapper.getAttribute('y')),
                    };
                    this.updateEdgesForNode(node.id, currentPos);

                    // Update output panel position if present (for code nodes with drawers)
                    const outputPanel = this.outputPanels.get(node.id);
                    if (outputPanel) {
                        const panelWidth = parseFloat(outputPanel.getAttribute('width'));
                        const panelOverlap = 10;
                        const panelX = currentPos.x + (newWidth - panelWidth) / 2;
                        const panelY = currentPos.y + newHeight - panelOverlap;
                        outputPanel.setAttribute('x', panelX);
                        outputPanel.setAttribute('y', panelY);
                    }

                    // Notify for real-time multiplayer sync
                    this.emit('nodeResizing', node.id, newWidth, newHeight);
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    // Save new dimensions
                    const finalWidth = parseFloat(wrapper.getAttribute('width'));
                    const finalHeight = parseFloat(wrapper.getAttribute('height'));

                    this.emit('nodeResize', node.id, finalWidth, finalHeight);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });

        // Action buttons
        const nodeActions = div.querySelector('.node-actions');
        if (nodeActions) {
            // Generic handler for plugin-defined node actions (added via getAdditionalActions()).
            // Built-in actions are handled by dedicated listeners below.
            nodeActions.addEventListener('click', (e) => {
                const btn = e.target?.closest?.('button.node-action');
                if (!btn) return;

                const actionId = btn.dataset?.actionId;
                if (!actionId) return;

                // Skip built-ins (handled elsewhere, and some like "branch" require extra context).
                if (
                    actionId === 'reply' ||
                    actionId === 'branch' ||
                    actionId === 'summarize' ||
                    actionId === 'fetch-summarize' ||
                    actionId === 'edit-content' ||
                    actionId === 'copy' ||
                    actionId === 'create-flashcards' ||
                    actionId === 'flip-card' ||
                    actionId === 'review-card' ||
                    actionId === 'analyze' ||
                    actionId === 'edit-code' ||
                    actionId === 'generate' ||
                    actionId === 'run-code'
                ) {
                    return;
                }

                e.stopPropagation();
                this.emit(actionId, node.id);
            });
        }

        const replyBtn = div.querySelector('.reply-btn');
        const summarizeBtn = div.querySelector('.summarize-btn');
        const fetchSummarizeBtn = div.querySelector('.fetch-summarize-btn');
        const deleteBtn = div.querySelector('.delete-btn');

        if (replyBtn) {
            replyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeReply', node.id);
            });
        }

        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeSummarize', node.id);
            });
        }

        if (fetchSummarizeBtn) {
            fetchSummarizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeFetchSummarize', node.id);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeDelete', node.id);
            });
        }

        // Copy button - use event/callback if available, otherwise use protocol directly
        const copyBtn = div.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // Check if there are listeners (legacy callback or event listeners)
                if (this.onNodeCopy || this.events.listenerCount('nodeCopy') > 0) {
                    // Use app callback/event
                    this.emit('nodeCopy', node.id);
                } else {
                    // Use protocol directly (nodes handle their own formatting)
                    try {
                        const wrapped = wrapNode(node);
                        await wrapped.copyToClipboard(this, null);
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
                this.emit('nodeEditContent', node.id);
            });
        }

        // Create flashcards button
        const createFlashcardsBtn = div.querySelector('.create-flashcards-btn');
        if (createFlashcardsBtn) {
            createFlashcardsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('createFlashcards', node.id);
            });
        }

        // Review card button (flashcard nodes)
        const reviewCardBtn = div.querySelector('.review-card-btn');
        if (reviewCardBtn) {
            reviewCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('reviewCard', node.id);
            });
        }

        // Flip card button (flashcard nodes)
        const flipCardBtn = div.querySelector('.flip-card-btn');
        if (flipCardBtn) {
            flipCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('flipCard', node.id);
            });
        }

        // Stop generation button (AI nodes only)
        const stopBtn = div.querySelector('.stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeStopGeneration', node.id);
            });
        }

        // Continue generation button (AI nodes only)
        const continueBtn = div.querySelector('.continue-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeContinueGeneration', node.id);
            });
        }

        // Fit to viewport button
        const fitViewportBtn = div.querySelector('.fit-viewport-btn');
        if (fitViewportBtn) {
            fitViewportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeFitToViewport', node.id);
            });
        }

        // Reset size button
        const resetSizeBtn = div.querySelector('.reset-size-btn');
        if (resetSizeBtn) {
            resetSizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeResetSize', node.id);
            });
        }

        // Navigation buttons - parent
        const navParentBtn = div.querySelector('.nav-parent-btn');
        if (navParentBtn) {
            navParentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('navParentClick', node.id, navParentBtn);
            });
        }

        // Navigation buttons - child
        const navChildBtn = div.querySelector('.nav-child-btn');
        if (navChildBtn) {
            navChildBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('navChildClick', node.id, navChildBtn);
            });
        }

        // Collapse/expand button
        const collapseBtn = div.querySelector('.collapse-btn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeCollapse', node.id);
            });
        }

        // Analyze button (CSV nodes)
        const analyzeBtn = div.querySelector('.analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeAnalyze', node.id);
            });
        }

        // Run code button (Code nodes)
        const runCodeBtn = div.querySelector('.run-code-btn');
        if (runCodeBtn) {
            runCodeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeRunCode', node.id);
            });
        }

        // Generate code button (Code nodes)
        const generateBtn = div.querySelector('.generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeGenerate', node.id);
            });
        }

        // Edit code button (Code nodes) - opens modal editor
        const editCodeBtn = div.querySelector('.edit-code-btn');
        if (editCodeBtn) {
            editCodeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeEditCode', node.id);
            });
        }

        // Note: Syntax highlighting for Code nodes is now handled by CodeNode.getEventBindings()

        // Code output drawer toggle/clear buttons
        const outputToggle = div.querySelector('.code-output-toggle');
        if (outputToggle) {
            outputToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeOutputToggle', node.id);
            });
        }

        const outputClear = div.querySelector('.code-output-clear');
        if (outputClear) {
            outputClear.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('nodeOutputClear', node.id);
            });
        }

        // Tag remove buttons - set up dedicated listeners for each tag
        // Use capture phase to ensure it fires before tag chip handler
        const tagRemoveButtons = div.querySelectorAll('.node-tag-remove');
        tagRemoveButtons.forEach((removeBtn) => {
            removeBtn.addEventListener(
                'click',
                (e) => {
                    // Ensure we're actually clicking the remove button or its child
                    if (!e.target.closest('.node-tag-remove')) {
                        return;
                    }
                    e.stopPropagation();
                    e.preventDefault();
                    const tagEl = removeBtn.closest('.node-tag');
                    const color = tagEl?.dataset.color;
                    const nodeId = tagEl?.dataset.nodeId;
                    if (color && nodeId && this.onTagRemove) {
                        this.onTagRemove(nodeId, color);
                    }
                },
                true
            ); // true = capture phase
        });

        // Apply protocol-defined event bindings (for plugins and type-specific handlers)
        // This replaces hardcoded if (node.type === ...) blocks with a declarative approach
        this.applyProtocolEventBindings(div, node);

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
                this.emit('nodeTitleEdit', node.id);
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
                        y: rect.top,
                    });
                }
            });
        }

        // Tag chip click handlers (for highlighting nodes by tag)
        // Skip the remove button - it has its own handler
        const tagChips = div.querySelectorAll('.node-tag');
        tagChips.forEach((chip) => {
            chip.addEventListener('click', (e) => {
                // Don't handle clicks on the remove button
                if (e.target.closest('.node-tag-remove')) {
                    return;
                }
                e.stopPropagation();
                const color = chip.dataset.color;
                this.emit('tagChipClick', color);
            });
        });

        // Git repo node tree expand/collapse handlers
        // Handle expand/collapse for git repo file tree in node view
        // Use the same classes as modal tree (git-repo-file-tree-item, git-repo-expand-btn)
        const gitRepoExpandBtns = div.querySelectorAll('.git-repo-expand-btn');
        gitRepoExpandBtns.forEach((expandBtn) => {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const li = expandBtn.closest('.git-repo-file-tree-item');
                if (li) {
                    const childrenUl = li.querySelector('ul.git-repo-file-tree-list');
                    if (childrenUl) {
                        const isCurrentlyExpanded = childrenUl.style.display !== 'none';
                        const willBeExpanded = !isCurrentlyExpanded;

                        // Toggle display
                        childrenUl.style.display = willBeExpanded ? 'block' : 'none';

                        // Update arrow icon to match new state
                        const icon = expandBtn.querySelector('.git-repo-expand-icon');
                        if (icon) {
                            icon.textContent = willBeExpanded ? '▼' : '▶';
                        }
                        expandBtn.classList.toggle('expanded', willBeExpanded);
                    }
                }
            });
        });

        // Handle file clicks to open drawer (only for fetched files)
        // 1. Files in the main content tree
        const gitRepoFileLabels = div.querySelectorAll('.git-repo-file-fetched-label[data-file-path]');
        gitRepoFileLabels.forEach((label) => {
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const filePath = label.dataset.filePath;
                if (filePath) {
                    this.selectGitRepoFile(node.id, filePath);
                }
            });
        });

        // 2. Files in the drawer file list
        const gitRepoFileListItems = div.querySelectorAll('.git-repo-file-list-item[data-file-path]');
        gitRepoFileListItems.forEach((item) => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const filePath = item.dataset.filePath;
                if (filePath) {
                    this.selectGitRepoFile(node.id, filePath);
                }
            });
        });
    }

    /**
     * Select a file in a git repo node and open the drawer
     * @param {string} nodeId - Node ID
     * @param {string} filePath - File path to select
     */
    selectGitRepoFile(nodeId, filePath) {
        // Access graph via window.app (Canvas doesn't have direct graph reference)
        const graph = window.app?.graph;
        if (!graph) {
            console.warn('[Canvas] selectGitRepoFile: graph not available');
            return;
        }

        const currentNode = graph.getNode(nodeId);
        if (!currentNode) {
            console.warn('[Canvas] selectGitRepoFile: node not found', { nodeId, filePath });
            return;
        }

        if (!currentNode.gitRepoData) {
            console.warn('[Canvas] selectGitRepoFile: node has no gitRepoData', {
                nodeId,
                filePath,
                nodeType: currentNode.type,
                nodeKeys: Object.keys(currentNode).slice(0, 10),
            });
            return;
        }

        if (!currentNode.gitRepoData.files) {
            console.warn('[Canvas] selectGitRepoFile: gitRepoData has no files', {
                nodeId,
                filePath,
                gitRepoDataKeys: Object.keys(currentNode.gitRepoData),
                gitRepoDataFilesType: typeof currentNode.gitRepoData.files,
            });
            return;
        }

        // Try to find the file - the path might not match exactly due to normalization
        let actualFilePath = filePath;
        const files = currentNode.gitRepoData.files;

        // First try exact match
        if (!files[filePath]) {
            // Try case-insensitive match
            const lowerPath = filePath.toLowerCase();
            actualFilePath = Object.keys(files).find((key) => key.toLowerCase() === lowerPath);

            // If still not found, try matching by filename (last part of path)
            if (!actualFilePath) {
                const fileName = filePath.split('/').pop();
                actualFilePath = Object.keys(files).find((key) => key.split('/').pop() === fileName);
            }

            // If still not found, log available keys for debugging
            if (!actualFilePath) {
                console.warn('[Canvas] selectGitRepoFile: file path not found', {
                    requested: filePath,
                    availableKeys: Object.keys(files).slice(0, 10), // First 10 for debugging
                    totalFiles: Object.keys(files).length,
                });
                return;
            }
        }

        // Set selected file and open drawer (use actualFilePath which matches the key in files dict)
        graph.updateNode(nodeId, {
            selectedFilePath: actualFilePath,
            outputExpanded: true,
            outputPanelHeight: currentNode.outputPanelHeight || 300, // Default height
        });

        // Get the updated node (updateNode is synchronous)
        const updatedNode = graph.getNode(nodeId);
        if (!updatedNode) {
            console.warn('[Canvas] selectGitRepoFile: node not found after update', nodeId);
            return;
        }

        // Get the wrapper element
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) {
            console.warn('[Canvas] selectGitRepoFile: wrapper not found', nodeId);
            return;
        }

        // Update file selection highlight in the tree (without re-rendering the whole node)
        // Remove previous selection highlight
        wrapper.querySelectorAll('.git-repo-file-view-selected').forEach((el) => {
            el.classList.remove('git-repo-file-view-selected');
        });

        // Add selection highlight to the clicked file
        // Find the file label with matching data-file-path
        const fileLabels = wrapper.querySelectorAll('.git-repo-file-fetched-label[data-file-path]');
        for (const label of fileLabels) {
            const labelPath = label.dataset.filePath;
            if (
                labelPath === actualFilePath ||
                labelPath.toLowerCase() === actualFilePath.toLowerCase() ||
                labelPath.split('/').pop() === actualFilePath.split('/').pop()
            ) {
                // Add highlight to the parent li element
                const li = label.closest('.git-repo-file-tree-item');
                if (li) {
                    li.classList.add('git-repo-file-view-selected');
                }
                break;
            }
        }

        // Clear existing output panel from map BEFORE calling renderOutputPanel
        // This ensures the animation runs when switching files (hadExistingPanel will be false)
        const existingPanel = this.outputPanels.get(nodeId);
        if (existingPanel) {
            existingPanel.remove();
            this.outputPanels.delete(nodeId);
        }

        // Render/update only the output panel (not the entire node content)
        // This preserves the scroll position of the file tree
        const wrapped = wrapNode(updatedNode);
        if (wrapped.hasOutput && wrapped.hasOutput()) {
            this.renderOutputPanel(updatedNode, wrapper, { skipAnimation: false });
        }
    }

    /**
     * Update node content (for streaming)
     * @param nodeId
     * @param content
     * @param isStreaming
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
     * Update node title/summary text (for remote sync)
     * @param {string} nodeId - Node ID
     * @param {Object} node - Full node object with title, summary, content
     */
    updateNodeSummary(nodeId, node) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const summaryTextEl = wrapper.querySelector('.node-summary .summary-text');
        if (summaryTextEl) {
            // Priority: title > summary > truncated content
            const displayText =
                node.title || node.summary || this.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
            summaryTextEl.textContent = displayText;
        }
    }

    /**
     * Highlight a specific cell in a matrix node
     * Uses protocol's getElement method to find the cell.
     * @param matrixNodeId
     * @param row
     * @param col
     */
    highlightMatrixCell(matrixNodeId, row, col) {
        const node = this.graph?.getNode(matrixNodeId);
        if (!node) return;

        const wrapped = wrapNode(node);
        const cell = wrapped.getElement(matrixNodeId, `.matrix-cell[data-row="${row}"][data-col="${col}"]`, this);
        if (cell) {
            cell.classList.add('highlighted');
        }
    }

    /**
     * Clear all matrix cell highlights
     * Uses protocol's getElement method to find cells.
     */
    clearMatrixCellHighlights() {
        // Query all matrix nodes and clear their highlights via protocol
        const highlightedCells = this.nodesLayer.querySelectorAll('.matrix-cell.highlighted');
        highlightedCells.forEach((cell) => cell.classList.remove('highlighted'));
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
        const _regex = new RegExp(`(${escapedText})`, 'gi');

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
     * Delegates to the highlightTextInHtml utility function.
     * @param {string} html - Original HTML content
     * @param {string} text - Text to highlight
     * @returns {string} HTML with highlighted text
     */
    highlightTextInHtml(html, text) {
        return highlightTextInHtml(document, html, text);
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
     * @param nodeId
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
     * @param nodeId
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
     * @param nodeId
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
     * @param nodeId
     */
    hideContinueButton(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const continueBtn = wrapper.querySelector('.continue-btn');
        if (continueBtn) continueBtn.style.display = 'none';
    }

    /**
     * Update code content in a code node (for AI generation streaming)
     * Re-renders the node to show updated syntax-highlighted code
     * @param {string} nodeId - The code node ID
     * @param {string} code - The code content
     * @param {boolean} isStreaming - Whether still streaming
     */

    /**
     * Update the collapse button state for a node.
     * Shows/hides the button based on whether node has children.
     * Updates icon and badge based on collapsed state.
     * @param {string} nodeId - The node ID
     * @param {boolean} hasChildren - Whether the node has children
     * @param {boolean} isCollapsed - Whether the node is currently collapsed
     * @param {number} hiddenCount - Number of hidden descendants (for badge)
     */
    updateCollapseButton(nodeId, hasChildren, isCollapsed, hiddenCount = 0) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const btn = wrapper.querySelector('.collapse-btn');
        if (!btn) return;

        if (!hasChildren) {
            btn.style.display = 'none';
            return;
        }

        btn.style.display = 'inline-flex';

        if (isCollapsed) {
            btn.textContent = hiddenCount > 0 ? `▶ +${hiddenCount}` : '▶';
            btn.title = 'Expand children';
            btn.classList.add('collapsed');
        } else {
            btn.textContent = '−';
            btn.title = 'Collapse children';
            btn.classList.remove('collapsed');
        }
    }

    /**
     * Update visibility of a node (show/hide based on graph state).
     * Uses CSS class for hiding rather than removing from DOM.
     * @param {string} nodeId - The node ID
     * @param {boolean} visible - Whether the node should be visible
     */
    updateNodeVisibility(nodeId, visible) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        if (visible) {
            wrapper.classList.remove('collapsed-hidden');
        } else {
            wrapper.classList.add('collapsed-hidden');
        }

        // Also update edges connected to this node
        this.updateEdgeVisibility(nodeId, visible);
    }

    /**
     * Update visibility of edges connected to a node.
     * An edge is hidden if either its source or target node is hidden.
     * @param {string} nodeId - The node ID whose edges should be checked
     * @param {boolean} _nodeVisible - Whether the node is visible
     */
    updateEdgeVisibility(nodeId, _nodeVisible) {
        for (const [_edgeId, edgeEl] of this.edgeElements) {
            const source = edgeEl.getAttribute('data-source');
            const target = edgeEl.getAttribute('data-target');

            if (source === nodeId || target === nodeId) {
                const sourceWrapper = this.nodeElements.get(source);
                const targetWrapper = this.nodeElements.get(target);

                const sourceVisible = sourceWrapper && !sourceWrapper.classList.contains('collapsed-hidden');
                const targetVisible = targetWrapper && !targetWrapper.classList.contains('collapsed-hidden');

                if (sourceVisible && targetVisible) {
                    edgeEl.classList.remove('collapsed-hidden');
                } else {
                    edgeEl.classList.add('collapsed-hidden');
                }
            }
        }
    }

    /**
     * Update the visual state of an edge based on collapse state.
     * @param {string} edgeId - The edge ID
     * @param {string} state - 'visible', 'hidden', or 'collapsed-path'
     */
    updateEdgeState(edgeId, state) {
        const edgeEl = this.edgeElements.get(edgeId);
        if (!edgeEl) return;

        // Remove all state classes first
        edgeEl.classList.remove('collapsed-hidden', 'collapsed-path');

        switch (state) {
            case 'hidden':
                edgeEl.classList.add('collapsed-hidden');
                break;
            case 'collapsed-path':
                edgeEl.classList.add('collapsed-path');
                break;
            case 'visible':
            default:
                // No additional classes needed
                break;
        }
    }

    /**
     * Show an error state on a node with retry/dismiss buttons
     * @param nodeId
     * @param errorInfo
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
                    this.emit('nodeRetry', nodeId);
                });
            }

            if (dismissBtn) {
                dismissBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.emit('nodeDismissError', nodeId);
                });
            }
        }
    }

    /**
     * Clear error state on a node
     * @param nodeId
     */
    clearNodeError(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;

        const div = wrapper.querySelector('.node');
        if (div) div.classList.remove('error-node');
    }

    /**
     * Show brief copy feedback on a node
     * @param nodeId
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
     * @param nodeId
     */
    removeNode(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (wrapper) {
            wrapper.remove();
            this.nodeElements.delete(nodeId);
        }

        // Also remove output panel if exists
        const outputPanel = this.outputPanels.get(nodeId);
        if (outputPanel) {
            outputPanel.remove();
            this.outputPanels.delete(nodeId);
        }

        this._removeDeferredEdgesForNode(nodeId);
        this.selectedNodes.delete(nodeId);
    }

    /**
     * Select a node
     * @param nodeId
     * @param isMulti
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

        this.emit('nodeSelect', Array.from(this.selectedNodes));
    }

    /**
     * Deselect a node
     * @param nodeId
     */
    deselectNode(nodeId) {
        this.selectedNodes.delete(nodeId);
        const wrapper = this.nodeElements.get(nodeId);
        if (wrapper) {
            wrapper.querySelector('.node')?.classList.remove('selected');
        }

        this.updateFadedState();

        this.emit('nodeDeselect', Array.from(this.selectedNodes));
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

        this.emit('nodeDeselect', []);
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
     * @returns {string[]}
     */
    getSelectedNodeIds() {
        return Array.from(this.selectedNodes);
    }

    /**
     * Get actual rendered dimensions for all nodes
     * Returns Map of nodeId -> { width, height }
     * @returns {Map<string, {width: number, height: number}>}
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
     * @param ancestorIds
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

    /**
     * Highlight nodes that have a specific tag, fading out all other nodes.
     * Pass null to clear the highlighting.
     * @param {string|null} tagColor - The tag color to highlight, or null to clear
     */
    highlightNodesByTag(tagColor) {
        // Clear previous tag highlighting
        for (const wrapper of this.nodeElements.values()) {
            const node = wrapper.querySelector('.node');
            if (node) {
                node.classList.remove('faded', 'tag-highlighted');
            }
        }

        // Also clear faded state on edges
        for (const edge of this.edgeElements.values()) {
            edge.classList.remove('faded');
        }

        if (!tagColor) return; // Clear mode - just remove highlighting

        // Apply faded to non-tagged nodes, highlight to tagged nodes
        for (const wrapper of this.nodeElements.values()) {
            const node = wrapper.querySelector('.node');
            if (!node) continue;

            const hasTag = wrapper.querySelector(`.node-tag[data-color="${tagColor}"]`);
            if (hasTag) {
                node.classList.add('tag-highlighted');
            } else {
                node.classList.add('faded');
            }
        }

        // Fade edges that don't connect two highlighted nodes
        for (const [_edgeId, edgePath] of this.edgeElements) {
            const sourceId = edgePath.dataset.source;
            const targetId = edgePath.dataset.target;
            const sourceWrapper = this.nodeElements.get(sourceId);
            const targetWrapper = this.nodeElements.get(targetId);

            const sourceHasTag = sourceWrapper?.querySelector(`.node-tag[data-color="${tagColor}"]`);
            const targetHasTag = targetWrapper?.querySelector(`.node-tag[data-color="${tagColor}"]`);

            // Fade edge unless both ends have the tag
            if (!sourceHasTag || !targetHasTag) {
                edgePath.classList.add('faded');
            }
        }
    }

    // --- Edge Rendering ---

    /**
     * Render an edge as a bezier curve.
     * Supports two signatures:
     * 1. renderEdge(edge, graph) - Automatically fetches fresh positions (Recommended)
     * 2. renderEdge(edge, sourcePos, targetPos) - Uses explicit positions (Legacy/Internal)
     *
     * @param {Object} edge - The edge object
     * @param {Object|Graph} sourcePosOrGraph - Source position {x,y} OR Graph instance
     * @param {Object} [targetPos] - Target position {x,y} (only for legacy signature)
     * @returns {SVGPathElement|null}
     */
    renderEdge(edge, sourcePosOrGraph, targetPos) {
        let sourcePos, finalTargetPos;

        // Signature 1: renderEdge(edge, graph)
        // Detect graph by checking for getNode method
        if (sourcePosOrGraph && typeof sourcePosOrGraph.getNode === 'function') {
            const _usingGraphSignature = true;
            const graph = sourcePosOrGraph;
            const sourceNode = graph.getNode(edge.source);
            const targetNode = graph.getNode(edge.target);

            if (!sourceNode || !targetNode) {
                console.warn(`[Canvas] Cannot render edge ${edge.id}: nodes not found in graph`);
                return null;
            }
            sourcePos = sourceNode.position;
            finalTargetPos = targetNode.position;

            // DEFENSIVE: When using graph signature, check if nodes are rendered in DOM
            // This prevents race conditions where edges are added before nodes finish rendering
            const sourceWrapper = this.nodeElements.get(edge.source);
            const targetWrapper = this.nodeElements.get(edge.target);

            if (!sourceWrapper || !targetWrapper) {
                // One or both nodes not rendered yet - defer this edge
                console.log(
                    `[Canvas] Deferring edge ${edge.id} until nodes render (source: ${!!sourceWrapper}, target: ${!!targetWrapper})`
                );
                this.deferredEdges.set(edge.id, { edge, sourcePosOrGraph, targetPos });

                // Register callbacks for missing nodes
                if (!sourceWrapper) {
                    this._addNodeRenderCallback(edge.source, () => this._retryDeferredEdge(edge.id));
                }
                if (!targetWrapper) {
                    this._addNodeRenderCallback(edge.target, () => this._retryDeferredEdge(edge.id));
                }

                return null;
            }
        } else {
            // Signature 2: renderEdge(edge, sourcePos, targetPos)
            // Legacy signature - caller provides explicit positions, skip defensive check
            sourcePos = sourcePosOrGraph;
            finalTargetPos = targetPos;
        }

        // Both nodes exist - proceed with normal rendering
        // Remove existing edge if present
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
        const d = this.calculateBezierPath(sourcePos, { width: sourceWidth, height: sourceHeight }, finalTargetPos, {
            width: targetWidth,
            height: targetHeight,
        });
        path.setAttribute('d', d);

        // Add arrowhead
        const isCell = edge.type === 'matrix-cell';
        path.setAttribute('marker-end', isCell ? 'url(#arrowhead-cell)' : 'url(#arrowhead)');

        this.edgesLayer.appendChild(path);
        this.edgeElements.set(edge.id, path);

        return path;
    }

    /**
     * Register callback to fire when a node finishes rendering
     * @param nodeId
     * @param callback
     * @private
     */
    _addNodeRenderCallback(nodeId, callback) {
        if (!this.nodeRenderCallbacks.has(nodeId)) {
            this.nodeRenderCallbacks.set(nodeId, []);
        }
        this.nodeRenderCallbacks.get(nodeId).push(callback);
    }

    /**
     * Retry rendering a deferred edge
     * @param edgeId
     * @private
     */
    _retryDeferredEdge(edgeId) {
        const deferred = this.deferredEdges.get(edgeId);
        if (!deferred) return;

        const { edge, sourcePosOrGraph, targetPos } = deferred;

        // Try rendering again (will defer again if still missing nodes)
        const result = this.renderEdge(edge, sourcePosOrGraph, targetPos);

        // If successful, remove from deferred queue
        if (result) {
            this.deferredEdges.delete(edgeId);
            console.log(`[Canvas] Successfully rendered deferred edge ${edgeId}`);
        }
    }

    /**
     * Notify that a node has finished rendering
     * Called at end of renderNode()
     * @param nodeId
     * @private
     */
    _notifyNodeRendered(nodeId) {
        const callbacks = this.nodeRenderCallbacks.get(nodeId);
        if (!callbacks) return;

        // Fire all callbacks waiting for this node
        for (const callback of callbacks) {
            callback();
        }

        // Clean up
        this.nodeRenderCallbacks.delete(nodeId);
    }

    /**
     *
     * @param nodeId
     */
    _removeDeferredEdgesForNode(nodeId) {
        if (this.nodeRenderCallbacks.has(nodeId)) {
            this.nodeRenderCallbacks.delete(nodeId);
        }

        for (const [edgeId, deferred] of this.deferredEdges) {
            if (deferred.edge?.source === nodeId || deferred.edge?.target === nodeId) {
                this.deferredEdges.delete(edgeId);
            }
        }
    }

    /**
     * Render or update a virtual collapsed-path edge from a collapsed node to a visible descendant.
     * These edges are dashed and show the connection through hidden nodes.
     * If the edge already exists, updates its path in place (no re-creation).
     * @param {string} sourceId - The collapsed node ID
     * @param {string} targetId - The visible descendant node ID
     * @param {Object} sourcePos - Source node position {x, y}
     * @param {Object} targetPos - Target node position {x, y}
     * @returns {void}
     */
    renderCollapsedPathEdge(sourceId, targetId, sourcePos, targetPos) {
        const virtualEdgeId = `collapsed-path-${sourceId}-${targetId}`;

        // Get node dimensions from DOM
        const sourceWrapper = this.nodeElements.get(sourceId);
        const targetWrapper = this.nodeElements.get(targetId);

        const sourceWidth = sourceWrapper ? parseFloat(sourceWrapper.getAttribute('width')) || 420 : 420;
        const sourceHeight = sourceWrapper ? parseFloat(sourceWrapper.getAttribute('height')) || 100 : 100;
        const targetWidth = targetWrapper ? parseFloat(targetWrapper.getAttribute('width')) || 420 : 420;
        const targetHeight = targetWrapper ? parseFloat(targetWrapper.getAttribute('height')) || 100 : 100;

        // Calculate bezier curve
        const d = this.calculateBezierPath(sourcePos, { width: sourceWidth, height: sourceHeight }, targetPos, {
            width: targetWidth,
            height: targetHeight,
        });

        // Check if edge already exists
        const existingPath = this.edgeElements.get(virtualEdgeId);
        if (existingPath) {
            // Update path in place - no recreation, no animation restart
            existingPath.setAttribute('d', d);
            return existingPath;
        }

        // Create new edge
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'edge collapsed-path');
        path.setAttribute('data-edge-id', virtualEdgeId);
        path.setAttribute('data-source', sourceId);
        path.setAttribute('data-target', targetId);
        path.setAttribute('data-virtual', 'true');
        path.setAttribute('d', d);

        // Add arrowhead
        path.setAttribute('marker-end', 'url(#arrowhead)');

        this.edgesLayer.appendChild(path);
        this.edgeElements.set(virtualEdgeId, path);

        return path;
    }

    /**
     * Remove a virtual collapsed-path edge.
     * @param {string} sourceId - The collapsed node ID
     * @param {string} targetId - The visible descendant node ID
     */
    removeCollapsedPathEdge(sourceId, targetId) {
        const virtualEdgeId = `collapsed-path-${sourceId}-${targetId}`;
        const existing = this.edgeElements.get(virtualEdgeId);
        if (existing) {
            existing.remove();
            this.edgeElements.delete(virtualEdgeId);
        }
    }

    /**
     * Remove all virtual collapsed-path edges.
     */
    removeAllCollapsedPathEdges() {
        const toRemove = [];
        for (const [edgeId, edgeEl] of this.edgeElements) {
            if (edgeEl.getAttribute('data-virtual') === 'true') {
                toRemove.push(edgeId);
            }
        }
        for (const edgeId of toRemove) {
            const el = this.edgeElements.get(edgeId);
            if (el) el.remove();
            this.edgeElements.delete(edgeId);
        }
    }

    /**
     * Calculate the best connection point on a node's border
     * Returns {x, y, side} where side is 'top', 'bottom', 'left', 'right'
     * @param {Object} nodePos
     * @param {Object} nodeSize
     * @param {Object} otherCenter
     * @returns {{x: number, y: number, side: string}}
     */
    getConnectionPoint(nodePos, nodeSize, otherCenter) {
        const center = {
            x: nodePos.x + nodeSize.width / 2,
            y: nodePos.y + nodeSize.height / 2,
        };

        // Calculate angle from this node's center to the other node's center
        const dx = otherCenter.x - center.x;
        const dy = otherCenter.y - center.y;
        const angle = Math.atan2(dy, dx);

        // Determine which side to connect based on angle
        // Right: -45° to 45°, Bottom: 45° to 135°, Left: 135° to -135°, Top: -135° to -45°
        const PI = Math.PI;
        let side, x, y;

        if (angle >= -PI / 4 && angle < PI / 4) {
            // Right side
            side = 'right';
            x = nodePos.x + nodeSize.width;
            y = center.y;
        } else if (angle >= PI / 4 && angle < (3 * PI) / 4) {
            // Bottom side
            side = 'bottom';
            x = center.x;
            y = nodePos.y + nodeSize.height;
        } else if (angle >= (-3 * PI) / 4 && angle < -PI / 4) {
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
     * @param {Object} sourcePos
     * @param {Object} sourceSize
     * @param {Object} targetPos
     * @param {Object} targetSize
     * @returns {string}
     */
    calculateBezierPath(sourcePos, sourceSize, targetPos, targetSize) {
        // Calculate centers
        const sourceCenter = {
            x: sourcePos.x + sourceSize.width / 2,
            y: sourcePos.y + sourceSize.height / 2,
        };
        const targetCenter = {
            x: targetPos.x + targetSize.width / 2,
            y: targetPos.y + targetSize.height / 2,
        };

        // Get optimal connection points
        const sourcePoint = this.getConnectionPoint(sourcePos, sourceSize, targetCenter);
        const targetPoint = this.getConnectionPoint(targetPos, targetSize, sourceCenter);

        // Calculate control points based on which sides are connected
        const distance = Math.sqrt(
            Math.pow(targetPoint.x - sourcePoint.x, 2) + Math.pow(targetPoint.y - sourcePoint.y, 2)
        );
        const controlOffset = Math.min(distance * 0.4, 150);

        let cp1x, cp1y, cp2x, cp2y;

        // Control point direction based on exit/entry side
        switch (sourcePoint.side) {
            case 'right':
                cp1x = sourcePoint.x + controlOffset;
                cp1y = sourcePoint.y;
                break;
            case 'left':
                cp1x = sourcePoint.x - controlOffset;
                cp1y = sourcePoint.y;
                break;
            case 'top':
                cp1x = sourcePoint.x;
                cp1y = sourcePoint.y - controlOffset;
                break;
            case 'bottom':
                cp1x = sourcePoint.x;
                cp1y = sourcePoint.y + controlOffset;
                break;
        }

        switch (targetPoint.side) {
            case 'right':
                cp2x = targetPoint.x + controlOffset;
                cp2y = targetPoint.y;
                break;
            case 'left':
                cp2x = targetPoint.x - controlOffset;
                cp2y = targetPoint.y;
                break;
            case 'top':
                cp2x = targetPoint.x;
                cp2y = targetPoint.y - controlOffset;
                break;
            case 'bottom':
                cp2x = targetPoint.x;
                cp2y = targetPoint.y + controlOffset;
                break;
        }

        return `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetPoint.x} ${targetPoint.y}`;
    }

    /**
     * Update edge positions when a node moves
     * @param nodeId
     * @param newPos
     */
    updateEdgesForNode(nodeId, newPos) {
        for (const [_edgeId, path] of this.edgeElements) {
            const sourceId = path.getAttribute('data-source');
            const targetId = path.getAttribute('data-target');

            if (sourceId === nodeId || targetId === nodeId) {
                // Get wrappers for dimensions
                const sourceWrapper = this.nodeElements.get(sourceId);
                const targetWrapper = this.nodeElements.get(targetId);

                if (sourceWrapper && targetWrapper) {
                    const sourcePos = {
                        x: parseFloat(sourceWrapper.getAttribute('x')),
                        y: parseFloat(sourceWrapper.getAttribute('y')),
                    };
                    const targetPos = {
                        x: parseFloat(targetWrapper.getAttribute('x')),
                        y: parseFloat(targetWrapper.getAttribute('y')),
                    };
                    const sourceSize = {
                        width: parseFloat(sourceWrapper.getAttribute('width')) || 420,
                        height: parseFloat(sourceWrapper.getAttribute('height')) || 100,
                    };
                    const targetSize = {
                        width: parseFloat(targetWrapper.getAttribute('width')) || 420,
                        height: parseFloat(targetWrapper.getAttribute('height')) || 100,
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
     * Start resizing the index column in a matrix node
     * @deprecated Use protocol.handleCustomResize() instead
     * This method is kept for backwards compatibility but delegates to the protocol.
     * @param {MouseEvent} e - The mousedown event
     * @param {string} nodeId - The matrix node's ID
     * @param {HTMLElement} _nodeDiv - The node's DOM element
     */
    startIndexColResize(e, nodeId, _nodeDiv) {
        const node = this.graph?.getNode(nodeId);
        if (!node) return;

        const wrapped = wrapNode(node);
        if (wrapped.handleCustomResize) {
            wrapped.handleCustomResize(e, nodeId, this);
        }
    }

    /**
     * Remove an edge from the canvas
     * @param edgeId
     */
    removeEdge(edgeId) {
        const path = this.edgeElements.get(edgeId);
        if (path) {
            path.remove();
            this.edgeElements.delete(edgeId);
        }
        this.deferredEdges.delete(edgeId);
    }

    // --- Utilities ---

    /**
     *
     * @param {string} type
     * @returns {string}
     */
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

    /**
     *
     * @param {string} type
     * @returns {string}
     */
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
     * @param {string} type
     * @returns {boolean}
     */
    isRichContentNodeType(type) {
        const richTypes = [
            NodeType.FETCH_RESULT,
            NodeType.PDF,
            NodeType.NOTE,
            NodeType.AI,
            NodeType.RESEARCH,
            NodeType.REFERENCE,
        ];
        return richTypes.includes(type);
    }

    /**
     *
     * @param {Object} node
     * @returns {string}
     */
    getNodeSummaryText(node) {
        // Use protocol pattern
        const wrapped = wrapNode(node);
        return wrapped.getSummaryText(this);
    }

    /**
     *
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        return escapeHtmlText(text);
    }

    /**
     *
     * @param {string} text
     * @param {number} maxLength
     * @returns {string}
     */
    truncate(text, maxLength) {
        return truncateText(text, maxLength);
    }

    /**
     * Copy an image to the clipboard.
     * Converts base64 image data to a PNG blob and writes to clipboard.
     *
     * @param {string} imageData - Base64 encoded image data (without data URL prefix)
     * @param {string} mimeType - MIME type of the image (e.g., 'image/png', 'image/jpeg')
     * @returns {Promise<void>}
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
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } else {
            // Convert to PNG using canvas
            const blob = new Blob([byteArray], { type: mimeType || 'image/png' });
            const imageBitmap = await createImageBitmap(blob);

            const canvas = document.createElement('canvas');
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);

            const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        }
    }

    /**
     * Render tags for a node (left side, post-it style with arrows)
     * @param {Object} node
     * @returns {string}
     */
    renderNodeTags(node) {
        if (!node.tags || node.tags.length === 0) {
            return '';
        }

        // Get tag definitions from the graph (accessed via app.graph)
        const graph = window.app?.graph;
        if (!graph) return '';

        const tagsHtml = node.tags
            .map((color) => {
                const tag = graph.getTag(color);
                if (!tag) return '';
                return `<div class="node-tag" data-color="${color}" data-node-id="${node.id}">
                    <span class="node-tag-name">${this.escapeHtml(tag.name)}</span>
                    <button class="node-tag-remove" title="Remove tag" aria-label="Remove tag">✕</button>
                </div>`;
            })
            .filter((h) => h)
            .join('');

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
                marked.use(
                    markedKatex({
                        throwOnError: false,
                        nonStandard: true, // Enables \(...\) and \[...\] delimiters
                    })
                );
                console.log('[Canvas] KaTeX extension configured');
            } else {
                console.warn('[Canvas] markedKatex not available - math rendering will not work');
            }

            // Configure marked with custom link renderer and other options
            marked.use({
                breaks: true, // Convert \n to <br> within paragraphs
                gfm: true, // GitHub Flavored Markdown
                renderer: {
                    link({ href, title, text }) {
                        const titleAttr = title ? ` title="${title}"` : '';
                        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
                    },
                },
            });

            Canvas.markedConfigured = true;
            console.log('[Canvas] marked.js configuration complete');
        } catch (e) {
            console.error('[Canvas] Error configuring marked:', e);
        }
    }

    /**
     * Render markdown to HTML with math support
     * @param {string} text
     * @returns {string}
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
                                throwOnError: false,
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
                            result = result.replace(
                                block.type === 'display' ? displayPlaceholder : inlinePlaceholder,
                                errorHtml
                            );
                        }
                    }
                }

                // Strip <style> and <script> so node content cannot break the app UI
                // (e.g. body { display: none } or .node { visibility: hidden }).
                // Backend converts fetched HTML to markdown, but we defend in depth.
                result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

                // Debug logging for math content
                if (text.includes('\\[') || text.includes('\\(') || text.includes('$$')) {
                    console.log('[Canvas] Rendering markdown with math:', {
                        input: text.substring(0, 100),
                        mathBlocksFound: mathBlocks.length,
                        output: result.substring(0, 200),
                        hasKatex: result.includes('katex'),
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
     * @param graph
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

    // EventEmitter convenience methods
    /**
     * Register an event listener
     * @param {string} event - Event name (e.g., 'nodeSelect', 'nodeDelete')
     * @param {Function} listener - Callback function
     * @returns {Canvas} this for chaining
     */
    on(event, listener) {
        this.events.on(event, listener);
        return this;
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Callback function to remove
     * @returns {Canvas} this for chaining
     */
    off(event, listener) {
        this.events.off(event, listener);
        return this;
    }

    /**
     * Emit an event with arguments
     * Also calls legacy callback if defined for backward compatibility
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to listeners
     * @returns {boolean} true if event had listeners or legacy callback
     */
    emit(event, ...args) {
        // Call legacy callback if defined (backward compatibility)
        const callbackName = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
        const hasLegacyCallback = typeof this[callbackName] === 'function';
        if (hasLegacyCallback) {
            this[callbackName](...args);
        }
        // Emit to EventEmitter listeners
        const hadListeners = this.events.emit(event, ...args);
        return hasLegacyCallback || hadListeners;
    }
}

// Export
export { Canvas };
