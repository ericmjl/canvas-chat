# Extension Hooks Reference

Extension hooks allow plugins to intercept and modify core application behaviors. This is the Level 3 plugin capability that enables deep customization without forking the codebase.

## Code Self-Healing Hooks

The code self-healing system emits events at key points during error recovery, allowing plugins to:

- Prevent or modify self-healing behavior
- Add custom error analysis
- Provide alternative fixing strategies
- Enhance error messages with context

### `selfheal:before`

Emitted before code self-healing begins.

**Event data:**

```javascript
{
    nodeId: string,           // Code node being healed
    code: string,             // Current code content
    attemptNum: number,       // Current attempt (1-based)
    maxAttempts: number,      // Maximum attempts allowed
    originalPrompt: string,   // User's original prompt
    model: string,            // LLM model in use
    context: Object,          // Code generation context
}
```

**Cancellable:** Yes. Call `event.preventDefault()` to skip self-healing.

**Use cases:**

- Skip self-healing for specific error types
- Add pre-execution validation
- Log self-healing attempts for analytics

**Example:**

```javascript
getEventSubscriptions() {
    return {
        'selfheal:before': (event) => {
            const { code, attemptNum } = event.data;

            // Don't retry if code has syntax errors
            if (code.includes('SyntaxError') && attemptNum > 1) {
                event.preventDefault();
                console.log('Skipping self-heal: syntax error');
            }
        },
    };
}
```

### `selfheal:error`

Emitted when code execution fails during self-healing.

**Event data:**

```javascript
{
    nodeId: string,           // Code node with error
    code: string,             // Failed code
    error: string,            // Error message
    attemptNum: number,       // Current attempt
    maxAttempts: number,      // Maximum attempts
    originalPrompt: string,   // User's original prompt
    model: string,            // LLM model in use
    context: Object,          // Code generation context
}
```

**Cancellable:** No. Error has already occurred.

**Use cases:**

- Analyze error patterns
- Add context to error messages
- Track failure metrics
- Send alerts for critical errors

**Example:**

```javascript
getEventSubscriptions() {
    return {
        'selfheal:error': (event) => {
            const { error, attemptNum } = event.data;

            // Log common errors for analysis
            if (error.includes('ImportError')) {
                console.log(`Import error on attempt ${attemptNum}:`, error);
                // Could send to analytics service
            }
        },
    };
}
```

### `selfheal:fix`

Emitted before LLM is asked to fix code error.

**Event data:**

```javascript
{
    nodeId: string,           // Code node being fixed
    failedCode: string,       // Code that failed
    errorMessage: string,     // Error from execution
    originalPrompt: string,   // User's original prompt
    model: string,            // LLM model in use
    context: Object,          // Code generation context
    attemptNum: number,       // Current attempt
    maxAttempts: number,      // Maximum attempts
    fixPrompt: string,        // Prompt that will be sent to LLM
}
```

**Cancellable:** Yes. Call `event.preventDefault()` and set `event.data.customFixPrompt` to replace the fix strategy.

**Use cases:**

- Customize fix prompts for specific error types
- Add domain-specific context to fixes
- Implement custom fixing strategies (e.g., use different model)
- Skip LLM call and apply manual fixes

**Example:**

```javascript
getEventSubscriptions() {
    return {
        'selfheal:fix': (event) => {
            const { errorMessage, failedCode } = event.data;

            // Custom handling for import errors
            if (errorMessage.includes('ImportError: No module named')) {
                event.preventDefault();

                // Extract missing module name
                const match = errorMessage.match(/No module named '(\w+)'/);
                if (match) {
                    const module = match[1];
                    // Provide custom fix prompt with package installation
                    event.data.customFixPrompt = `
The code is missing the package "${module}".

Failed code:
\`\`\`python
${failedCode}
\`\`\`

Please fix by:
1. Adding a pip install cell: # %pip install ${module}
2. Then the original code

Output ONLY the corrected Python code.`;
                }
            }
        },
    };
}
```

### `selfheal:success`

Emitted when self-healing successfully fixes and executes code.

**Event data:**

```javascript
{
    nodeId: string,           // Code node that succeeded
    code: string,             // Working code
    attemptNum: number,       // Successful attempt number
    originalPrompt: string,   // User's original prompt
    model: string,            // LLM model used
    result: Object,           // Execution result (stdout, html, etc.)
}
```

**Cancellable:** No. Success has already occurred.

**Use cases:**

- Track success rates by error type
- Log successful fixes for learning
- Auto-commit working code
- Show success notifications

**Example:**

```javascript
getEventSubscriptions() {
    return {
        'selfheal:success': (event) => {
            const { attemptNum, code } = event.data;

            if (attemptNum > 1) {
                console.log(`✅ Self-healing succeeded after ${attemptNum} attempts`);
                // Could save successful fix pattern for future reference
            }
        },
    };
}
```

### `selfheal:failed`

Emitted when self-healing exhausts all retry attempts.

**Event data:**

```javascript
{
    nodeId: string,           // Code node that failed
    code: string,             // Last attempted code
    error: string,            // Final error message
    attemptNum: number,       // Final attempt number (equals maxAttempts)
    maxAttempts: number,      // Maximum attempts allowed
    originalPrompt: string,   // User's original prompt
    model: string,            // LLM model used
}
```

**Cancellable:** No. All attempts have been exhausted.

**Use cases:**

- Show detailed error reports
- Suggest alternative approaches
- Escalate to human review
- Track permanently failing patterns

**Example:**

```javascript
getEventSubscriptions() {
    return {
        'selfheal:failed': (event) => {
            const { error, attemptNum } = event.data;

            console.log(`🛑 Self-healing failed after ${attemptNum} attempts`);
            console.log('Final error:', error);

            // Could show user-friendly explanation
            this.showToast?.('Code generation failed. Try rephrasing your prompt.', 'error');
        },
    };
}
```

## Event Emission Conventions

### Cancellable Events

Events with `preventDefault()` support use the `CancellableEvent` class:

```javascript
import { CancellableEvent } from './plugin-events.js';

