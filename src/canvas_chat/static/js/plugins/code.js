/**
 * Code Plugin (Built-in)
 *
 * Provides code nodes for Python code execution with Pyodide.
 * This is a self-contained plugin that combines:
 * - CodeNode protocol (custom node rendering)
 * - CodeFeature (self-healing and error recovery)
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { DEFAULT_NODE_SIZES, EdgeType, NodeType, createEdge, createNode } from '../graph-types.js';
import { Actions, BaseNode, HeaderButtons, wrapNode } from '../node-protocols.js';
import { NodeRegistry } from '../node-registry.js';
import { CancellableEvent } from '../plugin-events.js';
import { readSSEStream } from '../sse.js';

// =============================================================================
// Code Node Protocol
// =============================================================================

/**
 * Code Node Protocol Class
 * Defines how code nodes are rendered and what actions they support.
 */
class CodeNode extends BaseNode {
    /**
     * Get the type label for this node
     * @returns {string}
     */
    getTypeLabel() {
        return 'Code';
    }

    /**
     * Get the type icon for this node
     * @returns {string}
     */
    getTypeIcon() {
        return '🐍';
    }

    /**
     * Get summary text for the node (shown when zoomed out)
     * @param {Canvas} canvas
     * @returns {string}
     */
    getSummaryText(canvas) {
        if (this.node.title) return this.node.title;
        // Show first meaningful line of code
        const code = this.node.code || this.node.content || '';
        const firstLine = code.split('\n').find((line) => line.trim() && !line.trim().startsWith('#')) || 'Python code';
        return canvas.truncate(firstLine.trim(), 50);
    }

