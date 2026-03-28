# Feature Plugins Specifications

**Created**: 2026-03-16
**Updated**: 2026-03-28 (RSCH-REQ-005 research activity visibility)
**Status**: Active
**HLD**: [High-Level Design](../high-level-design.md)

## Committee Feature

### [x] COMM-REQ-001: Multi-LLM Query

**Location**: `committee.js`

The system MUST allow users to query multiple LLM models in parallel via the `/committee` command. Users MUST be able to select which models to include.

### [x] COMM-REQ-002: Opinion Nodes

**Location**: `committee.js`

Each model response MUST be displayed as a separate `opinion` node. Opinion nodes MUST show which model generated the response.

### [x] COMM-REQ-003: Optional Review

**Location**: `committee.js`

The system MAY generate `review` nodes where each model critiques the other models' responses.

### [x] COMM-REQ-004: Synthesis Node

**Location**: `committee.js`

The system MUST generate a `synthesis` node containing a summary that combines insights from all models. A chairman model MUST be used for synthesis.

### [x] COMM-REQ-005: Streaming

**Location**: `committee.js`, `streaming-manager.js`

All opinion, review, and synthesis responses MUST stream in real-time. The stop/continue button MUST work for each phase.

## Research Feature

### [x] RSCH-REQ-001: Web Search

**Location**: `research.js`

The system MUST provide `/search` command for quick web lookups. Search results MUST be displayed as reference nodes.

### [x] RSCH-REQ-002: Deep Research

**Location**: `research.js`

The system MUST provide `/research` command for deep research. Research MUST iterate through sources and synthesize findings.

### [x] RSCH-REQ-003: Dual Provider

**Location**: `research.js`, `app.py`

The system MUST use Exa API when available, falling back to DuckDuckGo when no Exa key is configured.

### [x] RSCH-REQ-004: Query Refinement

**Location**: `research.js`

When context is selected, the system MUST refine the search query using the LLM before executing the search.

### [x] RSCH-REQ-005: Research activity visibility

**Location**: `plugins/research.js`, `plugins/research-node.js`, `canvas.js`

During `/research`, the ResearchFeature MUST append streaming **status** lines (and, for the DuckDuckGo fallback, **source** summary lines) to the research node’s activity log and MUST refresh the output panel so users see intermediate progress. While streaming, the feature MUST NOT duplicate that status or per-source detail in the main node body (the body SHOULD show at most a short in-progress placeholder until the final report). On completion, stop, or error, the feature MUST clear the running indicator while MAY retain the final log for inspection.

## Code Feature

### [x] CODE-REQ-001: Python Execution

**Location**: `plugins/code.js`, `pyodide-runner.js`

The system MUST execute Python code in the browser using Pyodide. Execution MUST capture stdout, return values, and matplotlib figures.

### [x] CODE-REQ-002: Code Editor

**Location**: `modal-manager.js`

The system MUST provide a code editor modal with syntax highlighting for editing code nodes.

### [x] CODE-REQ-003: Code Generation

**Location**: `plugins/code.js`

The system MUST generate Python code via LLM when user clicks "Generate". The generated code MUST be inserted into the editor.

### [x] CODE-REQ-004: Self-Healing

**Location**: `plugins/code.js`

When code execution fails, the system MUST automatically attempt to fix the error up to 3 times using the LLM.

### [x] CODE-REQ-005: DataFrame Integration

**Location**: `plugins/code.js`

When code nodes are created from CSV/Excel/Prism nodes, the csvData MUST be pre-loaded as a DataFrame variable.

## Factcheck Feature

### [x] FACT-REQ-001: Claim Extraction

**Location**: `factcheck.js`

The system MUST extract factual claims from selected text using the LLM. Extracted claims MUST be presented for user confirmation.

### [x] FACT-REQ-002: Web Verification

**Location**: `factcheck.js`

For each confirmed claim, the system MUST search the web for verification. Results MUST be displayed as sources.

### [x] FACT-REQ-003: Verdict

**Location**: `factcheck.js`

The system MUST generate a verdict (VERIFIED, PARTIALLY_TRUE, MISLEADING, FALSE, UNVERIFIABLE) for each claim with explanation and source citations.

### [x] FACT-REQ-004: Fallback Search

**Location**: `factcheck.js`

When Exa is unavailable, the system MUST fall back to DuckDuckGo for web verification.

## Flashcards Feature

### [x] FLAS-REQ-001: Generate Flashcards

**Location**: `flashcards.js`

The system MUST generate flashcards from selected content using the LLM. Generated cards MUST be reviewable immediately.

### [x] FLAS-REQ-002: SM-2 Algorithm

**Location**: `utils.js`

The system MUST implement the SM-2 spaced repetition algorithm for scheduling reviews. Quality ratings (0-5) MUST adjust review intervals.

### [x] FLAS-REQ-003: Due Card Detection

**Location**: `utils.js`

On app load, the system MUST detect flashcards that are due for review and show a notification.

### [x] FLAS-REQ-004: Review Modal

**Location**: `flashcards.js`

The system MUST provide a review modal showing the question, allowing the user to reveal the answer, and prompting for a quality rating.

## Matrix Feature

### [x] MAT-REQ-001: Create Matrix

**Location**: `matrix.js`

The system MUST allow users to create a matrix with specified rows and columns via `/matrix` command or modal.

### [x] MAT-REQ-002: Fill Cell

**Location**: `matrix.js`

The system MUST allow users to fill individual cells using the LLM. The LLM MUST have context from related nodes.

### [x] MAT-REQ-003: Fill All

**Location**: `matrix.js`

The system MUST allow users to fill all empty cells in parallel using the LLM.

### [x] MAT-REQ-004: Extract Row/Column

**Location**: `matrix.js`

The system MUST allow users to extract a row or column as a new node on the canvas.

## URL Fetch Feature

### [x] URL-REQ-001: Fetch URL

**Location**: `url-fetch.js`

The system MUST provide `/fetch` command to fetch URL content. Fetched content MUST be converted to markdown.

### [x] URL-REQ-002: Specialized Handlers

**Location**: `url-fetch.js`

The system MUST have specialized handlers for YouTube, GitHub, and PDF URLs with enhanced parsing.

### [x] URL-REQ-003: Generic Fallback

**Location**: `url-fetch.js`

For URLs without specialized handlers, the system MUST use Jina Reader or direct fetch with html2text conversion.

## Image Generation Feature

### [x] IMG-REQ-001: Generate Image

**Location**: `image-generation.js`

The system MUST provide `/image` command to generate images via DALL-E, Gemini, or Ollama.

### [x] IMG-REQ-002: Provider Selection

**Location**: `image-generation.js`

Users MUST be able to select which image generation provider to use in settings.

### [x] IMG-REQ-003: Display Image

**Location**: `image-generation.js`

Generated images MUST be displayed in an ImageNode with the prompt stored for reference.

## HTML Slides Feature

### [x] SLID-REQ-001: Create Slides

**Location**: `html-slides.js`

The system MUST provide `/slides` command to create HTML slide presentations. Users MUST be able to paste HTML or generate from prompt.

### [x] SLID-REQ-002: Slide Navigation

**Location**: `html-slides.js`

The system MUST provide Prev/Next buttons and keyboard navigation (Space, Arrow keys) for slides.

### [x] SLID-REQ-003: Blob Embedding

**Location**: `html-slides.js`

HTML slides MUST be embedded via Blob URL for self-contained presentations without external dependencies.

## Status Key

- `[ ]` Active requirement
- `[x]` Implemented requirement
- `[D]` Deferred requirement
