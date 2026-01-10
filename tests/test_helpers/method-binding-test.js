/**
 * Test helper for verifying method bindings and references.
 *
 * Catches errors like:
 * - this.handleX.bind(this) when handleX doesn't exist
 * - this.manager.handleX when manager.handleX doesn't exist
 * - Callbacks assigned to properties that don't exist
 *
 * Note: This file uses ESM exports for future use. For current test files that use
 * vm.runInThisContext, inline the pattern as shown in test_app_init.js.
 *
 * Usage (when ESM is available):
 * ```javascript
 * import { testMethodBindings, testCallbackAssignments } from './test_helpers/method-binding-test.js';
 *
 * test('MyClass methods exist', () => {
 *     const instance = new MyClass();
 *     testMethodBindings(instance, [
 *         'handleEvent1',
 *         'handleEvent2',
 *         // ... methods that should exist
 *     ]);
 * });
 * ```
 */

/**
 * Test that methods exist before they're bound.
 * This catches errors where a method was moved/removed but .bind(this) is still called.
 *
 * @param {Object} instance - The class instance to test
 * @param {string[]} methodNames - Array of method names that should exist
 * @param {Object} options - Options
 * @param {string} options.className - Name of the class (for error messages)
 * @param {Object} options.delegatedMethods - Map of method names to their delegated locations
 *   e.g., { handleNodeTitleEdit: 'modalManager.handleNodeTitleEdit' }
 */
export function testMethodBindings(instance, methodNames, options = {}) {
    const { className = 'Class', delegatedMethods = {} } = options;

    for (const methodName of methodNames) {
        // Check if method is delegated to another object
        if (delegatedMethods[methodName]) {
            const [targetName, targetMethod] = delegatedMethods[methodName].split('.');
            const target = instance[targetName];

            if (!target) {
                throw new Error(
                    `${className}: Delegated method ${methodName} requires ${targetName} to exist, but it's undefined`
                );
            }

            if (typeof target[targetMethod] !== 'function') {
                throw new Error(
                    `${className}: Delegated method ${methodName} -> ${delegatedMethods[methodName]} is not a function. ` +
                    `Method might have been moved but reference wasn't updated.`
                );
            }
        } else {
            // Method should exist directly on instance
            if (typeof instance[methodName] !== 'function') {
                throw new Error(
                    `${className}: Method ${methodName} is not a function. ` +
                    `It might have been moved to another class (check delegatedMethods) or removed.`
                );
            }
        }
    }
}

/**
 * Test that callback assignments work (for callback pattern like Canvas.onNodeXxx).
 * This catches errors where a callback property is assigned but the method doesn't exist.
 *
 * @param {Object} instance - The class instance to test
 * @param {Object} callbackAssignments - Map of callback property names to method names
 *   e.g., { onNodeSelect: 'handleNodeSelect', onNodeDelete: 'handleNodeDelete' }
 * @param {Object} options - Options
 * @param {string} options.className - Name of the class (for error messages)
 */
export function testCallbackAssignments(instance, callbackAssignments, options = {}) {
    const { className = 'Class' } = options;

    for (const [callbackProp, methodName] of Object.entries(callbackAssignments)) {
        // Try to assign the method (this would fail if method doesn't exist)
        try {
            if (typeof instance[methodName] !== 'function') {
                throw new Error(`Method ${methodName} is not a function`);
            }
            instance[callbackProp] = instance[methodName].bind(instance);
        } catch (err) {
            throw new Error(
                `${className}: Failed to assign callback ${callbackProp} -> ${methodName}: ${err.message}. ` +
                `Method might have been moved to another class.`
            );
        }
    }
}

/**
 * Test event listener bindings by actually executing the binding code.
 * This is the most thorough test - it catches errors at the exact point they would occur.
 *
 * @param {Function} setupFunction - Function that sets up event listeners
 *   Should call .bind(this) or similar on methods
 * @param {Object} options - Options
 * @param {string} options.className - Name of the class (for error messages)
 */
export function testEventListenerSetup(setupFunction, options = {}) {
    const { className = 'Class' } = options;

    try {
        setupFunction();
    } catch (err) {
        if (err.message.includes('Cannot read properties of undefined') &&
            err.message.includes('bind')) {
            throw new Error(
                `${className}: Event listener setup failed: ${err.message}. ` +
                `This usually means a method was moved to another class but the event listener wasn't updated.`
            );
        }
        // Re-throw other errors
        throw err;
    }
}

/**
 * Create a mock EventEmitter that captures bound methods for testing.
 * Useful for testing event listener setups without full DOM.
 *
 * @returns {Object} Mock EventEmitter with on() method that captures bindings
 */
export function createMockEventEmitter() {
    const capturedBindings = [];

    return {
        on(event, handler) {
            // If handler is a bound method, capture the original method name
            if (handler && handler.name && handler.name.startsWith('bound ')) {
                const methodName = handler.name.replace('bound ', '');
                capturedBindings.push({ event, methodName });
            }
            return this; // Chainable
        },
        getCapturedBindings() {
            return capturedBindings;
        }
    };
}

// CommonJS export for Node.js/testing (when using require)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testMethodBindings,
        testCallbackAssignments,
        testEventListenerSetup,
        createMockEventEmitter
    };
}
