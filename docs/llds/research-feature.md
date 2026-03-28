# Low-Level Design: ResearchFeature

**Created**: 2026-03-16
**Status**: Implementation
**Module**: ResearchFeature (deep research and web search)
**Updated**: 2026-03-28 — Research activity output panel (arrow of intent: HLD §4.4 → this LLD → NODE-REQ-019, RSCH-REQ-005 → tests → code)

## Arrow of intent (traceability)

Documentation and implementation follow one chain so intent does not drift:

```text
[HLD: Streaming-First + intermediate activity](../high-level-design.md#44-streaming-first)
        → [this LLD: Research activity output panel](#research-activity-output-panel)
        → [NODE-REQ-019](../specs/node-types-specs.md) / [RSCH-REQ-005](../specs/feature-plugins-specs.md)
        → [tests: ResearchNode output panel](../../tests/test_node_protocols.js)
        → code: `plugins/research-node.js`, `plugins/research.js`, `canvas.ensureOutputPanelContent`
```

## Context and Design Philosophy

The ResearchFeature provides two related but distinct capabilities within Canvas-Chat. The `/search` command performs lightweight web searches and displays results as reference nodes. The `/research` command performs deep research, synthesizing information from multiple sources into a comprehensive report. Both commands support context-aware refinement, where selected text or nodes are used to clarify vague queries.

The design philosophy centers on three principles. First, progressive disclosure recognizes that not all research needs are equal; `/search` is fast and lets users explore manually, while `/research` provides comprehensive synthesis for complex topics. Second, dual-provider architecture prioritizes Exa for quality but gracefully falls back to DuckDuckGo when no API key is available, ensuring the feature works for all users. Third, streaming-first experience provides real-time feedback during research, showing status updates and progressive content so users understand what's happening. Fourth, **separation of concerns in the UI**: while research runs, the main node body shows only a short in-progress placeholder plus the topic; the **slide-out output panel** carries the chronological **activity log** (status lines and, for DDG, per-source lines). When streaming finishes, the node body shows the full synthesized report.

## Technical Overview

### Slash Command Entry Points

The feature is accessed via two slash commands registered in the FeatureRegistry:

- `/search` - Lightweight web search returning reference nodes
- `/research` - Deep research with synthesized report

```text
/search latest advances in mRNA vaccines
/research comprehensive analysis of mRNA vaccine technology and its clinical applications
```

#### Command Routing

Both commands route to the same `ResearchFeature` class but use different handlers:

- `/search` routes to `handleSearch(command, args, contextObj)`
- `/research` routes to `handleResearch(param1, param2, param3)`

The `handleResearch` method supports two calling patterns:

1. Slash command: `handleResearch(command, args, contextObj)` - when invoked via `/research`
2. Internal continue: `handleResearch(instructions, context, existingNodeId)` - when continuing a stopped research

### Provider Detection

The feature detects the search provider at runtime:

```javascript
const hasExa = storage.hasExaApiKey();
const exaKey = hasExa ? storage.getExaApiKey() : null;
const provider = hasExa ? 'Exa' : 'DuckDuckGo';
```

Provider detection happens in both `handleSearch` and `handleResearch`. The selected provider determines:

- Which API endpoint to call (`/api/exa/search` vs `/api/ddg/search`)
- Whether to use Exa-specific models (`exa-research`)
- How to parse the response (streaming vs batch)

## Query Refinement

Both commands support context-aware query refinement. When users have text or nodes selected, the feature calls the `/api/refine-query` endpoint to generate a more effective search query.

### Refinement Process

1. User provides vague query with context (selected text/nodes)
2. Frontend sends `{ user_query, context, command_type }` to `/api/refine-query`
3. Backend uses LLM to generate a refined query that incorporates context
4. Frontend updates the node to show both original and refined queries
5. The refined query is used for the actual search/research

### Example Transformation

**User input**: Selected node mentions "Toffoli gates", query is "how does this work?"

**Refined query**: "how Toffoli gate CCNOT quantum computing works"

This allows conversational queries that would otherwise fail in web search.

## /search Command Flow

### Frontend: handleSearch Method

The `handleSearch` method in `ResearchFeature` implements the following flow:

1. **Provider Detection**: Check for Exa API key in storage
2. **Node Creation**: Create a SEARCH node with placeholder content
3. **Positioning**: Use `graph.autoPosition()` to place node relative to selected parents
4. **Edge Creation**: Connect to parent nodes with `EdgeType.REFERENCE`
5. **Query Refinement**: If context provided, call `/api/refine-query` and update display
6. **Search Execution**: Call appropriate endpoint based on provider
7. **Result Processing**: Parse response and update node content
8. **Reference Node Creation**: Create REFERENCE nodes for each result, positioned to the right

