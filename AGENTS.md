# Agents

Instructions for AI coding agents working on this project.

## Codebase map

Quick reference for which files to edit for common tasks:

### Frontend (Vanilla JS)

#### Core modules

| File                                       | Purpose                                     | Edit for...                                                         |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| `src/canvas_chat/static/js/app.js`         | Main application, orchestrates everything   | Slash commands, keyboard shortcuts, App class methods               |
| `src/canvas_chat/static/js/canvas.js`      | SVG canvas, pan/zoom, node rendering        | Node appearance, drag behavior, viewport logic, node event handlers |
| `src/canvas_chat/static/js/graph-types.js` | Node/edge types, factory functions          | Node types, edge types, createNode/createEdge utilities             |
| `src/canvas_chat/static/js/crdt-graph.js`  | CRDT-backed graph (Yjs), graph traversal    | Graph data model, node positioning, graph traversal                 |
| `src/canvas_chat/static/js/layout.js`      | Pure layout functions for overlap detection | Overlap detection, overlap resolution, node positioning algorithms  |
| `src/canvas_chat/static/js/chat.js`        | LLM API calls, streaming                    | API integration, message formatting, token estimation               |
| `src/canvas_chat/static/js/storage.js`     | localStorage persistence                    | Session storage, API key storage, settings                          |
| `src/canvas_chat/static/js/search.js`      | Node search functionality                   | Search UI, filtering logic                                          |
| `src/canvas_chat/static/js/sse.js`         | Server-sent events utilities                | Streaming connection handling                                       |
| `src/canvas_chat/static/js/utils.js`       | Pure utility functions                      | Image resizing, error formatting, text processing                   |

#### Feature modules

| File                                      | Purpose                | Edit for...                                |
| ----------------------------------------- | ---------------------- | ------------------------------------------ |
| `src/canvas_chat/static/js/flashcards.js` | FlashcardFeature class | Flashcard generation, spaced repetition UI |
| `src/canvas_chat/static/js/committee.js`  | CommitteeFeature class | Multi-LLM consultation, synthesis          |
| `src/canvas_chat/static/js/matrix.js`     | MatrixFeature class    | Comparison matrix creation, cell filling   |
| `src/canvas_chat/static/js/factcheck.js`  | FactcheckFeature class | Claim verification, web search integration |
| `src/canvas_chat/static/js/research.js`   | ResearchFeature class  | Deep research with Exa API                 |

### Frontend (HTML/CSS)

| File                                   | Purpose                      | Edit for...                                 |
| -------------------------------------- | ---------------------------- | ------------------------------------------- |
| `src/canvas_chat/static/index.html`    | Main HTML, modals, templates | New modals, toolbar buttons, HTML structure |
| `src/canvas_chat/static/css/style.css` | All styles                   | Colors, layout, node styling, animations    |

### Backend (Python/FastAPI)

| File                     | Purpose                   | Edit for...                  |
| ------------------------ | ------------------------- | ---------------------------- |
| `src/canvas_chat/app.py` | FastAPI routes, LLM proxy | API endpoints, backend logic |
| `modal_app.py`           | Modal deployment config   | Deployment settings          |

### Key constants and their locations

| Constant             | Location               | Purpose                         |
| -------------------- | ---------------------- | ------------------------------- |
| `NodeType`           | `graph-types.js:11-32` | All node type definitions       |
| `EdgeType`           | `graph-types.js:82-94` | All edge type definitions       |
| `DEFAULT_NODE_SIZES` | `graph-types.js:40-68` | Default dimensions by node type |
| `SLASH_COMMANDS`     | `app.js:15-22`         | Slash command definitions       |
| CSS variables        | `style.css:10-75`      | Colors, sizing, theming         |

### Zoom levels (semantic zoom)

| Scale      | Class          | Behavior                          |
| ---------- | -------------- | --------------------------------- |
| > 0.6      | `zoom-full`    | Full node content visible         |
| 0.35 - 0.6 | `zoom-summary` | Summary text shown, drag anywhere |
| <= 0.35    | `zoom-mini`    | Minimal view, drag anywhere       |

## Documentation

