/**
 * JSON Canvas interoperability
 *
 * Pure functions that convert between Canvas-Chat sessions and the
 * JSON Canvas open format (https://jsoncanvas.org/spec/1.0/), used by
 * Obsidian and other infinite-canvas tools.
 *
 * The internal data model is untouched: conversion only happens at the
 * export/import boundary (see storage.js).
 *
 * Exported files are a *superset* of JSON Canvas: every node and edge
 * carries the standard fields, and Canvas-Chat-specific data lives in a
 * `canvasChat` namespace on each node, edge, and the top-level document.
 * Tools that only understand JSON Canvas ignore the namespace; Canvas-Chat
 * uses it to restore the session without loss. Pass
 * `{ includeExtensions: false }` to produce a plain, spec-only file.
 */

import { EdgeType, NodeType, getDefaultNodeSize } from './graph-types.js';
import { extractUrlFromReferenceNode } from './utils.js';

/**
 * `.canvaschat` file format version written by toJsonCanvas.
 * Version 1 is the legacy native layout (`position`, `source`/`target`);
 * version 2 is the JSON Canvas superset.
 */
const CANVAS_CHAT_EXTENSION_VERSION = 2;

/** Key used for the Canvas-Chat namespace on nodes, edges, and the document */
const EXTENSION_KEY = 'canvasChat';

/**
 * Canvas-Chat node types exported as JSON Canvas `link` nodes when they
 * carry a URL. Without a URL they fall back to `text`.
 * @type {Set<string>}
 */
const LINK_NODE_TYPES = new Set([NodeType.REFERENCE, NodeType.FETCH_RESULT, NodeType.YOUTUBE, NodeType.GIT_REPO]);

/**
 * Node fields that are mapped onto JSON Canvas fields and therefore not
 * duplicated inside the `canvasChat` namespace.
 * @type {Set<string>}
 */
const MAPPED_NODE_FIELDS = new Set(['id', 'position', 'width', 'height']);

/**
 * Edge fields that are mapped onto JSON Canvas fields.
 * @type {Set<string>}
 */
const MAPPED_EDGE_FIELDS = new Set(['id', 'source', 'target']);

/**
 * Session fields that are mapped elsewhere in the document (nodes/edges) or
 * renamed in the document-level namespace (id → sessionId, name → sessionName).
 * @type {Set<string>}
 */
const SKIPPED_SESSION_FIELDS = new Set(['nodes', 'edges', 'id', 'name', 'version']);

/**
 * A JSON Canvas node, optionally carrying the Canvas-Chat namespace.
 * @typedef {Object} JsonCanvasNode
 * @property {string} id - Node ID
 * @property {'text'|'file'|'link'|'group'} type - JSON Canvas node type
 * @property {number} x - Left edge (integer pixels)
 * @property {number} y - Top edge (integer pixels)
 * @property {number} width - Width (integer pixels)
 * @property {number} height - Height (integer pixels)
 * @property {string} [color] - Preset ("1"-"6") or hex color
 * @property {string} [text] - Markdown text (text nodes)
 * @property {string} [file] - File path (file nodes)
 * @property {string} [url] - URL (link nodes)
 * @property {string} [label] - Label (group nodes)
 * @property {Object} [canvasChat] - Canvas-Chat node fields
 */

/**
 * A JSON Canvas edge, optionally carrying the Canvas-Chat namespace.
 * @typedef {Object} JsonCanvasEdge
 * @property {string} id - Edge ID
 * @property {string} fromNode - Source node ID
 * @property {string} toNode - Target node ID
 * @property {'top'|'right'|'bottom'|'left'} [fromSide] - Side the edge starts from
 * @property {'top'|'right'|'bottom'|'left'} [toSide] - Side the edge ends at
 * @property {'none'|'arrow'} [fromEnd] - Start cap (default none)
 * @property {'none'|'arrow'} [toEnd] - End cap (default arrow)
 * @property {string} [color] - Preset ("1"-"6") or hex color
 * @property {string} [label] - Edge label
 * @property {Object} [canvasChat] - Canvas-Chat edge fields
 */

/**
 * A JSON Canvas document.
 * @typedef {Object} JsonCanvasDocument
 * @property {JsonCanvasNode[]} nodes - Nodes
 * @property {JsonCanvasEdge[]} edges - Edges
 * @property {Object} [canvasChat] - Canvas-Chat session metadata
 */

