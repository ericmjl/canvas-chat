/**
 * Tests for File Upload Handler Plugin System
 * Tests FileUploadRegistry and FileUploadHandlerPlugin base class
 */

import { FileUploadHandlerPlugin } from '../src/canvas_chat/static/js/file-upload-handler-plugin.js';
import { FileUploadHandler } from '../src/canvas_chat/static/js/file-upload-handler.js';
import { FileUploadRegistry, PRIORITY } from '../src/canvas_chat/static/js/file-upload-registry.js';
import { NodeType, createNode } from '../src/canvas_chat/static/js/graph-types.js';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

function test(description, fn) {
    try {
        fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        if (error.stack) {
            console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        }
        process.exit(1);
    }
}

async function asyncTest(description, fn) {
    try {
        await fn();
        console.log(`✓ ${description}`);
    } catch (error) {
        console.error(`✗ ${description}`);
        console.error(`  ${error.message}`);
        if (error.stack) {
            console.error(error.stack.split('\n').slice(1, 4).join('\n'));
        }
        process.exit(1);
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(message || 'Expected false, got true');
    }
}

function assertThrows(fn, expectedMessage) {
    try {
        fn();
        throw new Error('Expected function to throw, but it did not');
    } catch (error) {
        if (error.message === 'Expected function to throw, but it did not') {
            throw error;
        }
        if (expectedMessage && !error.message.includes(expectedMessage)) {
            throw new Error(`Expected error message to include "${expectedMessage}", got "${error.message}"`);
        }
    }
}

// Mock File class for testing
class MockFile {
    constructor(name, type, size = 1000) {
        this.name = name;
        this.type = type;
        this.size = size;
    }
}

// Test handler class
class TestFileHandler extends FileUploadHandlerPlugin {
    async handleUpload(file, position, context) {
        const node = createNode(NodeType.TEXT, `Processed: ${file.name}`, {
            position: position || { x: 0, y: 0 },
        });
        this.addNodeToCanvas(node);
        return node;
    }
}

// Test handler with custom validation
class TestFileHandlerWithValidation extends FileUploadHandlerPlugin {
    async handleUpload(file, position, context) {
        this.validateFile(file, 5000, 'Test file');
        const node = createNode(NodeType.TEXT, `Validated: ${file.name}`, {
            position: position || { x: 0, y: 0 },
        });
        return node;
    }
}

console.log('\n=== File Upload Handler Plugin System Tests ===\n');

// ============================================================================
// FileUploadRegistry Tests
// ============================================================================

// Test: Register handler with valid config
test('Can register handler with valid config', () => {
    FileUploadRegistry.register({
        id: 'test-handler',
        handler: TestFileHandler,
        mimeTypes: ['application/test'],
        priority: PRIORITY.COMMUNITY,
    });

    const handlers = FileUploadRegistry.getAllHandlers();
    const handler = handlers.find((h) => h.id === 'test-handler');
    assertTrue(handler !== undefined, 'Handler should be registered');
    assertEqual(handler.id, 'test-handler', 'Handler ID should match');
    assertEqual(handler.handler, TestFileHandler, 'Handler class should match');
    assertEqual(handler.priority, PRIORITY.COMMUNITY, 'Priority should match');
});

// Test: Register handler with extensions only
test('Can register handler with extensions only', () => {
    FileUploadRegistry.register({
        id: 'test-ext-handler',
        handler: TestFileHandler,
        extensions: ['.test'],
        priority: PRIORITY.COMMUNITY,
    });

    const handlers = FileUploadRegistry.getAllHandlers();
    const handler = handlers.find((h) => h.id === 'test-ext-handler');
    assertTrue(handler !== undefined, 'Handler should be registered');
    assertEqual(handler.extensions.length, 1, 'Should have one extension');
    assertEqual(handler.extensions[0], '.test', 'Extension should match');
});

// Test: Register handler with both mimeTypes and extensions
test('Can register handler with both mimeTypes and extensions', () => {
    FileUploadRegistry.register({
        id: 'test-both-handler',
        handler: TestFileHandler,
        mimeTypes: ['application/test'],
        extensions: ['.test', '.test2'],
        priority: PRIORITY.COMMUNITY,
    });

    const handlers = FileUploadRegistry.getAllHandlers();
    const handler = handlers.find((h) => h.id === 'test-both-handler');
    assertTrue(handler !== undefined, 'Handler should be registered');
    assertEqual(handler.mimeTypes.length, 1, 'Should have one MIME type');
    assertEqual(handler.extensions.length, 2, 'Should have two extensions');
});

