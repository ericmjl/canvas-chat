/**
 * CodeMirror 5 setup and utilities
 * Provides a simple API for creating Python code editors
 */

// Wait for CodeMirror to load
if (typeof CodeMirror === 'undefined') {
    console.error('CodeMirror not loaded!');
}

/**
 * Create a CodeMirror editor for Python code
 * @param {HTMLElement} parent - Container element
 * @param {string} initialCode - Initial code content
 * @param {function} onChange - Callback when content changes (receives new code string)
 * @returns {CodeMirror} CodeMirror editor instance
 */
function createPythonEditor(parent, initialCode, onChange) {
    const editor = window.CodeMirror(parent, {
        value: initialCode,
        mode: 'python',
        theme: 'monokai',
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        autoCloseBrackets: true,
        matchBrackets: true,
        extraKeys: {
            "Tab": (cm) => {
                if (cm.somethingSelected()) {
                    cm.indentSelection("add");
                } else {
                    cm.replaceSelection("    ", "end");
                }
            }
        }
    });

    // Listen for changes
    if (onChange) {
        editor.on('change', (cm) => {
            onChange(cm.getValue());
        });
    }

    return editor;
}

/**
 * Update editor content programmatically (for AI generation streaming)
 * @param {CodeMirror} editor - CodeMirror editor instance
 * @param {string} newCode - New code content
 */
function updateEditorContent(editor, newCode) {
    const currentCode = editor.getValue();
    if (currentCode !== newCode) {
        editor.setValue(newCode);
    }
}

/**
 * Get current editor content
 * @param {CodeMirror} editor - CodeMirror editor instance
 * @returns {string} Current code
 */
function getEditorContent(editor) {
    return editor.getValue();
}

/**
 * Destroy editor instance
 * @param {CodeMirror} editor - CodeMirror editor instance
 */
function destroyEditor(editor) {
    if (editor) {
        // Get the wrapper element and remove it
        const wrapper = editor.getWrapperElement();
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
        }
    }
}

// Export for global access
window.CodeMirrorUtils = {
    createPythonEditor,
    updateEditorContent,
    getEditorContent,
    destroyEditor
};

console.log('✓ CodeMirror utilities loaded');
