/**
 * Scroll utilities for finding scrollable containers in the DOM
 *
 * Used by canvas.js to determine which element should handle wheel scroll events.
 */

/**
 * Find the best scrollable container for an event target.
 * Walks up the DOM tree to find an element that:
 * 1. Has overflow: auto or scroll
 * 2. Actually has content that overflows (scrollHeight > clientHeight or scrollWidth > clientWidth)
 *
 * This is more robust than just using .closest() with a selector, because an element
 * might have overflow: auto but not actually have any overflow to scroll.
 *
 * @param {Element} target - The event target element
 * @returns {Element|null} - The scrollable container, or null if none found
 */
export function findScrollableContainer(target) {
    // Potential scroll container selectors (in order of specificity)
    const scrollContainerSelectors = [
        '.code-output-panel-body',
        '.csv-preview',
        '.code-error-output',
        '.code-editor-area',
        '.code-display',
        '.node-content',
    ];

    // Collect all potential scroll containers between target and document
    // Use Set to avoid duplicates if a single element matches multiple selectors
    const candidateSet = new Set();
    for (const selector of scrollContainerSelectors) {
        const container = target.closest(selector);
        if (container) {
            candidateSet.add(container);
        }
    }
    const candidates = Array.from(candidateSet);

    // Sort by DOM depth (deepest first) - we want the most specific container
    // that actually has scrollable content
    candidates.sort((a, b) => {
        // Count ancestors to determine depth
        let depthA = 0,
            depthB = 0;
        let el = a;
        while (el) {
            depthA++;
            el = el.parentElement;
        }
        el = b;
        while (el) {
            depthB++;
            el = el.parentElement;
        }
        return depthB - depthA; // Deeper elements first
    });

    // Find the first candidate that actually has scrollable content
    for (const container of candidates) {
        const style = window.getComputedStyle(container);
        const hasOverflowY = style.overflowY === 'auto' || style.overflowY === 'scroll';
        const hasOverflowX = style.overflowX === 'auto' || style.overflowX === 'scroll';

        if (hasOverflowY || hasOverflowX) {
            const canScrollY = container.scrollHeight > container.clientHeight;
            const canScrollX = container.scrollWidth > container.clientWidth;

            if (canScrollY || canScrollX) {
                return container;
            }
        }
    }

    return null;
}
