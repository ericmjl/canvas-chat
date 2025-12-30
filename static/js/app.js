/**
 * Main application - ties together all modules
 */

// Slash command definitions
const SLASH_COMMANDS = [
    { command: '/search', description: 'Search the web with Exa AI', placeholder: 'query' },
    { command: '/research', description: 'Deep research with multiple sources', placeholder: 'topic' },
    { command: '/matrix', description: 'Create a comparison matrix', placeholder: 'context for matrix' },
];

/**
 * Slash command autocomplete menu
 */
class SlashCommandMenu {
    constructor() {
        this.menu = null;
        this.activeInput = null;
        this.selectedIndex = 0;
        this.visible = false;
        this.filteredCommands = [];
        this.onSelect = null; // Callback when command is selected
        this.justSelected = false; // Flag to prevent immediate send after selection
        
        this.createMenu();
    }
    
    createMenu() {
        this.menu = document.createElement('div');
        this.menu.className = 'slash-command-menu';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);
        
        // Prevent clicks inside menu from blurring input
        this.menu.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
    }
    
    /**
     * Attach to an input element
     */
    attach(input, onSelect) {
        this.onSelect = onSelect;
        
        // Store original placeholder for later reset
        input.dataset.originalPlaceholder = input.placeholder;
        
        input.addEventListener('input', (e) => this.handleInput(e, input));
        input.addEventListener('keydown', (e) => this.handleKeydown(e, input));
        input.addEventListener('blur', () => {
            // Delay hide to allow click on menu item
            setTimeout(() => this.hide(), 150);
        });
    }
    
    handleInput(e, input) {
        const value = input.value;
        
        // Clear the justSelected flag only on real user input (not programmatic)
        if (!e._programmatic) {
            this.justSelected = false;
        }
        
        // Reset placeholder if input is empty or doesn't start with /
        if (!value || !value.startsWith('/')) {
            input.placeholder = input.dataset.originalPlaceholder || 'Type a message...';
        }
        
        // Check if typing a slash command
        if (value.startsWith('/')) {
            const typed = value.split(' ')[0].toLowerCase(); // Just the command part
            
            // Filter commands that match
            this.filteredCommands = SLASH_COMMANDS.filter(cmd => 
                cmd.command.toLowerCase().startsWith(typed)
            );
            
            if (this.filteredCommands.length > 0 && !value.includes(' ')) {
                // Show menu only if still typing command (no space yet)
                this.show(input);
            } else {
                this.hide();
            }
        } else {
            this.hide();
        }
    }
    
    handleKeydown(e, input) {
        // If we just selected a command, block the next Enter from sending
        if (this.justSelected && e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            this.justSelected = false;
            return true;
        }
        
        if (!this.visible) return false;
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
                this.render();
                return true;
            case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.render();
                return true;
            case 'Tab':
            case 'Enter':
                if (this.filteredCommands.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectCommand(input, this.filteredCommands[this.selectedIndex]);
                    return true;
                }
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                return true;
        }
        return false;
    }
    
    selectCommand(input, cmd) {
        // Insert the command with a trailing space
        input.value = cmd.command + ' ';
        
        // Update placeholder to hint at expected input
        if (cmd.placeholder) {
            input.placeholder = cmd.placeholder + '...';
        }
        
        input.focus();
        
        // Trigger input event for any listeners (but mark it as programmatic)
        const event = new Event('input', { bubbles: true });
        event._programmatic = true;
        input.dispatchEvent(event);
        
        // Set flag AFTER dispatching event to prevent immediate send
        this.justSelected = true;
        
        this.hide();
        
        if (this.onSelect) {
            this.onSelect(cmd);
        }
    }
    
    show(input) {
        this.activeInput = input;
        this.visible = true;
        this.selectedIndex = 0;
        
        // Position menu above the input
        const rect = input.getBoundingClientRect();
        this.menu.style.display = 'block';
        this.menu.style.left = `${rect.left}px`;
        this.menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        this.menu.style.minWidth = `${Math.min(rect.width, 300)}px`;
        
        this.render();
    }
    
    hide() {
        this.visible = false;
        this.menu.style.display = 'none';
        this.activeInput = null;
    }
    
    render() {
        const commandsHtml = this.filteredCommands.map((cmd, index) => `
            <div class="slash-command-item ${index === this.selectedIndex ? 'selected' : ''}" 
                 data-index="${index}">
                <span class="slash-command-name">${cmd.command}</span>
                <span class="slash-command-desc">${cmd.description}</span>
            </div>
        `).join('');
        
        this.menu.innerHTML = `
            ${commandsHtml}
            <div class="slash-command-hint">
                <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>Tab</kbd> select · <kbd>Esc</kbd> dismiss
            </div>
        `;
        
        // Add click handlers
        this.menu.querySelectorAll('.slash-command-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                this.selectedIndex = index;
                this.selectCommand(this.activeInput, this.filteredCommands[index]);
            });
        });
    }
}