/**
 * Round a number to an integer, as JSON Canvas requires, with a fallback
 * for missing or invalid values.
 * @param {*} value - Value to round
 * @param {number} fallback - Value used when `value` is not a finite number
 * @returns {number} Integer value
 */
function toInt(value, fallback) {
    return Number.isFinite(value) ? Math.round(value) : fallback;
}

/**
 * Copy every own property of `obj` except the listed keys and undefined values.
 * @param {Object} obj - Source object
 * @param {Set<string>} skip - Keys to leave out
 * @returns {Object} Shallow copy without the skipped keys
 */
function omit(obj, skip) {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!skip.has(key) && value !== undefined) {
            out[key] = value;
        }
    }
    return out;
}

/**
 * Build a markdown table for a matrix node so its contents stay readable
 * in tools that only render JSON Canvas text.
 * @param {Object} node - Matrix node
 * @returns {string} Markdown representation
 */
function matrixToMarkdown(node) {
    const rows = Array.isArray(node.rowItems) ? node.rowItems : [];
    const cols = Array.isArray(node.colItems) ? node.colItems : [];
    const escape = (s) =>
        String(s ?? '')
            .replace(/\|/g, '\\|')
            .replace(/\n/g, ' ');

    const lines = [];
    if (node.context) lines.push(`**${escape(node.context)}**`, '');
    if (rows.length === 0 || cols.length === 0) return lines.join('\n').trim();

    lines.push(`| | ${cols.map(escape).join(' | ')} |`);
    lines.push(`|---|${cols.map(() => '---').join('|')}|`);
    rows.forEach((row, r) => {
        const cells = cols.map((_, c) => escape(node.cells?.[`${r}-${c}`]?.content ?? ''));
        lines.push(`| ${escape(row)} | ${cells.join(' | ')} |`);
    });
    return lines.join('\n');
}

/**
 * Produce the markdown shown for a node in JSON Canvas tools.
 * Most nodes use `content`; a few store their meaning in other fields.
 * @param {Object} node - Canvas-Chat node
 * @returns {string} Markdown text
 */
function nodeToText(node) {
    // Flashcards keep the question in `content`; show the answer too.
    if (node.type === NodeType.FLASHCARD && (node.question || node.answer)) {
        return `**Q:** ${node.question ?? ''}\n\n**A:** ${node.answer ?? ''}`;
    }

    const content = typeof node.content === 'string' ? node.content : '';
    if (content.trim()) return content;

    switch (node.type) {
        case NodeType.MATRIX:
            return matrixToMarkdown(node);
        case NodeType.IMAGE:
            return node.title ? `🖼️ ${node.title}` : '🖼️ Image';
        default:
            return node.title || '';
    }
}

/**
 * Check whether a value is an http(s) URL. Only these are turned into
 * clickable links, so a `javascript:` or `data:` URL in an imported file
 * cannot become a link.
 * @param {*} url - Value to check
 * @returns {boolean} True for a string starting with http:// or https://
 */
function isHttpUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
}

/**
 * Find the web URL a link-like node points at. Different features store it
 * differently: references set `url`, YouTube nodes keep `youtubeVideoId`, and
 * fetched pages put a `**[title](url)**` heading in their content.
 * @param {Object} node - Canvas-Chat node
 * @returns {string|null} An http(s) URL, or null when none is known
 */
function getNodeUrl(node) {
    const candidates = [
        node.url,
        node.metadata?.url,
        node.youtubeVideoId ? `https://www.youtube.com/watch?v=${node.youtubeVideoId}` : null,
        typeof node.content === 'string' ? extractUrlFromReferenceNode(node.content) : null,
    ];
    return candidates.find(isHttpUrl) ?? null;
}

/**
 * Convert one Canvas-Chat node to a JSON Canvas node.
 * @param {Object} node - Canvas-Chat node
 * @param {Object} options - Conversion options
 * @param {boolean} options.includeExtensions - Whether to add the `canvasChat` namespace
 * @returns {JsonCanvasNode} JSON Canvas node
 */