// Test: Register handler with default priority
test('Handler gets default priority if not specified', () => {
    FileUploadRegistry.register({
        id: 'test-default-priority',
        handler: TestFileHandler,
        mimeTypes: ['application/test'],
    });

    const handlers = FileUploadRegistry.getAllHandlers();
    const handler = handlers.find((h) => h.id === 'test-default-priority');
    assertEqual(handler.priority, PRIORITY.COMMUNITY, 'Should default to COMMUNITY priority');
});

// Test: Registration validation - missing id
test('Registration throws error if id is missing', () => {
    assertThrows(
        () => {
            FileUploadRegistry.register({
                handler: TestFileHandler,
                mimeTypes: ['application/test'],
            });
        },
        'id is required'
    );
});

// Test: Registration validation - missing handler
test('Registration throws error if handler is missing', () => {
    assertThrows(
        () => {
            FileUploadRegistry.register({
                id: 'test-no-handler',
                mimeTypes: ['application/test'],
            });
        },
        'handler is required'
    );
});

// Test: Registration validation - handler must be a class
test('Registration throws error if handler is not a class', () => {
    assertThrows(
        () => {
            FileUploadRegistry.register({
                id: 'test-bad-handler',
                handler: 'not-a-class',
                mimeTypes: ['application/test'],
            });
        },
        'handler must be a class'
    );
});

// Test: Registration validation - must have mimeTypes or extensions
test('Registration throws error if neither mimeTypes nor extensions provided', () => {
    assertThrows(
        () => {
            FileUploadRegistry.register({
                id: 'test-no-match',
                handler: TestFileHandler,
            });
        },
        'must specify either mimeTypes or extensions'
    );
});

// Test: Find handler by MIME type
test('findHandler finds handler by MIME type', () => {
    FileUploadRegistry.register({
        id: 'test-mime-handler',
        handler: TestFileHandler,
        mimeTypes: ['application/pdf'],
        priority: PRIORITY.COMMUNITY,
    });

    const file = new MockFile('test.pdf', 'application/pdf');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found');
    assertEqual(handler.id, 'test-mime-handler', 'Should find correct handler');
});

// Test: Find handler by extension
test('findHandler finds handler by extension', () => {
    FileUploadRegistry.register({
        id: 'test-ext-handler-find',
        handler: TestFileHandler,
        extensions: ['.pdf'],
        priority: PRIORITY.COMMUNITY,
    });

    const file = new MockFile('test.pdf', '');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found');
    assertEqual(handler.id, 'test-ext-handler-find', 'Should find correct handler');
});

// Test: Find handler with wildcard MIME type
test('findHandler finds handler with wildcard MIME type', () => {
    FileUploadRegistry.register({
        id: 'test-wildcard-handler',
        handler: TestFileHandler,
        mimeTypes: ['image/*'],
        priority: PRIORITY.COMMUNITY,
    });

    const file = new MockFile('test.png', 'image/png');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found');
    assertEqual(handler.id, 'test-wildcard-handler', 'Should find correct handler');

    const file2 = new MockFile('test.jpg', 'image/jpeg');
    const handler2 = FileUploadRegistry.findHandler(file2);
    assertTrue(handler2 !== null, 'Handler should be found for different image type');
    assertEqual(handler2.id, 'test-wildcard-handler', 'Should find same handler');
});

// Test: Priority resolution - higher priority wins
test('findHandler returns higher priority handler when multiple match', () => {
    // Register COMMUNITY handler first
    FileUploadRegistry.register({
        id: 'test-community',
        handler: TestFileHandler,
        mimeTypes: ['application/test'],
        priority: PRIORITY.COMMUNITY,
    });

    // Register BUILTIN handler second (should win)
    FileUploadRegistry.register({
        id: 'test-builtin',
        handler: TestFileHandler,
        mimeTypes: ['application/test'],
        priority: PRIORITY.BUILTIN,
    });

    const file = new MockFile('test.test', 'application/test');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found');
    assertEqual(handler.id, 'test-builtin', 'Should return BUILTIN handler (higher priority)');
    assertEqual(handler.priority, PRIORITY.BUILTIN, 'Priority should be BUILTIN');
});

// Test: findHandler returns null for unsupported file
test('findHandler returns null for unsupported file type', () => {
    const file = new MockFile('test.unknown', 'application/unknown');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler === null, 'Should return null for unsupported file');
});

