/**
 * Tests for code self-healing extension hooks
 * Verifies that plugins can intercept and modify self-healing behavior
 */

import { PluginTestHarness } from '../src/canvas_chat/static/js/plugin-test-harness.js';
import { FeaturePlugin } from '../src/canvas_chat/static/js/feature-plugin.js';
import { CancellableEvent } from '../src/canvas_chat/static/js/plugin-events.js';
import { SmartFixPlugin } from '../src/canvas_chat/static/js/example-plugins/smart-fix-plugin.js';
import { PRIORITY } from '../src/canvas_chat/static/js/feature-registry.js';
import { assertEqual, assertTrue } from './test_helpers/assertions.js';

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

console.log('\n=== Code Self-Healing Extension Hook Tests ===\n');

// Test: selfheal:before hook can prevent self-healing
await asyncTest('selfheal:before hook can prevent self-healing', async () => {
    const harness = new PluginTestHarness();

    // Create plugin that prevents self-healing
    class PreventPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:before': (event) => {
                    event.preventDefault();
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'prevent',
        feature: PreventPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const event = new CancellableEvent('selfheal:before', {
        nodeId: 'test-node',
        code: 'print("test")',
        attemptNum: 1,
        maxAttempts: 3,
    });

    await harness.emitEvent('selfheal:before', event);

    assertTrue(event.defaultPrevented, 'Event should be prevented');
});

// Test: selfheal:error hook receives error data
await asyncTest('selfheal:error hook receives error data', async () => {
    const harness = new PluginTestHarness();

    let receivedError = null;
    class ErrorPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:error': (event) => {
                    receivedError = event.data.error;
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'error',
        feature: ErrorPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const event = new CancellableEvent('selfheal:error', {
        nodeId: 'test-node',
        error: 'ImportError: No module named pandas',
    });

    await harness.emitEvent('selfheal:error', event);

    assertEqual(receivedError, 'ImportError: No module named pandas', 'Should receive error message');
});

// Test: selfheal:fix hook can provide custom fix prompt
await asyncTest('selfheal:fix hook can provide custom fix prompt', async () => {
    const harness = new PluginTestHarness();

    class CustomFixPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:fix': (event) => {
                    if (event.data.errorMessage.includes('ImportError')) {
                        event.data.customFixPrompt = 'Custom fix prompt';
                        event.preventDefault();
                    }
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'customfix',
        feature: CustomFixPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const event = new CancellableEvent('selfheal:fix', {
        nodeId: 'test-node',
        errorMessage: 'ImportError: No module named pandas',
        failedCode: 'import pandas as pd',
        fixPrompt: 'Original prompt',
        customFixPrompt: null,
    });

    await harness.emitEvent('selfheal:fix', event);

    assertTrue(event.defaultPrevented, 'Event should be prevented');
    assertEqual(event.data.customFixPrompt, 'Custom fix prompt', 'Should have custom fix prompt');
});

// Test: selfheal:success hook receives success data
await asyncTest('selfheal:success hook receives success data', async () => {
    const harness = new PluginTestHarness();

    let successAttemptNum = null;
    class SuccessPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:success': (event) => {
                    successAttemptNum = event.data.attemptNum;
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'success',
        feature: SuccessPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const event = new CancellableEvent('selfheal:success', {
        nodeId: 'test-node',
        attemptNum: 2,
        code: 'print("success")',
    });

    await harness.emitEvent('selfheal:success', event);

    assertEqual(successAttemptNum, 2, 'Should receive attempt number');
});

// Test: selfheal:failed hook receives failure data
await asyncTest('selfheal:failed hook receives failure data', async () => {
    const harness = new PluginTestHarness();

    let failedError = null;
    class FailedPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:failed': (event) => {
                    failedError = event.data.error;
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'failed',
        feature: FailedPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const event = new CancellableEvent('selfheal:failed', {
        nodeId: 'test-node',
        error: 'Final error',
        attemptNum: 3,
        maxAttempts: 3,
    });

    await harness.emitEvent('selfheal:failed', event);

    assertEqual(failedError, 'Final error', 'Should receive error message');
});

// Test: SmartFixPlugin loads correctly
await asyncTest('SmartFixPlugin loads correctly', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'smartfix',
        feature: SmartFixPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const plugin = harness.getPlugin('smartfix');
    assertTrue(plugin !== undefined, 'Plugin should be loaded');
    assertTrue(plugin instanceof SmartFixPlugin, 'Should be instance of SmartFixPlugin');
});