All documentation must follow the [Diataxis framework](https://diataxis.fr/):

- **docs/explanation/**: Design decisions, architecture rationale, "why" documents
- **docs/how-to/**: Task-oriented guides for accomplishing specific goals
- **docs/reference/**: Technical descriptions of APIs, configuration options, data structures

Do not mix documentation types. Each document should serve one purpose.

## Code style

- Backend: Python with FastAPI, use type hints
- Frontend: Vanilla JavaScript (no frameworks), CSS, HTML
- Prefer simple, greedy algorithms over complex optimal solutions
- Local-first: no server-side user data storage

## Post-task review

After completing a task, take a moment to review the code you've written and look for refactoring opportunities:

- Duplicated logic that could be extracted into shared functions
- Overly complex conditionals that could be simplified
- Inconsistent patterns that should be unified
- Dead code or unused variables

It's fine if there's nothing to refactor, but if improvements exist, address them before committing.

## Git workflow

### Branching strategy

**NEVER push directly to main.** All changes must be made via pull request.

1. Create a feature branch for your changes
2. Make commits on the feature branch
3. Push the feature branch and create a PR
4. Merge via the PR after review/checks pass

```bash
# Create and switch to a new branch
git checkout -b fix/descriptive-name

# Make changes, commit, push
git add .
git commit -m "fix: description"
git push -u origin fix/descriptive-name

# Create PR
gh pr create --title "Fix: Description" --body "Summary of changes"
```

### Closing issues

**NEVER close issues directly with `gh issue close`.** Issues should only be closed via pull requests using GitHub's "Closes #N" or "Fixes #N" syntax in the PR description or commit messages.

- Use `Closes #100` in PR description to auto-close when merged
- Sub-issues for implementation tracking can be closed directly, but the main feature issue must be closed via PR
- This ensures proper traceability between code changes and issue resolution

### Pre-commit hooks

**NEVER use `--no-verify` or `-n` when committing.** Pre-commit hooks ensure code quality and must always run.

If pre-commit hooks fail:

1. Fix the issues reported by the hooks
2. Run `uvx pre-commit run --all-files` to verify fixes
3. Commit again without `--no-verify`

If hooks fail due to sandbox restrictions (e.g., `PermissionError`), use `required_permissions: ['all']` when running git commands, but still ensure hooks pass before committing.

**Example of what NOT to do:**

```bash
# WRONG - Never do this
git commit --no-verify -m "message"
```

**Example of correct workflow:**

```bash
# Fix issues first
uvx pre-commit run --all-files

# Then commit normally (hooks will run automatically)
git commit -m "message"
```

## Architecture patterns

### Module system

**Canvas-Chat uses ES modules exclusively.** All JavaScript code must use ES module syntax.

**Requirements:**

- **ALWAYS** use `import`/`export` syntax (never CommonJS `require`/`module.exports`)
- **ALWAYS** import dependencies explicitly at the top of files
- **NEVER** rely on global scope (`window.X`) for module dependencies
- Load in HTML with `<script type="module" src="...">`
- Tests import modules directly with `import` statements

**Correct ES module pattern:**

```javascript
// my-module.js - Exporting
export class MyClass {
    doSomething() {}
}

export function myFunction() {}

// other-module.js - Importing
import { MyClass, myFunction } from './my-module.js';

const instance = new MyClass();
myFunction();
```

**❌ NEVER do this (outdated patterns):**

```javascript
// WRONG - Don't use global scope for dependencies
window.layoutUtils.someFunction();

// WRONG - Don't use CommonJS
const MyClass = require('./my-module.js');
module.exports = { MyClass };

// WRONG - Don't rely on globals when imports are available
if (typeof MyClass === 'undefined') {
    // ...
}
```

**✅ ALWAYS do this:**

```javascript
// CORRECT - Use explicit imports
import { someFunction } from './layout.js';
someFunction();

// CORRECT - Import all dependencies at the top
import { NodeType } from './graph-types.js';
import { wouldOverlapNodes } from './layout.js';
import { EventEmitter } from './event-emitter.js';
```

**Example test:**

```javascript
// tests/test_my_module.js
import { MyClass } from '../src/canvas_chat/static/js/my-module.js';

test('MyClass works', () => {
    const instance = new MyClass();
    // ...
});
```

**When refactoring:**

If you find code using `window.X` to access another module's functionality:

1. Add an `import` statement at the top of the file
2. Replace all `window.X.method()` calls with direct `method()` calls
3. Ensure the imported module properly exports the functions/classes

### API key access

Always use `chat.getApiKeyForModel(model)` to get API keys for LLM calls.
Do NOT use `storage.getApiKey()` - it doesn't exist.

```javascript
const model = this.modelPicker.value;
const apiKey = chat.getApiKeyForModel(model);
```

For Exa API key specifically, use `storage.getExaApiKey()`.

### Canvas callbacks

The Canvas class uses a callback pattern for node interactions.
To add a new node action:

1. Add callback property in `canvas.js` constructor: `this.onNodeXxx = null;`
2. Add button in `renderNode()` template (conditionally by node type if needed)
3. Add event listener in `setupNodeEvents()` that calls `this.onNodeXxx`
4. Bind handler in `app.js`: `this.canvas.onNodeXxx = this.handleNodeXxx.bind(this);`
5. Implement `handleNodeXxx(nodeId)` method in App class

### Slash commands

Slash commands are defined in `SLASH_COMMANDS` array and handled by `tryHandleSlashCommand()`.

To add a new slash command:

1. Add to `SLASH_COMMANDS` array with `command`, `description`, `placeholder`
2. Add handler check in `tryHandleSlashCommand(content, context)`
3. Implement `handleXxx()` method

The `context` parameter provides surrounding text for contextual commands (e.g., selected text).
This enables the LLM to resolve vague references like "how does this work?" into specific queries.

### Variable naming in handleSend

The `handleSend()` method uses `context` for LLM conversation context (line ~748).
If you need a variable for slash command context, use `slashContext` to avoid collision.

### Canvas selection state

To get selected nodes, use `this.canvas.getSelectedNodeIds()` (returns array of node IDs).
Do NOT use `getSelectedNodes()` - it doesn't exist.

```javascript
const selectedNodeIds = this.canvas.getSelectedNodeIds();
if (selectedNodeIds.length > 0) {
    // Do something with selected nodes
}
```

### Concurrent operation state

When multiple instances of an operation can run simultaneously, **never use global/singleton state**.
Each instance must have its own isolated state.

**The pattern:** Use `Map<instanceId, state>` instead of single variables.

```javascript
// WRONG: Global state - only one operation can be active
this.streamingNodeId = nodeId;
this.abortController = new AbortController();

// Later, when second operation starts, it overwrites the first:
this.streamingNodeId = anotherNodeId; // First operation's state is lost!
this.abortController = new AbortController(); // Can't abort first operation anymore

// CORRECT: Per-instance state - many operations can run in parallel
this.streamingNodes = new Map(); // In constructor

// Each operation gets isolated state:
this.streamingNodes.set(nodeId, {
    abortController: new AbortController(),
    context: { messages, model },
});

// Second operation doesn't affect the first:
this.streamingNodes.set(anotherNodeId, {
    abortController: new AbortController(),
    context: { messages, model },
});

// Each can be controlled independently:
this.streamingNodes.get(nodeId).abortController.abort();
```

**When to apply this pattern:**

- LLM streaming responses (multiple nodes can generate simultaneously)
- Async fetch operations that can overlap
- Any cancellable operation where the user might trigger multiple instances

**Cleanup:** Always remove entries from the Map when the operation completes or errors:

```javascript
// In onDone/onError callbacks:
this.streamingNodes.delete(nodeId);
```

### Node content updates

Nodes have two text displays that must stay in sync:

1. **`.node-content`** - Full content shown when zoomed in
2. **`.node-summary .summary-text`** - Truncated preview shown when zoomed out

When updating node content, always use `canvas.updateNodeContent(nodeId, content, isStreaming)`.
This method updates both displays automatically (summary text updates when `isStreaming=false`).

**Common mistake:** Creating a node with placeholder text (e.g., "Loading...") and forgetting
that the summary text won't update unless `updateNodeContent` is called with `isStreaming=false`
after the real content arrives.

```javascript
// Wrong: Summary stays stuck on "Loading..." when zoomed out
const node = createNode(NodeType.SUMMARY, 'Loading...');
// ... later ...
this.graph.updateNode(node.id, { content: realContent }); // Only updates graph, not display!

// Correct: Both content and summary update properly
const node = createNode(NodeType.SUMMARY, 'Loading...');
// ... later ...
this.canvas.updateNodeContent(node.id, realContent, false); // Updates both displays
this.graph.updateNode(node.id, { content: realContent });
```

### Node tags

Tags are rendered as a **fundamental property of all nodes**, not inside node-type-specific templates.
This ensures tags work consistently across all node types without duplication.

**Architecture:** In `renderNode()`, after setting `div.innerHTML` for the specific node type,
tags are inserted using `insertAdjacentHTML('afterbegin', tagsHtml)`:

```javascript
// After setting div.innerHTML for matrix or non-matrix nodes:
const tagsHtml = this.renderNodeTags(node);
if (tagsHtml) {
    div.insertAdjacentHTML('afterbegin', tagsHtml);
}
```

**Important CSS considerations:**

- Tags are positioned with `position: absolute; right: 100%` (outside the left edge of the node)
- The `.node` container must NOT have `overflow: hidden` or tags will be clipped
- Inner containers (`.node-content`, `.matrix-table-container`) handle their own overflow for scrolling

**When adding new node types:** You don't need to add tag rendering - it's automatic.
Just ensure the new node type's container doesn't set `overflow: hidden` on the `.node` div.

## Design standards

- New features must be coherent with existing design patterns and visual language
- User interactions should be seamless and elegant
- Follow the Excalidraw-inspired aesthetic: clean, minimal, hand-drawn feel
- Use existing CSS variables for colors, spacing, shadows, and typography
- Prefer keyboard shortcuts for power users (document them in tooltips)
- Animations should be subtle and purposeful (0.15s-0.3s transitions)

### Streaming controls placement

Stop/Continue buttons for LLM generation are placed in the **node header next to the delete button**,
not in the scrolling action bar. This design choice supports parallel generations:

- Multiple AI nodes can stream responses simultaneously
- Each node needs its own accessible stop control
- The button must not move as content streams in (would be hard to click)
- Placing controls in a fixed location (like the chat input) wouldn't work because
  it's ambiguous which generation should be stopped

### Text selection interactions

When showing tooltips or popups near text selections, **never auto-focus input fields**.
Focusing an input clears the browser's text selection. Instead:

- Store the selected text immediately when the tooltip appears
- Let the user click into input fields manually
- Use the stored text when processing the action

### User dialogs and confirmations

**NEVER use browser `alert()`, `confirm()`, or `prompt()`.** These block the UI and feel jarring.
Always use in-app modals for user interactions that require confirmation or input.

- For simple notifications, use toast messages or inline feedback
- For confirmations, create a modal with Cancel/Confirm buttons
- For complex input, create a modal with form fields (see committee modal as example)

## Testing

Run the dev server with `pixi run dev` before testing UI changes.

**Important:** Never kill the dev server process. The developer runs it in reload mode,
so code changes are automatically picked up. Just make your edits and the server will reload.

### Unit tests

Write unit tests for logic that does not require API calls:

- **Python**: Test pure functions, data transformations, parsing logic
- **JavaScript**: Test graph algorithms, node/edge operations, utility functions, DOM manipulation

**JavaScript test files:**

- `tests/test_setup.js` - Shared test environment setup and module loading
- `tests/run_tests.js` - Automatic test discovery runner (similar to pytest)
- `tests/test_app_init.js` - Integration test to verify App class initializes without errors (catches undefined method references)
- `tests/test_utils.js` - Concurrent state management tests
- `tests/test_utils_basic.js` - Basic utility functions (extractUrlFromReferenceNode, formatMatrixAsText, formatUserError, etc.)
- `tests/test_utils_messages.js` - buildMessagesForApi edge cases
- `tests/test_layout.js` - Layout and overlap resolution functions
- `tests/test_graph_types.js` - Node creation functions and default node sizes
- `tests/test_crdt_graph.js` - Graph traversal and visibility functions
- `tests/test_matrix.js` - Matrix rendering and concurrent cell updates
- `tests/test_flashcards.js` - SM-2 algorithm and flashcard logic
- `tests/test_storage.js` - localStorage functions
- `tests/test_canvas_helpers.js` - Zoom class and popover selection logic
- `tests/test_search.js` - BM25 search algorithm tests
- `tests/test_ui.js` - DOM manipulation tests using jsdom simulation
- `tests/test_node_protocols.js` - Node protocol implementations

Do not write tests that require external API calls (LLM, Exa, etc.) - these are tested manually.

### Never copy implementations into tests

**NEVER copy function implementations from source files into test files.**

This is a critical anti-pattern that causes tests to pass while production code is broken.
When you copy an implementation:

1. The test validates the copied code, not the actual source
2. Changes to the source file don't affect tests (false confidence)
3. Bugs in production go undetected

**The correct approach:**

1. Extract testable logic into pure functions in separate modules (e.g., `layout.js`, `highlight-utils.js`)
2. Import those functions in both the source files that need them AND the test files
3. Tests validate the actual implementation that runs in production

```javascript
// WRONG: Copying implementation into test file
function resolveOverlaps(nodes) {
    /* copied from graph.js */
}
test('resolveOverlaps works', () => {
    resolveOverlaps(testNodes); // Tests the COPY, not the real code!
});

