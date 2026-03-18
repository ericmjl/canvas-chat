# Low-Level Design: FactcheckFeature

**Created**: 2026-03-16
**Status**: Implementation
**Module**: FactcheckFeature (claim verification)

## Context and Design Philosophy

The FactcheckFeature implements a claim verification system that extracts factual claims from text, verifies them against web sources, and presents verdicts with explanations and citations. This feature addresses a fundamental need in AI-assisted workflows: determining the accuracy of factual statements made in conversations.

The design philosophy centers on four principles. First, user control is paramount through a claim review modal that lets users edit, add, or remove claims before verification begins, ensuring only relevant claims are checked. Second, transparency is maintained by showing all sources used in the verification process, allowing users to click through to original sources and verify themselves. Third, parallel processing accelerates verification by checking multiple claims simultaneously rather than sequentially. Fourth, graceful degradation ensures the feature works even without premium search APIs by falling back to DuckDuckGo when Exa is unavailable.

This feature directly supports the HLD's vision of Canvas-Chat as a toolkit for working with LLMs, specifically the fact-checking capability mentioned in Section 3.3 under "Rich LLM Features."

## Technical Overview

### Slash Command Entry Point

The feature is accessed via the `/factcheck` slash command, which accepts either direct claims as arguments or operates on selected node content. The command is registered in the FeatureRegistry and handled by the `handleFactcheck` method in `FactcheckFeature`.

```text
/factcheck The Eiffel Tower is 330 meters tall. Paris is the capital of France.
```

When invoked with selected nodes, the command uses the selected node's content as context:

```text
/factcheck verify these
```

The command handles several variations:

1. **Direct claims**: Arguments after `/factcheck` are treated as claims to verify
2. **Vague references**: Phrases like "verify these" or "fact check this" trigger use of selected node content
3. **Empty input with selection**: If no arguments are provided but nodes are selected, the selected content becomes the source
4. **Refinement**: When input is vague, the system optionally calls `/api/refine-query` to extract specific claims from context

### Claim Extraction

Claims are extracted from input text using an LLM with a specialized system prompt. The extraction process:

1. Identifies discrete, verifiable factual claims within the input
2. Rephrases fragments into complete, standalone statements
3. Handles numbered lists and bulleted lists by extracting each item as a separate claim
4. Limits extraction to a maximum of 10 claims, prioritizing the most significant ones
5. Returns an empty array if the input contains no factual content (only greetings or questions)

The extraction prompt instructs the LLM to be inclusive, treating even seemingly obvious claims (like "The Earth is flat" or "Water boils at 100°C") as verifiable. This ensures users can verify any claim without special handling.

### Claim Review Modal

Before verification begins, a modal (`factcheck-main-modal`) presents extracted claims for user review:

- **Claim rows**: Each extracted claim appears as a textarea for editing
- **Add claim**: Users can add custom claims not captured by extraction
- **Remove claim**: Each row has a remove button to delete irrelevant claims
- **Claim count**: Shows number of claims ready for verification
- **Warning**: Displays when more than 5 claims are selected (informational only)
- **Execute button**: Disabled until at least one valid claim exists

The modal enforces validation: at least one non-empty claim is required to proceed. This ensures users intentionally confirm what they want verified.

### Web Search Integration

The feature supports two search backends for finding sources:

**Exa Search** (preferred when available):

- Requires Exa API key in settings
- Returns high-quality, AI-optimized search results
- Uses `/api/exa/search` endpoint
- Up to 3 queries per claim, 3 results per query

**DuckDuckGo Search** (fallback):

- No API key required
- Uses `/api/ddg/search` endpoint
- Returns 5 results per query
- Activated automatically when Exa key is not configured

For each claim, the system:

1. Generates 2-3 search queries optimized for finding verification sources
2. Executes searches in parallel for all queries
3. Deduplicates results by URL
4. Limits to top 8 unique sources per claim

The query generation uses an LLM to craft searches that would find authoritative sources (news, official documents, Wikipedia). The LLM varies query phrasing to capture different perspectives and includes keywords like "fact check" or "true" when helpful.

### LLM Verdict Analysis

After gathering search results, an LLM analyzes the evidence to produce a verdict:

**Verdict Types**:

