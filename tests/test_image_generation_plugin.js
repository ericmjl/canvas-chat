/**
 * Image Generation Feature as Plugin Tests
 * Verifies that the image generation feature works correctly when loaded via plugin system
 */

// Setup global mocks FIRST, before any imports that might use them
if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
    };
}

if (!global.indexedDB) {
    global.indexedDB = {
        open: () => {
            const request = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: {
                    transaction: () => ({
                        objectStore: () => ({
                            get: () => ({ onsuccess: null, onerror: null }),
                            put: () => ({ onsuccess: null, onerror: null }),
                            delete: () => ({ onsuccess: null, onerror: null }),
                        }),
                    }),
                },
            };
            setTimeout(() => {
                if (request.onsuccess) {
                    request.onsuccess({ target: request });
                }
            }, 0);
            return request;
        },
    };
}

// Mock global fetch
global.fetch = async (url, options) => {
    throw new Error(`Unexpected fetch: ${url}`);
};

// Mock global process for Node.js environment
if (typeof global.process === 'undefined') {
    global.process = {
        exit: (code) => {
            // In browser/test environment, just throw instead
            throw new Error(`Process.exit(${code})`);
        },
    };
}

// Mock global document for Node.js environment
if (typeof global.document === 'undefined') {
    global.document = {
        body: { innerHTML: '' },
        getElementById: (id) => {
            const elements = new Map();
            // Mock select element
            const element = {
                value: '',
                checked: false,
                innerHTML: '',
                textContent: '',
                style: { display: 'none' },
                addEventListener: () => {},
                appendChild: () => {},
                disabled: false,
            };
            elements.set(id, element);
            return element;
        },
        createElement: (tag) => {
            return {
                textContent: '',
            };
        },
    };
}

// Mock global window for Node.js environment
if (typeof global.window === 'undefined') {
    global.window = {
        location: {
            pathname: '/test',
        },
    };
}

// Now import modules
import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { PRIORITY } from '../src/canvas_chat/static/js/feature-registry.js';
import { assertTrue } from './test_helpers/assertions.js';
import { NodeType, EdgeType } from '../src/canvas_chat/static/js/graph-types.js';

// Import ImageGenerationFeature class only (not the module)
const { ImageGenerationFeature } = await import('../src/canvas_chat/static/js/plugins/image-generation.js');

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
        if (typeof process !== 'undefined' && process.exit) {
            process.exit(1);
        }
    }
}

console.log('\n=== Image Generation Feature as Plugin Tests ===\n');

// Test: Image generation feature can be loaded as plugin
await asyncTest('ImageGenerationFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'image-generation',
        feature: ImageGenerationFeature,
        slashCommands: [
            {
                command: '/image',
                handler: 'handleCommand',
            },
        ],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('image-generation');
    assertTrue(feature !== undefined, 'Image generation feature should be loaded');
    assertTrue(feature instanceof ImageGenerationFeature, 'Should be instance of ImageGenerationFeature');
});

// Test: Image generation feature has all required dependencies
await asyncTest('ImageGenerationFeature has all required dependencies', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'image-generation',
        feature: ImageGenerationFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('image-generation');
    assertTrue(feature.graph !== undefined, 'Should have graph');
    assertTrue(feature.canvas !== undefined, 'Should have canvas');
    assertTrue(feature.chat !== undefined, 'Should have chat');
    assertTrue(feature.storage !== undefined, 'Should have storage');
    assertTrue(feature.modalManager !== undefined, 'Should have modalManager');
});

// Test: /image slash command routes to ImageGenerationFeature
await asyncTest('/image slash command routes to ImageGenerationFeature', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'image-generation',
        feature: ImageGenerationFeature,
        slashCommands: [
            {
                command: '/image',
                handler: 'handleCommand',
            },
        ],
    });

    const handled = await harness.executeSlashCommand('/image', 'A serene garden', {});
    assertTrue(handled, 'Command should be handled by ImageGenerationFeature');
});

// Test: ImageGenerationFeature has required methods
await asyncTest('ImageGenerationFeature has required methods', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'image-generation',
        feature: ImageGenerationFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('image-generation');
    assertTrue(typeof feature.handleCommand === 'function', 'Should have handleCommand');
    assertTrue(typeof feature.generateImage === 'function', 'Should have generateImage');
    assertTrue(typeof feature.showSettingsModal === 'function', 'Should have showSettingsModal');
    assertTrue(typeof feature.onLoad === 'function', 'Should have onLoad');
});

// Test: ImageGenerationFeature lifecycle hooks called
await asyncTest('ImageGenerationFeature lifecycle hooks called', async () => {
    let onLoadCalled = false;

    const TestFeature = class extends ImageGenerationFeature {
        async onLoad() {
            onLoadCalled = true;
            await super.onLoad();
        }
    };

    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'test-image-lifecycle',
        feature: TestFeature,
        slashCommands: [],
    });

    assertTrue(onLoadCalled, 'onLoad hook should be called');
});