    /**
     * Render the content for the code node
     * @param {Canvas} canvas
     * @returns {string}
     */
    renderContent(canvas) {
        const code = this.node.code || this.node.content || '';
        const executionState = this.node.executionState || 'idle';
        const csvNodeIds = this.node.csvNodeIds || [];

        // Build header comment showing available data
        let dataHint = '';
        if (csvNodeIds.length === 1) {
            dataHint = `<div class="code-data-hint"># Data available as: df</div>`;
        } else if (csvNodeIds.length > 1) {
            const vars = csvNodeIds.map((_, i) => `df${i + 1}`).join(', ');
            dataHint = `<div class="code-data-hint"># Data available as: ${vars}</div>`;
        }

        // Execution state indicator
        let stateClass = '';
        let stateIndicator = '';
        const selfHealingStatus = this.node.selfHealingStatus;
        const selfHealingAttempt = this.node.selfHealingAttempt;

        if (executionState === 'running') {
            stateClass = 'code-running';
            if (selfHealingAttempt) {
                stateIndicator = `<div class="code-state-indicator code-self-healing">${selfHealingStatus === 'verifying' ? '🔍 Verifying' : '🔧 Self-healing'} (attempt ${selfHealingAttempt}/3)...</div>`;
            } else {
                stateIndicator = '<div class="code-state-indicator">Running...</div>';
            }
        } else if (executionState === 'error') {
            stateClass = 'code-error';
        } else if (selfHealingStatus === 'fixed') {
            // Show success badge if code was self-healed
            stateIndicator = '<div class="code-state-indicator code-self-healed">✅ Self-healed</div>';
        } else if (selfHealingStatus === 'failed') {
            // Show failure badge if self-healing gave up
            stateIndicator = '<div class="code-state-indicator code-self-heal-failed">⚠️ Self-healing failed</div>';
        }

        // Syntax-highlighted read-only code display (click to edit opens modal)
        // Escape HTML to prevent XSS, highlight.js will handle the rest
        const escapedCode = canvas.escapeHtml(code) || '# Click Edit to add code...';

        let html = `<div class="code-node-content ${stateClass}">`;
        html += dataHint;
        html += `<div class="code-display" data-node-id="${this.node.id}">`;
        html += `<pre><code class="language-python">${escapedCode}</code></pre>`;
        html += `</div>`;
        html += stateIndicator;

        // Show inline error if present
        if (this.node.lastError) {
            html += `<div class="code-error-output">${canvas.escapeHtml(this.node.lastError)}</div>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Check if this code node has output to display
     * @returns {boolean}
     */
    hasOutput() {
        return !!(
            this.node.outputHtml ||
            this.node.outputText ||
            this.node.outputStdout ||
            (this.node.installProgress && this.node.installProgress.length > 0)
        );
    }

    /**
     * Render the output panel content (called by canvas for the slide-out panel)
     * @param {Canvas} canvas - Canvas instance for helper methods
     * @returns {string} HTML string
     */
    renderOutputPanel(canvas) {
        const outputHtml = this.node.outputHtml || null;
        const outputText = this.node.outputText || null;
        const outputStdout = this.node.outputStdout || null;
        const installProgress = this.node.installProgress || null;

        let html = `<div class="code-output-panel-content">`;

        // Show installation progress if present (during running state)
        if (installProgress && installProgress.length > 0) {
            html += `<div class="code-install-progress">`;
            for (const msg of installProgress) {
                html += `<div class="install-progress-line">${canvas.escapeHtml(msg)}</div>`;
            }
            html += `</div>`;
        }

        // Show stdout first if present
        if (outputStdout) {
            html += `<pre class="code-output-stdout">${canvas.escapeHtml(outputStdout)}</pre>`;
        }

        // Show result (HTML or text)
        if (outputHtml) {
            html += `<div class="code-output-result code-output-html">${outputHtml}</div>`;
        } else if (outputText) {
            html += `<pre class="code-output-result code-output-text">${canvas.escapeHtml(outputText)}</pre>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Update code content in-place (for streaming updates)
     * @param {string} nodeId - The node ID
     * @param {string} content - New code content
     * @param {boolean} isStreaming - Whether this is a streaming update
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @returns {boolean}
     */
    updateContent(nodeId, content, isStreaming, canvas) {
        // Update the code display in-place
        const wrapper = canvas.nodeElements.get(nodeId);
        if (!wrapper) return false;

        const codeEl = wrapper.querySelector('.code-display code');
        if (codeEl && window.hljs) {
            codeEl.textContent = content;
            codeEl.className = 'language-python';
            delete codeEl.dataset.highlighted;
            window.hljs.highlightElement(codeEl);
        }
        return true;
    }

    /**
     * Get IDs of hidden actions for this node
     * @returns {Array<string>}
     */
    getHiddenActionIds() {
        return ['edit-content']; // Hide default edit, use edit-code instead
    }

    /**
     * Get additional action buttons for this node
     * @returns {Array<string>}
     */
    getAdditionalActions() {
        return [Actions.EDIT_CODE, Actions.GENERATE, Actions.RUN_CODE];
    }

    /**
     * Get keyboard shortcuts for this node
     * @returns {Object}
     */
    getKeyboardShortcuts() {
        const shortcuts = super.getKeyboardShortcuts();
        // Override 'e' to use edit-code instead of edit-content
        shortcuts['e'] = { action: 'edit-code', handler: 'nodeEditCode' };
        // Add Shift+A for AI generate
        shortcuts['A'] = { action: 'generate', handler: 'nodeGenerate', shift: true };
        return shortcuts;
    }

    /**
     * Check if this node supports stop/continue functionality
     * @returns {boolean}
     */
    supportsStopContinue() {
        return true;
    }

    /**
     * Get header buttons for this node
     * @returns {Array<string>}
     */
    getHeaderButtons() {
        return [
            HeaderButtons.NAV_PARENT,
            HeaderButtons.NAV_CHILD,
            HeaderButtons.STOP,
            HeaderButtons.CONTINUE,
            HeaderButtons.COLLAPSE,
            HeaderButtons.RESET_SIZE,
            HeaderButtons.FIT_VIEWPORT,
            HeaderButtons.DELETE,
        ];
    }

    /**
     * Check if this node supports code execution operations
     * @returns {boolean}
     */
    supportsCodeExecution() {
        return true;
    }

    /**
     * Get the code content from this node
     * @returns {string|null}
     */
    getCode() {
        return this.node.code || this.node.content || null;
    }

    /**
     * Show generate UI for AI code generation
     * @param {string} nodeId - The node ID
     * @param {Array<Object>} models - Available model options with {id, name}
     * @param {string} currentModel - Currently selected model ID
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @param {App} _app - App instance for event emission (unused)
     * @returns {boolean}
     */
    showGenerateUI(nodeId, models, currentModel, canvas, _app) {
        const wrapper = canvas.nodeElements.get(nodeId);
        if (!wrapper) return false;

        // Don't add if already present
        if (wrapper.querySelector('.code-generate-input')) return false;

        const div = wrapper.querySelector('.node');
        const codeContent = div.querySelector('.code-node-content');
        if (!codeContent) return false;

        // Create input container with model dropdown defaulting to current model
        const inputHtml = `
            <div class="code-generate-input">
                <input type="text" placeholder="Describe the code to generate..." class="generate-prompt-input" />
                <select class="generate-model-select">
                    ${models
                        .map((m) => {
                            const selected = m.id === currentModel ? 'selected' : '';
                            return `<option value="${canvas.escapeHtml(m.id)}" ${selected}>${canvas.escapeHtml(m.name)}</option>`;
                        })
                        .join('')}
                </select>
                <button class="generate-submit-btn" title="Generate code">→</button>
                <button class="generate-cancel-btn" title="Cancel">×</button>
            </div>
        `;

        // Insert at the beginning of code-node-content (before data hint or editor)
        codeContent.insertAdjacentHTML('afterbegin', inputHtml);

        // Setup event listeners
        const input = codeContent.querySelector('.generate-prompt-input');
        const modelSelect = codeContent.querySelector('.generate-model-select');
        const submitBtn = codeContent.querySelector('.generate-submit-btn');
        const cancelBtn = codeContent.querySelector('.generate-cancel-btn');

        const submit = () => {
            const prompt = input.value.trim();
            const model = modelSelect.value;
            if (prompt) {
                // Emit event through canvas (app listens to this event)
                canvas.emit('nodeGenerateSubmit', nodeId, prompt, model);
            }
        };

        submitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            submit();
        });

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideGenerateUI(nodeId, canvas);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hideGenerateUI(nodeId, canvas);
            }
        });

        // Focus the input
        input.focus();
        return true;
    }

    /**
     * Hide generate UI
     * @param {string} nodeId - The node ID
     * @param {Canvas} canvas - Canvas instance for DOM manipulation
     * @returns {boolean}
     */
    hideGenerateUI(nodeId, canvas) {
        const wrapper = canvas.nodeElements.get(nodeId);
        if (!wrapper) return false;

        const input = wrapper.querySelector('.code-generate-input');
        if (input) {
            input.remove();
            return true;
        }
        return false;
    }

    /**
     * Code-specific event bindings for syntax highlighting initialization
     * @returns {Array<Object>}
     */
    getEventBindings() {
        return [
            // Initialize syntax highlighting after render
            {
                selector: '.code-display',
                event: 'init', // Special event: called after render, not a DOM event
                handler: (_nodeId, e, _canvas) => {
                    if (window.hljs) {
                        const codeEl = e.currentTarget.querySelector('code');
                        if (codeEl) {
                            window.hljs.highlightElement(codeEl);
                        }
                    }
                },
            },
        ];
    }
}

