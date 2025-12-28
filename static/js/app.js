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

    handleNodeReply(nodeId) {
        // Select the node and focus input
        this.canvas.clearSelection();
        this.canvas.selectNode(nodeId);
        this.chatInput.focus();
    }

    handleNodeBranch(nodeId, selectedText) {
        // If text was selected, create a branch from that selection
        if (selectedText) {
            // Select the node
            this.canvas.clearSelection();
            this.canvas.selectNode(nodeId);
            
            // Pre-fill input with context
            this.chatInput.value = `Regarding: "${selectedText}"\n\n`;
            this.chatInput.focus();
            this.chatInput.setSelectionRange(this.chatInput.value.length, this.chatInput.value.length);
        } else {
            // Just select the node
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
    }

    handleNodeDeselect(selectedIds) {
        this.updateSelectedIndicator(selectedIds);
        this.updateContextHighlight(selectedIds);
        this.updateContextBudget(selectedIds);
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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
