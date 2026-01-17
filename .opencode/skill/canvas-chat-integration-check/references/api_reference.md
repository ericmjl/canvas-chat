# Canvas-Chat integration map

Keep this file updated whenever new cross-component dependencies are discovered.

## Update cross-dependency map

- **Copilot authentication or other provider auth flows** → update model list refresh (`app.js`), storage keys (`storage.js`), backend provider endpoints (`app.py`), auto-refresh logic (`chat.js`), and settings modal wiring (`index.html`, `modal-manager.js`).
- **Admin mode credential injection** → update `app.py` injection helpers, provider-models access, and Copilot auth endpoints to enforce admin-only model policy.
- **Settings modal changes** → update `modal-manager.js` loading logic and `app.js` event bindings, plus any storage schema updates.
- **New modal APIs on ModalManager** → update `tests/test_app_init.js` method binding checks.
- **Model registry changes (`app.py`)** → update UI model picker refresh behavior and `tests/test_models.js` if request/response shapes change.
- **Plugin registration lifecycle** → update `feature-registry.js`, plugin onLoad handlers, and method binding tests.
- **Storage schema changes** → update `tests/test_storage.js` and any UI elements that load or display the data.
- **New API endpoints** → update frontend fetch calls, error handling in `chat.js`, and add tests in `tests/`.

## How to use this map

1. Identify the "thing" you just changed.
2. Scan the related bullet(s) and review the listed files.
3. Confirm all linked components are updated or explicitly not needed.
4. Add new bullets when new cross-component dependencies are discovered or when a gap is found.
