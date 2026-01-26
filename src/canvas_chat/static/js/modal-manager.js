/**
 * Modal Manager
 *
 * Handles all modal dialogs: Settings, Sessions, Help, Edit Content, Code Editor, Edit Title
 *
 * Dependencies (injected via constructor):
 * - app: App instance with required methods and properties
 *
 * Global dependencies:
 * - storage: Storage utilities
 * - escapeHtmlText: HTML escaping utility
 */

import { wrapNode } from './node-protocols.js';
import { storage } from './storage.js';
import { apiUrl, escapeHtmlText } from './utils.js';

/**
 *
 */
class ModalManager {
    /**
     * Create a ModalManager instance.
     * @param {Object} app - App instance with required methods
     */
    constructor(app) {
        this.app = app;
        // Map of plugin modals: Map<`${pluginId}:${modalId}`, HTMLElement>
        this._pluginModals = new Map();
        this.copilotDeviceCode = null;
        this.copilotVerificationUrl = null;
        this.copilotInterval = 5;
        this.copilotExpiresIn = 900;

        this.updateCopilotStatus();
        this.app.loadModels();
    }

    // --- Plugin Modal Registration API ---

    /**
     * Register a modal template for a plugin.
     * Plugins should call this in their onLoad() hook.
     * @param {string} pluginId - Plugin identifier (e.g., 'committee', 'matrix')
     * @param {string} modalId - Modal identifier within the plugin (e.g., 'main', 'edit')
     * @param {string} htmlTemplate - HTML template string for the modal
     * @returns {HTMLElement} The created modal element
     */
    registerModal(pluginId, modalId, htmlTemplate) {
        const key = `${pluginId}:${modalId}`;
        if (this._pluginModals.has(key)) {
            console.warn(`[ModalManager] Modal ${key} already registered, overwriting`);
        }

        const temp = document.createElement('div');
        temp.innerHTML = htmlTemplate.trim();

        const modal = temp.firstElementChild;
        if (!modal) {
            throw new Error(`[ModalManager] Invalid modal template for ${key}: no root element`);
        }

        const expectedId = `${pluginId}-${modalId}-modal`;
        if (modal.id && modal.id !== expectedId) {
            console.warn(
                `[ModalManager] Modal ${key} has id="${modal.id}" but expected "${expectedId}". Using provided ID.`
            );
        } else if (!modal.id) {
            modal.id = expectedId;
        }

        if (!modal.classList.contains('modal')) {
            modal.classList.add('modal');
        }
        modal.style.display = 'none';

        document.body.appendChild(modal);

        this._pluginModals.set(key, modal);

        console.log(`[ModalManager] Registered plugin modal: ${key}`);
        return modal;
    }

    /**
     * Show a plugin modal.
     * @param {string} pluginId - Plugin identifier
     * @param {string} modalId - Modal identifier within the plugin
     */
    showPluginModal(pluginId, modalId) {
        const key = `${pluginId}:${modalId}`;
        const modal = this._pluginModals.get(key);
        if (!modal) {
            throw new Error(`[ModalManager] Plugin modal ${key} not registered. Call registerModal() in onLoad().`);
        }
        modal.style.display = 'flex';
    }

    /**
     * Hide a plugin modal.
     * @param {string} pluginId - Plugin identifier
     * @param {string} modalId - Modal identifier within the plugin
     */
    hidePluginModal(pluginId, modalId) {
        const key = `${pluginId}:${modalId}`;
        const modal = this._pluginModals.get(key);
        if (!modal) {
            console.warn(`[ModalManager] Plugin modal ${key} not registered`);
            return;
        }
        modal.style.display = 'none';
    }

    /**
     * Get a plugin modal element (for plugins that need direct DOM access).
     * @param {string} pluginId - Plugin identifier
     * @param {string} modalId - Modal identifier within the plugin
     * @returns {HTMLElement|null} The modal element, or null if not registered
     */
    getPluginModal(pluginId, modalId) {
        const key = `${pluginId}:${modalId}`;
        return this._pluginModals.get(key) || null;
    }

