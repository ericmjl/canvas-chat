/**
 * Main application - ties together all modules
 */

// Import dependencies
import { NodeType, EdgeType, createNode, createEdge, TAG_COLORS, getDefaultNodeSize } from './graph-types.js';
import { CRDTGraph } from './crdt-graph.js';
import { Canvas } from './canvas.js';
import { Chat, chat } from './chat.js';
import { Storage, storage } from './storage.js';
import { EventEmitter } from './event-emitter.js';
import { CancellableEvent } from './plugin-events.js';
import { UndoManager } from './undo-manager.js';
import { SlashCommandMenu, SLASH_COMMANDS } from './slash-command-menu.js';
import { NodeRegistry } from './node-registry.js';
import { ModalManager } from './modal-manager.js';
import { FileUploadHandler } from './file-upload-handler.js';
import { FlashcardFeature } from './flashcards.js';
import { CommitteeFeature } from './committee.js';
import { MatrixFeature } from './matrix.js';
import { FactcheckFeature } from './factcheck.js';
import { ResearchFeature } from './research.js';
import { SearchIndex, getNodeTypeIcon } from './search.js';
import { wrapNode } from './node-protocols.js';
import {
    isUrlContent,
    extractUrlFromReferenceNode,
    formatUserError,
    truncateText,
    escapeHtmlText,
    formatMatrixAsText,
    buildMessagesForApi,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    resizeImage,
    apiUrl,
} from './utils.js';
import { highlightTextInHtml, extractExcerptText } from './highlight-utils.js';
import { streamSSEContent, readSSEStream } from './sse.js';
// Plugin system
import { FeatureRegistry, PRIORITY } from './feature-registry.js';
import { AppContext } from './feature-plugin.js';