// Test: Extension matching is case-insensitive
test('Extension matching is case-insensitive', () => {
    FileUploadRegistry.register({
        id: 'test-case-insensitive',
        handler: TestFileHandler,
        extensions: ['.pdf'],
        priority: PRIORITY.COMMUNITY,
    });

    const file1 = new MockFile('test.PDF', '');
    const handler1 = FileUploadRegistry.findHandler(file1);
    assertTrue(handler1 !== null, 'Should find handler for uppercase extension');

    const file2 = new MockFile('test.PdF', '');
    const handler2 = FileUploadRegistry.findHandler(file2);
    assertTrue(handler2 !== null, 'Should find handler for mixed case extension');
});

// Test: getAllHandlers returns all registered handlers
test('getAllHandlers returns all registered handlers', () => {
    const handlers = FileUploadRegistry.getAllHandlers();
    assertTrue(handlers.length > 0, 'Should return at least one handler');
    assertTrue(handlers.some((h) => h.id === 'test-handler'), 'Should include test-handler');
    // Verify structure of returned handlers
    const handler = handlers.find((h) => h.id === 'test-handler');
    assertTrue(handler !== undefined, 'Should find registered handler');
    assertTrue('id' in handler, 'Handler should have id');
    assertTrue('handler' in handler, 'Handler should have handler class');
    assertTrue('mimeTypes' in handler, 'Handler should have mimeTypes');
    assertTrue('extensions' in handler, 'Handler should have extensions');
    assertTrue('priority' in handler, 'Handler should have priority');
});

// Test: getAcceptAttribute returns comma-separated list with deduplication
test('getAcceptAttribute returns comma-separated list with deduplication', () => {
    // Register handler with duplicate MIME type
    FileUploadRegistry.register({
        id: 'duplicate-test',
        handler: TestFileHandler,
        mimeTypes: ['application/pdf'], // Already registered by test-mime-handler
        extensions: ['.pdf'], // Already registered by test-ext-handler-find
        priority: PRIORITY.COMMUNITY,
    });

    const accept = FileUploadRegistry.getAcceptAttribute();
    assertTrue(typeof accept === 'string', 'Should return string');
    assertTrue(accept.includes('application/pdf'), 'Should include MIME types');
    assertTrue(accept.includes('.pdf'), 'Should include extensions');
    // Count occurrences - should appear only once despite multiple handlers
    const pdfMimeCount = (accept.match(/application\/pdf/g) || []).length;
    const pdfExtCount = (accept.match(/\.pdf/g) || []).length;
    assertTrue(pdfMimeCount === 1, 'MIME type should appear only once (deduplicated)');
    assertTrue(pdfExtCount === 1, 'Extension should appear only once (deduplicated)');
});

// Test: Handler overwriting actually replaces old handler
test('Handler overwriting replaces old handler', () => {
    class Handler1 extends FileUploadHandlerPlugin {
        async handleUpload() {
            return { handler: 1 };
        }
    }

    class Handler2 extends FileUploadHandlerPlugin {
        async handleUpload() {
            return { handler: 2 };
        }
    }

    FileUploadRegistry.register({
        id: 'overwrite-test',
        handler: Handler1,
        mimeTypes: ['application/overwrite'],
        priority: PRIORITY.COMMUNITY,
    });

    FileUploadRegistry.register({
        id: 'overwrite-test',
        handler: Handler2,
        mimeTypes: ['application/overwrite'],
        priority: PRIORITY.COMMUNITY,
    });

    const handlers = FileUploadRegistry.getAllHandlers();
    const handler = handlers.find((h) => h.id === 'overwrite-test');
    assertEqual(handler.handler, Handler2, 'Should be Handler2 (overwritten)');
});

// Test: File with no extension returns null
test('findHandler returns null for file with no extension and no MIME type', () => {
    const file = new MockFile('README', '');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler === null, 'Should return null for file with no extension and no MIME type');
});

// Test: Priority wins over match type (MIME vs extension)
test('findHandler prioritizes higher priority handler regardless of match type', () => {
    FileUploadRegistry.register({
        id: 'mime-match-low-priority',
        handler: TestFileHandler,
        mimeTypes: ['application/priority-test'],
        priority: PRIORITY.COMMUNITY, // Lower priority
    });

    FileUploadRegistry.register({
        id: 'ext-match-high-priority',
        handler: TestFileHandler,
        extensions: ['.priority-test'],
        priority: PRIORITY.BUILTIN, // Higher priority wins
    });

    const file = new MockFile('test.priority-test', 'application/priority-test');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found');
    // Higher priority handler wins, even if it matches by extension vs MIME type
    assertEqual(handler.id, 'ext-match-high-priority', 'Higher priority handler should win');
});

