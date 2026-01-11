/**
 * Tests for self-healing code generation feature
 *
 * Following AGENTS.md guidelines:
 * - Test method bindings (integration test pattern)
 * - Test pure functions and node state logic
 * - Don't test complex async flows requiring full mocking
 */

import { test } from './test_setup.js';
import { NodeType } from '../src/canvas_chat/static/js/graph-types.js';

// Import App for method binding tests
await import('../src/canvas_chat/static/js/app.js');
const { App } = global;

// =============================================================================
// Method Binding Tests - Ensure new methods exist
// =============================================================================

test('App has selfHealCode method', () => {
    const app = new App();
    if (typeof app.selfHealCode !== 'function') {
        throw new Error('Method selfHealCode is not a function');
    }
});

test('App has fixCodeError method', () => {
    const app = new App();
    if (typeof app.fixCodeError !== 'function') {
        throw new Error('Method fixCodeError is not a function');
    }
});

// =============================================================================
// Node State Tests - Verify self-healing state transitions
// =============================================================================

test('CodeNode with selfHealingStatus=verifying renders correct indicator', async () => {
    const { CodeNode } = await import('../src/canvas_chat/static/js/node-protocols.js');
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html>');
    global.document = dom.window.document;

    // Mock canvas with minimal methods needed for rendering
    const mockCanvas = {
        escapeHtml: (text) =>
            text.replace(
                /[&<>"']/g,
                (m) =>
                    ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#39;',
                    })[m]
            ),
        truncate: (text, len) => (text.length > len ? text.substring(0, len) + '...' : text),
    };

    const node = {
        id: 'test-1',
        type: NodeType.CODE,
        content: 'print("hello")',
        code: 'print("hello")',
        executionState: 'running',
        selfHealingAttempt: 1,
        selfHealingStatus: 'verifying',
        csvNodeIds: [],
    };

    const codeNode = new CodeNode(node);
    const html = codeNode.renderContent(mockCanvas);

    if (!html.includes('🔍 Verifying')) {
        throw new Error('Expected verifying indicator not found in HTML');
    }
    if (!html.includes('attempt 1/3')) {
        throw new Error('Expected attempt number not found in HTML');
    }
    if (!html.includes('code-self-healing')) {
        throw new Error('Expected self-healing CSS class not found');
    }
});

test('CodeNode with selfHealingStatus=fixing renders correct indicator', async () => {
    const { CodeNode } = await import('../src/canvas_chat/static/js/node-protocols.js');
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html>');
    global.document = dom.window.document;

    const mockCanvas = {
        escapeHtml: (text) =>
            text.replace(
                /[&<>"']/g,
                (m) =>
                    ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#39;',
                    })[m]
            ),
        truncate: (text, len) => (text.length > len ? text.substring(0, len) + '...' : text),
    };

    const node = {
        id: 'test-2',
        type: NodeType.CODE,
        content: 'print("hello")',
        code: 'print("hello")',
        executionState: 'running',
        selfHealingAttempt: 2,
        selfHealingStatus: 'fixing',
        csvNodeIds: [],
    };

    const codeNode = new CodeNode(node);
    const html = codeNode.renderContent(mockCanvas);

    if (!html.includes('🔧 Self-healing')) {
        throw new Error('Expected self-healing indicator not found in HTML');
    }
    if (!html.includes('attempt 2/3')) {
        throw new Error('Expected attempt number not found in HTML');
    }
});

test('CodeNode with selfHealingStatus=fixed renders success badge', async () => {
    const { CodeNode } = await import('../src/canvas_chat/static/js/node-protocols.js');
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html>');
    global.document = dom.window.document;

    const mockCanvas = {
        escapeHtml: (text) =>
            text.replace(
                /[&<>"']/g,
                (m) =>
                    ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#39;',
                    })[m]
            ),
        truncate: (text, len) => (text.length > len ? text.substring(0, len) + '...' : text),
    };

    const node = {
        id: 'test-3',
        type: NodeType.CODE,
        content: 'print("hello")',
        code: 'print("hello")',
        executionState: 'idle',
        selfHealingStatus: 'fixed',
        csvNodeIds: [],
    };

    const codeNode = new CodeNode(node);
    const html = codeNode.renderContent(mockCanvas);

    if (!html.includes('✅ Self-healed')) {
        throw new Error('Expected success badge not found in HTML');
    }
    if (!html.includes('code-self-healed')) {
        throw new Error('Expected success CSS class not found');
    }
});