// Test: SmartFixPlugin handles ImportError
await asyncTest('SmartFixPlugin provides custom fix for ImportError', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'smartfix',
        feature: SmartFixPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const event = new CancellableEvent('selfheal:fix', {
        nodeId: 'test-node',
        errorMessage: 'ImportError: No module named "pandas"',
        failedCode: 'import pandas as pd',
        originalPrompt: 'Load CSV file',
        fixPrompt: 'Original prompt',
        customFixPrompt: null,
    });

    await harness.emitEvent('selfheal:fix', event);

    assertTrue(event.defaultPrevented, 'Should prevent default');
    assertTrue(event.data.customFixPrompt !== null, 'Should provide custom prompt');
    assertTrue(event.data.customFixPrompt.includes('pip install pandas'), 'Should suggest pip install');
});

// Test: SmartFixPlugin handles NameError
await asyncTest('SmartFixPlugin provides custom fix for NameError', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'smartfix',
        feature: SmartFixPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const event = new CancellableEvent('selfheal:fix', {
        nodeId: 'test-node',
        errorMessage: 'NameError: name "x" is not defined',
        failedCode: 'print(x)',
        originalPrompt: 'Print variable',
        fixPrompt: 'Original prompt',
        customFixPrompt: null,
    });

    await harness.emitEvent('selfheal:fix', event);

    assertTrue(event.defaultPrevented, 'Should prevent default');
    assertTrue(event.data.customFixPrompt !== null, 'Should provide custom prompt');
    assertTrue(event.data.customFixPrompt.includes('x'), 'Should mention variable name');
});

// Test: SmartFixPlugin tracks statistics
await asyncTest('SmartFixPlugin tracks statistics', async () => {
    const harness = new PluginTestHarness();

    await harness.loadPlugin({
        id: 'smartfix',
        feature: SmartFixPlugin,
        priority: PRIORITY.COMMUNITY,
    });

    const plugin = harness.getPlugin('smartfix');

    // Simulate self-healing attempt
    await harness.emitEvent(
        'selfheal:before',
        new CancellableEvent('selfheal:before', {
            nodeId: 'test-node',
            code: 'import pandas as pd',
            attemptNum: 1,
            maxAttempts: 3,
        })
    );

    // Simulate error
    await harness.emitEvent(
        'selfheal:error',
        new CancellableEvent('selfheal:error', {
            nodeId: 'test-node',
            error: 'ImportError: test',
        })
    );

    // Simulate custom fix
    await harness.emitEvent(
        'selfheal:fix',
        new CancellableEvent('selfheal:fix', {
            nodeId: 'test-node',
            errorMessage: 'ImportError: No module named "test"',
            failedCode: 'import test',
            originalPrompt: 'Use test module',
            fixPrompt: 'Fix the code',
            customFixPrompt: null,
        })
    );

    // Simulate success
    await harness.emitEvent(
        'selfheal:success',
        new CancellableEvent('selfheal:success', {
            nodeId: 'test-node',
            attemptNum: 2,
        })
    );

    const stats = plugin.getStats();
    assertEqual(stats.totalAttempts, 1, 'Should track attempts');
    assertEqual(stats.customFixes, 1, 'Should track custom fixes');
    assertEqual(stats.successes, 1, 'Should track successes');
    assertTrue(stats.errorTypes['ImportError'] === 1, 'Should track error types');
});

// Test: Multiple plugins can subscribe to same hook
await asyncTest('Multiple plugins can subscribe to same hook', async () => {
    const harness = new PluginTestHarness();

    let plugin1Called = false;
    let plugin2Called = false;

    class Plugin1 extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:error': () => {
                    plugin1Called = true;
                },
            };
        }
    }

    class Plugin2 extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:error': () => {
                    plugin2Called = true;
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'plugin1',
        feature: Plugin1,
        priority: PRIORITY.COMMUNITY,
    });

    await harness.loadPlugin({
        id: 'plugin2',
        feature: Plugin2,
        priority: PRIORITY.COMMUNITY,
    });

    await harness.emitEvent(
        'selfheal:error',
        new CancellableEvent('selfheal:error', {
            error: 'Test error',
        })
    );

    assertTrue(plugin1Called, 'Plugin 1 should be called');
    assertTrue(plugin2Called, 'Plugin 2 should be called');
});

