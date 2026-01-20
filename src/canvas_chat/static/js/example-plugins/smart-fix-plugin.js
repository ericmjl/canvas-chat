/**
 * SmartFixPlugin - Example extension plugin for code self-healing
 *
 * Demonstrates Level 3 plugin capabilities: extending core app behavior
 * through extension hooks without modifying core code.
 *
 * Features:
 * - Custom fix strategies for ImportError
 * - Analytics tracking for self-healing success/failure
 * - Skip self-healing for specific error patterns
 */

import { FeaturePlugin } from '../feature-plugin.js';

/**
 * SmartFixPlugin - Extension plugin for enhanced code self-healing
 */
class SmartFixPlugin extends FeaturePlugin {
    /**
     * Create a SmartFixPlugin instance
     * @param {AppContext} context
     */
    constructor(context) {
        super(context);

        // Track statistics
        this.stats = {
            totalAttempts: 0,
            successes: 0,
            failures: 0,
            customFixes: 0,
            errorTypes: {},
        };
    }

    /**
     * Lifecycle hook: Initialize plugin
     * @returns {Promise<void>}
     */
    async onLoad() {
        console.log('[SmartFixPlugin] Loaded - Enhanced self-healing active');
    }

    /**
     * Subscribe to self-healing hooks
     * @returns {Object}
     */
    getEventSubscriptions() {
        return {
            'selfheal:before': this.onBeforeHeal.bind(this),
            'selfheal:error': this.onError.bind(this),
            'selfheal:fix': this.onFix.bind(this),
            'selfheal:success': this.onSuccess.bind(this),
            'selfheal:failed': this.onFailed.bind(this),
        };
    }

    /**
     * Hook: Before self-healing begins
     * Can prevent self-healing for specific cases
     * @param {Object} event
     */
    onBeforeHeal(event) {
        this.stats.totalAttempts++;
        console.log(`[SmartFixPlugin] Self-healing attempt ${event.data.attemptNum}/${event.data.maxAttempts}`);

        // Example: Skip self-healing for syntax errors after first attempt
        const { code, attemptNum } = event.data;
        if (code.includes('SyntaxError') && attemptNum > 1) {
            console.log('[SmartFixPlugin] Skipping self-heal: Syntax errors unlikely to self-fix');
            event.preventDefault();
        }
    }

    /**
     * Hook: When code execution fails
     * Track error patterns for analytics
     * @param {Object} event
     */
    onError(event) {
        const { error } = event.data;

        // Extract error type
        const errorType = this.extractErrorType(error);
        this.stats.errorTypes[errorType] = (this.stats.errorTypes[errorType] || 0) + 1;

        console.log(`[SmartFixPlugin] Error detected: ${errorType}`);
    }

    /**
     * Hook: Before LLM is asked to fix code
     * Provide custom fix strategies for known error patterns
     * @param {Object} event
     */
    onFix(event) {
        const { errorMessage, failedCode, originalPrompt } = event.data;

        // Custom handling for ImportError
        if (errorMessage.includes('ImportError: No module named')) {
            const module = this.extractMissingModule(errorMessage);
            if (module) {
                console.log(`[SmartFixPlugin] Custom fix for missing module: ${module}`);
                event.data.customFixPrompt = this.buildImportFixPrompt(failedCode, module, originalPrompt);
                event.preventDefault();
                this.stats.customFixes++;
                return;
            }
        }

        // Custom handling for NameError (undefined variable)
        if (errorMessage.includes('NameError: name')) {
            const variable = this.extractUndefinedVariable(errorMessage);
            if (variable) {
                console.log(`[SmartFixPlugin] Custom fix for undefined variable: ${variable}`);
                event.data.customFixPrompt = this.buildNameErrorFixPrompt(failedCode, variable, originalPrompt);
                event.preventDefault();
                this.stats.customFixes++;
                return;
            }
        }

        // Custom handling for AttributeError
        if (errorMessage.includes('AttributeError')) {
            console.log('[SmartFixPlugin] Adding context for AttributeError');
            event.data.customFixPrompt = this.buildAttributeErrorFixPrompt(failedCode, errorMessage, originalPrompt);
            event.preventDefault();
            this.stats.customFixes++;
        }
    }

    /**
     * Hook: When self-healing succeeds
     * Track success metrics
     * @param {Object} event
     */
    onSuccess(event) {
        this.stats.successes++;
        const { attemptNum } = event.data;

        console.log(`[SmartFixPlugin] Success after ${attemptNum} attempt(s)`);
        console.log(`[SmartFixPlugin] Success rate: ${this.getSuccessRate().toFixed(1)}%`);

        // Show toast for multi-attempt successes
        if (attemptNum > 1 && this.showToast) {
            this.showToast(`Code fixed automatically after ${attemptNum} attempts`, 'success');
        }
    }

