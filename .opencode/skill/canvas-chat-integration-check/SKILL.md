---
name: canvas-chat-integration-check
description: Ensure Canvas-Chat changes update all coupled components together. Use after implementing new features, auth flows, UI controls, storage changes, or plugin wiring to verify related modules and tests are updated in sync.
---

# Canvas-Chat integration check

## Workflow

1. Identify the primary change (feature, API, UI, storage, plugin).
2. Load `references/api_reference.md` and scan the relevant dependency bullets.
3. Open the listed files and confirm they are updated or intentionally unchanged.
4. Run the smallest relevant checks (syntax, targeted tests), then full suites if needed.
5. Append new dependency bullets to the reference map whenever you discover a missing or forgotten coupled update.

## Common triggers

- New auth flows or provider integrations.
- Changes to the settings modal or API key storage.
- New modal APIs, plugin lifecycle hooks, or feature registration changes.
- Updates to the model registry or model selector behavior.

## Resources

- `references/api_reference.md` for the current cross-component dependency map.
