# JSDoc Linting

Canvas-Chat uses `eslint-plugin-jsdoc` to validate JSDoc comments and catch documentation issues early.

## Configuration

The ESLint configuration is in `.eslintrc.json`:

```json
{
    "plugins": ["jsdoc"],
    "rules": {
        "jsdoc/require-jsdoc": [
            "warn",
            {
                "require": {
                    "FunctionDeclaration": true,
                    "MethodDefinition": true,
                    "ClassDeclaration": true
                }
            }
        ],
        "jsdoc/check-param-names": "error",
        "jsdoc/require-param": "warn",
        "jsdoc/require-returns": "warn"
    }
}
```

## Rules

| Rule                      | Severity | Description                                                |
| ------------------------- | -------- | ---------------------------------------------------------- |
| `jsdoc/require-jsdoc`     | warn     | Functions, methods, and classes must have JSDoc comments   |
| `jsdoc/check-param-names` | error    | JSDoc `@param` names must match actual function parameters |
| `jsdoc/require-param`     | warn     | All function parameters should be documented               |
| `jsdoc/require-returns`   | warn     | Functions should document return values                    |

## Running Lint

```bash
# Run lint
npm run lint

# Auto-fix some issues
npm run lint:fix
```

## Example

**Good JSDoc:**

```javascript
/**
 * Send a chat message and stream the response
 * @param {Array<ChatMessage>} messages - Array of messages
 * @param {string} model - Model ID (e.g., "openai/gpt-4o")
 * @param {OnChunkCallback|null} onChunk - Callback for each chunk, or null
 * @param {OnDoneCallback} onDone - Callback when complete
 * @param {OnErrorCallback} onError - Callback on error
 * @returns {Promise<string>} Normalized full response content
 */
async sendMessage(messages, model, onChunk, onDone, onError) {
    // ...
}
```

## What It Catches

- Missing JSDoc on public methods
- `@param` names that don't match function signatures
- Missing `@param` or `@returns` documentation

## What It Does NOT Catch

- Calling non-existent methods on objects (requires TypeScript)
- Type mismatches in arguments

## See Also

- [TypeScript Migration GitHub Issue #169](https://github.com/ericmjl/canvas-chat/issues/169) - For adding TypeScript to catch more errors
