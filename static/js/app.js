/**
 * Main application - ties together all modules
 */

class App {
    constructor() {
        this.canvas = null;
        this.graph = null;
        this.session = null;
        this.saveTimeout = null;
        
        // UI elements
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('send-btn');
        this.modelPicker = document.getElementById('model-picker');
        this.sessionName = document.getElementById('session-name');
        this.budgetFill = document.getElementById('budget-fill');
        this.budgetText = document.getElementById('budget-text');
        this.selectedIndicator = document.getElementById('selected-nodes-indicator');
        this.selectedCount = document.getElementById('selected-count');
        
        this.init();
    }

    async init() {
        // Initialize canvas
        this.canvas = new Canvas('canvas-container', 'canvas');
        
        // Setup canvas callbacks
        this.canvas.onNodeSelect = this.handleNodeSelect.bind(this);
        this.canvas.onNodeDeselect = this.handleNodeDeselect.bind(this);
        this.canvas.onNodeMove = this.handleNodeMove.bind(this);
        this.canvas.onNodeResize = this.handleNodeResize.bind(this);
        this.canvas.onNodeReply = this.handleNodeReply.bind(this);
        this.canvas.onNodeBranch = this.handleNodeBranch.bind(this);
        this.canvas.onNodeSummarize = this.handleNodeSummarize.bind(this);
        this.canvas.onNodeDelete = this.handleNodeDelete.bind(this);
        
        // Matrix-specific callbacks
        this.canvas.onMatrixCellFill = this.handleMatrixCellFill.bind(this);
        this.canvas.onMatrixCellView = this.handleMatrixCellView.bind(this);
        this.canvas.onMatrixFillAll = this.handleMatrixFillAll.bind(this);
        
        // Load models
        await this.loadModels();
        
        // Load or create session
        await this.loadSession();
        
        // Setup UI event listeners
        this.setupEventListeners();
        
        // Show empty state if needed
        this.updateEmptyState();
    }