// CORRECT: Import the actual implementation
const { resolveOverlaps } = require('../src/canvas_chat/static/js/layout.js');
test('resolveOverlaps works', () => {
    resolveOverlaps(testNodes); // Tests the REAL code
});
```

If a function is tightly coupled to a class and hard to test, that's a design smell.
Refactor to extract pure functions that can be imported and tested directly.

### When NOT to write unit tests

**Not all code needs unit tests.** Some code is better tested through integration tests, E2E tests, or manual QA.

**Don't write unit tests for:**

1. **Complex instance methods** that require full class instantiation with many dependencies
    - Example: `App.buildLLMRequest()` requires App constructor, modelPicker, storage, chat instances
    - Why: Would require either duplicating logic (violates "never copy" rule) or brittle mocking
    - Instead: Test through integration tests or manual QA with real configurations

2. **Methods with runtime state dependencies**
    - Methods that depend on DOM state, user interactions, or async operations in progress
    - Why: Mocking the entire runtime environment is fragile and doesn't test real behavior
    - Instead: Test the pure functions they call, verify behavior manually in the UI

3. **Code already covered by structural guarantees**
    - Example: Helper function that's the ONLY way to build requests (prevents bugs structurally)
    - Why: The refactoring itself ensures correct usage
    - Instead: Code review + manual testing of the happy path

**When in doubt, ask:**

- Would I need to duplicate code to test this? → Don't test it
- Would I need complex mocking of multiple systems? → Don't test it
- Is this already guaranteed by the structure of the code? → Don't test it
- Is this a pure function with no dependencies? → Test it!

**Example from PR #98:**

- ❌ `App.buildLLMRequest()` - Complex instance method, requires mocking
- ✅ `extract_provider()` - Pure function, easily testable
- ✅ Refactoring that makes `base_url` impossible to forget - Structural guarantee

### Testing method bindings after refactoring

When refactoring large files or moving methods between classes, use the method binding test pattern to catch undefined method references.

**The problem:** When methods are moved (e.g., from `App` to `ModalManager`), event listeners or callbacks might still reference the old location, causing runtime errors like `Cannot read properties of undefined (reading 'bind')`.

**The solution:** Create integration tests that verify method bindings **before** they're used. This catches errors at test time, not runtime.

#### Patterns to Test

##### 1. Event Listener Bindings

Pattern: `.on('event', this.method.bind(this))`

When it breaks: Method moved to another class but event listener not updated.

```javascript
test('Event listeners can be set up', () => {
    const instance = new MyClass();

    // Actually execute the binding - this will throw if method doesn't exist
    instance.emitter
        .on('event1', instance.handleEvent1.bind(instance))
        .on('event2', instance.handleEvent2.bind(instance));
});
```

##### 2. Delegated Methods

Pattern: `this.manager.handleX()` when method moved to manager.

When it breaks: Method moved but reference not updated.

```javascript
test('Delegated methods exist', () => {
    const instance = new MyClass();

    const delegated = {
        handleX: 'manager.handleX',
        handleY: 'manager.handleY',
    };

    for (const [methodName, target] of Object.entries(delegated)) {
        const [targetName, targetMethod] = target.split('.');
        if (typeof instance[targetName][targetMethod] !== 'function') {
            throw new Error(`${methodName} -> ${target} is not a function`);
        }
    }
});
```

##### 3. Callback Assignments

Pattern: `this.canvas.onNodeXxx = this.handleXxx.bind(this)`

When it breaks: Method moved but callback assignment not updated.

```javascript
test('Callbacks can be assigned', () => {
    const canvas = new Canvas();
    const app = new App();

    // This will throw if method doesn't exist
    canvas.onNodeSelect = app.handleNodeSelect.bind(app);
    canvas.onNodeDelete = app.handleNodeDelete.bind(app);
});
```

#### Complete Example

See `tests/test_app_init.js` for a complete example that tests:

- Direct methods on App class
- Delegated methods (moved to ModalManager, FileUploadHandler)
- Event listener setup (actually executes .bind() calls)

```javascript
test('App event listener methods exist', () => {
    const app = new App();

    // Test direct methods
    const requiredMethods = ['handleNodeSelect', 'handleNodeDelete', ...];
    for (const methodName of requiredMethods) {
        if (typeof app[methodName] !== 'function') {
            throw new Error(`Method ${methodName} is not a function`);
        }
    }

    // Test delegated methods (moved to other classes)
    const delegatedMethods = {
        handleNodeTitleEdit: 'modalManager.handleNodeTitleEdit',
        handlePdfDrop: 'fileUploadHandler.handlePdfDrop'
    };
    for (const [methodName, target] of Object.entries(delegatedMethods)) {
        const [targetName, targetMethod] = target.split('.');
        if (typeof app[targetName][targetMethod] !== 'function') {
            throw new Error(`Delegated method ${methodName} -> ${target} is not a function`);
        }
    }

    // Test event listener setup (actually executes .bind() calls)
    app.canvas
        .on('nodeSelect', app.handleNodeSelect.bind(app))  // Would throw if method doesn't exist
        .on('nodeDelete', app.handleNodeDelete.bind(app));
});
```

#### When to Use This Pattern

- **Before major refactoring** - Establish baseline
- **After extracting modules** - Verify nothing broke
- **When moving methods** - Catch missed references
- **When adding new features** - Ensure event listeners work

#### Reusable Helpers

For future ESM conversion, see `tests/test_helpers/method-binding-test.js` for reusable utilities:

- `testMethodBindings(instance, methodNames, options)` - Test that methods exist before they're bound
- `testCallbackAssignments(instance, callbackAssignments, options)` - Test callback pattern assignments
- `testEventListenerSetup(setupFunction, options)` - Test event listener setup by executing binding code
- `createMockEventEmitter()` - Create a mock EventEmitter for testing

For now, inline the pattern as shown in `test_app_init.js`.

### Testing DOM-dependent functions

For functions that require DOM APIs (document, TreeWalker, etc.), follow this pattern:

1. **Extract to a utility module** (e.g., `highlight-utils.js`) that takes `document` as a parameter
2. **Use ES module exports** for modern module support:

    ```javascript
    // At end of file - ES module export
    export { myFunction };

    // Also expose to global scope for backwards compatibility
    if (typeof window !== 'undefined') {
        window.myFunction = myFunction;
    }
    ```

3. **Add script tag** in `index.html` with `type="module"` if it's an ES module, or regular script tag if it uses global scope
4. **In tests**, use ES module imports:

    ```javascript
    import { myFunction } from '../src/canvas_chat/static/js/my-utils.js';
    import { JSDOM } from 'jsdom';

    test('myFunction works', () => {
        const dom = new JSDOM('<!DOCTYPE html><div></div>');
        const result = myFunction(dom.window.document, '<p>test</p>', 'test');
        // assertions...
    });
    ```

    Or if the module exposes to global scope, import it for side effects then access via global:

    ```javascript
    await import('../src/canvas_chat/static/js/my-utils.js');
    const { myFunction } = global.window;
    ```

**Existing utility modules:**

- `layout.js` - Pure layout/positioning functions (no DOM needed, global scope)
- `highlight-utils.js` - Text highlighting functions (DOM needed, takes document param, global scope)
- `node-registry.js` - Plugin system registry (ES module with global scope fallback)
- `node-protocols.js` - Node protocol classes (ES module with global scope fallback)

Run tests with:

```bash
pixi run test      # Python tests
pixi run test-js   # JavaScript tests (runs all JS test files)
```

**Note:** Before running JavaScript tests, ensure npm dependencies are installed:

```bash
pixi run npm install  # Installs jsdom for DOM simulation tests
```

### Test command source of truth

**pixi (`pyproject.toml`) is the single source of truth for test commands.**

- Test commands are defined in `[tool.pixi.tasks]` in `pyproject.toml`
- `package.json` scripts delegate to pixi (e.g., `"test": "pixi run test-js"`)
- When modifying test commands, update `pyproject.toml`, not `package.json`
- This ensures consistency across all environments (local, CI/CD, pixi users, npm users)

### Syntax checking

Always check JavaScript for syntax errors before considering a change complete:

```bash
node --check static/js/app.js
```

Common issues to watch for:

- Variable name collisions (e.g., reusing `context` in different scopes)
- Missing imports or incorrect function names

### Verify APIs exist before using them

**Before calling any method on `chat`, `canvas`, `storage`, or `graph` objects, verify the method exists.**

AI agents often hallucinate plausible-sounding method names that don't exist. This causes runtime errors
that are hard to debug because they only appear when the code path is triggered.

**Verification steps:**

1. Search for the method definition in the source file:

    ```bash
    grep -n "methodName\s*(" static/js/chat.js
    ```

2. If the method doesn't exist, look for similar methods that do exist, or implement the functionality
   using methods that are documented below.

**Common mistakes (do NOT use these - they don't exist):**

| Wrong (doesn't exist)       | Correct alternative                                       |
| --------------------------- | --------------------------------------------------------- |
| `chat.streamChat()`         | Use `chat.sendMessage()` with callbacks                   |
| `canvas.setNodeStreaming()` | Use `canvas.showStopButton()` / `canvas.hideStopButton()` |
| `canvas.getSelectedNodes()` | Use `canvas.getSelectedNodeIds()`                         |
| `storage.getApiKey()`       | Use `chat.getApiKeyForModel(model)`                       |

**Key methods that DO exist:**

`chat.js`:

- `getApiKeyForModel(model)` - Get API key for a model
- `sendMessage(messages, model, onChunk, onDone, onError)` - Stream LLM response
- `summarize(messages, model)` - Get a summary (non-streaming)
- `estimateTokens(text, model)` - Estimate token count

`canvas.js`:

- `getSelectedNodeIds()` - Get array of selected node IDs
- `updateNodeContent(nodeId, content, isStreaming)` - Update node text
- `showStopButton(nodeId)` / `hideStopButton(nodeId)` - Streaming controls
- `showContinueButton(nodeId)` / `hideContinueButton(nodeId)` - Resume controls
- `renderNode(node)` / `removeNode(nodeId)` - Node lifecycle
- `panToNodeAnimated(nodeId)` - Navigate to a node

`storage.js`:

- `getApiKeys()` - Get all stored API keys object
- `getApiKeyForProvider(provider)` - Get key for specific provider
- `getExaApiKey()` - Get Exa search API key
- `saveSession(session)` / `getSession(id)` - Session persistence

## Modal Deployment

### Production URL

The app is deployed at: **[ericmjl--canvas-chat-fastapi-app.modal.run](https://ericmjl--canvas-chat-fastapi-app.modal.run/)**

### Architecture: Bring Your Own Keys

This app uses a **local-first architecture** where users provide their own API keys
via the settings panel in the UI. Keys are stored in the browser's localStorage and
sent with each request. **No server-side secrets are required for deployment.**

### Automatic Deployment (CI/CD)

The app is automatically deployed to Modal on every push to `main` via GitHub Actions.
The workflow is defined in `.github/workflows/modal-deploy.yaml`.

### GitHub Actions Secrets Required

The CI/CD workflow requires these secrets in GitHub Actions:

- `MODAL_TOKEN_ID` - Modal token ID
- `MODAL_TOKEN_SECRET` - Modal token secret

Set them using the GitHub CLI:

```bash
gh secret set MODAL_TOKEN_ID --body "$MODAL_TOKEN_ID"
gh secret set MODAL_TOKEN_SECRET --body "$MODAL_TOKEN_SECRET"
```

### Important: API Keys Policy

**Do NOT store API keys in Modal secrets for this app.**
Users bring their own keys via the UI settings panel. This design:

- Prevents unauthorized usage of personal API quotas
- Keeps the deployment simple (no secrets to manage)
- Gives users full control over their API usage

### Manual Deployment

For local testing or manual deployment:

```bash
# Test locally with live reload
pixi run modal serve modal_app.py

# Deploy to Modal
pixi run modal deploy modal_app.py
```
