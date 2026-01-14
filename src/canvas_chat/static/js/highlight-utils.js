/**
 * Text highlighting utilities for source text highlighting.
 *
 * These functions handle highlighting text within HTML content,
 * particularly for cross-block selections that span headings,
 * paragraphs, and lists.
 */

/**
 * Check if a node is inside an element that should be skipped for text matching.
 * This handles KaTeX math rendering which duplicates text across MathML and visual spans.
 *
 * @param {Node} node - The node to check
 * @returns {boolean} True if the node should be skipped
 */
function isInsideSkippedElement(node) {
    let current = node.parentElement;
    while (current) {
        // Skip MathML elements (used by KaTeX for accessibility)
        if (current.tagName && current.tagName.toLowerCase() === 'math') {
            return true;
        }
        // Skip annotation elements inside MathML
        if (current.tagName && current.tagName.toLowerCase() === 'annotation') {
            return true;
        }
        // Skip katex-mathml container (contains duplicate text for screen readers)
        if (current.classList && current.classList.contains('katex-mathml')) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}

/**
 * Normalize KaTeX text duplication artifacts in selected text.
 * When users select text from KaTeX-rendered math, the browser often includes
 * both the MathML and the visual representation, causing patterns like:
 * "0.13 ± 0.13±" instead of just "0.13±"
 *
 * @param {string} text - The selected text that may contain duplicates
 * @returns {string} Text with KaTeX duplication artifacts removed
 */
function normalizeKatexDuplication(text) {
    // First normalize whitespace
    let normalized = text.replace(/\s+/g, ' ');

    // Pattern: (number) ± (same_number)± -> (number)±
    // This matches the duplication from mathml annotation + katex-html
    // E.g., "0.13 ± 0.13±" -> "0.13±"
    normalized = normalized.replace(/(\d+\.?\d*)\s*±\s*\1±/g, '$1±');

    return normalized;
}

/**
 * Smith-Waterman local alignment to find where a query prefix best matches in target.
 * Returns the target index where the match starts.
 *
 * @param {string} queryPrefix - The prefix of the query to align
 * @param {string} target - The target string to search in
 * @returns {number} The start index in target, or -1 if no match
 */
function alignStart(queryPrefix, target) {
    const m = queryPrefix.length;
    const n = target.length;

    if (m === 0 || n === 0) return -1;

    const MATCH = 2;
    const MISMATCH = -1;
    const GAP = -1;
    const WS_MATCH = 1;

    const isWs = (ch) => /\s/.test(ch);

    const score = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));

    let maxScore = 0;
    let maxI = 0,
        maxJ = 0;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const qChar = queryPrefix[i - 1].toLowerCase();
            const tChar = target[j - 1].toLowerCase();

            let matchVal;
            if (qChar === tChar) {
                matchVal = isWs(qChar) ? WS_MATCH : MATCH;
            } else if (isWs(qChar) && isWs(tChar)) {
                matchVal = WS_MATCH;
            } else {
                matchVal = MISMATCH;
            }

            const diag = score[i - 1][j - 1] + matchVal;
            const up = score[i - 1][j] + GAP;
            const left = score[i][j - 1] + GAP;

            score[i][j] = Math.max(0, diag, up, left);

            if (score[i][j] > maxScore) {
                maxScore = score[i][j];
                maxI = i;
                maxJ = j;
            }
        }
    }

    if (maxScore === 0) return -1;

    // Traceback to find start position in target
    let i = maxI,
        j = maxJ;
    let targetStart = j;

    while (i > 0 && j > 0 && score[i][j] > 0) {
        const current = score[i][j];
        const qChar = queryPrefix[i - 1].toLowerCase();
        const tChar = target[j - 1].toLowerCase();

        let matchVal;
        if (qChar === tChar) {
            matchVal = isWs(qChar) ? WS_MATCH : MATCH;
        } else if (isWs(qChar) && isWs(tChar)) {
            matchVal = WS_MATCH;
        } else {
            matchVal = MISMATCH;
        }

        if (i > 0 && j > 0 && score[i - 1][j - 1] + matchVal === current) {
            targetStart = j - 1;
            i--;
            j--;
        } else if (i > 0 && score[i - 1][j] + GAP === current) {
            i--;
        } else {
            targetStart = j - 1;
            j--;
        }
    }

    return targetStart;
}

/**
 * Align the suffix of query to find where the match ends in target.
 * Reverses both strings and uses alignStart, then converts back.
 *
 * @param {string} querySuffix - The suffix of the query to align
 * @param {string} target - The target string to search in
 * @returns {number} The end index in target (exclusive), or -1 if no match
 */