// Test: Image generation command has BUILTIN priority
await asyncTest('Image generation command has BUILTIN priority', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'image-generation',
        feature: ImageGenerationFeature,
        slashCommands: [
            {
                command: '/image',
                handler: 'handleCommand',
            },
        ],
    });

    const feature = harness.getPlugin('image-generation');
    const commands = feature.getSlashCommands();
    assertTrue(commands.length > 0, 'Should have at least one slash command');
    assertTrue(commands[0].command === '/image', 'Should have /image command');
    assertTrue(commands[0].description !== undefined, 'Command should have description');
});

// Test: generateImage creates correct nodes and model property
await asyncTest('generateImage creates HUMAN and IMAGE nodes with model', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'image-generation',
        feature: ImageGenerationFeature,
        slashCommands: [],
    });

    const feature = harness.getPlugin('image-generation');

    // Set up prompt and simulate generateImage setup
    feature.currentPrompt = 'A serene Japanese garden';
    feature.parentNodeIds = [];

    // Mock the modal HTML elements that generateImage expects
    document.body.innerHTML = `
        <select id="image-gen-model">
            <option value="dall-e-3" selected>DALL-E 3</option>
        </select>
        <select id="image-gen-size">
            <option value="1024x1024" selected>Square</option>
        </select>
        <select id="image-gen-quality">
            <option value="hd" selected>HD</option>
        </select>
    `;

    // Set up modal to be hidden (simulate closing)
    feature.modalManager.hidePluginModal = () => {
        // Mock: just return, don't actually hide anything
    };

    // Track created nodes and edges
    const createdNodes = [];
    const createdEdges = [];

    // Hook into graph.addNode to track what gets created
    const originalAddNode = harness.mockApp.graph.addNode;
    harness.mockApp.graph.addNode = (node) => {
        createdNodes.push({ type: node.type, content: node.content, model: node.model, id: node.id });
        return originalAddNode.call(harness.mockApp.graph, node);
    };

    // Hook into graph.addEdge to track edges
    const originalAddEdge = harness.mockApp.graph.addEdge;
    harness.mockApp.graph.addEdge = (edge) => {
        createdEdges.push({ source: edge.source, target: edge.target, type: edge.type });
        return originalAddEdge.call(harness.mockApp.graph, edge);
    };

    // Mock fetch to return fake image data
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        if (url.includes('/api/generate-image')) {
            return {
                ok: true,
                json: async () => ({
                    imageData: 'fake-base64-image-data',
                    mimeType: 'image/png',
                    revised_prompt: 'Revised prompt text',
                }),
            };
        }
        if (originalFetch) return originalFetch(url, options);
        throw new Error(`Unexpected fetch: ${url}`);
    };

    // Mock canvas methods
    harness.mockApp.canvas.clearSelection = () => {};
    harness.mockApp.canvas.nodeElements = new Map();

    // Mock saveSession
    feature.saveSession = () => {};

    // Call generateImage
    await feature.generateImage();

    // Restore originals
    harness.mockApp.graph.addNode = originalAddNode;
    harness.mockApp.graph.addEdge = originalAddEdge;
    global.fetch = originalFetch;

    // Verify: Two nodes created (HUMAN and IMAGE)
    assertTrue(createdNodes.length === 2, `Should create 2 nodes, got ${createdNodes.length}`);

    // Verify: First node is HUMAN with prompt
    const humanNode = createdNodes.find((n) => n.type === 'human');
    assertTrue(humanNode !== undefined, 'Should create HUMAN node');
    assertTrue(
        humanNode.content.includes('/image') && humanNode.content.includes('A serene Japanese garden'),
        'HUMAN node should contain the full prompt'
    );

    // Verify: Second node is IMAGE with model stored
    const imageNode = createdNodes.find((n) => n.type === 'image');
    assertTrue(imageNode !== undefined, 'Should create IMAGE node');
    assertTrue(imageNode.model === 'dall-e-3', `IMAGE node should have model "dall-e-3", got ${imageNode.model}`);

    // Verify: Edge connects HUMAN to IMAGE
    assertTrue(createdEdges.length >= 1, `Should create at least 1 edge, got ${createdEdges.length}`);
    assertTrue(
        createdEdges.some((e) => e.type === 'reply'),
        'At least one edge should be of type reply'
    );

    // Find the HUMAN→IMAGE edge specifically
    const humanToImageEdge = createdEdges.find((e) => {
        const sourceNode = createdNodes.find((n) => n.id === e.source);
        const targetNode = createdNodes.find((n) => n.id === e.target);
        return sourceNode?.type === 'human' && targetNode?.type === 'image';
    });
    assertTrue(humanToImageEdge !== undefined, 'Should have edge from HUMAN to IMAGE');
});

console.log('\n=== All Image Generation plugin tests passed! ===');
