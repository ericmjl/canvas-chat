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
        this.onNodeDelete = null;
        this.onNodeTitleEdit = null;  // For editing node title in semantic zoom
        
        // Branch tooltip state
        this.branchTooltip = null;
        this.activeSelectionNodeId = null;
        
        this.init();
    }

    init() {
        this.updateViewBox();
        this.setupEventListeners();
        this.handleResize();
        this.createBranchTooltip();
    }
    
    /**
     * Create the floating branch tooltip element
     */
    createBranchTooltip() {
        this.branchTooltip = document.createElement('div');
        this.branchTooltip.className = 'branch-tooltip';
        this.branchTooltip.innerHTML = '<button class="branch-tooltip-btn">🌿 Branch</button>';
        this.branchTooltip.style.display = 'none';
        document.body.appendChild(this.branchTooltip);
        
        // Handle branch button click
        this.branchTooltip.querySelector('.branch-tooltip-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (selectedText && this.activeSelectionNodeId && this.onNodeBranch) {
                this.onNodeBranch(this.activeSelectionNodeId, selectedText);
            }
            
            this.hideBranchTooltip();
            selection.removeAllRanges();
        });
    }
    
    /**
     * Show the branch tooltip near the selection
     */
    showBranchTooltip(x, y) {
        this.branchTooltip.style.display = 'block';
        this.branchTooltip.style.left = `${x}px`;
        this.branchTooltip.style.top = `${y}px`;
    }
    
    /**
     * Hide the branch tooltip
     */
    hideBranchTooltip() {
        this.branchTooltip.style.display = 'none';
        this.activeSelectionNodeId = null;
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
        
        // Text selection handling for branch tooltip
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
        document.addEventListener('mousedown', (e) => {
            // Hide tooltip when clicking outside of it
            if (!e.target.closest('.branch-tooltip')) {
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
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (!selectedText) {
            // No selection, hide tooltip after a brief delay (allows click on tooltip)
            setTimeout(() => {
                if (!window.getSelection().toString().trim()) {
                    this.hideBranchTooltip();
                }
            }, 100);
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
        const tooltipX = rect.left + rect.width / 2 - 40; // Roughly center the tooltip
        const tooltipY = rect.top - 40; // Above the selection
        
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
                
                // Callback to persist position
                if (this.onNodeMove) {
                    this.onNodeMove(this.draggedNode.id, newPos);
                }
            }
            
            this.isDraggingNode = false;
            this.draggedNode = null;
        }
    }

    handleWheel(e) {
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
            const width = parseFloat(wrapper.getAttribute('width')) || 320;
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
     * Center on a specific position
     */
    centerOn(x, y) {
        const rect = this.container.getBoundingClientRect();
        this.viewBox.x = x - (rect.width / this.scale) / 2;
        this.viewBox.y = y - (rect.height / this.scale) / 2;
        this.updateViewBox();
    }
    
    /**
     * Pan to center a specific node in the viewport
     */
    panToNode(nodeId) {
        const wrapper = this.nodeElements.get(nodeId);
        if (!wrapper) return;
        
        const x = parseFloat(wrapper.getAttribute('x'));
        const y = parseFloat(wrapper.getAttribute('y'));
        const width = parseFloat(wrapper.getAttribute('width')) || 320;
        const height = parseFloat(wrapper.getAttribute('height')) || 200;
        
        // Center on the node's center point
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        this.centerOn(centerX, centerY);
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
        const width = node.width || (isMatrix ? 500 : 320);
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
        div.className = `node ${node.type}`;
        div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        div.style.width = '100%';
        
        // Matrix nodes need fixed height to allow shrinking; others use min-height
        if (isMatrix) {
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
                    <button class="node-action delete-btn" title="Delete node">🗑️</button>
                </div>
                <div class="node-content">${this.renderMarkdown(node.content)}</div>
                <div class="node-actions">
                    <button class="node-action reply-btn" title="Reply">↩️ Reply</button>
                    ${node.type === NodeType.AI ? '<button class="node-action summarize-btn" title="Summarize">📝 Summarize</button>' : ''}
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
                    if (resizeType.includes('s')) {
                        newHeight = Math.max(100, startHeight + dy);
                    }
                    
                    wrapper.setAttribute('width', newWidth);
                    
                    // If only resizing width (east), auto-adjust height based on content
                    // But NOT for matrix nodes - they should keep their height
                    const isMatrixNode = div.classList.contains('matrix');
                    if (resizeType === 'e' && !isMatrixNode) {
                        // Temporarily remove min-height to get natural content height
                        const oldMinHeight = div.style.minHeight;
                        div.style.minHeight = 'auto';
                        
                        // Force reflow and measure
                        const contentHeight = div.scrollHeight;
                        
                        // Restore and set new height
                        div.style.minHeight = oldMinHeight;
                        wrapper.setAttribute('height', Math.max(100, contentHeight + 10));
                    } else if (resizeType.includes('s')) {
                        // Only update height if explicitly resizing south
                        wrapper.setAttribute('height', newHeight);
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
            const width = parseFloat(wrapper.getAttribute('width')) || 320;
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
        
        const sourceWidth = sourceWrapper ? parseFloat(sourceWrapper.getAttribute('width')) || 320 : 320;
        const sourceHeight = sourceWrapper ? parseFloat(sourceWrapper.getAttribute('height')) || 100 : 100;
        const targetWidth = targetWrapper ? parseFloat(targetWrapper.getAttribute('width')) || 320 : 320;
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
                        width: parseFloat(sourceWrapper.getAttribute('width')) || 320,
                        height: parseFloat(sourceWrapper.getAttribute('height')) || 100
                    };
                    const targetSize = {
                        width: parseFloat(targetWrapper.getAttribute('width')) || 320,
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
            [NodeType.CELL]: 'Cell'
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
            [NodeType.CELL]: '📦'
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
        
        // Column headers
        for (let c = 0; c < colItems.length; c++) {
            const colItem = colItems[c];
            tableHtml += `<th title="${this.escapeHtml(colItem)}">
                <span class="matrix-header-text">${this.escapeHtml(colItem)}</span>
            </th>`;
        }
        tableHtml += '</tr></thead><tbody>';
        
        // Data rows
        for (let r = 0; r < rowItems.length; r++) {
            const rowItem = rowItems[r];
            tableHtml += '<tr>';
            
            // Row header
            tableHtml += `<td class="row-header" title="${this.escapeHtml(rowItem)}">
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
        
        // Then render edges
        for (const edge of graph.getAllEdges()) {
            const sourceNode = graph.getNode(edge.source);
            const targetNode = graph.getNode(edge.target);
            if (sourceNode && targetNode) {
                this.renderEdge(edge, sourceNode.position, targetNode.position);
            }
        }
    }
}

// Export
window.Canvas = Canvas;