### Backend: /api/exa/search Endpoint

Located in `app.py` at line 1822:

```python
@app.post("/api/exa/search")
async def exa_search(request: ExaSearchRequest):
```

The endpoint:

1. Creates an Exa client with the provided API key
2. Calls `exa.search_and_contents()` with the query
3. Requests `text={"max_characters": 1500}` for content extraction
4. Returns formatted results with title, URL, snippet, published_date, author

### Backend: /api/ddg/search Endpoint

Located in `ddg_endpoints.py` at line 159:

```python
@app.post("/api/ddg/search")
async def ddg_search(request: DDGSearchRequest):
```

The endpoint:

1. Uses the `ddgs` library to perform DuckDuckGo search
2. Returns results in the same format as Exa for frontend compatibility
3. Falls back gracefully when Exa is not available

### Search Node Structure

Created using `createNode(NodeType.SEARCH, content, options)`:

- **Width**: 420px
- **Height**: 200px
- **Edge Type**: `EdgeType.REFERENCE` from parent nodes
- **Content**: Markdown with query, provider info, and result count

### Reference Node Structure

Created for each search result using `createNode(NodeType.REFERENCE, content, options)`:

- **Position**: Offset 400px right of search node, with 200px vertical spacing
- **Edge Type**: `EdgeType.SEARCH_RESULT` from search node
- **Content**: Title (as link), URL, snippet, published date

## /research Command Flow

### Frontend: handleResearch Method

The `handleResearch` method implements a more complex flow than search:

1. **Provider Detection**: Check for Exa API key
2. **Node Creation**: Create RESEARCH node with placeholder (500px wide for reports)
3. **Streaming Registration**: Register with `StreamingManager` for stop/continue support
4. **Query Refinement**: Same refinement process as search
5. **Research Execution**: Call appropriate endpoint based on provider
6. **SSE Processing**: Handle streaming events (status, content, sources); append to `researchActivityLog` and call `canvas.ensureOutputPanelContent` so the activity panel appears on first chunk
7. **Completion**: Clear `researchActivityActive`, clean up streaming state, generate summary

### Streaming Integration

Research integrates with the `StreamingManager` for unified stop/continue handling:

```javascript
this.streamingManager.register(nodeId, {
    abortController,
    featureId: 'research',
    context: {
        type: 'research',
        originalInstructions: instructions,
        originalContext: selectedContext,
    },
    onContinue: async (nodeId, state, _newAbortController) => {
        // Continue research from where it left off
        await this.handleResearch(state.context.originalInstructions, state.context.originalContext, nodeId);
    },
});
```

This integration provides:

- Stop button in node header during streaming
- Continue button to resume stopped research
- Proper cleanup on completion or error

### Backend: /api/exa/research Endpoint

Located in `app.py` at line 2016:

```python
@app.post("/api/exa/research")
async def exa_research(request: ExaResearchRequest):
```

The endpoint:

1. Creates an Exa research task via `exa.research.create()`
2. Streams results using `EventSourceResponse`
3. Emits SSE events: `status`, `content`, `sources`, `done`, `error`

#### SSE Event Types

| Event     | Payload       | Description             |
| --------- | ------------- | ----------------------- |
| `status`  | string        | Current research phase  |
| `content` | markdown      | Report content (chunks) |
| `sources` | JSON array    | `[{title, url}, ...]`   |
| `done`    | empty         | Research completed      |
| `error`   | error message | Failure occurred        |

#### Output Formatting

The `format_research_output()` function (line 1973) transforms Exa output objects:

- `output_type: "tasks"` - Planning phase: reasoning + task list
- `output_type: "completed"` - Final report with optional cost
- `output_type: "stop"` - Research stopped by user

### Backend: /api/ddg/research Endpoint

Located in `ddg_endpoints.py` at line 203:

This is a fallback implementation that uses DuckDuckGo + user's LLM. It implements iterative research:

1. **Query Generation**: LLM generates initial search queries from instructions
2. **Iteration Loop**: 3-5 iterations (configurable)
3. **Search**: DuckDuckGo search for each query
4. **Relevance Filtering**: Filter results based on query keywords
5. **Content Fetching**: Fetch page content via Jina or direct HTTP
6. **Summarization**: LLM summarizes each page
7. **Query Expansion**: Generate new queries based on learned information
8. **Synthesis**: Combine all summaries into final report

