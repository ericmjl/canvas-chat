# Contributing to Canvas Chat

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
