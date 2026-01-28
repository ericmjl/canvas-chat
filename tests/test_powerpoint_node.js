/**
 * PowerPoint feature as plugin tests
 * Verifies that the PowerPoint feature loads and basic canvas event handlers work.
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
                if (request.onsuccess) request.onsuccess({ target: request });
            }, 0);
            return request;
        },
    };
}

import { PRIORITY } from '../src/canvas_chat/static/js/feature-registry.js';
import { NodeType } from '../src/canvas_chat/static/js/graph-types.js';
import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

const { PowerPointFeature } = await import('../src/canvas_chat/static/js/plugins/powerpoint-node.js');

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

console.log('\n=== PowerPoint Feature as Plugin Tests ===\n');

await asyncTest('PowerPointFeature can be loaded as plugin', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'powerpoint',
        feature: PowerPointFeature,
        slashCommands: [],
        priority: PRIORITY.BUILTIN,
    });

    const feature = harness.getPlugin('powerpoint');
    assertTrue(feature instanceof PowerPointFeature, 'Should be instance of PowerPointFeature');
});

await asyncTest('PowerPointFeature canvas handlers update slide index', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'powerpoint',
        feature: PowerPointFeature,
        slashCommands: [],
    });

    const node = {
        id: 'pptx-1',
        type: NodeType.POWERPOINT,
        content: '',
        position: { x: 0, y: 0 },
        width: 480,
        height: 400,
        created_at: Date.now(),
        tags: [],
        pptxData: {
            slideCount: 3,
            slides: [
                { index: 0, title: 'S1', text_content: 'A', image_webp: 'AA==', thumb_webp: 'AA==' },
                { index: 1, title: 'S2', text_content: 'B', image_webp: 'AA==', thumb_webp: 'AA==' },
                { index: 2, title: 'S3', text_content: 'C', image_webp: 'AA==', thumb_webp: 'AA==' },
            ],
        },
        currentSlideIndex: 1,
    };
    harness.mockApp.graph.addNode(node);

    // Next slide
    harness.mockApp.canvas.emit('pptxNextSlide', node.id);
    assertEqual(harness.mockApp.graph.getNode(node.id).currentSlideIndex, 2);

    // Prev slide
    harness.mockApp.canvas.emit('pptxPrevSlide', node.id);
    assertEqual(harness.mockApp.graph.getNode(node.id).currentSlideIndex, 1);

    // Go to slide
    harness.mockApp.canvas.emit('pptxGoToSlide', node.id, 0);
    assertEqual(harness.mockApp.graph.getNode(node.id).currentSlideIndex, 0);
});

await asyncTest('PowerPointFeature can set slide titles', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'powerpoint',
        feature: PowerPointFeature,
        slashCommands: [],
    });

    const node = {
        id: 'pptx-2',
        type: NodeType.POWERPOINT,
        content: '',
        position: { x: 0, y: 0 },
        width: 480,
        height: 400,
        created_at: Date.now(),
        tags: [],
        pptxData: { slideCount: 1, slides: [{ index: 0, title: null, text_content: '', image_webp: 'AA==', thumb_webp: 'AA==' }] },
        currentSlideIndex: 0,
    };
    harness.mockApp.graph.addNode(node);

    harness.mockApp.canvas.emit('pptxSetSlideTitle', node.id, 0, 'My Title');
    assertEqual(harness.mockApp.graph.getNode(node.id).slideTitles[0], 'My Title');
});

await asyncTest('PowerPointFeature can extract current slide as IMAGE node', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'powerpoint',
        feature: PowerPointFeature,
        slashCommands: [],
    });

    const node = {
        id: 'pptx-3',
        type: NodeType.POWERPOINT,
        content: '',
        position: { x: 0, y: 0 },
        width: 480,
        height: 400,
        created_at: Date.now(),
        tags: [],
        pptxData: { slideCount: 1, slides: [{ index: 0, title: 'Slide', text_content: '', image_webp: 'AA==', thumb_webp: 'AA==' }] },
        currentSlideIndex: 0,
    };
    harness.mockApp.graph.addNode(node);

    harness.mockApp.canvas.emit('pptxExtractSlide', node.id);

    const created = harness.createdNodes.find((n) => n.type === NodeType.IMAGE);
    assertTrue(!!created, 'Should create an IMAGE node');
});

await asyncTest('PowerPointFeature weave narrative is safe without captions', async () => {
    const harness = new PluginTestHarness();
    await harness.loadPlugin({
        id: 'powerpoint',
        feature: PowerPointFeature,
        slashCommands: [],
    });

    const node = {
        id: 'pptx-4',
        type: NodeType.POWERPOINT,
        content: '',
        position: { x: 0, y: 0 },
        width: 480,
        height: 400,
        created_at: Date.now(),
        tags: [],
        pptxData: {
            slideCount: 2,
            slides: [
                { index: 0, title: 'S1', text_content: 'A', image_webp: 'AA==', thumb_webp: 'AA==' },
                { index: 1, title: 'S2', text_content: 'B', image_webp: 'AA==', thumb_webp: 'AA==' },
            ],
        },
        currentSlideIndex: 0,
    };
    harness.mockApp.graph.addNode(node);

    // No captions/titles set yet beyond defaults; should no-op without throwing.
    harness.mockApp.canvas.emit('pptxWeaveNarrative', node.id);
    assertTrue(true);
});
