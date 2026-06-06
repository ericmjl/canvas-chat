/**
 * Realtime Agent Plugin (Built-in)
 *
 * Provides voice-based agent interaction via WebSocket.
 * The user clicks a mic button to start a realtime session,
 * speaks into their microphone, and receives streaming AI
 * responses with tool calls that create canvas nodes.
 *
 * EARS: RT-SESSION-010 through RT-SESSION-029, RT-AUDIO-001 through RT-AUDIO-014
 */

import { FeaturePlugin } from '../feature-plugin.js';
import { EdgeType, NodeType, createEdge, createNode } from '../graph-types.js';
import { createNodeFromInstruction, gatherViewportContext } from '../agent-utils.js';

/**
 *
 */
class RealtimeAgentPlugin extends FeaturePlugin {
    /**
     * @param {Object} context
     */
    constructor(context) {
        super(context);
        this.ws = null;
        this.sessionActive = false;
        this.refToNodeId = new Map();
        this.agentNodeId = null;
        this.statusEl = null;
        this._reconnectAttempted = false;
        this._audioContext = null;
        this._audioWorklet = null;
        this._audioStream = null;
        this._workletRegistered = false;
    }

    /**
     * @returns {string}
     */
    get id() {
        return 'realtime-agent';
    }

    /**
     * @spec RT-SESSION-010
     * @spec RT-SESSION-012
     * @spec RT-SESSION-026
     * @returns {Promise<void>}
     */
    async onLoad() {
        this.injectCSS(`
            .mic-btn {
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: none;
                background: transparent;
                color: var(--text-secondary);
                border-radius: var(--radius-md);
                cursor: pointer;
                transition: color 0.15s, background 0.15s;
                flex-shrink: 0;
            }
            .mic-btn:hover:not(:disabled) {
                color: var(--accent);
                background: var(--bg-secondary);
            }
            .mic-btn:active:not(:disabled) {
                transform: scale(0.95);
            }
            .mic-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            .mic-btn.mic-inactive {
                color: var(--text-secondary);
            }
            .mic-btn.mic-connecting {
                color: #eab308;
                animation: mic-pulse 1s ease-in-out infinite;
            }
            .mic-btn.mic-listening {
                color: #22c55e;
                animation: mic-pulse 1.5s ease-in-out infinite;
            }
            .mic-btn.mic-processing {
                color: #3b82f6;
                animation: mic-spin 1s linear infinite;
            }
            .mic-btn.mic-error {
                color: #ef4444;
            }
            @keyframes mic-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }
            @keyframes mic-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .realtime-status {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 12px;
                font-size: 12px;
                color: var(--text-muted, #888);
                background: var(--bg-secondary, #f5f5f5);
                border-radius: var(--radius-sm);
                margin-bottom: 4px;
                max-width: 800px;
                margin-left: auto;
                margin-right: auto;
            }
            .realtime-status .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #22c55e;
                animation: mic-pulse 1.5s ease-in-out infinite;
                flex-shrink: 0;
            }
            .realtime-status .status-provider {
                font-weight: 500;
            }
            .realtime-status .transcription {
                font-style: italic;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 400px;
            }
        `);

        const sendBtn = document.getElementById('send-btn');
        if (!sendBtn) return;

        const micBtn = document.createElement('button');
        micBtn.id = 'mic-btn';
        micBtn.className = 'mic-btn mic-inactive';
        micBtn.title = 'Start voice session';
        micBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>`;
        micBtn.addEventListener('click', () => this.toggleMic());
        sendBtn.parentNode.insertBefore(micBtn, sendBtn.nextSibling);

        const statusEl = document.createElement('div');
        statusEl.className = 'realtime-status';
        statusEl.style.display = 'none';
        statusEl.innerHTML = `
            <span class="status-dot"></span>
            <span class="status-provider"></span>
            <span class="transcription"></span>
        `;
        const container = document.getElementById('chat-input-container');
        const wrapper = container.querySelector('.chat-input-wrapper');
        container.insertBefore(statusEl, wrapper);
        this.statusEl = statusEl;

    }

    /**
     * @spec RT-SESSION-015
     * @returns {Promise<void>}
     */
    async toggleMic() {
        if (this.sessionActive) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    /**
     * @spec RT-PROV-023
     * @spec RT-SESSION-014
     * @returns {Promise<void>}
     */
    async connect() {
        const openaiApiKey = this.storage?.getApiKeyForProvider('openai') || null;
        const geminiApiKey = this._getGeminiApiKey();
        if (!openaiApiKey && !geminiApiKey) {
            this.showToast('Add an OpenAI or Gemini API key in Settings for voice input');
            return;
        }

        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${location.host}/ws/agent`;

        this.setMicState('connecting');
        this._reconnectAttempted = false;

        this.ws = new WebSocket(wsUrl);

        this.refToNodeId = new Map();
        const fullContent = { value: '' };
        const lastToolParentId = { value: null };
        const lastSearchNodeId = { value: null };
        const referenceOffsetY = { value: 0 };

        const agentNode = createNode(NodeType.AI, 'Listening...', {
            position: this.graph.autoPosition([]),
            model: 'Voice',
        });
        this.graph.addNode(agentNode);
        this.canvas.zoomToSelectionAnimated([agentNode.id], 0.8, 300);
        this.agentNodeId = agentNode.id;

        this.ws.onopen = () => {
            const viewportContext = gatherViewportContext(this.graph, this.canvas);
            const openaiBaseUrl = this.storage?.getBaseUrl() || null;
            this.ws.send(JSON.stringify({
                type: 'session_start',
                openai_api_key: openaiApiKey,
                gemini_api_key: geminiApiKey,
                openai_base_url: openaiBaseUrl,
                viewport_context: viewportContext,
            }));
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleServerMessage(
                    msg, agentNode.id, fullContent,
                    lastToolParentId, lastSearchNodeId, referenceOffsetY
                );
            } catch (e) {
                console.warn('[RealtimeAgent] Failed to parse message:', e);
            }
        };