const event = new CancellableEvent('selfheal:before', { nodeId, code, ... });
await this.emitter.emit('selfheal:before', event);

if (event.defaultPrevented) {
    // Plugin cancelled the operation
    return;
}
```

### Data Mutation

Plugins can modify event data to change behavior:

```javascript
// In plugin:
getEventSubscriptions() {
    return {
        'selfheal:fix': (event) => {
            // Replace the fix prompt
            event.data.customFixPrompt = 'Custom prompt...';
            event.preventDefault(); // Use custom prompt instead
        },
    };
}

// In app code:
const event = new CancellableEvent('selfheal:fix', { fixPrompt, ... });
await this.emitter.emit('selfheal:fix', event);

if (event.defaultPrevented && event.data.customFixPrompt) {
    // Use plugin's custom prompt
    fixPrompt = event.data.customFixPrompt;
}
```

## Hook Ordering

When multiple plugins subscribe to the same hook:

1. Plugins execute in **registration order** (first registered, first executed)
2. Priority only affects **slash command** conflicts, not event order
3. First plugin to call `preventDefault()` wins
4. Later plugins still execute but can't un-prevent

**Note:** Unlike slash commands (where higher priority wins), event subscribers are called in the order they were registered. If you need specific ordering, register plugins in that order.

## Best Practices

### Do

- ✅ Check specific conditions before preventing default
- ✅ Add console logs for debugging
- ✅ Preserve original data when possible
- ✅ Document why you're preventing default

### Don't

- ❌ Prevent default without checking conditions (breaks everything)
- ❌ Modify event data without preventing default (confusing behavior)
- ❌ Throw exceptions in event handlers (breaks event chain)
- ❌ Perform long-running operations synchronously (blocks UI)

### Example: Well-behaved extension

```javascript
class SmartFixPlugin extends FeaturePlugin {
    async onLoad() {
        console.log('[SmartFixPlugin] Loaded');
    }

    getEventSubscriptions() {
        return {
            'selfheal:fix': this.onFix.bind(this),
        };
    }

    onFix(event) {
        const { errorMessage, failedCode } = event.data;

        // Only intervene for specific cases
        if (!errorMessage.includes('ImportError')) {
            return; // Let default behavior handle it
        }

        console.log('[SmartFixPlugin] Handling ImportError');

        // Provide custom fix strategy
        event.data.customFixPrompt = this.buildImportFixPrompt(failedCode, errorMessage);
        event.preventDefault();

        console.log('[SmartFixPlugin] Custom fix prompt applied');
    }

    buildImportFixPrompt(code, error) {
        // Implementation...
    }
}
```

## Testing Extension Hooks

Use `PluginTestHarness` to test extension behavior:

```javascript
import { PluginTestHarness } from './plugin-test-harness.js';
import { CancellableEvent } from './plugin-events.js';

const harness = new PluginTestHarness();
await harness.loadPlugin({
    id: 'my-extension',
    feature: MyExtensionPlugin,
    priority: PRIORITY.COMMUNITY,
});

// Simulate event emission
const event = new CancellableEvent('selfheal:fix', {
    errorMessage: 'ImportError: No module named "pandas"',
    failedCode: 'import pandas as pd',
});

await harness.emitEvent('selfheal:fix', event);

// Verify behavior
assertTrue(event.defaultPrevented, 'Should prevent default for ImportError');
assertTrue(event.data.customFixPrompt !== undefined, 'Should provide custom prompt');
```

## Migration Guide

### Adding Hooks to Existing Features

1. **Identify hook points** - Where should plugins intervene?
2. **Import event classes** - `import { CancellableEvent } from './plugin-events.js'`
3. **Emit events** - `await this.featureRegistry.emitEvent('hook:name', event)`
4. **Handle preventDefault** - Check `event.defaultPrevented` after emission
5. **Document** - Add hook to this reference doc
6. **Test** - Write tests for hook behavior

### Example: Adding a new hook

```javascript
// 1. Before performing operation
const event = new CancellableEvent('matrix:before-fill', {
    matrixId,
    cellId,
    prompt,
});

// 2. Emit to plugins
await this.featureRegistry.emitEvent('matrix:before-fill', event);

// 3. Check if prevented
if (event.defaultPrevented) {
    console.log('Matrix fill prevented by plugin');
    return;
}

// 4. Continue with operation
await this.fillMatrixCell(matrixId, cellId, prompt);
```

## See Also

- [Plugin Architecture Overview](../explanation/plugin-architecture.md)
- [Feature Plugin API](./feature-plugin-api.md)
- [Event System](./event-system.md)