// Test: Plugins execute in registration order for events
await asyncTest('Plugins execute in registration order for events', async () => {
    const harness = new PluginTestHarness();

    let executionOrder = [];

    class FirstPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:before': (event) => {
                    executionOrder.push('first');
                    event.preventDefault();
                },
            };
        }
    }

    class SecondPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'selfheal:before': (event) => {
                    executionOrder.push('second');
                },
            };
        }
    }

    // Load first plugin
    await harness.loadPlugin({
        id: 'first',
        feature: FirstPlugin,
        priority: PRIORITY.COMMUNITY, // Priority doesn't affect event order
    });

    // Load second plugin
    await harness.loadPlugin({
        id: 'second',
        feature: SecondPlugin,
        priority: PRIORITY.BUILTIN, // Priority doesn't affect event order
    });

    const event = new CancellableEvent('selfheal:before', {});
    await harness.emitEvent('selfheal:before', event);

    assertTrue(event.defaultPrevented, 'Event should be prevented');
    assertEqual(executionOrder[0], 'first', 'First registered should execute first');
    assertEqual(executionOrder.length, 2, 'Both plugins should execute');
});

console.log('\n=== Matrix Extension Hook Tests ===\n');

// Test: matrix:before:fill hook can prevent cell fill
await asyncTest('matrix:before:fill hook can prevent cell fill', async () => {
    const harness = new PluginTestHarness();

    class MatrixBlockerPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'matrix:before:fill': (event) => {
                    event.preventDefault();
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'matrix-blocker',
        feature: MatrixBlockerPlugin,
    });

    const event = new CancellableEvent('matrix:before:fill', {
        nodeId: 'matrix-1',
        row: 0,
        col: 0,
        rowItem: 'Row A',
        colItem: 'Col 1',
        context: 'Test context',
        messages: [],
    });

    await harness.emitEvent('matrix:before:fill', event);

    assertTrue(event.defaultPrevented, 'Cell fill should be prevented');
});

// Test: matrix:cell:prompt hook can customize prompt
await asyncTest('matrix:cell:prompt hook can customize prompt', async () => {
    const harness = new PluginTestHarness();

    class CustomPromptPlugin extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'matrix:cell:prompt': (event) => {
                    event.data.customPrompt = 'Custom prompt for this cell';
                    event.preventDefault();
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'custom-prompt',
        feature: CustomPromptPlugin,
    });

    const event = new CancellableEvent('matrix:cell:prompt', {
        nodeId: 'matrix-1',
        row: 0,
        col: 0,
        rowItem: 'Row A',
        colItem: 'Col 1',
        context: 'Test context',
        messages: [],
        customPrompt: null,
    });

    await harness.emitEvent('matrix:cell:prompt', event);

    assertTrue(event.defaultPrevented, 'Should prevent default');
    assertEqual(event.data.customPrompt, 'Custom prompt for this cell', 'Should set custom prompt');
});

// Test: matrix:after:fill hook receives success data
await asyncTest('matrix:after:fill hook receives success data', async () => {
    const harness = new PluginTestHarness();

    let capturedData = null;

    class MatrixSuccessLogger extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'matrix:after:fill': (event) => {
                    capturedData = event.data;
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'success-logger',
        feature: MatrixSuccessLogger,
    });

    const event = {
        data: {
            nodeId: 'matrix-1',
            row: 0,
            col: 0,
            rowItem: 'Row A',
            colItem: 'Col 1',
            content: 'Generated cell content',
            success: true,
        },
    };

    await harness.emitEvent('matrix:after:fill', event);

    assertTrue(capturedData !== null, 'Should capture data');
    assertEqual(capturedData.success, true, 'Should indicate success');
    assertEqual(capturedData.content, 'Generated cell content', 'Should receive content');
});

// Test: matrix:after:fill hook receives error data
await asyncTest('matrix:after:fill hook receives error data', async () => {
    const harness = new PluginTestHarness();

    let capturedData = null;

    class MatrixErrorLogger extends FeaturePlugin {
        getEventSubscriptions() {
            return {
                'matrix:after:fill': (event) => {
                    capturedData = event.data;
                },
            };
        }
    }

    await harness.loadPlugin({
        id: 'error-logger',
        feature: MatrixErrorLogger,
    });

    const event = {
        data: {
            nodeId: 'matrix-1',
            row: 0,
            col: 0,
            rowItem: 'Row A',
            colItem: 'Col 1',
            content: null,
            success: false,
            error: 'Network error',
        },
    };

    await harness.emitEvent('matrix:after:fill', event);

    assertTrue(capturedData !== null, 'Should capture data');
    assertEqual(capturedData.success, false, 'Should indicate failure');
    assertEqual(capturedData.error, 'Network error', 'Should receive error message');
});

console.log('\n=== All extension hook tests passed! ===\n');
