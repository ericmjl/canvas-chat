# Contributing to Canvas Chat

## Plugin development

**Plugins are the recommended way to extend Canvas-Chat functionality.**

Canvas-Chat supports three levels of extensibility:

1. **Custom Node Types (Level 1)**: Add new visual node types with custom rendering and interactions
2. **Feature Plugins (Level 2)**: Create complex workflows, slash commands, and multi-step LLM interactions
3. **Extension Hooks (Level 3)**: Hook into existing features to modify or extend behaviors

### Getting started with plugins

Start with these guides:

- [How to Create Custom Node Types](how-to/create-custom-node-plugins.md)
- [How to Create Feature Plugins](how-to/create-feature-plugins.md)
- [Extension Hooks Reference](reference/extension-hooks.md)

### Plugin APIs

Complete API documentation:

- [FeaturePlugin API](reference/feature-plugin-api.md) - Base class for feature plugins
- [AppContext API](reference/app-context-api.md) - Dependency injection and Canvas-Chat APIs
- [FeatureRegistry API](reference/feature-registry-api.md) - Plugin registration and management

### Sharing plugins

To share your plugin with the community:

1. Create a GitHub repository for your plugin
2. Include clear README with installation and usage instructions
3. Add example code and screenshots
4. Open an issue in the main Canvas-Chat repo to announce your plugin
5. Consider publishing to npm for easy installation

We maintain a list of community plugins in the documentation.

## Code contributions

**We are not accepting direct code contributions at this time.**

Instead, we welcome **detailed issue descriptions for new feature requests**. The recommended workflow for proposing new features is:

1. **Clone the repository** and explore the codebase
2. **Open an agentic coding harness** (OpenCode, Claude Code, GitHub Copilot, Cursor, Windsurf, Antigravity, etc.)
3. **Use Plan Mode with a high-quality model** (e.g., as of writing: Opus 4.5, GPT-5.2 (thinking), Gemini 3 Pro)
4. **Instruct the model to explore your feature request** and ask clarifying questions
5. **Once the model has no more questions**, have it post a detailed issue to the GitHub issue tracker with:
    - Clear description of the feature
    - Use cases and benefits
    - Technical considerations
    - Implementation approach (if explored)

This workflow ensures feature requests are well-thought-out and technically feasible before implementation.

## Documentation Site

This directory contains the Canvas Chat documentation built with [MkDocs](https://www.mkdocs.org/) and [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/).

## Structure

The documentation follows the [Diataxis framework](https://diataxis.fr/):

- **how-to/**: Task-oriented guides for accomplishing specific goals
- **explanation/**: Design decisions, architecture rationale, "why" documents
- **reference/**: Technical descriptions of APIs, configuration options, data structures
- **releases/**: Release notes and changelogs

## Working with the docs

### Prerequisites

Install the docs environment:

```bash
pixi install
```

### Local development

Serve the docs locally with live reload:

```bash
pixi run -e docs docs-serve
```

Then open your browser to `http://127.0.0.1:8000`

### Build the site

Build static HTML files:

```bash
pixi run -e docs docs-build
```

The built site will be in the `site/` directory.

### Deploy to GitHub Pages

Deploy to GitHub Pages (requires push access):

```bash
pixi run -e docs docs-deploy
```

This builds the site and pushes to the `gh-pages` branch.

## Adding new pages

1. Create a new `.md` file in the appropriate directory (`how-to/`, `explanation/`, `reference/`)
2. Add the page to the `nav` section in `mkdocs.yml`
3. Test locally with `pixi run -e docs docs-serve`

## Configuration

The main configuration file is `mkdocs.yml` in the project root. It defines:

- Site metadata (name, URL, repo)
- Theme settings (Material theme with dark/light mode)
- Navigation structure
- Markdown extensions (admonitions, code highlighting, etc.)
- Plugins (search)

## Markdown extensions

The site supports:

- **Admonitions**: `!!! note`, `!!! warning`, etc.
- **Code blocks with syntax highlighting**
- **Tabbed content**: `=== "Tab 1"`
- **Code annotations**: numbered callouts in code blocks
- **Table of contents**: auto-generated from headers

See the [Material for MkDocs documentation](https://squidfunk.github.io/mkdocs-material/reference/) for details.