/* global pyodideRunner */

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

        // Retry contexts for error recovery
        this.retryContexts = new Map(); // nodeId -> { type, ...context }

        // Edit content modal state
        this.editingNodeId = null;

        // Code editor modal state
        this.editingCodeNodeId = null;

        // Tag highlighting state
        this.highlightedTagColor = null; // Currently highlighted tag color, or null if none

        // Admin mode state (set by loadConfig)
        this.adminMode = false;
        this.adminModels = []; // Models configured by admin (only in admin mode)

        // Feature modules (initialized lazily)
        this._flashcardFeature = null;
        this._committeeFeature = null;
        this._matrixFeature = null;
        this._factcheckFeature = null;
        this._researchFeature = null;

        // Plugin system
        this.featureRegistry = new FeatureRegistry();

        // Undo/Redo manager
        this.undoManager = new UndoManager();

        // Modal manager
        this.modalManager = new ModalManager(this);

        // File upload handler
        this.fileUploadHandler = new FileUploadHandler(this);

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

        // Setup canvas event listeners (using EventEmitter pattern)
        this.setupCanvasEventListeners();

        // Attach slash command menu to reply tooltip input
        const replyInput = this.canvas.getReplyTooltipInput();
        if (replyInput) {
            this.slashCommandMenu.attach(replyInput);
            // Set up callback so canvas can check if menu is handling keys
            // Note: This callback returns a value, so it must remain as a property
            this.canvas.onReplyInputKeydown = (e) => {
                if (this.slashCommandMenu.visible) {
                    if (['ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
                        return true; // Menu will handle it
                    }
                }
                return false;
            };
        }

        // Load admin config first (determines if admin mode is enabled)
        await this.loadConfig();

        // Load models (behavior differs based on admin mode)
        await this.loadModels();

        // Hide admin-restricted UI elements if in admin mode
        if (this.adminMode) {
            this.hideAdminRestrictedUI();
        }

        // Load or create session
        await this.loadSession();

        // Initialize plugin system
        await this.initializePluginSystem();

        // Setup graph event listeners
        this.graph
            .on('nodeAdded', (node) => {
                this.canvas.renderNode(node);
                this.updateEmptyState();
            })
            .on('nodeRemoved', () => this.updateEmptyState());

        // Setup UI event listeners
        this.setupEventListeners();

        // Show empty state if needed
        this.updateEmptyState();
    }

    /**
     * Load application config from backend.
     * Determines if admin mode is enabled and gets admin-configured models.
     */
    async loadConfig() {
        try {
            const response = await fetch(apiUrl('/api/config'));
            if (response.ok) {
                const config = await response.json();
                this.adminMode = config.adminMode || false;
                this.adminModels = config.models || [];

                if (this.adminMode) {
                    console.log('%c[App] Admin mode enabled', 'color: #FF9800; font-weight: bold');
                    console.log(
                        '[App] Available models:',
                        this.adminModels.map((m) => m.id)
                    );
                }
            }
        } catch (error) {
            console.warn('[App] Failed to load config, using normal mode:', error);
            this.adminMode = false;
            this.adminModels = [];
        }
    }

    /**
     * Hide UI elements that should not be shown in admin mode.
     * In admin mode, users don't configure API keys or custom models.
     */
    hideAdminRestrictedUI() {
        // Hide API keys section in settings modal
        const apiKeysSection = document.getElementById('settings-api-keys-section');
        if (apiKeysSection) {
            apiKeysSection.style.display = 'none';
        }

        // Hide LLM proxy section in settings modal (admin controls endpoints)
        const proxySection = document.getElementById('settings-proxy-section');
        if (proxySection) {
            proxySection.style.display = 'none';
        }

        // Hide custom models section in settings modal
        const customModelsSection = document.getElementById('settings-custom-models-section');
        if (customModelsSection) {
            customModelsSection.style.display = 'none';
        }

        console.log('[App] Hidden admin-restricted UI elements (API keys, proxy, custom models)');
    }

    /**
     * Get the flashcard feature module (lazy initialization).
     * @returns {FlashcardFeature}
     */
    get flashcardFeature() {
        // Use plugin system instance
        const feature = this.featureRegistry.getFeature('flashcards');
        if (feature) {
            return feature;
        }

        // Fallback: Lazy initialization for backwards compatibility
        if (!this._flashcardFeature) {
            this._flashcardFeature = new FlashcardFeature({
                graph: this.graph,
                canvas: this.canvas,
                modelPicker: this.modelPicker,
                saveSession: () => this.saveSession(),
                updateEmptyState: () => this.updateEmptyState(),
                showToast: (msg, type) => this.showToast(msg, type),
                updateCollapseButtonForNode: (nodeId) => this.updateCollapseButtonForNode(nodeId),
                buildLLMRequest: (params) => this.buildLLMRequest(params),
            });
        }
        return this._flashcardFeature;
    }

    /**
     * Get the committee feature module (lazy initialization).
     * @returns {CommitteeFeature}
     */
    get committeeFeature() {
        if (!this._committeeFeature) {
            this._committeeFeature = new CommitteeFeature({
                graph: this.graph,
                canvas: this.canvas,
                modelPicker: this.modelPicker,
                chatInput: this.chatInput,
                saveSession: () => this.saveSession(),
                updateEmptyState: () => this.updateEmptyState(),
                buildLLMRequest: (params) => this.buildLLMRequest(params),
            });
        }
        return this._committeeFeature;
    }

    /**
     * Get the matrix feature module (lazy initialization).
     * @returns {MatrixFeature}
     */
    get matrixFeature() {
        // Use plugin system instance
        const feature = this.featureRegistry.getFeature('matrix');
        if (feature) {
            return feature;
        }

        // Fallback: Lazy initialization for backwards compatibility
        if (!this._matrixFeature) {
            this._matrixFeature = new MatrixFeature({
                graph: this.graph,
                canvas: this.canvas,
                getModelPicker: () => this.modelPicker,
                saveSession: () => this.saveSession(),
                updateEmptyState: () => this.updateEmptyState(),
                generateNodeSummary: (nodeId) => this.generateNodeSummary(nodeId),
                pushUndo: (action) => this.undoManager.push(action),
                buildLLMRequest: (params) => this.buildLLMRequest(params),
            });
        }
        return this._matrixFeature;
    }

    /**
     * Get the factcheck feature module (lazy initialization).
     * @returns {FactcheckFeature}
     */
    get factcheckFeature() {
        // Use plugin system instance
        const feature = this.featureRegistry.getFeature('factcheck');
        if (feature) {
            return feature;
        }

        // Fallback: Lazy initialization for backwards compatibility
        if (!this._factcheckFeature) {
            this._factcheckFeature = new FactcheckFeature({
                graph: this.graph,
                canvas: this.canvas,
                getModelPicker: () => this.modelPicker,
                saveSession: () => this.saveSession(),
                buildLLMRequest: (params) => this.buildLLMRequest(params),
            });
        }
        return this._factcheckFeature;
    }

    /**
     * Get the research feature module (lazy initialization).
     * @returns {ResearchFeature}
     */
    get researchFeature() {
        if (!this._researchFeature) {
            this._researchFeature = new ResearchFeature({
                graph: this.graph,
                canvas: this.canvas,
                saveSession: () => this.saveSession(),
                updateEmptyState: () => this.updateEmptyState(),
                buildLLMRequest: (params) => this.buildLLMRequest(params),
                generateNodeSummary: (nodeId) => this.generateNodeSummary(nodeId),
                showSettingsModal: () => this.modalManager.showSettingsModal(),
                getModelPicker: () => this.modelPicker,
                registerStreaming: (nodeId, abortController, context = null) => {
                    // Register research streaming state for stop button support
                    this.streamingNodes.set(nodeId, {
                        abortController: abortController,
                        context: context || { type: 'research' },
                    });
                },
                unregisterStreaming: (nodeId) => {
                    this.streamingNodes.delete(nodeId);
                },
            });
        }
        return this._researchFeature;
    }

    async loadModels() {
        // In admin mode, use admin-configured models
        if (this.adminMode) {
            await this.loadModelsAdminMode();
            return;
        }

        // Normal mode: fetch models dynamically from each provider with configured API keys
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
            .filter((p) => p.key) // Only providers with keys
            .map((p) => chat.fetchProviderModels(p.name, p.key));

        // Also fetch Ollama models if on localhost
        if (storage.isLocalhost()) {
            // Ollama models come from the static /api/models endpoint
            fetchPromises.push(chat.fetchModels().then((models) => models.filter((m) => m.provider === 'Ollama')));
        }

        // Wait for all fetches to complete
        const results = await Promise.all(fetchPromises);
        for (const models of results) {
            allModels.push(...models);
        }

        // Add user-defined custom models
        const customModels = storage.getCustomModels();
        allModels.push(...customModels);

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
            if (savedModel && allModels.find((m) => m.id === savedModel)) {
                this.modelPicker.value = savedModel;
            }
        }
    }

    /**
     * Load models in admin mode.
     * Uses admin-configured models from the backend instead of fetching from providers.
     */
    async loadModelsAdminMode() {
        const allModels = this.adminModels;

        // Update chat.models for context window lookups
        chat.models = allModels;

        // Populate model picker
        this.modelPicker.innerHTML = '';

        if (allModels.length === 0) {
            // No models configured by admin
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No models configured. Contact your administrator.';
            option.disabled = true;
            this.modelPicker.appendChild(option);
            this.modelPicker.classList.add('no-keys');
        } else {
            this.modelPicker.classList.remove('no-keys');
            for (const model of allModels) {
                const option = document.createElement('option');
                option.value = model.id;
                // Admin models may have provider from config or extract from id
                const provider = model.provider || model.id.split('/')[0];
                option.textContent = `${model.name} (${provider})`;
                this.modelPicker.appendChild(option);
            }

            // Restore last selected model (if still available)
            const savedModel = storage.getCurrentModel();
            if (savedModel && allModels.find((m) => m.id === savedModel)) {
                this.modelPicker.value = savedModel;
            }
        }
    }

    async loadSession() {
        // Check for session ID in URL (for shared multiplayer links)
        const urlParams = new URLSearchParams(window.location.search);
        const sharedSessionId = urlParams.get('session');
        const autoMultiplayer = urlParams.get('multiplayer') === 'true';

        if (sharedSessionId) {
            // Joining a shared session
            console.log('[App] Joining shared session:', sharedSessionId);
            await this.joinSharedSession(sharedSessionId, autoMultiplayer);

            // Clear URL params after joining (keeps URL clean)
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }

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

        // Create CRDTGraph with automatic persistence
        console.log('%c[App] Using CRDT Graph mode', 'color: #2196F3; font-weight: bold');
        this.graph = new CRDTGraph(session.id, session);
        this._flashcardFeature = null; // Reset feature modules for new graph
        this._committeeFeature = null;
        this._matrixFeature = null;
        this._factcheckFeature = null;
        this._researchFeature = null;
        await this.graph.enablePersistence();

        // Render graph
        this.canvas.renderGraph(this.graph);

        // Update navigation button states and collapse visibility after rendering
        // Use triple requestAnimationFrame to ensure edges are rendered first
        // (renderGraph uses double rAF for edges due to height settling)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.canvas.updateAllNavButtonStates(this.graph);
                    this.updateAllNodeVisibility();
                });
            });
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

        // Check for due flashcards and show notification
        this.checkDueFlashcardsOnLoad();
    }

    /**
     * Join a shared multiplayer session.
     * Creates an empty local session with the shared ID, then syncs via WebRTC.
     * @param {string} sessionId - The shared session ID
     * @param {boolean} autoMultiplayer - Whether to auto-enable multiplayer
     */
    async joinSharedSession(sessionId, autoMultiplayer = true) {
        console.log('[App] Joining shared session:', sessionId, 'auto-multiplayer:', autoMultiplayer);

        // Check if we already have this session locally
        const existingSession = await storage.getSession(sessionId);

        if (existingSession) {
            // We have it - load and optionally enable multiplayer
            await this.loadSessionData(existingSession);
        } else {
            // Create a new empty session with the shared ID
            // Content will sync via WebRTC from the host
            this.session = {
                id: sessionId,
                name: 'Shared Session',
                created_at: Date.now(),
                updated_at: Date.now(),
                nodes: [],
                edges: [],
                tags: {},
                viewport: { x: 0, y: 0, scale: 1 },
            };

            console.log('%c[App] Creating empty CRDT Graph for shared session', 'color: #2196F3; font-weight: bold');
            this.graph = new CRDTGraph(sessionId);
            this._flashcardFeature = null; // Reset feature modules for new graph
            this._committeeFeature = null;
            this._matrixFeature = null;
            this._factcheckFeature = null;
            this._researchFeature = null;
            await this.graph.enablePersistence();

            // Render empty graph (will populate via sync)
            this.canvas.renderGraph(this.graph);

            // Update UI
            this.sessionName.textContent = this.session.name;
            storage.setLastSessionId(sessionId);
            this.updateEmptyState();
        }

        // Auto-enable multiplayer to sync with host
        if (autoMultiplayer) {
            // Small delay to ensure graph is ready
            setTimeout(() => {
                this.toggleMultiplayer();
            }, 500);
        }
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
            viewport: { x: 0, y: 0, scale: 1 },
        };

        // Create new CRDT Graph
        console.log('%c[App] Creating new session with CRDT Graph', 'color: #2196F3; font-weight: bold');
        this.graph = new CRDTGraph(sessionId);
        this._flashcardFeature = null; // Reset feature modules for new graph
        this._committeeFeature = null;
        this._matrixFeature = null;
        this._factcheckFeature = null;
        this._researchFeature = null;
        await this.graph.enablePersistence();

        this.canvas.clear();

        this.sessionName.textContent = this.session.name;
        storage.setLastSessionId(this.session.id);

        this.saveSession();
        this.updateEmptyState();
    }

    /**
     * Setup canvas event listeners (using EventEmitter pattern).
     * This method is called from init() and can be tested independently.
     * If any method doesn't exist, .bind(this) will throw an error.
     */
    setupCanvasEventListeners() {
        this.canvas
            .on('nodeSelect', this.handleNodeSelect.bind(this))
            .on('nodeDeselect', this.handleNodeDeselect.bind(this))
            .on('nodeMove', this.handleNodeMove.bind(this))
            .on('nodeDrag', this.handleNodeDrag.bind(this)) // Real-time drag for multiplayer
            .on('nodeResize', this.handleNodeResize.bind(this))
            .on('nodeResizing', this.handleNodeResizing.bind(this)) // Real-time resize for multiplayer
            .on('nodeReply', this.handleNodeReply.bind(this))
            .on('nodeBranch', this.handleNodeBranch.bind(this))
            .on('nodeSummarize', this.handleNodeSummarize.bind(this))
            .on('nodeFetchSummarize', this.handleNodeFetchSummarize.bind(this))
            .on('nodeDelete', this.handleNodeDelete.bind(this))
            .on('nodeCopy', this.copyNodeContent.bind(this))
            .on('nodeTitleEdit', (nodeId) => this.modalManager.handleNodeTitleEdit(nodeId))
            // Matrix-specific events
            .on('matrixCellFill', this.handleMatrixCellFill.bind(this))
            .on('matrixCellView', this.handleMatrixCellView.bind(this))
            .on('matrixFillAll', this.handleMatrixFillAll.bind(this))
            .on('matrixRowExtract', this.handleMatrixRowExtract.bind(this))
            .on('matrixColExtract', this.handleMatrixColExtract.bind(this))
            .on('matrixEdit', this.handleMatrixEdit.bind(this))
            .on('matrixIndexColResize', this.handleMatrixIndexColResize.bind(this))
            // Streaming control events
            .on('nodeStopGeneration', this.handleNodeStopGeneration.bind(this))
            .on('nodeContinueGeneration', this.handleNodeContinueGeneration.bind(this))
            // Error handling events
            .on('nodeRetry', this.handleNodeRetry.bind(this))
            .on('nodeDismissError', this.handleNodeDismissError.bind(this))
            // Node resize to viewport events
            .on('nodeFitToViewport', this.handleNodeFitToViewport.bind(this))
            .on('nodeResetSize', this.handleNodeResetSize.bind(this))
            // Content editing events (for FETCH_RESULT nodes)
            .on('nodeEditContent', (nodeId) => this.modalManager.handleNodeEditContent(nodeId))
            .on('nodeResummarize', this.handleNodeResummarize.bind(this))
            // Flashcard events
            .on('createFlashcards', this.handleCreateFlashcards.bind(this))
            .on('reviewCard', this.reviewSingleCard.bind(this))
            .on('flipCard', this.handleFlipCard.bind(this))
            // Poll plugin events
            .on('pollVote', this.handlePollVote.bind(this))
            .on('pollAddOption', this.handlePollAddOption.bind(this))
            .on('pollResetVotes', this.handlePollResetVotes.bind(this))
            // File drop events
            .on('pdfDrop', (file, position) => this.fileUploadHandler.handlePdfDrop(file, position))
            .on('imageDrop', (file, position) => this.fileUploadHandler.handleImageDrop(file, position))
            .on('csvDrop', (file, position) => this.fileUploadHandler.handleCsvDrop(file, position))
            // Image and tag click events
            .on('imageClick', this.handleImageClick.bind(this))
            .on('tagChipClick', this.handleTagChipClick.bind(this))
            // Navigation events for parent/child traversal
            .on('navParentClick', this.handleNavParentClick.bind(this))
            .on('navChildClick', this.handleNavChildClick.bind(this))
            .on('nodeNavigate', this.handleNodeNavigate.bind(this))
            // Collapse/expand event for hiding/showing descendants
            .on('nodeCollapse', this.handleNodeCollapse.bind(this))
            // CSV/Code execution events
            .on('nodeAnalyze', this.handleNodeAnalyze.bind(this))
            .on('nodeRunCode', this.handleNodeRunCode.bind(this))
            .on('nodeCodeChange', this.handleNodeCodeChange.bind(this))
            .on('nodeEditCode', (nodeId) => this.modalManager.handleNodeEditCode(nodeId))
            .on('nodeGenerate', this.handleNodeGenerate.bind(this))
            .on('nodeGenerateSubmit', this.handleNodeGenerateSubmit.bind(this))
            .on('nodeOutputToggle', this.handleNodeOutputToggle.bind(this))
            .on('nodeOutputClear', this.handleNodeOutputClear.bind(this))
            .on('nodeOutputResize', this.handleNodeOutputResize.bind(this));
    }

    setupEventListeners() {
        // Attach slash command menu to chat input
        this.slashCommandMenu.attach(this.chatInput);
        // Provide context checker for commands that require selected nodes
        this.slashCommandMenu.getHasContext = () => this.canvas.getSelectedNodeIds().length > 0;
        // Provide CSV checker for commands that require selected CSV nodes
        this.slashCommandMenu.getHasSelectedCsv = () => {
            const selectedIds = this.canvas.getSelectedNodeIds();
            return selectedIds.some((id) => {
                const node = this.graph.getNode(id);
                return node && node.type === NodeType.CSV;
            });
        };

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
            this.modalManager.showSettingsModal();
        });
        document.getElementById('settings-close').addEventListener('click', () => {
            this.modalManager.hideSettingsModal();
        });
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            this.saveSettings();
        });

        // Custom models in settings
        document.getElementById('add-custom-model-btn').addEventListener('click', () => {
            this.modalManager.handleAddCustomModel();
        });

        // Help modal
        document.getElementById('help-btn').addEventListener('click', () => {
            this.modalManager.showHelpModal();
        });
        document.getElementById('help-close').addEventListener('click', () => {
            this.modalManager.hideHelpModal();
        });

        // Edit content modal
        document.getElementById('edit-content-close').addEventListener('click', () => {
            this.modalManager.hideEditContentModal();
        });
        document.getElementById('edit-content-cancel').addEventListener('click', () => {
            this.modalManager.hideEditContentModal();
        });
        document.getElementById('edit-content-save').addEventListener('click', () => {
            this.modalManager.handleEditContentSave();
        });
        // Handle keyboard shortcuts in edit content textarea
        document.getElementById('edit-content-textarea').addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                // Cmd/Ctrl+Enter to save
                e.preventDefault();
                this.modalManager.handleEditContentSave();
            } else if (e.key === 'Escape') {
                this.modalManager.hideEditContentModal();
            }
        });

        // Edit title modal
        document.getElementById('edit-title-close').addEventListener('click', () => {
            this.modalManager.hideEditTitleModal();
        });
        document.getElementById('edit-title-cancel').addEventListener('click', () => {
            this.modalManager.hideEditTitleModal();
        });
        document.getElementById('edit-title-save').addEventListener('click', () => {
            this.modalManager.saveNodeTitle();
        });
        document.getElementById('edit-title-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.modalManager.saveNodeTitle();
            } else if (e.key === 'Escape') {
                this.modalManager.hideEditTitleModal();
            }
        });

        // Code editor modal
        document.getElementById('code-editor-close').addEventListener('click', () => {
            this.modalManager.hideCodeEditorModal();
        });
        document.getElementById('code-editor-cancel').addEventListener('click', () => {
            this.modalManager.hideCodeEditorModal();
        });
        document.getElementById('code-editor-save').addEventListener('click', () => {
            this.modalManager.handleCodeEditorSave();
        });
        document.getElementById('code-editor-textarea').addEventListener('input', () => {
            this.modalManager.updateCodeEditorPreview();
        });
        // Handle Tab for indentation and Escape to close
        document.getElementById('code-editor-textarea').addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                // Insert 4 spaces at cursor
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
                this.modalManager.updateCodeEditorPreview();
            } else if (e.key === 'Escape') {
                this.modalManager.hideCodeEditorModal();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                // Cmd/Ctrl+Enter to save
                e.preventDefault();
                this.modalManager.handleCodeEditorSave();
            }
        });

        // Update modal button labels based on platform
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? '⌘' : 'Ctrl';
        document.getElementById('edit-content-save').textContent = `Save (${modKey}↵)`;
        document.getElementById('code-editor-save').textContent = `Save (${modKey}↵)`;

        // Undo/Redo buttons
        this.undoBtn = document.getElementById('undo-btn');
        this.redoBtn = document.getElementById('redo-btn');
        this.undoBtn.addEventListener('click', () => this.undo());
        this.redoBtn.addEventListener('click', () => this.redo());

        // Wire up undo manager state changes
        this.undoManager.onStateChange = () => this.updateUndoButtons();

        // Multiplayer button
        this.multiplayerBtn = document.getElementById('multiplayer-btn');
        this.multiplayerLeaveBtn = document.getElementById('multiplayer-leave-btn');
        this.peerCountEl = document.getElementById('peer-count');
        this.multiplayerBtn.addEventListener('click', () => this.handleMultiplayerClick());
        this.multiplayerLeaveBtn.addEventListener('click', () => this.leaveMultiplayer());

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
                    await this.fileUploadHandler.handlePdfUpload(file);
                } else if (file.type.startsWith('image/')) {
                    await this.fileUploadHandler.handleImageUpload(file);
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
            this.modalManager.showSessionsModal();
        });
        document.getElementById('session-close').addEventListener('click', () => {
            this.modalManager.hideSessionsModal();
        });
        document.getElementById('new-session-btn').addEventListener('click', async () => {
            this.modalManager.hideSessionsModal();
            await this.createNewSession();
        });

        // Matrix modal
        document.getElementById('matrix-close').addEventListener('click', () => {
            document.getElementById('matrix-modal').style.display = 'none';
            this.matrixFeature._matrixData = null;
        });
        document.getElementById('matrix-cancel-btn').addEventListener('click', () => {
            document.getElementById('matrix-modal').style.display = 'none';
            this.matrixFeature._matrixData = null;
        });
        document.getElementById('swap-axes-btn').addEventListener('click', () => {
            this.matrixFeature.swapMatrixAxes();
        });
        document.getElementById('matrix-create-btn').addEventListener('click', () => {
            this.matrixFeature.createMatrixNode();
        });
        document.getElementById('add-row-btn').addEventListener('click', () => {
            this.matrixFeature.addAxisItem('row-items');
        });
        document.getElementById('add-col-btn').addEventListener('click', () => {
            this.matrixFeature.addAxisItem('col-items');
        });

        // Edit matrix modal
        document.getElementById('edit-matrix-close').addEventListener('click', () => {
            document.getElementById('edit-matrix-modal').style.display = 'none';
            this.matrixFeature._editMatrixData = null;
        });
        document.getElementById('edit-matrix-cancel-btn').addEventListener('click', () => {
            document.getElementById('edit-matrix-modal').style.display = 'none';
            this.matrixFeature._editMatrixData = null;
        });
        document.getElementById('edit-matrix-save-btn').addEventListener('click', () => {
            this.matrixFeature.saveMatrixEdits();
        });
        document.getElementById('edit-swap-axes-btn').addEventListener('click', () => {
            this.matrixFeature.swapEditMatrixAxes();
        });
        document.getElementById('edit-add-row-btn').addEventListener('click', () => {
            this.matrixFeature.addAxisItem('edit-row-items');
        });
        document.getElementById('edit-add-col-btn').addEventListener('click', () => {
            this.matrixFeature.addAxisItem('edit-col-items');
        });

        // Committee modal
        document.getElementById('committee-close').addEventListener('click', () => {
            this.committeeFeature.closeModal();
        });
        document.getElementById('committee-cancel-btn').addEventListener('click', () => {
            this.committeeFeature.closeModal();
        });
        document.getElementById('committee-execute-btn').addEventListener('click', () => {
            this.committeeFeature.executeCommittee();
        });

        // Factcheck modal
        document.getElementById('factcheck-close').addEventListener('click', () => {
            this.factcheckFeature.closeFactcheckModal();
        });
        document.getElementById('factcheck-cancel-btn').addEventListener('click', () => {
            this.factcheckFeature.closeFactcheckModal();
        });
        document.getElementById('factcheck-execute-btn').addEventListener('click', () => {
            this.factcheckFeature.executeFactcheckFromModal();
        });
        document.getElementById('factcheck-select-all').addEventListener('change', (e) => {
            this.factcheckFeature.handleFactcheckSelectAll(e.target.checked);
        });

        // Cell detail modal
        document.getElementById('cell-close').addEventListener('click', () => {
            document.getElementById('cell-modal').style.display = 'none';
        });
        document.getElementById('cell-close-btn').addEventListener('click', () => {
            document.getElementById('cell-modal').style.display = 'none';
        });
        document.getElementById('cell-pin-btn').addEventListener('click', () => {
            this.matrixFeature.pinCellToCanvas();
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
            this.matrixFeature._currentSliceData = null;
        });
        document.getElementById('slice-close-btn').addEventListener('click', () => {
            document.getElementById('slice-modal').style.display = 'none';
            this.matrixFeature._currentSliceData = null;
        });
        document.getElementById('slice-pin-btn').addEventListener('click', () => {
            this.matrixFeature.pinSliceToCanvas();
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

            // Escape to close modals, popover, search, or clear selection
            if (e.key === 'Escape') {
                // Priority order: popover > search > any modal > clear selection
                if (this.canvas.isNavPopoverOpen()) {
                    this.canvas.hideNavPopover();
                } else if (this.isSearchOpen()) {
                    this.closeSearch();
                } else if (this.modalManager.closeAnyOpenModal()) {
                    // Modal was closed, nothing more to do
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
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'j' || e.key === 'k') {
                // If popover is open, navigate within it
                if (this.canvas.isNavPopoverOpen()) {
                    e.preventDefault();
                    this.canvas.navigatePopoverSelection(e.key === 'ArrowUp' || e.key === 'j' ? -1 : 1);
                    return;
                }

                // Otherwise, if node is selected and not in input, navigate to parent/child
                if (!e.target.matches('input, textarea')) {
                    const selectedNodeIds = this.canvas.getSelectedNodeIds();
                    if (selectedNodeIds.length === 1) {
                        e.preventDefault();
                        if (e.key === 'ArrowUp' || e.key === 'j') {
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
                this.modalManager.showHelpModal();
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
            if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input, textarea')) {
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

            // 'e' to edit selected node (code or content)
            if (e.key === 'e' && !e.target.matches('input, textarea')) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length === 1) {
                    const node = this.graph.getNode(selectedNodeIds[0]);
                    if (node) {
                        const wrapped = wrapNode(node);
                        const actions = wrapped.getActions();

                        // Check if node has edit actions
                        if (actions.some((a) => a.id === 'edit-code')) {
                            e.preventDefault();
                            this.modalManager.handleNodeEditCode(selectedNodeIds[0]);
                        } else if (actions.some((a) => a.id === 'edit-content')) {
                            e.preventDefault();
                            this.modalManager.handleNodeEditContent(selectedNodeIds[0]);
                        }
                    }
                }
            }

            // Cmd/Ctrl+Enter to run code in selected code node
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.target.matches('input, textarea')) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length === 1) {
                    const node = this.graph.getNode(selectedNodeIds[0]);
                    if (node && node.type === NodeType.CODE) {
                        e.preventDefault();
                        this.handleNodeRunCode(selectedNodeIds[0]);
                    }
                }
            }

            // Shift+A to trigger AI actions (Generate for Code nodes, Analyze for CSV nodes)
            if (e.shiftKey && e.key === 'A' && !e.target.matches('input, textarea')) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length === 1) {
                    const node = this.graph.getNode(selectedNodeIds[0]);
                    if (node) {
                        const wrapped = wrapNode(node);
                        const actions = wrapped.getActions();

                        // Check for AI-related actions
                        if (actions.some((a) => a.id === 'generate')) {
                            e.preventDefault();
                            this.handleNodeGenerate(selectedNodeIds[0]);
                        } else if (actions.some((a) => a.id === 'analyze')) {
                            e.preventDefault();
                            this.handleNodeAnalyze(selectedNodeIds[0]);
                        }
                    }
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

            // '-' to collapse selected node (hide children)
            if (e.key === '-' && !e.target.matches('input, textarea')) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length === 1) {
                    const node = this.graph.getNode(selectedNodeIds[0]);
                    const children = this.graph.getChildren(selectedNodeIds[0]);
                    // Only collapse if node has children and is not already collapsed
                    if (node && children.length > 0 && !node.collapsed) {
                        e.preventDefault();
                        this.handleNodeCollapse(selectedNodeIds[0]);
                    }
                }
            }

            // '=' to expand selected node (show children)
            if (e.key === '=' && !e.target.matches('input, textarea')) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length === 1) {
                    const node = this.graph.getNode(selectedNodeIds[0]);
                    // Only expand if node is collapsed
                    if (node && node.collapsed) {
                        e.preventDefault();
                        this.handleNodeCollapse(selectedNodeIds[0]);
                    }
                }
            }

            // 'z' to zoom to selected nodes (fit selection in viewport at 80%)
            if (e.key === 'z' && !e.shiftKey && !e.target.matches('input, textarea') && !(e.metaKey || e.ctrlKey)) {
                const selectedNodeIds = this.canvas.getSelectedNodeIds();
                if (selectedNodeIds.length > 0) {
                    e.preventDefault();
                    this.canvas.zoomToSelectionAnimated(selectedNodeIds);
                }
            }

            // 'Shift+Z' to zoom out to fit all content (same as double-click on canvas)
            if (e.key === 'Z' && e.shiftKey && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.canvas.fitToContentAnimated(400);
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
                        await this.fileUploadHandler.handleImageUpload(file, null, true); // showHint=true
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

        // Release all locks on page unload (multiplayer cleanup)
        window.addEventListener('beforeunload', () => {
            this.graph.releaseAllLocks?.();
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
        // First check if this is a plugin-registered slash command
        const parts = content.split(' ');
        const command = parts[0]; // e.g., '/poll', '/committee'
        const args = parts.slice(1).join(' '); // Everything after command

        // Try node registry first (custom node plugins)
        if (NodeRegistry.hasSlashCommand(command)) {
            const cmdConfig = NodeRegistry.getSlashCommand(command);
            if (cmdConfig && cmdConfig.handler) {
                await cmdConfig.handler(this, args, context);
                return true;
            }
        }

        // Try feature registry (feature plugins)
        if (await this.featureRegistry.handleSlashCommand(command, args, { text: context })) {
            return true;
        }

        // Fall through to built-in commands that haven't been migrated yet
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

        // Check for /note command
        if (content.startsWith('/note ')) {
            const noteContent = content.slice(6).trim();
            if (noteContent) {
                await this.handleNote(noteContent);
                return true;
            }
        }

        // Check for /code command
        if (content.startsWith('/code')) {
            const description = content.slice(5).trim();
            await this.handleCode(description);
            return true;
        }

        return false;
    }

    /**
     * Build an LLM request payload with model, API key, and base URL.
     * This ensures all LLM requests include proxy configuration if set.
     *
     * In admin mode, credentials are omitted since the backend injects them.
     *
     * @param {Object} additionalParams - Additional parameters to include in the request
     * @returns {Object} Request payload with model, api_key, base_url, and any additional params
     */
    buildLLMRequest(additionalParams = {}) {
        const model = this.modelPicker.value;

        // In admin mode, backend handles credentials
        if (this.adminMode) {
            return {
                model: model,
                ...additionalParams,
            };
        }

        // Normal mode: include user-provided credentials
        const apiKey = chat.getApiKeyForModel(model);
        const baseUrl = chat.getBaseUrlForModel(model);

        return {
            model: model,
            api_key: apiKey,
            base_url: baseUrl,
            ...additionalParams,
        };
    }

    async handleSend() {
        const content = this.chatInput.value.trim();
        if (!content) return;

        // Try slash commands first, with context from selected nodes OR text selection
        const selectedIds = this.canvas.getSelectedNodeIds();
        let slashContext = null;

        // First check for text selection (higher priority than node selection)
        const textSelection = window.getSelection();
        let selectedText = textSelection ? textSelection.toString().trim() : '';

        // Also check canvas's stored pending selection (in case browser selection was cleared)
        if (!selectedText && this.canvas.pendingSelectedText) {
            selectedText = this.canvas.pendingSelectedText;
        }

        if (selectedText) {
            // Use the selected text as context
            slashContext = selectedText;
        } else if (selectedIds.length > 0) {
            // Gather content from selected nodes as context
            const contextParts = selectedIds
                .map((id) => {
                    const node = this.graph.getNode(id);
                    return node ? node.content : '';
                })
                .filter((c) => c);
            slashContext = contextParts.join('\n\n');
        }

        // Clear input immediately for slash commands (node creation is synchronous)
        if (content.startsWith('/')) {
            this.chatInput.value = '';
            this.chatInput.style.height = 'auto';
        }

        if (await this.tryHandleSlashCommand(content, slashContext)) {
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
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(humanNode);

        // Create edges from parents
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, humanNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
            this.graph.addEdge(edge);

            const parentNode = this.graph.getNode(parentId);
            this.canvas.renderEdge(edge, parentNode.position, humanNode.position);

            // Update collapse button for parent (now has children)
            this.updateCollapseButtonForNode(parentId);
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
            model: model.split('/').pop(), // Just the model name
        });

        this.graph.addNode(aiNode);

        // Create edge from human to AI
        const aiEdge = createEdge(humanNode.id, aiNode.id, EdgeType.REPLY);
        this.graph.addEdge(aiEdge);
        this.canvas.renderEdge(aiEdge, humanNode.position, aiNode.position);

        // Update collapse button for human node (now has AI child)
        this.updateCollapseButtonForNode(humanNode.id);

        // Smoothly pan to the new AI node
        this.canvas.centerOnAnimated(aiNode.position.x + 160, aiNode.position.y + 100, 300);

        // Build context and send to LLM
        const context = this.graph.resolveContext([humanNode.id]);
        const messages = buildMessagesForApi(context);

        // Create AbortController for this stream
        const abortController = new AbortController();

        // Track streaming state for stop/continue functionality
        this.streamingNodes.set(aiNode.id, {
            abortController,
            context: { messages, model, humanNodeId: humanNode.id },
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
                    humanNodeId: humanNode.id,
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
        return this.researchFeature.handleSearch(query, context);
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
                position: this.graph.autoPosition(parentIds),
            });

            this.graph.addNode(noteNode);

            // Create edges from parents (if replying to selected nodes)
            for (const parentId of parentIds) {
                const edge = createEdge(parentId, noteNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
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
            this.canvas.centerOnAnimated(noteNode.position.x + 160, noteNode.position.y + 100, 300);
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
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(fetchNode);

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, fetchNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
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
        this.canvas.centerOnAnimated(fetchNode.position.x + 160, fetchNode.position.y + 100, 300);

        try {
            // Fetch URL content via backend
            const response = await fetch(apiUrl('/api/fetch-url'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
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
                versions: [
                    {
                        content: fetchedContent,
                        timestamp: Date.now(),
                        reason: 'fetched',
                    },
                ],
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
            position: this.graph.autoPosition(parentIds),
        });

        this.graph.addNode(pdfNode);

        // Create edges from parents (if replying to selected nodes)
        for (const parentId of parentIds) {
            const edge = createEdge(parentId, pdfNode.id, parentIds.length > 1 ? EdgeType.MERGE : EdgeType.REPLY);
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
        this.canvas.centerOnAnimated(pdfNode.position.x + 160, pdfNode.position.y + 100, 300);

        try {
            // Fetch PDF content via backend
            const response = await fetch(apiUrl('/api/fetch-pdf'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
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
                page_count: data.page_count,
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

    // File upload handlers moved to file-upload-handler.js

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
     * Handle click on a tag chip to highlight all nodes with that tag.
     * Clicking the same tag again clears the highlighting.
     *
     * @param {string} color - The tag color that was clicked
     */
    handleTagChipClick(color) {
        if (this.highlightedTagColor === color) {
            // Toggle off - clear highlighting
            this.canvas.highlightNodesByTag(null);
            this.highlightedTagColor = null;
        } else {
            // Highlight nodes with this tag
            this.canvas.highlightNodesByTag(color);
            this.highlightedTagColor = color;
        }

        // Update tag drawer UI if it's open
        const drawer = document.getElementById('tag-drawer');
        if (drawer && drawer.classList.contains('open')) {
            this.renderTagSlots();
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
        // Get direct visible parents
        const directVisibleParents = parents.filter((parent) => this.graph.isNodeVisible(parent.id));
        // Also get visible ancestors through hidden paths (e.g., collapsed nodes that connect through hidden children)
        const ancestorsThroughHidden = this.graph.getVisibleAncestorsThroughHidden(nodeId);

        // Combine and deduplicate
        const allNavigableParents = [...directVisibleParents];
        for (const ancestor of ancestorsThroughHidden) {
            if (!allNavigableParents.some((p) => p.id === ancestor.id)) {
                allNavigableParents.push(ancestor);
            }
        }

        this.canvas.handleNavButtonClick(nodeId, 'parent', allNavigableParents, button);
    }

    /**
     * Handle click on the child navigation button.
     * Gets the child nodes and either navigates directly or shows a popover.
     * If the node is collapsed, shows visible descendants through hidden paths.
     *
     * @param {string} nodeId - The current node ID
     * @param {HTMLElement} button - The button element that was clicked
     */
    handleNavChildClick(nodeId, button) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        let navigableChildren;

        if (node.collapsed) {
            // Node is collapsed - get visible descendants through hidden paths
            navigableChildren = this.graph.getVisibleDescendantsThroughHidden(nodeId);
        } else {
            // Node is not collapsed - get direct visible children
            const children = this.graph.getChildren(nodeId);
            navigableChildren = children.filter((child) => this.graph.isNodeVisible(child.id));
        }

        this.canvas.handleNavButtonClick(nodeId, 'child', navigableChildren, button);
    }

    /**
     * Handle keyboard navigation to parent node(s).
     * Shows toast if no parents, navigates directly if one, shows popover if multiple.
     * Considers both direct visible parents and visible ancestors through hidden paths.
     * @param {string} nodeId - The selected node ID
     */
    navigateToParentKeyboard(nodeId) {
        const parents = this.graph.getParents(nodeId);
        // Get direct visible parents
        const directVisibleParents = parents.filter((parent) => this.graph.isNodeVisible(parent.id));
        // Also get visible ancestors through hidden paths (e.g., collapsed nodes that connect through hidden children)
        const ancestorsThroughHidden = this.graph.getVisibleAncestorsThroughHidden(nodeId);

        // Combine and deduplicate
        const allNavigableParents = [...directVisibleParents];
        for (const ancestor of ancestorsThroughHidden) {
            if (!allNavigableParents.some((p) => p.id === ancestor.id)) {
                allNavigableParents.push(ancestor);
            }
        }

        if (allNavigableParents.length === 0) {
            this.canvas.showNavToast('No parent nodes', nodeId);
        } else if (allNavigableParents.length === 1) {
            this.handleNodeNavigate(allNavigableParents[0].id);
        } else {
            const button = this.canvas.getNavButton(nodeId, 'parent');
            if (button) {
                this.canvas.handleNavButtonClick(nodeId, 'parent', allNavigableParents, button);
            }
        }
    }

    /**
     * Handle keyboard navigation to child node(s).
     * Shows toast if no children, navigates directly if one, shows popover if multiple.
     * If the node is collapsed, navigates to visible descendants through hidden paths.
     * @param {string} nodeId - The selected node ID
     */
    navigateToChildKeyboard(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        let navigableChildren;

        if (node.collapsed) {
            // Node is collapsed - get visible descendants through hidden paths
            navigableChildren = this.graph.getVisibleDescendantsThroughHidden(nodeId);
        } else {
            // Node is not collapsed - get direct visible children
            const children = this.graph.getChildren(nodeId);
            navigableChildren = children.filter((child) => this.graph.isNodeVisible(child.id));
        }

        if (navigableChildren.length === 0) {
            this.canvas.showNavToast('No child nodes', nodeId);
        } else if (navigableChildren.length === 1) {
            this.handleNodeNavigate(navigableChildren[0].id);
        } else {
            const button = this.canvas.getNavButton(nodeId, 'child');
            if (button) {
                this.canvas.handleNavButtonClick(nodeId, 'child', navigableChildren, button);
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
        this.canvas.centerOnAnimated(node.position.x + width / 2, node.position.y + height / 2, 300);
    }

    /**
     * Handle collapse/expand toggle for a node.
     * Toggles the collapsed state and updates visibility of all descendants.
     *
     * @param {string} nodeId - The ID of the node to collapse/expand
     */
    handleNodeCollapse(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Toggle collapsed state
        node.collapsed = !node.collapsed;

        // Persist the collapsed state to the graph
        this.graph.updateNode(nodeId, { collapsed: node.collapsed });

        // Update visibility of all nodes
        this.updateAllNodeVisibility();

        // Update the collapse button for this node
        const children = this.graph.getChildren(nodeId);
        const hiddenCount = node.collapsed ? this.graph.countHiddenDescendants(nodeId) : 0;
        this.canvas.updateCollapseButton(nodeId, children.length > 0, node.collapsed, hiddenCount);

        // Save session
        this.saveSession();
    }

    /**
     * Update visibility of all nodes based on collapse state.
     * Called after any collapse/expand action or session restore.
     */
    updateAllNodeVisibility() {
        for (const node of this.graph.getAllNodes()) {
            const visible = this.graph.isNodeVisible(node.id);
            this.canvas.updateNodeVisibility(node.id, visible);

            // Update collapse buttons for all visible nodes
            if (visible) {
                const children = this.graph.getChildren(node.id);
                const hiddenCount = node.collapsed ? this.graph.countHiddenDescendants(node.id) : 0;
                this.canvas.updateCollapseButton(node.id, children.length > 0, node.collapsed, hiddenCount);
            }
        }

        // Update edge visibility/styling based on collapse state
        this.updateAllEdgeVisibility();
    }

    /**
     * Update visibility and styling of all edges based on collapse state.
     * Also creates virtual collapsed-path edges from collapsed nodes to visible descendants.
     * - Hidden: either endpoint is hidden
     * - Visible: both endpoints visible
     * - Virtual collapsed-path: from collapsed node to visible descendant through hidden nodes
     */
    updateAllEdgeVisibility() {
        // First, remove all existing virtual collapsed-path edges
        this.canvas.removeAllCollapsedPathEdges();

        // Update real edge visibility
        for (const edge of this.graph.getAllEdges()) {
            const sourceNode = this.graph.getNode(edge.source);
            const targetNode = this.graph.getNode(edge.target);

            if (!sourceNode || !targetNode) continue;

            const sourceVisible = this.graph.isNodeVisible(edge.source);
            const targetVisible = this.graph.isNodeVisible(edge.target);

            // Determine edge state - for real edges, just show or hide
            if (!sourceVisible || !targetVisible) {
                this.canvas.updateEdgeState(edge.id, 'hidden');
            } else {
                this.canvas.updateEdgeState(edge.id, 'visible');
            }
        }

        // Create virtual collapsed-path edges for collapsed nodes
        for (const node of this.graph.getAllNodes()) {
            if (node.collapsed && this.graph.isNodeVisible(node.id)) {
                // This node is collapsed and visible - find visible descendants through hidden paths
                const visibleDescendants = this.graph.getVisibleDescendantsThroughHidden(node.id);

                for (const descendant of visibleDescendants) {
                    // Render a virtual edge from this collapsed node to the visible descendant
                    this.canvas.renderCollapsedPathEdge(node.id, descendant.id, node.position, descendant.position);
                }
            }
        }
    }

    /**
     * Update collapse button for a node after its children change.
     * Call this after adding an edge where the node is the parent (source).
     *
     * @param {string} nodeId - The node ID to update
     */
    updateCollapseButtonForNode(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const children = this.graph.getChildren(nodeId);
        const hiddenCount = node.collapsed ? this.graph.countHiddenDescendants(nodeId) : 0;
        this.canvas.updateCollapseButton(nodeId, children.length > 0, node.collapsed || false, hiddenCount);
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
                mimeType: mimeType,
            });

            this.graph.addNode(imageNode);

            // Create edge from parent
            const edge = createEdge(parentNodeId, imageNode.id, EdgeType.HIGHLIGHT);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, parentNode.position, imageNode.position);

            // Select the new image node
            this.canvas.clearSelection();
            this.canvas.selectNode(imageNode.id);

            // Pan to the new node
            this.canvas.centerOnAnimated(imageNode.position.x + 160, imageNode.position.y + 100, 300);

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
            img.crossOrigin = 'anonymous'; // Try to avoid CORS issues

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
        return this.researchFeature.handleResearch(instructions, context);
    }

    /**
     * Handle /factcheck slash command - verify claims with web search
     * @param {string} input - The user's input (claim or vague reference)
     * @param {string} context - Optional context from selected nodes
     */
    async handleFactcheck(input, context = null) {
        return this.factcheckFeature.handleFactcheck(input, context);
    }

    // =========================================================================
    // Committee Feature (delegated to CommitteeFeature module)
    // =========================================================================

    /**
     * Handle /committee slash command - show modal to configure LLM committee.
     * Delegates to the committee feature plugin via FeatureRegistry.
     * @param {string} question - The question to ask the committee
     * @param {string|null} context - Optional context text
     */
    async handleCommittee(question, context = null) {
        const feature = this.featureRegistry.getFeature('committee');
        if (feature) {
            return feature.handleCommittee('/committee', question, { text: context });
        }
        // Fallback to old pattern if plugin system not initialized
        return this.committeeFeature.handleCommittee('/committee', question, { text: context });
    }

    /**
     * Get display name for a model ID.
     * @param {string} modelId - The model ID
     * @returns {string} - Display name for the model
     */
    getModelDisplayName(modelId) {
        return this.committeeFeature.getModelDisplayName(modelId);
    }

    // --- CSV/Code Execution Methods ---

    /**
     * Handle /code slash command - creates a Code node, optionally with AI-generated code
     * @param {string} description - Optional prompt for AI code generation
     */
    async handleCode(description) {
        const selectedIds = this.canvas.getSelectedNodeIds();
        const csvNodeIds = selectedIds.filter((id) => {
            const node = this.graph.getNode(id);
            return node && node.type === NodeType.CSV;
        });

        // Determine position based on all selected nodes
        const position = selectedIds.length > 0 ? this.graph.autoPosition(selectedIds) : this.graph.autoPosition([]);

        // Create code node with placeholder if we're generating, or template if not
        let initialCode;
        const hasPrompt = description && description.trim();

        if (hasPrompt) {
            // AI generation - start with placeholder
            initialCode = '# Generating code...\n';
        } else if (csvNodeIds.length > 0) {
            // Template with CSV context
            const csvNames = csvNodeIds.map((_id, i) => (csvNodeIds.length === 1 ? 'df' : `df${i + 1}`));
            initialCode = `# Available DataFrames: ${csvNames.join(', ')}
# Analyze the data

import pandas as pd

# Example: Display first few rows
${csvNames[0]}.head()
`;
        } else {
            // Standalone template
            initialCode = `# Python code

import numpy as np

# Your code here
print("Hello from Pyodide!")
`;
        }

        const codeNode = createNode(NodeType.CODE, initialCode, {
            position,
            csvNodeIds: csvNodeIds, // Empty array if no CSVs
        });

        this.graph.addNode(codeNode);

        // Create edges from all selected nodes to code node
        for (const nodeId of selectedIds) {
            const edge = createEdge(nodeId, codeNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        this.canvas.renderNode(codeNode);
        this.canvas.updateAllEdges(this.graph);
        this.canvas.updateAllNavButtonStates(this.graph);
        this.canvas.panToNodeAnimated(codeNode.id);
        this.saveSession();

        // Preload Pyodide in the background so it's ready when user clicks Run
        pyodideRunner.preload();

        // If description provided, trigger AI generation
        if (hasPrompt) {
            // Use the currently selected model
            const model = this.modelPicker.value;
            await this.handleNodeGenerateSubmit(codeNode.id, description.trim(), model);
        }
    }

    /**
     * Handle Analyze button click on CSV node - creates a Code node for that CSV
     * @param {string} nodeId - The CSV node ID
     */
    async handleNodeAnalyze(nodeId) {
        const csvNode = this.graph.getNode(nodeId);
        if (!csvNode || csvNode.type !== NodeType.CSV) return;

        // Create code node with starter template
        const starterCode = `# Analyzing: ${csvNode.title || 'CSV data'}
import pandas as pd

# DataFrame is pre-loaded as 'df'
df.head()
`;

        const position = this.graph.autoPosition([nodeId]);

        const codeNode = createNode(NodeType.CODE, starterCode, {
            position,
            csvNodeIds: [nodeId], // Link to source CSV node
        });

        this.graph.addNode(codeNode);

        // Create edge from CSV to code node
        const edge = createEdge(nodeId, codeNode.id, EdgeType.GENERATES);
        this.graph.addEdge(edge);

        this.canvas.renderNode(codeNode);
        this.canvas.updateAllEdges(this.graph);
        this.canvas.updateAllNavButtonStates(this.graph);
        this.canvas.panToNodeAnimated(codeNode.id);
        this.saveSession();

        // Preload Pyodide in the background so it's ready when user clicks Run
        pyodideRunner.preload();
    }

    /**
     * Handle Run button click on Code node - executes Python with Pyodide
     * @param {string} nodeId - The Code node ID
     */
    async handleNodeRunCode(nodeId) {
        const codeNode = this.graph.getNode(nodeId);
        if (!codeNode || codeNode.type !== NodeType.CODE) return;

        // Get code from node (stored via modal editor or AI generation)
        const code = codeNode.code || codeNode.content || '';

        console.log('🏃 Running code, length:', code.length, 'chars');

        const csvNodeIds = codeNode.csvNodeIds || [];

        // Build csvDataMap from linked CSV nodes
        const csvDataMap = {};
        csvNodeIds.forEach((csvId, index) => {
            const csvNode = this.graph.getNode(csvId);
            if (csvNode && csvNode.csvData) {
                const varName = csvNodeIds.length === 1 ? 'df' : `df${index + 1}`;
                csvDataMap[varName] = csvNode.csvData;
            }
        });

        // Set execution state to 'running' and re-render the node
        // (CodeNode.renderContent() handles showing the "Running..." indicator)
        this.graph.updateNode(nodeId, {
            executionState: 'running',
            lastError: null,
            installProgress: [], // Track installation messages
            outputExpanded: false, // Start collapsed
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));

        // Collect installation progress messages
        const installMessages = [];
        let drawerOpenedForInstall = false;

        const onInstallProgress = (msg) => {
            installMessages.push(msg);

            // On first message, expand drawer with animation
            if (!drawerOpenedForInstall) {
                this.graph.updateNode(nodeId, {
                    installProgress: [...installMessages],
                    outputExpanded: true, // Expand it
                });
                // Re-render to create drawer in expanded state (will animate automatically)
                this.canvas.renderNode(this.graph.getNode(nodeId));
                drawerOpenedForInstall = true;
            } else {
                // For subsequent messages, just update the content without re-rendering
                this.graph.updateNode(nodeId, {
                    installProgress: [...installMessages],
                });
                const node = this.graph.getNode(nodeId);
                this.canvas.updateOutputPanelContent(nodeId, node);
            }
        };

        try {
            // Run code with Pyodide and installation progress callback
            const result = await pyodideRunner.run(code, csvDataMap, onInstallProgress);

            // Check for Python errors returned from Pyodide
            if (result.error) {
                this.graph.updateNode(nodeId, {
                    executionState: 'error',
                    lastError: result.error,
                    outputStdout: result.stdout?.trim() || null, // May have partial stdout before error
                    outputHtml: null,
                    outputText: null,
                    outputExpanded: true,
                    installProgress: null, // Clear installation progress
                });
                this.canvas.renderNode(this.graph.getNode(nodeId));
                this.saveSession();
                return;
            }

            // Store stdout and result in the node for inline display
            const stdout = result.stdout?.trim() || null;
            const resultHtml = result.resultHtml || null;
            const resultText = result.resultText || null;

            // Only auto-expand if there's actual output to show
            const hasOutput = !!(stdout || resultHtml || resultText);

            // Update node with output for inline drawer display
            // Keep drawer open if it was opened for installation, or open it if there's output
            // Keep installProgress to preserve drawer, but mark as complete
            this.graph.updateNode(nodeId, {
                executionState: 'idle',
                lastError: null,
                outputStdout: stdout,
                outputHtml: resultHtml,
                outputText: resultText,
                outputExpanded: drawerOpenedForInstall || hasOutput, // Keep open if installation opened it, or if there's output
                installProgress: drawerOpenedForInstall ? installMessages : null, // Keep messages if drawer was opened
                installComplete: drawerOpenedForInstall, // Mark installation as complete
            });

            // Create child nodes only for figures (they need visual space)
            if (result.figures && result.figures.length > 0) {
                for (let i = 0; i < result.figures.length; i++) {
                    const dataUrl = result.figures[i];
                    // dataUrl is already "data:image/png;base64,..." from pyodide-runner
                    // Extract just the base64 part for ImageNode
                    const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (base64Match) {
                        const position = this.graph.autoPosition([nodeId]);
                        const outputNode = createNode(NodeType.IMAGE, '', {
                            position,
                            title: result.figures.length === 1 ? 'Figure' : `Figure ${i + 1}`,
                            imageData: base64Match[2],
                            mimeType: base64Match[1],
                        });

                        this.graph.addNode(outputNode);
                        const edge = createEdge(nodeId, outputNode.id, EdgeType.GENERATES);
                        this.graph.addEdge(edge);
                        this.canvas.renderNode(outputNode);
                    }
                }
            }

            // Re-render code node to clear "Running..." and show output drawer
            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.canvas.updateAllEdges(this.graph);
            this.canvas.updateAllNavButtonStates(this.graph);
            this.saveSession();
        } catch (error) {
            // Show error in the inline drawer (not as child node)
            this.graph.updateNode(nodeId, {
                executionState: 'error',
                lastError: error.message,
                outputStdout: null,
                outputHtml: null,
                outputText: null,
                outputExpanded: true,
                installProgress: null, // Clear installation progress
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.saveSession();
        }
    }

    /**
     * Handle code content changes from Code node textarea
     * @param {string} nodeId - The Code node ID
     * @param {string} code - The new code content
     */
    handleNodeCodeChange(nodeId, code) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        this.graph.updateNode(nodeId, { content: code });
        this.saveSession();
    }

    /**
     * Handle Generate button click on Code node - shows AI generation input
     * @param {string} nodeId - The Code node ID
     */
    handleNodeGenerate(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        // Get available models for dropdown
        const models = chat.models || [];
        const currentModel = this.modelPicker.value;
        this.canvas.showGenerateInput(nodeId, models, currentModel);
    }

    /**
     * Handle AI code generation submission
     * @param {string} nodeId - The Code node ID
     * @param {string} prompt - User's natural language description
     * @param {string} model - Selected model ID
     */
    async handleNodeGenerateSubmit(nodeId, prompt, model) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        // Hide the generate input
        this.canvas.hideGenerateInput(nodeId);

        try {
            // Gather context for code generation
            const context = await this.gatherCodeGenerationContext(nodeId);

            // Set placeholder code to signal generation in progress
            const placeholderCode = '# Generating code...\n';
            this.canvas.updateCodeContent(nodeId, placeholderCode, true);
            this.graph.updateNode(nodeId, { content: placeholderCode });

            // Show stop button
            this.canvas.showStopButton(nodeId);

            // Create AbortController for this stream
            const abortController = new AbortController();
            this.streamingNodes.set(nodeId, {
                abortController,
                context: { prompt, model, nodeContext: context },
            });

            // Build request body using centralized helper
            const requestBody = this.buildLLMRequest({
                prompt,
                existing_code: context.existingCode,
                dataframe_info: context.dataframeInfo,
                context: context.ancestorContext,
            });

            // Log DataFrame info for debugging
            if (context.dataframeInfo && context.dataframeInfo.length > 0) {
                console.log('📊 DataFrame info being sent to AI:', context.dataframeInfo);
            }

            // Stream code generation
            const response = await fetch(apiUrl('/api/generate-code'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            let generatedCode = '';
            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'message' && data) {
                        generatedCode += data;
                        this.canvas.updateCodeContent(nodeId, generatedCode, true);
                    }
                },
                onDone: async () => {
                    // Clean up streaming state
                    this.streamingNodes.delete(nodeId);
                    this.canvas.hideStopButton(nodeId);

                    // Final update ensures editor has final content
                    this.canvas.updateCodeContent(nodeId, generatedCode, false);
                    this.graph.updateNode(nodeId, { content: generatedCode, code: generatedCode });
                    this.saveSession();

                    // Self-healing: Auto-run and fix errors (max 3 attempts)
                    await this.selfHealCode(nodeId, prompt, model, context, 1);
                },
                onError: (err) => {
                    throw err;
                },
            });
        } catch (error) {
            // Clean up on error
            this.streamingNodes.delete(nodeId);
            this.canvas.hideStopButton(nodeId);

            // Check if it was aborted (user clicked stop)
            if (error.name === 'AbortError') {
                // Leave partial code in place
                return;
            }

            // Show error
            console.error('Code generation failed:', error);
            const errorCode = `# Code generation failed: ${error.message}\n`;
            this.canvas.updateCodeContent(nodeId, errorCode, false);
            this.graph.updateNode(nodeId, { content: errorCode });
            this.saveSession();
        }
    }

    /**
     * Gather context for AI code generation
     * @param {string} nodeId - The Code node ID
     * @returns {Promise<Object>} Context object with dataframeInfo, ancestorContext, existingCode
     */
    async gatherCodeGenerationContext(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return { dataframeInfo: [], ancestorContext: [], existingCode: '' };

        // Get existing code (if any, and not the placeholder)
        const existingCode = node.content && !node.content.includes('# Generating') ? node.content : '';

        // Get DataFrame metadata (cached on node, or introspect now)
        let dataframeInfo = node.dataframeMetadata || [];
        if (dataframeInfo.length === 0) {
            // Introspect DataFrames from linked CSV nodes
            const csvNodeIds = node.csvNodeIds || [];
            if (csvNodeIds.length > 0) {
                const csvDataMap = {};
                csvNodeIds.forEach((csvId, index) => {
                    const csvNode = this.graph.getNode(csvId);
                    if (csvNode && csvNode.csvData) {
                        const varName = csvNodeIds.length === 1 ? 'df' : `df${index + 1}`;
                        csvDataMap[varName] = csvNode.csvData;
                    }
                });

                // Run introspection
                dataframeInfo = await pyodideRunner.introspectDataFrames(csvDataMap);

                console.log('📊 DataFrame introspection results:', dataframeInfo);

                // Cache on node for future generations
                this.graph.updateNode(nodeId, { dataframeMetadata: dataframeInfo });
            }
        }

        // Get ancestor context (conversation history)
        const ancestors = this.graph.getAncestors(nodeId);
        const ancestorContext = ancestors
            .filter((n) => [NodeType.HUMAN, NodeType.AI, NodeType.NOTE, NodeType.PDF].includes(n.type))
            .map((n) => ({
                role: [NodeType.HUMAN, NodeType.PDF].includes(n.type) ? 'user' : 'assistant',
                content: n.content,
            }));

        return { dataframeInfo, ancestorContext, existingCode };
    }

    /**
     * Self-healing loop: Auto-run code and fix errors iteratively
     * @param {string} nodeId - The Code node ID
     * @param {string} originalPrompt - The original user prompt
     * @param {string} model - Model to use for fixes
     * @param {Object} context - Code generation context (dataframeInfo, ancestorContext)
     * @param {number} attemptNum - Current attempt number (1-indexed)
     * @param {number} maxAttempts - Maximum retry attempts (default: 3)
     */
    async selfHealCode(nodeId, originalPrompt, model, context, attemptNum = 1, maxAttempts = 3) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        // Get the current code
        const code = node.code || node.content || '';
        if (!code || code.includes('# Generating')) return;

        console.log(`🔧 Self-healing attempt ${attemptNum}/${maxAttempts}...`);

        // Emit before:selfheal hook
        const beforeEvent = new CancellableEvent('selfheal:before', {
            nodeId,
            code,
            attemptNum,
            maxAttempts,
            originalPrompt,
            model,
            context,
        });
        this.featureRegistry.emit('selfheal:before', beforeEvent);

        // Check if plugin prevented self-healing
        if (beforeEvent.defaultPrevented) {
            console.log('[Self-healing] Prevented by plugin');
            return;
        }

        // Update node to show self-healing status
        this.graph.updateNode(nodeId, {
            selfHealingAttempt: attemptNum,
            selfHealingStatus: attemptNum === 1 ? 'verifying' : 'fixing',
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));

        // Run the code
        const csvNodeIds = node.csvNodeIds || [];
        const csvDataMap = {};
        csvNodeIds.forEach((csvId, index) => {
            const csvNode = this.graph.getNode(csvId);
            if (csvNode && csvNode.csvData) {
                const varName = csvNodeIds.length === 1 ? 'df' : `df${index + 1}`;
                csvDataMap[varName] = csvNode.csvData;
            }
        });

        // Set execution state
        this.graph.updateNode(nodeId, {
            executionState: 'running',
            lastError: null,
            installProgress: [],
            outputExpanded: false,
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));

        const installMessages = [];
        let drawerOpenedForInstall = false;

        const onInstallProgress = (msg) => {
            installMessages.push(msg);
            if (!drawerOpenedForInstall) {
                this.graph.updateNode(nodeId, {
                    installProgress: [...installMessages],
                    outputExpanded: true,
                });
                this.canvas.renderNode(this.graph.getNode(nodeId));
                drawerOpenedForInstall = true;
            } else {
                this.graph.updateNode(nodeId, {
                    installProgress: [...installMessages],
                });
                const updatedNode = this.graph.getNode(nodeId);
                this.canvas.updateOutputPanelContent(nodeId, updatedNode);
            }
        };

        try {
            const result = await pyodideRunner.run(code, csvDataMap, onInstallProgress);

            // Check for errors
            if (result.error) {
                console.log(`❌ Error on attempt ${attemptNum}:`, result.error);

                // Emit selfheal:error hook
                this.featureRegistry.emit(
                    'selfheal:error',
                    new CancellableEvent('selfheal:error', {
                        nodeId,
                        code,
                        error: result.error,
                        attemptNum,
                        maxAttempts,
                        originalPrompt,
                        model,
                        context,
                    })
                );

                // If we've exhausted retries, show final error
                if (attemptNum >= maxAttempts) {
                    console.log(`🛑 Max retries (${maxAttempts}) exceeded. Giving up.`);

                    // Emit selfheal:failed hook
                    this.featureRegistry.emit(
                        'selfheal:failed',
                        new CancellableEvent('selfheal:failed', {
                            nodeId,
                            code,
                            error: result.error,
                            attemptNum,
                            maxAttempts,
                            originalPrompt,
                            model,
                        })
                    );

                    this.graph.updateNode(nodeId, {
                        executionState: 'error',
                        lastError: result.error,
                        outputStdout: result.stdout?.trim() || null,
                        outputHtml: null,
                        outputText: null,
                        outputExpanded: true,
                        installProgress: null,
                        selfHealingAttempt: null,
                        selfHealingStatus: 'failed',
                    });
                    this.canvas.renderNode(this.graph.getNode(nodeId));
                    this.saveSession();
                    return;
                }

                // Otherwise, ask LLM to fix the error
                await this.fixCodeError(
                    nodeId,
                    originalPrompt,
                    model,
                    context,
                    code,
                    result.error,
                    attemptNum,
                    maxAttempts
                );
                return;
            }

            // Success! Store output and clear self-healing status
            console.log(`✅ Code executed successfully on attempt ${attemptNum}`);

            // Emit selfheal:success hook
            this.featureRegistry.emit(
                'selfheal:success',
                new CancellableEvent('selfheal:success', {
                    nodeId,
                    code,
                    attemptNum,
                    originalPrompt,
                    model,
                    result,
                })
            );

            const stdout = result.stdout?.trim() || null;
            const resultHtml = result.resultHtml || null;
            const resultText = result.resultText || null;
            const hasOutput = !!(stdout || resultHtml || resultText);

            this.graph.updateNode(nodeId, {
                executionState: 'idle',
                lastError: null,
                outputStdout: stdout,
                outputHtml: resultHtml,
                outputText: resultText,
                outputExpanded: drawerOpenedForInstall || hasOutput,
                installProgress: drawerOpenedForInstall ? installMessages : null,
                installComplete: drawerOpenedForInstall,
                selfHealingAttempt: null,
                selfHealingStatus: attemptNum > 1 ? 'fixed' : null, // Show "fixed" badge if we recovered from error
            });

            // Create child nodes for figures
            if (result.figures && result.figures.length > 0) {
                for (let i = 0; i < result.figures.length; i++) {
                    const dataUrl = result.figures[i];
                    const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (base64Match) {
                        const position = this.graph.autoPosition([nodeId]);
                        const outputNode = createNode(NodeType.IMAGE, '', {
                            position,
                            title: result.figures.length === 1 ? 'Figure' : `Figure ${i + 1}`,
                            imageData: base64Match[2],
                            mimeType: base64Match[1],
                        });

                        this.graph.addNode(outputNode);
                        const edge = createEdge(nodeId, outputNode.id, EdgeType.GENERATES);
                        this.graph.addEdge(edge);
                        this.canvas.renderNode(outputNode);
                    }
                }
            }

            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.canvas.updateAllEdges(this.graph);
            this.canvas.updateAllNavButtonStates(this.graph);
            this.saveSession();

            // Auto-clear success badge after 5 seconds
            if (attemptNum > 1) {
                setTimeout(() => {
                    const currentNode = this.graph.getNode(nodeId);
                    if (currentNode && currentNode.selfHealingStatus === 'fixed') {
                        this.graph.updateNode(nodeId, { selfHealingStatus: null });
                        this.canvas.renderNode(this.graph.getNode(nodeId));
                        this.saveSession();
                    }
                }, 5000);
            }
        } catch (error) {
            // Show error
            console.error('Self-healing execution error:', error);
            this.graph.updateNode(nodeId, {
                executionState: 'error',
                lastError: error.message,
                outputStdout: null,
                outputHtml: null,
                outputText: null,
                outputExpanded: true,
                installProgress: null,
                selfHealingAttempt: null,
                selfHealingStatus: 'failed',
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.saveSession();
        }
    }

    /**
     * Ask LLM to fix code errors and regenerate
     * @param {string} nodeId - The Code node ID
     * @param {string} originalPrompt - The original user prompt
     * @param {string} model - Model to use for fixes
     * @param {Object} context - Code generation context
     * @param {string} failedCode - The code that failed
     * @param {string} errorMessage - The error message from execution
     * @param {number} attemptNum - Current attempt number
     * @param {number} maxAttempts - Maximum retry attempts
     */
    async fixCodeError(nodeId, originalPrompt, model, context, failedCode, errorMessage, attemptNum, maxAttempts) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        console.log(`🩹 Asking LLM to fix error...`);

        // Build fix prompt
        let fixPrompt = `The previous code failed with this error:

\`\`\`
${errorMessage}
\`\`\`

Failed code:
\`\`\`python
${failedCode}
\`\`\`

Please fix the error and provide corrected Python code that accomplishes the original task: "${originalPrompt}"

Output ONLY the corrected Python code, no explanations.`;

        // Emit selfheal:fix hook to allow plugins to customize fix strategy
        const fixEvent = new CancellableEvent('selfheal:fix', {
            nodeId,
            failedCode,
            errorMessage,
            originalPrompt,
            model,
            context,
            attemptNum,
            maxAttempts,
            fixPrompt,
            customFixPrompt: null, // Plugins can set this
        });
        this.featureRegistry.emit('selfheal:fix', fixEvent);

        // Use custom fix prompt if plugin provided one
        if (fixEvent.defaultPrevented && fixEvent.data.customFixPrompt) {
            console.log('[Self-healing] Using custom fix strategy from plugin');
            fixPrompt = fixEvent.data.customFixPrompt;
        }

        try {
            // Show placeholder
            const placeholderCode = `# Fixing error (attempt ${attemptNum + 1}/${maxAttempts})...\n`;
            this.canvas.updateCodeContent(nodeId, placeholderCode, true);
            this.graph.updateNode(nodeId, {
                content: placeholderCode,
                executionState: 'idle', // Clear running state
                selfHealingStatus: 'fixing',
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));

            // Show stop button
            this.canvas.showStopButton(nodeId);

            // Create AbortController
            const abortController = new AbortController();
            this.streamingNodes.set(nodeId, {
                abortController,
                context: { originalPrompt, model, nodeContext: context },
            });

            // Build request body
            const requestBody = this.buildLLMRequest({
                prompt: fixPrompt,
                existing_code: '', // Don't send failed code again in existing_code field
                dataframe_info: context.dataframeInfo,
                context: context.ancestorContext,
            });

            // Stream fixed code
            const response = await fetch(apiUrl('/api/generate-code'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            let fixedCode = '';
            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'message' && data) {
                        fixedCode += data;
                        this.canvas.updateCodeContent(nodeId, fixedCode, true);
                    }
                },
                onDone: async () => {
                    // Clean up streaming state
                    this.streamingNodes.delete(nodeId);
                    this.canvas.hideStopButton(nodeId);

                    // Final update
                    this.canvas.updateCodeContent(nodeId, fixedCode, false);
                    this.graph.updateNode(nodeId, { content: fixedCode, code: fixedCode });
                    this.saveSession();

                    // Retry with fixed code
                    await this.selfHealCode(nodeId, originalPrompt, model, context, attemptNum + 1, maxAttempts);
                },
                onError: (err) => {
                    throw err;
                },
            });
        } catch (error) {
            // Clean up on error
            this.streamingNodes.delete(nodeId);
            this.canvas.hideStopButton(nodeId);

            // Check if it was aborted
            if (error.name === 'AbortError') {
                return;
            }

            // Show error
            console.error('Code fix generation failed:', error);
            const errorCode = `# Code fix generation failed: ${error.message}\n`;
            this.canvas.updateCodeContent(nodeId, errorCode, false);
            this.graph.updateNode(nodeId, {
                content: errorCode,
                selfHealingStatus: 'failed',
            });
            this.saveSession();
        }
    }

    /**
     * Handle output drawer toggle (expand/collapse) with animation
     * @param {string} nodeId - The Code node ID
     */
    handleNodeOutputToggle(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        const currentExpanded = node.outputExpanded !== false;
        const newExpanded = !currentExpanded;

        // Animate the panel
        this.canvas.animateOutputPanel(nodeId, newExpanded, () => {
            // After animation completes, update state and toggle button (no full re-render)
            this.graph.updateNode(nodeId, { outputExpanded: newExpanded });
            this.canvas.updateOutputToggleButton(nodeId, newExpanded);
        });
        this.saveSession();
        this.updateEmptyState();
    }

    /**
     * Initialize the plugin system and register built-in features.
     * Called during app initialization after graph and session are ready.
     */
    async initializePluginSystem() {
        // Create AppContext for dependency injection
        const appContext = new AppContext(this);
        this.featureRegistry.setAppContext(appContext);

        // Register built-in features as plugins
        await this.featureRegistry.register({
            id: 'committee',
            feature: CommitteeFeature,
            slashCommands: [
                {
                    command: '/committee',
                    handler: 'handleCommittee',
                },
            ],
            priority: PRIORITY.BUILTIN,
        });

        // Register flashcard feature (no slash commands, event-driven)
        await this.featureRegistry.register({
            id: 'flashcards',
            feature: FlashcardFeature,
            slashCommands: [],
            priority: PRIORITY.BUILTIN,
        });

        // Register matrix feature with /matrix slash command
        await this.featureRegistry.register({
            id: 'matrix',
            feature: MatrixFeature,
            slashCommands: [
                {
                    command: '/matrix',
                    handler: 'handleMatrix',
                },
            ],
            priority: PRIORITY.BUILTIN,
        });

        // Register factcheck feature with /factcheck slash command
        await this.featureRegistry.register({
            id: 'factcheck',
            feature: FactcheckFeature,
            slashCommands: [
                {
                    command: '/factcheck',
                    handler: 'handleFactcheck',
                },
            ],
            priority: PRIORITY.BUILTIN,
        });

        console.log('[App] Plugin system initialized');
    }

    /**
     * Handle output clear button click
     * @param {string} nodeId - The Code node ID
     */
    handleNodeOutputClear(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        this.graph.updateNode(nodeId, {
            outputStdout: null,
            outputHtml: null,
            outputText: null,
            lastError: null,
            executionState: 'idle',
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));
        this.saveSession();
    }

    /**
     * Handle output panel resize
     * @param {string} nodeId - The Code node ID
     * @param {number} height - The new panel height
     */
    handleNodeOutputResize(nodeId, height) {
        const node = this.graph.getNode(nodeId);
        if (!node || node.type !== NodeType.CODE) return;

        this.graph.updateNode(nodeId, { outputPanelHeight: height });
        this.saveSession();
    }

    // --- Matrix Feature Wrappers ---
    // Matrix feature is implemented in matrix.js with MatrixFeature class

    async handleMatrix(matrixContext) {
        return this.matrixFeature.handleMatrix(matrixContext);
    }

    async handleMatrixCellFill(nodeId, row, col, abortController = null) {
        return this.matrixFeature.handleMatrixCellFill(nodeId, row, col, abortController);
    }

    handleMatrixCellView(nodeId, row, col) {
        return this.matrixFeature.handleMatrixCellView(nodeId, row, col);
    }

    async handleMatrixFillAll(nodeId) {
        return this.matrixFeature.handleMatrixFillAll(nodeId);
    }

    handleMatrixEdit(nodeId) {
        return this.matrixFeature.handleMatrixEdit(nodeId);
    }

    handleMatrixIndexColResize(nodeId, width) {
        return this.matrixFeature.handleMatrixIndexColResize(nodeId, width);
    }

    handleMatrixRowExtract(nodeId, rowIndex) {
        return this.matrixFeature.handleMatrixRowExtract(nodeId, rowIndex);
    }

    handleMatrixColExtract(nodeId, colIndex) {
        return this.matrixFeature.handleMatrixColExtract(nodeId, colIndex);
    }

    truncate(text, maxLength) {
        return truncateText(text, maxLength);
    }

    escapeHtml(text) {
        return escapeHtmlText(text);
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
        // Use custom edge update callback to respect collapse state
        this.canvas.animateToLayout(this.graph, {
            duration: 500,
            keepViewport: true,
            onEdgeUpdate: () => this.updateEdgesWithCollapseState(),
        });

        // Save the new positions
        this.saveSession();
    }

    /**
     * Update all edges respecting collapse state.
     * This is used during animations to keep edges properly hidden/visible.
     * Always updates edge positions (even hidden ones) so they're correct when revealed.
     */
    updateEdgesWithCollapseState() {
        // Update ALL real edges - always update positions, but toggle visibility
        for (const edge of this.graph.getAllEdges()) {
            const sourceNode = this.graph.getNode(edge.source);
            const targetNode = this.graph.getNode(edge.target);

            if (!sourceNode || !targetNode) continue;

            // Always update edge position
            const sourceWrapper = this.canvas.nodeElements.get(edge.source);
            const targetWrapper = this.canvas.nodeElements.get(edge.target);

            if (sourceWrapper && targetWrapper) {
                const sourcePos = {
                    x: parseFloat(sourceWrapper.getAttribute('x')),
                    y: parseFloat(sourceWrapper.getAttribute('y')),
                };
                const targetPos = {
                    x: parseFloat(targetWrapper.getAttribute('x')),
                    y: parseFloat(targetWrapper.getAttribute('y')),
                };
                this.canvas.renderEdge(edge, sourcePos, targetPos);
            }

            // Then set visibility based on collapse state
            const sourceVisible = this.graph.isNodeVisible(edge.source);
            const targetVisible = this.graph.isNodeVisible(edge.target);

            if (sourceVisible && targetVisible) {
                this.canvas.updateEdgeState(edge.id, 'visible');
            } else {
                this.canvas.updateEdgeState(edge.id, 'hidden');
            }
        }

        // Update virtual collapsed-path edges (renderCollapsedPathEdge updates in place if exists)
        for (const node of this.graph.getAllNodes()) {
            if (node.collapsed && this.graph.isNodeVisible(node.id)) {
                const visibleDescendants = this.graph.getVisibleDescendantsThroughHidden(node.id);

                for (const descendant of visibleDescendants) {
                    // Get current animated positions from DOM
                    const sourceWrapper = this.canvas.nodeElements.get(node.id);
                    const targetWrapper = this.canvas.nodeElements.get(descendant.id);

                    if (sourceWrapper && targetWrapper) {
                        const sourcePos = {
                            x: parseFloat(sourceWrapper.getAttribute('x')),
                            y: parseFloat(sourceWrapper.getAttribute('y')),
                        };
                        const targetPos = {
                            x: parseFloat(targetWrapper.getAttribute('x')),
                            y: parseFloat(targetWrapper.getAttribute('y')),
                        };
                        this.canvas.renderCollapsedPathEdge(node.id, descendant.id, sourcePos, targetPos);
                    }
                }
            }
        }
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
                    x: viewportCenter.x + 50, // Slight offset from center
                    y: viewportCenter.y - 100, // Above center for visibility
                },
            });

            this.graph.addNode(highlightNode);

            // Create highlight edge (dashed connection)
            const edge = createEdge(nodeId, highlightNode.id, EdgeType.HIGHLIGHT);
            this.graph.addEdge(edge);
            this.canvas.renderEdge(edge, sourceNode.position, highlightNode.position);

            // Update collapse button for source node (now has children)
            this.updateCollapseButtonForNode(nodeId);

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
                    position: this.graph.autoPosition([highlightNode.id]),
                });

                this.graph.addNode(humanNode);

                // Edge from highlight to user message
                const humanEdge = createEdge(highlightNode.id, humanNode.id, EdgeType.REPLY);
                this.graph.addEdge(humanEdge);
                this.canvas.renderEdge(humanEdge, highlightNode.position, humanNode.position);

                // Update collapse button for highlight node (now has children)
                this.updateCollapseButtonForNode(highlightNode.id);

                this.saveSession();

                // Create AI response node
                const model = this.modelPicker.value;
                const aiNode = createNode(NodeType.AI, '', {
                    position: this.graph.autoPosition([humanNode.id]),
                    model: model.split('/').pop(),
                });

                this.graph.addNode(aiNode);

                const aiEdge = createEdge(humanNode.id, aiNode.id, EdgeType.REPLY);
                this.graph.addEdge(aiEdge);
                this.canvas.renderEdge(aiEdge, humanNode.position, aiNode.position);

                // Update collapse button for human node (now has AI child)
                this.updateCollapseButtonForNode(humanNode.id);

                // Smoothly pan to the AI node
                this.canvas.centerOnAnimated(aiNode.position.x + 160, aiNode.position.y + 100, 300);

                // Build context and stream LLM response
                const context = this.graph.resolveContext([humanNode.id]);
                const messages = buildMessagesForApi(context);

                // Create AbortController for this stream
                const abortController = new AbortController();

                // Track streaming state for stop/continue functionality
                this.streamingNodes.set(aiNode.id, {
                    abortController,
                    context: { messages, model, humanNodeId: humanNode.id },
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
                            humanNodeId: humanNode.id,
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
        const parentNode = this.graph.getNode(nodeId);

        // Get context up to this node (includes the node itself and all ancestors)
        const context = this.graph.resolveContext([nodeId]);

        if (context.length < 1) {
            alert('No content to summarize');
            return;
        }

        const messages = buildMessagesForApi(context);

        // Create summary node
        const summaryNode = createNode(NodeType.SUMMARY, 'Generating summary...', {
            position: {
                x: parentNode.position.x + 400,
                y: parentNode.position.y,
            },
        });

        this.graph.addNode(summaryNode);

        const edge = createEdge(nodeId, summaryNode.id, EdgeType.REFERENCE);
        this.graph.addEdge(edge);
        this.canvas.renderEdge(edge, parentNode.position, summaryNode.position);

        // Update collapse button for parent node (now has children)
        this.updateCollapseButtonForNode(nodeId);

        try {
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

        // Check which content fetching method to use
        const hasExa = storage.hasExaApiKey();
        const exaKey = hasExa ? storage.getExaApiKey() : null;

        const model = this.modelPicker.value;

        // Create FETCH_RESULT node for the raw fetched content
        const fetchResultNode = createNode(NodeType.FETCH_RESULT, 'Fetching content...', {
            position: {
                x: node.position.x + 450,
                y: node.position.y,
            },
        });

        this.graph.addNode(fetchResultNode);

        const fetchEdge = createEdge(nodeId, fetchResultNode.id, EdgeType.REFERENCE);
        this.graph.addEdge(fetchEdge);
        this.canvas.renderEdge(fetchEdge, node.position, fetchResultNode.position);

        // Update collapse button for source node (now has children)
        this.updateCollapseButtonForNode(nodeId);

        // Smoothly pan to the fetch result node
        this.canvas.centerOnAnimated(fetchResultNode.position.x + 200, fetchResultNode.position.y + 100, 300);

        try {
            // Fetch content from URL via Exa or fallback to direct fetch
            this.canvas.updateNodeContent(fetchResultNode.id, 'Fetching content from URL...', true);

            let contentData;
            if (hasExa) {
                // Use Exa's content extraction API
                const response = await fetch(apiUrl('/api/exa/get-contents'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: url,
                        api_key: exaKey,
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to fetch content');
                }

                contentData = await response.json();
                // Normalize response format
                contentData = {
                    title: contentData.title,
                    content: contentData.text,
                };
            } else {
                // Use free Jina/direct fetch fallback
                const response = await fetch(apiUrl('/api/fetch-url'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to fetch content');
                }

                contentData = await response.json();
                // Response already has title and content fields
            }

            if (!contentData.content || contentData.content.trim().length === 0) {
                throw new Error('No text content found at this URL');
            }

            // Update the FETCH_RESULT node with the raw content
            const fetchedContent = `**[${contentData.title}](${url})**\n\n${contentData.content}`;
            this.canvas.updateNodeContent(fetchResultNode.id, fetchedContent, false);
            this.graph.updateNode(fetchResultNode.id, {
                content: fetchedContent,
                versions: [
                    {
                        content: fetchedContent,
                        timestamp: Date.now(),
                        reason: 'fetched',
                    },
                ],
            });

            // Create SUMMARY node for the AI summary
            const summaryNode = createNode(NodeType.SUMMARY, 'Summarizing content...', {
                position: {
                    x: fetchResultNode.position.x + 450,
                    y: fetchResultNode.position.y,
                },
            });

            this.graph.addNode(summaryNode);

            const summaryEdge = createEdge(fetchResultNode.id, summaryNode.id, EdgeType.REFERENCE);
            this.graph.addEdge(summaryEdge);
            this.canvas.renderEdge(summaryEdge, fetchResultNode.position, summaryNode.position);

            // Update collapse button for fetch result node (now has children)
            this.updateCollapseButtonForNode(fetchResultNode.id);

            // Smoothly pan to the summary node
            this.canvas.centerOnAnimated(summaryNode.position.x + 200, summaryNode.position.y + 100, 300);

            // Now summarize the content with LLM
            const messages = [
                {
                    role: 'user',
                    content: `Please provide a comprehensive summary of the following article:\n\n**${contentData.title}**\n\n${contentData.content}`,
                },
            ];

            const summary = await chat.summarize(messages, model);

            // Add source attribution
            const fullSummary = `**Summary of: [${contentData.title}](${url})**\n\n${summary}`;

            this.canvas.updateNodeContent(summaryNode.id, fullSummary, false);
            this.graph.updateNode(summaryNode.id, { content: fullSummary });
            this.saveSession();
        } catch (err) {
            this.canvas.updateNodeContent(fetchResultNode.id, `Error: ${err.message}`, false);
            this.graph.updateNode(fetchResultNode.id, { content: `Error: ${err.message}` });
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

        // Clear tag highlighting when clicking on canvas background (no nodes selected)
        if (selectedIds.length === 0 && this.highlightedTagColor) {
            this.canvas.highlightNodesByTag(null);
            this.highlightedTagColor = null;
        }

        // Update tag drawer state
        this.updateTagDrawer();
    }

    handleNodeMove(nodeId, newPos, oldPos) {
        // Only push undo if position actually changed
        if (oldPos && (oldPos.x !== newPos.x || oldPos.y !== newPos.y)) {
            this.undoManager.push({
                type: 'MOVE_NODES',
                moves: [{ nodeId, from: oldPos, to: newPos }],
            });
        }

        this.graph.updateNode(nodeId, { position: newPos });
        this.saveSession();
    }

    /**
     * Handle real-time node dragging (for multiplayer sync).
     * Updates graph position during drag, throttled to avoid network spam.
     */
    handleNodeDrag(nodeId, newPos) {
        // Only sync if multiplayer is enabled
        const status = this.graph.getMultiplayerStatus?.();
        if (!status?.enabled) return;

        // Throttle updates to ~60fps (every 16ms) for smooth experience
        const now = Date.now();
        if (!this._lastDragSync) this._lastDragSync = {};

        if (this._lastDragSync[nodeId] && now - this._lastDragSync[nodeId] < 16) {
            return; // Skip this update, too soon
        }
        this._lastDragSync[nodeId] = now;

        // Update graph position (will sync via CRDT)
        this.graph.updateNode(nodeId, { position: newPos });
    }

    handleNodeResize(nodeId, width, height) {
        this.graph.updateNode(nodeId, { width, height });
        this.saveSession();
    }

    /**
     * Handle real-time node resizing (for multiplayer sync).
     * Updates graph dimensions during resize, throttled to avoid network spam.
     */
    handleNodeResizing(nodeId, width, height) {
        // Only sync if multiplayer is enabled
        const status = this.graph.getMultiplayerStatus?.();
        if (!status?.enabled) return;

        // Throttle updates to ~60fps (every 16ms) for smooth experience
        const now = Date.now();
        if (!this._lastResizeSync) this._lastResizeSync = {};

        if (this._lastResizeSync[nodeId] && now - this._lastResizeSync[nodeId] < 16) {
            return; // Skip this update, too soon
        }
        this._lastResizeSync[nodeId] = now;

        // Update graph dimensions (will sync via CRDT)
        this.graph.updateNode(nodeId, { width, height });
    }

    handleNodeDelete(nodeId) {
        // No confirmation needed - undo (Ctrl+Z) provides recovery

        // Capture node and edges for undo BEFORE deletion
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const deletedNodes = [{ ...node }];
        const deletedEdges = this.graph.edges
            .filter((e) => e.source === nodeId || e.target === nodeId)
            .map((e) => ({ ...e }));

        // Push undo action
        this.undoManager.push({
            type: 'DELETE_NODES',
            nodes: deletedNodes,
            edges: deletedEdges,
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

    // Edit Title Modal methods moved to modal-manager.js

    /**
     * Handle stopping generation for a streaming node (AI nodes or Matrix fill)
     */
    handleNodeStopGeneration(nodeId) {
        // Check if this is a matrix node with active cell fills
        const matrixCellControllers = this.matrixFeature.streamingMatrixCells.get(nodeId);
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
            stopped: true,
        });

        this.saveSession();
    }

    /**
     * Handle continuing generation for a stopped node
     */
    async handleNodeContinueGeneration(nodeId) {
        const node = this.graph.getNode(nodeId);
        const streamingState = this.streamingNodes.get(nodeId);
        if (!node) return;

        // Special case: Research nodes restart the research process
        if (node.type === NodeType.RESEARCH) {
            // Get original instructions and context from streaming state
            const instructions = streamingState?.context?.originalInstructions;
            const context = streamingState?.context?.originalContext || null;

            if (!instructions) {
                // Fallback: try to extract from node content
                const contentMatch = node.content.match(/^\*\*Research(?: \(DDG\))?:\*\* (.+?)(?:\n\n|$)/);
                if (!contentMatch) {
                    console.error('Could not extract instructions from research node');
                    return;
                }
                // Use extracted instructions, but we don't have context
                const extractedInstructions = contentMatch[1].trim();

                // Hide continue button, show stop button
                this.canvas.hideContinueButton(nodeId);
                this.canvas.showStopButton(nodeId);

                // Clear the stopped indicator and restart
                const cleanedContent = node.content
                    .replace(/\n\n\*\[Research stopped\]\*$/, '')
                    .replace(/\n\n\*\[Generation stopped\]\*$/, '');
                this.canvas.updateNodeContent(nodeId, cleanedContent, false);

                // Restart research with extracted instructions (no context) on existing node
                try {
                    await this.researchFeature.handleResearch(extractedInstructions, null, nodeId);
                } catch (err) {
                    console.error('Error continuing research:', err);
                    const errorContent = node.content + `\n\n*Error continuing research: ${err.message}*`;
                    this.canvas.updateNodeContent(nodeId, errorContent, false);
                    this.graph.updateNode(nodeId, { content: errorContent });
                    this.saveSession();
                }
                return;
            }

            // Hide continue button, show stop button
            this.canvas.hideContinueButton(nodeId);
            this.canvas.showStopButton(nodeId);

            // Clear the stopped indicator from content
            const cleanedContent = node.content
                .replace(/\n\n\*\[Research stopped\]\*$/, '')
                .replace(/\n\n\*\[Generation stopped\]\*$/, '');
            this.canvas.updateNodeContent(nodeId, cleanedContent, false);

            // Restart research with same instructions and context on existing node
            try {
                await this.researchFeature.handleResearch(instructions, context, nodeId);
            } catch (err) {
                console.error('Error continuing research:', err);
                const errorContent = node.content + `\n\n*Error continuing research: ${err.message}*`;
                this.canvas.updateNodeContent(nodeId, errorContent, false);
                this.graph.updateNode(nodeId, { content: errorContent });
                this.saveSession();
            }
            return;
        }

        // Regular AI node continue logic
        if (!streamingState?.context) return;

        // Hide continue button, show stop button
        this.canvas.hideContinueButton(nodeId);
        this.canvas.showStopButton(nodeId);

        // Get current content (remove the stopped indicator)
        let currentContent = node.content.replace(/\n\n\*\[Generation stopped\]\*$/, '');

        // Build messages with current partial response
        const messages = [
            ...streamingState.context.messages,
            { role: 'assistant', content: currentContent },
            { role: 'user', content: 'Please continue your response from where you left off.' },
        ];

        // Create new AbortController for the continuation
        const abortController = new AbortController();
        this.streamingNodes.set(nodeId, {
            abortController,
            context: streamingState.context,
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
        try {
            const requestBody = this.buildLLMRequest({
                messages,
                temperature: 0.7,
            });

            const response = await fetch(apiUrl('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            let fullContent = '';

            await readSSEStream(response, {
                onEvent: (eventType, data) => {
                    if (eventType === 'message' && data) {
                        fullContent += data;
                        onChunk(data, fullContent);
                    }
                },
                onDone: () => {
                    onDone(fullContent);
                },
                onError: (err) => {
                    throw err;
                },
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
                context: { messages: retryContext.messages, model: retryContext.model },
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

        // All nodes now have fixed dimensions - get default size for this type
        const defaultSize = getDefaultNodeSize(node.type);
        const defaultWidth = defaultSize.width;
        const defaultHeight = defaultSize.height;

        // Apply new dimensions
        wrapper.setAttribute('width', defaultWidth);
        wrapper.setAttribute('height', defaultHeight);

        // All nodes are scrollable with fixed dimensions
        div.classList.add('viewport-fitted');
        div.style.height = '100%';

        // Update edges
        const x = parseFloat(wrapper.getAttribute('x'));
        const y = parseFloat(wrapper.getAttribute('y'));
        this.canvas.updateEdgesForNode(nodeId, { x, y });

        // Persist dimensions
        this.graph.updateNode(nodeId, {
            width: defaultWidth,
            height: defaultHeight,
        });
        this.saveSession();
    }

    // Edit Content and Code Editor Modal methods moved to modal-manager.js

    /**
     * Handle re-summarizing a FETCH_RESULT node (creates new SUMMARY node)
     */
    async handleNodeResummarize(nodeId) {
        const fetchNode = this.graph.getNode(nodeId);
        if (!fetchNode) return;

        // Get parent reference node for URL context
        const parents = this.graph.getParents(nodeId);
        const refNode = parents.find((p) => p.type === NodeType.REFERENCE);
        const url = refNode?.url || 'the fetched content';

        const model = this.modelPicker.value;

        // Check if we have a valid model (in admin mode, backend handles credentials)
        const request = this.buildLLMRequest({});
        if (!request.model) {
            alert('Please select a model in the toolbar.');
            return;
        }

        // Create new SUMMARY node using createNode for proper defaults
        const summaryNode = createNode(NodeType.SUMMARY, '', {
            position: {
                x: fetchNode.position.x + 50,
                y: fetchNode.position.y + (fetchNode.height || 200) + 50,
            },
            model: model.split('/').pop(),
        });

        this.graph.addNode(summaryNode);
        const edge = createEdge(nodeId, summaryNode.id, EdgeType.REFERENCE);
        this.graph.addEdge(edge);

        this.canvas.renderNode(summaryNode);
        this.canvas.renderEdge(edge, fetchNode.position, summaryNode.position);

        // Pan to new node
        this.canvas.centerOnAnimated(summaryNode.position.x + 200, summaryNode.position.y + 100, 300);

        // Select the new node
        this.canvas.clearSelection();
        this.canvas.selectNode(summaryNode.id);

        // Build messages for summarization
        const messages = [
            { role: 'user', content: `Please summarize the following content from ${url}:\n\n${fetchNode.content}` },
        ];

        // Create AbortController for this stream
        const abortController = new AbortController();

        // Track streaming state
        this.streamingNodes.set(summaryNode.id, {
            abortController,
            context: { messages, model },
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

    // =========================================================================
    // Flashcard Feature (delegated to FlashcardFeature module)
    // =========================================================================

    /**
     * Handle creating flashcards from a content node.
     * @param {string} nodeId - ID of the source node
     */
    async handleCreateFlashcards(nodeId) {
        return this.flashcardFeature.handleCreateFlashcards(nodeId);
    }

    /**
     * Show the flashcard review modal with due cards.
     * @param {string[]} dueCardIds - Array of flashcard node IDs to review
     */
    showReviewModal(dueCardIds) {
        return this.flashcardFeature.showReviewModal(dueCardIds);
    }

    /**
     * Start a review session with all due flashcards.
     */
    startFlashcardReview() {
        return this.flashcardFeature.startFlashcardReview();
    }

    /**
     * Review a single flashcard.
     * @param {string} cardId - Flashcard node ID
     */
    reviewSingleCard(cardId) {
        return this.flashcardFeature.reviewSingleCard(cardId);
    }

    /**
     * Handle flipping a flashcard to show/hide the answer.
     * @param {string} cardId - Flashcard node ID
     */
    handleFlipCard(cardId) {
        return this.flashcardFeature.handleFlipCard(cardId);
    }

    /**
     * Check for due flashcards and show toast notification if any.
     */
    checkDueFlashcardsOnLoad() {
        return this.flashcardFeature.checkDueFlashcardsOnLoad();
    }

    /**
     * Handle voting on a poll option (plugin event)
     */
    handlePollVote(nodeId, optionIndex) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Initialize votes object if it doesn't exist
        if (!node.votes) {
            node.votes = {};
        }

        // Increment vote count for this option
        node.votes[optionIndex] = (node.votes[optionIndex] || 0) + 1;

        // Update graph and re-render
        this.graph.updateNode(nodeId, { votes: node.votes });
        this.canvas.renderNode(node);
        this.saveSession();
    }

    /**
     * Handle adding a new option to a poll (plugin event)
     */
    handlePollAddOption(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        const newOption = prompt('Enter new poll option:');
        if (!newOption || !newOption.trim()) return;

        // Initialize options array if needed
        if (!node.options) {
            node.options = [];
        }

        // Add new option
        node.options.push(newOption.trim());

        // Update graph and re-render
        this.graph.updateNode(nodeId, { options: node.options });
        this.canvas.renderNode(node);
        this.saveSession();
    }

    /**
     * Handle resetting all poll votes (plugin event)
     */
    handlePollResetVotes(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        if (!confirm('Reset all votes for this poll?')) return;

        // Clear all votes
        this.graph.updateNode(nodeId, { votes: {} });
        this.canvas.renderNode(this.graph.getNode(nodeId));
        this.saveSession();
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

        // Extract the excerpted text using the utility function
        const excerptText = extractExcerptText(highlightNode.content);

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
            edges: deletedEdges,
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
        const formatK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n);
        this.budgetText.textContent = `${formatK(tokens)} / ${formatK(contextWindow)}`;
    }

    // --- Session Management ---

    saveSession() {
        // Debounce saves
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(async () => {
            // y-indexeddb handles graph persistence automatically
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
                tags: graphData.tags,
            };
            await storage.saveSession(sessionData);
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
            const humanNodes = nodes.filter((n) => n.type === NodeType.HUMAN);
            const aiNodes = nodes.filter((n) => n.type === NodeType.AI);

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

            const requestBody = this.buildLLMRequest({
                content,
            });

            const response = await fetch(apiUrl('/api/generate-title'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
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
            // Build content string based on node type
            let contentForSummary;
            if (node.type === NodeType.MATRIX) {
                // For matrix, describe the structure
                const filledCells = Object.values(node.cells || {}).filter((c) => c.filled).length;
                const totalCells = (node.rowItems?.length || 0) * (node.colItems?.length || 0);
                contentForSummary =
                    `Matrix evaluation: "${node.context}"\n` +
                    `Rows: ${node.rowItems?.join(', ')}\n` +
                    `Columns: ${node.colItems?.join(', ')}\n` +
                    `Progress: ${filledCells}/${totalCells} cells filled`;
            } else {
                contentForSummary = node.content;
            }

            const requestBody = this.buildLLMRequest({
                content: contentForSummary,
            });

            const response = await fetch(apiUrl('/api/generate-summary'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
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
                        this.modalManager.showSettingsModal();
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
            }, 300); // Match CSS transition
        }, duration);
    }

    // Settings, Help, and Sessions Modal methods moved to modal-manager.js

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

    // =========================================================================
    // Multiplayer
    // =========================================================================

    /**
     * Handle click on multiplayer button.
     * If not in MP mode: enable multiplayer.
     * If in MP mode: copy the share link (don't disable).
     */
    handleMultiplayerClick() {
        const status = this.graph.getMultiplayerStatus?.();

        if (status?.enabled) {
            // Already in MP mode - copy the link
            this.copyMultiplayerLink();
        } else {
            // Not in MP mode - enable it
            this.enableMultiplayer();
        }
    }

    /**
     * Leave/disable multiplayer session
     */
    leaveMultiplayer() {
        if (!this.graph.disableMultiplayer) return;

        this.graph.disableMultiplayer();
        this.updateMultiplayerUI(false);
        this.showToast('Left multiplayer session');
        console.log('Multiplayer disabled');
    }

    /**
     * Enable multiplayer sync
     */
    enableMultiplayer() {
        // Check if CRDT graph with multiplayer support
        if (!this.graph.enableMultiplayer) {
            console.warn('Multiplayer requires CRDT graph mode');
            alert('Multiplayer requires CRDT mode. Please refresh the page.');
            return;
        }

        // Ensure we have a session
        if (!this.session || !this.session.id) {
            console.warn('No session loaded');
            alert('Please wait for session to load.');
            return;
        }

        // Enable multiplayer using session ID as room
        this.multiplayerBtn.classList.add('connecting');
        this.multiplayerBtn.title = 'Connecting...';

        const roomId = this.session.id;
        const provider = this.graph.enableMultiplayer(roomId);

        if (provider) {
            // Set up remote change handler to re-render canvas
            this.graph.onRemoteChange((type, events) => {
                console.log('[App] Remote change received:', type);
                this.handleRemoteChange(type, events);
            });

            // Set up lock change handler for visual indicators
            this.graph.onLocksChange?.((lockedNodes) => {
                this.handleLocksChange(lockedNodes);
            });

            // Set up peer count updates
            provider.on('peers', ({ webrtcPeers, bcPeers }) => {
                const peerCount = webrtcPeers.length + bcPeers.length;
                this.updatePeerCount(peerCount);
            });

            // Update UI when synced
            provider.on('synced', ({ synced }) => {
                this.multiplayerBtn.classList.remove('connecting');
                this.updateMultiplayerUI(true);
                console.log('Multiplayer synced:', synced);
            });

            // Initial UI update
            setTimeout(() => {
                this.multiplayerBtn.classList.remove('connecting');
                this.updateMultiplayerUI(true);
            }, 1000);

            // Copy shareable link to clipboard
            this.copyMultiplayerLink();

            console.log('Multiplayer enabled for room:', roomId);
        } else {
            this.multiplayerBtn.classList.remove('connecting');
            console.error('Failed to enable multiplayer');
        }
    }

    /**
     * Toggle multiplayer sync on/off (legacy, kept for keyboard shortcut)
     */
    toggleMultiplayer() {
        const status = this.graph.getMultiplayerStatus?.();

        if (status?.enabled) {
            this.leaveMultiplayer();
        } else {
            this.enableMultiplayer();
        }
    }

    /**
     * Copy the multiplayer session link to clipboard.
     * Shows visual feedback to the user.
     */
    async copyMultiplayerLink() {
        const url = new URL(window.location.href);
        url.searchParams.set('session', this.session.id);
        url.searchParams.set('multiplayer', 'true');

        const shareUrl = url.toString();

        try {
            await navigator.clipboard.writeText(shareUrl);
            console.log('[App] Multiplayer link copied:', shareUrl);

            // Show visual feedback
            this.showToast('Link copied! Share it to invite others.');
        } catch (err) {
            console.error('[App] Failed to copy link:', err);
            // Fallback: show the URL in an alert
            alert(`Share this link:\n${shareUrl}`);
        }
    }

    /**
     * Show a temporary toast notification
     * @param {string} message - Message to display
     * @param {number} duration - Duration in ms (default 3000)
     */
    showToast(message, duration = 3000) {
        // Remove existing toast if any
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Handle remote changes from other peers.
     * Uses smart diffing to animate position and size changes smoothly.
     */
    handleRemoteChange(type, events) {
        console.log('[App] Handling remote change:', type);

        const currentNodeIds = new Set(this.canvas.nodeElements.keys());
        const newNodes = this.graph.getAllNodes();
        const newNodeIds = new Set(newNodes.map((n) => n.id));

        // Track nodes that need position/size animation
        const transformChanges = [];
        // Track nodes that need full re-render (structural changes like tags, matrix edits)
        const needsRerender = [];

        // Process each new node
        for (const node of newNodes) {
            if (currentNodeIds.has(node.id)) {
                // Node exists - check for changes
                const wrapper = this.canvas.nodeElements.get(node.id);
                if (wrapper) {
                    const currentX = parseFloat(wrapper.getAttribute('x'));
                    const currentY = parseFloat(wrapper.getAttribute('y'));
                    const currentWidth = parseFloat(wrapper.getAttribute('width')) || node.width;
                    const currentHeight = parseFloat(wrapper.getAttribute('height')) || node.height;

                    // Check if position or size changed
                    const posChanged =
                        Math.abs(currentX - node.position.x) > 0.5 || Math.abs(currentY - node.position.y) > 0.5;
                    const sizeChanged =
                        (node.width && Math.abs(currentWidth - node.width) > 1) ||
                        (node.height && Math.abs(currentHeight - node.height) > 1);

                    if (posChanged || sizeChanged) {
                        transformChanges.push({
                            nodeId: node.id,
                            wrapper,
                            startX: currentX,
                            startY: currentY,
                            endX: node.position.x,
                            endY: node.position.y,
                            startWidth: currentWidth,
                            startHeight: currentHeight,
                            endWidth: node.width || currentWidth,
                            endHeight: node.height || currentHeight,
                            hasPositionChange: posChanged,
                            hasSizeChange: sizeChanged,
                        });
                    }

                    // Check if node needs full re-render (tags, matrix structure, etc.)
                    if (this.nodeNeedsRerender(node, wrapper)) {
                        needsRerender.push(node);
                    } else {
                        // Incremental updates for content/title
                        this.canvas.updateNodeContent(node.id, node.content, false);
                        this.canvas.updateNodeSummary(node.id, node);

                        // Update matrix cells if applicable
                        if (node.type === NodeType.MATRIX && node.cells) {
                            this.updateRemoteMatrixCells(node);
                        }
                    }
                }
            } else {
                // New node - render it
                this.canvas.renderNode(node);
            }
        }

        // Re-render nodes that need structural updates
        for (const node of needsRerender) {
            this.canvas.removeNode(node.id);
            this.canvas.renderNode(node);
        }

        // Remove deleted nodes
        for (const nodeId of currentNodeIds) {
            if (!newNodeIds.has(nodeId)) {
                this.canvas.removeNode(nodeId);
            }
        }

        // Animate position and size changes if any
        if (transformChanges.length > 0) {
            this.animateRemoteTransforms(transformChanges);
        } else {
            // No changes, just update edges
            this.canvas.updateAllEdges(this.graph);
        }

        // Save the session to persist remote changes locally
        this.saveSession();
    }

    /**
     * Check if a node needs full re-render (structural changes).
     * Returns true if tags or matrix structure changed.
     */
    nodeNeedsRerender(node, wrapper) {
        // Check if tag count changed (simple heuristic)
        const tagEls = wrapper.querySelectorAll('.node-tag');
        const currentTagCount = tagEls.length;
        const newTagCount = (node.tags || []).length;
        if (currentTagCount !== newTagCount) {
            return true;
        }

        // Check if tag colors match
        const currentTagColors = Array.from(tagEls)
            .map((el) => {
                // Extract color from class like "tag-red" -> "red"
                const match = el.className.match(/tag-(\w+)/);
                return match ? match[1] : null;
            })
            .filter(Boolean)
            .sort();
        const newTagColors = [...(node.tags || [])].sort();
        if (JSON.stringify(currentTagColors) !== JSON.stringify(newTagColors)) {
            return true;
        }

        return false;
    }

    /**
     * Update matrix cell contents from remote changes.
     */
    updateRemoteMatrixCells(node) {
        const wrapper = this.canvas.nodeElements.get(node.id);
        if (!wrapper || !node.cells) return;

        for (const [cellKey, cellData] of Object.entries(node.cells)) {
            const [row, col] = cellKey.split('-').map(Number);
            const cellEl = wrapper.querySelector(`.matrix-cell[data-row="${row}"][data-col="${col}"]`);
            if (cellEl) {
                const contentEl = cellEl.querySelector('.matrix-cell-content');
                if (contentEl && cellData.content) {
                    contentEl.textContent = cellData.content;
                    cellEl.classList.remove('empty');
                    cellEl.classList.add('filled');
                } else if (!cellData.content) {
                    cellEl.classList.add('empty');
                    cellEl.classList.remove('filled');
                }
            }
        }
    }

    /**
     * Animate node positions and sizes for remote changes.
     * Uses smooth easing to match local layout animations.
     */
    animateRemoteTransforms(animations) {
        const duration = 400; // Slightly faster than local (500ms)
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);

            // Update each node position and size
            for (const anim of animations) {
                // Animate position
                if (anim.hasPositionChange) {
                    const x = anim.startX + (anim.endX - anim.startX) * eased;
                    const y = anim.startY + (anim.endY - anim.startY) * eased;
                    anim.wrapper.setAttribute('x', x);
                    anim.wrapper.setAttribute('y', y);
                }

                // Animate size
                if (anim.hasSizeChange) {
                    const width = anim.startWidth + (anim.endWidth - anim.startWidth) * eased;
                    const height = anim.startHeight + (anim.endHeight - anim.startHeight) * eased;
                    anim.wrapper.setAttribute('width', width);
                    anim.wrapper.setAttribute('height', height);
                }
            }

            // Update edges during animation
            this.canvas.updateAllEdges(this.graph);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Update the multiplayer button UI state
     */
    updateMultiplayerUI(enabled) {
        if (enabled) {
            this.multiplayerBtn.classList.add('active');
            this.multiplayerBtn.title = 'Click to copy share link';
            this.multiplayerLeaveBtn.style.display = 'inline-flex';
            this.peerCountEl.style.display = 'inline';
        } else {
            this.multiplayerBtn.classList.remove('active');
            this.multiplayerBtn.title = 'Enable multiplayer sync';
            this.multiplayerLeaveBtn.style.display = 'none';
            this.peerCountEl.style.display = 'none';
        }
    }

    /**
     * Update the peer count display
     */
    updatePeerCount(count) {
        this.peerCountEl.textContent = count;
        this.peerCountEl.style.display = count > 0 ? 'inline' : 'none';
    }

    /**
     * Handle lock changes from other peers.
     * Updates visual indicators on locked nodes.
     * @param {Map<string, Object>} lockedNodes - Map of nodeId -> lock info
     */
    handleLocksChange(lockedNodes) {
        // Remove lock indicators from all nodes
        for (const [nodeId, wrapper] of this.canvas.nodeElements) {
            wrapper.classList.remove('node-locked-by-other');
        }

        // Add lock indicators to nodes locked by others
        for (const [nodeId, lockInfo] of lockedNodes) {
            if (!lockInfo.isOurs) {
                const wrapper = this.canvas.nodeElements.get(nodeId);
                if (wrapper) {
                    wrapper.classList.add('node-locked-by-other');
                }
            }
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
                        summaryText.textContent =
                            action.oldTitle ||
                            node.summary ||
                            this.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
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
                // Restore old cell state (immutable pattern)
                const matrixNodeUndo = this.graph.getNode(action.nodeId);
                if (matrixNodeUndo && matrixNodeUndo.type === NodeType.MATRIX) {
                    const cellKey = `${action.row}-${action.col}`;
                    const updatedCells = { ...matrixNodeUndo.cells, [cellKey]: { ...action.oldCell } };
                    this.graph.updateNode(action.nodeId, { cells: updatedCells });
                    this.canvas.updateMatrixCell(
                        action.nodeId,
                        action.row,
                        action.col,
                        action.oldCell.filled ? action.oldCell.content : null,
                        false
                    );
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
                        summaryText.textContent =
                            action.newTitle ||
                            node.summary ||
                            this.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
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
                // Re-apply cell fill (immutable pattern)
                const matrixNodeRedo = this.graph.getNode(action.nodeId);
                if (matrixNodeRedo && matrixNodeRedo.type === NodeType.MATRIX) {
                    const cellKey = `${action.row}-${action.col}`;
                    const updatedCells = { ...matrixNodeRedo.cells, [cellKey]: { ...action.newCell } };
                    this.graph.updateNode(action.nodeId, { cells: updatedCells });
                    this.canvas.updateMatrixCell(action.nodeId, action.row, action.col, action.newCell.content, false);
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

        // Save flashcard strictness
        const strictness = document.getElementById('flashcard-strictness').value;
        storage.setFlashcardStrictness(strictness);

        // Reload models to reflect newly configured API keys
        this.loadModels();

        // Update empty state in case API key status changed
        this.updateEmptyState();

        this.modalManager.hideSettingsModal();
    }

    // Sessions Modal methods moved to modal-manager.js

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
                const nodesWithTag = selectedIds.filter((id) => this.graph.nodeHasTag(id, color));
                if (nodesWithTag.length === selectedIds.length) {
                    slot.classList.add('active');
                } else if (nodesWithTag.length > 0) {
                    slot.classList.add('partial');
                }
            }

            // Check if this tag is currently highlighted
            if (this.highlightedTagColor === color) {
                slot.classList.add('highlighting');
            }

            slot.innerHTML = `
                <div class="tag-color-dot" style="background: ${color}"></div>
                <div class="tag-slot-content">
                    ${
                        tag
                            ? `<span class="tag-slot-name">${this.escapeHtml(tag.name)}</span>`
                            : `<span class="tag-slot-empty">+ Add tag</span>`
                    }
                </div>
                ${
                    tag
                        ? `
                    <div class="tag-slot-actions">
                        <button class="tag-slot-btn edit" title="Edit">✏️</button>
                        <button class="tag-slot-btn delete" title="Delete">✕</button>
                    </div>
                `
                        : ''
                }
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
        } else {
            // No nodes selected - toggle highlight for this tag
            this.handleTagChipClick(color);
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
        const nodesWithTag = nodeIds.filter((id) => this.graph.nodeHasTag(id, color));
        const allHaveTag = nodesWithTag.length === nodeIds.length;

        // Store old tags for undo (for each affected node)
        const tagChanges = [];
        for (const nodeId of nodeIds) {
            const node = this.graph.getNode(nodeId);
            if (node) {
                tagChanges.push({
                    nodeId,
                    oldTags: [...(node.tags || [])],
                    newTags: null, // Will be calculated after change
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
                newTags: change.newTags,
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
        const queryTokens = query
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 0);

        const html = results
            .map((result, idx) => {
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
            })
            .join('');

        container.innerHTML =
            html +
            `
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
     * Create and add a node to the canvas (for console/plugin use)
     * @param {string} type - Node type (e.g., 'poll', 'note', 'human')
     * @param {string} content - Node content text
     * @param {Object} options - Additional node options (position, data, etc.)
     * @returns {Object} The created node
     */
    createAndAddNode(type, content = '', options = {}) {
        const node = createNode(type, content, options);
        this.graph.addNode(node); // Emits 'nodeAdded', canvas auto-renders
        return node;
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

export { App };

// Initialize app when DOM is ready
// Wait for Yjs to load before initializing (Yjs loads as an ES module which is async)
document.addEventListener('DOMContentLoaded', () => {
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
});
