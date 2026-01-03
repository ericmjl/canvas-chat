/**
 * Main application - ties together all modules
 */

/**
 * Feature flag for CRDT-backed graph (local-first multiplayer foundation)
 * Set to true to enable Yjs-based graph with automatic persistence
 * Set to false for legacy Map-based graph
 */
const USE_CRDT_GRAPH = false;

/**
 * Detect if content is a URL (used by handleNote to route to handleNoteFromUrl)
 * @param {string} content - The content to check
 * @returns {boolean} True if content is a URL
 */
function isUrlContent(content) {
    const urlPattern = /^https?:\/\/[^\s]+$/;
    return urlPattern.test(content.trim());
}

/**
 * Extract URL from Reference node content (format: **[Title](url)**)
 * @param {string} content - The node content
 * @returns {string|null} The URL or null if not found
 */
function extractUrlFromReferenceNode(content) {
    // Match markdown link pattern: [text](url)
    const match = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (match && match[2]) {
        return match[2];
    }
    return null;
}

/**
 * Format a technical error into a user-friendly message
 * @param {Error|string} error - The error to format
 * @returns {{ title: string, description: string, canRetry: boolean }}
 */
function formatUserError(error) {
    const errMsg = error?.message || String(error);
    const errLower = errMsg.toLowerCase();

    // Timeout errors
    if (errLower.includes('timeout') || errLower.includes('etimedout') || errLower.includes('took too long')) {
        return {
            title: 'Request timed out',
            description: 'The server is taking too long to respond. This may be due to high load.',
            canRetry: true
        };
    }

    // Authentication errors
    if (errLower.includes('401') || errLower.includes('unauthorized') || errLower.includes('invalid api key')) {
        return {
            title: 'Authentication failed',
            description: 'Your API key may be invalid or expired. Please check your settings.',
            canRetry: false
        };
    }

    // Rate limit errors
    if (errLower.includes('429') || errLower.includes('rate limit') || errLower.includes('too many requests')) {
        return {
            title: 'Rate limit reached',
            description: 'Too many requests. Please wait a moment before trying again.',
            canRetry: true
        };
    }

    // Server errors
    if (errLower.includes('500') || errLower.includes('502') || errLower.includes('503') || errLower.includes('server error')) {
        return {
            title: 'Server error',
            description: 'The server encountered an error. Please try again later.',
            canRetry: true
        };
    }

    // Network errors
    if (errLower.includes('failed to fetch') || errLower.includes('network') || errLower.includes('connection')) {
        return {
            title: 'Network error',
            description: 'Could not connect to the server. Please check your internet connection.',
            canRetry: true
        };
    }

    // Context length errors
    if (errLower.includes('context length') || errLower.includes('too long') || errLower.includes('maximum context')) {
        return {
            title: 'Message too long',
            description: 'The conversation is too long for this model. Try selecting fewer nodes.',
            canRetry: false
        };
    }

    // Default error
    return {
        title: 'Something went wrong',
        description: errMsg || 'An unexpected error occurred. Please try again.',
        canRetry: true
    };
}

/**
 * Truncate text to a maximum length
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text with ellipsis
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
}

/**
 * Escape HTML special characters
 * @param {string} text - The text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtmlText(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format a matrix node as a markdown table
 * @param {Object} matrixNode - The matrix node
 * @returns {string} Markdown table representation
 */
function formatMatrixAsText(matrixNode) {
    const { context, rowItems, colItems, cells } = matrixNode;

    let text = `## ${context}\n\n`;

    // Header row
    text += '| |';
    for (const colItem of colItems) {
        text += ` ${colItem} |`;
    }
    text += '\n';

    // Separator row
    text += '|---|';
    for (let c = 0; c < colItems.length; c++) {
        text += '---|';
    }
    text += '\n';

    // Data rows
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
}

/**
 * Build messages for LLM API from resolved context.
 * Handles multimodal content (images + text).
 *
 * When a user sends a message with image nodes in context, the images
 * should be combined with the user's text into a single multimodal message.
 *
 * @param {Array} contextMessages - Messages from graph.resolveContext()
 * @returns {Array} - Messages formatted for the LLM API
 */
function buildMessagesForApi(contextMessages) {
    const result = [];
    let pendingImages = [];  // Collect consecutive image messages

    for (let i = 0; i < contextMessages.length; i++) {
        const msg = contextMessages[i];

        if (msg.imageData) {
            // Collect image for potential merging
            pendingImages.push({
                type: 'image_url',
                image_url: {
                    url: `data:${msg.mimeType};base64,${msg.imageData}`
                }
            });
        } else if (msg.content) {
            // Text message - check if we should merge with pending images
            if (pendingImages.length > 0 && msg.role === 'user') {
                // Merge images with this text message
                result.push({
                    role: 'user',
                    content: [
                        ...pendingImages,
                        { type: 'text', text: msg.content }
                    ]
                });
                pendingImages = [];
            } else {
                // Flush any pending images as separate messages first
                for (const imgPart of pendingImages) {
                    result.push({
                        role: 'user',
                        content: [imgPart]
                    });
                }
                pendingImages = [];

                // Add text message
                result.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        }
    }

    // Flush any remaining pending images
    for (const imgPart of pendingImages) {
        result.push({
            role: 'user',
            content: [imgPart]
        });
    }

    return result;
}

/**
 * Resize an image file to max dimensions, returns base64 data URL.
 *
 * @param {File} file - The image file to resize
 * @param {number} maxDimension - Maximum width or height (default 2048)
 * @returns {Promise<string>} - The resized image as a data URL
 */
async function resizeImage(file, maxDimension = 2048) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            // Only resize if needed
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // JPEG for photos (smaller), PNG if original was PNG (transparency)
            const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const quality = outputType === 'image/jpeg' ? 0.85 : undefined;
            const dataUrl = canvas.toDataURL(outputType, quality);

            URL.revokeObjectURL(img.src);  // Clean up
            resolve(dataUrl);
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };
        img.src = URL.createObjectURL(file);
    });
}

// Slash command definitions
const SLASH_COMMANDS = [
    { command: '/note', description: 'Add a note or fetch URL content', placeholder: 'markdown or https://...' },
    { command: '/search', description: 'Search the web with Exa AI', placeholder: 'query' },
    { command: '/research', description: 'Deep research with multiple sources', placeholder: 'topic' },
    { command: '/matrix', description: 'Create a comparison matrix', placeholder: 'context for matrix' },
    { command: '/committee', description: 'Consult multiple LLMs and synthesize', placeholder: 'question' },
];

/**
 * Undo/Redo manager for tracking user actions
 */
class UndoManager {
    constructor(maxHistory = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
        this.onStateChange = null;  // Callback when undo/redo state changes
    }

    /**
     * Push an action onto the undo stack
     */
    push(action) {
        this.undoStack.push(action);

        // Limit history size
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        // Clear redo stack on new action
        this.redoStack = [];

        if (this.onStateChange) this.onStateChange();
    }

    /**
     * Undo the last action
     * @returns {Object|null} The action to undo, or null if nothing to undo
     */
    undo() {
        if (!this.canUndo()) return null;

        const action = this.undoStack.pop();
        this.redoStack.push(action);

        if (this.onStateChange) this.onStateChange();
        return action;
    }

