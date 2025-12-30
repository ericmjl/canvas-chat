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

## Design standards

- New features must be coherent with existing design patterns and visual language
- User interactions should be seamless and elegant
- Follow the Excalidraw-inspired aesthetic: clean, minimal, hand-drawn feel
- Use existing CSS variables for colors, spacing, shadows, and typography
- Prefer keyboard shortcuts for power users (document them in tooltips)
- Animations should be subtle and purposeful (0.15s-0.3s transitions)

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
