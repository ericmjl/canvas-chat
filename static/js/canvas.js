/**
 * Canvas module - SVG-based pan/zoom canvas with node rendering
 */

class Canvas {
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
        this.onNodeTitleEdit = null;  // For editing node title in semantic zoom
        this.onNodeStopGeneration = null;  // For stopping LLM generation
        this.onNodeContinueGeneration = null;  // For continuing stopped generation
        this.onNodeRetry = null;  // For retrying failed operations
        this.onNodeDismissError = null;  // For dismissing error nodes
        this.onNodeFitToViewport = null;  // For resizing node to 80% of viewport
        this.onNodeEditContent = null;  // For editing node content (FETCH_RESULT)
        this.onNodeResummarize = null;  // For re-summarizing edited content
        
        // Reply tooltip state
        this.branchTooltip = null;
        this.activeSelectionNodeId = null;
        this.pendingSelectedText = null;  // Store selected text when tooltip opens
        
        this.init();
    }

    init() {
        this.updateViewBox();
        this.setupEventListeners();
        this.handleResize();
        this.createBranchTooltip();
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
            // Hide tooltip when clicking outside of it
            if (!e.target.closest('.reply-tooltip')) {
                this.hideBranchTooltip();
            }
        });
        
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
        // Check if scrolling inside a node's scrollable content
        const scrollableContent = e.target.closest('.node-content');
        if (scrollableContent) {
            const node = scrollableContent.closest('.node');
            // Only allow internal scrolling if node is viewport-fitted (has scrollable content)
            if (node && node.classList.contains('viewport-fitted')) {
                // Check if content can scroll in the wheel direction
                const canScrollUp = scrollableContent.scrollTop > 0;
                const canScrollDown = scrollableContent.scrollTop < (scrollableContent.scrollHeight - scrollableContent.clientHeight);
                const canScrollLeft = scrollableContent.scrollLeft > 0;
                const canScrollRight = scrollableContent.scrollLeft < (scrollableContent.scrollWidth - scrollableContent.clientWidth);
                
                // Determine scroll direction from wheel delta
                const scrollingDown = e.deltaY > 0;
                const scrollingUp = e.deltaY < 0;
                const scrollingRight = e.deltaX > 0;
                const scrollingLeft = e.deltaX < 0;
                
                // If content can scroll in the requested direction, let it scroll naturally
                const shouldScrollVertically = (scrollingDown && canScrollDown) || (scrollingUp && canScrollUp);
                const shouldScrollHorizontally = (scrollingRight && canScrollRight) || (scrollingLeft && canScrollLeft);
                
                if (shouldScrollVertically || shouldScrollHorizontally) {
                    // Don't prevent default - let the content scroll
                    return;
                }
            }
        }
        
        e.preventDefault();
        
        const rect = this.container.getBoundingClientRect();
        
        // Check if this is a pinch-to-zoom gesture (ctrlKey is set by trackpad pinch)
        if (e.ctrlKey || e.metaKey) {
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
            // Two-finger pan (regular scroll)
            const dx = e.deltaX / this.scale;
            const dy = e.deltaY / this.scale;
            
            this.viewBox.x += dx;
            this.viewBox.y += dy;
            
            this.updateViewBox();
        }
    }

    handleDoubleClick(e) {
        // Double-click on empty space to fit content
        if (e.target === this.svg || e.target.closest('#edges-layer')) {
            this.fitToContent();
        }
    }

    // --- Touch Event Handlers (for mobile/tablet) ---

    handleTouchStart(e) {
        if (e.target.closest('.node')) return;
        
        const touches = Array.from(e.touches);
        this.touchState.touches = touches.map(t => ({ x: t.clientX, y: t.clientY }));
        
        if (touches.length === 2) {
            // Two fingers - prepare for pinch/pan
            e.preventDefault();
            this.touchState.isPinching = true;
            this.touchState.lastDistance = this.getTouchDistance(touches);
            this.touchState.lastCenter = this.getTouchCenter(touches);
        } else if (touches.length === 1) {
            // Single finger - could be pan
            this.touchState.lastCenter = { x: touches[0].clientX, y: touches[0].clientY };
        }
    }

    handleTouchMove(e) {
        if (e.target.closest('.node')) return;
        
        const touches = Array.from(e.touches);
        
        if (touches.length === 2 && this.touchState.isPinching) {
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
            // Single finger pan (if not on a node)
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
     */
    animateToLayout(graph, options = {}) {
        const duration = options.duration || 500;
        const focusNodeId = options.focusNodeId || null;
        
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
            // No position changes, just update edges and optionally fit
            this.updateAllEdges(graph);
            if (!focusNodeId) {
                this.fitToContentAnimated(duration);
            }
            return;
        }
        
        // Calculate viewport animation if fitting to content
        let viewportAnim = null;
        if (!focusNodeId) {
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
        
        // Create node HTML - different for matrix nodes
        const div = document.createElement('div');
        // Apply viewport-fitted class if node has explicit stored dimensions (enables scrollable content)
        const hasExplicitSize = node.width && node.height;
        div.className = `node ${node.type}${hasExplicitSize ? ' viewport-fitted' : ''}`;
        div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        div.style.width = '100%';
        
        // Matrix nodes need fixed height to allow shrinking; others use min-height
        // Nodes with explicit dimensions also need fixed height for scrolling
        if (isMatrix || hasExplicitSize) {
            div.style.height = '100%';
            div.style.overflow = 'hidden';
        } else {
            div.style.minHeight = '100%';
        }
        
        if (isMatrix) {
            div.innerHTML = this.renderMatrixNodeContent(node);
        } else {
            // Render tags if present
            const tagsHtml = this.renderNodeTags(node);
            
            // Get summary text for semantic zoom
            const summaryText = this.getNodeSummaryText(node);
            const typeIcon = this.getNodeTypeIcon(node.type);
            
            div.innerHTML = `
                ${tagsHtml}
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
                    <span class="node-type">${node.type === NodeType.CELL && node.title ? node.title : this.getNodeTypeLabel(node.type)}</span>
                    <span class="node-model">${node.model || ''}</span>
                    ${node.type === NodeType.AI ? '<button class="header-btn stop-btn" title="Stop generating" style="display:none;">⏹</button>' : ''}
                    ${node.type === NodeType.AI ? '<button class="header-btn continue-btn" title="Continue generating" style="display:none;">▶</button>' : ''}
                    <button class="header-btn fit-viewport-btn" title="Fit to viewport (f)">⤢</button>
                    <button class="node-action delete-btn" title="Delete node">🗑️</button>
                </div>
                <div class="node-content">${this.renderMarkdown(node.content)}</div>
                <div class="node-actions">
                    <button class="node-action reply-btn" title="Reply">↩️ Reply</button>
                    ${node.type === NodeType.AI ? '<button class="node-action summarize-btn" title="Summarize">📝 Summarize</button>' : ''}
                    ${node.type === NodeType.REFERENCE ? '<button class="node-action fetch-summarize-btn" title="Fetch full content and summarize">📄 Fetch & Summarize</button>' : ''}
                    ${node.type === NodeType.FETCH_RESULT ? '<button class="node-action edit-content-btn" title="Edit fetched content">✏️ Edit</button>' : ''}
                    ${node.type === NodeType.FETCH_RESULT ? '<button class="node-action resummarize-btn" title="Create new summary from edited content">📝 Re-summarize</button>' : ''}
                    <button class="node-action copy-btn" title="Copy content">📋 Copy</button>
                </div>
                <div class="resize-handle resize-e" data-resize="e"></div>
                <div class="resize-handle resize-s" data-resize="s"></div>
                <div class="resize-handle resize-se" data-resize="se"></div>
            `;
        }
        
        wrapper.appendChild(div);
        this.nodesLayer.appendChild(wrapper);
        this.nodeElements.set(node.id, wrapper);
        
        // Auto-size height after render based on actual content
        // Use requestAnimationFrame to ensure DOM has rendered
        requestAnimationFrame(() => {
            const contentHeight = div.offsetHeight;
            // Use the larger of: stored height, content height, or minimum height
            const finalHeight = Math.max(contentHeight + 10, node.height || 100, 100);
            wrapper.setAttribute('height', finalHeight);
        });
        
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
                    
                    // Get minimum content height (needed for both width-only and height resizing)
                    const isMatrixNode = div.classList.contains('matrix');
                    let minContentHeight = 100;
                    
                    if (!isMatrixNode) {
                        // Temporarily remove min-height to get natural content height
                        const oldMinHeight = div.style.minHeight;
                        div.style.minHeight = 'auto';
                        minContentHeight = div.scrollHeight + 10;
                        div.style.minHeight = oldMinHeight;
                    }
                    
                    if (resizeType.includes('s')) {
                        // When resizing south, don't allow smaller than content height
                        newHeight = Math.max(minContentHeight, startHeight + dy);
                        wrapper.setAttribute('height', newHeight);
                    } else if (resizeType === 'e' && !isMatrixNode) {
                        // If only resizing width (east), auto-adjust height based on content
                        wrapper.setAttribute('height', Math.max(100, minContentHeight));
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
        
        // Copy button
        const copyBtn = div.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(node.content);
                    // Visual feedback
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                    }, 1500);
                } catch (err) {
                    console.error('Failed to copy:', err);
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
            } else {
                contentEl.innerHTML = this.renderMarkdown(content);
                contentEl.classList.remove('streaming');
            }
        }
        
        // Update height
        const div = wrapper.querySelector('.node');
        if (div) {
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
        const labels = {
            [NodeType.HUMAN]: 'You',
            [NodeType.AI]: 'AI',
            [NodeType.NOTE]: 'Note',
            [NodeType.SUMMARY]: 'Summary',
            [NodeType.REFERENCE]: 'Reference',
            [NodeType.SEARCH]: 'Search',
            [NodeType.RESEARCH]: 'Research',
            [NodeType.HIGHLIGHT]: 'Highlight',
            [NodeType.MATRIX]: 'Matrix',
            [NodeType.CELL]: 'Cell',
            [NodeType.ROW]: 'Row',
            [NodeType.COLUMN]: 'Column',
            [NodeType.FETCH_RESULT]: 'Fetched Content'
        };
        return labels[type] || type;
    }
    
    getNodeTypeIcon(type) {
        const icons = {
            [NodeType.HUMAN]: '💬',
            [NodeType.AI]: '🤖',
            [NodeType.NOTE]: '📝',
            [NodeType.SUMMARY]: '📋',
            [NodeType.REFERENCE]: '🔗',
            [NodeType.SEARCH]: '🔍',
            [NodeType.RESEARCH]: '📚',
            [NodeType.HIGHLIGHT]: '✨',
            [NodeType.MATRIX]: '📊',
            [NodeType.CELL]: '📦',
            [NodeType.ROW]: '↔️',
            [NodeType.COLUMN]: '↕️',
            [NodeType.FETCH_RESULT]: '📄'
        };
        return icons[type] || '📄';
    }

    getNodeSummaryText(node) {
        // Priority: user-set title > LLM summary > generated fallback
        if (node.title) return node.title;
        if (node.summary) return node.summary;
        
        // For matrix nodes, generate from context and dimensions
        if (node.type === NodeType.MATRIX) {
            const context = node.context || 'Matrix';
            const rows = node.rowItems?.length || 0;
            const cols = node.colItems?.length || 0;
            return `${context} (${rows}×${cols})`;
        }
        
        // For other nodes, strip markdown and truncate content
        const plainText = (node.content || '').replace(/[#*_`>\[\]()!]/g, '').trim();
        return this.truncate(plainText, 60);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    truncate(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength - 1) + '…';
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
     * Render matrix node HTML content
     */
    renderMatrixNodeContent(node) {
        const { context, rowItems, colItems, cells } = node;
        
        // Get summary text for semantic zoom (reuse same logic as other nodes)
        const summaryText = this.getNodeSummaryText(node);
        const typeIcon = this.getNodeTypeIcon(node.type);
        
        // Build table HTML
        let tableHtml = '<table class="matrix-table"><thead><tr>';
        
        // Corner cell with context
        tableHtml += `<th class="corner-cell" title="${this.escapeHtml(context)}"><span class="matrix-header-text">${this.escapeHtml(context)}</span></th>`;
        
        // Column headers - clickable to extract column
        for (let c = 0; c < colItems.length; c++) {
            const colItem = colItems[c];
            tableHtml += `<th class="col-header" data-col="${c}" title="Click to extract column: ${this.escapeHtml(colItem)}">
                <span class="matrix-header-text">${this.escapeHtml(colItem)}</span>
            </th>`;
        }
        tableHtml += '</tr></thead><tbody>';
        
        // Data rows
        for (let r = 0; r < rowItems.length; r++) {
            const rowItem = rowItems[r];
            tableHtml += '<tr>';
            
            // Row header - clickable to extract row
            tableHtml += `<td class="row-header" data-row="${r}" title="Click to extract row: ${this.escapeHtml(rowItem)}">
                <span class="matrix-header-text">${this.escapeHtml(rowItem)}</span>
            </td>`;
            
            // Cells
            for (let c = 0; c < colItems.length; c++) {
                const cellKey = `${r}-${c}`;
                const cell = cells[cellKey];
                const isFilled = cell && cell.filled && cell.content;
                
                if (isFilled) {
                    tableHtml += `<td class="matrix-cell filled" data-row="${r}" data-col="${c}" title="Click to view details">
                        <div class="matrix-cell-content">${this.escapeHtml(cell.content)}</div>
                    </td>`;
                } else {
                    tableHtml += `<td class="matrix-cell empty" data-row="${r}" data-col="${c}">
                        <div class="matrix-cell-empty">
                            <button class="matrix-cell-fill" title="Fill this cell">+</button>
                        </div>
                    </td>`;
                }
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        
        return `
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
                <span class="node-type">Matrix</span>
                <button class="header-btn fit-viewport-btn" title="Fit to viewport (f)">⤢</button>
                <button class="node-action delete-btn" title="Delete node">🗑️</button>
            </div>
            <div class="matrix-context">
                <span class="matrix-context-text">${this.escapeHtml(context)}</span>
                <button class="matrix-context-copy" title="Copy context">📋</button>
            </div>
            <div class="node-content matrix-table-container">
                ${tableHtml}
            </div>
            <div class="matrix-actions">
                <button class="matrix-edit-btn" title="Edit rows and columns">Edit</button>
                <button class="matrix-fill-all-btn" title="Fill all empty cells">Fill All</button>
            </div>
            <div class="resize-handle resize-e" data-resize="e"></div>
            <div class="resize-handle resize-s" data-resize="s"></div>
            <div class="resize-handle resize-se" data-resize="se"></div>
        `;
    }

    /**
     * Render markdown to HTML
     */
    renderMarkdown(text) {
        if (!text) return '';
        
        // Check if marked is available
        if (typeof marked !== 'undefined') {
            try {
                // Configure marked with custom link renderer to open in new tab
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
                
                return marked.parse(text);
            } catch (e) {
                console.error('Markdown parsing error:', e);
                return this.escapeHtml(text);
            }
        }
        
        // Fallback to escaped HTML if marked not loaded
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
