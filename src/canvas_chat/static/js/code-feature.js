/**
 * Code self-healing feature
 *
 * Handles automatic code error detection and fixing through LLM-guided iterations.
 *
 * Extension hooks:
 * - selfheal:before - Before self-healing starts (CancellableEvent)
 * - selfheal:error - When code execution encounters an error
 * - selfheal:failed - When max retries are exhausted
 * - selfheal:success - When code executes successfully after fixing
 * - selfheal:fix - Before generating fix prompt (CancellableEvent, can customize prompt)
 */

import { FeaturePlugin } from './feature-plugin.js';
import { CancellableEvent } from './plugin-events.js';
import { NodeType, EdgeType, createNode, createEdge } from './graph-types.js';
import { readSSEStream } from './sse.js';

/**
 * CodeFeature - Manages code self-healing and error recovery
 */
export class CodeFeature extends FeaturePlugin {
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
     */
    async onLoad() {
        console.log('[CodeFeature] Loaded - self-healing enabled');
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
        this.emit('selfheal:fix', fixEvent);

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
                        this.canvas.updateCodeContent(nodeId, fixedCode, true);
                    }
                },
                onDone: async () => {
                    // Clean up streaming state (auto-hides stop button)
                    this.streamingManager.unregister(nodeId);

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
            // Clean up on error (auto-hides stop button)
            this.streamingManager.unregister(nodeId);

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
}

// ES module export
export { CodeFeature as default };

// Global scope export for backwards compatibility
if (typeof window !== 'undefined') {
    window.CodeFeature = CodeFeature;
}