    async loadModels() {
        const models = await chat.fetchModels();
        
        // Populate model picker
        this.modelPicker.innerHTML = '';
        for (const model of models) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} (${model.provider})`;
            this.modelPicker.appendChild(option);
        }
        
        // Restore last selected model
        const savedModel = storage.getCurrentModel();
        if (savedModel && models.find(m => m.id === savedModel)) {
            this.modelPicker.value = savedModel;
        }
    }

    async loadSession() {
        // Try to load last session
        const lastSessionId = storage.getLastSessionId();
        
        if (lastSessionId) {
            const session = await storage.getSession(lastSessionId);
            if (session) {
                this.loadSessionData(session);
                return;
            }
        }
        
        // Create new session
        this.createNewSession();
    }

    loadSessionData(session) {
        this.session = session;
        this.graph = new Graph(session);
        
        // Render graph
        this.canvas.renderGraph(this.graph);
        
        // Update UI
        this.sessionName.textContent = session.name || 'Untitled Session';
        storage.setLastSessionId(session.id);
        
        // Fit to content if not empty
        if (!this.graph.isEmpty()) {
            setTimeout(() => this.canvas.fitToContent(), 100);
        }
    }

    createNewSession() {
        this.session = {
            id: crypto.randomUUID(),
            name: 'Untitled Session',
            created_at: Date.now(),
            updated_at: Date.now(),
            nodes: [],
            edges: [],
            tags: {},
            viewport: { x: 0, y: 0, scale: 1 }
        };
        
        this.graph = new Graph();
        this.canvas.clear();
        
        this.sessionName.textContent = this.session.name;
        storage.setLastSessionId(this.session.id);
        
        this.saveSession();
        this.updateEmptyState();
    }

    setupEventListeners() {
        // Chat input
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });
        
        // Auto-resize textarea
        this.chatInput.addEventListener('input', () => {
            this.chatInput.style.height = 'auto';
            this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
        });
        
        // Send button
        this.sendBtn.addEventListener('click', () => this.handleSend());
        
        // Model picker
        this.modelPicker.addEventListener('change', () => {
            storage.setCurrentModel(this.modelPicker.value);
        });
        
        // Clear selection button
        document.getElementById('clear-selection-btn').addEventListener('click', () => {
            this.canvas.clearSelection();
        });
        
        // Session name (click to edit)
        this.sessionName.addEventListener('click', () => this.editSessionName());
        
        // Settings modal
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showSettingsModal();
        });
        document.getElementById('settings-close').addEventListener('click', () => {
            this.hideSettingsModal();
        });
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            this.saveSettings();
        });
        
        // Export/Import
        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportSession();
        });
        document.getElementById('import-btn').addEventListener('click', () => {
            document.getElementById('import-file-input').click();
        });
        document.getElementById('import-file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importSession(e.target.files[0]);
                e.target.value = ''; // Reset for next import
            }
        });
        
        // New Canvas button
        document.getElementById('new-canvas-btn').addEventListener('click', () => {
            if (this.graph.isEmpty() || confirm('Start a new canvas? Current session will be saved.')) {
                this.createNewSession();
            }
        });
        
        // Auto Layout button
        document.getElementById('auto-layout-btn').addEventListener('click', () => {
            this.handleAutoLayout();
        });
        
        // Sessions modal
        document.getElementById('sessions-btn').addEventListener('click', () => {
            this.showSessionsModal();
        });
        document.getElementById('session-close').addEventListener('click', () => {
            this.hideSessionsModal();
        });
        document.getElementById('new-session-btn').addEventListener('click', () => {
            this.hideSessionsModal();
            this.createNewSession();
        });
        
        // Matrix modal
        document.getElementById('matrix-close').addEventListener('click', () => {
            document.getElementById('matrix-modal').style.display = 'none';
            this._matrixData = null;
        });
        document.getElementById('matrix-cancel-btn').addEventListener('click', () => {
            document.getElementById('matrix-modal').style.display = 'none';
            this._matrixData = null;
        });
        document.getElementById('swap-axes-btn').addEventListener('click', () => {
            this.swapMatrixAxes();
        });
        document.getElementById('matrix-create-btn').addEventListener('click', () => {
            this.createMatrixNode();
        });
        
        // Cell detail modal
        document.getElementById('cell-close').addEventListener('click', () => {
            document.getElementById('cell-modal').style.display = 'none';
        });
        document.getElementById('cell-close-btn').addEventListener('click', () => {
            document.getElementById('cell-modal').style.display = 'none';
        });
        document.getElementById('cell-pin-btn').addEventListener('click', () => {
            this.pinCellToCanvas();
        });
        
        // Tag drawer
        document.getElementById('tags-btn').addEventListener('click', () => {
            this.toggleTagDrawer();
        });
        document.getElementById('tag-drawer-close').addEventListener('click', () => {
            this.closeTagDrawer();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape to clear selection
            if (e.key === 'Escape') {
                this.canvas.clearSelection();
            }
            
            // Delete to remove selected nodes
            if ((e.key === 'Delete' || e.key === 'Backspace') && 
                !e.target.matches('input, textarea')) {
                this.deleteSelectedNodes();
            }
        });
    }

    // --- Node Operations ---

    async handleSend() {
        const content = this.chatInput.value.trim();
        if (!content) return;
        
        // Check for /search command
        if (content.startsWith('/search ')) {
            const query = content.slice(8).trim();
            if (query) {
                this.chatInput.value = '';
                this.chatInput.style.height = 'auto';
                await this.handleSearch(query);
            }
            return;
        }
        
        // Check for /research command
        if (content.startsWith('/research ')) {
            const instructions = content.slice(10).trim();
            if (instructions) {
                this.chatInput.value = '';
                this.chatInput.style.height = 'auto';
                await this.handleResearch(instructions);
            }
            return;
        }
        
        // Check for /matrix command
        if (content.startsWith('/matrix ')) {
            const matrixContext = content.slice(8).trim();
            if (matrixContext) {
                this.chatInput.value = '';
                this.chatInput.style.height = 'auto';
                await this.handleMatrix(matrixContext);
            }
            return;
        }
        
        // Get selected nodes or use last node
        let parentIds = this.canvas.getSelectedNodeIds();
        
        if (parentIds.length === 0) {
            // If no selection, use the latest leaf node
            const leaves = this.graph.getLeafNodes();
            if (leaves.length > 0) {
                // Sort by created_at and use the most recent
                leaves.sort((a, b) => b.created_at - a.created_at);
                parentIds = [leaves[0].id];
            }
        }
        
        // Create human node
        const humanNode = createNode(NodeType.HUMAN, content, {
            position: this.graph.autoPosition(parentIds)
        });
        
        this.graph.addNode(humanNode);
        this.canvas.renderNode(humanNode);
        
        // Create edges from parents
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, humanNode.id, 
                parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);
            
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, humanNode.position);
        }
        
        // Clear input and selection
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        
        // Save
        this.saveSession();
        this.updateEmptyState();
        
        // Create AI response node (placeholder)
        const model = this.modelPicker.value;
        const aiNode = createNode(NodeType.AI, '', {
            position: this.graph.autoPosition([humanNode.id]),
            model: model.split('/').pop() // Just the model name
        });
        
        this.graph.addNode(aiNode);
        this.canvas.renderNode(aiNode);
        
        // Create edge from human to AI
        const aiEdge = createEdge(humanNode.id, aiNode.id, EdgeType.REPLY);
        this.graph.addEdge(aiEdge);
        this.canvas.renderEdge(aiEdge, humanNode.position, aiNode.position);
        
        // Center on the new AI node
        this.canvas.centerOn(
            aiNode.position.x + 160,
            aiNode.position.y + 100
        );
        
        // Build context and send to LLM
        const context = this.graph.resolveContext([humanNode.id]);
        const messages = context.map(m => ({ role: m.role, content: m.content }));
        
        // Stream response
        await chat.sendMessage(
            messages,
            model,
            // onChunk
            (chunk, fullContent) => {
                this.canvas.updateNodeContent(aiNode.id, fullContent, true);
                this.graph.updateNode(aiNode.id, { content: fullContent });
            },
            // onDone
            (fullContent) => {
                this.canvas.updateNodeContent(aiNode.id, fullContent, false);
                this.graph.updateNode(aiNode.id, { content: fullContent });
                this.saveSession();
            },
            // onError
            (err) => {
                const errorMsg = `Error: ${err.message}`;
                this.canvas.updateNodeContent(aiNode.id, errorMsg, false);
                this.graph.updateNode(aiNode.id, { content: errorMsg });
                this.saveSession();
            }
        );
    }

    async handleSearch(query) {
        // Get Exa API key
        const exaKey = storage.getExaApiKey();
        if (!exaKey) {
            alert('Please set your Exa API key in Settings to use search.');
            this.showSettingsModal();
            return;
        }
        
        // Get selected nodes for positioning
        let parentIds = this.canvas.getSelectedNodeIds();
        if (parentIds.length === 0) {
            const leaves = this.graph.getLeafNodes();
            if (leaves.length > 0) {
                leaves.sort((a, b) => b.created_at - a.created_at);
                parentIds = [leaves[0].id];
            }
        }
        
        // Create search node
        const searchNode = createNode(NodeType.SEARCH, `Searching: "${query}"`, {
            position: this.graph.autoPosition(parentIds)
        });
        
        this.graph.addNode(searchNode);
        this.canvas.renderNode(searchNode);
        
        // Create edges from parents
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, searchNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(edge);
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, searchNode.position);
        }
        
        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();
        
        // Center on search node
        this.canvas.centerOn(
            searchNode.position.x + 160,
            searchNode.position.y + 100
        );
        
        try {
            // Call Exa API
            const response = await fetch('/api/exa/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    api_key: exaKey,
                    num_results: 5
                })
            });
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Update search node with result count
            const searchContent = `**Search:** "${query}"\n\n*Found ${data.num_results} results*`;
            this.canvas.updateNodeContent(searchNode.id, searchContent, false);
            this.graph.updateNode(searchNode.id, { content: searchContent });
            
            // Create reference nodes for each result
            let offsetY = 0;
            for (const result of data.results) {
                const resultContent = `**[${result.title}](${result.url})**\n\n${result.snippet}${result.published_date ? `\n\n*${result.published_date}*` : ''}`;
                
                const resultNode = createNode(NodeType.REFERENCE, resultContent, {
                    position: {
                        x: searchNode.position.x + 400,
                        y: searchNode.position.y + offsetY
                    }
                });
                
                this.graph.addNode(resultNode);
                this.canvas.renderNode(resultNode);
                
                // Edge from search to result
                const edge = createEdge(searchNode.id, resultNode.id, EdgeType.SEARCH_RESULT);
                this.graph.addEdge(edge);
                this.canvas.renderEdge(edge, searchNode.position, resultNode.position);
                
                offsetY += 200; // Space between result nodes
            }
            
            this.saveSession();
            
        } catch (err) {
            const errorContent = `**Search:** "${query}"\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(searchNode.id, errorContent, false);
            this.graph.updateNode(searchNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    async handleResearch(instructions) {
        // Get Exa API key
        const exaKey = storage.getExaApiKey();
        if (!exaKey) {
            alert('Please set your Exa API key in Settings to use research.');
            this.showSettingsModal();
            return;
        }
        
        // Get selected nodes for positioning
        let parentIds = this.canvas.getSelectedNodeIds();
        if (parentIds.length === 0) {
            const leaves = this.graph.getLeafNodes();
            if (leaves.length > 0) {
                leaves.sort((a, b) => b.created_at - a.created_at);
                parentIds = [leaves[0].id];
            }
        }
        
        // Create research node
        const researchNode = createNode(NodeType.RESEARCH, `**Research:** ${instructions}\n\n*Starting research...*`, {
            position: this.graph.autoPosition(parentIds),
            width: 500  // Research nodes are wider for markdown reports
        });
        
        this.graph.addNode(researchNode);
        this.canvas.renderNode(researchNode);
        
        // Create edges from parents
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, researchNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(edge);
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, researchNode.position);
        }
        
        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();
        