// Test: Handler with both MIME type and extension matches correctly
test('findHandler matches handler with both MIME type and extension', () => {
    FileUploadRegistry.register({
        id: 'both-match',
        handler: TestFileHandler,
        mimeTypes: ['application/both-test'],
        extensions: ['.both-test'],
        priority: PRIORITY.COMMUNITY,
    });

    // File matches both - handler should be found
    const file = new MockFile('test.both-test', 'application/both-test');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found');
    assertEqual(handler.id, 'both-match', 'Should find handler');
});

// Test: Empty arrays are handled correctly
test('Empty mimeTypes array is handled correctly', () => {
    FileUploadRegistry.register({
        id: 'empty-mime',
        handler: TestFileHandler,
        mimeTypes: [],
        extensions: ['.empty'],
        priority: PRIORITY.COMMUNITY,
    });

    const file = new MockFile('test.empty', '');
    const handler = FileUploadRegistry.findHandler(file);
    assertTrue(handler !== null, 'Handler should be found by extension');
    assertEqual(handler.id, 'empty-mime', 'Should find handler with empty mimeTypes');
});

// Test: Wildcard MIME type with empty file.type
test('findHandler handles empty file.type with wildcard MIME type', () => {
    FileUploadRegistry.register({
        id: 'wildcard-empty-type',
        handler: TestFileHandler,
        mimeTypes: ['image/*'],
        priority: PRIORITY.COMMUNITY,
    });

    const file = new MockFile('test.png', ''); // Empty type
    const handler = FileUploadRegistry.findHandler(file);
    // Should not match wildcard if file.type is empty
    assertTrue(handler === null, 'Should not match wildcard when file.type is empty');
});

// ============================================================================
// FileUploadHandlerPlugin Base Class Tests
// ============================================================================