function nodeToJsonCanvas(node, { includeExtensions }) {
    const defaults = getDefaultNodeSize(node.type);
    const base = {
        id: node.id,
        x: toInt(node.position?.x, 0),
        y: toInt(node.position?.y, 0),
        width: toInt(node.width, defaults.width),
        height: toInt(node.height, defaults.height),
    };

    const url = LINK_NODE_TYPES.has(node.type) ? getNodeUrl(node) : null;
    let out;
    if (url) {
        out = { ...base, type: 'link', url };
    } else {
        out = { ...base, type: 'text', text: nodeToText(node) };
    }

    // Tags are hex color keys; the first one becomes the JSON Canvas color.
    const firstTag = Array.isArray(node.tags) ? node.tags[0] : null;
    if (typeof firstTag === 'string' && /^#[0-9a-f]{3,8}$/i.test(firstTag)) {
        out.color = firstTag;
    }

    if (includeExtensions) {
        const extension = omit(node, MAPPED_NODE_FIELDS);
        // Keep the exact (possibly fractional) position for lossless round trips.
        if (node.position && (node.position.x !== out.x || node.position.y !== out.y)) {
            extension.position = { x: node.position.x, y: node.position.y };
        }
        if (Number.isFinite(node.width) && node.width !== out.width) extension.width = node.width;
        if (Number.isFinite(node.height) && node.height !== out.height) extension.height = node.height;
        out[EXTENSION_KEY] = extension;
    }

    return out;
}

/**
 * Convert one Canvas-Chat edge to a JSON Canvas edge.
 * @param {Object} edge - Canvas-Chat edge
 * @param {Object} options - Conversion options
 * @param {boolean} options.includeExtensions - Whether to add the `canvasChat` namespace
 * @returns {JsonCanvasEdge} JSON Canvas edge
 */
function edgeToJsonCanvas(edge, { includeExtensions }) {
    const out = {
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
        toEnd: 'arrow',
    };
    if (includeExtensions) {
        out[EXTENSION_KEY] = omit(edge, MAPPED_EDGE_FIELDS);
    }
    return out;
}

/**
 * Convert a Canvas-Chat session to a JSON Canvas document.
 *
 * Edges whose endpoints are missing are dropped, since JSON Canvas
 * requires every edge to reference existing nodes.
 * @param {Object} session - Canvas-Chat session ({ nodes, edges, ...metadata })
 * @param {Object} [options={}] - Conversion options
 * @param {boolean} [options.includeExtensions=true] - Add the `canvasChat` namespace for lossless round trips
 * @returns {JsonCanvasDocument} JSON Canvas document
 */
function toJsonCanvas(session, options = {}) {
    const includeExtensions = options.includeExtensions !== false;
    const nodes = Array.isArray(session?.nodes) ? session.nodes : [];
    const edges = Array.isArray(session?.edges) ? session.edges : [];

    const nodeIds = new Set(nodes.map((n) => n.id));
    const doc = {
        nodes: nodes.map((n) => nodeToJsonCanvas(n, { includeExtensions })),
        edges: edges
            .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
            .map((e) => edgeToJsonCanvas(e, { includeExtensions })),
    };

    if (includeExtensions) {
        doc[EXTENSION_KEY] = {
            version: CANVAS_CHAT_EXTENSION_VERSION,
            sessionId: session?.id,
            sessionName: session?.name,
            ...omit(session || {}, SKIPPED_SESSION_FIELDS),
        };
    }
    return doc;
}

/**
 * Check whether parsed JSON looks like a JSON Canvas document rather than
 * a native Canvas-Chat session.
 *
 * Native sessions use `position: {x, y}` on nodes and `source`/`target` on
 * edges; JSON Canvas uses flat `x`/`y` and `fromNode`/`toNode`.
 * @param {*} data - Parsed JSON
 * @returns {boolean} True when the data is a JSON Canvas document
 */
function isJsonCanvas(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const nodes = data.nodes ?? [];
    const edges = data.edges ?? [];
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return false;
    if (data[EXTENSION_KEY]) return true;

    const firstEdge = edges[0];
    if (firstEdge) return 'fromNode' in firstEdge && 'toNode' in firstEdge;

    const firstNode = nodes[0];
    if (firstNode) return !('position' in firstNode) && 'x' in firstNode && 'y' in firstNode;

    // An empty `{}` / `{nodes: [], edges: []}` is valid JSON Canvas only if it
    // lacks native session markers.
    return !('id' in data) && !('created_at' in data);
}

/**
 * Build a Canvas-Chat node from a plain JSON Canvas node (no namespace).
 * @param {JsonCanvasNode} jcNode - JSON Canvas node
 * @returns {Object} Canvas-Chat node
 */