#### SSE Event Types (DDG Fallback)

| Event     | Payload  | Description                                                  |
| --------- | -------- | ------------------------------------------------------------ |
| `status`  | string   | Current phase ("Generating initial search queries...", etc.) |
| `source`  | JSON     | Individual source as it's processed                          |
| `content` | markdown | Final report (sent once at end)                              |

### Research Node Structure

Created using `createNode(NodeType.RESEARCH, content, options)`:

- **Width**: 500px (wider for markdown reports)
- **Height**: 480px (default, resizable)
- **Model Metadata**: Stores model used for research (`model` field)
- **Edge Type**: `EdgeType.REFERENCE` from parent nodes

### Research Node Protocol

Defined in `plugins/research-node.js`:

- **Type Label**: "Research"
- **Type Icon**: "📚"
- **Header Buttons**: Nav Parent, Nav Child, Collapse, Stop, Continue, Reset Size, Fit Viewport, Delete
- **Actions**: Reply, Create Flashcards, Copy
- **Output panel** (`hasOutput` / `renderOutputPanel`): When `researchActivityLog` is non-empty, the canvas shows the standard slide-out panel below the node. The log is a single `<pre>` directly in the panel body (no nested card); the panel chrome provides padding and scroll. While `researchActivityActive` is true, a “Running…” line is shown below the log.

### Research activity output panel

**Problem:** Status and source progress were only visible in the main node body (or as dense markdown). For DuckDuckGo research, terminal-style logs are especially informative; users benefit from a dedicated **activity** surface that mirrors other features (code run output, Git file preview).

**Approach:**

1. **Node fields** (CRDT-backed primitives on the research node):
   - `researchActivityLog` — newline-separated lines, capped (e.g. 300 lines) to avoid unbounded growth.
   - `researchActivityActive` — boolean; true while the SSE stream is open; false on `done`, abort, or error.

2. **Protocol** (`ResearchNode`): Implements `hasOutput()` when the trimmed log is non-empty; `renderOutputPanel(canvas)` returns escaped HTML for the log and optional running state (see [NODE-REQ-019](../specs/node-types-specs.md)).

3. **Feature** (`ResearchFeature`): On stream start, seeds the log (e.g. “Starting research…”); on each `status` event appends the line; on each DDG `source` event appends a short “Source: …” line; updates the graph then calls `canvas.ensureOutputPanelContent(nodeId, node)` so the panel is **created** if absent or **refreshed** if present (`canvas.js`).

4. **Canvas**: `ensureOutputPanelContent` wraps the pattern: if `wrapNode(node).hasOutput()` and no panel exists, `renderOutputPanel(node, wrapper)`; else `updateOutputPanelContent`.

**Styling:** `nodes.css` — `.research-activity-log` (monospace text only; no inner box), `.research-activity-status`.

## Streaming Results Processing

### Exa Streaming (Real-time Chunks)

For Exa research, content arrives in chunks:

```javascript
onEvent: (eventType, data) => {
    if (eventType === 'content') {
        // Append chunk to existing content
        if (reportContent.length > reportHeader.length) {
            reportContent += '\n\n---\n\n';
        }
        reportContent += data;
        this.canvas.updateNodeContent(nodeId, reportContent, true);
        this.graph.updateNode(nodeId, { content: reportContent });
    }
};
```

The `true` parameter indicates streaming mode (appending vs replacing).

### DDG Streaming (Source-by-Source)

For DDG research, sources arrive individually. Status and source lines are appended to the **activity log** (drawer) only. The **node body** stays a short placeholder (`*In progress…*`) until the final `content` event delivers the full report, so the canvas is not filled with duplicate status and source lists.

### Completion Handling

```javascript
onDone: () => {
    this.streamingManager.unregister(nodeId);

    // Normalize content
    reportContent = normalizeText(reportContent);

    // Add sources section if available
    if (sources.length > 0) {
        reportContent += '\n\n---\n**Sources:**\n';
        for (const source of sources) {
            reportContent += `- [${source.title}](${source.url})\n`;
        }
    }

    this.canvas.updateNodeContent(nodeId, reportContent, false);
    this.graph.updateNode(nodeId, { content: reportContent });

    // Generate async summary
    this.generateNodeSummary(nodeId);
};
```

## Stop and Continue

### Stop Mechanism