// Test: Constructor injects context
test('FileUploadHandlerPlugin constructor injects context', () => {
    const mockContext = {
        app: { test: 'app' },
        graph: { test: 'graph' },
        canvas: { test: 'canvas' },
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandler(mockContext);
    assertEqual(handler.app, mockContext.app, 'App should be injected');
    assertEqual(handler.graph, mockContext.graph, 'Graph should be injected');
    assertEqual(handler.canvas, mockContext.canvas, 'Canvas should be injected');
    assertTrue(typeof handler.saveSession === 'function', 'saveSession should be injected');
    assertTrue(typeof handler.updateEmptyState === 'function', 'updateEmptyState should be injected');
    assertTrue(typeof handler.showCanvasHint === 'function', 'showCanvasHint should be injected');
});

// Test: handleUpload must be implemented
await asyncTest('handleUpload throws error if not implemented', async () => {
    const mockContext = {
        app: {},
        graph: {},
        canvas: {},
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new FileUploadHandlerPlugin(mockContext);
    const file = new MockFile('test.pdf', 'application/pdf');

    try {
        await handler.handleUpload(file);
        throw new Error('Expected handleUpload to throw');
    } catch (error) {
        assertTrue(
            error.message.includes('must be implemented by subclass'),
            'Should throw implementation error'
        );
    }
});

// Test: validateFile passes for valid file size
test('validateFile passes for valid file size', () => {
    const mockContext = {
        app: {},
        graph: {},
        canvas: {},
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandlerWithValidation(mockContext);
    const file = new MockFile('test.pdf', 'application/pdf', 3000); // 3KB, under 5KB limit

    // Should not throw
    handler.validateFile(file, 5000, 'Test file');
});

// Test: validateFile throws for file too large
test('validateFile throws for file too large', () => {
    const mockContext = {
        app: {},
        graph: {},
        canvas: {},
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandlerWithValidation(mockContext);
    const file = new MockFile('test.pdf', 'application/pdf', 10 * 1024 * 1024); // 10MB, over 5MB limit

    assertThrows(
        () => {
            handler.validateFile(file, 5 * 1024 * 1024, 'Test file');
        },
        'too large'
    );
});

// Test: validateFile handles edge cases (zero size, exact limit)
test('validateFile handles edge cases correctly', () => {
    const mockContext = {
        app: {},
        graph: {},
        canvas: {},
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandlerWithValidation(mockContext);

    // Zero size file should pass
    const zeroFile = new MockFile('test.pdf', 'application/pdf', 0);
    handler.validateFile(zeroFile, 5000, 'Test file'); // Should not throw

    // File at exact limit should pass
    const exactLimitFile = new MockFile('test.pdf', 'application/pdf', 5000);
    handler.validateFile(exactLimitFile, 5000, 'Test file'); // Should not throw

    // File one byte over limit should throw
    const overLimitFile = new MockFile('test.pdf', 'application/pdf', 5001);
    assertThrows(
        () => {
            handler.validateFile(overLimitFile, 5000, 'Test file');
        },
        'too large'
    );
});

// Test: addNodeToCanvas calls methods in correct order
test('addNodeToCanvas calls methods in correct order', () => {
    const callOrder = [];

    const mockContext = {
        app: {},
        graph: {
            addNode: (node) => {
                callOrder.push('graph.addNode');
                assertTrue(node !== undefined, 'Node should be passed to graph');
            },
        },
        canvas: {
            renderNode: (node) => {
                callOrder.push('canvas.renderNode');
                assertTrue(node !== undefined, 'Node should be passed to canvas');
            },
            clearSelection: () => {
                callOrder.push('canvas.clearSelection');
            },
            centerOnAnimated: () => {
                callOrder.push('canvas.centerOnAnimated');
            },
        },
        saveSession: () => {
            callOrder.push('saveSession');
        },
        updateEmptyState: () => {
            callOrder.push('updateEmptyState');
        },
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandler(mockContext);
    const node = createNode(NodeType.TEXT, 'Test', { position: { x: 100, y: 200 } });

    handler.addNodeToCanvas(node);

    // Verify order: graph.addNode → canvas.renderNode → canvas.clearSelection → saveSession → updateEmptyState → centerOnAnimated
    assertEqual(callOrder[0], 'graph.addNode', 'graph.addNode should be called first');
    assertEqual(callOrder[1], 'canvas.renderNode', 'canvas.renderNode should be called second');
    assertEqual(callOrder[2], 'canvas.clearSelection', 'canvas.clearSelection should be called third');
    assertEqual(callOrder[3], 'saveSession', 'saveSession should be called fourth');
    assertEqual(callOrder[4], 'updateEmptyState', 'updateEmptyState should be called fifth');
    assertEqual(callOrder[5], 'canvas.centerOnAnimated', 'canvas.centerOnAnimated should be called last');
});

// Test: updateNodeAfterProcessing updates node content
test('updateNodeAfterProcessing updates node content', () => {
    let canvasUpdateCalled = false;
    let graphUpdateCalled = false;
    let saveSessionCalled = false;

    const mockContext = {
        app: {},
        graph: {
            updateNode: (nodeId, data) => {
                graphUpdateCalled = true;
                assertEqual(nodeId, 'test-node-id', 'Node ID should match');
                assertEqual(data.content, 'New content', 'Content should match');
                assertEqual(data.customField, 'customValue', 'Custom data should be included');
            },
        },
        canvas: {
            updateNodeContent: (nodeId, content, isStreaming) => {
                canvasUpdateCalled = true;
                assertEqual(nodeId, 'test-node-id', 'Node ID should match');
                assertEqual(content, 'New content', 'Content should match');
                assertFalse(isStreaming, 'isStreaming should be false');
            },
        },
        saveSession: () => {
            saveSessionCalled = true;
        },
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandler(mockContext);
    handler.updateNodeAfterProcessing('test-node-id', 'New content', { customField: 'customValue' });

    assertTrue(canvasUpdateCalled, 'canvas.updateNodeContent should be called');
    assertTrue(graphUpdateCalled, 'graph.updateNode should be called');
    assertTrue(saveSessionCalled, 'saveSession should be called');
});

// Test: handleError updates node with error message
test('handleError updates node with error message when nodeId provided', () => {
    let canvasUpdateCalled = false;
    let graphUpdateCalled = false;
    let saveSessionCalled = false;

    const mockContext = {
        app: {},
        graph: {
            updateNode: (nodeId, data) => {
                graphUpdateCalled = true;
                assertEqual(nodeId, 'test-node-id', 'Node ID should match');
                assertTrue(data.content.includes('Failed to process'), 'Should include error message');
                assertTrue(data.content.includes('test.pdf'), 'Should include file name');
                assertTrue(data.content.includes('Test error'), 'Should include error message');
            },
        },
        canvas: {
            updateNodeContent: (nodeId, content, isStreaming) => {
                canvasUpdateCalled = true;
                assertEqual(nodeId, 'test-node-id', 'Node ID should match');
                assertTrue(content.includes('Failed to process'), 'Should include error message');
                assertFalse(isStreaming, 'isStreaming should be false');
            },
        },
        saveSession: () => {
            saveSessionCalled = true;
        },
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandler(mockContext);
    const file = new MockFile('test.pdf', 'application/pdf');
    const error = new Error('Test error');

    // Mock alert to prevent it from actually showing
    const originalAlert = global.alert;
    global.alert = () => {};

    try {
        handler.handleError('test-node-id', file, error);
        assertTrue(canvasUpdateCalled, 'canvas.updateNodeContent should be called');
        assertTrue(graphUpdateCalled, 'graph.updateNode should be called');
        assertTrue(saveSessionCalled, 'saveSession should be called');
    } finally {
        global.alert = originalAlert;
    }
});

// Test: handleError shows alert when no nodeId
test('handleError shows alert when nodeId not provided', () => {
    let alertCalled = false;
    let alertMessage = '';

    const mockContext = {
        app: {},
        graph: {},
        canvas: {},
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const handler = new TestFileHandler(mockContext);
    const file = new MockFile('test.pdf', 'application/pdf');
    const error = new Error('Test error');

    // Mock alert
    const originalAlert = global.alert;
    global.alert = (message) => {
        alertCalled = true;
        alertMessage = message;
    };

    try {
        handler.handleError(null, file, error);
        assertTrue(alertCalled, 'alert should be called');
        assertTrue(alertMessage.includes('test.pdf'), 'Alert should include file name');
        assertTrue(alertMessage.includes('Test error'), 'Alert should include error message');
    } finally {
        global.alert = originalAlert;
    }
});

// ============================================================================
// FileUploadHandler Dispatcher Tests
// ============================================================================

// Test: FileUploadHandler finds handler and delegates
await asyncTest('FileUploadHandler finds handler and delegates to plugin', async () => {
    let handlerCalled = false;
    let receivedFile = null;
    let receivedPosition = null;
    let receivedContext = null;

    class DispatcherTestHandler extends FileUploadHandlerPlugin {
        async handleUpload(file, position, context) {
            handlerCalled = true;
            receivedFile = file;
            receivedPosition = position;
            receivedContext = context;
            const node = createNode(NodeType.TEXT, 'Dispatched', { position: { x: 0, y: 0 } });
            return node;
        }
    }

    FileUploadRegistry.register({
        id: 'dispatcher-test',
        handler: DispatcherTestHandler,
        mimeTypes: ['application/dispatcher-test'],
        priority: PRIORITY.COMMUNITY,
    });

    const mockApp = {
        graph: { addNode: () => {} },
        canvas: { renderNode: () => {}, clearSelection: () => {}, centerOnAnimated: () => {} },
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const fileUploadHandler = new FileUploadHandler(mockApp);
    const file = new MockFile('test.dispatcher', 'application/dispatcher-test');
    const position = { x: 100, y: 200 };
    const context = { showHint: true };

    const node = await fileUploadHandler.handleFileUpload(file, position, context);

    assertTrue(handlerCalled, 'Handler should be called');
    assertEqual(receivedFile, file, 'File should be passed to handler');
    assertEqual(receivedPosition, position, 'Position should be passed to handler');
    assertEqual(receivedContext, context, 'Context should be passed to handler');
    assertTrue(node !== undefined, 'Should return a node');
});

// Test: FileUploadHandler returns null for unsupported file
await asyncTest('FileUploadHandler returns null and shows alert for unsupported file', async () => {
    let alertCalled = false;
    let alertMessage = '';

    const originalAlert = global.alert;
    global.alert = (message) => {
        alertCalled = true;
        alertMessage = message;
    };

    try {
        const mockApp = {
            graph: {},
            canvas: {},
            saveSession: () => {},
            updateEmptyState: () => {},
            showCanvasHint: () => {},
        };

        const fileUploadHandler = new FileUploadHandler(mockApp);
        const file = new MockFile('test.unknown', 'application/unknown');

        const result = await fileUploadHandler.handleFileUpload(file);

        assertTrue(result === null, 'Should return null for unsupported file');
        assertTrue(alertCalled, 'Alert should be called');
        assertTrue(alertMessage.includes('test.unknown'), 'Alert should include file name');
        assertTrue(
            alertMessage.includes('Unsupported file type') || alertMessage.includes('unknown type'),
            'Alert should mention unsupported file type'
        );
    } finally {
        global.alert = originalAlert;
    }
});

// Test: FileUploadHandler handles handler errors gracefully
await asyncTest('FileUploadHandler handles handler errors gracefully', async () => {
    class ErrorTestHandler extends FileUploadHandlerPlugin {
        async handleUpload() {
            throw new Error('Handler error');
        }
    }

    FileUploadRegistry.register({
        id: 'error-test',
        handler: ErrorTestHandler,
        mimeTypes: ['application/error-test'],
        priority: PRIORITY.COMMUNITY,
    });

    let consoleErrorCalled = false;
    const originalConsoleError = console.error;
    console.error = () => {
        consoleErrorCalled = true;
    };

    try {
        const mockApp = {
            graph: {},
            canvas: {},
            saveSession: () => {},
            updateEmptyState: () => {},
            showCanvasHint: () => {},
        };

        const fileUploadHandler = new FileUploadHandler(mockApp);
        const file = new MockFile('test.error', 'application/error-test');

        const result = await fileUploadHandler.handleFileUpload(file);

        assertTrue(result === null, 'Should return null when handler throws');
        assertTrue(consoleErrorCalled, 'Should log error');
    } finally {
        console.error = originalConsoleError;
    }
});

// Test: FileUploadHandler passes correct context structure
await asyncTest('FileUploadHandler passes correct context structure to handler', async () => {
    let receivedContext = null;
    let saveSessionCalled = false;
    let updateEmptyStateCalled = false;
    let showCanvasHintCalled = false;
    let showCanvasHintMessage = '';

    class ContextTestHandler extends FileUploadHandlerPlugin {
        constructor(context) {
            super(context);
            receivedContext = context;
        }

        async handleUpload() {
            // Test that context methods are actually callable
            this.saveSession();
            this.updateEmptyState();
            this.showCanvasHint('Test hint');
            return createNode(NodeType.TEXT, 'Test', { position: { x: 0, y: 0 } });
        }
    }

    FileUploadRegistry.register({
        id: 'context-test',
        handler: ContextTestHandler,
        mimeTypes: ['application/context-test'],
        priority: PRIORITY.COMMUNITY,
    });

    const mockApp = {
        testApp: 'app-value',
        graph: { testGraph: 'graph-value' },
        canvas: { testCanvas: 'canvas-value' },
        saveSession: () => {
            saveSessionCalled = true;
        },
        updateEmptyState: () => {
            updateEmptyStateCalled = true;
        },
        showCanvasHint: (message) => {
            showCanvasHintCalled = true;
            showCanvasHintMessage = message;
        },
    };

    const fileUploadHandler = new FileUploadHandler(mockApp);
    const file = new MockFile('test.context', 'application/context-test');

    await fileUploadHandler.handleFileUpload(file);

    assertTrue(receivedContext !== null, 'Context should be passed to handler');
    assertEqual(receivedContext.app, mockApp, 'App should be passed in context');
    assertEqual(receivedContext.graph, mockApp.graph, 'Graph should be passed in context');
    assertEqual(receivedContext.canvas, mockApp.canvas, 'Canvas should be passed in context');
    assertTrue(typeof receivedContext.saveSession === 'function', 'saveSession should be function');
    assertTrue(typeof receivedContext.updateEmptyState === 'function', 'updateEmptyState should be function');
    assertTrue(typeof receivedContext.showCanvasHint === 'function', 'showCanvasHint should be function');
    // Verify methods are actually callable and work
    assertTrue(saveSessionCalled, 'saveSession should be callable');
    assertTrue(updateEmptyStateCalled, 'updateEmptyState should be callable');
    assertTrue(showCanvasHintCalled, 'showCanvasHint should be callable');
    assertEqual(showCanvasHintMessage, 'Test hint', 'showCanvasHint should receive message');
});

// ============================================================================
// Integration Tests
// ============================================================================

// Test: End-to-end through FileUploadHandler dispatcher
await asyncTest('End-to-end: FileUploadHandler dispatches to handler correctly', async () => {
    const state = {
        handlerInstantiated: false,
        handleUploadCalled: false,
        nodeCreated: false,
    };

    class FullFlowHandler extends FileUploadHandlerPlugin {
        constructor(context) {
            super(context);
            state.handlerInstantiated = true;
        }

        async handleUpload(file, position, context) {
            state.handleUploadCalled = true;
            const node = createNode(NodeType.TEXT, 'Full flow test', {
                position: position || { x: 0, y: 0 },
            });
            this.addNodeToCanvas(node);
            state.nodeCreated = true;
            return node;
        }
    }

    FileUploadRegistry.register({
        id: 'full-flow-test',
        handler: FullFlowHandler,
        mimeTypes: ['application/full-flow'],
        priority: PRIORITY.COMMUNITY,
    });

    let graphAddNodeCalled = false;
    let canvasRenderNodeCalled = false;

    const mockApp = {
        graph: {
            addNode: (node) => {
                graphAddNodeCalled = true;
                assertTrue(node !== undefined, 'Node should be passed to graph');
            },
            autoPosition: () => ({ x: 0, y: 0 }),
        },
        canvas: {
            renderNode: (node) => {
                canvasRenderNodeCalled = true;
                assertTrue(node !== undefined, 'Node should be passed to canvas');
            },
            clearSelection: () => {},
            centerOnAnimated: () => {},
        },
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const fileUploadHandler = new FileUploadHandler(mockApp);
    const file = new MockFile('test.fullflow', 'application/full-flow');
    const position = { x: 50, y: 100 };

    const node = await fileUploadHandler.handleFileUpload(file, position);

    assertTrue(state.handlerInstantiated, 'Handler should be instantiated');
    assertTrue(state.handleUploadCalled, 'handleUpload should be called');
    assertTrue(state.nodeCreated, 'Node should be created');
    assertTrue(graphAddNodeCalled, 'graph.addNode should be called');
    assertTrue(canvasRenderNodeCalled, 'canvas.renderNode should be called');
    assertTrue(node !== undefined, 'Should return a node');
});

// Test: FileUploadHandler handles null graph/canvas gracefully
await asyncTest('FileUploadHandler handles null graph/canvas gracefully', async () => {
    class NullContextHandler extends FileUploadHandlerPlugin {
        async handleUpload() {
            // Handler should be able to handle null graph/canvas
            // (e.g., during app initialization)
            if (this.graph && this.canvas) {
                const node = createNode(NodeType.TEXT, 'Test', { position: { x: 0, y: 0 } });
                this.addNodeToCanvas(node);
                return node;
            }
            // If graph/canvas are null, handler should handle it
            return createNode(NodeType.TEXT, 'No graph/canvas', { position: { x: 0, y: 0 } });
        }
    }

    FileUploadRegistry.register({
        id: 'null-context-test',
        handler: NullContextHandler,
        mimeTypes: ['application/null-context'],
        priority: PRIORITY.COMMUNITY,
    });

    const mockApp = {
        graph: null, // Null graph
        canvas: null, // Null canvas
        saveSession: () => {},
        updateEmptyState: () => {},
        showCanvasHint: () => {},
    };

    const fileUploadHandler = new FileUploadHandler(mockApp);
    const file = new MockFile('test.null', 'application/null-context');

    // Should not throw even with null graph/canvas
    const node = await fileUploadHandler.handleFileUpload(file);
    assertTrue(node !== undefined, 'Should return a node even with null graph/canvas');
});

// Test: Handler that throws before creating node (real scenario)
await asyncTest('FileUploadHandler handles handler that throws before creating node', async () => {
    class EarlyErrorHandler extends FileUploadHandlerPlugin {
        async handleUpload() {
            // Simulate validation error before node creation (like PDF handler does)
            throw new Error('File validation failed');
        }
    }

    FileUploadRegistry.register({
        id: 'early-error-test',
        handler: EarlyErrorHandler,
        mimeTypes: ['application/early-error'],
        priority: PRIORITY.COMMUNITY,
    });

    let consoleErrorCalled = false;
    let consoleErrorMessage = '';
    const originalConsoleError = console.error;
    console.error = (message) => {
        consoleErrorCalled = true;
        consoleErrorMessage = message;
    };

    try {
        const mockApp = {
            graph: {},
            canvas: {},
            saveSession: () => {},
            updateEmptyState: () => {},
            showCanvasHint: () => {},
        };

        const fileUploadHandler = new FileUploadHandler(mockApp);
        const file = new MockFile('test.early', 'application/early-error');

        const result = await fileUploadHandler.handleFileUpload(file);

        assertTrue(result === null, 'Should return null when handler throws early');
        assertTrue(consoleErrorCalled, 'Should log error');
        assertTrue(consoleErrorMessage.includes('test.early'), 'Error log should include file name');
    } finally {
        console.error = originalConsoleError;
    }
});

console.log('\n✅ All file upload handler plugin system tests passed!\n');