function plainNodeFromJsonCanvas(jcNode) {
    let content;
    let type = NodeType.NOTE;
    const extra = {};

    switch (jcNode.type) {
        case 'link':
            if (isHttpUrl(jcNode.url)) {
                type = NodeType.REFERENCE;
                content = `[${jcNode.url}](${jcNode.url})`;
                extra.url = jcNode.url;
            } else {
                // Not a web URL (e.g. `javascript:`): keep it as plain text, never a link.
                content = typeof jcNode.url === 'string' ? jcNode.url : '';
            }
            break;
        case 'file': {
            const target = jcNode.subpath ? `${jcNode.file}${jcNode.subpath}` : jcNode.file;
            content = `📎 \`${target ?? ''}\``;
            break;
        }
        case 'group': {
            // A group becomes a small label note, not a note the size of the
            // group that would sit over its children (see placeGroupLabel).
            const label = typeof jcNode.label === 'string' && jcNode.label.trim() ? jcNode.label : 'Group';
            content = `## ${label}`;
            extra.title = label;
            extra.width = MIN_IMPORTED_NODE_SIZE.width;
            extra.height = MIN_IMPORTED_NODE_SIZE.height;
            break;
        }
        default:
            content = typeof jcNode.text === 'string' ? jcNode.text : '';
    }

    const defaults = getDefaultNodeSize(type);
    return {
        id: jcNode.id,
        type,
        content,
        position: { x: toInt(jcNode.x, 0), y: toInt(jcNode.y, 0) },
        width: toInt(jcNode.width, defaults.width),
        height: toInt(jcNode.height, defaults.height),
        created_at: Date.now(),
        model: null,
        selection: null,
        tags: [],
        title: null,
        summary: null,
        ...extra,
    };
}

/**
 * Build a Canvas-Chat node from a JSON Canvas node, preferring the
 * `canvasChat` namespace when present.
 * @param {JsonCanvasNode} jcNode - JSON Canvas node
 * @returns {Object} Canvas-Chat node
 */
function nodeFromJsonCanvas(jcNode) {
    const ext = jcNode[EXTENSION_KEY];
    if (!ext || typeof ext !== 'object') return plainNodeFromJsonCanvas(jcNode);

    // The namespace keeps exact fractional geometry, but only while it still
    // matches the rounded JSON Canvas values. If another tool moved or resized
    // the node, the JSON Canvas values win.
    const sameInt = (exact, rounded) => Number.isFinite(exact) && Math.round(exact) === rounded;
    const keepExactPosition = ext.position && sameInt(ext.position.x, jcNode.x) && sameInt(ext.position.y, jcNode.y);
    const node = {
        ...ext,
        id: jcNode.id,
        position: keepExactPosition ? ext.position : { x: jcNode.x, y: jcNode.y },
        width: sameInt(ext.width, jcNode.width) ? ext.width : jcNode.width,
        height: sameInt(ext.height, jcNode.height) ? ext.height : jcNode.height,
    };
    // If another tool edited the text, prefer the edited text.
    if (jcNode.type === 'text' && typeof jcNode.text === 'string') {
        const original = nodeToText({ ...ext, id: jcNode.id });
        if (jcNode.text !== original) node.content = jcNode.text;
    } else if (jcNode.type === 'link' && isHttpUrl(jcNode.url)) {
        if (jcNode.url !== getNodeUrl(ext)) node.url = jcNode.url;
    }
    return node;
}

/**
 * Build a Canvas-Chat edge from a JSON Canvas edge.
 * @param {JsonCanvasEdge} jcEdge - JSON Canvas edge (with a unique `id`, see withUniqueIds)
 * @returns {Object} Canvas-Chat edge
 */
function edgeFromJsonCanvas(jcEdge) {
    const ext = jcEdge[EXTENSION_KEY];
    const edge = {
        type: EdgeType.REPLY,
        ...(ext && typeof ext === 'object' ? ext : {}),
        id: jcEdge.id,
        source: jcEdge.fromNode,
        target: jcEdge.toNode,
    };
    if (!ext && typeof jcEdge.label === 'string' && jcEdge.label) edge.label = jcEdge.label;
    return edge;
}

/**
 * Give every item a unique string id. The first item with a given id keeps
 * it; later duplicates, and items with no string id, get a fresh UUID.
 * Items are copied, never mutated.
 * @param {Object[]} items - JSON Canvas nodes or edges
 * @returns {Object[]} Items with unique ids
 */
function withUniqueIds(items) {
    const seen = new Set();
    return items.map((item) => {
        if (typeof item.id === 'string' && item.id && !seen.has(item.id)) {
            seen.add(item.id);
            return item;
        }
        let id = crypto.randomUUID();
        while (seen.has(id)) id = crypto.randomUUID();
        seen.add(id);
        return { ...item, id };
    });
}