    /**
     * Hook: When self-healing exhausts all attempts
     * Provide helpful suggestions
     * @param {Object} event
     */
    onFailed(event) {
        this.stats.failures++;
        const { error } = event.data;

        console.log('[SmartFixPlugin] Self-healing failed');
        console.log(`[SmartFixPlugin] Success rate: ${this.getSuccessRate().toFixed(1)}%`);

        // Provide helpful error messages
        const errorType = this.extractErrorType(error);
        const suggestion = this.getSuggestionForError(errorType);

        if (suggestion && this.showToast) {
            this.showToast(suggestion, 'info');
        }
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Extract error type from error message
     * @param {string} error
     * @returns {string}
     */
    extractErrorType(error) {
        const match = error.match(/^(\w+Error)/);
        return match ? match[1] : 'UnknownError';
    }

    /**
     * Extract missing module name from ImportError
     * @param {string} errorMessage
     * @returns {string|null}
     */
    extractMissingModule(errorMessage) {
        const match = errorMessage.match(/No module named ['"](\w+)['"]/);
        return match ? match[1] : null;
    }

    /**
     * Extract undefined variable from NameError
     * @param {string} errorMessage
     * @returns {string|null}
     */
    extractUndefinedVariable(errorMessage) {
        const match = errorMessage.match(/name ['"](\w+)['"]/);
        return match ? match[1] : null;
    }

    /**
     * Build custom fix prompt for ImportError
     * @param {string} failedCode
     * @param {string} module
     * @param {string} originalPrompt
     * @returns {string}
     */
    buildImportFixPrompt(failedCode, module, originalPrompt) {
        return `The code is missing the Python package "${module}".

Failed code:
\`\`\`python
${failedCode}
\`\`\`

Please fix by adding a pip install comment at the top:
# %pip install ${module}

Then provide the corrected code that accomplishes: "${originalPrompt}"

Output ONLY the corrected Python code with the pip install line, no explanations.`;
    }

    /**
     * Build custom fix prompt for NameError
     * @param {string} failedCode
     * @param {string} variable
     * @param {string} originalPrompt
     * @returns {string}
     */
    buildNameErrorFixPrompt(failedCode, variable, originalPrompt) {
        return `The code references an undefined variable "${variable}".

Failed code:
\`\`\`python
${failedCode}
\`\`\`

Please fix by:
1. Defining "${variable}" before using it, OR
2. Checking if "${variable}" was a typo

Original task: "${originalPrompt}"

Output ONLY the corrected Python code, no explanations.`;
    }

    /**
     * Build custom fix prompt for AttributeError
     * @param {string} failedCode
     * @param {string} errorMessage
     * @param {string} originalPrompt
     * @returns {string}
     */
    buildAttributeErrorFixPrompt(failedCode, errorMessage, originalPrompt) {
        return `The code has an AttributeError:

\`\`\`
${errorMessage}
\`\`\`

Failed code:
\`\`\`python
${failedCode}
\`\`\`

This usually means:
- Using a method/attribute that doesn't exist on the object
- Operating on None instead of the expected object
- Wrong object type

Original task: "${originalPrompt}"

Output ONLY the corrected Python code, no explanations.`;
    }

    /**
     * Get success rate percentage
     * @returns {number}
     */
    getSuccessRate() {
        const total = this.stats.successes + this.stats.failures;
        return total > 0 ? (this.stats.successes / total) * 100 : 0;
    }

    /**
     * Get suggestion for specific error type
     * @param {string} errorType
     * @returns {string}
     */
    getSuggestionForError(errorType) {
        const suggestions = {
            SyntaxError: 'Check for missing parentheses, quotes, or colons',
            IndentationError: 'Ensure consistent indentation (use spaces, not tabs)',
            NameError: 'Check variable names for typos',
            TypeError: "Check that you're using the right data types",
            AttributeError: "Verify the object has the method/attribute you're calling",
            KeyError: 'Check that the dictionary key exists',
            IndexError: 'Check array/list bounds',
            ValueError: 'Check that values are in the expected range/format',
        };

        return suggestions[errorType] || 'Try rephrasing your prompt or simplifying the request';
    }

    /**
     * Get statistics report
     * @returns {Object}
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.getSuccessRate(),
        };
    }
}

export { SmartFixPlugin };
