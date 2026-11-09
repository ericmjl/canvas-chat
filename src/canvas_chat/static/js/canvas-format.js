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

/** Version of the `canvasChat` namespace written by toJsonCanvas */
const CANVAS_CHAT_EXTENSION_VERSION = 1;

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
 * Session fields that are not useful inside an exported file.
 * @type {Set<string>}
 */
const SKIPPED_SESSION_FIELDS = new Set(['nodes', 'edges']);

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

    let out;
    if (LINK_NODE_TYPES.has(node.type) && typeof node.url === 'string' && node.url) {
        out = { ...base, type: 'link', url: node.url };
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
    // JSON Canvas edges default to toEnd "arrow", which matches Canvas-Chat.
    const out = {
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
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
            session: omit(session || {}, SKIPPED_SESSION_FIELDS),
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
            type = NodeType.REFERENCE;
            content = jcNode.url ? `[${jcNode.url}](${jcNode.url})` : '';
            if (jcNode.url) extra.url = jcNode.url;
            break;
        case 'file': {
            const target = jcNode.subpath ? `${jcNode.file}${jcNode.subpath}` : jcNode.file;
            content = `📎 \`${target ?? ''}\``;
            break;
        }
        case 'group':
            content = jcNode.label ? `## ${jcNode.label}` : '';
            if (jcNode.label) extra.title = jcNode.label;
            break;
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

    const node = {
        ...ext,
        id: jcNode.id,
        position: ext.position ?? { x: jcNode.x, y: jcNode.y },
        width: ext.width ?? jcNode.width,
        height: ext.height ?? jcNode.height,
    };
    // If another tool edited the text, prefer the edited text.
    if (jcNode.type === 'text' && typeof jcNode.text === 'string') {
        const original = nodeToText({ ...ext, id: jcNode.id });
        if (jcNode.text !== original) node.content = jcNode.text;
    } else if (jcNode.type === 'link' && typeof jcNode.url === 'string' && jcNode.url) {
        node.url = jcNode.url;
    }
    return node;
}

/**
 * Build a Canvas-Chat edge from a JSON Canvas edge.
 * @param {JsonCanvasEdge} jcEdge - JSON Canvas edge
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
 * Convert a JSON Canvas document to a Canvas-Chat session.
 *
 * Documents written by toJsonCanvas restore all Canvas-Chat fields from the
 * `canvasChat` namespace. Plain JSON Canvas files (e.g. from Obsidian) are
 * mapped as: text → note, link → reference, file and group → note.
 * Edges pointing at unknown nodes are dropped.
 * @param {JsonCanvasDocument} doc - JSON Canvas document
 * @returns {{nodes: Object[], edges: Object[], name?: string, tags?: Object}} Session fields
 * @throws {Error} If the document has no usable nodes/edges arrays
 */
function fromJsonCanvas(doc) {
    if (!isJsonCanvas(doc)) {
        throw new Error('Not a JSON Canvas document');
    }

    const jcNodes = (doc.nodes ?? []).filter((n) => n && typeof n.id === 'string');
    const nodes = jcNodes.map(nodeFromJsonCanvas);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = (doc.edges ?? [])
        .filter((e) => e && nodeIds.has(e.fromNode) && nodeIds.has(e.toNode))
        .map(edgeFromJsonCanvas);

    const sessionMeta = doc[EXTENSION_KEY]?.session;
    return {
        ...(sessionMeta && typeof sessionMeta === 'object' ? sessionMeta : {}),
        nodes,
        edges,
    };
}

export { CANVAS_CHAT_EXTENSION_VERSION, fromJsonCanvas, isJsonCanvas, toJsonCanvas };
