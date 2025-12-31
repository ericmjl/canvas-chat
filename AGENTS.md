# Agents

Instructions for AI coding agents working on this project.

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

## Architecture patterns

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

## Testing

Run the dev server with `pixi run dev` before testing UI changes.

**Important:** Never kill the dev server process. The developer runs it in reload mode,
so code changes are automatically picked up. Just make your edits and the server will reload.

### Unit tests

Write unit tests for logic that does not require API calls:

- **Python**: Test pure functions, data transformations, parsing logic
- **JavaScript**: Test graph algorithms, node/edge operations, utility functions

Do not write tests that require external API calls (LLM, Exa, etc.) - these are tested manually.

Run tests with:

```bash
pixi run test      # Python tests
pixi run test-js   # JavaScript tests
```

### Syntax checking

Always check JavaScript for syntax errors before considering a change complete:

```bash
node --check static/js/app.js
```

Common issues to watch for:
- Variable name collisions (e.g., reusing `context` in different scopes)
- Missing imports or incorrect function names

## Modal Deployment

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