class App {
    constructor() {
        this.canvas = null;
        this.graph = null;
        this.session = null;
        this.saveTimeout = null;
        this.searchIndex = new SearchIndex();
        this.searchSelectedIndex = 0;
        this.slashCommandMenu = new SlashCommandMenu();
        
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
        this.canvas.onNodeFetchSummarize = this.handleNodeFetchSummarize.bind(this);
        this.canvas.onNodeDelete = this.handleNodeDelete.bind(this);
        this.canvas.onNodeTitleEdit = this.handleNodeTitleEdit.bind(this);
        
        // Matrix-specific callbacks
        this.canvas.onMatrixCellFill = this.handleMatrixCellFill.bind(this);
        this.canvas.onMatrixCellView = this.handleMatrixCellView.bind(this);
        this.canvas.onMatrixFillAll = this.handleMatrixFillAll.bind(this);
        this.canvas.onMatrixRowExtract = this.handleMatrixRowExtract.bind(this);
        this.canvas.onMatrixColExtract = this.handleMatrixColExtract.bind(this);
        
        // Attach slash command menu to reply tooltip input
        const replyInput = this.canvas.getReplyTooltipInput();
        if (replyInput) {
            this.slashCommandMenu.attach(replyInput);
            // Set up callback so canvas can check if menu is handling keys
            this.canvas.onReplyInputKeydown = (e) => {
                if (this.slashCommandMenu.visible) {
                    if (['ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
                        return true; // Menu will handle it
                    }
                }
                return false;
            };
        }
        
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
        // Fetch models dynamically from each provider with configured API keys
        const keys = storage.getApiKeys();
        const allModels = [];
        
        // Providers to fetch from (provider name -> storage key)
        const providers = [
            { name: 'openai', key: keys.openai },
            { name: 'anthropic', key: keys.anthropic },
            { name: 'google', key: keys.google },
            { name: 'groq', key: keys.groq },
            { name: 'github', key: keys.github },
        ];
        
        // Fetch models from all providers in parallel
        const fetchPromises = providers
            .filter(p => p.key) // Only providers with keys
            .map(p => chat.fetchProviderModels(p.name, p.key));
        
        // Also fetch Ollama models if on localhost
        if (storage.isLocalhost()) {
            // Ollama models come from the static /api/models endpoint
            fetchPromises.push(
                chat.fetchModels().then(models => 
                    models.filter(m => m.provider === 'Ollama')
                )
            );
        }
        
        // Wait for all fetches to complete
        const results = await Promise.all(fetchPromises);
        for (const models of results) {
            allModels.push(...models);
        }
        
        // Update chat.models for context window lookups
        chat.models = allModels;
        
        // Populate model picker
        this.modelPicker.innerHTML = '';
        
        if (allModels.length === 0) {
            // No API keys configured - show hint
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Configure API keys in Settings ⚙️';
            option.disabled = true;
            this.modelPicker.appendChild(option);
            this.modelPicker.classList.add('no-keys');
        } else {
            this.modelPicker.classList.remove('no-keys');
            for (const model of allModels) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = `${model.name} (${model.provider})`;
                this.modelPicker.appendChild(option);
            }
            
            // Restore last selected model (if still available)
            const savedModel = storage.getCurrentModel();
            if (savedModel && allModels.find(m => m.id === savedModel)) {
                this.modelPicker.value = savedModel;
            }
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
        
        // Rebuild search index
        this.rebuildSearchIndex();
        
        // Update UI
        this.sessionName.textContent = session.name || 'Untitled Session';
        storage.setLastSessionId(session.id);
        
        // Fit to content if not empty
        if (!this.graph.isEmpty()) {
            setTimeout(() => this.canvas.fitToContent(), 100);
        }
        
        // Generate summaries for existing nodes that don't have them (lazy/background)
        this.generateMissingSummaries();
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
        // Attach slash command menu to chat input
        this.slashCommandMenu.attach(this.chatInput);
        
        // Chat input - send on Enter (but not if slash menu is handling it)
        this.chatInput.addEventListener('keydown', (e) => {
            // Let slash command menu handle navigation keys when visible
            if (this.slashCommandMenu.visible && ['ArrowUp', 'ArrowDown', 'Tab', 'Escape'].includes(e.key)) {
                return; // Menu will handle it
            }
            if (this.slashCommandMenu.visible && e.key === 'Enter') {
                return; // Menu will handle selection
            }
            
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
        
        // Auto-title button
        document.getElementById('auto-title-btn').addEventListener('click', () => {
            this.generateSessionTitle();
        });
        
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
        document.getElementById('cell-copy-btn').addEventListener('click', async () => {
            const content = document.getElementById('cell-content').textContent;
            const btn = document.getElementById('cell-copy-btn');
            try {
                await navigator.clipboard.writeText(content);
                const originalText = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 1500);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });
        
        // Row/Column (slice) detail modal
        document.getElementById('slice-close').addEventListener('click', () => {
            document.getElementById('slice-modal').style.display = 'none';
            this._currentSliceData = null;
        });
        document.getElementById('slice-close-btn').addEventListener('click', () => {
            document.getElementById('slice-modal').style.display = 'none';
            this._currentSliceData = null;
        });
        document.getElementById('slice-pin-btn').addEventListener('click', () => {
            this.pinSliceToCanvas();
        });
        document.getElementById('slice-copy-btn').addEventListener('click', async () => {
            const content = document.getElementById('slice-content').textContent;
            const btn = document.getElementById('slice-copy-btn');
            try {
                await navigator.clipboard.writeText(content);
                const originalText = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 1500);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
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
            // Cmd/Ctrl+K to open search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.openSearch();
                return;
            }
            
            // Escape to close search or clear selection
            if (e.key === 'Escape') {
                if (this.isSearchOpen()) {
                    this.closeSearch();
                } else {
                    this.canvas.clearSelection();
                }
            }
            
            // Delete to remove selected nodes
            if ((e.key === 'Delete' || e.key === 'Backspace') && 
                !e.target.matches('input, textarea')) {
                this.deleteSelectedNodes();
            }
        });
        
        // Search button
        document.getElementById('search-btn').addEventListener('click', () => {
            this.openSearch();
        });
        
        // Search overlay
        document.getElementById('search-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'search-overlay') {
                this.closeSearch();
            }
        });
        
        // Search input
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', () => {
            this.handleSearchInput();
        });
        searchInput.addEventListener('keydown', (e) => {
            this.handleSearchKeydown(e);
        });
    }

    // --- Node Operations ---

    /**
     * Try to handle content as a slash command.
     * Returns true if it was a slash command and was handled, false otherwise.
     * @param {string} content - The user input
     * @param {string} context - Optional context for contextual commands (e.g., selected text)
     */
    async tryHandleSlashCommand(content, context = null) {
        // Check for /search command
        if (content.startsWith('/search ')) {
            const query = content.slice(8).trim();
            if (query) {
                await this.handleSearch(query, context);
                return true;
            }
        }
        
        // Check for /research command
        if (content.startsWith('/research ')) {
            const instructions = content.slice(10).trim();
            if (instructions) {
                await this.handleResearch(instructions);
                return true;
            }
        }
        
        // Check for /matrix command
        if (content.startsWith('/matrix ')) {
            const matrixContext = content.slice(8).trim();
            if (matrixContext) {
                await this.handleMatrix(matrixContext);
                return true;
            }
        }
        
        return false;
    }

    async handleSend() {
        const content = this.chatInput.value.trim();
        if (!content) return;
        
        // Try slash commands first, with context from selected nodes if any
        const selectedIds = this.canvas.getSelectedNodeIds();
        let slashContext = null;
        if (selectedIds.length > 0) {
            // Gather content from selected nodes as context
            const contextParts = selectedIds.map(id => {
                const node = this.graph.getNode(id);
                return node ? node.content : '';
            }).filter(c => c);
            slashContext = contextParts.join('\n\n');
        }
        
        if (await this.tryHandleSlashCommand(content, slashContext)) {
            this.chatInput.value = '';
            this.chatInput.style.height = 'auto';
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
                
                // Generate summary async (don't await - let it happen in background)
                this.generateNodeSummary(aiNode.id);
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

    /**
     * Handle search command.
     * @param {string} query - The user's search query
     * @param {string} context - Optional context to help refine the query (e.g., selected text)
     */
    async handleSearch(query, context = null) {
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
        
        // Create search node with original query initially
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
            let effectiveQuery = query;
            
            // If context is provided, use LLM to generate a better search query
            if (context && context.trim()) {
                this.canvas.updateNodeContent(searchNode.id, `Refining search query...`, true);
                
                const model = this.modelPicker.value;
                const apiKey = chat.getApiKeyForModel(model);
                
                const refineResponse = await fetch('/api/generate-search-query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_query: query,
                        context: context,
                        model: model,
                        api_key: apiKey
                    })
                });
                
                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    effectiveQuery = refineData.search_query;
                    // Update node to show what we're actually searching for
                    this.canvas.updateNodeContent(searchNode.id, `Searching: "${effectiveQuery}"`, true);
                }
            }
            
            // Call Exa API with the (potentially refined) query
            const response = await fetch('/api/exa/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: effectiveQuery,
                    api_key: exaKey,
                    num_results: 5
                })
            });
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Update search node with result count (show both original and effective query if different)
            let searchContent;
            if (effectiveQuery !== query) {
                searchContent = `**Search:** "${query}"\n*Searched for: "${effectiveQuery}"*\n\n*Found ${data.num_results} results*`;
            } else {
                searchContent = `**Search:** "${query}"\n\n*Found ${data.num_results} results*`;
            }
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
            
            // Parse SSE stream using shared utility
            let reportContent = `**Research:** ${instructions}\n\n`;
            let sources = [];
            
            await SSE.readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'status') {
                        const statusContent = `**Research:** ${instructions}\n\n*${data.trim()}*`;
                        this.canvas.updateNodeContent(researchNode.id, statusContent, true);
                    } else if (eventType === 'content') {
                        reportContent += data;
                        this.canvas.updateNodeContent(researchNode.id, reportContent, true);
                        this.graph.updateNode(researchNode.id, { content: reportContent });
                    } else if (eventType === 'sources') {
                        try {
                            sources = JSON.parse(data);
                        } catch (e) {
                            console.error('Failed to parse sources:', e);
                        }
                    }
                },
                onDone: () => {
                    // Normalize the report content
                    reportContent = SSE.normalizeText(reportContent);
                    
                    // Add sources to the report if available
                    if (sources.length > 0) {
                        reportContent += '\n\n---\n**Sources:**\n';
                        for (const source of sources) {
                            reportContent += `- [${source.title}](${source.url})\n`;
                        }
                    }
                    this.canvas.updateNodeContent(researchNode.id, reportContent, false);
                    this.graph.updateNode(researchNode.id, { content: reportContent });
                    
                    // Generate summary async (don't await)
                    this.generateNodeSummary(researchNode.id);
                },
                onError: (err) => {
                    throw err;
                }
            });
            
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
        const apiKey = chat.getApiKeyForModel(model);
        
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
        const baseUrl = chat.getBaseUrl();
        const requestBody = {
            content,
            context,
            model,
            api_key: apiKey
        };
        
        if (baseUrl) {
            requestBody.base_url = baseUrl;
        }
        
        const response = await fetch('/api/parse-two-lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to parse lists: ${response.statusText}`);
        }
        
        return response.json();
    }
    
    async parseListItems(content, model, apiKey) {
        const baseUrl = chat.getBaseUrl();
        const requestBody = {
            content,
            model,
            api_key: apiKey
        };
        
        if (baseUrl) {
            requestBody.base_url = baseUrl;
        }
        
        const response = await fetch('/api/parse-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
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
        
        // Generate summary async (don't await)
        this.generateNodeSummary(matrixNode.id);
        
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
        const apiKey = chat.getApiKeyForModel(model);
        const baseUrl = chat.getBaseUrl();
        
        const rowItem = matrixNode.rowItems[row];
        const colItem = matrixNode.colItems[col];
        const context = matrixNode.context;
        
        // Get DAG history for context
        const messages = this.graph.resolveContext([nodeId]);
        
        try {
            const requestBody = {
                row_item: rowItem,
                col_item: colItem,
                context: context,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                model,
                api_key: apiKey
            };
            
            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }
            
            // Start streaming fill
            const response = await fetch('/api/matrix/fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fill cell: ${response.statusText}`);
            }
            
            // Stream the response using shared SSE utility
            let cellContent = '';
            await SSE.streamSSEContent(response, {
                onContent: (chunk, fullContent) => {
                    cellContent = fullContent;
                    this.canvas.updateMatrixCell(nodeId, row, col, cellContent, true);
                },
                onDone: (normalizedContent) => {
                    cellContent = normalizedContent;
                    this.canvas.updateMatrixCell(nodeId, row, col, cellContent, false);
                },
                onError: (err) => {
                    throw err;
                }
            });
            
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
        
        // Create cell node with title combining row and column names
        const cellTitle = `${rowItem} x ${colItem}`;
        const cellNode = createCellNode(matrixId, row, col, rowItem, colItem, content, {
            position: {
                x: matrixNode.position.x + (matrixNode.width || 500) + 50,
                y: matrixNode.position.y + (row * 60)
            },
            title: cellTitle
        });
        
        this.graph.addNode(cellNode);
        this.canvas.renderNode(cellNode);
        
        // Create edge from matrix to cell (arrow points to the pinned cell)
        const edge = createEdge(matrixId, cellNode.id, EdgeType.MATRIX_CELL);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, matrixNode.position, cellNode.position);
        
        // Close modal
        document.getElementById('cell-modal').style.display = 'none';
        this._currentCellData = null;
        
        // Select the new cell node
        this.canvas.clearSelection();
        this.canvas.selectNode(cellNode.id);
        
        // Generate summary async (don't await)
        this.generateNodeSummary(cellNode.id);
        
        this.saveSession();
        this.updateEmptyState();
    }
    
    /**
     * Handle extracting a row from a matrix - show preview modal
     */
    handleMatrixRowExtract(nodeId, rowIndex) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;
        
        const { rowItems, colItems, cells } = matrixNode;
        const rowItem = rowItems[rowIndex];
        
        // Collect cell contents for this row
        const cellContents = [];
        for (let c = 0; c < colItems.length; c++) {
            const cellKey = `${rowIndex}-${c}`;
            const cell = cells[cellKey];
            cellContents.push(cell && cell.content ? cell.content : null);
        }
        
        // Format content for display
        let displayContent = '';
        for (let c = 0; c < colItems.length; c++) {
            const content = cellContents[c];
            displayContent += `${colItems[c]}:\n${content || '(empty)'}\n\n`;
        }
        
        // Store slice data for pinning
        this._currentSliceData = {
            type: 'row',
            matrixId: nodeId,
            index: rowIndex,
            item: rowItem,
            otherAxisItems: colItems,
            cellContents: cellContents
        };
        
        // Populate and show modal
        document.getElementById('slice-title').textContent = 'Row Details';
        document.getElementById('slice-label').textContent = 'Row:';
        document.getElementById('slice-item').textContent = rowItem;
        document.getElementById('slice-content').textContent = displayContent.trim();
        document.getElementById('slice-modal').style.display = 'flex';
    }
    
    /**
     * Handle extracting a column from a matrix - show preview modal
     */
    handleMatrixColExtract(nodeId, colIndex) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;
        
        const { rowItems, colItems, cells } = matrixNode;
        const colItem = colItems[colIndex];
        
        // Collect cell contents for this column
        const cellContents = [];
        for (let r = 0; r < rowItems.length; r++) {
            const cellKey = `${r}-${colIndex}`;
            const cell = cells[cellKey];
            cellContents.push(cell && cell.content ? cell.content : null);
        }
        
        // Format content for display
        let displayContent = '';
        for (let r = 0; r < rowItems.length; r++) {
            const content = cellContents[r];
            displayContent += `${rowItems[r]}:\n${content || '(empty)'}\n\n`;
        }
        
        // Store slice data for pinning
        this._currentSliceData = {
            type: 'column',
            matrixId: nodeId,
            index: colIndex,
            item: colItem,
            otherAxisItems: rowItems,
            cellContents: cellContents
        };
        
        // Populate and show modal
        document.getElementById('slice-title').textContent = 'Column Details';
        document.getElementById('slice-label').textContent = 'Column:';
        document.getElementById('slice-item').textContent = colItem;
        document.getElementById('slice-content').textContent = displayContent.trim();
        document.getElementById('slice-modal').style.display = 'flex';
    }
    
    /**
     * Pin the currently viewed row/column slice to the canvas
     */
    pinSliceToCanvas() {
        if (!this._currentSliceData) return;
        
        const { type, matrixId, index, item, otherAxisItems, cellContents } = this._currentSliceData;
        const matrixNode = this.graph.getNode(matrixId);
        if (!matrixNode) return;
        
        let sliceNode;
        if (type === 'row') {
            sliceNode = createRowNode(matrixId, index, item, otherAxisItems, cellContents, {
                position: {
                    x: matrixNode.position.x + (matrixNode.width || 500) + 50,
                    y: matrixNode.position.y + (index * 60)
                },
                title: item
            });
        } else {
            sliceNode = createColumnNode(matrixId, index, item, otherAxisItems, cellContents, {
                position: {
                    x: matrixNode.position.x + (matrixNode.width || 500) + 50,
                    y: matrixNode.position.y + (index * 60)
                },
                title: item
            });
        }
        
        this.graph.addNode(sliceNode);
        this.canvas.renderNode(sliceNode);
        
        // Create edge from matrix to slice node
        const edge = createEdge(matrixId, sliceNode.id, EdgeType.MATRIX_CELL);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, matrixNode.position, sliceNode.position);
        
        // Close modal
        document.getElementById('slice-modal').style.display = 'none';
        this._currentSliceData = null;
        
        // Select the new node
        this.canvas.clearSelection();
        this.canvas.selectNode(sliceNode.id);
        
        // Generate summary async
        this.generateNodeSummary(sliceNode.id);
        
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

    async handleNodeBranch(nodeId, selectedText, replyText) {
        // If text was selected, create a highlight node with that excerpt
        if (selectedText) {
            const sourceNode = this.graph.getNode(nodeId);
            if (!sourceNode) return;
            
            // Position the new node in the visible viewport area
            // Get the center of the current viewport and offset slightly
            const viewportCenter = this.canvas.getViewportCenter();
            
            // Create highlight node with the selected text, positioned in view
            const highlightNode = createNode(NodeType.HIGHLIGHT, `> ${selectedText}`, {
                position: {
                    x: viewportCenter.x + 50,  // Slight offset from center
                    y: viewportCenter.y - 100  // Above center for visibility
                }
            });
            
            this.graph.addNode(highlightNode);
            this.canvas.renderNode(highlightNode);
            
            // Create highlight edge (dashed connection)
            const edge = createEdge(nodeId, highlightNode.id, EdgeType.HIGHLIGHT);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, sourceNode.position, highlightNode.position);
            
            this.saveSession();
            this.updateEmptyState();
            
            // If user provided a reply, check for slash commands first
            if (replyText && replyText.trim()) {
                const content = replyText.trim();
                
                // Select highlight node so commands/replies connect to it
                this.canvas.clearSelection();
                this.canvas.selectNode(highlightNode.id);
                
                // Try slash commands first, passing selectedText as context
                if (await this.tryHandleSlashCommand(content, selectedText)) {
                    return;
                }
                
                // Regular reply - create user node as reply to highlight
                const humanNode = createNode(NodeType.HUMAN, content, {
                    position: this.graph.autoPosition([highlightNode.id])
                });
                
                this.graph.addNode(humanNode);
                this.canvas.renderNode(humanNode);
                
                // Edge from highlight to user message
                const humanEdge = createEdge(highlightNode.id, humanNode.id, EdgeType.REPLY);
                this.graph.addEdge(humanEdge);
                this.canvas.renderEdge(humanEdge, highlightNode.position, humanNode.position);
                
                this.saveSession();
                
                // Create AI response node
                const model = this.modelPicker.value;
                const aiNode = createNode(NodeType.AI, '', {
                    position: this.graph.autoPosition([humanNode.id]),
                    model: model.split('/').pop()
                });
                
                this.graph.addNode(aiNode);
                this.canvas.renderNode(aiNode);
                
                const aiEdge = createEdge(humanNode.id, aiNode.id, EdgeType.REPLY);
                this.graph.addEdge(aiEdge);
                this.canvas.renderEdge(aiEdge, humanNode.position, aiNode.position);
                
                // Center on the AI node
                this.canvas.centerOn(
                    aiNode.position.x + 160,
                    aiNode.position.y + 100
                );
                
                // Build context and stream LLM response
                const context = this.graph.resolveContext([humanNode.id]);
                const messages = context.map(m => ({ role: m.role, content: m.content }));
                
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
                        this.generateNodeSummary(aiNode.id);
                    },
                    // onError
                    (err) => {
                        const errorMsg = `Error: ${err.message}`;
                        this.canvas.updateNodeContent(aiNode.id, errorMsg, false);
                        this.graph.updateNode(aiNode.id, { content: errorMsg });
                        this.saveSession();
                    }
                );
            } else {
                // No reply text - just select highlight node for follow-up
                this.canvas.clearSelection();
                this.canvas.selectNode(highlightNode.id);
                this.chatInput.focus();
            }
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

    /**
     * Handle fetching full content from a Reference node URL and summarizing it
     */
    async handleNodeFetchSummarize(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.REFERENCE) return;
        
        // Extract URL from the node content (format: **[Title](url)**)
        const url = this.extractUrlFromReferenceNode(node.content);
        if (!url) {
            alert('Could not extract URL from this reference node.');
            return;
        }
        
        // Check for Exa API key
        const exaKey = storage.getExaApiKey();
        if (!exaKey) {
            alert('Please set your Exa API key in Settings to fetch content.');
            this.showSettingsModal();
            return;
        }
        
        const model = this.modelPicker.value;
        
        // Create summary node
        const summaryNode = createNode(NodeType.SUMMARY, 'Fetching content...', {
            position: {
                x: node.position.x + 400,
                y: node.position.y
            }
        });
        
        this.graph.addNode(summaryNode);
        this.canvas.renderNode(summaryNode);
        
        const edge = createEdge(nodeId, summaryNode.id, EdgeType.REFERENCE);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, node.position, summaryNode.position);
        
        try {
            // Fetch content from URL via Exa
            this.canvas.updateNodeContent(summaryNode.id, 'Fetching content from URL...', true);
            
            const response = await fetch('/api/exa/get-contents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    api_key: exaKey
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to fetch content');
            }
            
            const contentData = await response.json();
            
            if (!contentData.text || contentData.text.trim().length === 0) {
                throw new Error('No text content found at this URL');
            }
            
            // Now summarize the content with LLM
            this.canvas.updateNodeContent(summaryNode.id, 'Summarizing content...', true);
            
            const messages = [
                { role: 'user', content: `Please provide a comprehensive summary of the following article:\n\n**${contentData.title}**\n\n${contentData.text}` }
            ];
            
            const summary = await chat.summarize(messages, model);
            
            // Add source attribution
            const fullSummary = `**Summary of: [${contentData.title}](${url})**\n\n${summary}`;
            
            this.canvas.updateNodeContent(summaryNode.id, fullSummary, false);
            this.graph.updateNode(summaryNode.id, { content: fullSummary });
            this.saveSession();
            
        } catch (err) {
            this.canvas.updateNodeContent(summaryNode.id, `Error: ${err.message}`, false);
            this.graph.updateNode(summaryNode.id, { content: `Error: ${err.message}` });
        }
    }

    /**
     * Extract URL from Reference node content (format: **[Title](url)**)
     */
    extractUrlFromReferenceNode(content) {
        // Match markdown link pattern: [text](url)
        const match = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match && match[2]) {
            return match[2];
        }
        return null;
    }

    handleNodeSelect(selectedIds) {
        this.updateSelectedIndicator(selectedIds);
        this.updateContextHighlight(selectedIds);
        this.updateContextBudget(selectedIds);
        
        // Clear any previous matrix cell highlights
        this.canvas.clearMatrixCellHighlights();
        
        // Clear any previous source text highlights
        this.canvas.clearSourceTextHighlights();
        
        // If a cell node is selected, highlight its source cell in the matrix
        if (selectedIds.length === 1) {
            const node = this.graph.getNode(selectedIds[0]);
            if (node && node.type === NodeType.CELL && node.matrixId) {
                this.canvas.highlightMatrixCell(node.matrixId, node.rowIndex, node.colIndex);
            }
            
            // If a highlight node is selected, highlight the source text in the parent node
            if (node && node.type === NodeType.HIGHLIGHT) {
                this.highlightSourceTextInParent(node);
            }
        }
        
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
        
        // Clear matrix cell highlights when deselecting
        this.canvas.clearMatrixCellHighlights();
        
        // Clear source text highlights when deselecting
        this.canvas.clearSourceTextHighlights();
        
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

    handleNodeTitleEdit(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;
        
        const currentTitle = node.title || node.summary || '';
        const newTitle = prompt('Edit node title:', currentTitle);
        
        if (newTitle !== null) {
            // Update the node title (empty string clears it, using summary/truncation as fallback)
            const title = newTitle.trim() || null;
            this.graph.updateNode(nodeId, { title });
            
            // Update the DOM
            const wrapper = this.canvas.nodeElements.get(nodeId);
            if (wrapper) {
                const summaryText = wrapper.querySelector('.summary-text');
                if (summaryText) {
                    summaryText.textContent = title || node.summary || this.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
                }
            }
            
            this.saveSession();
        }
    }
    
    /**
     * Highlight the source text in the parent node when a highlight excerpt is selected
     * @param {Object} highlightNode - The highlight node that was selected
     */
    highlightSourceTextInParent(highlightNode) {
        // Get the parent node (source of the excerpt)
        const parents = this.graph.getParents(highlightNode.id);
        if (parents.length === 0) return;
        
        const parentNode = parents[0];
        
        // Extract the excerpted text from the highlight node content
        // The content is stored as "> {selectedText}"
        let excerptText = highlightNode.content || '';
        if (excerptText.startsWith('> ')) {
            excerptText = excerptText.slice(2);
        }
        
        if (!excerptText.trim()) return;
        
        // Highlight the text in the parent node
        this.canvas.highlightTextInNode(parentNode.id, excerptText);
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

    async generateSessionTitle() {
        // Check if there's any content to generate a title from
        if (this.graph.isEmpty()) {
            alert('Add some messages first to generate a title.');
            return;
        }
        
        const btn = document.getElementById('auto-title-btn');
        const originalContent = btn.textContent;
        
        try {
            // Show loading state
            btn.textContent = '⏳';
            btn.disabled = true;
            
            // Gather content from root nodes and their immediate replies
            const nodes = this.graph.getAllNodes();
            const contentParts = [];
            
            // Get first few nodes (prioritize human messages)
            const humanNodes = nodes.filter(n => n.type === NodeType.HUMAN);
            const aiNodes = nodes.filter(n => n.type === NodeType.AI);
            
            // Take first 3 human messages and first 2 AI responses
            for (const node of humanNodes.slice(0, 3)) {
                contentParts.push(`User: ${node.content.slice(0, 200)}`);
            }
            for (const node of aiNodes.slice(0, 2)) {
                contentParts.push(`Assistant: ${node.content.slice(0, 200)}`);
            }
            
            const content = contentParts.join('\n\n');
            
            if (!content.trim()) {
                alert('Not enough content to generate a title.');
                return;
            }
            
            const model = this.modelPicker.value;
            const apiKey = chat.getApiKeyForModel(model);
            const baseUrl = chat.getBaseUrl();
            
            const requestBody = {
                content,
                model,
                api_key: apiKey
            };
            
            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }
            
            const response = await fetch('/api/generate-title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to generate title: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Update session name
            this.session.name = data.title;
            this.sessionName.textContent = data.title;
            this.saveSession();
            
        } catch (err) {
            console.error('Failed to generate title:', err);
            alert(`Failed to generate title: ${err.message}`);
        } finally {
            // Restore button
            btn.textContent = originalContent;
            btn.disabled = false;
        }
    }

    /**
     * Generate a summary for a node (for semantic zoom)
     * Called async after AI/Research/Cell/Matrix nodes complete
     */
    async generateNodeSummary(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.summary) return;
        
        // Only generate for supported node types
        const supportedTypes = [NodeType.AI, NodeType.RESEARCH, NodeType.CELL, NodeType.MATRIX];
        if (!supportedTypes.includes(node.type)) return;
        
        // For non-matrix nodes, require content
        if (node.type !== NodeType.MATRIX && !node.content) return;
        
        try {
            const model = this.modelPicker.value;
            const apiKey = chat.getApiKeyForModel(model);
            const baseUrl = chat.getBaseUrl();
            
            // Build content string based on node type
            let contentForSummary;
            if (node.type === NodeType.MATRIX) {
                // For matrix, describe the structure
                const filledCells = Object.values(node.cells || {}).filter(c => c.filled).length;
                const totalCells = (node.rowItems?.length || 0) * (node.colItems?.length || 0);
                contentForSummary = `Matrix evaluation: "${node.context}"\n` +
                    `Rows: ${node.rowItems?.join(', ')}\n` +
                    `Columns: ${node.colItems?.join(', ')}\n` +
                    `Progress: ${filledCells}/${totalCells} cells filled`;
            } else {
                contentForSummary = node.content;
            }
            
            const requestBody = {
                content: contentForSummary,
                model,
                api_key: apiKey
            };
            
            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }
            
            const response = await fetch('/api/generate-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                console.warn(`Failed to generate summary for node ${nodeId}`);
                return;
            }
            
            const data = await response.json();
            
            // Update node with summary
            this.graph.updateNode(nodeId, { summary: data.summary });
            
            // Update the node's summary text in the DOM if it exists
            const wrapper = this.canvas.nodeElements.get(nodeId);
            if (wrapper) {
                const summaryText = wrapper.querySelector('.summary-text');
                if (summaryText) {
                    summaryText.textContent = data.summary;
                }
            }
            
            this.saveSession();
            
        } catch (err) {
            console.warn('Failed to generate node summary:', err);
            // Fail silently - truncation fallback will be used
        }
    }

    /**
     * Generate summaries for existing nodes that don't have them
     * Called after loading a session to lazily populate missing summaries
     */
    generateMissingSummaries() {
        const supportedTypes = [NodeType.AI, NodeType.RESEARCH, NodeType.CELL, NodeType.MATRIX];
        const nodes = this.graph.getAllNodes();
        for (const node of nodes) {
            if (supportedTypes.includes(node.type) && !node.summary) {
                // Don't await - let them run in parallel/background
                this.generateNodeSummary(node.id);
            }
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
        
        // Load base URL
        document.getElementById('base-url').value = storage.getBaseUrl() || '';
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
        
        // Save base URL
        const baseUrl = document.getElementById('base-url').value.trim();
        storage.setBaseUrl(baseUrl);
        
        // Reload models to reflect newly configured API keys
        this.loadModels();
        
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
    
    // --- Search Methods ---
    
    /**
     * Rebuild the search index from current graph nodes
     */
    rebuildSearchIndex() {
        const nodes = this.graph.getAllNodes();
        this.searchIndex.buildFromNodes(nodes);
    }
    
    /**
     * Check if search overlay is open
     */
    isSearchOpen() {
        return document.getElementById('search-overlay').style.display !== 'none';
    }
    
    /**
     * Open the search overlay
     */
    openSearch() {
        // Rebuild index to ensure it's fresh
        this.rebuildSearchIndex();
        
        const overlay = document.getElementById('search-overlay');
        const input = document.getElementById('search-input');
        const results = document.getElementById('search-results');
        
        overlay.style.display = 'flex';
        input.value = '';
        this.searchSelectedIndex = 0;
        
        // Show empty state
        results.innerHTML = '<div class="search-empty">Type to search through your nodes</div>';
        
        // Focus input
        setTimeout(() => input.focus(), 50);
    }
    
    /**
     * Close the search overlay
     */
    closeSearch() {
        const overlay = document.getElementById('search-overlay');
        const input = document.getElementById('search-input');
        
        overlay.style.display = 'none';
        input.value = '';
        this.searchSelectedIndex = 0;
    }
    
    /**
     * Handle search input changes
     */
    handleSearchInput() {
        const input = document.getElementById('search-input');
        const query = input.value.trim();
        
        if (!query) {
            this.renderSearchResults([]);
            return;
        }
        
        const results = this.searchIndex.search(query, 15);
        this.searchSelectedIndex = 0;
        this.renderSearchResults(results, query);
    }
    
    /**
     * Handle keyboard navigation in search results
     */
    handleSearchKeydown(e) {
        const results = document.querySelectorAll('.search-result');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.searchSelectedIndex = Math.min(this.searchSelectedIndex + 1, results.length - 1);
            this.updateSearchSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.searchSelectedIndex = Math.max(this.searchSelectedIndex - 1, 0);
            this.updateSearchSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = results[this.searchSelectedIndex];
            if (selected) {
                const nodeId = selected.dataset.nodeId;
                this.navigateToNode(nodeId);
                this.closeSearch();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeSearch();
        }
    }
    
    /**
     * Update visual selection in search results
     */
    updateSearchSelection() {
        const results = document.querySelectorAll('.search-result');
        results.forEach((el, idx) => {
            el.classList.toggle('selected', idx === this.searchSelectedIndex);
        });
        
        // Scroll selected into view
        const selected = results[this.searchSelectedIndex];
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }
    
    /**
     * Render search results
     */
    renderSearchResults(results, query = '') {
        const container = document.getElementById('search-results');
        
        if (!query) {
            container.innerHTML = '<div class="search-empty">Type to search through your nodes</div>';
            return;
        }
        
        if (results.length === 0) {
            container.innerHTML = '<div class="search-no-results">No results found</div>';
            return;
        }
        
        // Escape HTML in query for highlighting
        const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        
        const html = results.map((result, idx) => {
            const icon = getNodeTypeIcon(result.type);
            const typeName = result.type.charAt(0).toUpperCase() + result.type.slice(1);
            
            // Highlight matching terms in snippet
            let snippet = this.escapeHtml(result.snippet);
            for (const token of queryTokens) {
                const regex = new RegExp(`(${this.escapeRegex(token)})`, 'gi');
                snippet = snippet.replace(regex, '<mark>$1</mark>');
            }
            
            return `
                <div class="search-result${idx === 0 ? ' selected' : ''}" data-node-id="${result.nodeId}">
                    <span class="search-result-icon">${icon}</span>
                    <div class="search-result-content">
                        <div class="search-result-type">${typeName}</div>
                        <div class="search-result-snippet">${snippet}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html + `
            <div class="search-result-nav-hint">
                <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
                <span><kbd>Enter</kbd> to select</span>
                <span><kbd>Esc</kbd> to close</span>
            </div>
        `;
        
        // Add click handlers
        container.querySelectorAll('.search-result').forEach((el, idx) => {
            el.addEventListener('click', () => {
                const nodeId = el.dataset.nodeId;
                this.navigateToNode(nodeId);
                this.closeSearch();
            });
            
            el.addEventListener('mouseenter', () => {
                this.searchSelectedIndex = idx;
                this.updateSearchSelection();
            });
        });
    }
    
    /**
     * Navigate to a node and select it
     */
    navigateToNode(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;
        
        // Clear current selection and select the target node
        this.canvas.clearSelection();
        this.canvas.selectNode(nodeId);
        
        // Pan to center the node in view
        this.canvas.panToNode(nodeId);
    }
    
    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