// Register with NodeRegistry
NodeRegistry.register({
    type: NodeType.CODE,
    protocol: CodeNode,
    defaultSize: DEFAULT_NODE_SIZES[NodeType.CODE],
});

// Export CodeNode for testing
export { CodeNode };

// =============================================================================
// Code Feature Plugin
// =============================================================================

/**
 * CodeFeature - Manages code self-healing and error recovery
 *
 * Extension hooks:
 * - selfheal:before - Before self-healing starts (CancellableEvent)
 * - selfheal:error - When code execution encounters an error
 * - selfheal:failed - When max retries are exhausted
 * - selfheal:success - When code executes successfully after fixing
 * - selfheal:fix - Before generating fix prompt (CancellableEvent, can customize prompt)
 */
export class CodeFeature extends FeaturePlugin {
    /**
     *
     * @param context
     */
    constructor(context) {
        super(context);

        // All dependencies are now inherited from FeaturePlugin base class:
        // - this.pyodideRunner
        // - this.streamingManager (unified streaming state)
        // - this.apiUrl
        // - this.buildLLMRequest
        // - this.graph, this.canvas, this.saveSession, etc.
    }

    /**
     * Initialize the feature
     * @returns {Promise<void>}
     */
    async onLoad() {
        console.log('[CodeFeature] Loaded - self-healing enabled');

        // Handle nodeGenerateSubmit from inline AI input (emitted by CodeNode.showGenerateUI)
        this.canvas.on('nodeGenerateSubmit', async (nodeId, prompt, model) => {
            await this.handleNodeGenerateSubmit(nodeId, prompt, model);
        });
    }

