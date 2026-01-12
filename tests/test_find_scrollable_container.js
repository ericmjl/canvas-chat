/**
 * Tests for findScrollableContainer function
 *
 * This function finds the best scrollable container for wheel events by:
 * 1. Finding all potential scroll containers from target up to document
 * 2. Returning the first one that actually has scrollable content
 *
 * The key insight: an element with overflow: auto but scrollHeight === clientHeight
 * is NOT scrollable, even though its CSS suggests it might be. We need to find
 * the ancestor that actually has overflow.
 */

import { test, assertEqual, assertTrue } from './test_setup.js';
import { findScrollableContainer } from '../src/canvas_chat/static/js/scroll-utils.js';
import { JSDOM } from 'jsdom';

// ============================================================
// Test: Prefers ancestor with actual overflow over closer element without
// ============================================================

test('findScrollableContainer: returns null when no scrollable containers exist', () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <div class="node">
            <div class="node-content" style="overflow: visible;">
                <div class="code-display" style="overflow: visible;">
                    <pre><code class="target">code here</code></pre>
                </div>
            </div>
        </div>
    `);

    // Set up global window for getComputedStyle
    global.window = dom.window;

    const target = dom.window.document.querySelector('.target');
    const result = findScrollableContainer(target);

    assertEqual(result, null);
});

test('findScrollableContainer: finds scrollable node-content when code-display has no overflow', () => {
    // This simulates the bug we fixed: code-display has overflow: auto but
    // scrollHeight === clientHeight, while node-content actually has overflow
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <style>
            .node-content {
                overflow: auto;
                height: 100px;
            }
            .code-display {
                overflow: auto;
                height: 200px;
            }
        </style>
        <div class="node">
            <div class="node-content">
                <div class="code-node-content">
                    <div class="code-display">
                        <pre><code class="target">code here</code></pre>
                    </div>
                </div>
            </div>
        </div>
    `);

    // Set up global window
    global.window = dom.window;

    const document = dom.window.document;
    const nodeContent = document.querySelector('.node-content');
    const codeDisplay = document.querySelector('.code-display');
    const target = document.querySelector('.target');

    // Simulate the scenario: code-display has no overflow, node-content does
    // jsdom doesn't compute scrollHeight properly, so we mock the properties
    Object.defineProperty(codeDisplay, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(codeDisplay, 'clientHeight', { value: 200, configurable: true }); // No overflow
    Object.defineProperty(nodeContent, 'scrollHeight', { value: 300, configurable: true });
    Object.defineProperty(nodeContent, 'clientHeight', { value: 100, configurable: true }); // Has overflow!

    const result = findScrollableContainer(target);

    // Should find node-content (which has actual overflow) not code-display
    assertTrue(result !== null, 'Should find a scrollable container');
    assertTrue(result.classList.contains('node-content'), `Should find node-content, but found: ${result?.className}`);
});

test('findScrollableContainer: finds code-display when it has actual overflow', () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <style>
            .node-content { overflow: auto; }
            .code-display { overflow: auto; }
        </style>
        <div class="node">
            <div class="node-content">
                <div class="code-display">
                    <pre><code class="target">code here</code></pre>
                </div>
            </div>
        </div>
    `);

    // Set up global window
    global.window = dom.window;

    const document = dom.window.document;
    const nodeContent = document.querySelector('.node-content');
    const codeDisplay = document.querySelector('.code-display');
    const target = document.querySelector('.target');

    // Simulate: code-display HAS overflow this time
    Object.defineProperty(codeDisplay, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(codeDisplay, 'clientHeight', { value: 200, configurable: true }); // Has overflow
    Object.defineProperty(nodeContent, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(nodeContent, 'clientHeight', { value: 200, configurable: true }); // No overflow

    const result = findScrollableContainer(target);

    // Should find code-display since it's deeper and has overflow
    assertTrue(result !== null, 'Should find a scrollable container');
    assertTrue(result.classList.contains('code-display'), `Should find code-display, but found: ${result?.className}`);
});

test('findScrollableContainer: prefers deeper element when both have overflow', () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <style>
            .node-content { overflow: auto; }
            .code-display { overflow: auto; }
        </style>
        <div class="node">
            <div class="node-content">
                <div class="code-display">
                    <pre><code class="target">code here</code></pre>
                </div>
            </div>
        </div>
    `);

    // Set up global window
    global.window = dom.window;

    const document = dom.window.document;
    const nodeContent = document.querySelector('.node-content');
    const codeDisplay = document.querySelector('.code-display');
    const target = document.querySelector('.target');

    // Both have overflow
    Object.defineProperty(codeDisplay, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(codeDisplay, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(nodeContent, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(nodeContent, 'clientHeight', { value: 300, configurable: true });

    const result = findScrollableContainer(target);

    // Should prefer code-display (deeper in DOM)
    assertTrue(result !== null, 'Should find a scrollable container');
    assertTrue(
        result.classList.contains('code-display'),
        `Should prefer deeper code-display, but found: ${result?.className}`
    );
});

test('findScrollableContainer: handles horizontal scroll', () => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <style>
            .code-display { overflow: auto; }
        </style>
        <div class="node">
            <div class="node-content">
                <div class="code-display">
                    <pre><code class="target">very long code line</code></pre>
                </div>
            </div>
        </div>
    `);

    // Set up global window
    global.window = dom.window;

    const document = dom.window.document;
    const codeDisplay = document.querySelector('.code-display');
    const target = document.querySelector('.target');

    // Only horizontal overflow
    Object.defineProperty(codeDisplay, 'scrollHeight', { value: 100, configurable: true });
    Object.defineProperty(codeDisplay, 'clientHeight', { value: 100, configurable: true }); // No vertical overflow
    Object.defineProperty(codeDisplay, 'scrollWidth', { value: 500, configurable: true });
    Object.defineProperty(codeDisplay, 'clientWidth', { value: 200, configurable: true }); // Has horizontal overflow

    const result = findScrollableContainer(target);

    assertTrue(result !== null, 'Should find container with horizontal overflow');
    assertTrue(
        result.classList.contains('code-display'),
        `Should find code-display with horizontal overflow, but found: ${result?.className}`
    );
});
