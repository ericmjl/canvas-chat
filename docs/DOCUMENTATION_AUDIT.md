# Canvas Chat Documentation Audit

**Audit Date:** 2026-01-02
**Auditor:** Claude (Automated Analysis)
**Framework:** Diataxis

## Executive Summary

This audit analyzes the Canvas Chat documentation against the Diataxis framework and identifies gaps between implemented features and documentation coverage. The codebase contains ~12,900 lines of production code with 17 distinct node types and 5 slash commands, but documentation coverage is incomplete.

### Key Findings

✅ **Strengths:**
- Recent documentation updates (8 files updated within last 3 days)
- Good explanation documents for complex features (matrix, auto-layout, streaming)
- AGENTS.md provides excellent developer reference

❌ **Critical Gaps:**
- **Missing Diataxis categories:** No tutorials, no reference documentation
- **Undocumented major features:** /search, /research, /committee commands
- **Missing user guides:** Image upload, highlighting, tags, keyboard shortcuts
- **No API reference:** Backend endpoints undocumented

---

## 1. Diataxis Framework Compliance

The [Diataxis framework](https://diataxis.fr/) prescribes four documentation types. Current coverage:

| Category | Required? | Exists? | Files | Status |
|----------|-----------|---------|-------|--------|
| **Tutorials** | ✓ | ❌ | 0 | **MISSING** |
| **How-to guides** | ✓ | ✓ | 2 | Partial |
| **Explanation** | ✓ | ✓ | 5 | Good |
| **Reference** | ✓ | ❌ | 0 | **MISSING** |

### 1.1 Missing Tutorials

**Impact:** New users have no guided learning path.

**Recommendation:** Create `docs/tutorials/` with:
- `getting-started.md` - First 10 minutes with Canvas Chat
- `research-workflow.md` - Using /search and /research effectively
- `matrix-analysis.md` - Complete walkthrough of matrix evaluation
- `committee-debate.md` - Using the /committee feature

**Target audience:** New users who need hand-holding through core workflows.

### 1.2 Incomplete How-to Guides

**Existing:**
- `how-to/import-pdfs.md` ✓ (Updated 2026-01-01)
- `how-to/use-matrix-evaluation.md` ✓ (Created 2025-12-31)

**Missing critical how-tos:**
- How to use web search (/search command)
- How to conduct deep research (/research command)
- How to use the committee feature (/committee)
- How to use highlights and text branching
- How to use tags for organization
- How to use keyboard shortcuts effectively
- How to configure multiple LLM providers
- How to export and import sessions

### 1.3 Missing Reference Documentation

**Impact:** Users and developers lack authoritative technical details.

**Recommendation:** Create `docs/reference/` with:
- `api-endpoints.md` - Complete REST API reference
- `node-types.md` - All 17 node types with schemas
- `edge-types.md` - All 9 edge types and relationships
- `slash-commands.md` - Complete command reference
- `keyboard-shortcuts.md` - All shortcuts
- `configuration.md` - Settings and environment variables
- `llm-providers.md` - Supported providers and configuration

---

## 2. Documentation Timestamps & Freshness

### Recent Updates (Last 3 days) ✓

| File | Last Updated | Status |
|------|--------------|--------|
| `README.md` | 2026-01-02 09:13 | ✅ Current |
| `AGENTS.md` | 2026-01-01 11:26 | ✅ Current |
| `docs/releases/v0.1.11.md` | 2026-01-02 14:28 | ✅ Current |
| `docs/how-to/import-pdfs.md` | 2026-01-01 18:00 | ✅ Current |
| `docs/explanation/url-fetching.md` | 2026-01-01 10:30 | ✅ Current |

### Older Documentation (Needs Review)

| File | Last Updated | Age (days) | Status |
|------|--------------|------------|--------|
| `docs/explanation/auto-layout.md` | 2025-12-31 14:55 | 2 | ⚠️ Review |
| `docs/explanation/matrix-evaluation.md` | 2025-12-31 14:55 | 2 | ⚠️ Review |
| `docs/explanation/matrix-resize-behavior.md` | 2025-12-31 14:55 | 2 | ⚠️ Review |
| `docs/explanation/streaming-architecture.md` | 2025-12-31 14:55 | 2 | ⚠️ Review |
| `docs/how-to/use-matrix-evaluation.md` | 2025-12-31 14:55 | 2 | ⚠️ Review |

**Note:** While these files are only 2 days old, they should be cross-checked against current implementation to ensure accuracy, especially if features have been updated since.

---

## 3. Feature Coverage Analysis

### 3.1 Slash Commands (5 total)

| Command | Documented? | Location | Notes |
|---------|-------------|----------|-------|
| `/note` | ✅ | import-pdfs.md | Covers PDF aspect only |
| `/search` | ❌ | - | **MISSING** - Exa web search |
| `/research` | ❌ | - | **MISSING** - Deep research |
| `/matrix` | ✅ | how-to/use-matrix-evaluation.md | Good coverage |
| `/committee` | ❌ | - | **MISSING** - Multi-LLM consultation |

**Gap severity:** HIGH - 3 out of 5 commands undocumented

### 3.2 Node Types (17 total)

| Node Type | Purpose | Documented? | Notes |
|-----------|---------|-------------|-------|
| HUMAN | User messages | ✅ | README |
| AI | Assistant responses | ✅ | README |
| NOTE | User notes/fetched content | ✅ | import-pdfs.md |
| SUMMARY | Conversation summaries | ❌ | **MISSING** |
| REFERENCE | Search result links | ⚠️ | Mentioned in url-fetching.md |
| SEARCH | Search query nodes | ❌ | **MISSING** |
| RESEARCH | Research nodes | ❌ | **MISSING** |
| HIGHLIGHT | Text excerpts | ❌ | **MISSING** - Major feature |
| MATRIX | Evaluation tables | ✅ | Complete |
| CELL | Pinned matrix cells | ✅ | In matrix docs |
| ROW | Extracted matrix rows | ⚠️ | Mentioned, not detailed |
| COLUMN | Extracted matrix columns | ⚠️ | Mentioned, not detailed |
| FETCH_RESULT | Fetched URL content | ✅ | url-fetching.md |
| PDF | Imported PDFs | ✅ | import-pdfs.md |
| OPINION | Committee member response | ❌ | **MISSING** |
| SYNTHESIS | Committee synthesis | ❌ | **MISSING** |
| REVIEW | Committee review | ❌ | **MISSING** |
| IMAGE | Uploaded images | ❌ | **MISSING** |

**Coverage:** 7/17 documented (41%)
**Gap severity:** HIGH

### 3.3 Backend API Endpoints (15 major endpoints)

| Endpoint | Purpose | Documented? |
|----------|---------|-------------|
| `POST /api/chat` | LLM streaming | ❌ |
| `POST /api/summarize` | Generate summaries | ❌ |
| `POST /api/exa/search` | Web search | ❌ |
| `POST /api/exa/research` | Deep research | ❌ |
| `POST /api/exa/get-contents` | Fetch URL via Exa | ⚠️ |
| `POST /api/fetch-url` | Fetch URL (Jina) | ⚠️ |
| `POST /api/fetch-pdf` | Fetch PDF from URL | ✅ |
| `POST /api/upload-pdf` | Upload PDF file | ✅ |
| `POST /api/matrix/fill` | Fill matrix cell | ⚠️ |
| `POST /api/parse-two-lists` | Parse matrix axes | ❌ |
| `POST /api/committee` | Run LLM committee | ❌ |
| `POST /api/generate-title` | Generate session title | ❌ |
| `POST /api/generate-summary` | Generate node summary | ❌ |
| `POST /api/refine-query` | Context-aware query refinement | ❌ |
| `GET /api/models` | List available models | ❌ |

**Coverage:** 2/15 documented (13%)
**Recommendation:** Create `docs/reference/api-endpoints.md`

### 3.4 User-Facing Features

| Feature | Documented? | Location |
|---------|-------------|----------|
| Multi-select (Cmd+Click) | ⚠️ | Mentioned in README only |
| Text highlighting & branching | ❌ | **MISSING** |
| Node tags | ❌ | **MISSING** |
| Keyboard shortcuts | ❌ | **MISSING** (Cmd+K, Cmd+Z found in code) |
| Auto-layout algorithm | ✅ | explanation/auto-layout.md |
| Semantic zoom | ❌ | **MISSING** |
| Drag-and-drop PDF import | ✅ | how-to/import-pdfs.md |
| Session export/import | ⚠️ | README mentions only |
| LLM provider configuration | ⚠️ | README lists providers |
| Context visualization | ⚠️ | README mentions |

**Gap severity:** MEDIUM - Core features mentioned but not explained

---

## 4. Critical Documentation Gaps

### Priority 1: Essential User Features (Undocumented)

1. **Web Search (`/search`)**
   - Used by: End users wanting to research topics
   - Location: Slash command in app.js:188
   - Implementation: Uses Exa API
   - **Action:** Create `docs/how-to/web-search.md`

2. **Deep Research (`/research`)**
   - Used by: Users wanting comprehensive research reports
   - Location: Slash command in app.js:189
   - Implementation: Exa Research API with streaming
   - **Action:** Create `docs/how-to/deep-research.md`

3. **Committee Feature (`/committee`)**
   - Used by: Users wanting multi-LLM perspectives
   - Location: Slash command in app.js:191
   - Implementation: Parallel LLM calls with synthesis
   - **Action:** Create `docs/how-to/llm-committee.md` and `docs/explanation/committee-architecture.md`

4. **Text Highlighting & Branching**
   - Used by: Users wanting to excerpt and respond to specific text
   - Location: HIGHLIGHT node type, HIGHLIGHT edge type
   - **Action:** Create `docs/how-to/highlight-and-branch.md`

5. **Node Tags**
   - Used by: Users organizing conversations
   - Location: TAG_COLORS in graph.js, rendering in canvas.js
   - **Action:** Create `docs/how-to/organize-with-tags.md`

6. **Image Upload & Analysis**
   - Used by: Users wanting vision model analysis
   - Location: IMAGE node type
   - **Action:** Create `docs/how-to/image-analysis.md`

### Priority 2: Reference Documentation

1. **API Endpoints Reference**
   - Audience: Frontend developers, API users
   - **Action:** Create `docs/reference/api-endpoints.md` with full REST API spec

2. **Node & Edge Types Reference**
   - Audience: Developers, power users
   - **Action:** Create `docs/reference/graph-schema.md`

3. **Keyboard Shortcuts Reference**
   - Audience: Power users
   - Shortcuts found: Cmd+K (search), Cmd+Z/Shift+Z (undo/redo), C (center view), Cmd+Click (multi-select)
   - **Action:** Create `docs/reference/keyboard-shortcuts.md`

4. **LLM Provider Configuration**
   - Audience: Users setting up API keys
   - Providers: OpenAI, Anthropic, Google, Groq, GitHub, Ollama
   - **Action:** Create `docs/reference/llm-providers.md`

### Priority 3: Tutorials

1. **Getting Started Tutorial**
   - Audience: New users (first 10 minutes)
   - **Action:** Create `docs/tutorials/getting-started.md`

2. **Research Workflow Tutorial**
   - Audience: Users wanting to master /search + /research
   - **Action:** Create `docs/tutorials/research-workflow.md`

---

## 5. Documentation Quality Assessment

### Well-Documented Features ✅

1. **Matrix Evaluation**
   - Files: `explanation/matrix-evaluation.md`, `how-to/use-matrix-evaluation.md`, `explanation/matrix-resize-behavior.md`
   - Quality: Excellent - covers design rationale, implementation, and usage
   - Last updated: 2025-12-31

2. **Auto-Layout Algorithm**
   - File: `explanation/auto-layout.md`
   - Quality: Excellent - explains algorithm, alternatives, trade-offs
   - Last updated: 2025-12-31

3. **URL Fetching Architecture**
   - File: `explanation/url-fetching.md`
   - Quality: Excellent - explains dual implementation strategy
   - Last updated: 2026-01-01

4. **PDF Import**
   - File: `how-to/import-pdfs.md`
   - Quality: Good - covers all import methods and limits
   - Last updated: 2026-01-01

5. **Developer Guide**
   - File: `AGENTS.md`
   - Quality: Excellent - comprehensive code map and patterns
   - Last updated: 2026-01-01

### Documentation Maintenance Issues

**None identified.** Recent timestamps show active maintenance. Oldest explanation docs are only 2 days old, suggesting documentation is kept current with code changes.

---

## 6. Recommendations by Priority

### Immediate (Priority 1) - Complete Core Feature Docs

**Timeline:** Next sprint

1. Create `docs/how-to/web-search.md`
2. Create `docs/how-to/deep-research.md`
3. Create `docs/how-to/llm-committee.md`
4. Create `docs/how-to/highlight-and-branch.md`
5. Create `docs/reference/keyboard-shortcuts.md`

### Short-term (Priority 2) - Reference Documentation

**Timeline:** Within 2 weeks

1. Create `docs/reference/` directory structure
2. Create `docs/reference/api-endpoints.md`
3. Create `docs/reference/graph-schema.md` (node types, edge types)
4. Create `docs/reference/llm-providers.md`
5. Create `docs/reference/slash-commands.md`
6. Create `docs/how-to/organize-with-tags.md`
7. Create `docs/how-to/image-analysis.md`

### Medium-term (Priority 3) - Tutorials

**Timeline:** Within 1 month

1. Create `docs/tutorials/` directory
2. Create `docs/tutorials/getting-started.md`
3. Create `docs/tutorials/research-workflow.md`
4. Create `docs/tutorials/matrix-analysis.md`
5. Create `docs/tutorials/committee-debate.md`

### Long-term (Priority 4) - Enhancements

**Timeline:** Ongoing

1. Add diagrams to explanation docs (architecture diagrams, flow charts)
2. Add GIFs/videos to how-to guides (visual demonstrations)
3. Create troubleshooting guide
4. Create FAQ
5. Add code examples to API reference

---

## 7. Diataxis Alignment Strategy

To fully comply with Diataxis, organize documentation as:

```
docs/
├── tutorials/           # NEW - Learning-oriented
│   ├── getting-started.md
│   ├── research-workflow.md
│   ├── matrix-analysis.md
│   └── committee-debate.md
├── how-to/             # EXISTS - Task-oriented
│   ├── web-search.md        # NEW
│   ├── deep-research.md     # NEW
│   ├── llm-committee.md     # NEW
│   ├── highlight-and-branch.md  # NEW
│   ├── organize-with-tags.md    # NEW
│   ├── image-analysis.md    # NEW
│   ├── import-pdfs.md       # EXISTS ✓
│   └── use-matrix-evaluation.md  # EXISTS ✓
├── explanation/        # EXISTS - Understanding-oriented
│   ├── auto-layout.md           # EXISTS ✓
│   ├── matrix-evaluation.md     # EXISTS ✓
│   ├── matrix-resize-behavior.md # EXISTS ✓
│   ├── streaming-architecture.md # EXISTS ✓
│   ├── url-fetching.md          # EXISTS ✓
│   └── committee-architecture.md # NEW
└── reference/          # NEW - Information-oriented
    ├── api-endpoints.md
    ├── graph-schema.md
    ├── slash-commands.md
    ├── keyboard-shortcuts.md
    ├── llm-providers.md
    └── configuration.md
```

---

## 8. Metrics Summary

| Metric | Count | Coverage |
|--------|-------|----------|
| Total code (lines) | 12,909 | - |
| Slash commands | 5 | 40% documented |
| Node types | 17 | 41% documented |
| API endpoints | 15 | 13% documented |
| Documentation files | 19 | - |
| Explanation docs | 5 | Good |
| How-to guides | 2 | Insufficient |
| Tutorials | 0 | **Missing** |
| Reference docs | 0 | **Missing** |

**Overall Documentation Health:** 🟡 **MODERATE**

- Recent updates show active maintenance ✅
- Core complex features well-explained ✅
- Critical user features undocumented ❌
- Missing entire Diataxis categories ❌
- No reference documentation ❌

---

## 9. Next Steps

1. **Review this audit** with the team
2. **Prioritize documentation work** based on user impact
3. **Create missing directories** (`docs/tutorials/`, `docs/reference/`)
4. **Assign documentation tasks** to sprint backlog
5. **Set up documentation review process** to keep docs current with code

---

## Appendix A: Features Found in Code But Undocumented

### From app.js (5,543 lines)

- Slash command autocomplete menu
- Undo/redo system (UndoManager class)
- Committee feature (parallel LLM consultation)
- Query refinement (context-aware)
- Title generation
- Summary generation for semantic zoom
- Two-list parsing for matrix

### From canvas.js (2,799 lines)

- Semantic zoom levels (3 zoom states)
- Node tag rendering and management
- Stop/continue buttons for streaming
- Node resize handles
- Pan/zoom viewport controls

### From graph.js (1,231 lines)

- 17 node types (full enumeration above)
- 9 edge types (REPLY, BRANCH, MERGE, REFERENCE, SEARCH_RESULT, HIGHLIGHT, MATRIX_CELL, OPINION, SYNTHESIS, REVIEW)
- Auto-layout algorithm (topological sort + greedy placement)
- 8-color tag palette

### From app.py (2,219 lines)

- 15 API endpoints (listed above)
- Multiple LLM provider support (6 providers)
- Exa integration (search, research, get-contents)
- PDF extraction (PyMuPDF)
- URL fetching (Jina Reader + html2text fallback)
- Committee orchestration (parallel streaming + synthesis)

---

**Audit completed:** 2026-01-02
**Next review recommended:** After completing Priority 1 tasks