function alignEnd(querySuffix, target) {
    const revQuery = querySuffix.split('').reverse().join('');
    const revTarget = target.split('').reverse().join('');

    const revStart = alignStart(revQuery, revTarget);
    if (revStart === -1) return -1;

    // Convert reversed start position to forward end position
    return target.length - revStart;
}

/**
 * Find match region in target using alignment at both ends.
 * This handles whitespace differences, KaTeX duplication, and other artifacts.
 *
 * @param {string} query - The query string (may have artifacts)
 * @param {string} target - The clean target string
 * @returns {{start: number, end: number}|null} The match region or null
 */
function findMatchRegion(query, target) {
    if (!query || !target) return null;

    // Use first ~20 chars for start alignment, last ~20 for end
    const prefixLen = Math.min(20, query.length);
    const suffixLen = Math.min(20, query.length);

    const prefix = query.slice(0, prefixLen);
    const suffix = query.slice(-suffixLen);

    const start = alignStart(prefix, target);
    if (start === -1) return null;

    const end = alignEnd(suffix, target);
    if (end === -1 || end <= start) return null;

    return { start, end };
}

/**
 * Highlight text within HTML without breaking tags.
 * Handles text that spans across multiple HTML elements (e.g., across <strong> boundaries).
 * Uses Smith-Waterman alignment to handle whitespace differences, KaTeX duplication,
 * and other artifacts from browser text selection.
 *
 * @param {Document} document - The document object for DOM manipulation
 * @param {string} html - Original HTML content
 * @param {string} text - Text to highlight (may contain selection artifacts)
 * @returns {string} HTML with highlighted text wrapped in <mark class="source-highlight">
 */
function highlightTextInHtml(document, html, text) {
    if (!text || !html) return html;

    // Create a temporary element to parse the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Use TreeWalker to collect all text nodes, filtering out duplicates from KaTeX
    const SHOW_TEXT =
        document.defaultView && document.defaultView.NodeFilter ? document.defaultView.NodeFilter.SHOW_TEXT : 4;
    const walker = document.createTreeWalker(temp, SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        // Skip text nodes inside MathML/katex-mathml (they duplicate visible content)
        if (!isInsideSkippedElement(node)) {
            textNodes.push(node);
        }
    }

    if (textNodes.length === 0) return html;

    // Build the full text WITH position mapping
    // Add a space between text nodes to simulate block element boundaries
    // charMap[i] = { nodeIndex, charIndex } maps each char in fullText to its source
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

    // Preprocess the search text to remove KaTeX duplication artifacts
    const cleanedSearch = normalizeKatexDuplication(text);
    const trimmedSearch = cleanedSearch.trim();

    // Use Smith-Waterman alignment to find match region
    // This is essential for crossing HTML block boundaries (selections that span paragraphs, headings, lists)
    let matchRegion = findMatchRegion(cleanedSearch, fullText);
    if (!matchRegion) return html;

    let { start: origStart, end: origEnd } = matchRegion;

    // Constraint: limit match region to reasonable size to prevent over-matching
    // If the match region is more than 2x the search text length, it's probably too broad
    // This prevents the alignment from expanding to include unrelated content
    // while still preserving Smith-Waterman's ability to cross boundaries
    const maxMatchLength = trimmedSearch.length * 2;
    if (origEnd - origStart > maxMatchLength) {
        // Match region is too large - try to find a tighter match within the region
        // First try exact match within the fuzzy region
        const normalizedSearch = trimmedSearch.toLowerCase();
        const normalizedFullText = fullText.toLowerCase();
        const tighterMatch = normalizedFullText.indexOf(normalizedSearch, origStart);
        if (tighterMatch !== -1 && tighterMatch < origEnd) {
            // Found a tighter exact match within the fuzzy region - use it
            origStart = tighterMatch;
            origEnd = tighterMatch + trimmedSearch.length;
        } else {
            // If we can't find a tighter match, just cap the region
            // This preserves Smith-Waterman's ability to cross boundaries while preventing over-expansion
            origEnd = Math.min(origEnd, origStart + maxMatchLength);
        }
    }

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
                overlapEnd,
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
        .map((line) => (line.startsWith('> ') ? line.slice(2) : line))
        .join('\n');
    return excerptText;
}

export {
    highlightTextInHtml,
    extractExcerptText,
    isInsideSkippedElement,
    normalizeKatexDuplication,
    alignStart,
    alignEnd,
    findMatchRegion,
};
