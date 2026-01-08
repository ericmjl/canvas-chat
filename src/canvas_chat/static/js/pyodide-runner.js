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
    const installedPackages = new Set(['pandas', 'numpy']);  // Track installed packages

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
     */
    async function autoInstallPackages(packages) {
        if (!pyodide) return;

        const toInstall = [];

        for (const pkg of packages) {
            // Skip builtins
            if (BUILTIN_PACKAGES.has(pkg)) continue;

            // Skip already installed
            if (installedPackages.has(pkg)) continue;

            // Map aliases
            const pipName = PACKAGE_ALIASES[pkg] || pkg;

            toInstall.push(pipName);
        }

        if (toInstall.length === 0) return;

        console.log('Installing packages:', toInstall);

        try {
            await pyodide.loadPackagesFromImports(`import ${toInstall.join(', ')}`);
            for (const pkg of toInstall) {
                installedPackages.add(pkg);
            }
        } catch (err) {
            // Try micropip as fallback
            console.log('Falling back to micropip for:', toInstall);
            const micropip = pyodide.pyimport('micropip');
            for (const pkg of toInstall) {
                try {
                    await micropip.install(pkg);
                    installedPackages.add(pkg);
                } catch (installErr) {
                    console.warn(`Failed to install ${pkg}:`, installErr);
                }
            }
        }
    }

    /**
     * Initialize Pyodide (lazy loading)
     * @returns {Promise<Pyodide>}
     */
    async function ensureLoaded() {
        if (pyodide) return pyodide;

        if (loadingPromise) return loadingPromise;

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

            return pyodide;
        })();

        return loadingPromise;
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
     * @returns {Promise<{stdout: string, returnValue: any, figures: string[], error: string|null}>}
     */
    async function run(code, csvDataMap) {
        await ensureLoaded();

        // Extract imports and install packages
        const imports = extractImports(code);
        await autoInstallPackages(imports);

        // Check if matplotlib is used
        const useMatplotlib = imports.includes('matplotlib') ||
                              imports.includes('plt') ||
                              code.includes('matplotlib') ||
                              code.includes('plt.');

        // Load matplotlib if needed
        if (useMatplotlib && !installedPackages.has('matplotlib')) {
            await pyodide.loadPackage('matplotlib');
            installedPackages.add('matplotlib');
        }

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

# User code
_result = None
try:
    _result = eval(compile('''${code.replace(/'/g, "\\'")}''', '<user>', 'eval'))
except SyntaxError:
    exec(compile('''${code.replace(/'/g, "\\'")}''', '<user>', 'exec'))

# Capture any pending matplotlib figures
try:
    import matplotlib.pyplot as plt
    if plt.get_fignums():
        plt.show()
except:
    pass

# Restore stdout
sys.stdout = sys.__stdout__

# Return results
{
    'stdout': _stdout_capture.getvalue(),
    'returnValue': repr(_result) if _result is not None else None,
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

    // Public API
    return {
        ensureLoaded,
        isLoaded,
        run,
        extractImports,
    };
})();

// Export for browser
window.pyodideRunner = pyodideRunner;
