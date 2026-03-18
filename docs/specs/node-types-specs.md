# Node Types Specifications

**Created**: 2026-03-16
**Status**: Active
**HLD**: [High-Level Design](../high-level-design.md)

## Node Type Requirements

### [x] NODE-REQ-001: Human Node

**Location**: `graph-types.js`

The system MUST provide a `human` node type for user messages. Human nodes MUST display the message content with a person icon.

### [x] NODE-REQ-002: AI Node

**Location**: `graph-types.js`

The system MUST provide an `ai` node type for LLM responses. AI nodes MUST display the response content with a bot icon and model name.

### [x] NODE-REQ-003: Note Node

**Location**: `graph-types.js`

The system MUST provide a `note` node type for static content. Note nodes MUST be editable and support markdown rendering.

### [x] NODE-REQ-004: Reference Node

**Location**: `graph-types.js`

The system MUST provide a `reference` node type for external URLs. Reference nodes MUST display the URL title and a link.

### [x] NODE-REQ-005: Search Node

**Location**: `graph-types.js`

The system MUST provide a `search` node type for search results. Search nodes MUST display the query and list of results with links.

### [x] NODE-REQ-006: Matrix Node

**Location**: `plugins/matrix.js`

The system MUST provide a `matrix` node type for evaluation tables. Matrix nodes MUST display rows and columns with editable cells. Cells MUST be fillable via LLM.

### [x] NODE-REQ-007: Code Node

**Location**: `plugins/code.js`, `pyodide-runner.js`

The system MUST provide a `code` node type for executable Python. Code nodes MUST include a code editor and output panel. Execution MUST use Pyodide in the browser.

### [x] NODE-REQ-008: PDF Node

**Location**: `plugins/pdf-node.js`

The system MUST provide a `pdf` node type for PDF viewing. PDF nodes MUST render pages and support pagination (Prev/Next).

### [x] NODE-REQ-009: Image Node

**Location**: `graph-types.js`

The system MUST provide an `image` node type for images. Image nodes MUST display the image at proper aspect ratio.

### [x] NODE-REQ-010: YouTube Node

**Location**: `plugins/youtube.js`

The system MUST provide a `youtube` node type for YouTube videos. YouTube nodes MUST display the video player and transcript.

### [x] NODE-REQ-011: Flashcard Node

**Location**: `flashcards.js`

The system MUST provide a `flashcard` node type for spaced repetition. Flashcard nodes MUST display question and answer with flip interaction.

### [x] NODE-REQ-012: Committee Node

**Location**: `plugins/committee.js`

The system MUST provide `opinion`, `review`, and `synthesis` node types for multi-LLM consultation. These nodes MUST display responses from multiple models.

### [x] NODE-REQ-013: Factcheck Node

**Location**: `plugins/factcheck.js`

The system MUST provide a `factcheck` node type for claim verification. Factcheck nodes MUST display claims, verdicts, and source links.

### [x] NODE-REQ-014: PowerPoint Node

**Location**: `powerpoint-node.js`

The system MUST provide a `powerpoint` node type for presentations. PowerPoint nodes MUST display slides with navigation.

### [x] NODE-REQ-015: GitHub Node

**Location**: `plugins/git-repo.js`

The system MUST provide a `git_repo` node type for GitHub repositories. GitHub nodes MUST display file tree and content.

### [x] NODE-REQ-016: Data Import Nodes

**Location**: `plugins/csv-node.js`, `plugins/excel-node.js`, `plugins/prism-node.js`

The system MUST provide `csv`, `excel`, and `prism` node types for data import. These nodes MUST provide csvData for /code integration.

### [x] NODE-REQ-017: HTML Slides Node

**Location**: `html-slides.js`

The system MUST provide an `html_slides` node type for HTML presentations. HTML slides nodes MUST support Prev/Next navigation.

### [x] NODE-REQ-018: Research Node

**Location**: `plugins/research.js`

The system MUST provide a `research` node type for deep research. Research nodes MUST display synthesized findings and sources.

## Edge Type Requirements

### [x] EDGE-REQ-001: Reply Edge

**Location**: `graph-types.js`

The system MUST provide a `reply` edge type connecting AI responses to the human message they respond to.

### [x] EDGE-REQ-002: Branch Edge

**Location**: `graph-types.js`

The system MUST provide a `branch` edge type connecting branched conversations to their origin text.

### [x] EDGE-REQ-003: Reference Edge

**Location**: `graph-types.js`

The system MUST provide a `reference` edge type connecting reference nodes to their source content.

### [x] EDGE-REQ-004: Generate Edge

**Location**: `graph-types.js`

The system MUST provide a `generates` edge type connecting source content to derived content (e.g., flashcards from notes).

## Node Protocol Requirements

### [x] PROT-REQ-001: getTypeLabel

**Location**: `node-protocols.js`

All node types MUST implement `getTypeLabel()` returning a human-readable type name.

### [x] PROT-REQ-002: getTypeIcon

**Location**: `node-protocols.js`

All node types MUST implement `getTypeIcon()` returning an emoji or icon identifier.

### [x] PROT-REQ-003: getSummaryText

**Location**: `node-protocols.js`

All node types MUST implement `getSummaryText()` returning text for semantic zoom summary view.

### [x] PROT-REQ-004: renderContent

**Location**: `node-protocols.js`

All node types MUST implement `renderContent()` returning HTML string for node display.

### [x] PROT-REQ-005: getActions

**Location**: `node-protocols.js`

All node types MUST implement `getActions()` returning array of available actions (copy, edit, delete, etc.).

### [x] PROT-REQ-006: isContentEditable

**Location**: `node-protocols.js`

Node types MAY implement `isContentEditable()` returning false to disable editing. Default is true.

## Status Key

- `[ ]` Active requirement
- `[x]` Implemented requirement
- `[D]` Deferred requirement