    /**
     * Redo the last undone action
     * @returns {Object|null} The action to redo, or null if nothing to redo
     */
    redo() {
        if (!this.canRedo()) return null;

        const action = this.redoStack.pop();
        this.undoStack.push(action);

        if (this.onStateChange) this.onStateChange();
        return action;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        if (this.onStateChange) this.onStateChange();
    }
}

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

        // Streaming state - Map of nodeId -> { abortController, context }
        this.streamingNodes = new Map();

        // Matrix streaming state - Map of nodeId -> Map of cellKey -> AbortController
        // Allows stopping all cell fills for a matrix node at once
        this.streamingMatrixCells = new Map();

        // Retry contexts for error recovery
        this.retryContexts = new Map();  // nodeId -> { type, ...context }

        // Edit content modal state
        this.editingNodeId = null;

        // Undo/Redo manager
        this.undoManager = new UndoManager();

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
        // Configure marked.js early (ensures KaTeX and other extensions are set up)
        Canvas.configureMarked();

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
        this.canvas.onNodeCopy = this.copyNodeContent.bind(this);
        this.canvas.onNodeTitleEdit = this.handleNodeTitleEdit.bind(this);

        // Matrix-specific callbacks
        this.canvas.onMatrixCellFill = this.handleMatrixCellFill.bind(this);
        this.canvas.onMatrixCellView = this.handleMatrixCellView.bind(this);
        this.canvas.onMatrixFillAll = this.handleMatrixFillAll.bind(this);
        this.canvas.onMatrixRowExtract = this.handleMatrixRowExtract.bind(this);
        this.canvas.onMatrixColExtract = this.handleMatrixColExtract.bind(this);
        this.canvas.onMatrixEdit = this.handleMatrixEdit.bind(this);

        // Streaming control callbacks
        this.canvas.onNodeStopGeneration = this.handleNodeStopGeneration.bind(this);
        this.canvas.onNodeContinueGeneration = this.handleNodeContinueGeneration.bind(this);

        // Error handling callbacks
        this.canvas.onNodeRetry = this.handleNodeRetry.bind(this);
        this.canvas.onNodeDismissError = this.handleNodeDismissError.bind(this);

        // Node resize to viewport callback
        this.canvas.onNodeFitToViewport = this.handleNodeFitToViewport.bind(this);
        this.canvas.onNodeResetSize = this.handleNodeResetSize.bind(this);

        // Content editing callbacks (for FETCH_RESULT nodes)
        this.canvas.onNodeEditContent = this.handleNodeEditContent.bind(this);
        this.canvas.onNodeResummarize = this.handleNodeResummarize.bind(this);

        // PDF drag & drop callback
        this.canvas.onPdfDrop = this.handlePdfDrop.bind(this);

        // Image drag & drop callback
        this.canvas.onImageDrop = this.handleImageDrop.bind(this);

        // Image click callback (for images in node content)
        this.canvas.onImageClick = this.handleImageClick.bind(this);

        // Navigation callbacks for parent/child traversal
        this.canvas.onNavParentClick = this.handleNavParentClick.bind(this);
        this.canvas.onNavChildClick = this.handleNavChildClick.bind(this);
        this.canvas.onNodeNavigate = this.handleNodeNavigate.bind(this);

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
                await this.loadSessionData(session);
                return;
            }
        }

        // Create new session
        await this.createNewSession();
    }

    async loadSessionData(session) {
        this.session = session;

        if (USE_CRDT_GRAPH) {
            // CRDT mode: create CRDTGraph with automatic persistence
            console.log('%c[App] Using CRDT Graph mode', 'color: #2196F3; font-weight: bold');
            this.graph = new CRDTGraph(session.id, session);
            await this.graph.enablePersistence();
        } else {
            // Legacy mode
            console.log('[App] Using legacy Graph mode');
            this.graph = new Graph(session);
        }

        // Render graph
        this.canvas.renderGraph(this.graph);

        // Update navigation button states after rendering
        // Delay slightly to ensure nodes are rendered
        requestAnimationFrame(() => {
            this.canvas.updateAllNavButtonStates(this.graph);
        });

        // Rebuild search index
        this.rebuildSearchIndex();

        // Update UI
        this.sessionName.textContent = session.name || 'Untitled Session';
        storage.setLastSessionId(session.id);

        // Update empty state (remove welcome message if session has nodes)
        this.updateEmptyState();

        // Fit to content if not empty
        if (!this.graph.isEmpty()) {
            setTimeout(() => this.canvas.fitToContent(), 100);
        }

        // Generate summaries for existing nodes that don't have them (lazy/background)
        this.generateMissingSummaries();
    }

    async createNewSession() {
        const sessionId = crypto.randomUUID();
        this.session = {
            id: sessionId,
            name: 'Untitled Session',
            created_at: Date.now(),
            updated_at: Date.now(),
            nodes: [],
            edges: [],
            tags: {},
            viewport: { x: 0, y: 0, scale: 1 }
        };

        if (USE_CRDT_GRAPH) {
            // CRDT mode
            console.log('%c[App] Creating new session with CRDT Graph', 'color: #2196F3; font-weight: bold');
            this.graph = new CRDTGraph(sessionId);
            await this.graph.enablePersistence();
        } else {
            // Legacy mode
            this.graph = new Graph();
        }

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

        // Help modal
        document.getElementById('help-btn').addEventListener('click', () => {
            this.showHelpModal();
        });
        document.getElementById('help-close').addEventListener('click', () => {
            this.hideHelpModal();
        });

        // Edit content modal
        document.getElementById('edit-content-close').addEventListener('click', () => {
            this.hideEditContentModal();
        });
        document.getElementById('edit-content-cancel').addEventListener('click', () => {
            this.hideEditContentModal();
        });
        document.getElementById('edit-content-save').addEventListener('click', () => {
            this.handleEditContentSave();
        });

        // Edit title modal
        document.getElementById('edit-title-close').addEventListener('click', () => {
            this.hideEditTitleModal();
        });
        document.getElementById('edit-title-cancel').addEventListener('click', () => {
            this.hideEditTitleModal();
        });
        document.getElementById('edit-title-save').addEventListener('click', () => {
            this.saveNodeTitle();
        });
        document.getElementById('edit-title-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveNodeTitle();
            } else if (e.key === 'Escape') {
                this.hideEditTitleModal();
            }
        });

        // Undo/Redo buttons
        this.undoBtn = document.getElementById('undo-btn');
        this.redoBtn = document.getElementById('redo-btn');
        this.undoBtn.addEventListener('click', () => this.undo());
        this.redoBtn.addEventListener('click', () => this.redo());

        // Wire up undo manager state changes
        this.undoManager.onStateChange = () => this.updateUndoButtons();

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

        // PDF attachment
        document.getElementById('attach-btn').addEventListener('click', () => {
            document.getElementById('pdf-file-input').click();
        });
        document.getElementById('pdf-file-input').addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];

                // Route to appropriate handler based on file type
                if (file.type === 'application/pdf') {
                    await this.handlePdfUpload(file);
                } else if (file.type.startsWith('image/')) {
                    await this.handleImageUpload(file);
                } else {
                    alert('Please select a PDF or image file.');
                }

                e.target.value = ''; // Reset for next upload
            }
        });

        // New Canvas button
        document.getElementById('new-canvas-btn').addEventListener('click', async () => {
            // No confirmation needed - current session is auto-saved
            await this.createNewSession();
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
        document.getElementById('new-session-btn').addEventListener('click', async () => {
            this.hideSessionsModal();
            await this.createNewSession();
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
        document.getElementById('add-row-btn').addEventListener('click', () => {
            this.addAxisItem('row-items');
        });
        document.getElementById('add-col-btn').addEventListener('click', () => {
            this.addAxisItem('col-items');
        });

        // Edit matrix modal
        document.getElementById('edit-matrix-close').addEventListener('click', () => {
            document.getElementById('edit-matrix-modal').style.display = 'none';
            this._editMatrixData = null;
        });
        document.getElementById('edit-matrix-cancel-btn').addEventListener('click', () => {
            document.getElementById('edit-matrix-modal').style.display = 'none';
            this._editMatrixData = null;
        });
        document.getElementById('edit-matrix-save-btn').addEventListener('click', () => {
            this.saveMatrixEdits();
        });
        document.getElementById('edit-swap-axes-btn').addEventListener('click', () => {
            this.swapEditMatrixAxes();
        });
        document.getElementById('edit-add-row-btn').addEventListener('click', () => {
            this.addAxisItem('edit-row-items');
        });
        document.getElementById('edit-add-col-btn').addEventListener('click', () => {
            this.addAxisItem('edit-col-items');
        });

        // Committee modal
        document.getElementById('committee-close').addEventListener('click', () => {
            document.getElementById('committee-modal').style.display = 'none';
            this._committeeData = null;
        });
        document.getElementById('committee-cancel-btn').addEventListener('click', () => {
            document.getElementById('committee-modal').style.display = 'none';
            this._committeeData = null;
        });
        document.getElementById('committee-execute-btn').addEventListener('click', () => {
            this.executeCommittee();
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

            // Escape to close popover, search, or clear selection
            if (e.key === 'Escape') {
                if (this.canvas.isNavPopoverOpen()) {
                    this.canvas.hideNavPopover();
                } else if (this.isSearchOpen()) {
                    this.closeSearch();
                } else if (this.isHelpOpen()) {
                    this.hideHelpModal();
                } else {
                    this.canvas.clearSelection();
                }
            }

            // Enter to confirm popover selection
            if (e.key === 'Enter' && this.canvas.isNavPopoverOpen()) {
                e.preventDefault();
                this.canvas.confirmPopoverSelection();
                return;
            }

            // Arrow Up/Down for parent/child navigation
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                // If popover is open, navigate within it
                if (this.canvas.isNavPopoverOpen()) {
                    e.preventDefault();
                    this.canvas.navigatePopoverSelection(e.key === 'ArrowUp' ? -1 : 1);
                    return;
                }

                // Otherwise, if node is selected and not in input, navigate to parent/child
                if (!e.target.matches('input, textarea')) {
                    const selectedNodeIds = this.canvas.getSelectedNodeIds();
                    if (selectedNodeIds.length === 1) {
                        e.preventDefault();
                        if (e.key === 'ArrowUp') {
                            this.navigateToParentKeyboard(selectedNodeIds[0]);
                        } else {
                            this.navigateToChildKeyboard(selectedNodeIds[0]);
                        }
                    }
                }
            }

            // ? to show help (when not in input)
            if (e.key === '?' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.showHelpModal();
            }

            // Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z for redo
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
                return;
            }

            // Delete to remove selected nodes
            if ((e.key === 'Delete' || e.key === 'Backspace') &&
                !e.target.matches('input, textarea')) {
                this.deleteSelectedNodes();
            }

            // 'r' to focus reply/chat input when a node is selected
            if (e.key === 'r' && !e.target.matches('input, textarea')) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length > 0) {
                    e.preventDefault();
                    this.chatInput.focus();
                }
            }

            // 'c' to copy selected node content
            if (e.key === 'c' && !e.target.matches('input, textarea') && !(e.metaKey || e.ctrlKey)) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length === 1) {
                    e.preventDefault();
                    this.copyNodeContent(selectedNodeIds[0]);
                }
            }

            // 'f' to fit selected node to viewport (80%)
            if (e.key === 'f' && !e.target.matches('input, textarea')) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length === 1) {
                    e.preventDefault();
                    this.handleNodeFitToViewport(selectedNodeIds[0]);
                }
            }
        });

        // Clipboard paste handler for images
        document.addEventListener('paste', async (e) => {
            // Don't intercept if user is focused on an input/textarea
            if (e.target.matches('input, textarea')) {
                return;
            }

            // Check for image in clipboard
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        await this.handleImageUpload(file, null, true);  // showHint=true
                    }
                    return;
                }
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
                await this.handleResearch(instructions, context);
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

        // Check for /committee command
        if (content.startsWith('/committee ')) {
            const question = content.slice(11).trim();
            if (question) {
                await this.handleCommittee(question, context);
                return true;
            }
        }

        // Check for /note command
        if (content.startsWith('/note ')) {
            const noteContent = content.slice(6).trim();
            if (noteContent) {
                await this.handleNote(noteContent);
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

        // Smoothly pan to the new AI node
        this.canvas.centerOnAnimated(
            aiNode.position.x + 160,
            aiNode.position.y + 100,
            300
        );

        // Build context and send to LLM
        const context = this.graph.resolveContext([humanNode.id]);
        const messages = buildMessagesForApi(context);

        // Create AbortController for this stream
        const abortController = new AbortController();

        // Track streaming state for stop/continue functionality
        this.streamingNodes.set(aiNode.id, {
            abortController,
            context: { messages, model, humanNodeId: humanNode.id }
        });
        this.canvas.showStopButton(aiNode.id);

        // Stream response
        this.streamWithAbort(
            aiNode.id,
            abortController,
            messages,
            model,
            // onChunk
            (chunk, fullContent) => {
                this.canvas.updateNodeContent(aiNode.id, fullContent, true);
                this.graph.updateNode(aiNode.id, { content: fullContent });
            },
            // onDone
            (fullContent) => {
                this.streamingNodes.delete(aiNode.id);
                this.canvas.hideStopButton(aiNode.id);
                this.canvas.updateNodeContent(aiNode.id, fullContent, false);
                this.graph.updateNode(aiNode.id, { content: fullContent });
                this.saveSession();

                // Generate summary async (don't await - let it happen in background)
                this.generateNodeSummary(aiNode.id);
            },
            // onError
            (err) => {
                this.streamingNodes.delete(aiNode.id);
                this.canvas.hideStopButton(aiNode.id);

                // Format and display user-friendly error
                const errorInfo = formatUserError(err);
                this.showNodeError(aiNode.id, errorInfo, {
                    type: 'chat',
                    messages,
                    model,
                    humanNodeId: humanNode.id
                });
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

        // Smoothly pan to search node
        this.canvas.centerOnAnimated(
            searchNode.position.x + 160,
            searchNode.position.y + 100,
            300
        );

        try {
            let effectiveQuery = query;

            // If context is provided, use LLM to generate a better search query
            if (context && context.trim()) {
                this.canvas.updateNodeContent(searchNode.id, `Refining search query...`, true);

                const model = this.modelPicker.value;
                const apiKey = chat.getApiKeyForModel(model);

                const refineResponse = await fetch('/api/refine-query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_query: query,
                        context: context,
                        command_type: 'search',
                        model: model,
                        api_key: apiKey
                    })
                });

                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    effectiveQuery = refineData.refined_query;
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

    /**
     * Handle /note command - creates a NOTE node without triggering LLM
     * Notes are standalone by default (no automatic attachment to existing nodes)
     *
     * Supports three modes:
     * - `/note <markdown content>` - Creates a note with the provided markdown
     * - `/note <url>` - Fetches the URL content and creates a note with the markdown
     * - `/note <pdf-url>` - Downloads PDF and extracts text
     *
     * @param {string} content - The markdown note content or URL to fetch
     */
    async handleNote(content) {
        // Detect if content is a URL
        const isUrl = isUrlContent(content);

        if (isUrl) {
            const url = content.trim();
            // Check if URL ends with .pdf (case insensitive, ignore query params)
            const isPdfUrl = /\.pdf(\?.*)?$/i.test(url);

            if (isPdfUrl) {
                // Fetch PDF and extract text
                await this.handleNoteFromPdfUrl(url);
            } else {
                // Fetch URL content and create a FETCH_RESULT node
                await this.handleNoteFromUrl(url);
            }
        } else {
            // Get selected nodes (if any) to link the note to
            const parentIds = this.canvas.getSelectedNodeIds();

            // Create NOTE node with the provided content
            const noteNode = createNode(NodeType.NOTE, content, {
                position: this.graph.autoPosition(parentIds)
            });

            this.graph.addNode(noteNode);
            this.canvas.renderNode(noteNode);

            // Create edges from parents (if replying to selected nodes)
            for (const parentId of parentIds) {
                const edge = createEdge(parentId, noteNode.id,
                    parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
                this.graph.addEdge(edge);

                const parentNode = this.graph.getNode(parentId);
                this.canvas.renderEdge(edge, parentNode.position, noteNode.position);
            }

            // Clear input and save
            this.chatInput.value = '';
            this.chatInput.style.height = 'auto';
            this.canvas.clearSelection();
            this.saveSession();
            this.updateEmptyState();

            // Pan to the new note
            this.canvas.centerOnAnimated(
                noteNode.position.x + 160,
                noteNode.position.y + 100,
                300
            );
        }
    }

    /**
     * Fetch URL content and create a FETCH_RESULT node.
     *
     * This uses Jina Reader API (/api/fetch-url) which is free and requires no API key.
     * This is intentionally separate from handleNodeFetchSummarize which uses Exa API.
     *
     * Design rationale (see docs/explanation/url-fetching.md):
     * - /note <url> should "just work" without any API configuration (zero-friction)
     * - Exa API (used by fetch+summarize) offers higher quality but requires API key
     * - Both create FETCH_RESULT nodes with the same structure for consistency
     *
     * @param {string} url - The URL to fetch
     */
    async handleNoteFromUrl(url) {
        // Get selected nodes (if any) to link the fetched content to
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create a placeholder node while fetching
        const fetchNode = createNode(NodeType.FETCH_RESULT, `Fetching content from:\n${url}...`, {
            position: this.graph.autoPosition(parentIds)
        });

        this.graph.addNode(fetchNode);
        this.canvas.renderNode(fetchNode);

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, fetchNode.id,
                parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);

            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, fetchNode.position);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        // Pan to the new node
        this.canvas.centerOnAnimated(
            fetchNode.position.x + 160,
            fetchNode.position.y + 100,
            300
        );

        try {
            // Fetch URL content via backend
            const response = await fetch('/api/fetch-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to fetch URL');
            }

            const data = await response.json();

            // Update the node with the fetched content
            const fetchedContent = `**[${data.title}](${url})**\n\n${data.content}`;
            this.canvas.updateNodeContent(fetchNode.id, fetchedContent, false);
            this.graph.updateNode(fetchNode.id, {
                content: fetchedContent,
                versions: [{
                    content: fetchedContent,
                    timestamp: Date.now(),
                    reason: 'fetched'
                }]
            });
            this.saveSession();

        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to fetch URL**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(fetchNode.id, errorContent, false);
            this.graph.updateNode(fetchNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    /**
     * Fetch a PDF from URL and create a PDF node with extracted text.
     *
     * @param {string} url - The URL of the PDF to fetch
     */
    async handleNoteFromPdfUrl(url) {
        // Get selected nodes (if any) to link the PDF to
        const parentIds = this.canvas.getSelectedNodeIds();

        // Create a placeholder node while fetching
        const pdfNode = createNode(NodeType.PDF, `Fetching PDF from:\n${url}...`, {
            position: this.graph.autoPosition(parentIds)
        });

        this.graph.addNode(pdfNode);
        this.canvas.renderNode(pdfNode);

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, pdfNode.id,
                parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);

            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, pdfNode.position);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        // Pan to the new node
        this.canvas.centerOnAnimated(
            pdfNode.position.x + 160,
            pdfNode.position.y + 100,
            300
        );

        try {
            // Fetch PDF content via backend
            const response = await fetch('/api/fetch-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to fetch PDF');
            }

            const data = await response.json();

            // Update the node with the extracted content
            this.canvas.updateNodeContent(pdfNode.id, data.content, false);
            this.graph.updateNode(pdfNode.id, {
                content: data.content,
                title: data.title,
                page_count: data.page_count
            });
            this.saveSession();

        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to fetch PDF**\n\n${url}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(pdfNode.id, errorContent, false);
            this.graph.updateNode(pdfNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    /**
     * Handle PDF file upload (from paperclip button or drag & drop).
     *
     * @param {File} file - The PDF file to upload
     * @param {Object} position - Optional position for the node (for drag & drop)
     */
    async handlePdfUpload(file, position = null) {
        // Validate file type
        if (file.type !== 'application/pdf') {
            alert('Please select a PDF file.');
            return;
        }

        // Validate file size (25 MB limit)
        const MAX_SIZE = 25 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert(`PDF file is too large. Maximum size is 25 MB.`);
            return;
        }

        // Create a placeholder node while processing
        const nodePosition = position || this.graph.autoPosition([]);
        const pdfNode = createNode(NodeType.PDF, `Processing PDF: ${file.name}...`, {
            position: nodePosition
        });

        this.graph.addNode(pdfNode);
        this.canvas.renderNode(pdfNode);

        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        // Pan to the new node
        this.canvas.centerOnAnimated(
            pdfNode.position.x + 160,
            pdfNode.position.y + 100,
            300
        );

        try {
            // Upload PDF via FormData
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to process PDF');
            }

            const data = await response.json();

            // Update the node with the extracted content
            this.canvas.updateNodeContent(pdfNode.id, data.content, false);
            this.graph.updateNode(pdfNode.id, {
                content: data.content,
                title: data.title,
                page_count: data.page_count
            });
            this.saveSession();

        } catch (err) {
            // Update node with error message
            const errorContent = `**Failed to process PDF**\n\n${file.name}\n\n*Error: ${err.message}*`;
            this.canvas.updateNodeContent(pdfNode.id, errorContent, false);
            this.graph.updateNode(pdfNode.id, { content: errorContent });
            this.saveSession();
        }
    }

    /**
     * Handle PDF drop on canvas (from drag & drop).
     *
     * @param {File} file - The PDF file that was dropped
     * @param {Object} position - The drop position in canvas coordinates
     */
    async handlePdfDrop(file, position) {
        await this.handlePdfUpload(file, position);
    }

    /**
     * Handle image file upload (from paperclip button, drag & drop, or paste).
     *
     * @param {File} file - The image file to upload
     * @param {Object} position - Optional position for the node (for drag & drop)
     * @param {boolean} showHint - Whether to show a canvas hint after upload
     */
    async handleImageUpload(file, position = null, showHint = false) {
        // Validate image type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        // Validate size (20 MB raw limit)
        const MAX_SIZE = 20 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert('Image is too large. Maximum size is 20 MB.');
            return;
        }

        try {
            // Resize and convert to base64
            const dataUrl = await resizeImage(file);
            const [header, base64Data] = dataUrl.split(',');
            const mimeMatch = header.match(/data:(.*);base64/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

            // Create IMAGE node
            const nodePosition = position || this.graph.autoPosition([]);
            const imageNode = createNode(NodeType.IMAGE, '', {
                position: nodePosition,
                imageData: base64Data,
                mimeType: mimeType
            });

            this.graph.addNode(imageNode);
            this.canvas.renderNode(imageNode);

            this.canvas.clearSelection();
            this.canvas.selectNode(imageNode.id);  // Select the new image
            this.saveSession();
            this.updateEmptyState();

            // Pan to the new node
            this.canvas.centerOnAnimated(
                imageNode.position.x + 160,
                imageNode.position.y + 100,
                300
            );

            // Show hint if requested (e.g., from paste)
            if (showHint) {
                this.showCanvasHint('Image added! Select it and type a message to ask about it.');
            }

        } catch (err) {
            alert(`Failed to process image: ${err.message}`);
        }
    }

    /**
     * Handle image drop on canvas (from drag & drop).
     *
     * @param {File} file - The image file that was dropped
     * @param {Object} position - The drop position in canvas coordinates
     */
    async handleImageDrop(file, position) {
        await this.handleImageUpload(file, position);
    }

    /**
     * Handle click on an image in node content.
     * Called when user triggers Ask or Extract action from image tooltip.
     *
     * @param {string} nodeId - The ID of the node containing the image
     * @param {string} imgSrc - The src of the clicked image (data URL or URL)
     * @param {Object} options - Action info: { action: 'ask' | 'extract' }
     */
    async handleImageClick(nodeId, imgSrc, options = {}) {
        const action = options.action;

        if (action === 'ask') {
            // Extract image to a new node, select it, and focus chat input
            await this.extractImageToNode(nodeId, imgSrc);
            this.chatInput.focus();
            this.showCanvasHint('Image extracted! Type a question about it.');
        } else if (action === 'extract') {
            // Just extract image to a new node
            await this.extractImageToNode(nodeId, imgSrc);
        }
    }

    /**
     * Handle click on the parent navigation button.
     * Gets the parent nodes and either navigates directly or shows a popover.
     *
     * @param {string} nodeId - The current node ID
     * @param {HTMLElement} button - The button element that was clicked
     */
    handleNavParentClick(nodeId, button) {
        const parents = this.graph.getParents(nodeId);
        this.canvas.handleNavButtonClick(nodeId, 'parent', parents, button);
    }

    /**
     * Handle click on the child navigation button.
     * Gets the child nodes and either navigates directly or shows a popover.
     *
     * @param {string} nodeId - The current node ID
     * @param {HTMLElement} button - The button element that was clicked
     */
    handleNavChildClick(nodeId, button) {
        const children = this.graph.getChildren(nodeId);
        this.canvas.handleNavButtonClick(nodeId, 'child', children, button);
    }

    /**
     * Handle keyboard navigation to parent node(s).
     * Shows toast if no parents, navigates directly if one, shows popover if multiple.
     * @param {string} nodeId - The selected node ID
     */
    navigateToParentKeyboard(nodeId) {
        const parents = this.graph.getParents(nodeId);
        if (parents.length === 0) {
            this.canvas.showNavToast('No parent nodes', nodeId);
        } else if (parents.length === 1) {
            this.handleNodeNavigate(parents[0].id);
        } else {
            const button = this.canvas.getNavButton(nodeId, 'parent');
            if (button) {
                this.canvas.handleNavButtonClick(nodeId, 'parent', parents, button);
            }
        }
    }

    /**
     * Handle keyboard navigation to child node(s).
     * Shows toast if no children, navigates directly if one, shows popover if multiple.
     * @param {string} nodeId - The selected node ID
     */
    navigateToChildKeyboard(nodeId) {
        const children = this.graph.getChildren(nodeId);
        if (children.length === 0) {
            this.canvas.showNavToast('No child nodes', nodeId);
        } else if (children.length === 1) {
            this.handleNodeNavigate(children[0].id);
        } else {
            const button = this.canvas.getNavButton(nodeId, 'child');
            if (button) {
                this.canvas.handleNavButtonClick(nodeId, 'child', children, button);
            }
        }
    }

    /**
     * Handle navigation to a specific node.
     * Centers the view on the target node and selects it.
     *
     * @param {string} targetNodeId - The ID of the node to navigate to
     */
    handleNodeNavigate(targetNodeId) {
        const node = this.graph.getNode(targetNodeId);
        if (!node) return;

        // Select the target node
        this.canvas.clearSelection();
        this.canvas.selectNode(targetNodeId);

        // Center on the node with animation
        const width = node.width || 420;
        const height = node.height || 200;
        this.canvas.centerOnAnimated(
            node.position.x + width / 2,
            node.position.y + height / 2,
            300
        );
    }

    /**
     * Update navigation button states for nodes involved in an edge.
     * Should be called after adding an edge to update both source and target.
     *
     * @param {string} sourceId - The source node ID
     * @param {string} targetId - The target node ID
     */
    updateEdgeNavStates(sourceId, targetId) {
        // Update source node (now has a child)
        const sourceParents = this.graph.getParents(sourceId);
        const sourceChildren = this.graph.getChildren(sourceId);
        this.canvas.updateNavButtonStates(sourceId, sourceParents.length, sourceChildren.length);

        // Update target node (now has a parent)
        const targetParents = this.graph.getParents(targetId);
        const targetChildren = this.graph.getChildren(targetId);
        this.canvas.updateNavButtonStates(targetId, targetParents.length, targetChildren.length);
    }

    /**
     * Extract an image from a node's content and create a new IMAGE node.
     *
     * @param {string} parentNodeId - The ID of the node containing the image
     * @param {string} imgSrc - The src of the image (data URL or external URL)
     */
    async extractImageToNode(parentNodeId, imgSrc) {
        const parentNode = this.graph.getNode(parentNodeId);
        if (!parentNode) return;

        try {
            let base64Data, mimeType;

            // Check if it's already a data URL
            if (imgSrc.startsWith('data:')) {
                const match = imgSrc.match(/^data:(.*?);base64,(.*)$/);
                if (match) {
                    mimeType = match[1];
                    base64Data = match[2];
                } else {
                    throw new Error('Invalid data URL format');
                }
            } else {
                // External URL - need to fetch and convert
                // Use canvas to convert to base64
                const dataUrl = await this.fetchImageAsDataUrl(imgSrc);
                const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
                if (match) {
                    mimeType = match[1];
                    base64Data = match[2];
                } else {
                    throw new Error('Failed to convert image');
                }
            }

            // Create IMAGE node
            const imageNode = createNode(NodeType.IMAGE, '', {
                position: this.graph.autoPosition([parentNodeId]),
                imageData: base64Data,
                mimeType: mimeType
            });

            this.graph.addNode(imageNode);
            this.canvas.renderNode(imageNode);

            // Create edge from parent
            const edge = createEdge(parentNodeId, imageNode.id, EdgeType.HIGHLIGHT);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, parentNode.position, imageNode.position);

            // Select the new image node
            this.canvas.clearSelection();
            this.canvas.selectNode(imageNode.id);

            // Pan to the new node
            this.canvas.centerOnAnimated(
                imageNode.position.x + 160,
                imageNode.position.y + 100,
                300
            );

            this.saveSession();

        } catch (err) {
            console.error('Failed to extract image:', err);
            alert('Failed to extract image: ' + err.message);
        }
    }

    /**
     * Fetch an external image and convert to data URL.
     *
     * @param {string} url - The image URL
     * @returns {Promise<string>} - The image as a data URL
     */
    async fetchImageAsDataUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';  // Try to avoid CORS issues

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // Try to determine format from URL
                let format = 'image/png';
                if (url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg')) {
                    format = 'image/jpeg';
                }

                try {
                    const dataUrl = canvas.toDataURL(format, 0.9);
                    resolve(dataUrl);
                } catch (e) {
                    reject(new Error('Cannot access image due to CORS restrictions'));
                }
            };

            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    }

    /**
     * Handle research command.
     * @param {string} instructions - The user's research instructions
     * @param {string} context - Optional context to help refine the instructions (e.g., selected text)
     */
    async handleResearch(instructions, context = null) {
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

        // Create research node with original instructions initially
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

        // Smoothly pan to research node
        this.canvas.centerOnAnimated(
            researchNode.position.x + 250,
            researchNode.position.y + 100,
            300
        );

        try {
            let effectiveInstructions = instructions;

            // If context is provided, use LLM to generate better research instructions
            if (context && context.trim()) {
                this.canvas.updateNodeContent(researchNode.id, `**Research:** ${instructions}\n\n*Refining research instructions...*`, true);

                const model = this.modelPicker.value;
                const apiKey = chat.getApiKeyForModel(model);

                const refineResponse = await fetch('/api/refine-query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_query: instructions,
                        context: context,
                        command_type: 'research',
                        model: model,
                        api_key: apiKey
                    })
                });

                if (refineResponse.ok) {
                    const refineData = await refineResponse.json();
                    effectiveInstructions = refineData.refined_query;
                    // Update node to show what we're actually researching
                    this.canvas.updateNodeContent(researchNode.id, `**Research:** ${instructions}\n*Researching: "${effectiveInstructions}"*\n\n*Starting research...*`, true);
                }
            }

            // Call Exa Research API (SSE stream)
            const response = await fetch('/api/exa/research', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instructions: effectiveInstructions,
                    api_key: exaKey,
                    model: 'exa-research'
                })
            });

            if (!response.ok) {
                throw new Error(`Research failed: ${response.statusText}`);
            }

            // Parse SSE stream using shared utility
            // Show both original and refined instructions if different
            let reportHeader;
            if (effectiveInstructions !== instructions) {
                reportHeader = `**Research:** ${instructions}\n*Researching: "${effectiveInstructions}"*\n\n`;
            } else {
                reportHeader = `**Research:** ${instructions}\n\n`;
            }
            let reportContent = reportHeader;
            let sources = [];

            await SSE.readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'status') {
                        const statusContent = `${reportHeader}*${data.trim()}*`;
                        this.canvas.updateNodeContent(researchNode.id, statusContent, true);
                    } else if (eventType === 'content') {
                        // Add separator if we already have content beyond the header
                        if (reportContent.length > reportHeader.length) {
                            reportContent += '\n\n---\n\n';
                        }
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

    /**
     * Handle /committee slash command - show modal to configure LLM committee
     */
    async handleCommittee(question, context = null) {
        // Store data for the modal
        this._committeeData = {
            question: question,
            context: context,
            selectedModels: [],
            chairmanModel: this.modelPicker.value,
            includeReview: false
        };

        // Get the question textarea and populate it
        const questionTextarea = document.getElementById('committee-question');
        questionTextarea.value = question;

        // Populate model checkboxes
        const modelsGrid = document.getElementById('committee-models-grid');
        modelsGrid.innerHTML = '';

        // Get recently used models for pre-selection
        const recentModels = storage.getRecentModels();
        const currentModel = this.modelPicker.value;

        // Get all available models from the model picker
        const availableModels = Array.from(this.modelPicker.options).map(opt => ({
            id: opt.value,
            name: opt.textContent
        }));

        // Pre-select up to 3 models: current + 2 most recent (excluding current)
        const preSelected = new Set();
        preSelected.add(currentModel);
        for (const modelId of recentModels) {
            if (preSelected.size >= 3) break;
            if (availableModels.some(m => m.id === modelId)) {
                preSelected.add(modelId);
            }
        }

        // Create checkboxes for each model
        for (const model of availableModels) {
            const item = document.createElement('label');
            item.className = 'committee-model-item';
            if (preSelected.has(model.id)) {
                item.classList.add('selected');
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = model.id;
            checkbox.checked = preSelected.has(model.id);
            checkbox.addEventListener('change', () => this.updateCommitteeSelection());

            const nameSpan = document.createElement('span');
            nameSpan.className = 'model-name';
            nameSpan.textContent = model.name;

            item.appendChild(checkbox);
            item.appendChild(nameSpan);
            modelsGrid.appendChild(item);

            // Click on label toggles checkbox
            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        }

        // Populate chairman dropdown
        const chairmanSelect = document.getElementById('committee-chairman');
        chairmanSelect.innerHTML = '';
        for (const model of availableModels) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            chairmanSelect.appendChild(option);
        }
        chairmanSelect.value = currentModel;

        // Reset review checkbox
        document.getElementById('committee-include-review').checked = false;

        // Update selection state
        this.updateCommitteeSelection();

        // Show modal
        document.getElementById('committee-modal').style.display = 'flex';
    }

    /**
     * Update committee selection UI and validation
     */
    updateCommitteeSelection() {
        const checkboxes = document.querySelectorAll('#committee-models-grid input[type="checkbox"]');
        const selectedModels = [];

        checkboxes.forEach(cb => {
            const item = cb.closest('.committee-model-item');
            if (cb.checked) {
                selectedModels.push(cb.value);
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Update count display
        const countEl = document.getElementById('committee-models-count');
        const count = selectedModels.length;
        const isValid = count >= 2 && count <= 5;

        countEl.textContent = `${count} selected (2-5 required)`;
        countEl.classList.toggle('valid', isValid);
        countEl.classList.toggle('invalid', !isValid);

        // Enable/disable execute button
        document.getElementById('committee-execute-btn').disabled = !isValid;

        // Store selected models
        if (this._committeeData) {
            this._committeeData.selectedModels = selectedModels;
        }
    }

    /**
     * Execute the committee consultation
     */
    async executeCommittee() {
        if (!this._committeeData) return;

        const { question, context, selectedModels } = this._committeeData;
        const chairmanModel = document.getElementById('committee-chairman').value;
        const includeReview = document.getElementById('committee-include-review').checked;

        // Close modal
        document.getElementById('committee-modal').style.display = 'none';

        // Track recently used models
        for (const modelId of selectedModels) {
            storage.addRecentModel(modelId);
        }
        storage.addRecentModel(chairmanModel);

        // Get selected nodes for conversation context
        const selectedIds = this.canvas.getSelectedNodeIds();

        // Build conversation context from selected nodes
        const messages = [];
        if (selectedIds.length > 0) {
            for (const id of selectedIds) {
                const node = this.graph.getNode(id);
                if (node && node.content) {
                    const role = node.type === NodeType.HUMAN ? 'user' : 'assistant';
                    messages.push({ role, content: node.content });
                }
            }
        }

        // Add the question as the final user message
        messages.push({ role: 'user', content: question });

        // Create human node for the question
        const humanNode = createNode(NodeType.HUMAN, `/committee ${question}`, {
            position: this.graph.autoPosition(selectedIds)
        });
        this.graph.addNode(humanNode);
        this.canvas.renderNode(humanNode);

        // Create edges from selected nodes
        for (const parentId of selectedIds) {
            const edge = createEdge(parentId, humanNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, humanNode.position);
        }

        // Calculate positions for opinion nodes (fan layout)
        const basePos = humanNode.position;
        const spacing = 380;
        const verticalOffset = 200;
        const totalWidth = (selectedModels.length - 1) * spacing;
        const startX = basePos.x - totalWidth / 2;

        // Create opinion nodes for each model
        const opinionNodes = [];
        const opinionNodeMap = {}; // index -> nodeId

        for (let i = 0; i < selectedModels.length; i++) {
            const modelId = selectedModels[i];
            const modelName = this.getModelDisplayName(modelId);

            const opinionNode = createNode(NodeType.OPINION, `*Waiting for ${modelName}...*`, {
                position: {
                    x: startX + i * spacing,
                    y: basePos.y + verticalOffset
                },
                model: modelId
            });

            this.graph.addNode(opinionNode);
            this.canvas.renderNode(opinionNode);

            // Edge from human to opinion
            const edge = createEdge(humanNode.id, opinionNode.id, EdgeType.OPINION);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, humanNode.position, opinionNode.position);

            opinionNodes.push(opinionNode);
            opinionNodeMap[i] = opinionNode.id;
        }

        // Create synthesis node (will be connected after opinions complete)
        const synthesisY = basePos.y + verticalOffset * (includeReview ? 3 : 2);
        const synthesisNode = createNode(NodeType.SYNTHESIS, '*Waiting for opinions...*', {
            position: { x: basePos.x, y: synthesisY },
            model: chairmanModel
        });
        this.graph.addNode(synthesisNode);
        this.canvas.renderNode(synthesisNode);

        // Review nodes (if enabled) - will be created when review starts
        const reviewNodes = [];
        const reviewNodeMap = {}; // reviewer_index -> nodeId

        // Clear input and save
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.canvas.clearSelection();
        this.saveSession();
        this.updateEmptyState();

        // Pan to see the committee
        this.canvas.centerOnAnimated(basePos.x, basePos.y + verticalOffset, 300);

        // Collect API keys by provider for all models (uses canonical mapping from storage.js)
        const apiKeys = storage.getApiKeysForModels([...selectedModels, chairmanModel]);

        // Get base URL if configured
        const baseUrl = storage.getBaseUrl() || null;

        // Track accumulated content for each opinion/review
        const opinionContents = {};
        const reviewContents = {};
        let synthesisContent = '';

        // Create abort controller for this committee session
        const abortController = new AbortController();

        // Show stop buttons on all opinion nodes
        for (const node of opinionNodes) {
            this.canvas.showStopButton(node.id);
        }

        // Store streaming state for potential abort
        this._activeCommittee = {
            abortController,
            opinionNodeIds: opinionNodes.map(n => n.id),
            reviewNodeIds: [],
            synthesisNodeId: synthesisNode.id
        };

        try {
            const response = await fetch('/api/committee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    context: messages,
                    models: selectedModels,
                    chairman_model: chairmanModel,
                    api_keys: apiKeys,
                    base_url: baseUrl,
                    include_review: includeReview
                }),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Committee request failed: ${response.statusText}`);
            }

            // Process SSE stream
            await SSE.readSSEStream(response, {
                onEvent: (eventType, data) => {
                    let parsed;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = data;
                    }

                    if (eventType === 'opinion_start') {
                        const nodeId = opinionNodeMap[parsed.index];
                        const modelName = this.getModelDisplayName(parsed.model);
                        opinionContents[parsed.index] = '';
                        this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n*Thinking...*`, true);
                        this.canvas.showStopButton(nodeId);

                    } else if (eventType === 'opinion_chunk') {
                        const nodeId = opinionNodeMap[parsed.index];
                        opinionContents[parsed.index] = (opinionContents[parsed.index] || '') + parsed.content;
                        const model = selectedModels[parsed.index];
                        const modelName = this.getModelDisplayName(model);
                        this.canvas.updateNodeContent(nodeId, `**${modelName}**\n\n${opinionContents[parsed.index]}`, true);

                    } else if (eventType === 'opinion_done') {
                        const nodeId = opinionNodeMap[parsed.index];
                        const model = selectedModels[parsed.index];
                        const modelName = this.getModelDisplayName(model);
                        const finalContent = `**${modelName}**\n\n${parsed.full_content}`;
                        this.canvas.updateNodeContent(nodeId, finalContent, false);
                        this.canvas.hideStopButton(nodeId);
                        this.graph.updateNode(nodeId, { content: finalContent });

                    } else if (eventType === 'review_start') {
                        // Create review node for this reviewer
                        const reviewerIndex = parsed.reviewer_index;
                        const modelName = this.getModelDisplayName(parsed.model);

                        // Position review nodes between opinions and synthesis
                        const reviewY = basePos.y + verticalOffset * 2;
                        const reviewNode = createNode(NodeType.REVIEW, `**${modelName} Review**\n\n*Reviewing other opinions...*`, {
                            position: {
                                x: startX + reviewerIndex * spacing,
                                y: reviewY
                            },
                            model: parsed.model
                        });

                        this.graph.addNode(reviewNode);
                        this.canvas.renderNode(reviewNode);
                        reviewNodes.push(reviewNode);
                        reviewNodeMap[reviewerIndex] = reviewNode.id;

                        // Edge from opinion to its review
                        const opinionNodeId = opinionNodeMap[reviewerIndex];
                        const opinionNode = this.graph.getNode(opinionNodeId);
                        const reviewEdge = createEdge(opinionNodeId, reviewNode.id, EdgeType.REVIEW);
                        this.graph.addEdge(reviewEdge);
                        this.canvas.renderEdge(reviewEdge, opinionNode.position, reviewNode.position);

                        this.canvas.showStopButton(reviewNode.id);
                        reviewContents[reviewerIndex] = '';

                        if (this._activeCommittee) {
                            this._activeCommittee.reviewNodeIds.push(reviewNode.id);
                        }

                    } else if (eventType === 'review_chunk') {
                        const nodeId = reviewNodeMap[parsed.reviewer_index];
                        if (nodeId) {
                            reviewContents[parsed.reviewer_index] = (reviewContents[parsed.reviewer_index] || '') + parsed.content;
                            const model = selectedModels[parsed.reviewer_index];
                            const modelName = this.getModelDisplayName(model);
                            this.canvas.updateNodeContent(nodeId, `**${modelName} Review**\n\n${reviewContents[parsed.reviewer_index]}`, true);
                        }

                    } else if (eventType === 'review_done') {
                        const nodeId = reviewNodeMap[parsed.reviewer_index];
                        if (nodeId) {
                            const model = selectedModels[parsed.reviewer_index];
                            const modelName = this.getModelDisplayName(model);
                            const finalContent = `**${modelName} Review**\n\n${parsed.full_content}`;
                            this.canvas.updateNodeContent(nodeId, finalContent, false);
                            this.canvas.hideStopButton(nodeId);
                            this.graph.updateNode(nodeId, { content: finalContent });
                        }

                    } else if (eventType === 'synthesis_start') {
                        // Connect all opinion/review nodes to synthesis
                        const sourceNodes = reviewNodes.length > 0 ? reviewNodes : opinionNodes;
                        for (const node of sourceNodes) {
                            const synthEdge = createEdge(node.id, synthesisNode.id, EdgeType.SYNTHESIS);
                            this.graph.addEdge(synthEdge);
                            this.canvas.renderEdge(synthEdge, node.position, synthesisNode.position);
                        }

                        const chairmanName = this.getModelDisplayName(parsed.model);
                        synthesisContent = '';
                        this.canvas.updateNodeContent(synthesisNode.id, `**Synthesis (${chairmanName})**\n\n*Synthesizing opinions...*`, true);
                        this.canvas.showStopButton(synthesisNode.id);

                    } else if (eventType === 'synthesis_chunk') {
                        synthesisContent += parsed.content;
                        const chairmanName = this.getModelDisplayName(chairmanModel);
                        this.canvas.updateNodeContent(synthesisNode.id, `**Synthesis (${chairmanName})**\n\n${synthesisContent}`, true);

                    } else if (eventType === 'synthesis_done') {
                        const chairmanName = this.getModelDisplayName(chairmanModel);
                        const finalContent = `**Synthesis (${chairmanName})**\n\n${parsed.full_content}`;
                        this.canvas.updateNodeContent(synthesisNode.id, finalContent, false);
                        this.canvas.hideStopButton(synthesisNode.id);
                        this.graph.updateNode(synthesisNode.id, { content: finalContent });

                    } else if (eventType === 'error') {
                        console.error('Committee error:', parsed.message);
                    }
                },
                onDone: () => {
                    // Hide all stop buttons
                    for (const nodeId of Object.values(opinionNodeMap)) {
                        this.canvas.hideStopButton(nodeId);
                    }
                    for (const nodeId of Object.values(reviewNodeMap)) {
                        this.canvas.hideStopButton(nodeId);
                    }
                    this.canvas.hideStopButton(synthesisNode.id);

                    this._activeCommittee = null;
                    this.saveSession();
                },
                onError: (err) => {
                    console.error('Committee stream error:', err);
                    this._activeCommittee = null;
                }
            });

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Committee request aborted');
            } else {
                console.error('Committee error:', err);
                // Update synthesis node with error
                this.canvas.updateNodeContent(synthesisNode.id, `**Error**\n\n${err.message}`, false);
                this.canvas.hideStopButton(synthesisNode.id);
            }
            this._activeCommittee = null;
            this.saveSession();
        }
    }

    /**
     * Get display name for a model ID
     */
    getModelDisplayName(modelId) {
        const option = this.modelPicker.querySelector(`option[value="${modelId}"]`);
        return option ? option.textContent : modelId.split('/').pop();
    }

    async handleMatrix(matrixContext) {
        // Get selected nodes
        const selectedIds = this.canvas.getSelectedNodeIds();

        console.log('handleMatrix called with context:', matrixContext);
        console.log('Selected node IDs:', selectedIds);

        if (selectedIds.length === 0) {
            alert('Please select one or more nodes to provide context for the matrix.');
            return;
        }

        const model = this.modelPicker.value;
        const apiKey = chat.getApiKeyForModel(model);

        // Clear previous data and show loading state
        this._matrixData = null;
        document.getElementById('row-items').innerHTML = '';
        document.getElementById('col-items').innerHTML = '';
        document.getElementById('row-count').textContent = '0 items';
        document.getElementById('col-count').textContent = '0 items';
        document.getElementById('matrix-warning').style.display = 'none';

        // Show modal with loading indicator
        const loadingModal = document.getElementById('matrix-modal');
        console.log('Matrix modal element:', loadingModal);
        document.getElementById('matrix-context').value = matrixContext;
        document.getElementById('matrix-loading').style.display = 'flex';
        document.getElementById('matrix-create-btn').disabled = true;
        loadingModal.style.display = 'flex';
        console.log('Modal should now be visible');

        try {
            // Gather content from all selected nodes
            const contents = selectedIds.map(id => {
                const node = this.graph.getNode(id);
                return node ? node.content : '';
            }).filter(c => c);

            // Parse two lists from all context nodes
            const result = await this.parseTwoLists(contents, matrixContext, model, apiKey);

            const rowItems = result.rows;
            const colItems = result.columns;

            // Hide loading indicator
            document.getElementById('matrix-loading').style.display = 'none';
            document.getElementById('matrix-create-btn').disabled = false;

            // Check for max items warning
            const hasWarning = rowItems.length > 10 || colItems.length > 10;
            document.getElementById('matrix-warning').style.display = hasWarning ? 'block' : 'none';

            // Store parsed data for modal
            this._matrixData = {
                context: matrixContext,
                contextNodeIds: selectedIds,
                rowItems: rowItems.slice(0, 10),
                colItems: colItems.slice(0, 10)
            };

            // Populate axis items in modal
            this.populateAxisItems('row-items', this._matrixData.rowItems);
            this.populateAxisItems('col-items', this._matrixData.colItems);

            document.getElementById('row-count').textContent = `${this._matrixData.rowItems.length} items`;
            document.getElementById('col-count').textContent = `${this._matrixData.colItems.length} items`;

        } catch (err) {
            document.getElementById('matrix-loading').style.display = 'none';
            alert(`Failed to parse list items: ${err.message}`);
            document.getElementById('matrix-modal').style.display = 'none';
        }
    }

    async parseTwoLists(contents, context, model, apiKey) {
        const baseUrl = chat.getBaseUrl();
        const requestBody = {
            contents,
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

    /**
     * Get the data source and element IDs for a given axis container.
     * Supports both create modal (row-items, col-items) and edit modal (edit-row-items, edit-col-items).
     */
    getAxisConfig(containerId) {
        const isEdit = containerId.startsWith('edit-');
        const isRow = containerId.includes('row');
        const dataSource = isEdit ? this._editMatrixData : this._matrixData;
        const countId = isEdit
            ? (isRow ? 'edit-row-count' : 'edit-col-count')
            : (isRow ? 'row-count' : 'col-count');
        const items = dataSource ? (isRow ? dataSource.rowItems : dataSource.colItems) : null;
        return { dataSource, items, countId, isRow };
    }

    populateAxisItems(containerId, items) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'axis-item';
            li.dataset.index = index;

            li.innerHTML = `
                <input type="text" class="axis-item-input" value="${this.escapeHtml(item)}" title="${this.escapeHtml(item)}">
                <button class="axis-item-remove" title="Remove">×</button>
            `;

            // Edit handler - update data on change
            li.querySelector('.axis-item-input').addEventListener('change', (e) => {
                this.updateAxisItem(containerId, index, e.target.value);
            });

            // Remove button handler
            li.querySelector('.axis-item-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeAxisItem(containerId, index);
            });

            container.appendChild(li);
        });
    }

    removeAxisItem(containerId, index) {
        const { items, countId } = this.getAxisConfig(containerId);
        if (!items) return;

        items.splice(index, 1);
        this.populateAxisItems(containerId, items);
        document.getElementById(countId).textContent = `${items.length} items`;
    }

    updateAxisItem(containerId, index, newValue) {
        const { items } = this.getAxisConfig(containerId);
        if (!items || !newValue.trim()) return;

        items[index] = newValue.trim();
    }

    addAxisItem(containerId) {
        const { items, countId } = this.getAxisConfig(containerId);
        if (!items) return;

        if (items.length >= 10) {
            alert('Maximum 10 items per axis');
            return;
        }

        items.push('New item');
        this.populateAxisItems(containerId, items);
        document.getElementById(countId).textContent = `${items.length} items`;

        // Focus the new item's input
        const container = document.getElementById(containerId);
        const lastInput = container.querySelector('.axis-item:last-child .axis-item-input');
        if (lastInput) {
            lastInput.focus();
            lastInput.select();
        }
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

        const { context, contextNodeIds, rowItems, colItems } = this._matrixData;

        if (rowItems.length === 0 || colItems.length === 0) {
            alert('Both rows and columns must have at least one item');
            return;
        }

        // Get context nodes for positioning
        const contextNodes = contextNodeIds.map(id => this.graph.getNode(id)).filter(Boolean);

        if (contextNodes.length === 0) {
            alert('No valid context nodes found');
            return;
        }

        // Position matrix to the right of all context nodes, centered vertically
        const maxX = Math.max(...contextNodes.map(n => n.position.x));
        const avgY = contextNodes.reduce((sum, n) => sum + n.position.y, 0) / contextNodes.length;
        const position = {
            x: maxX + 450,
            y: avgY
        };

        // Create matrix node
        const matrixNode = createMatrixNode(context, contextNodeIds, rowItems, colItems, { position });

        this.graph.addNode(matrixNode);
        this.canvas.renderNode(matrixNode);

        // Create edges from all context nodes to the matrix
        for (const contextNode of contextNodes) {
            const edge = createEdge(contextNode.id, matrixNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, contextNode.position, matrixNode.position);
        }

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
        return truncateText(text, maxLength);
    }

    escapeHtml(text) {
        return escapeHtmlText(text);
    }

    // --- Matrix Cell Handlers ---

    /**
     * Fill a single matrix cell with AI-generated content.
     * @param {string} nodeId - Matrix node ID
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @param {AbortController} [abortController] - Optional abort controller for cancellation
     */
    async handleMatrixCellFill(nodeId, row, col, abortController = null) {
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

        // Track this cell fill for stop button support
        const cellKey = `${row}-${col}`;
        const isStandaloneFill = !abortController;  // Not called from Fill All

        if (isStandaloneFill) {
            abortController = new AbortController();
        }

        // Get or create the cell controllers map for this matrix node
        let cellControllers = this.streamingMatrixCells.get(nodeId);
        if (!cellControllers) {
            cellControllers = new Map();
            this.streamingMatrixCells.set(nodeId, cellControllers);
        }
        cellControllers.set(cellKey, abortController);

        // Show stop button when any cell is being filled
        this.canvas.showStopButton(nodeId);

        try {
            const requestBody = {
                row_item: rowItem,
                col_item: colItem,
                context: context,
                messages: buildMessagesForApi(messages),
                model,
                api_key: apiKey
            };

            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }

            // Prepare fetch options with optional abort signal
            const fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            };

            if (abortController) {
                fetchOptions.signal = abortController.signal;
            }

            // Start streaming fill
            const response = await fetch('/api/matrix/fill', fetchOptions);

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
            const oldCell = matrixNode.cells[cellKey] ? { ...matrixNode.cells[cellKey] } : { content: null, filled: false };
            matrixNode.cells[cellKey] = { content: cellContent, filled: true };
            this.graph.updateNode(nodeId, { cells: matrixNode.cells });

            // Push undo action for cell fill
            this.undoManager.push({
                type: 'FILL_CELL',
                nodeId,
                row,
                col,
                oldCell,
                newCell: { content: cellContent, filled: true }
            });

            this.saveSession();

        } catch (err) {
            // Don't log abort errors as failures
            if (err.name === 'AbortError') {
                console.log(`Cell fill aborted: (${row}, ${col})`);
                return;
            }
            console.error('Failed to fill matrix cell:', err);
            alert(`Failed to fill cell: ${err.message}`);
        } finally {
            // Clean up this cell from tracking
            const controllers = this.streamingMatrixCells.get(nodeId);
            if (controllers) {
                controllers.delete(cellKey);
                // If no more cells are being filled, hide stop button and clean up
                if (controllers.size === 0) {
                    this.streamingMatrixCells.delete(nodeId);
                    this.canvas.hideStopButton(nodeId);
                }
            }
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
            // All cells filled - no action needed, button tooltip already indicates this
            return;
        }

        // Fill all cells in parallel - each cell handles its own tracking/cleanup
        const fillPromises = emptyCells.map(({ row, col }) => {
            return this.handleMatrixCellFill(nodeId, row, col).catch(err => {
                if (err.name !== 'AbortError') {
                    console.error(`Failed to fill cell (${row}, ${col}):`, err);
                }
            });
        });

        await Promise.all(fillPromises);
    }

    /**
     * Handle editing matrix rows and columns
     */
    handleMatrixEdit(nodeId) {
        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode || matrixNode.type !== NodeType.MATRIX) return;

        // Store edit data
        this._editMatrixData = {
            nodeId,
            rowItems: [...matrixNode.rowItems],
            colItems: [...matrixNode.colItems]
        };

        // Populate the edit modal (reuses unified populateAxisItems)
        this.populateAxisItems('edit-row-items', this._editMatrixData.rowItems);
        this.populateAxisItems('edit-col-items', this._editMatrixData.colItems);
        document.getElementById('edit-row-count').textContent = `${this._editMatrixData.rowItems.length} items`;
        document.getElementById('edit-col-count').textContent = `${this._editMatrixData.colItems.length} items`;

        document.getElementById('edit-matrix-modal').style.display = 'flex';
    }

    swapEditMatrixAxes() {
        if (!this._editMatrixData) return;

        const temp = this._editMatrixData.rowItems;
        this._editMatrixData.rowItems = this._editMatrixData.colItems;
        this._editMatrixData.colItems = temp;

        this.populateAxisItems('edit-row-items', this._editMatrixData.rowItems);
        this.populateAxisItems('edit-col-items', this._editMatrixData.colItems);
        document.getElementById('edit-row-count').textContent = `${this._editMatrixData.rowItems.length} items`;
        document.getElementById('edit-col-count').textContent = `${this._editMatrixData.colItems.length} items`;
    }

    saveMatrixEdits() {
        if (!this._editMatrixData) return;

        const { nodeId, rowItems, colItems } = this._editMatrixData;

        if (rowItems.length === 0 || colItems.length === 0) {
            alert('Both rows and columns must have at least one item');
            return;
        }

        const matrixNode = this.graph.getNode(nodeId);
        if (!matrixNode) return;

        // Update node data - need to handle cell mapping if items changed
        const oldRowItems = matrixNode.rowItems;
        const oldColItems = matrixNode.colItems;
        const oldCells = matrixNode.cells;

        // Remap cells based on item names (if items were reordered or some removed)
        const newCells = {};
        for (let r = 0; r < rowItems.length; r++) {
            const oldRowIndex = oldRowItems.indexOf(rowItems[r]);
            for (let c = 0; c < colItems.length; c++) {
                const oldColIndex = oldColItems.indexOf(colItems[c]);
                if (oldRowIndex !== -1 && oldColIndex !== -1) {
                    const oldKey = `${oldRowIndex}-${oldColIndex}`;
                    const newKey = `${r}-${c}`;
                    if (oldCells[oldKey]) {
                        newCells[newKey] = oldCells[oldKey];
                    }
                }
            }
        }

        // Update the matrix node
        this.graph.updateNode(nodeId, {
            rowItems,
            colItems,
            cells: newCells
        });

        // Re-render the node
        this.canvas.renderNode(this.graph.getNode(nodeId));

        // Close modal
        document.getElementById('edit-matrix-modal').style.display = 'none';
        this._editMatrixData = null;

        this.saveSession();
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

        // Run selected layout algorithm (updates node.position in graph)
        if (algorithm === 'force') {
            this.graph.forceDirectedLayout(dimensions);
        } else {
            this.graph.autoLayout(dimensions);
        }

        // Animate nodes to their new positions (keep current viewport)
        this.canvas.animateToLayout(this.graph, {
            duration: 500,
            keepViewport: true
        });

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

                // Smoothly pan to the AI node
                this.canvas.centerOnAnimated(
                    aiNode.position.x + 160,
                    aiNode.position.y + 100,
                    300
                );

                // Build context and stream LLM response
                const context = this.graph.resolveContext([humanNode.id]);
                const messages = buildMessagesForApi(context);

                // Create AbortController for this stream
                const abortController = new AbortController();

                // Track streaming state for stop/continue functionality
                this.streamingNodes.set(aiNode.id, {
                    abortController,
                    context: { messages, model, humanNodeId: humanNode.id }
                });
                this.canvas.showStopButton(aiNode.id);

                // Stream response using streamWithAbort
                this.streamWithAbort(
                    aiNode.id,
                    abortController,
                    messages,
                    model,
                    // onChunk
                    (chunk, fullContent) => {
                        this.canvas.updateNodeContent(aiNode.id, fullContent, true);
                        this.graph.updateNode(aiNode.id, { content: fullContent });
                    },
                    // onDone
                    (fullContent) => {
                        this.streamingNodes.delete(aiNode.id);
                        this.canvas.hideStopButton(aiNode.id);
                        this.canvas.updateNodeContent(aiNode.id, fullContent, false);
                        this.graph.updateNode(aiNode.id, { content: fullContent });
                        this.saveSession();
                        this.generateNodeSummary(aiNode.id);
                    },
                    // onError
                    (err) => {
                        this.streamingNodes.delete(aiNode.id);
                        this.canvas.hideStopButton(aiNode.id);

                        // Format and display user-friendly error
                        const errorInfo = formatUserError(err);
                        this.showNodeError(aiNode.id, errorInfo, {
                            type: 'chat',
                            messages,
                            model,
                            humanNodeId: humanNode.id
                        });
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
            const messages = buildMessagesForApi(context);
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
     * Handle fetching full content from a Reference node URL and summarizing it.
     * Creates two nodes: FETCH_RESULT (raw content) → SUMMARY (AI summary)
     *
     * This uses Exa API (/api/exa/get-contents) which requires an API key but
     * provides higher quality content extraction than free alternatives.
     *
     * Design rationale (see docs/explanation/url-fetching.md):
     * - This is triggered from REFERENCE nodes (search results) via UI button
     * - Users who have Exa configured get premium content extraction
     * - Separate from handleNoteFromUrl which uses free Jina Reader API
     * - Both create FETCH_RESULT nodes with the same structure for consistency
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

        // Create FETCH_RESULT node for the raw fetched content
        const fetchResultNode = createNode(NodeType.FETCH_RESULT, 'Fetching content...', {
            position: {
                x: node.position.x + 450,
                y: node.position.y
            }
        });

        this.graph.addNode(fetchResultNode);
        this.canvas.renderNode(fetchResultNode);

        const fetchEdge = createEdge(nodeId, fetchResultNode.id, EdgeType.REFERENCE);
        this.graph.addEdge(fetchEdge);
        this.canvas.renderEdge(fetchEdge, node.position, fetchResultNode.position);

        // Smoothly pan to the fetch result node
        this.canvas.centerOnAnimated(
            fetchResultNode.position.x + 200,
            fetchResultNode.position.y + 100,
            300
        );

        try {
            // Fetch content from URL via Exa
            this.canvas.updateNodeContent(fetchResultNode.id, 'Fetching content from URL...', true);

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

            // Update the FETCH_RESULT node with the raw content
            const fetchedContent = `**[${contentData.title}](${url})**\n\n${contentData.text}`;
            this.canvas.updateNodeContent(fetchResultNode.id, fetchedContent, false);
            this.graph.updateNode(fetchResultNode.id, {
                content: fetchedContent,
                versions: [{
                    content: fetchedContent,
                    timestamp: Date.now(),
                    reason: 'fetched'
                }]
            });

            // Create SUMMARY node for the AI summary
            const summaryNode = createNode(NodeType.SUMMARY, 'Summarizing content...', {
                position: {
                    x: fetchResultNode.position.x + 450,
                    y: fetchResultNode.position.y
                }
            });

            this.graph.addNode(summaryNode);
            this.canvas.renderNode(summaryNode);

            const summaryEdge = createEdge(fetchResultNode.id, summaryNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(summaryEdge);
            this.canvas.renderEdge(summaryEdge, fetchResultNode.position, summaryNode.position);

            // Smoothly pan to the summary node
            this.canvas.centerOnAnimated(
                summaryNode.position.x + 200,
                summaryNode.position.y + 100,
                300
            );

            // Now summarize the content with LLM
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
            this.canvas.updateNodeContent(fetchResultNode.id, `Error: ${err.message}`, false);
            this.graph.updateNode(summaryNode.id, { content: `Error: ${err.message}` });
        }
    }

    /**
     * Extract URL from Reference node content (format: **[Title](url)**)
     */
    extractUrlFromReferenceNode(content) {
        return extractUrlFromReferenceNode(content);
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

    handleNodeMove(nodeId, newPos, oldPos) {
        // Only push undo if position actually changed
        if (oldPos && (oldPos.x !== newPos.x || oldPos.y !== newPos.y)) {
            this.undoManager.push({
                type: 'MOVE_NODES',
                moves: [{ nodeId, from: oldPos, to: newPos }]
            });
        }

        this.graph.updateNode(nodeId, { position: newPos });
        this.saveSession();
    }

    handleNodeResize(nodeId, width, height) {
        this.graph.updateNode(nodeId, { width, height });
        this.saveSession();
    }

    handleNodeDelete(nodeId) {
        // No confirmation needed - undo (Ctrl+Z) provides recovery

        // Capture node and edges for undo BEFORE deletion
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const deletedNodes = [{ ...node }];
        const deletedEdges = this.graph.edges.filter(e =>
            e.source === nodeId || e.target === nodeId
        ).map(e => ({ ...e }));

        // Push undo action
        this.undoManager.push({
            type: 'DELETE_NODES',
            nodes: deletedNodes,
            edges: deletedEdges
        });

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

        // Store the node ID for the save handler
        this._editTitleNodeId = nodeId;

        // Populate and show the modal
        const input = document.getElementById('edit-title-input');
        input.value = node.title || node.summary || '';
        document.getElementById('edit-title-modal').style.display = 'flex';

        // Focus and select the input
        input.focus();
        input.select();
    }

    hideEditTitleModal() {
        document.getElementById('edit-title-modal').style.display = 'none';
        this._editTitleNodeId = null;
    }

    saveNodeTitle() {
        const nodeId = this._editTitleNodeId;
        if (!nodeId) return;

        const node = this.graph.getNode(nodeId);
        if (!node) {
            this.hideEditTitleModal();
            return;
        }

        const oldTitle = node.title;
        const newTitle = document.getElementById('edit-title-input').value.trim() || null;

        // Only push undo if title actually changed
        if (oldTitle !== newTitle) {
            this.undoManager.push({
                type: 'EDIT_TITLE',
                nodeId,
                oldTitle,
                newTitle
            });
        }

        this.graph.updateNode(nodeId, { title: newTitle });

        // Update the DOM
        const wrapper = this.canvas.nodeElements.get(nodeId);
        if (wrapper) {
            const summaryText = wrapper.querySelector('.summary-text');
            if (summaryText) {
                summaryText.textContent = newTitle || node.summary || this.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
            }
        }

        this.saveSession();
        this.hideEditTitleModal();
    }

    /**
     * Handle stopping generation for a streaming node (AI nodes or Matrix fill)
     */
    handleNodeStopGeneration(nodeId) {
        // Check if this is a matrix node with active cell fills
        const matrixCellControllers = this.streamingMatrixCells.get(nodeId);
        if (matrixCellControllers) {
            // Abort all active cell fills for this matrix
            for (const [cellKey, controller] of matrixCellControllers) {
                controller.abort();
            }
            // Cleanup will happen in handleMatrixFillAll's finally block
            return;
        }

        // Otherwise, handle as regular AI node
        const streamingState = this.streamingNodes.get(nodeId);
        if (!streamingState) return;

        // Abort the request
        streamingState.abortController.abort();

        // Get current content and add stopped indicator
        const node = this.graph.getNode(nodeId);
        if (node) {
            const stoppedContent = node.content + '\n\n*[Generation stopped]*';
            this.canvas.updateNodeContent(nodeId, stoppedContent, false);
            this.graph.updateNode(nodeId, { content: stoppedContent });
        }

        // Update UI state - keep context for continue but mark as stopped
        this.canvas.hideStopButton(nodeId);
        this.canvas.showContinueButton(nodeId);

        // Store context for continue, then remove from streaming
        this.streamingNodes.set(nodeId, {
            ...streamingState,
            abortController: null,
            stopped: true
        });

        this.saveSession();
    }

    /**
     * Handle continuing generation for a stopped node
     */
    async handleNodeContinueGeneration(nodeId) {
        const node = this.graph.getNode(nodeId);
        const streamingState = this.streamingNodes.get(nodeId);
        if (!node || !streamingState?.context) return;

        // Hide continue button, show stop button
        this.canvas.hideContinueButton(nodeId);
        this.canvas.showStopButton(nodeId);

        // Get current content (remove the stopped indicator)
        let currentContent = node.content.replace(/\n\n\*\[Generation stopped\]\*$/, '');

        // Build messages with current partial response
        const messages = [
            ...streamingState.context.messages,
            { role: 'assistant', content: currentContent },
            { role: 'user', content: 'Please continue your response from where you left off.' }
        ];

        // Create new AbortController for the continuation
        const abortController = new AbortController();
        this.streamingNodes.set(nodeId, {
            abortController,
            context: streamingState.context
        });

        // Continue streaming
        this.streamWithAbort(
            nodeId,
            abortController,
            messages,
            streamingState.context.model,
            // onChunk
            (chunk, fullContent) => {
                // Append to existing content
                const combinedContent = currentContent + fullContent;
                this.canvas.updateNodeContent(nodeId, combinedContent, true);
                this.graph.updateNode(nodeId, { content: combinedContent });
            },
            // onDone
            (fullContent) => {
                this.streamingNodes.delete(nodeId);
                this.canvas.hideStopButton(nodeId);
                const combinedContent = currentContent + fullContent;
                this.canvas.updateNodeContent(nodeId, combinedContent, false);
                this.graph.updateNode(nodeId, { content: combinedContent });
                this.saveSession();

                // Generate summary async
                this.generateNodeSummary(nodeId);
            },
            // onError
            (err) => {
                this.streamingNodes.delete(nodeId);
                this.canvas.hideStopButton(nodeId);
                const errorContent = currentContent + `\n\n*Error continuing: ${err.message}*`;
                this.canvas.updateNodeContent(nodeId, errorContent, false);
                this.graph.updateNode(nodeId, { content: errorContent });
                this.saveSession();
            }
        );
    }

    /**
     * Helper method to stream LLM responses with abort support
     * Wraps the streaming call with proper error handling for AbortController
     * @param {string} nodeId - The node ID being streamed to
     * @param {AbortController} abortController - Controller to abort the request
     * @param {Array} messages - Array of {role, content} messages
     * @param {string} model - Model ID
     * @param {Function} onChunk - Callback for each chunk (chunk, fullContent)
     * @param {Function} onDone - Callback when complete (normalizedContent)
     * @param {Function} onError - Callback on error (err)
     */
    async streamWithAbort(nodeId, abortController, messages, model, onChunk, onDone, onError) {
        const apiKey = chat.getApiKeyForModel(model);
        const baseUrl = chat.getBaseUrl();

        try {
            const requestBody = {
                messages,
                model,
                api_key: apiKey,
                temperature: 0.7,
            };

            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            let fullContent = '';

            await SSE.readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'message' && data) {
                        fullContent += data;
                        onChunk(data, fullContent);
                    }
                },
                onDone: () => {
                    onDone(SSE.normalizeText(fullContent));
                },
                onError: (err) => {
                    throw err;
                }
            });

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`Stream aborted for node ${nodeId}`);
                return;
            }

            console.error('Stream error:', err);
            onError(err);
        }
    }

    /**
     * Show an error state on a node with retry/dismiss buttons
     */
    showNodeError(nodeId, errorInfo, retryContext) {
        // Store retry context for later
        if (retryContext) {
            this.retryContexts.set(nodeId, retryContext);
        }

        // Update node content to error message for storage
        const errorContent = `Error: ${errorInfo.title}\n\n${errorInfo.description}`;
        this.graph.updateNode(nodeId, { content: errorContent });

        // Show error UI
        this.canvas.showNodeError(nodeId, errorInfo);
        this.saveSession();
    }

    /**
     * Handle retry for a failed node operation
     */
    async handleNodeRetry(nodeId) {
        const retryContext = this.retryContexts.get(nodeId);
        if (!retryContext) return;

        // Clear error state
        this.canvas.clearNodeError(nodeId);
        this.retryContexts.delete(nodeId);

        // Re-execute based on context type
        if (retryContext.type === 'chat') {
            // Clear the node content and show loading state
            this.canvas.updateNodeContent(nodeId, '', true);
            this.graph.updateNode(nodeId, { content: '' });

            // Create AbortController for this retry
            const abortController = new AbortController();

            // Track streaming state with new pattern
            this.streamingNodes.set(nodeId, {
                abortController,
                context: { messages: retryContext.messages, model: retryContext.model }
            });
            this.canvas.showStopButton(nodeId);

            // Retry the chat request using streamWithAbort
            this.streamWithAbort(
                nodeId,
                abortController,
                retryContext.messages,
                retryContext.model,
                // onChunk
                (chunk, fullContent) => {
                    this.canvas.updateNodeContent(nodeId, fullContent, true);
                    this.graph.updateNode(nodeId, { content: fullContent });
                },
                // onDone
                (fullContent) => {
                    this.streamingNodes.delete(nodeId);
                    this.canvas.hideStopButton(nodeId);
                    this.canvas.updateNodeContent(nodeId, fullContent, false);
                    this.graph.updateNode(nodeId, { content: fullContent });
                    this.saveSession();
                    this.generateNodeSummary(nodeId);
                },
                // onError
                (err) => {
                    this.streamingNodes.delete(nodeId);
                    this.canvas.hideStopButton(nodeId);
                    const errorInfo = formatUserError(err);
                    this.showNodeError(nodeId, errorInfo, retryContext);
                }
            );
        }
        // Could add handlers for 'search', 'research' etc. in the future
    }

    /**
     * Handle dismissing an error node (removes it)
     */
    handleNodeDismissError(nodeId) {
        // Clean up retry context
        this.retryContexts.delete(nodeId);

        // Remove the node
        this.graph.removeNode(nodeId);
        this.canvas.removeNode(nodeId);

        // Clean up orphaned edges
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

    /**
     * Handle resizing a node to fit 80% of the visible viewport
     */
    handleNodeFitToViewport(nodeId) {
        this.canvas.resizeNodeToViewport(nodeId);
    }

    /**
     * Handle resetting a node to its default size
     */
    handleNodeResetSize(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const wrapper = this.canvas.nodeElements.get(nodeId);
        if (!wrapper) return;

        const div = wrapper.querySelector('.node');
        if (!div) return;

        // Use protocol pattern to determine if scrollable (self-contained in node classes)
        const wrapped = wrapNode(node);
        const isScrollableType = wrapped.isScrollable();
        const isMatrixNode = node.type === NodeType.MATRIX;

        let defaultWidth, defaultHeight;

        if (isScrollableType) {
            // Use fixed default size for scrollable types
            defaultWidth = SCROLLABLE_NODE_SIZE.width;
            defaultHeight = SCROLLABLE_NODE_SIZE.height;
        } else if (isMatrixNode) {
            // Matrix nodes keep their current dimensions (they have special sizing)
            return;
        } else {
            // For non-scrollable types, calculate based on content
            // Temporarily remove constraints to measure natural size
            const oldMinHeight = div.style.minHeight;
            div.style.minHeight = 'auto';
            const contentHeight = div.scrollHeight + 10;
            div.style.minHeight = oldMinHeight;

            // Use stored width or calculate from content
            defaultWidth = node.width || 400;
            defaultHeight = Math.max(100, contentHeight);
        }

        // Apply new dimensions
        wrapper.setAttribute('width', defaultWidth);
        wrapper.setAttribute('height', defaultHeight);

        // For scrollable types, keep viewport-fitted so node renders at wrapper size with scrolling
        // This prevents mismatch between wrapper dimensions and rendered dimensions during resize
        if (isScrollableType) {
            div.classList.add('viewport-fitted');
            div.style.height = '100%';
        } else {
            // For non-scrollable types, remove constraints to allow natural sizing
            div.classList.remove('viewport-fitted');
            div.style.height = '';
        }

        // Update edges
        const x = parseFloat(wrapper.getAttribute('x'));
        const y = parseFloat(wrapper.getAttribute('y'));
        this.canvas.updateEdgesForNode(nodeId, { x, y });

        // Persist dimensions
        this.graph.updateNode(nodeId, {
            width: defaultWidth,
            height: defaultHeight
        });
        this.saveSession();
    }

    /**
     * Handle opening the edit content modal for a node
     */
    handleNodeEditContent(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        this.editingNodeId = nodeId;
        const textarea = document.getElementById('edit-content-textarea');
        const preview = document.getElementById('edit-content-preview');

        textarea.value = node.content || '';

        // Render initial preview
        this.updateEditContentPreview();

        // Set up live preview on input
        textarea.oninput = () => this.updateEditContentPreview();

        document.getElementById('edit-content-modal').style.display = 'flex';

        // Focus the textarea
        setTimeout(() => {
            textarea.focus();
        }, 100);
    }

    /**
     * Update the live preview in the edit content modal
     */
    updateEditContentPreview() {
        const textarea = document.getElementById('edit-content-textarea');
        const preview = document.getElementById('edit-content-preview');
        const content = textarea.value || '';

        // Use the canvas's renderMarkdown method for consistent styling
        preview.innerHTML = this.canvas.renderMarkdown(content);
    }

    /**
     * Hide the edit content modal
     */
    hideEditContentModal() {
        document.getElementById('edit-content-modal').style.display = 'none';
        document.getElementById('edit-content-textarea').oninput = null;
        this.editingNodeId = null;
    }

    /**
     * Save edited content with versioning
     */
    handleEditContentSave() {
        if (!this.editingNodeId) return;

        const node = this.graph.getNode(this.editingNodeId);
        if (!node) {
            this.hideEditContentModal();
            return;
        }

        const newContent = document.getElementById('edit-content-textarea').value;

        // Don't save if content hasn't changed
        if (newContent === node.content) {
            this.hideEditContentModal();
            return;
        }

        // Initialize versions array if needed
        if (!node.versions) {
            node.versions = [{
                content: node.content,
                timestamp: node.createdAt || Date.now(),
                reason: 'initial'
            }];
        }

        // Store current content as a version before updating
        node.versions.push({
            content: node.content,
            timestamp: Date.now(),
            reason: 'before edit'
        });

        // Update content
        node.content = newContent;

        // Re-render node
        this.canvas.updateNodeContent(this.editingNodeId, this.canvas.renderMarkdown(newContent));

        // Close modal and save
        this.hideEditContentModal();
        this.saveSession();
    }

    /**
     * Handle re-summarizing a FETCH_RESULT node (creates new SUMMARY node)
     */
    async handleNodeResummarize(nodeId) {
        const fetchNode = this.graph.getNode(nodeId);
        if (!fetchNode) return;

        // Get parent reference node for URL context
        const parents = this.graph.getParents(nodeId);
        const refNode = parents.find(p => p.type === NodeType.REFERENCE);
        const url = refNode?.url || 'the fetched content';

        const model = this.modelPicker.value;
        const apiKey = chat.getApiKeyForModel(model);

        if (!apiKey) {
            alert('Please set an API key for the selected model in Settings.');
            return;
        }

        // Create new SUMMARY node using createNode for proper defaults
        const summaryNode = createNode(NodeType.SUMMARY, '', {
            position: {
                x: fetchNode.position.x + 50,
                y: fetchNode.position.y + (fetchNode.height || 200) + 50
            },
            model: model.split('/').pop()
        });

        this.graph.addNode(summaryNode);
        const edge = createEdge(nodeId, summaryNode.id, EdgeType.REFERENCE);
        this.graph.addEdge(edge);

        this.canvas.renderNode(summaryNode);
        this.canvas.renderEdge(edge, fetchNode.position, summaryNode.position);

        // Pan to new node
        this.canvas.centerOnAnimated(
            summaryNode.position.x + 200,
            summaryNode.position.y + 100,
            300
        );

        // Select the new node
        this.canvas.clearSelection();
        this.canvas.selectNode(summaryNode.id);

        // Build messages for summarization
        const messages = [
            { role: 'user', content: `Please summarize the following content from ${url}:\n\n${fetchNode.content}` }
        ];

        // Create AbortController for this stream
        const abortController = new AbortController();

        // Track streaming state
        this.streamingNodes.set(summaryNode.id, {
            abortController,
            context: { messages, model }
        });
        this.canvas.showStopButton(summaryNode.id);

        // Stream the summary
        this.streamWithAbort(
            summaryNode.id,
            abortController,
            messages,
            model,
            // onChunk
            (chunk, fullContent) => {
                this.canvas.updateNodeContent(summaryNode.id, fullContent, true);
                this.graph.updateNode(summaryNode.id, { content: fullContent });
            },
            // onDone
            (fullContent) => {
                this.streamingNodes.delete(summaryNode.id);
                this.canvas.hideStopButton(summaryNode.id);
                this.canvas.updateNodeContent(summaryNode.id, fullContent, false);
                this.graph.updateNode(summaryNode.id, { content: fullContent });
                this.saveSession();
                this.generateNodeSummary(summaryNode.id);
            },
            // onError
            (err) => {
                this.streamingNodes.delete(summaryNode.id);
                this.canvas.hideStopButton(summaryNode.id);
                const errorContent = `*Error generating summary: ${err.message}*`;
                this.canvas.updateNodeContent(summaryNode.id, errorContent, false);
                this.graph.updateNode(summaryNode.id, { content: errorContent });
                this.saveSession();
            }
        );

        this.saveSession();
        this.updateEmptyState();
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

    async copyNodeContent(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        try {
            // Use protocol pattern
            const wrapped = wrapNode(node);
            await wrapped.copyToClipboard(this.canvas, this);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    /**
     * Format a matrix node as a markdown table
     */
    formatMatrixAsText(matrixNode) {
        return formatMatrixAsText(matrixNode);
    }

    deleteSelectedNodes() {
        const selectedIds = this.canvas.getSelectedNodeIds();
        if (selectedIds.length === 0) return;

        // No confirmation needed - undo (Ctrl+Z) provides recovery

        // Capture all nodes and edges for undo BEFORE deletion
        const deletedNodes = [];
        const deletedEdges = [];

        for (const nodeId of selectedIds) {
            const node = this.graph.getNode(nodeId);
            if (node) {
                deletedNodes.push({ ...node });
            }
        }

        // Collect edges that will be deleted
        for (const edge of this.graph.edges) {
            if (selectedIds.includes(edge.source) || selectedIds.includes(edge.target)) {
                deletedEdges.push({ ...edge });
            }
        }

        // Push undo action
        this.undoManager.push({
            type: 'DELETE_NODES',
            nodes: deletedNodes,
            edges: deletedEdges
        });

        // Now perform the deletions
        for (const nodeId of selectedIds) {
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
            if (USE_CRDT_GRAPH) {
                // CRDT mode: y-indexeddb handles graph persistence automatically
                // But we ALSO save the full graph data as a backup for migration safety
                // This ensures we don't lose data if CRDT persistence fails
                const graphData = this.graph.toJSON();
                const sessionData = {
                    id: this.session.id,
                    name: this.session.name,
                    created_at: this.session.created_at,
                    updated_at: Date.now(),
                    useCRDT: true,
                    viewport: this.session.viewport,
                    // Keep graph data as backup - this ensures migration can be retried
                    // if CRDT persistence fails or IndexedDB is cleared
                    nodes: graphData.nodes,
                    edges: graphData.edges,
                    tags: graphData.tags
                };
                await storage.saveSession(sessionData);
            } else {
                // Legacy mode: serialize entire graph
                this.session = {
                    ...this.session,
                    ...this.graph.toJSON(),
                    updated_at: Date.now()
                };
                await storage.saveSession(this.session);
            }
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
                // API failed - keep truncated fallback
                return;
            }

            const data = await response.json();

            // If summary is empty, don't update (keep the truncated content fallback)
            if (!data.summary || data.summary.trim() === '') {
                return;
            }

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
            await this.loadSessionData(session);
        } catch (err) {
            alert(`Import failed: ${err.message}`);
        }
    }

    updateEmptyState() {
        const container = document.getElementById('canvas-container');
        let emptyState = container.querySelector('.empty-state');

        if (this.graph.isEmpty()) {
            const hasApiKeys = storage.hasAnyLLMApiKey();

            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                container.appendChild(emptyState);
            }

            if (hasApiKeys) {
                // User has API keys configured - show normal onboarding
                emptyState.innerHTML = `
                    <h2>Start a conversation</h2>
                    <p>Type a message below to begin exploring ideas on the canvas.</p>
                    <p><kbd>Cmd/Ctrl+Click</kbd> to multi-select nodes</p>
                `;
            } else {
                // No API keys - guide user to settings first
                emptyState.innerHTML = `
                    <h2>Welcome to Canvas Chat</h2>
                    <p>To get started, add an API key in <a href="#" class="empty-state-settings-link">Settings</a>.</p>
                `;
                // Add click handler for the settings link
                const settingsLink = emptyState.querySelector('.empty-state-settings-link');
                if (settingsLink) {
                    settingsLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.showSettingsModal();
                    });
                }
            }
        } else if (emptyState) {
            emptyState.remove();
        }
    }

    /**
     * Show a temporary hint message on the canvas.
     * Used to provide contextual guidance to users.
     *
     * @param {string} message - The hint message to display
     * @param {number} duration - How long to show the hint (ms), default 3000
     */
    showCanvasHint(message, duration = 3000) {
        const hint = document.getElementById('canvas-hint');
        if (!hint) return;

        const textEl = hint.querySelector('.hint-text');
        if (textEl) {
            textEl.textContent = message;
        } else {
            hint.textContent = message;
        }

        hint.style.display = 'block';
        hint.classList.add('visible');

        // Clear any existing timeout
        if (this._canvasHintTimeout) {
            clearTimeout(this._canvasHintTimeout);
        }

        // Fade out after duration
        this._canvasHintTimeout = setTimeout(() => {
            hint.classList.remove('visible');
            setTimeout(() => {
                hint.style.display = 'none';
            }, 300);  // Match CSS transition
        }, duration);
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

    // --- Help Modal ---

    showHelpModal() {
        document.getElementById('help-modal').style.display = 'flex';
    }

    hideHelpModal() {
        document.getElementById('help-modal').style.display = 'none';
    }

    isHelpOpen() {
        return document.getElementById('help-modal').style.display === 'flex';
    }

    // --- Undo/Redo ---

    /**
     * Update the undo/redo button states
     */
    updateUndoButtons() {
        if (this.undoBtn) {
            this.undoBtn.disabled = !this.undoManager.canUndo();
        }
        if (this.redoBtn) {
            this.redoBtn.disabled = !this.undoManager.canRedo();
        }
    }

    /**
     * Perform undo operation
     */
    undo() {
        const action = this.undoManager.undo();
        if (!action) return;

        this.executeUndo(action);
        this.saveSession();
    }

    /**
     * Perform redo operation
     */
    redo() {
        const action = this.undoManager.redo();
        if (!action) return;

        this.executeRedo(action);
        this.saveSession();
    }

    /**
     * Execute an undo action (reverse of the original action)
     */
    executeUndo(action) {
        switch (action.type) {
            case 'DELETE_NODES':
                // Restore deleted nodes and edges
                for (const node of action.nodes) {
                    this.graph.addNode(node);
                    this.canvas.renderNode(node);
                }
                for (const edge of action.edges) {
                    this.graph.addEdge(edge);
                    const sourceNode = this.graph.getNode(edge.source);
                    const targetNode = this.graph.getNode(edge.target);
                    if (sourceNode && targetNode) {
                        this.canvas.renderEdge(edge, sourceNode.position, targetNode.position);
                    }
                }
                this.updateEmptyState();
                break;

            case 'ADD_NODE':
                // Remove the added node
                this.graph.removeNode(action.node.id);
                this.canvas.removeNode(action.node.id);
                // Remove orphaned edges
                for (const [edgeId, path] of this.canvas.edgeElements) {
                    const sourceId = path.getAttribute('data-source');
                    const targetId = path.getAttribute('data-target');
                    if (!this.graph.getNode(sourceId) || !this.graph.getNode(targetId)) {
                        this.canvas.removeEdge(edgeId);
                    }
                }
                this.updateEmptyState();
                break;

            case 'MOVE_NODES':
                // Restore old positions
                for (const move of action.moves) {
                    this.graph.updateNode(move.nodeId, { position: move.from });
                    const wrapper = this.canvas.nodeElements.get(move.nodeId);
                    if (wrapper) {
                        wrapper.setAttribute('x', move.from.x);
                        wrapper.setAttribute('y', move.from.y);
                        this.canvas.updateEdgesForNode(move.nodeId, move.from);
                    }
                }
                break;

            case 'EDIT_TITLE':
                // Restore old title
                this.graph.updateNode(action.nodeId, { title: action.oldTitle });
                const wrapper = this.canvas.nodeElements.get(action.nodeId);
                if (wrapper) {
                    const summaryText = wrapper.querySelector('.summary-text');
                    const node = this.graph.getNode(action.nodeId);
                    if (summaryText && node) {
                        summaryText.textContent = action.oldTitle || node.summary || this.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
                    }
                }
                break;

            case 'TAG_CHANGE':
                // Restore old tags
                this.graph.updateNode(action.nodeId, { tags: action.oldTags });
                // Re-render the node to update tag display
                const tagNode = this.graph.getNode(action.nodeId);
                if (tagNode) {
                    this.canvas.renderNode(tagNode);
                }
                break;

            case 'FILL_CELL':
                // Restore old cell state
                const matrixNodeUndo = this.graph.getNode(action.nodeId);
                if (matrixNodeUndo && matrixNodeUndo.type === NodeType.MATRIX) {
                    const cellKey = `${action.row}-${action.col}`;
                    matrixNodeUndo.cells[cellKey] = { ...action.oldCell };
                    this.graph.updateNode(action.nodeId, { cells: matrixNodeUndo.cells });
                    this.canvas.updateMatrixCell(action.nodeId, action.row, action.col,
                        action.oldCell.filled ? action.oldCell.content : null, false);
                }
                break;
        }
    }

    /**
     * Execute a redo action (re-apply the original action)
     */
    executeRedo(action) {
        switch (action.type) {
            case 'DELETE_NODES':
                // Re-delete the nodes
                for (const node of action.nodes) {
                    this.graph.removeNode(node.id);
                    this.canvas.removeNode(node.id);
                }
                // Remove orphaned edges from canvas
                for (const [edgeId, path] of this.canvas.edgeElements) {
                    const sourceId = path.getAttribute('data-source');
                    const targetId = path.getAttribute('data-target');
                    if (!this.graph.getNode(sourceId) || !this.graph.getNode(targetId)) {
                        this.canvas.removeEdge(edgeId);
                    }
                }
                this.updateEmptyState();
                break;

            case 'ADD_NODE':
                // Re-add the node
                this.graph.addNode(action.node);
                this.canvas.renderNode(action.node);
                for (const edge of action.edges) {
                    this.graph.addEdge(edge);
                    const sourceNode = this.graph.getNode(edge.source);
                    const targetNode = this.graph.getNode(edge.target);
                    if (sourceNode && targetNode) {
                        this.canvas.renderEdge(edge, sourceNode.position, targetNode.position);
                    }
                }
                this.updateEmptyState();
                break;

            case 'MOVE_NODES':
                // Apply new positions
                for (const move of action.moves) {
                    this.graph.updateNode(move.nodeId, { position: move.to });
                    const wrapper = this.canvas.nodeElements.get(move.nodeId);
                    if (wrapper) {
                        wrapper.setAttribute('x', move.to.x);
                        wrapper.setAttribute('y', move.to.y);
                        this.canvas.updateEdgesForNode(move.nodeId, move.to);
                    }
                }
                break;

            case 'EDIT_TITLE':
                // Apply new title
                this.graph.updateNode(action.nodeId, { title: action.newTitle });
                const wrapper = this.canvas.nodeElements.get(action.nodeId);
                if (wrapper) {
                    const summaryText = wrapper.querySelector('.summary-text');
                    const node = this.graph.getNode(action.nodeId);
                    if (summaryText && node) {
                        summaryText.textContent = action.newTitle || node.summary || this.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
                    }
                }
                break;

            case 'TAG_CHANGE':
                // Apply new tags
                this.graph.updateNode(action.nodeId, { tags: action.newTags });
                // Re-render the node to update tag display
                const tagNodeRedo = this.graph.getNode(action.nodeId);
                if (tagNodeRedo) {
                    this.canvas.renderNode(tagNodeRedo);
                }
                break;

            case 'FILL_CELL':
                // Re-apply cell fill
                const matrixNodeRedo = this.graph.getNode(action.nodeId);
                if (matrixNodeRedo && matrixNodeRedo.type === NodeType.MATRIX) {
                    const cellKey = `${action.row}-${action.col}`;
                    matrixNodeRedo.cells[cellKey] = { ...action.newCell };
                    this.graph.updateNode(action.nodeId, { cells: matrixNodeRedo.cells });
                    this.canvas.updateMatrixCell(action.nodeId, action.row, action.col,
                        action.newCell.content, false);
                }
                break;
        }
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

        // Update empty state in case API key status changed
        this.updateEmptyState();

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
                    await this.loadSessionData(session);
                    this.hideSessionsModal();
                }
            });
        });

        // Add delete handlers
        listEl.querySelectorAll('.session-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.deleteId;
                // No confirmation - user can create new sessions easily
                await storage.deleteSession(sessionId);
                // If deleting current session, create new one
                if (this.session.id === sessionId) {
                    await this.createNewSession();
                }
                this.showSessionsModal(); // Refresh list
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

        // No confirmation - tags can be recreated easily
        this.graph.deleteTag(color);
        this.saveSession();
        this.canvas.renderGraph(this.graph);
        this.renderTagSlots();
    }

    toggleTagOnNodes(color, nodeIds) {
        // Check current state
        const nodesWithTag = nodeIds.filter(id => this.graph.nodeHasTag(id, color));
        const allHaveTag = nodesWithTag.length === nodeIds.length;

        // Store old tags for undo (for each affected node)
        const tagChanges = [];
        for (const nodeId of nodeIds) {
            const node = this.graph.getNode(nodeId);
            if (node) {
                tagChanges.push({
                    nodeId,
                    oldTags: [...(node.tags || [])],
                    newTags: null  // Will be calculated after change
                });
            }
        }

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

        // Update newTags in changes and push undo action
        for (const change of tagChanges) {
            const node = this.graph.getNode(change.nodeId);
            if (node) {
                change.newTags = [...(node.tags || [])];
            }
        }

        // Push undo action for each affected node
        for (const change of tagChanges) {
            this.undoManager.push({
                type: 'TAG_CHANGE',
                nodeId: change.nodeId,
                oldTags: change.oldTags,
                newTags: change.newTags
            });
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
        return escapeHtmlText(text);
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

        // Smoothly pan to center the node in view
        this.canvas.panToNodeAnimated(nodeId, 300);
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Export pure functions for testing
window.formatUserError = formatUserError;
window.buildMessagesForApi = buildMessagesForApi;
window.isUrlContent = isUrlContent;
window.extractUrlFromReferenceNode = extractUrlFromReferenceNode;
window.truncateText = truncateText;
window.escapeHtmlText = escapeHtmlText;
window.formatMatrixAsText = formatMatrixAsText;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (USE_CRDT_GRAPH) {
        // CRDT mode: wait for Yjs to load before initializing
        // Yjs loads as an ES module which is async, so we need to wait for the yjs-ready event
        const initWithYjs = () => {
            console.log('%c[App] Yjs ready, initializing app', 'color: #4CAF50');
            window.app = new App();
        };

        if (window.Y) {
            // Yjs already loaded
            initWithYjs();
        } else {
            // Wait for Yjs to load
            console.log('[App] Waiting for Yjs to load...');
            window.addEventListener('yjs-ready', initWithYjs, { once: true });
        }
    } else {
        // Legacy mode: initialize immediately
        window.app = new App();
    }
});