    // --- Copilot Auth ---

    /**
     *
     */
    updateCopilotStatus() {
        const statusEl = document.getElementById('copilot-auth-status');
        if (!statusEl) {
            return;
        }
        statusEl.textContent = this.formatCopilotStatus();
    }

    /**
     *
     * @returns {string}
     */
    formatCopilotStatus() {
        const auth = storage.getCopilotAuth();
        if (!auth?.apiKey) {
            return 'Not authenticated';
        }
        const now = Math.floor(Date.now() / 1000);
        if (auth.expiresAt && auth.expiresAt <= now) {
            return 'Expired - re-authenticate';
        }
        if (auth.expiresAt) {
            const remaining = auth.expiresAt - now;
            const hours = Math.floor(remaining / 3600);
            const minutes = Math.floor((remaining % 3600) / 60);
            const parts = [];
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m`);
            const suffix = parts.length > 0 ? ` (expires in ${parts.join(' ')})` : '';
            return `Authenticated${suffix}`;
        }
        return 'Authenticated';
    }

    /**
     *
     * @param message
     */
    showCopilotAuthModal(message = '') {
        const modal = document.getElementById('copilot-auth-modal');
        if (!modal) {
            return;
        }
        modal.style.display = 'flex';
        const messageEl = document.getElementById('copilot-auth-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }

    /**
     *
     */
    hideCopilotAuthModal() {
        const modal = document.getElementById('copilot-auth-modal');
        if (!modal) {
            return;
        }
        modal.style.display = 'none';
    }

    /**
     *
     */
    async startCopilotAuth() {
        const messageEl = document.getElementById('copilot-auth-message');
        if (messageEl) {
            messageEl.textContent = 'Requesting device code...';
        }
        try {
            const response = await fetch(apiUrl('/api/github-copilot/auth/start'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to start Copilot authentication');
            }
            const data = await response.json();
            this.copilotDeviceCode = data.device_code;
            this.copilotVerificationUrl = data.verification_url;
            this.copilotInterval = data.interval || 5;
            this.copilotExpiresIn = data.expires_in || 900;
            const urlEl = document.getElementById('copilot-auth-url');
            if (urlEl) {
                urlEl.href = data.verification_url;
                urlEl.textContent = data.verification_url;
            }
            const codeEl = document.getElementById('copilot-auth-code');
            if (codeEl) {
                codeEl.value = data.user_code;
            }
            if (messageEl) {
                messageEl.textContent = 'After authenticating, return here and click “I’ve authenticated”.';
            }
            this.showCopilotAuthModal();
        } catch (err) {
            console.error('Copilot auth start failed:', err);
            if (messageEl) {
                messageEl.textContent = err.message || 'Failed to start Copilot authentication';
            }
            this.showCopilotAuthModal();
        }
    }

    /**
     *
     */
    async completeCopilotAuth() {
        const messageEl = document.getElementById('copilot-auth-message');
        if (!this.copilotDeviceCode) {
            if (messageEl) {
                messageEl.textContent = 'Start authentication to get a device code.';
            }
            return;
        }
        if (messageEl) {
            messageEl.textContent = 'Completing authentication...';
        }
        try {
            const response = await fetch(apiUrl('/api/github-copilot/auth/complete'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_code: this.copilotDeviceCode,
                    interval: this.copilotInterval,
                    expires_in: this.copilotExpiresIn,
                }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to complete Copilot authentication');
            }
            const data = await response.json();
            storage.saveCopilotAuth({
                accessToken: data.access_token,
                apiKey: data.api_key,
                expiresAt: data.expires_at,
            });
            this.updateCopilotStatus();
            await this.app.loadModels();
            this.hideCopilotAuthModal();
        } catch (err) {
            console.error('Copilot auth completion failed:', err);
            if (messageEl) {
                messageEl.textContent = err.message || 'Failed to complete Copilot authentication';
            }
        }
    }

    /**
     *
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async refreshCopilotAuth(options = {}) {
        const {
            clearAuthOnFailure = false,
            openModalOnFailure = false,
            message = 'GitHub Copilot authentication required.',
            skipModelReload = false,
        } = options;
        const accessToken = storage.getCopilotAccessToken();
        const statusEl = document.getElementById('copilot-auth-status');
        if (!accessToken) {
            if (statusEl) {
                statusEl.textContent = 'Not authenticated';
            }
            if (openModalOnFailure) {
                this.showCopilotAuthModal(message);
            }
            return false;
        }
        try {
            const response = await fetch(apiUrl('/api/github-copilot/auth/refresh'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: accessToken }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to refresh Copilot token');
            }
            const data = await response.json();
            storage.saveCopilotAuth({
                accessToken: accessToken,
                apiKey: data.api_key,
                expiresAt: data.expires_at,
            });
            this.updateCopilotStatus();
            if (!skipModelReload) {
                await this.app.loadModels();
            }
            return true;
        } catch (err) {
            console.error('Copilot auth refresh failed:', err);
            if (clearAuthOnFailure) {
                storage.clearCopilotAuth();
            }
            if (statusEl) {
                statusEl.textContent = clearAuthOnFailure ? 'Not authenticated' : 'Auth check failed';
            }
            if (!skipModelReload) {
                await this.app.loadModels();
            }
            if (openModalOnFailure) {
                this.showCopilotAuthModal(message);
            }
            return false;
        }
    }

    /**
     *
     */
    clearCopilotAuth() {
        storage.clearCopilotAuth();
        this.copilotDeviceCode = null;
        this.copilotVerificationUrl = null;
        this.copilotInterval = 5;
        this.copilotExpiresIn = 900;
        this.updateCopilotStatus();
    }

    /**
     *
     */
    copyCopilotCode() {
        const codeEl = document.getElementById('copilot-auth-code');
        if (!codeEl?.value) {
            return;
        }
        navigator.clipboard.writeText(codeEl.value).catch((err) => {
            console.error('Failed to copy copilot code:', err);
        });
    }

    /**
     *
     */
    openCopilotVerificationUrl() {
        const url = this.copilotVerificationUrl;
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }

    // --- Settings Modal ---

    /**
     *
     */
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

        this.updateCopilotStatus();

        // Load base URL
        document.getElementById('base-url').value = storage.getBaseUrl() || '';

        // Load flashcard strictness
        document.getElementById('flashcard-strictness').value = storage.getFlashcardStrictness();

        // Render custom models list
        this.renderCustomModelsList();
    }

    /**
     *
     */
    hideSettingsModal() {
        document.getElementById('settings-modal').style.display = 'none';
    }

    /**
     * Render the custom models list in the settings modal
     */

    /**
     *
     */
    renderCustomModelsList() {
        const container = document.getElementById('custom-models-list');
        const models = storage.getCustomModels();

        if (models.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = models
            .map((model) => {
                const meta = [];
                if (model.context_window) {
                    meta.push(`${(model.context_window / 1000).toFixed(0)}k context`);
                }
                if (model.base_url) {
                    meta.push('custom endpoint');
                }

                return `
                <div class="custom-model-item" data-model-id="${escapeHtmlText(model.id)}">
                    <div class="custom-model-info">
                        <div class="custom-model-name">${escapeHtmlText(model.name)}</div>
                        <div class="custom-model-id">${escapeHtmlText(model.id)}</div>
                        ${meta.length > 0 ? `<div class="custom-model-meta">${meta.join(' · ')}</div>` : ''}
                    </div>
                    <button class="custom-model-delete" title="Delete model">&times;</button>
                </div>
            `;
            })
            .join('');

        // Add delete handlers
        container.querySelectorAll('.custom-model-delete').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.custom-model-item');
                const modelId = item.dataset.modelId;
                this.handleDeleteCustomModel(modelId);
            });
        });
    }

    /**
     * Handle adding a custom model from the settings form
     */
    handleAddCustomModel() {
        const idInput = document.getElementById('custom-model-id');
        const nameInput = document.getElementById('custom-model-name');
        const contextInput = document.getElementById('custom-model-context');
        const baseUrlInput = document.getElementById('custom-model-baseurl');

        const modelId = idInput.value.trim();
        const name = nameInput.value.trim();
        const contextWindow = parseInt(contextInput.value, 10) || 128000;
        const baseUrl = baseUrlInput.value.trim();

        if (!modelId) {
            idInput.focus();
            return;
        }

        try {
            storage.saveCustomModel({
                id: modelId,
                name: name || undefined,
                context_window: contextWindow,
                base_url: baseUrl || undefined,
            });

            // Clear form
            idInput.value = '';
            nameInput.value = '';
            contextInput.value = '';
            baseUrlInput.value = '';

            // Re-render list
            this.renderCustomModelsList();

            // Also reload models so the new model appears in the picker
            this.app.loadModels();
        } catch (err) {
            // Show validation error
            alert(err.message);
            idInput.focus();
        }
    }

    /**
     * Handle deleting a custom model
     * @param {string} modelId - The model ID to delete
     */
    handleDeleteCustomModel(modelId) {
        storage.deleteCustomModel(modelId);
        this.renderCustomModelsList();

        // Also reload models to remove from picker
        this.app.loadModels();
    }

    // --- Help Modal ---

    /**
     *
     */
    showHelpModal() {
        document.getElementById('help-modal').style.display = 'flex';
    }

    /**
     *
     */
    hideHelpModal() {
        document.getElementById('help-modal').style.display = 'none';
    }

    /**
     *
     * @returns {boolean}
     */
    isHelpOpen() {
        return document.getElementById('help-modal').style.display === 'flex';
    }

    /**
     * Close any open modal. Returns true if a modal was closed.
     * Modals are checked in a priority order (most specific first).
     * @returns {boolean}
     */
    closeAnyOpenModal() {
        // First check plugin modals (most specific)
        for (const [_key, modal] of this._pluginModals.entries()) {
            if (modal && modal.style.display === 'flex') {
                modal.style.display = 'none';
                return true;
            }
        }

        // Then check core app modals
        const modalIds = ['edit-title-modal', 'edit-content-modal', 'session-modal', 'settings-modal', 'help-modal'];

        for (const id of modalIds) {
            const modal = document.getElementById(id);
            if (modal && modal.style.display === 'flex') {
                modal.style.display = 'none';
                // Release any edit locks if closing edit modals
                if (id === 'edit-title-modal' || id === 'edit-content-modal') {
                    this.app.editingNodeId = null;
                }
                return true;
            }
        }
        return false;
    }

    // --- Sessions Modal ---

    /**
     *
     */
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

        listEl.innerHTML = sessions
            .map(
                (session) => `
            <div class="session-item" data-session-id="${session.id}">
                <div>
                    <div class="session-item-name">${session.name || 'Untitled Session'}</div>
                    <div class="session-item-date">${new Date(session.updated_at).toLocaleDateString()}</div>
                </div>
                <button class="session-item-delete" data-delete-id="${session.id}" title="Delete">🗑️</button>
            </div>
        `
            )
            .join('');

        // Add click handlers for session items
        listEl.querySelectorAll('.session-item').forEach((item) => {
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.session-item-delete')) return;
                const sessionId = item.dataset.sessionId;
                const session = await storage.getSession(sessionId);
                if (session) {
                    await this.app.loadSessionData(session);
                    this.hideSessionsModal();
                }
            });
        });

        // Add delete handlers
        listEl.querySelectorAll('.session-item-delete').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.deleteId;
                // No confirmation - user can create new sessions easily
                await storage.deleteSession(sessionId);
                // If deleting current session, create new one
                if (this.app.session.id === sessionId) {
                    await this.app.createNewSession();
                }
                this.showSessionsModal(); // Refresh list
            });
        });
    }

    /**
     *
     */
    hideSessionsModal() {
        document.getElementById('session-modal').style.display = 'none';
    }

    // --- Edit Content Modal ---

    /**
     * Handle opening the edit content modal for a node
     * @param nodeId
     */
    handleNodeEditContent(nodeId) {
        const node = this.app.graph.getNode(nodeId);
        if (!node) return;

        // Check if node is locked by another user in multiplayer
        if (this.app.graph.isNodeLockedByOther?.(nodeId)) {
            this.app.showToast('This node is being edited by another user');
            return;
        }

        // Try to acquire lock
        if (this.app.graph.lockNode?.(nodeId) === false) {
            this.app.showToast('Could not lock node for editing');
            return;
        }

        // Get protocol instance to access plugin methods
        const wrapped = wrapNode(node);
        const editFields = wrapped.getEditFields();

        this.app.editingNodeId = nodeId;
        this.app.editingNodeProtocol = wrapped; // Store protocol for save/preview

        const modalTitle = document.querySelector('#edit-content-modal .modal-header h2');
        const editPane = document.querySelector('#edit-content-modal .edit-pane');
        const _preview = document.getElementById('edit-content-preview');

        // Update modal title from protocol
        if (modalTitle) {
            modalTitle.textContent = wrapped.getEditModalTitle();
        }

        // Clear existing fields (except first textarea which we'll reuse)
        const existingFields = editPane.querySelectorAll('.edit-field-container');
        existingFields.forEach((field) => field.remove());

        // Render fields dynamically based on protocol
        const fieldElements = new Map();
        editFields.forEach((field, index) => {
            const container = document.createElement('div');
            container.className = 'edit-field-container';
            if (index > 0) {
                container.style.marginTop = '1rem';
            }

            const label = document.createElement('div');
            label.className = 'pane-header';
            label.style.marginBottom = index === 0 ? '0' : '0.5rem';
            label.textContent = field.label;

            const textarea = document.createElement('textarea');
            textarea.id = `edit-field-${field.id}`;
            textarea.placeholder = field.placeholder;
            textarea.value = field.value;

            // Reuse first textarea (content) if it's the first field
            if (index === 0 && field.id === 'content') {
                const existingTextarea = document.getElementById('edit-content-textarea');
                if (existingTextarea) {
                    existingTextarea.value = field.value;
                    existingTextarea.placeholder = field.placeholder;
                    fieldElements.set(field.id, existingTextarea);
                    return; // Skip creating new element
                }
            }

            container.appendChild(label);
            container.appendChild(textarea);
            editPane.appendChild(container);
            fieldElements.set(field.id, textarea);
        });

        // Store field elements for preview/save
        this.app.editingFieldElements = fieldElements;

        // Set up live preview on input for all fields
        const updatePreview = () => this.updateEditContentPreview();
        fieldElements.forEach((textarea) => {
            textarea.oninput = updatePreview;
        });

        // Render initial preview
        this.updateEditContentPreview();

        document.getElementById('edit-content-modal').style.display = 'flex';

        // Focus the first textarea
        setTimeout(() => {
            const firstField = fieldElements.values().next().value;
            if (firstField) {
                firstField.focus();
            }
        }, 100);
    }

    /**
     * Update the live preview in the edit content modal
     */
    updateEditContentPreview() {
        if (!this.app.editingNodeProtocol || !this.app.editingFieldElements) return;

        const preview = document.getElementById('edit-content-preview');
        const wrapped = this.app.editingNodeProtocol;

        // Collect field values
        const fields = {};
        this.app.editingFieldElements.forEach((textarea, fieldId) => {
            fields[fieldId] = textarea.value;
        });

        // Use protocol's renderEditPreview method
        preview.innerHTML = wrapped.renderEditPreview(fields, this.app.canvas);
    }

    /**
     * Hide the edit content modal
     */
    hideEditContentModal() {
        // Release lock when closing modal
        if (this.app.editingNodeId) {
            this.app.graph.unlockNode?.(this.app.editingNodeId);
        }
        document.getElementById('edit-content-modal').style.display = 'none';

        // Clear event listeners
        if (this.app.editingFieldElements) {
            this.app.editingFieldElements.forEach((textarea) => {
                textarea.oninput = null;
            });
        }

        // Clean up
        this.app.editingNodeId = null;
        this.app.editingNodeProtocol = null;
        this.app.editingFieldElements = null;
    }

    /**
     * Save edited content with versioning
     */
    handleEditContentSave() {
        if (!this.app.editingNodeId || !this.app.editingNodeProtocol || !this.app.editingFieldElements) return;

        const node = this.app.graph.getNode(this.app.editingNodeId);
        if (!node) {
            this.hideEditContentModal();
            return;
        }

        const wrapped = this.app.editingNodeProtocol;

        // Collect field values
        const fields = {};
        this.app.editingFieldElements.forEach((textarea, fieldId) => {
            fields[fieldId] = textarea.value;
        });

        // Check if anything changed (compare with current node values)
        const updateData = wrapped.handleEditSave(fields, this.app);
        let hasChanges = false;
        for (const [key, value] of Object.entries(updateData)) {
            if (node[key] !== value) {
                hasChanges = true;
                break;
            }
        }

        if (!hasChanges) {
            this.hideEditContentModal();
            return;
        }

        // Build new versions array (immutable pattern - don't mutate node directly)
        const existingVersions = node.versions || [];
        const versionData = {};
        Object.keys(updateData).forEach((key) => {
            versionData[key] = node[key];
        });

        const newVersions = [
            ...existingVersions,
            // Add initial version if this is the first edit
            ...(existingVersions.length === 0
                ? [
                      {
                          ...versionData,
                          timestamp: node.createdAt || Date.now(),
                          reason: 'initial',
                      },
                  ]
                : []),
            // Add current values as version before the edit
            {
                ...versionData,
                timestamp: Date.now(),
                reason: 'before edit',
            },
        ];

        // Update node via graph (triggers CRDT sync for multiplayer)
        this.app.graph.updateNode(this.app.editingNodeId, {
            ...updateData,
            versions: newVersions,
        });

        // Re-render node (full re-render for nodes that might have changed structure)
        const updatedNode = this.app.graph.getNode(this.app.editingNodeId);
        this.app.canvas.renderNode(updatedNode);

        // Close modal and save
        this.hideEditContentModal();
        this.app.saveSession();
    }

    // --- Code Editor Modal ---

    /**
     * Handle clicking edit on a code node - opens the code editor modal
     * @param {string} nodeId - The code node ID
     */
    handleNodeEditCode(nodeId) {
        const node = this.app.graph.getNode(nodeId);
        if (!node) return;
        const wrapped = wrapNode(node);
        if (!wrapped.supportsCodeExecution || !wrapped.supportsCodeExecution()) return;
        this.showCodeEditorModal(nodeId);
    }

    /**
     * Show the code editor modal for a code node
     * @param {string} nodeId - The code node ID
     */
    showCodeEditorModal(nodeId) {
        const node = this.app.graph.getNode(nodeId);
        if (!node) return;

        this.app.editingCodeNodeId = nodeId;
        const textarea = document.getElementById('code-editor-textarea');

        // Get code from node via protocol
        const wrapped = wrapNode(node);
        const code = wrapped.getCode() || '';
        textarea.value = code;

        // Render initial preview
        this.updateCodeEditorPreview();

        document.getElementById('code-editor-modal').style.display = 'flex';

        // Focus the textarea
        setTimeout(() => {
            textarea.focus();
        }, 100);
    }

    /**
     * Update the live preview in the code editor modal using highlight.js
     */
    updateCodeEditorPreview() {
        const textarea = document.getElementById('code-editor-textarea');
        const preview = document.getElementById('code-editor-preview');
        const code = textarea.value || '';

        // Get the code element inside the pre
        const codeEl = preview.querySelector('code');
        if (codeEl && window.hljs) {
            codeEl.textContent = code;
            codeEl.className = 'language-python';
            // Re-highlight
            delete codeEl.dataset.highlighted;
            window.hljs.highlightElement(codeEl);
        }
    }

    /**
     * Hide the code editor modal
     */
    hideCodeEditorModal() {
        document.getElementById('code-editor-modal').style.display = 'none';
        this.app.editingCodeNodeId = null;
    }

    /**
     * Save code from the modal to the node
     */
    handleCodeEditorSave() {
        if (!this.app.editingCodeNodeId) return;

        const node = this.app.graph.getNode(this.app.editingCodeNodeId);
        if (!node) {
            this.hideCodeEditorModal();
            return;
        }

        const newCode = document.getElementById('code-editor-textarea').value;

        // Don't save if code hasn't changed
        const wrapped = wrapNode(node);
        const oldCode = wrapped.getCode() || '';
        if (newCode === oldCode) {
            this.hideCodeEditorModal();
            return;
        }

        // Store nodeId before closing modal (since hideCodeEditorModal clears editingCodeNodeId)
        const nodeId = this.app.editingCodeNodeId;

        // Close modal first to clear state
        this.hideCodeEditorModal();

        // Emit nodeCodeChange event so CodeFeature can handle it properly
        // This ensures execution state is cleared and title is updated
        // Note: We emit after closing the modal to prevent any modal state conflicts
        this.app.canvas.emit('nodeCodeChange', nodeId, newCode);
    }

    // --- Edit Title Modal ---

    /**
     * Handle opening the edit title modal for a node
     * @param nodeId
     */
    handleNodeTitleEdit(nodeId) {
        const node = this.app.graph.getNode(nodeId);
        if (!node) return;

        // Check if node is locked by another user in multiplayer
        if (this.app.graph.isNodeLockedByOther?.(nodeId)) {
            this.app.showToast('This node is being edited by another user');
            return;
        }

        // Try to acquire lock
        if (this.app.graph.lockNode?.(nodeId) === false) {
            this.app.showToast('Could not lock node for editing');
            return;
        }

        // Store the node ID for the save handler
        this.app._editTitleNodeId = nodeId;

        // Populate and show the modal
        const input = document.getElementById('edit-title-input');
        input.value = node.title || node.summary || '';
        document.getElementById('edit-title-modal').style.display = 'flex';

        // Focus and select the input
        input.focus();
        input.select();
    }

    /**
     * Hide the edit title modal
     */
    hideEditTitleModal() {
        // Release lock when closing modal
        if (this.app._editTitleNodeId) {
            this.app.graph.unlockNode?.(this.app._editTitleNodeId);
        }
        document.getElementById('edit-title-modal').style.display = 'none';
        this.app._editTitleNodeId = null;
    }

    /**
     * Save edited title
     */
    saveNodeTitle() {
        const nodeId = this.app._editTitleNodeId;
        if (!nodeId) return;

        const node = this.app.graph.getNode(nodeId);
        if (!node) {
            this.hideEditTitleModal();
            return;
        }

        const oldTitle = node.title;
        const newTitle = document.getElementById('edit-title-input').value.trim() || null;

        // Only push undo if title actually changed
        if (oldTitle !== newTitle) {
            this.app.undoManager.push({
                type: 'EDIT_TITLE',
                nodeId,
                oldTitle,
                newTitle,
            });
        }

        this.app.graph.updateNode(nodeId, { title: newTitle });

        // Update the DOM
        const wrapper = this.app.canvas.nodeElements.get(nodeId);
        if (wrapper) {
            const summaryText = wrapper.querySelector('.summary-text');
            if (summaryText) {
                summaryText.textContent =
                    newTitle ||
                    node.summary ||
                    this.app.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
            }
        }

        this.app.saveSession();
        this.hideEditTitleModal();
    }

    // --- Canvas Event Registration ---

    /**
     * Register canvas event listeners for modal interactions.
     * Called from App.setupCanvasEventListeners().
     */
    setupCanvasEventListeners() {
        // Code node edit event - opens modal editor
        this.app.canvas.on('nodeEditCode', (nodeId) => this.handleNodeEditCode(nodeId));
    }
}

// Export for browser
export { ModalManager };