1. User clicks Stop button in research node header
2. `StreamingManager.unregister(nodeId)` is called
3. `abortController.abort()` cancels the in-flight request
4. Current content is preserved in the node
5. Continue button appears in node header

### Continue Mechanism

1. User clicks Continue button
2. `onContinue` callback is invoked with stored state
3. `handleResearch` is called with `existingNodeId` parameter
4. Node content shows "Restarting research..."
5. New research begins, updating the same node

## Node Positioning

### Search Positioning

- Search node: `graph.autoPosition(parentIds)` relative to selected parents
- Reference nodes: Offset 400px right, 200px vertical spacing between each

### Research Positioning

- Research node: `graph.autoPosition(parentIds)` relative to selected parents
- 500px width for better markdown report display

## Data Flow Summary

```text
User Input (/research topic)
        |
        v
ResearchFeature.handleResearch()
        |
        v
Provider Detection (Exa vs DDG)
        |
        v
Query Refinement (if context) --> /api/refine-query
        |
        v
Create RESEARCH Node + StreamingManager.register()
        |
        v
Backend API Call
  - Exa: /api/exa/research (streaming SSE)
  - DDG: /api/ddg/research (streaming SSE)
        |
        v
SSE Stream Processing
  - status events: Append to activity log + refresh output panel; update main body (status / report)
  - content events: Append to report
  - source events (DDG): Append source line to activity log; update main body sources section
  - sources events: Store for final section
        |
        v
Completion: clear researchActivityActive + normalize + add sources + generate summary
```

## File Structure

| File                       | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `plugins/research.js`      | ResearchFeature class with handleSearch/handleResearch; activity log + `ensureOutputPanelContent` |
| `plugins/research-node.js` | ResearchNode protocol; `hasOutput` / `renderOutputPanel` for activity drawer |
| `canvas.js`                | `ensureOutputPanelContent`, `renderOutputPanel`, `updateOutputPanelContent` |
| `plugins/search-node.js`   | SearchNode protocol definition                         |
| `app.py`                   | Exa API endpoints (lines 1822-2066)                    |
| `plugins/ddg_endpoints.py` | DuckDuckGo fallback endpoints                          |

## Dependencies

### Frontend Dependencies (injected via AppContext)

- `this.graph` - CRDT graph for node/edge operations
- `this.canvas` - SVG canvas for rendering
- `this.chat` - LLM API integration
- `this.storage` - localStorage for API keys
- `this.streamingManager` - Concurrent streaming state
- `this.modalManager` - Modal display
- `this.buildLLMRequest()` - Request builder helper

### External APIs

- **Exa API** (`/api/exa/*`) - Neural search and research
- **DuckDuckGo** (`/api/ddg/*`) - Free fallback search
- **Jina AI** - URL content extraction (used by DDG fallback)

## Open Questions & Future Decisions

### Resolved

1. ✅ Dual provider (Exa + DuckDuckGo fallback)
2. ✅ Automatic query refinement when context selected

### Deferred

1. Query refinement - skippable option for advanced users
2. Research continuation state - preserve intermediate results
3. Exa Pro model access - UI for model selection
4. Maximum results configuration - user-configurable limits
5. Multi-source synthesis - parallel provider searches

## References to HLD

This LLD supports the following HLD components:

- **Section 5.2: Backend LLM Proxy** - Research endpoints are part of the FastAPI backend
- **Section 5.1: Frontend The Canvas** - Research nodes render on the SVG canvas
- **Section 4.4: Streaming-First** - All research results stream in real-time; intermediate activity uses the output panel (see [NODE-REQ-019](../specs/node-types-specs.md))
- **Section 4.3: Plugin-Extensible** - ResearchFeature is a Level 2 feature plugin
- **Section 6: Node Types** - RESEARCH and SEARCH are documented node types
- **Section 7: Edge Types** - EdgeType.REFERENCE and SEARCH_RESULT connect research graphs

## Related Documentation

- [NODE-REQ-019](../specs/node-types-specs.md), [RSCH-REQ-005](../specs/feature-plugins-specs.md) — EARS requirements for the activity panel
- [How to conduct deep research](../how-to/deep-research.md) - User guide for /research
- [How to search the web](../how-to/web-search.md) - User guide for /search
- [High-Level Design](../high-level-design.md) - System overview
- [Feature Plugin API](../reference/feature-plugin-api.md) - Plugin base class reference
- [AppContext API](../reference/app-context-api.md) - Available Canvas-Chat APIs