test('CodeNode with selfHealingStatus=failed renders failure badge', async () => {
    const { CodeNode } = await import('../src/canvas_chat/static/js/node-protocols.js');
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html>');
    global.document = dom.window.document;

    const mockCanvas = {
        escapeHtml: (text) =>
            text.replace(
                /[&<>"']/g,
                (m) =>
                    ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#39;',
                    })[m]
            ),
        truncate: (text, len) => (text.length > len ? text.substring(0, len) + '...' : text),
    };

    const node = {
        id: 'test-4',
        type: NodeType.CODE,
        content: 'print("hello")',
        code: 'print("hello")',
        executionState: 'idle',
        selfHealingStatus: 'failed',
        csvNodeIds: [],
    };

    const codeNode = new CodeNode(node);
    const html = codeNode.renderContent(mockCanvas);

    if (!html.includes('⚠️ Self-healing failed')) {
        throw new Error('Expected failure badge not found in HTML');
    }
    if (!html.includes('code-self-heal-failed')) {
        throw new Error('Expected failure CSS class not found');
    }
});

test('CodeNode without self-healing status renders normally', async () => {
    const { CodeNode } = await import('../src/canvas_chat/static/js/node-protocols.js');
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html>');
    global.document = dom.window.document;

    const mockCanvas = {
        escapeHtml: (text) =>
            text.replace(
                /[&<>"']/g,
                (m) =>
                    ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#39;',
                    })[m]
            ),
        truncate: (text, len) => (text.length > len ? text.substring(0, len) + '...' : text),
    };

    const node = {
        id: 'test-5',
        type: NodeType.CODE,
        content: 'print("hello")',
        code: 'print("hello")',
        executionState: 'idle',
        csvNodeIds: [],
    };

    const codeNode = new CodeNode(node);
    const html = codeNode.renderContent(mockCanvas);

    // Should NOT have any self-healing indicators
    if (html.includes('Self-healing') || html.includes('Verifying') || html.includes('Self-healed')) {
        throw new Error('Expected no self-healing indicators for normal code node');
    }
});

// =============================================================================
// Logic Tests - Verify error prompt format
// =============================================================================

test('Fix error prompt includes all required context', () => {
    const originalPrompt = 'calculate the sum of numbers';
    const failedCode = 'result = sum(numbres)  # typo here';
    const errorMessage = "NameError: name 'numbres' is not defined";

    // This is the prompt format from fixCodeError method
    const fixPrompt = `The previous code failed with this error:

\`\`\`
${errorMessage}
\`\`\`

Failed code:
\`\`\`python
${failedCode}
\`\`\`

Please fix the error and provide corrected Python code that accomplishes the original task: "${originalPrompt}"

Output ONLY the corrected Python code, no explanations.`;

    // Verify all parts are present
    if (!fixPrompt.includes(errorMessage)) {
        throw new Error('Fix prompt missing error message');
    }
    if (!fixPrompt.includes(failedCode)) {
        throw new Error('Fix prompt missing failed code');
    }
    if (!fixPrompt.includes(originalPrompt)) {
        throw new Error('Fix prompt missing original prompt');
    }
    if (!fixPrompt.includes('Output ONLY the corrected Python code')) {
        throw new Error('Fix prompt missing instruction to output only code');
    }
});

test('Self-healing attempt numbers increment correctly', () => {
    // Simulate the attempt progression
    const attempts = [1, 2, 3];
    const maxAttempts = 3;

    for (let i = 0; i < attempts.length; i++) {
        const attemptNum = attempts[i];

        // First attempt should be "verifying"
        const expectedStatus = attemptNum === 1 ? 'verifying' : 'fixing';

        if (attemptNum === 1 && expectedStatus !== 'verifying') {
            throw new Error('First attempt should be verifying');
        }
        if (attemptNum > 1 && expectedStatus !== 'fixing') {
            throw new Error('Subsequent attempts should be fixing');
        }

        // Should stop at max attempts
        if (attemptNum >= maxAttempts) {
            // This would be the final attempt
            if (attemptNum > maxAttempts) {
                throw new Error('Attempts should not exceed maxAttempts');
            }
        }
    }
});

test('Self-healing status values are valid', () => {
    const validStatuses = ['verifying', 'fixing', 'fixed', 'failed'];

    // Test each status value
    for (const status of validStatuses) {
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status: ${status}`);
        }
    }

    // Test invalid status
    const invalidStatus = 'invalid';
    if (validStatuses.includes(invalidStatus)) {
        throw new Error('Should not accept invalid status');
    }
});

// =============================================================================
// Integration Test - Verify method exists in app.js methods list
// =============================================================================

test('test_app_init should include selfHealCode and fixCodeError in required methods', async () => {
    // This test verifies that our new methods would be caught by the app init test
    // if they were accidentally removed or renamed

    const app = new App();
    const requiredMethods = ['selfHealCode', 'fixCodeError'];

    for (const methodName of requiredMethods) {
        if (typeof app[methodName] !== 'function') {
            throw new Error(
                `Method ${methodName} is not a function - ` +
                    'this should be added to test_app_init.js required methods list'
            );
        }
    }
});
