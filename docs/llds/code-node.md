# CodeNode Low-Level Design

**Created**: 2026-03-16
**Status**: Implementation
**Related HLD**: [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The CodeNode enables users to write, execute, and debug Python code directly within the canvas environment. This node type exists because LLM workflows frequently require data analysis, computation, and visualization that cannot be accomplished through natural language alone.

### Why a Dedicated Code Node?

The HLD establishes that Canvas-Chat is fundamentally a chat application with visual second. The CodeNode extends this philosophy by enabling computational workflows that complement conversational AI. Several design principles guide its implementation.

First, browser-based execution via Pyodide eliminates the need for a backend code execution service, keeping all computation local and avoiding security concerns associated with server-side code execution. Users can run Python code without any server infrastructure.

Second, self-healing on errors means that when code fails, the system automatically attempts to fix the error using the LLM, providing a form of "self-healing" code that reduces the friction of debugging. This is particularly valuable for users who may not be fluent in Python.

Third, DataFrame integration allows code nodes to automatically access data from linked CSV, Excel, or Prism nodes, enabling data analysis workflows where users can ask questions about their data in natural language and receive executable code that produces results.

Fourth, visual output in the drawer panel displays execution results, errors, and matplotlib figures directly in the canvas, maintaining the visual coherence of the application while providing rich feedback.

## Technical Details

### Architecture Overview

The CodeNode implementation consists of three primary modules working in concert.

```text
CodeNode Architecture:
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
├─────────────────────────────────────────────────────────────────┤
│  plugins/code.js                                               │
│  ├── CodeNode (node protocol) - Rendering, actions, shortcuts  │
│  └── CodeFeature (feature plugin) - /code cmd, self-healing    │
├─────────────────────────────────────────────────────────────────┤
│  pyodide-runner.js - Pyodide runtime management                │
├─────────────────────────────────────────────────────────────────┤
│  modal-manager.js - Code editor modal                           │
├─────────────────────────────────────────────────────────────────┤
│  index.html - Code editor modal HTML                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                 │
├─────────────────────────────────────────────────────────────────┤
│  plugins/code_handler.py                                        │
│  └── /api/generate-code - LLM-powered code generation          │
└─────────────────────────────────────────────────────────────────┘
```

### Pyodide Runtime in Browser

The `pyodide-runner.js` module provides lazy-loading Pyodide initialization and Python code execution. This is the core runtime that enables browser-based Python execution.

#### Lazy Loading Strategy

Pyodide is loaded on-demand to minimize initial page load time. The loading process follows this flow.

```javascript
async function ensureLoaded() {
    if (pyodide) return pyodide;

    loadingPromise = (async () => {
        // Load Pyodide from CDN
        pyodide = await loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
        });

        // Pre-load core packages
        await pyodide.loadPackage(['pandas', 'numpy', 'micropip']);

        return pyodide;
    })();

    return loadingPromise;
}
```

The module exposes a `preload()` function that CodeFeature calls when a code node is created, starting Pyodide loading in the background so it is ready when the user clicks Run.

#### Package Management

Pyodide supports both prebuilt WebAssembly packages and pure Python packages via micropip. The `autoInstallPackages` function handles automatic installation.

```javascript
async function autoInstallPackages(packages, onProgress) {
    // First try Pyodide prebuilt packages (faster)
    await pyodide.loadPackage(pipName);

    // Fall back to micropip for pure Python packages
    await micropip.install(pipName);
}
```

The function extracts import statements from user code, determines which packages need installation, and installs them before execution. Progress callbacks allow the UI to display installation status.

#### DataFrame Injection

When code nodes are linked to CSV, Excel, or Prism nodes, the CSV data is injected as pandas DataFrames into the Pyodide environment.

```javascript
// Inject CSV data as DataFrames
for (const [varName, csvString] of Object.entries(csvDataMap)) {
    // Escape and inject
    dataInjection += `${varName} = pd.read_csv(io.StringIO("""${escaped}"""))\n`;
}
```

A single linked node becomes `df`, while multiple linked nodes become `df`, `df1`, `df2`, etc.

#### Code Execution

The `run()` function executes Python code and captures output, including stdout, return values, and matplotlib figures.

```javascript
async function run(code, csvDataMap, onInstallProgress) {
    await ensureLoaded();

    // Extract imports and install packages
    const imports = extractImports(code);
    await autoInstallPackages(imports, onInstallProgress);

    // Wrap user code to capture return value (notebook-style)
    const wrappedCode = `
        # Setup: capture stdout, setup matplotlib
        ${setupCode}

        # Inject DataFrames
        ${dataInjection}

        # Execute user code
        # Handle last expression specially for notebook-like behavior
        _result = None
        if isinstance(_last, ast.Expr):
            _result = eval(compile(...))
        else:
            exec(compile(...))

        # Return results as dict
        { 'stdout': ..., 'resultHtml': ..., 'resultText': ..., 'figures': [] }
    `;

    const result = await pyodide.runPythonAsync(wrappedCode);
    return result.toJs({ dict_converter: Object.fromEntries });
}
```

The execution environment captures matplotlib figures and converts them to base64-encoded data URLs, which can then be rendered as Image nodes in the canvas.

### Code Node Protocol (CodeNode)

The `CodeNode` class in `plugins/code.js` extends `BaseNode` and implements the node protocol for code nodes. This defines how code nodes are rendered and what interactions they support.

#### Rendering

```javascript
class CodeNode extends BaseNode {
    renderContent(canvas) {
        const code = this.node.code || this.node.content || '';
        const executionState = this.node.executionState || 'idle';

        // Build HTML with syntax highlighting, execution state, errors
        let html = `<div class="code-node-content ${stateClass}">`;
        html += `<div class="code-display"><pre><code class="language-python">${escapedCode}</code></pre></div>`;
        html += stateIndicator;
        if (this.node.lastError) {
            html += `<div class="code-error-output">${error}</div>`;
        }
        html += `</div>`;

        return html;
    }
}
```

The `renderContent` method produces HTML that displays the code with syntax highlighting (via highlight.js), execution state indicators (Running..., error, self-healing status), and inline error messages.

#### Output Panel

The drawer-style output panel is rendered by the `renderOutputPanel` method.

```javascript
renderOutputPanel(canvas) {
    const outputHtml = this.node.outputHtml || null;
    const outputText = this.node.outputText || null;
    const outputStdout = this.node.outputStdout || null;
    const installProgress = this.node.installProgress || null;

    let html = `<div class="code-output-panel-content">`;
    if (installProgress) {
        html += `<div class="code-install-progress">...</div>`;
    }
    if (outputStdout) {
        html += `<pre class="code-output-stdout">${stdout}</pre>`;
    }
    if (outputHtml) {
        html += `<div class="code-output-result code-output-html">${outputHtml}</div>`;
    } else if (outputText) {
        html += `<pre class="code-output-result code-output-text">${text}</pre>`;
    }
    html += `</div>`;
    return html;
}
```

The Canvas module (`canvas.js`) handles the drawer animation and positioning, rendering the output panel as a foreignObject that slides out from beneath the node.

#### Actions and Shortcuts

Code nodes provide custom actions and keyboard shortcuts.

```javascript
getAdditionalActions() {
    return [Actions.EDIT_CODE, Actions.GENERATE, Actions.RUN_CODE];
}

getKeyboardShortcuts() {
    const shortcuts = super.getKeyboardShortcuts();
    shortcuts['e'] = { action: 'edit-code', handler: 'nodeEditCode' };
    shortcuts['A'] = { action: 'generate', handler: 'nodeGenerate', shift: true };
    return shortcuts;
}
```

The 'e' key opens the code editor modal instead of the generic edit content modal. Shift+A opens the inline AI code generation input.

### Code Editor Modal

The code editor modal is implemented in `modal-manager.js` and rendered in `index.html`. It provides a split-pane interface with the code editor on the left and a live syntax-highlighted preview on the right.

#### HTML Structure

```html
<div id="code-editor-modal" class="modal" style="display: none">
    <div class="modal-content modal-extra-wide">
        <div class="modal-header">
            <h2>Edit Code</h2>
        </div>
        <div class="modal-body code-editor-body">
            <div class="code-editor-pane edit-pane">
                <textarea id="code-editor-textarea" spellcheck="false"></textarea>
            </div>
            <div class="code-editor-pane preview-pane">
                <pre id="code-editor-preview"><code class="language-python"></code></pre>
            </div>
        </div>
        <div class="modal-actions">
            <button id="code-editor-cancel">Cancel</button>
            <button id="code-editor-save">Save</button>
        </div>
    </div>
</div>
```

#### Live Preview

The modal updates the preview pane on every keystroke using highlight.js.

```javascript
updateCodeEditorPreview() {
    const textarea = document.getElementById('code-editor-textarea');
    const preview = document.getElementById('code-editor-preview');
    const code = textarea.value;

    const codeEl = preview.querySelector('code');
    if (codeEl && window.hljs) {
        codeEl.textContent = code;
        window.hljs.highlightElement(codeEl);
    }
}
```

This provides immediate feedback on code validity and structure without requiring the code to be executed.

### CodeFeature Plugin

The `CodeFeature` class extends `FeaturePlugin` and provides the slash command handling and self-healing functionality.

#### Slash Command

```javascript
getSlashCommands() {
    return [
        {
            command: '/code',
            description: 'Create a Python code node',
            placeholder: 'Optional: Describe code to generate...',
        },
    ];
}
```

The `/code` command creates a new code node. If the user provides arguments, it triggers AI code generation. If CSV/Excel/Prism nodes are selected, the code node is pre-populated with a template that includes the DataFrames.

#### Self-Healing

The self-healing mechanism automatically attempts to fix code errors by asking the LLM to regenerate the code.

```javascript
async selfHealCode(nodeId, originalPrompt, model, context, attemptNum = 1, maxAttempts = 3) {
    // Run the code
    const result = await this.pyodideRunner.run(code, csvDataMap, onInstallProgress);

    if (result.error) {
        if (attemptNum >= maxAttempts) {
            // Show final error
            return;
        }

        // Ask LLM to fix the error
        await this.fixCodeError(nodeId, originalPrompt, model, context,
                                 code, result.error, attemptNum, maxAttempts);
        return;
    }

    // Success - store output
}
```

The flow is as follows. First, the code is executed with Pyodide. If it succeeds, the output is stored and displayed. If it fails, the error message is sent to the LLM along with the original prompt, asking for a fix. This process repeats up to 3 times.

#### Fix Prompt Generation

```javascript
async fixCodeError(nodeId, originalPrompt, model, context, failedCode, errorMessage, attemptNum) {
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

    // Stream fixed code, then re-run with selfHealCode
}
```

### DataFrame Introspection

Before generating code, the system introspects linked DataFrames to provide the LLM with schema information.

```javascript
async introspectDataFrames(csvDataMap) {
    const results = [];

    for (const [varName, csvData] of Object.entries(csvDataMap)) {
        const code = `
${varName} = pd.read_csv(io.StringIO("""${escaped}"""))
info = {
    "varName": "${varName}",
    "columns": list(${varName}.columns),
    "dtypes": {col: str(dtype) for col, dtype in ${varName}.dtypes.items()},
    "shape": list(${varName}.shape),
    "head": ${varName}.head(3).to_csv(index=False)
}
print(json.dumps(info))
`;
        const result = await run(code, {});
        results.push(JSON.parse(result.stdout));
    }

    return results;
}
```

This metadata is sent to the LLM when generating code, ensuring it uses the correct column names and data types.

### Backend Code Generation

The backend `/api/generate-code` endpoint uses LiteLLM to generate Python code from natural language prompts.

```python
@app.post("/api/generate-code")
async def generate_code(request: GenerateCodeRequest, http_request: Request):
    # Build system prompt with DataFrame context
    system_parts = []
    system_parts.append("You are a Python code generator. Output ONLY valid Python code.")

    # Add DataFrame context
    if request.dataframe_info:
        for df_info in request.dataframe_info:
            system_parts.append(f"Variable: {df_info.varName}")
            system_parts.append(f"Columns: {df_info.columns}")
            system_parts.append(f"Sample: {df_info.head}")

    # Add conversation context
    if request.context:
        system_parts.append(f"[{msg.role}]: {msg.content}")

    # Stream response
    response = await litellm.acompletion(
        model=request.model,
        messages=[{"role": "system", "content": system_prompt},
                  {"role": "user", "content": request.prompt}],
        stream=True
    )

    async for chunk in response:
        yield {"event": "message", "data": chunk.choices[0].delta.content}
```

The backend is a thin proxy that constructs prompts and streams responses. All code execution happens in the browser.

## Output Panel Rendering

The drawer-style output panel is implemented in `canvas.js` and follows a consistent pattern used by other node types (PowerPointNode, MatrixNode, etc.).

### Positioning

The panel is positioned beneath the node with a slight overlap, creating the effect of sliding out from underneath.

```javascript
const panelWidthRatio = 0.9;
const panelWidth = nodeWidth * panelWidthRatio;
const panelX = nodeX + (nodeWidth - panelWidth) / 2;

// Slides out from underneath with overlap
const panelOverlap = 10;
const panelY = nodeY + nodeHeight - panelOverlap;
```

### Collapsed and Expanded States

The panel has two states. The collapsed state shows only a small toggle tab (24px height). The expanded state shows the full content up to the configured height (default 200px, user-resizable).

```javascript
const collapsedHeight = 24;
const actualHeight = outputExpanded ? panelHeight : collapsedHeight;
```

### Animation

When the panel first expands, it animates from collapsed to expanded for a smooth visual effect.

```javascript
if (shouldAnimate) {
    // Start collapsed
    panelWrapper.setAttribute('height', collapsedHeight + panelOverlap);
    panelBody.style.opacity = '0';

    // Animate to expanded
    // ... animation code with CSS transitions
}
```

### Toggle and Resize

The panel footer contains a toggle button and a resize handle for user interaction.

```javascript
panelDiv.innerHTML = `
    <div class="code-output-panel-inner">
        <div class="code-output-panel-body">
            ${wrapped.renderOutputPanel(this)}
        </div>
        <div class="code-output-panel-footer">
            <button class="code-output-toggle">▲/▼</button>
            <div class="code-output-resize-handle"></div>
        </div>
    </div>
`;
```

## Open Questions & Future Decisions

### Resolved

1. ✅ Python via Pyodide - best ecosystem for data analysis
2. ✅ Self-healing mechanism - up to 3 auto-fix attempts

### Deferred

1. Multi-language support (R via WebR, JavaScript)
2. Advanced editor features (Monaco, CodeMirror)
3. Code persistence/version history
4. Collaborative editing support
5. Server-side execution option

## References to HLD

This LLD supports several design decisions from the High-Level Design.

1. **Local-First** (HLD Section 4.1): All code execution happens in the browser via Pyodide. No code is sent to the backend for execution, keeping user data local and eliminating security concerns.

2. **Plugin-Extensible** (HLD Section 4.3): CodeFeature is implemented as a feature plugin with extension hooks for self-healing events (`selfheal:before`, `selfheal:error`, `selfheal:fix`, `selfheal:success`, `selfheal:failed`). This allows other plugins to customize or intercept the self-healing process.

3. **Data Nodes** (HLD Section 6): CodeNode integrates with Data nodes (CSV, Excel, Prism) by automatically injecting their csvData as DataFrames. This enables natural language data analysis workflows.

4. **Streaming-First** (HLD Section 4.4): Code generation streams token-by-token into the editor. The StreamingManager coordinates multiple concurrent code generations if needed.

5. **Chat-First, Visual Second** (HLD Section 2): The /code slash command creates a code node that can then be executed, with results displayed visually in the canvas. The node integrates seamlessly with the conversational workflow.