- **VERIFIED**: The claim is accurate and supported by reliable sources
- **PARTIALLY_TRUE**: The claim is mostly correct but contains inaccuracies or missing context
- **MISLEADING**: The claim is technically true but presented in a misleading way
- **FALSE**: The claim is factually incorrect
- **UNVERIFIABLE**: Cannot determine truth due to lack of reliable sources

The analysis prompt includes:

- The original claim
- Up to 8 search results with title, URL, and snippet
- Instructions to respond in exact JSON format
- Requirement to cite max 3 relevant sources

The LLM must provide:

- `verdict`: One of the five verdict types
- `explanation`: Brief 1-2 sentence explanation of why the verdict was reached
- `sources`: Array of {title, url} objects (max 3)

## Node Types

### FactcheckNode

The FactcheckNode protocol class defines how factcheck nodes are rendered and what actions they support. It extends BaseNode and provides custom rendering for claim verification results.

**Header Information**:

- Type label: "Factcheck"
- Type icon: "🔍"
- Summary text: Shows claim count at lower zoom levels

**Content Rendering**:

- Accordion-style claim display
- Each claim shows verdict badge, claim text, and expand/collapse toggle
- Expanded state reveals explanation and source links
- Multiple claims can be expanded simultaneously

**Verdict Badges**:

- 🔄 checking: Verification in progress
- ✅ verified: Claim confirmed accurate
- ⚠️ partially_true: Mostly correct with caveats
- 🔶 misleading: Technically true but misleading
- ❌ false: Factually incorrect
- ❓ unverifiable: Cannot verify with available sources
- ⚠️ error: Verification failed

**Actions and Shortcuts**:

- Only COPY action available (via action bar and Ctrl+C)
- Edit content disabled (E key does nothing)
- Reply disabled (R key does nothing)
- This makes factcheck nodes read-only, preserving verification integrity

**Event Bindings**:

- Click on claim header toggles expanded state
- Only functional for non-checking claims
- Multiple claims can be expanded simultaneously

**Default Dimensions**: 640x480 pixels

### Loading Node

During the initial processing phase, a temporary loading node displays status:

- "Analyzing text for claims..." during extraction
- "Refining query..." when improving vague input
- "Extracting claims..." during claim extraction
- "Extracted N claims. Review before verifying." after extraction

This node transforms into the FactcheckNode once verification begins or errors occur.

## Edge Types

The FactcheckFeature creates edges to represent relationships between nodes:

| Edge Type            | From         | To             | Meaning                    |
| -------------------- | ------------ | -------------- | -------------------------- |
| `EdgeType.REFERENCE` | Source node  | Factcheck node | Content being verified     |
| `EdgeType.REFERENCE` | Parent nodes | Loading node   | Initial context connection |

When multiple nodes are selected for verification, each parent node receives an edge to the factcheck node. This maintains the graph relationship showing which content was examined.

## Execution Flow

### Phase 1: Input Processing and Claim Extraction

1. User invokes `/factcheck` with optional arguments and/or node selection
2. System determines effective input:
    - Use direct arguments if provided and substantive (>20 characters)
    - If arguments are vague ("verify these"), use selected node content
    - If no arguments, use selected node content
3. If input is vague but context exists, optionally refine via `/api/refine-query`
4. Create loading node at calculated position
5. Connect loading node to parent nodes (if any)
6. Call LLM to extract claims from effective input
7. Display claim count in loading node
8. Show claim review modal

### Phase 2: Claim Review and Selection

1. Modal displays extracted claims
2. User can edit, add, or remove claims
3. Execute button enables when at least one valid claim exists
4. On Execute: collect all non-empty claims, close modal
5. On Cancel: remove loading node, close modal

### Phase 3: Parallel Verification

For each claim in the selected set:

1. Generate 2-3 search queries via LLM
2. Execute searches (Exa or DuckDuckGo) in parallel
3. Deduplicate results by URL
4. Send claim + results to LLM for verdict analysis
5. Update the specific claim in the node (status, explanation, sources)
6. Re-render the node to show progress
7. Save session after each claim completes

All claims verify in parallel using `Promise.allSettled`, ensuring:

