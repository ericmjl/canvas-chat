# Skill: BDD Feature → Cypress Tests

## Purpose
Translate Gherkin `.feature` files into executable Cypress tests by implementing step definitions and reusable commands.

## When to use
- You are adding or changing user-visible behavior.
- A `.feature` file exists (or must be created) for the change.
- Steps are missing or need refactoring into reusable commands.

## Workflow (required)
1. **Identify or author the feature**
   - Optional story spec: `specs/user-stories/*.story.md`
   - Feature spec: `cypress/e2e/features/*.feature`
   - If story specs exist, run generation to keep features in sync.

2. **Implement step definitions**
   - File location: `cypress/e2e/step_definitions/*.ts`
   - Keep step defs thin; push complex logic into commands/helpers.
   - Use `cy.getByTestId()` for selectors.

3. **Add reusable commands/helpers**
   - Primary location: `cypress/support/e2e.js`
   - Add command helpers for repeated UI actions.

4. **Verify missing steps**
   - Run: `node scripts/generate_step_stubs.js`
   - If it fails, implement the missing steps and re-run.

5. **Run Cypress**
   - `pixi run npx cypress run --browser chrome --headless --spec cypress/e2e/<file>.feature`

## Rules
- Do not use brittle selectors (CSS classes or DOM structure).
- Prefer `window.__APP_TEST__.graph.serialize()` for graph/state assertions.
- The auto-generated missing step stubs file must never be committed.

## Files of interest
- `specs/user-stories/`
- `cypress/e2e/features/`
- `cypress/e2e/step_definitions/`
- `cypress/support/e2e.js`
- `scripts/generate_features.js`
- `scripts/generate_step_stubs.js`
