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

## Testing

Run the dev server with `pixi run dev` before testing UI changes.
