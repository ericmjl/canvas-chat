/**
 * Shared test setup for JavaScript tests.
 * Loads source files and sets up the test environment.
 *
 * This module exports:
 * - test() function
 * - assert functions
 * - All loaded functions/classes from source files
 */

import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Set up minimal browser-like environment for source files
global.window = global;
global.document = {
    createElement: (tagName) => {
        const element = { textContent: '', innerHTML: '' };
        // Mock textContent setter to update innerHTML (for escapeHtmlText)
        Object.defineProperty(element, 'textContent', {
            get: () => element._textContent || '',
            set: (value) => {
                element._textContent = value;
                // Simple HTML escaping for tests
                element.innerHTML = value
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
        });
        return element;
    },
    addEventListener: () => {} // Mock event listener (no-op for tests)
};
global.NodeType = {
    HUMAN: 'human', AI: 'ai', NOTE: 'note', SUMMARY: 'summary', REFERENCE: 'reference',
    SEARCH: 'search', RESEARCH: 'research', HIGHLIGHT: 'highlight', MATRIX: 'matrix',
    CELL: 'cell', ROW: 'row', COLUMN: 'column', FETCH_RESULT: 'fetch_result',
    PDF: 'pdf', OPINION: 'opinion', SYNTHESIS: 'synthesis', REVIEW: 'review', IMAGE: 'image',
    FLASHCARD: 'flashcard', FACTCHECK: 'factcheck', CSV: 'csv', CODE: 'code'
};

// Load source files
const layoutPath = path.join(__dirname, '../src/canvas_chat/static/js/layout.js');
const layoutCode = fs.readFileSync(layoutPath, 'utf8');
vm.runInThisContext(layoutCode, { filename: layoutPath });

const graphTypesPath = path.join(__dirname, '../src/canvas_chat/static/js/graph-types.js');
const graphTypesCode = fs.readFileSync(graphTypesPath, 'utf8');
vm.runInThisContext(graphTypesCode, { filename: graphTypesPath });

const searchPath = path.join(__dirname, '../src/canvas_chat/static/js/search.js');
const searchCode = fs.readFileSync(searchPath, 'utf8');
vm.runInThisContext(searchCode, { filename: searchPath });

const utilsPath = path.join(__dirname, '../src/canvas_chat/static/js/utils.js');
const utilsCode = fs.readFileSync(utilsPath, 'utf8');
vm.runInThisContext(utilsCode, { filename: utilsPath });

const flashcardsPath = path.join(__dirname, '../src/canvas_chat/static/js/flashcards.js');
const flashcardsCode = fs.readFileSync(flashcardsPath, 'utf8');
vm.runInThisContext(flashcardsCode, { filename: flashcardsPath });

const appPath = path.join(__dirname, '../src/canvas_chat/static/js/app.js');
const appCode = fs.readFileSync(appPath, 'utf8');
vm.runInThisContext(appCode, { filename: appPath });

const nodeProtocolsPath = path.join(__dirname, '../src/canvas_chat/static/js/node-protocols.js');
const nodeProtocolsCode = fs.readFileSync(nodeProtocolsPath, 'utf8');
vm.runInThisContext(nodeProtocolsCode, { filename: nodeProtocolsPath });

// Extract functions and constants from window
const {
    formatUserError,
    buildMessagesForApi,
    tokenize,
    calculateIDF,
    SearchIndex,
    wouldOverlapNodes,
    createNode: createNodeReal,
    createMatrixNode: createMatrixNodeReal,
    createRowNode: createRowNodeReal,
    createColumnNode: createColumnNodeReal,
    isUrlContent,
    extractUrlFromReferenceNode,
    truncateText,
    escapeHtmlText,
    formatMatrixAsText,
    NodeType,
    DEFAULT_NODE_SIZES,
    getDefaultNodeSize,
    wrapNode,
    createMockNodeForType,
    HeaderButtons,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    layoutUtils
} = global.window;

const { getOverlap, hasAnyOverlap, resolveOverlaps } = layoutUtils;

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        failed++;
    }
}

function assertEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertNull(actual) {
    if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(actual, message = '') {
    if (actual !== true) {
        throw new Error(message || `Expected true, got ${actual}`);
    }
}

function assertFalse(actual, message = '') {
    if (actual !== false) {
        throw new Error(message || `Expected false, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`);
    }
}

function assertIncludes(array, item) {
    if (!array.includes(item)) {
        throw new Error(`Expected array to include ${JSON.stringify(item)}, got ${JSON.stringify(array)}`);
    }
}

function assertGreaterThan(actual, expected, message = '') {
    if (actual <= expected) {
        throw new Error(message || `Expected ${actual} > ${expected}`);
    }
}

// Mock Graph class for testing (since CRDTGraph requires Yjs which needs browser)
// This mock provides the same API as the production CRDTGraph for testing graph operations.
class TestGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = [];
        this.outgoingEdges = new Map();
        this.incomingEdges = new Map();
    }

    addNode(node) {
        this.nodes.set(node.id, node);
        return node;
    }

    getNode(id) {
        return this.nodes.get(id);
    }

    addEdge(edge) {
        this.edges.push(edge);

        if (!this.outgoingEdges.has(edge.source)) {
            this.outgoingEdges.set(edge.source, []);
        }
        this.outgoingEdges.get(edge.source).push(edge);

        if (!this.incomingEdges.has(edge.target)) {
            this.incomingEdges.set(edge.target, []);
        }
        this.incomingEdges.get(edge.target).push(edge);

        return edge;
    }

    getParents(nodeId) {
        const incoming = this.incomingEdges.get(nodeId) || [];
        return incoming.map(edge => this.nodes.get(edge.source)).filter(Boolean);
    }

    getChildren(nodeId) {
        const outgoing = this.outgoingEdges.get(nodeId) || [];
        return outgoing.map(edge => this.nodes.get(edge.target)).filter(Boolean);
    }

    getAncestors(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const ancestors = [];
        const parents = this.getParents(nodeId);

        for (const parent of parents) {
            ancestors.push(...this.getAncestors(parent.id, visited));
            ancestors.push(parent);
        }

        return ancestors;
    }

    getAllNodes() {
        return Array.from(this.nodes.values());
    }

    topologicalSort() {
        const allNodes = this.getAllNodes();
        const inDegree = new Map();
        const result = [];

        for (const node of allNodes) {
            const incoming = this.incomingEdges.get(node.id) || [];
            inDegree.set(node.id, incoming.length);
        }

        const queue = allNodes.filter(n => inDegree.get(n.id) === 0);
        queue.sort((a, b) => a.created_at - b.created_at);

        while (queue.length > 0) {
            const node = queue.shift();
            result.push(node);

            const children = this.getChildren(node.id);
            children.sort((a, b) => a.created_at - b.created_at);

            for (const child of children) {
                const newDegree = inDegree.get(child.id) - 1;
                inDegree.set(child.id, newDegree);
                if (newDegree === 0) {
                    queue.push(child);
                }
            }
        }

        return result;
    }

    isEmpty() {
        return this.nodes.size === 0;
    }

    isNodeVisible(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        const parents = this.getParents(nodeId);

        // Root nodes (no parents) are always visible
        if (parents.length === 0) return true;

        // Check if ANY parent path leads to visibility
        // A path is open if the parent is not collapsed AND the parent is visible
        for (const parent of parents) {
            if (!parent.collapsed && this.isNodeVisible(parent.id)) {
                return true;
            }
        }

        return false;
    }

    getDescendants(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);

        const descendants = [];
        const children = this.getChildren(nodeId);

        for (const child of children) {
            if (!visited.has(child.id)) {
                descendants.push(child);
                descendants.push(...this.getDescendants(child.id, visited));
            }
        }
        return descendants;
    }

    countHiddenDescendants(nodeId) {
        const descendants = this.getDescendants(nodeId, new Set());
        // Count only those that are not visible via another path
        return descendants.filter(d => !this.isNodeVisible(d.id)).length;
    }

    getVisibleDescendantsThroughHidden(nodeId) {
        const result = [];
        const visited = new Set([nodeId]);

        const traverse = (currentId) => {
            const children = this.getChildren(currentId);
            for (const child of children) {
                if (visited.has(child.id)) continue;
                visited.add(child.id);

                if (this.isNodeVisible(child.id)) {
                    result.push(child);
                } else {
                    traverse(child.id);
                }
            }
        };

        traverse(nodeId);
        return result;
    }

    getVisibleAncestorsThroughHidden(nodeId) {
        const result = [];
        const visited = new Set([nodeId]);

        const traverse = (currentId) => {
            const parents = this.getParents(currentId);
            for (const parent of parents) {
                if (visited.has(parent.id)) continue;
                visited.add(parent.id);

                if (this.isNodeVisible(parent.id)) {
                    result.push(parent);
                } else {
                    traverse(parent.id);
                }
            }
        };

        traverse(nodeId);
        return result;
    }

    resolveContext(nodeIds) {
        const allAncestors = new Map();

        for (const nodeId of nodeIds) {
            const node = this.getNode(nodeId);
            if (node) {
                allAncestors.set(node.id, node);
            }

            const ancestors = this.getAncestors(nodeId);
            for (const ancestor of ancestors) {
                allAncestors.set(ancestor.id, ancestor);
            }
        }

        const sorted = Array.from(allAncestors.values())
            .sort((a, b) => a.created_at - b.created_at);

        const userTypes = [NodeType.HUMAN, NodeType.HIGHLIGHT, NodeType.NOTE, NodeType.IMAGE];
        return sorted.map(node => {
            const msg = {
                role: userTypes.includes(node.type) ? 'user' : 'assistant',
                content: node.content,
                nodeId: node.id
            };
            if (node.imageData) {
                msg.imageData = node.imageData;
                msg.mimeType = node.mimeType;
            }
            return msg;
        });
    }
}

function createTestNode(id, created_at = Date.now(), type = NodeType.NOTE, content = `Node ${id}`, collapsed = false) {
    return { id, created_at, type, content, position: { x: 0, y: 0 }, collapsed };
}

function createTestEdge(source, target) {
    return { id: `${source}-${target}`, source, target };
}

// Print summary at end
process.on('exit', () => {
    console.log('\n-------------------');
    console.log(`Tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
});

// Export everything that test files might need
export {
    test,
    assertEqual,
    assertNull,
    assertTrue,
    assertFalse,
    assertDeepEqual,
    assertIncludes,
    assertGreaterThan,
    // Source functions
    formatUserError,
    buildMessagesForApi,
    tokenize,
    calculateIDF,
    SearchIndex,
    wouldOverlapNodes,
    createNodeReal,
    createMatrixNodeReal,
    createRowNodeReal,
    createColumnNodeReal,
    isUrlContent,
    extractUrlFromReferenceNode,
    truncateText,
    escapeHtmlText,
    formatMatrixAsText,
    NodeType,
    DEFAULT_NODE_SIZES,
    getDefaultNodeSize,
    wrapNode,
    createMockNodeForType,
    HeaderButtons,
    applySM2,
    isFlashcardDue,
    getDueFlashcards,
    getOverlap,
    hasAnyOverlap,
    resolveOverlaps,
    layoutUtils,
    TestGraph,
    createTestNode,
    createTestEdge
};
