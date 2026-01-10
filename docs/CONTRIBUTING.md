# Documentation Site

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