/**
 * Smallest node size that leaves room for content between a Canvas-Chat node's
 * header and action bar. Obsidian's default text node (250x60) is far smaller.
 */
const MIN_IMPORTED_NODE_SIZE = { width: 360, height: 200 };

/** Upper bound on how far a plain import's layout is spread out. */
const MAX_IMPORT_LAYOUT_SCALE = 4;

/**
 * Make nodes from a plain JSON Canvas file readable in Canvas-Chat: grow
 * small nodes to MIN_IMPORTED_NODE_SIZE and spread positions by the same
 * uniform factor, so the grown nodes do not overlap their neighbours.
 * Mutates the nodes in place.
 * @param {Object[]} nodes - Canvas-Chat nodes built from plain JSON Canvas nodes
 * @returns {void}
 */
function fitPlainLayout(nodes) {
    let scale = 1;
    for (const n of nodes) {
        if (n.width > 0 && n.height > 0) {
            scale = Math.max(scale, MIN_IMPORTED_NODE_SIZE.width / n.width, MIN_IMPORTED_NODE_SIZE.height / n.height);
        }
    }
    scale = Math.min(scale, MAX_IMPORT_LAYOUT_SCALE);
    for (const n of nodes) {
        n.position = { x: Math.round(n.position.x * scale), y: Math.round(n.position.y * scale) };
        n.width = Math.max(n.width, MIN_IMPORTED_NODE_SIZE.width);
        n.height = Math.max(n.height, MIN_IMPORTED_NODE_SIZE.height);
    }
}

/** Vertical space between a group's label note and the group's top edge. */
const GROUP_LABEL_GAP = 20;

/**
 * Move a group's label note so it sits just above the group's top-left
 * corner, where JSON Canvas apps draw the group label, instead of covering
 * the nodes inside the group. Call after fitPlainLayout. Mutates the node.
 * @param {Object} node - Canvas-Chat note built from a plain JSON Canvas group
 * @returns {void}
 */
function placeGroupLabel(node) {
    node.position = { x: node.position.x, y: node.position.y - node.height - GROUP_LABEL_GAP };
}

/**
 * Convert a JSON Canvas document to a Canvas-Chat session.
 *
 * Documents written by toJsonCanvas restore all Canvas-Chat fields from the
 * `canvasChat` namespace. Plain JSON Canvas files (e.g. from Obsidian) are
 * mapped as: text → note, link → reference (http(s) URLs only; other
 * URLs become a plain-text note), file → note, group → small label note
 * just above the group's top-left corner.
 * Edges pointing at unknown nodes are dropped. Nodes without a string id
 * are dropped; a node whose id repeats an earlier node's gets a fresh id
 * (edges keep pointing at the first one). Edges with a missing or repeated
 * id get a fresh id.
 * @param {JsonCanvasDocument} doc - JSON Canvas document
 * @returns {{nodes: Object[], edges: Object[], name?: string, tags?: Object}} Session fields
 * @throws {Error} If the document has no usable nodes/edges arrays
 */
function fromJsonCanvas(doc) {
    if (!isJsonCanvas(doc)) {
        throw new Error('Not a JSON Canvas document');
    }

    const jcNodes = withUniqueIds((doc.nodes ?? []).filter((n) => n && typeof n.id === 'string' && n.id));
    const nodes = jcNodes.map(nodeFromJsonCanvas);
    if (!jcNodes.some((n) => n[EXTENSION_KEY])) fitPlainLayout(nodes);
    jcNodes.forEach((jcNode, i) => {
        if (jcNode.type === 'group' && !jcNode[EXTENSION_KEY]) placeGroupLabel(nodes[i]);
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const jcEdges = (doc.edges ?? []).filter((e) => e && nodeIds.has(e.fromNode) && nodeIds.has(e.toNode));
    const edges = withUniqueIds(jcEdges).map(edgeFromJsonCanvas);

    const meta = doc[EXTENSION_KEY];
    const session = {};
    if (meta && typeof meta === 'object') {
        // eslint-disable-next-line no-unused-vars
        const { version, sessionId, sessionName, ...rest } = meta;
        Object.assign(session, rest);
        if (sessionId !== undefined) session.id = sessionId;
        if (sessionName !== undefined) session.name = sessionName;
    }
    return { ...session, nodes, edges };
}

export { CANVAS_CHAT_EXTENSION_VERSION, fromJsonCanvas, isJsonCanvas, toJsonCanvas };
