# Test Helpers

Reusable test utilities for common patterns in the codebase.

## Method Binding Tests

Use these helpers to catch errors where methods are referenced but don't exist (common after refactoring).

### `testMethodBindings(instance, methodNames, options)`

Test that methods exist before they're bound. Use this when you have a list of methods that should exist on a class.

```javascript
import { testMethodBindings } from './test_helpers/method-binding-test.js';

test('App methods exist', () => {
    const app = new App();
    testMethodBindings(app, [
        'handleNodeSelect',
        'handleNodeDelete',
        // ... other methods
    ], {
        className: 'App',
        delegatedMethods: {
            handleNodeTitleEdit: 'modalManager.handleNodeTitleEdit',
            handleNodeEditContent: 'modalManager.handleNodeEditContent'
        }
    });
});
```

### `testCallbackAssignments(instance, callbackAssignments, options)`

Test callback pattern (like Canvas.onNodeXxx). Use this when callbacks are assigned to properties.

```javascript
import { testCallbackAssignments } from './test_helpers/method-binding-test.js';

test('Canvas callbacks work', () => {
    const canvas = new Canvas('container', 'svg');
    const app = new App();

    testCallbackAssignments(canvas, {
        onNodeSelect: 'handleNodeSelect',
        onNodeDelete: 'handleNodeDelete'
    }, {
        className: 'Canvas',
        // Note: methods come from app, not canvas
        instance: app
    });
});
```

### `testEventListenerSetup(setupFunction, options)`

Test event listener setup by actually executing the binding code. This is the most thorough test.

```javascript
import { testEventListenerSetup } from './test_helpers/method-binding-test.js';

test('App event listeners can be set up', () => {
    const app = new App();

    testEventListenerSetup(() => {
        app.canvas
            .on('nodeSelect', app.handleNodeSelect.bind(app))
            .on('nodeDelete', app.handleNodeDelete.bind(app));
    }, {
        className: 'App'
    });
});
```

## When to Use

Use these helpers when:

1. **Refactoring large files** - Extract modules and verify methods still exist
2. **Adding new features** - Ensure event listeners reference existing methods
3. **Moving methods between classes** - Catch references that weren't updated
4. **After major refactoring** - Run these tests to catch broken references

## Patterns to Test

- **Event listeners**: `.on('event', this.method.bind(this))`
- **Callback assignments**: `this.canvas.onNodeXxx = this.handleXxx.bind(this)`
- **Delegated methods**: `this.manager.handleXxx()` when method moved to manager
- **Direct method calls**: Methods called in templates or strings
