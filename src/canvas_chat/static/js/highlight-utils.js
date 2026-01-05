/**
 * Text highlighting utilities for source text highlighting.
 *
 * These functions handle highlighting text within HTML content,
 * particularly for cross-block selections that span headings,
 * paragraphs, and lists.
 */

/**
 * Highlight text within HTML without breaking tags.
 * Handles text that spans across multiple HTML elements (e.g., across <strong> boundaries).
 * Uses whitespace normalization to match text selected across block elements where
 * selection.toString() produces newlines but joined text nodes do not.
 *
 * @param {Document} document - The document object for DOM manipulation
 * @param {string} html - Original HTML content
 * @param {string} text - Text to highlight
 * @returns {string} HTML with highlighted text wrapped in <mark class="source-highlight">
 */
function highlightTextInHtml(document, html, text) {
    if (!text || !html) return html;

    // Create a temporary element to parse the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Use TreeWalker to collect all text nodes
    // NodeFilter.SHOW_TEXT = 4. Access from window if available (jsdom), else use constant.
    const SHOW_TEXT = (document.defaultView && document.defaultView.NodeFilter)
        ? document.defaultView.NodeFilter.SHOW_TEXT
        : 4;
    const walker = document.createTreeWalker(temp, SHOW_TEXT);
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }

    if (textNodes.length === 0) return html;

    // Build the full text WITH position mapping
    // Add a space between text nodes to simulate block element boundaries
    // charMap[i] = { nodeIndex, charIndex } maps each char in fullText to its source
    // charIndex of -1 means it's a synthetic space between nodes
    let fullText = '';
    const charMap = [];

    for (let nodeIndex = 0; nodeIndex < textNodes.length; nodeIndex++) {
        // Add a space between text nodes (simulates block boundaries)
        if (nodeIndex > 0) {
            charMap.push({ nodeIndex: -1, charIndex: -1 }); // synthetic space
            fullText += ' ';
        }

        const content = textNodes[nodeIndex].textContent;
        for (let charIndex = 0; charIndex < content.length; charIndex++) {
            charMap.push({ nodeIndex, charIndex });
            fullText += content[charIndex];
        }
    }

    // Normalize whitespace: collapse all whitespace sequences to single space, trim
    const normalizeWs = (str) => str.replace(/\s+/g, ' ').trim();

    const normalizedFull = normalizeWs(fullText);
    const normalizedSearch = normalizeWs(text);

    // Find match in normalized strings (case-insensitive)
    const matchStartNorm = normalizedFull.toLowerCase().indexOf(normalizedSearch.toLowerCase());
    if (matchStartNorm === -1) return html;
    const matchEndNorm = matchStartNorm + normalizedSearch.length;

    // Build mapping from normalized positions to original positions
    // normalizedToOriginal[i] = original index in fullText for normalized char i
    const normalizedToOriginal = [];
    let inWhitespace = false;
    let leadingTrimmed = true;

    for (let i = 0; i < fullText.length; i++) {
        const ch = fullText[i];
        if (/\s/.test(ch)) {
            if (!inWhitespace && !leadingTrimmed) {
                // First whitespace char after non-whitespace maps to the normalized space
                normalizedToOriginal.push(i);
            }
            inWhitespace = true;
        } else {
            leadingTrimmed = false;
            inWhitespace = false;
            normalizedToOriginal.push(i);
        }
    }

    // Get original positions for match boundaries
    if (matchStartNorm >= normalizedToOriginal.length) return html;
    const origStart = normalizedToOriginal[matchStartNorm];
    const origEnd = matchEndNorm <= normalizedToOriginal.length
        ? normalizedToOriginal[matchEndNorm - 1] + 1
        : fullText.length;

    // Find which text nodes overlap with [origStart, origEnd)
    const nodesToProcess = [];

    for (let nodeIndex = 0; nodeIndex < textNodes.length; nodeIndex++) {
        const textNode = textNodes[nodeIndex];
        const nodeLen = textNode.textContent.length;

        // Find the range of this node in fullText
        let nodeStartInFull = -1;
        let nodeEndInFull = -1;
        for (let i = 0; i < charMap.length; i++) {
            if (charMap[i].nodeIndex === nodeIndex) {
                if (nodeStartInFull === -1) nodeStartInFull = i;
                nodeEndInFull = i + 1;
            }
        }

        if (nodeStartInFull === -1) continue;

        // Check overlap with [origStart, origEnd)
        if (nodeEndInFull > origStart && nodeStartInFull < origEnd) {
            const overlapStart = Math.max(0, origStart - nodeStartInFull);
            const overlapEnd = Math.min(nodeLen, origEnd - nodeStartInFull);

            nodesToProcess.push({
                node: textNode,
                overlapStart,
                overlapEnd
            });
        }
    }

    // Process nodes in reverse order to avoid invalidating positions
    for (let i = nodesToProcess.length - 1; i >= 0; i--) {
        const { node: textNode, overlapStart, overlapEnd } = nodesToProcess[i];
        const content = textNode.textContent;

        const before = content.slice(0, overlapStart);
        const match = content.slice(overlapStart, overlapEnd);
        const after = content.slice(overlapEnd);

        // Skip if match portion is only whitespace (avoid extraneous highlights)
        if (!match.trim()) continue;

        const fragment = document.createDocumentFragment();

        if (before) {
            fragment.appendChild(document.createTextNode(before));
        }

        const mark = document.createElement('mark');
        mark.className = 'source-highlight';
        mark.textContent = match;
        fragment.appendChild(mark);

        if (after) {
            fragment.appendChild(document.createTextNode(after));
        }

        textNode.parentNode.replaceChild(fragment, textNode);
    }

    return temp.innerHTML;
}

/**
 * Extract excerpt text from highlight node content.
 * Strips "> " prefix from each line (blockquote format).
 *
 * @param {string} content - The highlight node content
 * @returns {string} The extracted text without blockquote prefixes
 */
function extractExcerptText(content) {
    let excerptText = content || '';
    excerptText = excerptText
        .split('\n')
        .map(line => line.startsWith('> ') ? line.slice(2) : line)
        .join('\n');
    return excerptText;
}

// Export for ES module usage (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { highlightTextInHtml, extractExcerptText };
}