        // Center on research node
        this.canvas.centerOn(
            researchNode.position.x + 250,
            researchNode.position.y + 100
        );
        
        try {
            // Call Exa Research API (SSE stream)
            const response = await fetch('/api/exa/research', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instructions: instructions,
                    api_key: exaKey,
                    model: 'exa-research'
                })
            });
            
            if (!response.ok) {
                throw new Error(`Research failed: ${response.statusText}`);
            }
            
            // Parse SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let reportContent = `**Research:** ${instructions}\n\n`;
            let sources = [];
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        // Store event type for next data line
                        this._currentEvent = line.slice(6).trim();
                    } else if (line.startsWith('data:')) {
                        const data = line.slice(5).trim();
                        const eventType = this._currentEvent || 'content';
                        
                        if (eventType === 'status') {
                            // Update status
                            const statusContent = `**Research:** ${instructions}\n\n*${data}*`;
                            this.canvas.updateNodeContent(researchNode.id, statusContent, true);
                        } else if (eventType === 'content') {
                            // Append content to report
                            reportContent += data;
                            this.canvas.updateNodeContent(researchNode.id, reportContent, true);
                            this.graph.updateNode(researchNode.id, { content: reportContent });
                        } else if (eventType === 'sources') {
                            // Parse sources JSON
                            try {
                                sources = JSON.parse(data);
                            } catch (e) {
                                console.error('Failed to parse sources:', e);
                            }
                        } else if (eventType === 'done') {
                            // Add sources to the report if available
                            if (sources.length > 0) {
                                reportContent += '\n\n---\n**Sources:**\n';
                                for (const source of sources) {
                                    reportContent += `- [${source.title}](${source.url})\n`;
                                }
                            }
                            this.canvas.updateNodeContent(researchNode.id, reportContent, false);
                            this.graph.updateNode(researchNode.id, { content: reportContent });
                        } else if (eventType === 'error') {
                            throw new Error(data);
                        }
                        
                        this._currentEvent = null;
                    }
                }
            }
            
            this.saveSession();
            
        } catch (err) {
            const errorContent = `**Research:** ${instructions}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(researchNode.id, errorContent, false);
            this.graph.updateNode(researchNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    async handleMatrix(matrixContext) {
        // Get selected nodes
        const selectedIds = this.canvas.getSelectedNodeIds();
        
        console.log('handleMatrix called with context:', matrixContext);
        console.log('Selected node IDs:', selectedIds);
        
        if (selectedIds.length === 0) {
            alert('Please select 1 or 2 nodes to create a matrix.\n\n• 1 node: Will extract two lists from it\n• 2 nodes: First = rows, second = columns');
            return;
        }
        
        if (selectedIds.length > 2) {
            alert('Please select at most 2 nodes. The first will be rows, the second will be columns.');
            return;
        }
        
        const model = this.modelPicker.value;
        const apiKey = this.getApiKeyForModel(model);
        
        // Show loading state
        const loadingModal = document.getElementById('matrix-modal');
        console.log('Matrix modal element:', loadingModal);
        document.getElementById('matrix-context').value = matrixContext;
        loadingModal.style.display = 'flex';
        console.log('Modal should now be visible');
        
        try {
            let rowItems, colItems, rowNodeId, colNodeId;
            
            if (selectedIds.length === 1) {
                // Single node: extract two lists from it
                const node = this.graph.getNode(selectedIds[0]);
                const result = await this.parseTwoLists(node.content, matrixContext, model, apiKey);
                
                rowItems = result.rows;
                colItems = result.columns;
                rowNodeId = selectedIds[0];
                colNodeId = selectedIds[0]; // Same node for both
                
            } else {
                // Two nodes: parse each separately
                const node1 = this.graph.getNode(selectedIds[0]);
                const node2 = this.graph.getNode(selectedIds[1]);
                
                const [result1, result2] = await Promise.all([
                    this.parseListItems(node1.content, model, apiKey),
                    this.parseListItems(node2.content, model, apiKey)
                ]);
                
                rowItems = result1.items;
                colItems = result2.items;
                rowNodeId = selectedIds[0];
                colNodeId = selectedIds[1];
            }
            
            // Check for max items warning
            const hasWarning = rowItems.length > 10 || colItems.length > 10;
            document.getElementById('matrix-warning').style.display = hasWarning ? 'block' : 'none';
            
            // Store parsed data for modal
            this._matrixData = {
                context: matrixContext,
                rowNodeId,
                colNodeId,
                rowItems: rowItems.slice(0, 10),
                colItems: colItems.slice(0, 10)
            };
            
            // Populate axis items in modal
            this.populateAxisItems('row-items', this._matrixData.rowItems);
            this.populateAxisItems('col-items', this._matrixData.colItems);
            
            document.getElementById('row-count').textContent = `${this._matrixData.rowItems.length} items`;
            document.getElementById('col-count').textContent = `${this._matrixData.colItems.length} items`;
            
        } catch (err) {
            alert(`Failed to parse list items: ${err.message}`);
            document.getElementById('matrix-modal').style.display = 'none';
        }
    }
    
    async parseTwoLists(content, context, model, apiKey) {
        const response = await fetch('/api/parse-two-lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                context,
                model,
                api_key: apiKey
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to parse lists: ${response.statusText}`);
        }
        
        return response.json();
    }
    
    async parseListItems(content, model, apiKey) {
        const response = await fetch('/api/parse-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                model,
                api_key: apiKey
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to parse list: ${response.statusText}`);
        }
        
        return response.json();
    }
    
    populateAxisItems(containerId, items) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'axis-item';
            li.dataset.index = index;
            
            li.innerHTML = `
                <span class="axis-item-text" title="${this.escapeHtml(item)}">${this.escapeHtml(this.truncate(item, 50))}</span>
                <button class="axis-item-remove" title="Remove">×</button>
            `;
            
            // Remove button handler
            li.querySelector('.axis-item-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeAxisItem(containerId, index);
            });
            
            container.appendChild(li);
        });
    }
    
    removeAxisItem(containerId, index) {
        const isRow = containerId === 'row-items';
        const items = isRow ? this._matrixData.rowItems : this._matrixData.colItems;
        items.splice(index, 1);
        
        this.populateAxisItems(containerId, items);
        const countId = isRow ? 'row-count' : 'col-count';
        document.getElementById(countId).textContent = `${items.length} items`;
    }
    
    swapMatrixAxes() {
        // Swap row and column data
        const temp = {
            nodeId: this._matrixData.rowNodeId,
            items: this._matrixData.rowItems
        };
        
        this._matrixData.rowNodeId = this._matrixData.colNodeId;
        this._matrixData.rowItems = this._matrixData.colItems;
        this._matrixData.colNodeId = temp.nodeId;
        this._matrixData.colItems = temp.items;
        
        // Re-populate UI
        this.populateAxisItems('row-items', this._matrixData.rowItems);
        this.populateAxisItems('col-items', this._matrixData.colItems);
        
        document.getElementById('row-count').textContent = `${this._matrixData.rowItems.length} items`;
        document.getElementById('col-count').textContent = `${this._matrixData.colItems.length} items`;
    }
    
    createMatrixNode() {
        if (!this._matrixData) return;
        
        const { context, rowNodeId, colNodeId, rowItems, colItems } = this._matrixData;
        
        if (rowItems.length === 0 || colItems.length === 0) {
            alert('Both rows and columns must have at least one item');
            return;
        }
        
        // Get source nodes for positioning
        const rowNode = this.graph.getNode(rowNodeId);
        const colNode = this.graph.getNode(colNodeId);
        
        // Position matrix to the right of both source nodes
        const position = {
            x: Math.max(rowNode.position.x, colNode.position.x) + 400,
            y: (rowNode.position.y + colNode.position.y) / 2
        };
        
        // Create matrix node
        const matrixNode = createMatrixNode(context, rowNodeId, colNodeId, rowItems, colItems, { position });
        
        this.graph.addNode(matrixNode);
        this.canvas.renderNode(matrixNode);
        
        // Create edges from source nodes
        const edge1 = createEdge(rowNodeId, matrixNode.id, EdgeType.REPLY);
        const edge2 = createEdge(colNodeId, matrixNode.id, EdgeType.REPLY);
        
        this.graph.addEdge(edge1);
        this.graph.addEdge(edge2);
        
        this.canvas.renderEdge(edge1, rowNode.position, matrixNode.position);
        this.canvas.renderEdge(edge2, colNode.position, matrixNode.position);
        
        // Close modal and clean up
        document.getElementById('matrix-modal').style.display = 'none';
        this._matrixData = null;
        
        // Clear selection
        this.canvas.clearSelection();
        
        this.saveSession();
        this.updateEmptyState();
    }
    
    truncate(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength - 1) + '…';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // --- Matrix Cell Handlers ---
    
    async handleMatrixCellFill(nodeId, row, col) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;
        
        const model = this.modelPicker.value;
        const apiKey = this.getApiKeyForModel(model);
        
        const rowItem = matrixNode.rowItems[row];
        const colItem = matrixNode.colItems[col];
        const context = matrixNode.context;
        
        // Get DAG history for context
        const messages = this.graph.resolveContext([nodeId]);
        
        try {
            // Start streaming fill
            const response = await fetch('/api/matrix/fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    row_item: rowItem,
                    col_item: colItem,
                    context: context,
                    messages: messages.map(m => ({ role: m.role, content: m.content })),
                    model,
                    api_key: apiKey
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fill cell: ${response.statusText}`);
            }
            
            // Stream the response
            let cellContent = '';
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        this._currentEvent = line.slice(6).trim();
                    } else if (line.startsWith('data:')) {
                        const data = line.slice(5);
                        const eventType = this._currentEvent || 'content';
                        
                        if (eventType === 'content') {
                            cellContent += data;
                            this.canvas.updateMatrixCell(nodeId, row, col, cellContent, true);
                        } else if (eventType === 'done') {
                            this.canvas.updateMatrixCell(nodeId, row, col, cellContent, false);
                        } else if (eventType === 'error') {
                            throw new Error(data);
                        }
                        
                        this._currentEvent = null;
                    }
                }
            }
            
            // Update the graph data
            const cellKey = `${row}-${col}`;
            matrixNode.cells[cellKey] = { content: cellContent, filled: true };
            this.graph.updateNode(nodeId, { cells: matrixNode.cells });
            
            this.saveSession();
            
        } catch (err) {
            console.error('Failed to fill matrix cell:', err);
            alert(`Failed to fill cell: ${err.message}`);
        }
    }
    
    handleMatrixCellView(nodeId, row, col) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;
        
        const rowItem = matrixNode.rowItems[row];
        const colItem = matrixNode.colItems[col];
        const cellKey = `${row}-${col}`;
        const cell = matrixNode.cells[cellKey];
        
        if (!cell || !cell.content) return;
        
        // Store current cell info for pinning
        this._currentCellData = {
            matrixId: nodeId,
            row,
            col,
            rowItem,
            colItem,
            content: cell.content
        };
        
        // Populate and show modal
        document.getElementById('cell-row-item').textContent = rowItem;
        document.getElementById('cell-col-item').textContent = colItem;
        document.getElementById('cell-content').textContent = cell.content;
        document.getElementById('cell-modal').style.display = 'flex';
    }
    
    async handleMatrixFillAll(nodeId) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;
        
        const { rowItems, colItems, cells } = matrixNode;
        
        // Find all empty cells
        const emptyCells = [];
        for (let r = 0; r < rowItems.length; r++) {
            for (let c = 0; c < colItems.length; c++) {
                const cellKey = `${r}-${c}`;
                const cell = cells[cellKey];
                if (!cell || !cell.filled) {
                    emptyCells.push({ row: r, col: c });
                }
            }
        }
        
        if (emptyCells.length === 0) {
            alert('All cells are already filled!');
            return;
        }
        
        if (!confirm(`Fill ${emptyCells.length} empty cells? This may take a while.`)) {
            return;
        }
        
        // Fill cells one by one (row by row)
        for (const { row, col } of emptyCells) {
            await this.handleMatrixCellFill(nodeId, row, col);
        }
    }
    
    pinCellToCanvas() {
        if (!this._currentCellData) return;
        
        const { matrixId, row, col, rowItem, colItem, content } = this._currentCellData;
        const matrixNode = this.graph.getNode(matrixId);
        if (!matrixNode) return;
        
        // Create cell node
        const cellNode = createCellNode(matrixId, row, col, rowItem, colItem, content, {
            position: {
                x: matrixNode.position.x + (matrixNode.width || 500) + 50,
                y: matrixNode.position.y + (row * 60)
            }
        });
        
        this.graph.addNode(cellNode);
        this.canvas.renderNode(cellNode);
        
        // Create edge from cell to matrix
        const edge = createEdge(cellNode.id, matrixId, EdgeType.MATRIX_CELL);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, cellNode.position, matrixNode.position);
        
        // Close modal
        document.getElementById('cell-modal').style.display = 'none';
        this._currentCellData = null;
        
        // Select the new cell node
        this.canvas.clearSelection();
        this.canvas.selectNode(cellNode.id);
        
        this.saveSession();
        this.updateEmptyState();
    }

    handleAutoLayout() {
        if (this.graph.isEmpty()) return;
        
        // Get actual node dimensions from the canvas before layout
        const dimensions = this.canvas.getNodeDimensions();
        
        // Get selected layout algorithm
        const layoutPicker = document.getElementById('layout-picker');
        const algorithm = layoutPicker ? layoutPicker.value : 'hierarchical';
        
        // Run selected layout algorithm
        if (algorithm === 'force') {
            this.graph.forceDirectedLayout(dimensions);
        } else {
            this.graph.autoLayout(dimensions);
        }
        
        // Re-render the entire graph with new positions
        this.canvas.renderGraph(this.graph);
        
        // Fit to content
        setTimeout(() => this.canvas.fitToContent(), 100);
        
        // Save the new positions
        this.saveSession();
    }

    handleNodeReply(nodeId) {
        // Select the node and focus input
        this.canvas.clearSelection();
        this.canvas.selectNode(nodeId);
        this.chatInput.focus();
    }

    handleNodeBranch(nodeId, selectedText) {
        // If text was selected, create a highlight node with that excerpt
        if (selectedText) {
            const sourceNode = this.graph.getNode(nodeId);
            if (!sourceNode) return;
            
            // Create highlight node with the selected text
            const highlightNode = createNode(NodeType.HIGHLIGHT, `> ${selectedText}`, {
                position: {
                    x: sourceNode.position.x + 400,
                    y: sourceNode.position.y
                }
            });
            
            this.graph.addNode(highlightNode);
            this.canvas.renderNode(highlightNode);
            
            // Create highlight edge (dashed connection)
            const edge = createEdge(nodeId, highlightNode.id, EdgeType.HIGHLIGHT);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, sourceNode.position, highlightNode.position);
            
            // Select the new highlight node for easy follow-up
            this.canvas.clearSelection();
            this.canvas.selectNode(highlightNode.id);
            
            this.saveSession();
            this.updateEmptyState();
            
            // Focus input for follow-up conversation
            this.chatInput.focus();
        } else {
            // No selection - just select the node for reply
            this.canvas.clearSelection();
            this.canvas.selectNode(nodeId);
            this.chatInput.focus();
        }
    }

    async handleNodeSummarize(nodeId) {
        const model = this.modelPicker.value;
        
        // Get context up to this node
        const context = this.graph.resolveContext([nodeId]);
        
        if (context.length < 2) {
            alert('Not enough conversation to summarize');
            return;
        }
        
        // Create summary node
        const parentNode = this.graph.getNode(nodeId);
        const summaryNode = createNode(NodeType.SUMMARY, 'Generating summary...', {
            position: {
                x: parentNode.position.x + 400,
                y: parentNode.position.y
            }
        });
        
        this.graph.addNode(summaryNode);
        this.canvas.renderNode(summaryNode);
        
        const edge = createEdge(nodeId, summaryNode.id, EdgeType.REFERENCE);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, parentNode.position, summaryNode.position);
        
        try {
            const messages = context.map(m => ({ role: m.role, content: m.content }));
            const summary = await chat.summarize(messages, model);
            
            this.canvas.updateNodeContent(summaryNode.id, summary, false);
            this.graph.updateNode(summaryNode.id, { content: summary });
            this.saveSession();
        } catch (err) {
            this.canvas.updateNodeContent(summaryNode.id, `Error: ${err.message}`, false);
            this.graph.updateNode(summaryNode.id, { content: `Error: ${err.message}` });
        }
    }

    handleNodeSelect(selectedIds) {
        this.updateSelectedIndicator(selectedIds);
        this.updateContextHighlight(selectedIds);
        this.updateContextBudget(selectedIds);
        
        // Auto-open tag drawer when 2+ nodes selected
        if (selectedIds.length >= 2) {
            this.openTagDrawer();
        }
        
        // Update tag drawer state
        this.updateTagDrawer();
    }

    handleNodeDeselect(selectedIds) {
        this.updateSelectedIndicator(selectedIds);
        this.updateContextHighlight(selectedIds);
        this.updateContextBudget(selectedIds);
        
        // Update tag drawer state
        this.updateTagDrawer();
    }

    handleNodeMove(nodeId, newPos) {
        this.graph.updateNode(nodeId, { position: newPos });
        this.saveSession();
    }

    handleNodeResize(nodeId, width, height) {
        this.graph.updateNode(nodeId, { width, height });
        this.saveSession();
    }

    handleNodeDelete(nodeId) {
        if (!confirm('Delete this node? This cannot be undone.')) {
            return;
        }
        
        // Remove from graph (this also removes edges)
        this.graph.removeNode(nodeId);
        
        // Remove from canvas
        this.canvas.removeNode(nodeId);
        
        // Remove orphaned edges from canvas
        for (const [edgeId, path] of this.canvas.edgeElements) {
            const sourceId = path.getAttribute('data-source');
            const targetId = path.getAttribute('data-target');
            if (!this.graph.getNode(sourceId) || !this.graph.getNode(targetId)) {
                this.canvas.removeEdge(edgeId);
            }
        }
        
        this.saveSession();
        this.updateEmptyState();
    }

    deleteSelectedNodes() {
        const selectedIds = this.canvas.getSelectedNodeIds();
        if (selectedIds.length === 0) return;
        
        if (!confirm(`Delete ${selectedIds.length} node(s)? This cannot be undone.`)) {
            return;
        }
        
        for (const nodeId of selectedIds) {
            // Get connected edges and remove them from canvas
            const node = this.graph.getNode(nodeId);
            if (!node) continue;
            
            // Remove from graph (this also removes edges)
            this.graph.removeNode(nodeId);
            
            // Remove from canvas
            this.canvas.removeNode(nodeId);
        }
        
        // Remove orphaned edges from canvas
        for (const [edgeId, path] of this.canvas.edgeElements) {
            const sourceId = path.getAttribute('data-source');
            const targetId = path.getAttribute('data-target');
            if (!this.graph.getNode(sourceId) || !this.graph.getNode(targetId)) {
                this.canvas.removeEdge(edgeId);
            }
        }
        
        this.saveSession();
        this.updateEmptyState();
    }

    // --- Context Visualization ---

    updateSelectedIndicator(selectedIds) {
        if (selectedIds.length > 0) {
            this.selectedIndicator.style.display = 'flex';
            this.selectedCount.textContent = selectedIds.length;
        } else {
            this.selectedIndicator.style.display = 'none';
        }
    }

    updateContextHighlight(selectedIds) {
        if (selectedIds.length > 0) {
            const ancestorIds = this.graph.getAncestorIds(selectedIds);
            // Remove selected nodes from highlight (they have their own style)
            for (const id of selectedIds) {
                ancestorIds.delete(id);
            }
            this.canvas.highlightContext(ancestorIds);
        } else {
            this.canvas.highlightContext(new Set());
        }
    }

    updateContextBudget(selectedIds) {
        const model = this.modelPicker.value;
        const contextWindow = chat.getContextWindow(model);
        
        let tokens = 0;
        if (selectedIds.length > 0) {
            tokens = this.graph.estimateTokens(selectedIds);
        }
        
        const percentage = Math.min((tokens / contextWindow) * 100, 100);
        
        this.budgetFill.style.width = `${percentage}%`;
        this.budgetFill.classList.remove('warning', 'danger');
        
        if (percentage > 90) {
            this.budgetFill.classList.add('danger');
        } else if (percentage > 70) {
            this.budgetFill.classList.add('warning');
        }
        
        // Format numbers
        const formatK = (n) => n >= 1000 ? `${(n/1000).toFixed(0)}k` : n;
        this.budgetText.textContent = `${formatK(tokens)} / ${formatK(contextWindow)}`;
    }

    // --- Session Management ---

    saveSession() {
        // Debounce saves
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(async () => {
            this.session = {
                ...this.session,
                ...this.graph.toJSON(),
                updated_at: Date.now()
            };
            
            await storage.saveSession(this.session);
        }, 500);
    }

    editSessionName() {
        const newName = prompt('Session name:', this.session.name);
        if (newName && newName.trim()) {
            this.session.name = newName.trim();
            this.sessionName.textContent = this.session.name;
            this.saveSession();
        }
    }

    exportSession() {
        storage.exportSession(this.session);
    }

    async importSession(file) {
        try {
            const session = await storage.importSession(file);
            this.loadSessionData(session);
        } catch (err) {
            alert(`Import failed: ${err.message}`);
        }
    }

    updateEmptyState() {
        const container = document.getElementById('canvas-container');
        let emptyState = container.querySelector('.empty-state');
        
        if (this.graph.isEmpty()) {
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.innerHTML = `
                    <h2>Start a conversation</h2>
                    <p>Type a message below to begin exploring ideas on the canvas.</p>
                    <p><kbd>Cmd/Ctrl+Click</kbd> to multi-select nodes</p>
                `;
                container.appendChild(emptyState);
            }
        } else if (emptyState) {
            emptyState.remove();
        }
    }

    // --- Settings Modal ---

    showSettingsModal() {
        const modal = document.getElementById('settings-modal');
        modal.style.display = 'flex';
        
        // Load saved keys
        const keys = storage.getApiKeys();
        document.getElementById('openai-key').value = keys.openai || '';
        document.getElementById('anthropic-key').value = keys.anthropic || '';
        document.getElementById('google-key').value = keys.google || '';
        document.getElementById('groq-key').value = keys.groq || '';
        document.getElementById('github-key').value = keys.github || '';
        document.getElementById('exa-key').value = keys.exa || '';
    }

    hideSettingsModal() {
        document.getElementById('settings-modal').style.display = 'none';
    }

    saveSettings() {
        const keys = {
            openai: document.getElementById('openai-key').value.trim(),
            anthropic: document.getElementById('anthropic-key').value.trim(),
            google: document.getElementById('google-key').value.trim(),
            groq: document.getElementById('groq-key').value.trim(),
            github: document.getElementById('github-key').value.trim(),
            exa: document.getElementById('exa-key').value.trim(),
        };
        
        storage.saveApiKeys(keys);
        this.hideSettingsModal();
    }

    // --- Sessions Modal ---

    async showSessionsModal() {
        const modal = document.getElementById('session-modal');
        modal.style.display = 'flex';
        
        // Load sessions list
        const sessions = await storage.listSessions();
        const listEl = document.getElementById('session-list');
        
        if (sessions.length === 0) {
            listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No saved sessions</p>';
            return;
        }
        
        listEl.innerHTML = sessions.map(session => `
            <div class="session-item" data-session-id="${session.id}">
                <div>
                    <div class="session-item-name">${session.name || 'Untitled Session'}</div>
                    <div class="session-item-date">${new Date(session.updated_at).toLocaleDateString()}</div>
                </div>
                <button class="session-item-delete" data-delete-id="${session.id}" title="Delete">🗑️</button>
            </div>
        `).join('');
        
        // Add click handlers for session items
        listEl.querySelectorAll('.session-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.session-item-delete')) return;
                const sessionId = item.dataset.sessionId;
                const session = await storage.getSession(sessionId);
                if (session) {
                    this.loadSessionData(session);
                    this.hideSessionsModal();
                }
            });
        });
        
        // Add delete handlers
        listEl.querySelectorAll('.session-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.deleteId;
                if (confirm('Delete this session? This cannot be undone.')) {
                    await storage.deleteSession(sessionId);
                    // If deleting current session, create new one
                    if (this.session.id === sessionId) {
                        this.createNewSession();
                    }
                    this.showSessionsModal(); // Refresh list
                }
            });
        });
    }

    hideSessionsModal() {
        document.getElementById('session-modal').style.display = 'none';
    }
    
    // --- Tag Management ---
    
    toggleTagDrawer() {
        const drawer = document.getElementById('tag-drawer');
        const btn = document.getElementById('tags-btn');
        drawer.classList.toggle('open');
        btn.classList.toggle('active');
        
        if (drawer.classList.contains('open')) {
            this.renderTagSlots();
        }
    }
    
    openTagDrawer() {
        const drawer = document.getElementById('tag-drawer');
        const btn = document.getElementById('tags-btn');
        if (!drawer.classList.contains('open')) {
            drawer.classList.add('open');
            btn.classList.add('active');
            this.renderTagSlots();
        }
    }
    
    closeTagDrawer() {
        const drawer = document.getElementById('tag-drawer');
        const btn = document.getElementById('tags-btn');
        drawer.classList.remove('open');
        btn.classList.remove('active');
    }
    
    renderTagSlots() {
        const slotsEl = document.getElementById('tag-slots');
        const tags = this.graph.getAllTags();
        const selectedIds = this.canvas.getSelectedNodeIds();
        
        slotsEl.innerHTML = '';
        
        for (const color of TAG_COLORS) {
            const tag = tags[color];
            const slot = document.createElement('div');
            slot.className = 'tag-slot';
            slot.dataset.color = color;
            
            // Check if selected nodes have this tag
            if (tag && selectedIds.length > 0) {
                const nodesWithTag = selectedIds.filter(id => this.graph.nodeHasTag(id, color));
                if (nodesWithTag.length === selectedIds.length) {
                    slot.classList.add('active');
                } else if (nodesWithTag.length > 0) {
                    slot.classList.add('partial');
                }
            }
            
            slot.innerHTML = `
                <div class="tag-color-dot" style="background: ${color}"></div>
                <div class="tag-slot-content">
                    ${tag 
                        ? `<span class="tag-slot-name">${this.escapeHtml(tag.name)}</span>` 
                        : `<span class="tag-slot-empty">+ Add tag</span>`
                    }
                </div>
                ${tag ? `
                    <div class="tag-slot-actions">
                        <button class="tag-slot-btn edit" title="Edit">✏️</button>
                        <button class="tag-slot-btn delete" title="Delete">✕</button>
                    </div>
                ` : ''}
            `;
            
            // Click to apply/create tag
            slot.addEventListener('click', (e) => {
                if (e.target.closest('.tag-slot-btn')) return;
                this.handleTagSlotClick(color);
            });
            
            // Edit button
            const editBtn = slot.querySelector('.tag-slot-btn.edit');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.startEditingTag(color);
                });
            }
            
            // Delete button
            const deleteBtn = slot.querySelector('.tag-slot-btn.delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteTag(color);
                });
            }
            
            slotsEl.appendChild(slot);
        }
    }
    
    handleTagSlotClick(color) {
        const tag = this.graph.getTag(color);
        const selectedIds = this.canvas.getSelectedNodeIds();
        
        if (!tag) {
            // Create new tag
            this.startEditingTag(color, true);
        } else if (selectedIds.length > 0) {
            // Toggle tag on selected nodes
            this.toggleTagOnNodes(color, selectedIds);
        }
    }
    
    startEditingTag(color, isNew = false) {
        const slot = document.querySelector(`.tag-slot[data-color="${color}"]`);
        if (!slot) return;
        
        const contentEl = slot.querySelector('.tag-slot-content');
        const currentName = this.graph.getTag(color)?.name || '';
        
        contentEl.innerHTML = `
            <input type="text" class="tag-slot-input" 
                value="${this.escapeHtml(currentName)}" 
                placeholder="Tag name..."
                maxlength="20">
        `;
        
        const input = contentEl.querySelector('input');
        input.focus();
        input.select();
        
        const finishEdit = () => {
            const name = input.value.trim();
            if (name) {
                if (isNew) {
                    this.graph.createTag(color, name);
                } else {
                    this.graph.updateTag(color, name);
                }
                this.saveSession();
                this.canvas.renderGraph(this.graph); // Re-render to show updated tags
            }
            this.renderTagSlots();
        };
        
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.renderTagSlots();
            }
        });
    }
    
    deleteTag(color) {
        const tag = this.graph.getTag(color);
        if (!tag) return;
        
        if (confirm(`Delete tag "${tag.name}"? It will be removed from all nodes.`)) {
            this.graph.deleteTag(color);
            this.saveSession();
            this.canvas.renderGraph(this.graph);
            this.renderTagSlots();
        }
    }
    
    toggleTagOnNodes(color, nodeIds) {
        // Check current state
        const nodesWithTag = nodeIds.filter(id => this.graph.nodeHasTag(id, color));
        const allHaveTag = nodesWithTag.length === nodeIds.length;
        
        if (allHaveTag) {
            // Remove from all
            for (const nodeId of nodeIds) {
                this.graph.removeTagFromNode(nodeId, color);
            }
        } else {
            // Add to all
            for (const nodeId of nodeIds) {
                this.graph.addTagToNode(nodeId, color);
            }
        }
        
        this.saveSession();
        this.canvas.renderGraph(this.graph);
        this.renderTagSlots();
    }
    
    updateTagDrawer() {
        const drawer = document.getElementById('tag-drawer');
        if (!drawer.classList.contains('open')) return;
        
        const selectedIds = this.canvas.getSelectedNodeIds();
        const footer = document.getElementById('tag-drawer-footer');
        const status = document.getElementById('tag-selection-status');
        
        if (selectedIds.length > 0) {
            footer.classList.add('has-selection');
            status.textContent = `${selectedIds.length} node${selectedIds.length > 1 ? 's' : ''} selected`;
        } else {
            footer.classList.remove('has-selection');
            status.textContent = 'Select nodes to apply tags';
        }
        
        this.renderTagSlots();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
