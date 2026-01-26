/**
 * Pyodide Runner Module
 *
 * Provides lazy-loading Pyodide initialization and Python code execution
 * for CSV data analysis. Supports automatic package installation via micropip.
 */

/* global loadPyodide */

const pyodideRunner = (function() {
    // Private state
    let pyodide = null;
    let loadingPromise = null;
    let loadingState = 'idle';  // 'idle' | 'loading' | 'ready'
    const installedPackages = new Set(['pandas', 'numpy']);  // Track installed packages
    const stateListeners = new Set();  // Callbacks for state changes

    /**
     * Yield to the browser to allow UI updates and user interactions.
     * Uses requestAnimationFrame + setTimeout for reliable yielding.
     * @param {number} minDelay - Minimum delay in ms after RAF (default: 0)
     * @returns {Promise<void>}
     */
    function yieldToBrowser(minDelay = 0) {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                if (minDelay > 0) {
                    setTimeout(resolve, minDelay);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Notify all listeners of state change
     * @param state
     */
    function notifyStateChange(state) {
        loadingState = state;
        for (const listener of stateListeners) {
            try {
                listener(state);
            } catch (e) {
                console.error('State listener error:', e);
            }
        }
    }

    /**
     * Subscribe to loading state changes
     * @param {function} callback - Called with state: 'idle' | 'loading' | 'ready'
     * @returns {function} Unsubscribe function
     */
    function onStateChange(callback) {
        stateListeners.add(callback);
        // Immediately call with current state
        callback(loadingState);
        return () => stateListeners.delete(callback);
    }

    /**
     * Get current loading state
     * @returns {'idle' | 'loading' | 'ready'}
     */
    function getState() {
        return loadingState;
    }

    /**
     * Extract import statements from Python code
     * @param {string} code - Python source code
     * @returns {string[]} - List of package names to import
     */
    function extractImports(code) {
        const imports = [];
        const lines = code.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            // Match: import package
            const simpleImport = trimmed.match(/^import\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (simpleImport) {
                imports.push(simpleImport[1]);
            }

            // Match: from package import ...
            const fromImport = trimmed.match(/^from\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (fromImport) {
                imports.push(fromImport[1]);
            }
        }

        return [...new Set(imports)];  // Deduplicate
    }

    /**
     * Map common import names to their pip package names
     */
    const PACKAGE_ALIASES = {
        'sklearn': 'scikit-learn',
        'cv2': 'opencv-python',
        'PIL': 'Pillow',
        'bs4': 'beautifulsoup4',
    };

    /**
     * Packages that are built into Pyodide or the browser
     */
    const BUILTIN_PACKAGES = new Set([
        // Python stdlib
        'os', 'sys', 'io', 'json', 're', 'math', 'random', 'datetime',
        'collections', 'itertools', 'functools', 'operator', 'string',
        'time', 'typing', 'pathlib', 'csv', 'copy', 'base64', 'hashlib',
        'urllib', 'email', 'html', 'xml', 'sqlite3', 'pickle', 'gzip',
        'zipfile', 'tarfile', 'tempfile', 'shutil', 'glob', 'fnmatch',
        'logging', 'warnings', 'traceback', 'inspect', 'abc', 'contextlib',
        'textwrap', 'difflib', 'pprint', 'decimal', 'fractions', 'statistics',
        'struct', 'codecs', 'unicodedata', 'locale', 'calendar',
        // Pyodide built-ins
        'micropip', 'js', 'pyodide',
    ]);

    /**
     * Packages available in Pyodide (prebuilt wasm packages)
     * Note: This is kept for documentation/reference; micropip handles availability
     */
    const _PYODIDE_PACKAGES = new Set([
        'numpy', 'pandas', 'scipy', 'matplotlib', 'seaborn',
        'scikit-learn', 'statsmodels', 'networkx', 'sympy',
        'Pillow', 'lxml', 'beautifulsoup4', 'html5lib',
        'pyyaml', 'regex', 'pyparsing', 'packaging',
        'jinja2', 'markupsafe', 'certifi', 'charset-normalizer',
        'idna', 'requests', 'urllib3', 'six', 'python-dateutil',
        'pytz', 'tzdata', 'setuptools', 'wheel', 'pip',
    ]);

    /**
     * Install packages via micropip if needed
     * @param {string[]} packages - List of package names
     * @param {function} onProgress - Optional callback for progress updates (msg) => void
     * @throws {Error} If package installation fails
     */
    async function autoInstallPackages(packages, onProgress = null) {
        if (!pyodide) return;

        const toInstall = [];
        const failed = [];

        for (const pkg of packages) {
            // Skip builtins
            if (BUILTIN_PACKAGES.has(pkg)) continue;

            // Skip already installed
            if (installedPackages.has(pkg)) continue;

            // Map aliases
            const pipName = PACKAGE_ALIASES[pkg] || pkg;

            toInstall.push({ importName: pkg, pipName });
        }

        if (toInstall.length === 0) return;

        const msg = `📦 Installing packages: ${toInstall.map(p => p.pipName).join(', ')}`;
        console.log(msg);
        if (onProgress) {
            onProgress(msg);
            // Yield to browser to allow UI updates before blocking operation
            await yieldToBrowser(10);
        }

        // Ensure micropip is loaded before trying to use it
        let micropip;
        try {
            micropip = pyodide.pyimport('micropip');
        } catch (e) {
            console.log('micropip not loaded, loading now...');
            await pyodide.loadPackage('micropip');
            micropip = pyodide.pyimport('micropip');
        }

        for (const { importName, pipName } of toInstall) {
            try {
                // Try Pyodide prebuilt packages first (faster)
                const tryMsg = `📦 Installing ${pipName}...`;
                console.log(tryMsg);
                if (onProgress) {
                    onProgress(tryMsg);
                    // Yield to browser before the blocking loadPackage call
                    await yieldToBrowser(10);
                }

                await pyodide.loadPackage(pipName);
                installedPackages.add(importName);

                const successMsg = `✅ Installed ${pipName} (Pyodide)`;
                console.log(successMsg);
                if (onProgress) {
                    onProgress(successMsg);
                    await yieldToBrowser();
                }
            } catch (pyodideErr) {
                // Fall back to micropip for pure Python packages
                try {
                    const fallbackMsg = `📦 Trying micropip for ${pipName}...`;
                    console.log(fallbackMsg);
                    if (onProgress) {
                        onProgress(fallbackMsg);
                        // Yield to browser before the blocking micropip call
                        await yieldToBrowser(10);
                    }

                    await micropip.install(pipName);
                    installedPackages.add(importName);

                    const successMsg = `✅ Installed ${pipName} (micropip)`;
                    console.log(successMsg);
                    if (onProgress) {
                        onProgress(successMsg);
                        await yieldToBrowser();
                    }
                } catch (micropipErr) {
                    const failMsg = `❌ Failed to install ${pipName}`;
                    console.error(failMsg, micropipErr);
                    if (onProgress) {
                        onProgress(failMsg);
                        await yieldToBrowser();
                    }
                    failed.push(pipName);
                }
            }
        }

        // If any packages failed, throw an error with helpful message
        if (failed.length > 0) {
            throw new Error(
                `Failed to install packages: ${failed.join(', ')}\n\n` +
                `These packages may not be available in Pyodide or PyPI.\n` +
                `Try using alternatives or check package names.`
            );
        }
    }

    /**
     * Initialize Pyodide (lazy loading)
     * @returns {Promise<Pyodide>}
     */
    async function ensureLoaded() {
        if (pyodide) return pyodide;

        if (loadingPromise) return loadingPromise;

        notifyStateChange('loading');

        loadingPromise = (async () => {
            console.log('Loading Pyodide...');
            const startTime = Date.now();

            // loadPyodide is provided by the CDN script
            pyodide = await loadPyodide({
                indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
            });

            // Load core packages
            await pyodide.loadPackage(['pandas', 'numpy', 'micropip']);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`Pyodide loaded in ${elapsed}s`);

            notifyStateChange('ready');

            return pyodide;
        })();

        return loadingPromise;
    }

    /**
     * Preload Pyodide in the background (fire and forget)
     * Call this when a code node is created to start loading early
     */
    function preload() {
        if (loadingState === 'idle') {
            ensureLoaded().catch(err => {
                console.error('Pyodide preload failed:', err);
                notifyStateChange('idle');  // Reset on failure
            });
        }
    }

    /**
     * Check if Pyodide is loaded
     * @returns {boolean}
     */
    function isLoaded() {
        return pyodide !== null;
    }

    /**
     * Run Python code with CSV data injected as DataFrames
     *
     * @param {string} code - Python code to execute
     * @param {Object} csvDataMap - Map of variable names to CSV strings (e.g., { df: "a,b\n1,2" })
     * @param {function} onInstallProgress - Optional callback for package installation progress
     * @returns {Promise<{stdout: string, returnValue: any, figures: string[], error: string|null}>}
     */
    async function run(code, csvDataMap, onInstallProgress = null) {
        await ensureLoaded();

        // Extract imports and install packages
        const imports = extractImports(code);
        await autoInstallPackages(imports, onInstallProgress);

        // Prepare the execution environment
        const setupCode = `
import sys
import io
import pandas as pd
import numpy as np

# Capture stdout
_stdout_capture = io.StringIO()
sys.stdout = _stdout_capture

# Track matplotlib figures
_figures = []

# Set up matplotlib for non-interactive backend if used
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    # Patch plt.show to capture figures
    _original_show = plt.show
    def _capture_show(*args, **kwargs):
        import base64
        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
            buf.seek(0)
            _figures.append('data:image/png;base64,' + base64.b64encode(buf.read()).decode('utf-8'))
            plt.close(fig)
    plt.show = _capture_show
except ImportError:
    pass
`;

        // Inject CSV data as DataFrames
        let dataInjection = '';
        for (const [varName, csvString] of Object.entries(csvDataMap)) {
            // Escape the CSV string for Python
            const escaped = csvString
                .replace(/\\/g, '\\\\')
                .replace(/"""/g, '\\"\\"\\"')
                .replace(/\n/g, '\\n');
            dataInjection += `${varName} = pd.read_csv(io.StringIO("""${escaped}"""))\n`;
        }

        // Wrap user code to capture return value
        const wrappedCode = `
${setupCode}
${dataInjection}

# User code - handle last expression specially for notebook-like behavior
_result = None
_user_code = '''${code.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'''

# Parse the code to separate statements from final expression
import ast
try:
    _tree = ast.parse(_user_code)
    if _tree.body:
        # Check if last statement is an expression (not assignment, etc.)
        _last = _tree.body[-1]
        if isinstance(_last, ast.Expr):
            # Execute all but the last statement
            if len(_tree.body) > 1:
                _exec_tree = ast.Module(body=_tree.body[:-1], type_ignores=[])
                exec(compile(_exec_tree, '<user>', 'exec'))
            # Eval the last expression to get its value
            _expr_tree = ast.Expression(body=_last.value)
            _result = eval(compile(_expr_tree, '<user>', 'eval'))
        else:
            # Last statement is not an expression, just exec everything
            exec(compile(_tree, '<user>', 'exec'))
except SyntaxError as e:
    raise e

# Capture any pending matplotlib figures
try:
    import matplotlib.pyplot as plt
    if plt.get_fignums():
        plt.show()
except:
    pass

# Restore stdout
sys.stdout = sys.__stdout__

# Get rich representation of result
_result_html = None
_result_text = None
if _result is not None:
    # Try _repr_html_ first (pandas DataFrames, etc.)
    if hasattr(_result, '_repr_html_'):
        try:
            _result_html = _result._repr_html_()
        except:
            pass
    # Fallback to repr/str
    try:
        _result_text = repr(_result)
    except:
        try:
            _result_text = str(_result)
        except:
            _result_text = '<unprintable object>'

# Return results
{
    'stdout': _stdout_capture.getvalue(),
    'resultHtml': _result_html,
    'resultText': _result_text,
    'figures': _figures,
    'error': None
}
`;

        try {
            const result = await pyodide.runPythonAsync(wrappedCode);
            return result.toJs({ dict_converter: Object.fromEntries });
        } catch (err) {
            return {
                stdout: '',
                returnValue: null,
                figures: [],
                error: err.message || String(err)
            };
        }
    }

    /**
     * Introspect DataFrames to get metadata for AI code generation
     * @param {Object} csvDataMap - Map of {varName: csvString}
     * @returns {Promise<Array>} Array of {varName, columns, dtypes, shape, head}
     */
    async function introspectDataFrames(csvDataMap) {
        await ensureLoaded();

        const results = [];

        for (const [varName, csvData] of Object.entries(csvDataMap)) {
            try {
                // Escape the CSV data for Python string literal
                const escaped = csvData.replace(/\\/g, '\\\\').replace(/"""/g, '\\"""');

                const code = `
import pandas as pd
import io
import json

${varName} = pd.read_csv(io.StringIO("""${escaped}"""))

# Gather metadata
info = {
    "varName": "${varName}",
    "columns": list(${varName}.columns),
    "dtypes": {col: str(dtype) for col, dtype in ${varName}.dtypes.items()},
    "shape": list(${varName}.shape),
    "head": ${varName}.head(3).to_csv(index=False)
}

# Print as JSON (not repr, so it's valid JSON)
print(json.dumps(info))
`;

                // Run introspection code
                const result = await run(code, {});

                if (result.error) {
                    console.warn(`Failed to introspect ${varName}:`, result.error);
                    continue;
                }

                // Parse the JSON result from stdout (we print() it in Python)
                const jsonString = result.stdout?.trim();
                if (!jsonString) {
                    console.warn(`No stdout result for ${varName} introspection`);
                    continue;
                }

                const metadata = JSON.parse(jsonString);
                results.push(metadata);

            } catch (err) {
                console.warn(`Failed to introspect ${varName}:`, err);
            }
        }

        return results;
    }

    // Public API
    return {
        ensureLoaded,
        isLoaded,
        run,
        extractImports,
        preload,
        getState,
        onStateChange,
        introspectDataFrames,
    };
})();

// Export for browser
window.pyodideRunner = pyodideRunner;
