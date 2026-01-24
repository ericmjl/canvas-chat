/**
 * Image Generation Feature Module
 *
 * Handles the /image command for AI image generation.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { AppContext } from '../feature-plugin.js';
import { NodeType, EdgeType, createNode, createEdge } from '../graph-types.js';
import { apiUrl } from '../utils.js';

/**
 * ImageGenerationFeature - Handles /image command with DALL-E and Imagen.
 * Extends FeaturePlugin to integrate with the plugin architecture.
 */
class ImageGenerationFeature extends FeaturePlugin {
    /**
     * Create an ImageGenerationFeature instance.
     * @param {AppContext} context - Application context with injected dependencies
     */
    constructor(context) {
        super(context);

        // Store current generation state
        this.parentNodeIds = [];
    }

    /**
     * Lifecycle hook called when the plugin is loaded.
     * @returns {Promise<void>}
     */
    async onLoad() {
        console.log('[ImageGenerationFeature] Loaded');

        // Register the modal
        const modalTemplate = `
            <div id="image-generation-settings-modal" class="modal" style="display: none">
                <div class="modal-content modal-narrow">
                    <div class="modal-header">
                        <h2>Image Generation Settings</h2>
                        <button class="modal-close" id="image-gen-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="api-key-group">
                            <label for="image-gen-model">Model</label>
                            <select id="image-gen-model" class="modal-select">
                                <option value="dall-e-3">DALL-E 3 (OpenAI) - Best quality</option>
                                <option value="dall-e-2">DALL-E 2 (OpenAI) - Lower cost</option>
                                <option value="gemini/imagen-4.0-generate-001">Imagen 4.0 (Google) - Fast</option>
                                <option value="ollama_image/x/z-image-turbo:latest">Z Image Turbo (Ollama) - Local</option>
                            </select>
                        </div>

                        <div class="api-key-group">
                            <label for="image-gen-size">Size</label>
                            <select id="image-gen-size" class="modal-select">
                                <option value="1024x1024" selected>Square (1024x1024)</option>
                                <option value="1792x1024">Landscape (1792x1024)</option>
                                <option value="1024x1792">Portrait (1024x1792)</option>
                            </select>
                        </div>

                        <div class="api-key-group">
                            <label for="image-gen-quality">Quality</label>
                            <select id="image-gen-quality" class="modal-select">
                                <option value="hd" selected>HD (Recommended)</option>
                                <option value="standard">Standard</option>
                            </select>
                        </div>

                        <div class="modal-actions">
                            <button id="image-gen-generate" class="primary-btn">Generate Image</button>
                            <button id="image-gen-cancel" class="secondary-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.modalManager.registerModal('image-generation', 'settings', modalTemplate);

        // Setup close button event listener
        const closeBtn = document.getElementById('image-gen-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.modalManager.hidePluginModal('image-generation', 'settings');
            });
        }
    }

    /**
     * Define slash commands provided by this feature.
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/image',
                description: 'Generate an image from text',
                placeholder: 'optional additional instructions...',
            },
        ];
    }

    /**
     * Handle the /image command.
     * @param {string} command - The slash command (e.g., '/image')
     * @param {string} args - Text after the command
     * @param {Object} contextObj - Additional context (e.g., { text: selectedNodesContent })
     */
    async handleCommand(command, args, contextObj) {
        // 1. Get selected node content as prompt
        const selectedContext = contextObj?.text || null;
        const additionalInstructions = args.trim();

        // 2. Build prompt
        let prompt = selectedContext || additionalInstructions;

        if (!prompt) {
            throw new Error('Please select a node with text or provide a prompt after /image');
        }

        // Combine context + instructions if both exist
        if (selectedContext && additionalInstructions) {
            prompt = `${selectedContext}\n\nAdditional instructions: ${additionalInstructions}`;
        }

        console.log('[ImageGeneration] Prompt:', prompt);

        // 3. Store prompt and show modal
        this.currentPrompt = prompt;
        this.parentNodeIds = this.canvas.getSelectedNodeIds();

        // Show settings modal
        await this.showSettingsModal();
    }

    /**
     * Show the image generation settings modal.
     */
    async showSettingsModal() {
        // Open modal
        this.modalManager.showPluginModal('image-generation', 'settings');

        // Setup event listeners
        const generateBtn = document.getElementById('image-gen-generate');
        const cancelBtn = document.getElementById('image-gen-cancel');

        if (generateBtn) {
            generateBtn.onclick = () => this.generateImage();
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => this.modalManager.hidePluginModal('image-generation', 'settings');
        }
    }

    /**
     * Generate the image with the selected settings.
     */
    async generateImage() {
        // Get settings from modal
        const modelInput = document.getElementById('image-gen-model');
        const sizeInput = document.getElementById('image-gen-size');
        const qualityInput = document.getElementById('image-gen-quality');

        const model = modelInput?.value || 'dall-e-3';
        const size = sizeInput?.value || '1024x1024';
        const quality = qualityInput?.value || 'hd';

        console.log('[ImageGeneration] Generating with:', { model, size, quality });

        // Close modal
        this.modalManager.hidePluginModal('image-generation', 'settings');

        // Create HUMAN node with the prompt
        const humanNode = createNode(NodeType.HUMAN, `/image ${this.currentPrompt}`, {
            position: this.graph.autoPosition(this.parentNodeIds),
        });
        this.graph.addNode(humanNode);

        // Create edges from any selected nodes to HUMAN
        for (const parentId of this.parentNodeIds) {
            const edge = createEdge(parentId, humanNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        // Create IMAGE node with model stored
        const loadingNode = createNode(NodeType.IMAGE, '', {
            position: this.graph.autoPosition([humanNode.id]),
            imageData: null,
            model: model,
        });

        this.graph.addNode(loadingNode);

        // Create edge from HUMAN to IMAGE
        const edge = createEdge(humanNode.id, loadingNode.id, EdgeType.REPLY);
        this.graph.addEdge(edge);

        this.canvas.clearSelection();
        this.saveSession();

        // Show loading indicator (direct DOM manipulation for IMAGE nodes)
        const wrapper = this.canvas.nodeElements.get(loadingNode.id);
        if (wrapper) {
            const contentEl = wrapper.querySelector('.image-node-content');
            if (contentEl) {
                contentEl.innerHTML =
                    '<div class="image-loading"><div class="spinner"></div><p>Generating image...</p></div>';
            }
        }

        try {
            // Manually build the request body to ensure correct API key is used.
            const requestBody = {
                prompt: this.currentPrompt,
                model: model,
                size: size,
                quality: quality,
                n: 1,
            };

            let provider;
            if (model.startsWith('dall-e')) {
                provider = 'openai';
            } else if (model.startsWith('gemini')) {
                provider = 'google';
            } else {
                provider = model.split('/')[0];
            }

            const apiKey = this.storage.getApiKeyForProvider(provider);
            const baseUrl = this.storage.getBaseUrlForModel(model);

            if (apiKey) {
                requestBody.api_key = apiKey;
            }
            if (baseUrl) {
                requestBody.base_url = baseUrl;
            }

            // Call backend API
            const response = await fetch(apiUrl('/api/generate-image'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                let errorDetail = 'Image generation failed';
                try {
                    // Try to parse a specific error message from the server
                    const errorJson = await response.json();
                    errorDetail = errorJson.detail || JSON.stringify(errorJson);
                } catch (e) {
                    // If response is not JSON, use the status text
                    errorDetail = `${response.status}: ${response.statusText}`;
                }
                throw new Error(errorDetail);
            }

            const { imageData, mimeType, revised_prompt } = await response.json();

            console.log('[ImageGeneration] Image generated successfully');

            // Update node with generated image
            this.graph.updateNode(loadingNode.id, {
                imageData: imageData,
                mimeType: mimeType,
                content: revised_prompt || '',
            });

            // Force re-render to show the image
            this.canvas.removeNode(loadingNode.id);
            const updatedNode = this.graph.getNode(loadingNode.id);
            if (updatedNode) {
                this.canvas.renderNode(updatedNode);
            }

            this.saveSession();
        } catch (err) {
            console.error('[ImageGeneration] Error:', err);

            // Generate a user-friendly error message
            const userMessage = this._getUserFriendlyErrorMessage(err);

            const errorHtml = `
                <div style="padding: 20px; text-align: center; color: var(--text-primary);">
                    <p style="color: var(--error); font-weight: 500;">❌ Image generation failed</p>
                    <p style="color: var(--text-secondary); font-size: 12px; margin-top: 8px;">${this.escapeHtml(
                        userMessage
                    )}</p>
                </div>
            `;

            // Update node with error HTML (direct DOM manipulation for IMAGE nodes)
            const wrapper = this.canvas.nodeElements.get(loadingNode.id);
            if (wrapper) {
                const contentEl = wrapper.querySelector('.image-node-content');
                if (contentEl) {
                    contentEl.innerHTML = errorHtml;
                }
            }

            // Update node to mark it as error state
            this.graph.updateNode(loadingNode.id, {
                imageData: null,
                content: `Error: ${userMessage}`,
            });

            this.saveSession();
        }
    }

    /**
     * Generates a user-friendly error message from a raw error object.
     * @param {Error} err - The error object.
     * @returns {string} A user-friendly error message.
     */
    _getUserFriendlyErrorMessage(err) {
        const message = err.message || '';

        if (message.includes('Authentication failed')) {
            return 'Authentication failed. Please check your API key in Settings.';
        }
        if (message.includes('Rate limit')) {
            return 'Rate limit exceeded. Please try again later.';
        }
        if (message.includes('Failed to fetch')) {
            return 'Network error. Could not connect to the server.';
        }

        // Catch generic JS errors and show a non-technical message
        const isGenericJsError = /is not a function|undefined|null/.test(message);
        if (err instanceof TypeError && isGenericJsError) {
            return 'An unexpected application error occurred. Please report this bug.';
        }

        // Default to the error message if it seems safe, otherwise a generic message
        return message.length < 200 ? message : 'An unexpected error occurred.';
    }

    /**
     * Escape HTML to prevent XSS in error messages.
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

export { ImageGenerationFeature };
