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

class ModalManager {
    /**
     * Create a ModalManager instance.
     * @param {Object} app - App instance with required methods
     */
    constructor(app) {
        this.app = app;
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

        // Load flashcard strictness
        document.getElementById('flashcard-strictness').value = storage.getFlashcardStrictness();

        // Render custom models list
        this.renderCustomModelsList();
    }

    hideSettingsModal() {
        document.getElementById('settings-modal').style.display = 'none';
    }

    /**
     * Render the custom models list in the settings modal
     */
    renderCustomModelsList() {
        const container = document.getElementById('custom-models-list');
        const models = storage.getCustomModels();

        if (models.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = models.map(model => {
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
        }).join('');

        // Add delete handlers
        container.querySelectorAll('.custom-model-delete').forEach(btn => {
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
                base_url: baseUrl || undefined
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

    showHelpModal() {
        document.getElementById('help-modal').style.display = 'flex';
    }

    hideHelpModal() {
        document.getElementById('help-modal').style.display = 'none';
    }

    isHelpOpen() {
        return document.getElementById('help-modal').style.display === 'flex';
    }

    /**
     * Close any open modal. Returns true if a modal was closed.
     * Modals are checked in a priority order (most specific first).
     * @returns {boolean}
     */
    closeAnyOpenModal() {
        // List of all modal IDs in priority order
        const modalIds = [
            'edit-title-modal',
            'edit-content-modal',
            'cell-modal',
            'slice-modal',
            'edit-matrix-modal',
            'matrix-modal',
            'committee-modal',
            'session-modal',
            'settings-modal',
            'help-modal'
        ];

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
                    await this.app.loadSessionData(session);
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
                if (this.app.session.id === sessionId) {
                    await this.app.createNewSession();
                }
                this.showSessionsModal(); // Refresh list
            });
        });
    }

    hideSessionsModal() {
        document.getElementById('session-modal').style.display = 'none';
    }

    // --- Edit Content Modal ---

    /**
     * Handle opening the edit content modal for a node
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

        this.app.editingNodeId = nodeId;
        const textarea = document.getElementById('edit-content-textarea');

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
        preview.innerHTML = this.app.canvas.renderMarkdown(content);
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
        document.getElementById('edit-content-textarea').oninput = null;
        this.app.editingNodeId = null;
    }

    /**
     * Save edited content with versioning
     */
    handleEditContentSave() {
        if (!this.app.editingNodeId) return;

        const node = this.app.graph.getNode(this.app.editingNodeId);
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

        // Build new versions array (immutable pattern - don't mutate node directly)
        const existingVersions = node.versions || [];
        const newVersions = [
            ...existingVersions,
            // Add initial version if this is the first edit
            ...(existingVersions.length === 0 ? [{
                content: node.content,
                timestamp: node.createdAt || Date.now(),
                reason: 'initial'
            }] : []),
            // Add current content as version before the edit
            {
                content: node.content,
                timestamp: Date.now(),
                reason: 'before edit'
            }
        ];

        // Update content via graph (triggers CRDT sync for multiplayer)
        this.app.graph.updateNode(this.app.editingNodeId, {
            content: newContent,
            versions: newVersions
        });

        // Re-render node
        this.app.canvas.updateNodeContent(this.app.editingNodeId, newContent, false);

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
        if (!node || node.type !== NodeType.CODE) return;
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

        // Get code from node (try code first, then content for legacy nodes)
        const code = node.code || node.content || '';
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
        const oldCode = node.code || node.content || '';
        if (newCode === oldCode) {
            this.hideCodeEditorModal();
            return;
        }

        // Update code via graph
        this.app.graph.updateNode(this.app.editingCodeNodeId, { code: newCode, content: newCode });

        // Update the code display in the node (uses highlight.js)
        this.app.canvas.updateCodeContent(this.app.editingCodeNodeId, newCode, false);

        // Close modal and save
        this.hideCodeEditorModal();
        this.app.saveSession();
    }

    // --- Edit Title Modal ---

    /**
     * Handle opening the edit title modal for a node
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
                newTitle
            });
        }

        this.app.graph.updateNode(nodeId, { title: newTitle });

        // Update the DOM
        const wrapper = this.app.canvas.nodeElements.get(nodeId);
        if (wrapper) {
            const summaryText = wrapper.querySelector('.summary-text');
            if (summaryText) {
                summaryText.textContent = newTitle || node.summary || this.app.canvas.truncate((node.content || '').replace(/[#*_`>\[\]()!]/g, ''), 60);
            }
        }

        this.app.saveSession();
        this.hideEditTitleModal();
    }
}

// Export for browser
window.ModalManager = ModalManager;

// CommonJS export for Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ModalManager };
}