        this.ws.onerror = () => {
            this.setMicState('error');
            this.showToast('WebSocket connection error');
        };

        this.ws.onclose = () => {
            // RT-SESSION-014: attempt one reconnect
            if (this.sessionActive && !this._reconnectAttempted) {
                this._reconnectAttempted = true;
                this.showToast('Connection lost — reconnecting...');
                this.connect();
                return;
            }

            if (this.sessionActive) {
                this.showToast('Session ended');
            }
            this.sessionActive = false;
            this.setMicState('inactive');
            this.hideStatus();
        };
    }

    /**
     * @spec RT-PROV-024
     * @spec RT-SESSION-016
     * @param {Object} msg
     * @param {string} agentNodeId
     * @param {Object} fullContent - { value: string }
     * @param {Object} lastToolParentId - { value: string|null }
     * @param {Object} lastSearchNodeId - { value: string|null }
     * @param {Object} referenceOffsetY - { value: number }
     */
    handleServerMessage(msg, agentNodeId, fullContent, lastToolParentId, lastSearchNodeId, referenceOffsetY) {
        const { type, data } = msg;

        switch (type) {
            case 'session_ready':
                this.sessionActive = true;
                this.setMicState('listening');
                this.showStatus(data?.provider || '');
                this.startRecording();
                break;

            case 'text':
                fullContent.value += (data?.content || '');
                this.canvas.updateNodeContent(agentNodeId, fullContent.value, true);
                this.graph.updateNode(agentNodeId, { content: fullContent.value });
                break;

            case 'node_create': {
                const instruction = typeof data === 'string' ? JSON.parse(data) : data;
                if (instruction.type === 'search') {
                    referenceOffsetY.value = 0;
                }
                const parentId = lastToolParentId.value || agentNodeId;
                const newId = createNodeFromInstruction(
                    instruction, parentId,
                    lastSearchNodeId, referenceOffsetY.value, this.refToNodeId,
                    this.graph, this.canvas, createNode, createEdge, NodeType, EdgeType,
                    () => this.saveSession(),
                    (nodeId, code) => this.executeCodeOnNode(nodeId, code)
                );
                if (newId) {
                    if (instruction.ref) this.refToNodeId.set(instruction.ref, newId);
                    if (instruction.type === 'search') {
                        lastToolParentId.value = newId;
                        lastSearchNodeId.value = newId;
                    } else if (instruction.type === 'reference') {
                        referenceOffsetY.value += 200;
                    } else {
                        lastToolParentId.value = newId;
                    }
                }
                break;
            }

            case 'tool_start':
                this.setMicState('processing');
                break;

            case 'tool_result':
                this.setMicState('listening');
                break;

            /**
             * @spec RT-AUDIO-009
             */
            case 'listening':
                this.setMicState('listening');
                break;

            /**
             * @spec RT-AUDIO-010
             */
            case 'processing':
                this.setMicState('processing');
                break;

            case 'transcription':
                if (data?.text) this.updateStatusText(data.text);
                break;

            case 'timeout_warning':
                this.showToast(`Session closing in ${data?.seconds_remaining}s`);
                break;

            case 'session_closed':
                this.showToast(
                    data?.reason === 'timeout'
                        ? 'Session ended due to inactivity'
                        : 'Session closed'
                );
                this.disconnect();
                break;

            case 'error':
                this.showToast(data?.message || 'Error');
                if (data?.message?.includes('rate')) {
                    this.disconnect();
                }
                break;

            case 'pong':
                break;
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async disconnect() {
        this.stopRecording();
        this.sessionActive = false;
        if (this.ws) {
            try { this.ws.send(JSON.stringify({ type: 'close' })); } catch (e) { /* ignore */ }
            try { this.ws.close(); } catch (e) { /* ignore */ }
            this.ws = null;
        }
        this.setMicState('inactive');
        this.hideStatus();
        if (this.agentNodeId) {
            this.saveSession();
            if (this.generateNodeSummary) {
                this.generateNodeSummary(this.agentNodeId);
            }
        }
    }

    /**
     * @spec RT-AUDIO-001
     * @spec RT-AUDIO-002
     * @spec RT-AUDIO-014
     * @returns {Promise<void>}
     */
    async startRecording() {
        try {
            this._audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            this.showToast('Microphone not available: ' + e.message);
            this.setMicState('error');
            return;
        }

        if (!this._audioContext) {
            this._audioContext = new AudioContext({ sampleRate: 48000 });
        }

        if (!this._workletRegistered) {
            try {
                await this._audioContext.audioWorklet.addModule('/static/js/realtime-audio-worklet.js');
                this._workletRegistered = true;
            } catch (e) {
                this.showToast('Audio processor failed to load');
                this._releaseAudioResources();
                this.setMicState('error');
                return;
            }
        }

        const source = this._audioContext.createMediaStreamSource(this._audioStream);
        this._audioWorklet = new AudioWorkletNode(this._audioContext, 'realtime-audio-processor');

        this._audioWorklet.port.onmessage = (event) => {
            if (event.data instanceof Int16Array) {
                const base64 = this._pcm16ToBase64(event.data);
                if (this.ws && this.sessionActive) {
                    this.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
                }
            }
        };

        source.connect(this._audioWorklet);
        this._audioWorklet.connect(this._audioContext.destination);
    }

    /**
     * @spec RT-AUDIO-007
     * @spec RT-AUDIO-008
     */
    stopRecording() {
        if (this.ws && this.sessionActive) {
            try { this.ws.send(JSON.stringify({ type: 'input_end' })); } catch (e) { /* ignore */ }
        }
        this._releaseAudioResources();
    }

    /**
     * @spec RT-AUDIO-008
     * @spec RT-AUDIO-011
     */
    _releaseAudioResources() {
        if (this._audioWorklet) {
            try { this._audioWorklet.disconnect(); } catch (e) { /* ignore */ }
            this._audioWorklet = null;
        }
        if (this._audioStream) {
            this._audioStream.getTracks().forEach((t) => t.stop());
            this._audioStream = null;
        }
        if (this._audioContext && this._audioContext.state !== 'closed') {
            try { this._audioContext.close(); } catch (e) { /* ignore */ }
            this._audioContext = null;
            this._workletRegistered = false;
        }
    }

    /**
     * @spec RT-AUDIO-005
     * @param {Int16Array} int16Array
     * @returns {string}
     */
    _pcm16ToBase64(int16Array) {
        const bytes = new Uint8Array(int16Array.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * @spec RT-AUDIO-012
     * @param {string} text
     */
    sendText(text) {
        if (this.ws && this.sessionActive) {
            this.ws.send(JSON.stringify({ type: 'text', data: text }));
        }
    }

    /**
     * @spec RT-SESSION-011
     * @param {string} state
     */
    setMicState(state) {
        const btn = document.getElementById('mic-btn');
        if (!btn) return;
        btn.className = 'mic-btn';
        switch (state) {
            case 'connecting':
                btn.classList.add('mic-connecting');
                btn.title = 'Connecting...';
                break;
            case 'listening':
                btn.classList.add('mic-listening');
                btn.title = 'Listening (click to stop)';
                break;
            case 'processing':
                btn.classList.add('mic-processing');
                btn.title = 'Processing...';
                break;
            case 'error':
                btn.classList.add('mic-error');
                btn.title = 'Error — click to retry';
                break;
            default:
                btn.classList.add('mic-inactive');
                btn.title = 'Start voice session';
                break;
        }
    }

    /**
     * @returns {string|null}
     */
    _getGeminiApiKey() {
        return this.storage?.getApiKeyForProvider('gemini') || null;
    }

    /**
     * @spec RT-SESSION-013
     * @param {string} provider
     */
    showStatus(provider) {
        if (!this.statusEl) return;
        this.statusEl.style.display = 'flex';
        const providerEl = this.statusEl.querySelector('.status-provider');
        if (providerEl) providerEl.textContent = provider;
        const transcriptionEl = this.statusEl.querySelector('.transcription');
        if (transcriptionEl) transcriptionEl.textContent = '';
    }

    /**
     *
     */
    hideStatus() {
        if (this.statusEl) {
            this.statusEl.style.display = 'none';
        }
    }

    /**
     * @param {string} text
     */
    updateStatusText(text) {
        if (!this.statusEl) return;
        const el = this.statusEl.querySelector('.transcription');
        if (el) el.textContent = text;
    }

    /**
     * @param {string} nodeId
     * @param {string} code
     * @returns {Promise<void>}
     */
    async executeCodeOnNode(nodeId, code) {
        const pyodideRunner = this.pyodideRunner;
        if (!pyodideRunner) {
            console.warn('[RealtimeAgent] Pyodide not available for code execution');
            return;
        }

        this.graph.updateNode(nodeId, { executionState: 'running', code });
        this.canvas.renderNode(this.graph.getNode(nodeId));

        try {
            const csvDataMap = {};
            const csvNodeIds = this.graph.getNode(nodeId)?.csvNodeIds || [];
            for (const csvId of csvNodeIds) {
                const csvNode = this.graph.getNode(csvId);
                if (csvNode && csvNode.csvData) {
                    const varName = `df${csvNodeIds.indexOf(csvId) + 1}`;
                    csvDataMap[varName] = csvNode.csvData;
                }
            }

            const result = await pyodideRunner.run(code, csvDataMap, (_msg) => {});

            this.graph.updateNode(nodeId, {
                executionState: 'idle',
                lastError: null,
                outputStdout: result.stdout || null,
                outputHtml: result.resultHtml || null,
                outputText: result.resultText || null,
            });

            if (result.figures?.length > 0) {
                for (let i = 0; i < result.figures.length; i++) {
                    const fig = result.figures[i];
                    const position = this.graph.autoPosition([nodeId]);

                    if (typeof fig === 'object' && fig.type === 'plotly') {
                        const outputNode = createNode(NodeType.HTML, '', {
                            position,
                            title: result.figures.length === 1 ? 'Plot' : `Plot ${i + 1}`,
                            content: fig.html,
                        });
                        this.graph.addNode(outputNode);
                        this.canvas.panToNodeAnimated(outputNode.id);
                        this.graph.addEdge(createEdge(nodeId, outputNode.id, EdgeType.GENERATES));
                        this.canvas.renderNode(outputNode);
                    } else {
                        const dataUrl = typeof fig === 'string' ? fig : fig.image;
                        const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                        if (base64Match) {
                            const outputNode = createNode(NodeType.IMAGE, '', {
                                position,
                                title: result.figures.length === 1 ? 'Figure' : `Figure ${i + 1}`,
                                imageData: base64Match[2],
                                mimeType: base64Match[1],
                            });
                            this.graph.addNode(outputNode);
                            this.canvas.panToNodeAnimated(outputNode.id);
                            this.graph.addEdge(createEdge(nodeId, outputNode.id, EdgeType.GENERATES));
                            this.canvas.renderNode(outputNode);
                        }
                    }
                }
            }

            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.canvas.updateAllEdges(this.graph);
            this.saveSession();
        } catch (error) {
            this.graph.updateNode(nodeId, {
                executionState: 'error',
                lastError: error.message || 'Unknown error',
            });
            this.canvas.renderNode(this.graph.getNode(nodeId));
            this.saveSession();
        }
    }
}

export { RealtimeAgentPlugin };