    /**
     * Get slash commands for this feature
     * @returns {Array<Object>}
     */
    getSlashCommands() {
        return [
            {
                command: '/code',
                description: 'Create a Python code node',
                placeholder: 'Optional: Describe code to generate...',
            },
        ];
    }

    /**
     * Handle slash command
     * @param {string} command - The slash command
     * @param {string} args - Command arguments
     * @param {Object} context - Command context
     * @returns {Promise<boolean>}
     */
    async handleCommand(command, args, context) {
        if (command === '/code') {
            await this.handleCodeCommand(args);
            return true;
        }
        return false;
    }

    /**
     * Handle /code slash command - creates a Code node, optionally with AI-generated code
     * @param {string} description - Optional prompt for AI code generation
     */
    async handleCodeCommand(description) {
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
            csvNodeIds: csvNodeIds,
        });

        this.graph.addNode(codeNode);
        this.canvas.renderNode(codeNode);

        // Create edges from all selected nodes to code node
        for (const nodeId of selectedIds) {
            const edge = createEdge(nodeId, codeNode.id, EdgeType.REPLY);
            this.graph.addEdge(edge);
        }

        this.canvas.updateAllEdges(this.graph);
        this.canvas.updateAllNavButtonStates(this.graph);
        this.saveSession();

        // Preload Pyodide in the background so it's ready when user clicks Run
        if (this.pyodideRunner) {
            this.pyodideRunner.preload();
        }

        // If description provided, trigger AI generation
        if (hasPrompt) {
            // Use the currently selected model
            const model = this.modelPicker.value;
            await this.handleNodeGenerateSubmit(codeNode.id, description.trim(), model);
        }
    }

    /**
     * Self-heal code by executing and auto-fixing errors
     * @param {string} nodeId - The Code node ID
     * @param {string} originalPrompt - The original user prompt
     * @param {string} model - Model to use for fixes
     * @param {Object} context - Code generation context
     * @param {number} attemptNum - Current attempt number
     * @param {number} maxAttempts - Maximum retry attempts
     */
    async selfHealCode(nodeId, originalPrompt, model, context, attemptNum = 1, maxAttempts = 3) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;
        const wrapped = wrapNode(node);
        if (!wrapped.supportsCodeExecution || !wrapped.supportsCodeExecution()) return;

        // Get the current code via protocol
        const code = wrapped.getCode() || '';
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
        this.emit('selfheal:before', beforeEvent);

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
            const result = await this.pyodideRunner.run(code, csvDataMap, onInstallProgress);

            // Check for errors
            if (result.error) {
                console.log(`❌ Error on attempt ${attemptNum}:`, result.error);

                // Emit selfheal:error hook
                this.emit(
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
                    this.emit(
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
            this.emit(
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
        if (!node) return;
        const wrapped = wrapNode(node);
        if (!wrapped.supportsCodeExecution || !wrapped.supportsCodeExecution()) return;

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
        this.emit('selfheal:fix', fixEvent);

        // Use custom fix prompt if plugin provided one
        if (fixEvent.defaultPrevented && fixEvent.data.customFixPrompt) {
            console.log('[Self-healing] Using custom fix strategy from plugin');
            fixPrompt = fixEvent.data.customFixPrompt;
        }

        try {
            // Show placeholder
            const placeholderCode = `# Fixing error (attempt ${attemptNum + 1}/${maxAttempts})...\n`;
            const codeNode = this.graph.getNode(nodeId);
            if (codeNode) {
                const codeWrapped = wrapNode(codeNode);
                codeWrapped.updateContent(nodeId, placeholderCode, true, this.canvas);
            }
            this.graph.updateNode(nodeId, {
                content: placeholderCode,
                executionState: 'idle', // Clear running state
                selfHealingStatus: 'fixing',
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));

            // Create AbortController and register with StreamingManager (auto-shows stop button)
            const abortController = new AbortController();
            this.streamingManager.register(nodeId, {
                abortController,
                featureId: 'code',
                context: { originalPrompt, model, nodeContext: context },
                // Code self-healing doesn't support continue (would need to restart)
            });

            // Build request body
            const requestBody = this.buildLLMRequest({
                prompt: fixPrompt,
                existing_code: '', // Don't send failed code again in existing_code field
                dataframe_info: context.dataframeInfo,
                context: context.ancestorContext,
            });

            // Stream fixed code
            const response = await fetch(this.apiUrl('/api/generate-code'), {
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
                        const codeNode = this.graph.getNode(nodeId);
                        if (codeNode) {
                            const codeWrapped = wrapNode(codeNode);
                            codeWrapped.updateContent(nodeId, fixedCode, true, this.canvas);
                        }
                    }
                },
                onDone: async () => {
                    // Clean up streaming state (auto-hides stop button)
                    this.streamingManager.unregister(nodeId);

                    // Final update
                    const codeNode = this.graph.getNode(nodeId);
                    if (codeNode) {
                        const codeWrapped = wrapNode(codeNode);
                        codeWrapped.updateContent(nodeId, fixedCode, false, this.canvas);
                    }
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
            // Clean up on error (auto-hides stop button)
            this.streamingManager.unregister(nodeId);

            // Check if it was aborted
            if (error.name === 'AbortError') {
                return;
            }

            // Show error
            console.error('Code fix generation failed:', error);
            const errorCode = `# Code fix generation failed: ${error.message}\n`;
            const codeNode = this.graph.getNode(nodeId);
            if (codeNode) {
                const codeWrapped = wrapNode(codeNode);
                codeWrapped.updateContent(nodeId, errorCode, false, this.canvas);
            }
            this.graph.updateNode(nodeId, {
                content: errorCode,
                selfHealingStatus: 'failed',
            });
            this.saveSession();
        }
    }

    /**
     * Get canvas event handlers for code node functionality.
     * @param {Canvas} _canvas - Canvas instance (unused, kept for interface consistency)
     * @returns {Object} Event name -> handler function mapping
     */
    getCanvasEventHandlers(_canvas) {
        return {
            nodeEditCode: this.handleNodeEditCode.bind(this),
            nodeRunCode: this.handleNodeRunCode.bind(this),
            nodeCodeChange: this.handleNodeCodeChange.bind(this),
            nodeGenerate: this.handleNodeGenerate.bind(this),
            nodeOutputToggle: this.handleNodeOutputToggle.bind(this),
            nodeOutputClear: this.handleNodeOutputClear.bind(this),
            nodeOutputResize: this.handleNodeOutputResize.bind(this),
        };
    }

    /**
     * Handle Run button click on Code node - executes Python with Pyodide
     * @param {string} nodeId - The Code node ID
     * @param {_nodeId} _nodeId - Duplicate nodeId (unused, for streaming manager callback)
     * @returns {Promise<void>}
     */
    async handleNodeRunCode(nodeId, _nodeId) {
        const codeNode = this.graph.getNode(nodeId);
        if (!codeNode) return;
        const wrapped = wrapNode(codeNode);
        if (!wrapped.supportsCodeExecution || !wrapped.supportsCodeExecution()) return;

        // Get code from node via protocol
        const code = wrapped.getCode() || '';

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

        // Set execution state to 'running' and re-render node
        // (CodeNode.renderContent() handles showing "Running..." indicator)
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
                    outputExpanded: true,
                });
                this.canvas.renderNode(this.graph.getNode(nodeId));
                drawerOpenedForInstall = true;
            } else {
                // Just update progress messages
                this.graph.updateNode(nodeId, {
                    installProgress: [...installMessages],
                });
            }
        };

        // Execute code with Pyodide
        try {
            const result = await this.pyodideRunner.run(code, csvDataMap, onInstallProgress);

            // Extract output fields from result
            const stdout = result.stdout?.trim() || null;
            const resultHtml = result.resultHtml || null;
            const resultText = result.resultText || null;
            const hasOutput = !!(stdout || resultHtml || resultText);

            // Update node with execution results
            if (result.error) {
                // Show error if code raised an exception
                this.graph.updateNode(nodeId, {
                    executionState: 'error',
                    lastError: result.error,
                    outputStdout: stdout,
                    outputHtml: null,
                    outputText: null,
                    outputExpanded: true, // Show panel for errors
                    installProgress: drawerOpenedForInstall ? installMessages : null,
                });
            } else {
                // Success - update with output
                this.graph.updateNode(nodeId, {
                    executionState: 'idle',
                    lastError: null,
                    outputStdout: stdout,
                    outputHtml: resultHtml,
                    outputText: resultText,
                    outputExpanded: drawerOpenedForInstall || hasOutput, // Show panel if there's output
                    installProgress: drawerOpenedForInstall ? installMessages : null,
                    installComplete: drawerOpenedForInstall,
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
            }

            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.canvas.updateAllEdges(this.graph);
            this.canvas.updateAllNavButtonStates(this.graph);
            this.saveSession();
        } catch (error) {
            console.error('Code execution error:', error);

            // Show error state in node
            this.graph.updateNode(nodeId, {
                executionState: 'error',
                lastError: error.message || 'Unknown error',
                installProgress: [],
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.saveSession();
        }
    }

    /**
     * Handle code change in editor
     * @param {string} nodeId - The Code node ID
     * @param {string} code - The new code content
     */
    handleNodeCodeChange(nodeId, code) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Update both content and code fields
        this.graph.updateNode(nodeId, {
            content: code,
            code: code,
            executionState: null, // Clear execution state when code changes
            lastError: null,
        });

        // Update the visual display of the node
        const updatedNode = this.graph.getNode(nodeId);
        if (updatedNode) {
            const wrapped = wrapNode(updatedNode);
            // Use updateContent for in-place updates (more efficient than full render)
            if (wrapped.updateContent) {
                wrapped.updateContent(nodeId, code, false, this.canvas);
            } else {
                // Fallback to full render if updateContent not available
                this.canvas.renderNode(updatedNode);
            }
        }

        // Update node title based on code
        const wrapped = wrapNode(node);
        if (typeof wrapped.updateTitle === 'function') {
            wrapped.updateTitle(nodeId, this.canvas);
        }

        this.saveSession();
    }

    /**
     * Handle Edit button click on Code node - opens code editor modal
     * @param {string} nodeId - The Code node ID
     */
    async handleNodeEditCode(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;
        const wrapped = wrapNode(node);
        if (!wrapped.supportsCodeExecution || !wrapped.supportsCodeExecution()) return;

        // Open the code editor modal directly (not the edit content modal)
        this.modalManager.showCodeEditorModal(nodeId);
    }

    /**
     * Handle Generate button click on Code node - shows inline AI input
     * @param {string} nodeId - The Code node ID
     */
    async handleNodeGenerate(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Get models from the model picker
        const modelOptions = Array.from(this.modelPicker.options).map((opt) => ({
            id: opt.value,
            name: opt.textContent,
        }));
        const currentModel = this.modelPicker.value;

        // Show inline AI input using the protocol's showGenerateUI method
        const wrapped = wrapNode(node);
        wrapped.showGenerateUI(nodeId, modelOptions, currentModel, this.canvas, this);
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
                dataframeInfo = await this.pyodideRunner.introspectDataFrames(csvDataMap);

                console.log('📊 DataFrame introspection results:', dataframeInfo);

                // Cache on node for future generations
                this.graph.updateNode(nodeId, { dataframeMetadata: dataframeInfo });
            }
        }

        // Get ancestor context (conversation history)
        const ancestors = this.graph.getAncestors(nodeId);
        const ancestorContext = ancestors
            .filter((n) => ['human', 'ai', 'note', 'pdf', 'fetch_result', 'youtube', 'git_repo'].includes(n.type))
            .map((n) => ({
                role: ['human', 'pdf', 'fetch_result', 'youtube', 'git_repo'].includes(n.type) ? 'user' : 'assistant',
                content: n.content,
            }));

        return { dataframeInfo, ancestorContext, existingCode };
    }

    /**
     * Handle Generate code submission - generates code with AI
     * @param {string} nodeId - The Code node ID
     * @param {string} description - User's prompt for code generation
     * @param {string} model - Model to use
     */
    async handleNodeGenerateSubmit(nodeId, description, model) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Build context for AI generation
        const context = await this.gatherCodeGenerationContext(nodeId);

        // Set node to "generating" state
        const placeholderCode = `# Generating code...\n# ${description}`;
        this.graph.updateNode(nodeId, {
            content: placeholderCode,
            code: placeholderCode,
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));

        // Build request for /api/generate-code endpoint (different format than chat)
        const request = {
            prompt: description,
            existing_code: context.existingCode || null,
            dataframe_info: context.dataframeInfo || [],
            context: context.ancestorContext || [],
            model: model,
        };

        // Add admin credentials if in admin mode
        if (this.adminMode) {
            // Backend handles credentials in admin mode
        } else {
            // Include user-provided credentials
            const apiKey = this.chat.getApiKeyForModel(model);
            const baseUrl = this.chat.getBaseUrlForModel(model);
            request.api_key = apiKey;
            request.base_url = baseUrl;
        }

        // Create abort controller
        const abortController = new AbortController();

        // Register with StreamingManager
        this.streamingManager.register(nodeId, {
            abortController,
            featureId: this.id,
            onStop: (_nodeId) => {
                console.log('[Code] Generation stopped');
            },
            onContinue: async (nodeId, state) => {
                console.log('[Code] Continuing generation');
                await this.handleNodeGenerateSubmit(nodeId, state.prompt, state.model);
            },
        });

        try {
            const response = await fetch(this.apiUrl('/api/generate-code'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
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
                        const codeNode = this.graph.getNode(nodeId);
                        if (codeNode) {
                            const codeWrapped = wrapNode(codeNode);
                            codeWrapped.updateContent(nodeId, generatedCode, true, this.canvas);
                        }
                    }
                },
                onDone: async () => {
                    // Clean up streaming state (auto-hides stop button)
                    this.streamingManager.unregister(nodeId);

                    // Final update ensures editor has final content
                    const codeNode = this.graph.getNode(nodeId);
                    if (codeNode) {
                        const codeWrapped = wrapNode(codeNode);
                        codeWrapped.updateContent(nodeId, generatedCode, false, this.canvas);
                    }
                    this.graph.updateNode(nodeId, { content: generatedCode, code: generatedCode });
                    this.saveSession();

                    // Self-healing: Auto-run and fix errors (max 3 attempts)
                    await this.selfHealCode(nodeId, description, model, context, 1);
                },
                onError: (err) => {
                    throw err;
                },
            });
        } catch (error) {
            // Clean up on error (auto-hides stop button)
            this.streamingManager.unregister(nodeId);

            // Check if it was aborted (user clicked stop)
            if (error.name === 'AbortError') {
                // Leave partial code in place
                return;
            }

            // Show error
            console.error('Code generation failed:', error);
            const errorCode = `# Code generation failed: ${error.message}\n`;
            const codeNode = this.graph.getNode(nodeId);
            if (codeNode) {
                const codeWrapped = wrapNode(codeNode);
                codeWrapped.updateContent(nodeId, errorCode, false, this.canvas);
            }
            this.graph.updateNode(nodeId, { content: errorCode });
            this.saveSession();
        }
    }

    /**
     * Handle output panel toggle
     * @param {string} nodeId - The Code node ID
     */
    handleNodeOutputToggle(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Toggle outputExpanded state
        this.graph.updateNode(nodeId, {
            outputExpanded: !node.outputExpanded,
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));
        this.saveSession();
    }

    /**
     * Handle output clear
     * @param {string} nodeId - The Code node ID
     */
    handleNodeOutputClear(nodeId) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;

        // Clear output
        this.graph.updateNode(nodeId, {
            output: '',
        });
        this.canvas.renderNode(this.graph.getNode(nodeId));
        this.saveSession();
    }

    /**
     * Handle output resize (height change)
     * @param {string} nodeId - The Code node ID
     * @param {number} height - New height in pixels
     */
    handleNodeOutputResize(nodeId, height) {
        const node = this.graph.getNode(nodeId);
        if (!node) return;
        const wrapped = wrapNode(node);
        if (!wrapped.hasOutput || !wrapped.hasOutput()) return;

        this.graph.updateNode(nodeId, { outputPanelHeight: height });
        this.saveSession();
    }
}