- Maximum throughput (no waiting for slow claims)
- Individual failure isolation (one failure doesn't block others)
- Results available as soon as each claim completes

### Phase 4: Final Display

1. After all verifications complete, final save to IndexedDB
2. Node shows all claims with verdicts
3. Users can expand each claim to read explanations and click sources

## Data Structures

### Claim Data Object

```javascript
{
    text: string,           // The claim text being verified
    status: string,         // checking | verified | partially_true | misleading | false | unverifiable | error
    verdict: string | null, // VERIFIED | PARTIALLY_TRUE | MISLEADING | FALSE | UNVERIFIABLE
    explanation: string | null, // Brief explanation of verdict
    sources: Array<{       // Source citations
        title: string,     // Source title
        url: string        // Source URL
    }>
}
```

### Factcheck Node Data

```javascript
{
    id: string,             // Unique node ID
    type: 'factcheck',      // Node type
    content: string,        // Markdown-formatted content
    claims: Array<ClaimDataObject>, // All claims with verdicts
    position: { x, y },     // Canvas position
    width: 640,             // Default width
    height: 480             // Default height
}
```

### Internal State (\_factcheckData)

```javascript
{
    claims: string[],       // Claims from modal
    parentIds: string[],    // Source node IDs
    model: string,          // LLM model for verification
    apiKey: string,         // API key for model
    loadingNodeId: string   // ID of loading/factcheck node
}
```

### LLM Request/Response Formats

**Claim Extraction Request**:

```javascript
{
    messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: inputText }
    ],
    model: selectedModel
}
```

**Query Generation Request**:

```javascript
{
    messages: [
        { role: 'system', content: queryGenerationPrompt },
        { role: 'user', content: claimText }
    ],
    model: selectedModel
}
```

**Verdict Analysis Request**:

```javascript
{
    messages: [
        { role: 'system', content: verdictAnalysisPrompt },
        { role: 'user', content: `CLAIM: ${claim}\n\nSEARCH RESULTS:\n${formattedResults}` }
    ],
    model: selectedModel
}
```

## Integration Points

### FeatureRegistry Registration

FactcheckFeature is registered as a built-in feature with priority `PRIORITY.BUILTIN`:

```javascript
import { FactcheckFeature } from './plugins/factcheck.js';

registry.registerFeature(new FactcheckFeature(ctx), PRIORITY.BUILTIN);
```

### Slash Command

The `/factcheck` command is declared in `getSlashCommands()`:

```javascript
getSlashCommands() {
    return [
        {
            command: '/factcheck',
            description: 'Verify claims with web search',
            placeholder: 'Claims to verify...',
        },
    ];
}
```

### AppContext Dependencies

FactcheckFeature uses these injected dependencies:

- `this.graph`: Add/update nodes and edges
- `this.canvas`: Render nodes, update content, viewport control
- `this.chat`: Send messages to LLM providers via sendMessage
- `this.modelPicker`: Get available models, current selection
- `this.modalManager`: Register and show factcheck modal
- `this.chatInput`: Clear input after execution
- `this.storage`: Check for Exa API key availability
- `this.saveSession()`: Persist after each verification
- `this.showToast()`: User notifications
- `this.buildLLMRequest()`: Used for refine-query calls

### NodeRegistry Registration

FactcheckNode is registered as a custom node type:

```javascript
NodeRegistry.register({
    type: 'factcheck',
    protocol: FactcheckNode,
    defaultSize: { width: 640, height: 480 },
});
```

### API Endpoints

The feature uses these backend endpoints:

- `/api/exa/search`: Exa-powered web search (when Exa key available)
- `/api/ddg/search`: DuckDuckGo search (fallback)
- `/api/refine-query`: Refine vague inputs into specific claims (optional)

## Error Handling

### Extraction Failure

If claim extraction fails:

- Display error in loading node
- Show "No claims extracted" message
- Allow user to add claims manually via modal

### Search Failure

If search fails for a claim:

- Mark claim as "error" status
- Show error explanation in the claim
- Continue with other claims
- Don't block entire verification

### Analysis Failure

If LLM verdict analysis fails:

- Mark claim as "unverifiable" status
- Show "Failed to analyze search results" explanation
- Continue with other claims

### Network Errors

Distinguished from other errors:

- Network timeout: Retry once, then mark as error
- API rate limit: Queue remaining claims, process when allowed
- AbortError: Graceful cancellation (user cancelled)

### Modal Cancellation

If user cancels before execution:

- Remove loading node from graph
- Clear internal state
- No factcheck node created

## CSS and Styling

Factcheck styling is distributed across multiple CSS files:

### modals.css

- `.factcheck-main-modal`: Main modal container
- `.factcheck-modal-subtitle`: Instructional text
- `.factcheck-claims-list`: Container for claim rows
- `.factcheck-claim-row`: Individual claim edit row
- `.factcheck-claim-input`: Textarea for claim editing
- `.factcheck-claim-remove`: Remove button
- `.factcheck-add-claim`: Add new claim section
- `.factcheck-selection-info`: Claim count and warnings
- `.factcheck-selection-count`: Count display
- `.factcheck-limit-warning`: Warning for many claims

### nodes.css

- `.factcheck-content`: Content wrapper
- `.factcheck-claims`: Claims container
- `.factcheck-claim`: Individual claim container
- `.factcheck-claim-header`: Clickable header with badge and text
- `.factcheck-badge`: Verdict badge emoji
- `.factcheck-claim-text`: Claim text display
- `.factcheck-toggle`: Expand/collapse indicator
- `.factcheck-details`: Expanded explanation and sources
- `.factcheck-sources`: Sources container with links

### Animation

- `.factcheck-claim.expanded .factcheck-details`: max-height transition for smooth accordion effect

## Testing Considerations

### Unit Tests

Key pure functions for testing:

- `getVerdictBadge(status)`: Returns correct emoji for each status
- `buildFactcheckContent(claimsData)`: Formats node content correctly
- `collectFactcheckClaimsFromModal()`: Extracts valid claims from modal inputs

### Integration Tests

Test files:

- `tests/test_factcheck_plugin.js`: FactcheckFeature plugin tests
- Tests for claim extraction parsing
- Tests for verdict response parsing

### E2E Tests

Relevant Cypress tests:

- `cypress/e2e/factcheck_modal.cy.js`: Modal interaction tests
- Tests for claim selection
- Tests for verification execution

### Manual Testing Scenarios

- Verify claims from typed input
- Verify claims from selected node
- Verify claims from numbered lists
- Test with Exa API key
- Test fallback without Exa key
- Test parallel verification completion
- Test accordion expand/collapse

## Open Questions & Future Decisions

### Resolved

1. **Parallel vs Sequential**: Parallel verification chosen for speed
2. **Search Backend**: Exa primary, DuckDuckGo fallback implemented
3. **Modal Confirmation**: Users must confirm claims before verification
4. **Node Editability**: Factcheck nodes are read-only to preserve integrity
5. **Source Limits**: Maximum 3 sources per claim to keep UI clean

### Deferred / Future

1. **Claim prioritization**: Allow users to order claims by importance
2. **Historical verification**: Re-verify claims against newer sources
3. **Batch operations**: Verify claims across multiple factcheck nodes
4. **Custom verdict criteria**: Allow users to define what makes something "verified"
5. **Citation format**: Support different citation styles (APA, MLA, etc.)
6. **Multi-language support**: Verify claims in non-English languages
7. **Trend analysis**: Show how verification results change over time
8. **Shareable reports**: Generate shareable factcheck reports

## References

- **HLD**: `/docs/high-level-design.md` - Context on fact-checking as core LLM feature
- **How-to**: `/docs/how-to/factcheck.md` - User documentation for the feature
- **Implementation**: `src/canvas_chat/static/js/plugins/factcheck.js` - Full source (1065 lines)
- **Node Types**: `src/canvas_chat/static/js/graph-types.js` - NodeType.FACTCHECK definition
- **Node Protocols**: `/docs/explanation/node-protocols.md` - FactcheckNode protocol documentation
- **Plugin API**: `/docs/reference/feature-plugin-api.md` - FeaturePlugin base class
- **Web Search**: `/docs/how-to/web-search.md` - Search functionality used by factcheck
- **E2E Tests**: `cypress/e2e/factcheck_modal.cy.js` - Modal interaction tests
- **Unit Tests**: `tests/test_factcheck_plugin.js` - Plugin tests
