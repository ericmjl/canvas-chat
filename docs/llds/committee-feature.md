# Low-Level Design: CommitteeFeature

**Created**: 2026-03-16
**Status**: Implementation
**Module**: CommitteeFeature (multi-LLM consultation)

## Context and Design Philosophy

The CommitteeFeature implements a multi-LLM consultation system that queries multiple AI models in parallel and synthesizes their responses into a coherent answer. This feature addresses the fundamental limitation of single-model AI interactions: different models have different strengths, training data, biases, and blind spots.

The design philosophy centers on four principles. First, independence is maintained through parallel opinion generation, ensuring no model is influenced by others' responses before providing its own perspective. Second, transparency keeps all individual opinions visible on the canvas, allowing users to see the full range of perspectives rather than a black-box aggregate. Third, optional depth is provided via an optional peer review phase where models critique each other's opinions before synthesis. Fourth, meta-analysis is delivered through a chairman synthesis step that identifies consensus, disagreement, and provides a coherent final answer.

## Technical Overview

### Slash Command Entry Point

The feature is accessed via the `/committee` slash command, which accepts a question as arguments. The command is registered in the FeatureRegistry and handled by the `handleCommittee` method in `CommitteeFeature`.

```text
/committee What are the pros and cons of using microservices vs monolithic architecture?
```

When invoked, the command:

1. Parses the question from command arguments
2. Checks for selected nodes to use as conversation context
3. Opens the Committee modal for model selection and configuration

### Modal for Model Selection

The Committee modal (`committee-main-modal`) presents a multi-step configuration interface:

1. **Question Display**: Shows the user's question (read-only, for reference)
2. **Persona Suggestions**: AI-generated persona suggestions based on the question (optional presets available)
3. **Committee Members**: 2-5 models with optional persona prompts
4. **Chairman Selection**: Separate model for synthesis
5. **Options**: Toggle for review phase and web grounding

The modal enforces validation: exactly 2-5 committee members are required, and the Execute button is disabled until valid.

### Persona System

Each committee member can optionally receive a persona prompt that shapes their perspective. The system provides two sources of personas:

**Static Presets** (8 built-in):

- Skeptical Scientist
- Optimistic Entrepreneur
- Cautious Risk Analyst
- Creative Brainstormer
- Devil's Advocate
- Pragmatic Engineer
- User Experience Advocate
- Ethical Reviewer

**Dynamic Suggestions**: An LLM generates 3 context-appropriate personas based on the question. These can be accepted (populating a new committee member) or manually edited.

## Node Types

The CommitteeFeature creates three distinct node types on the canvas:

### Opinion Nodes

Each committee member generates an opinion node with type `NodeType.OPINION`. These nodes contain:

- **Header**: Model name and persona (if any)
- **Content**: The model's response to the question
- **Metadata**: `{ model, persona }` stored in node data
- **Dimensions**: Default 640x480 pixels

Opinion nodes are created with "Waiting for..." placeholder content that updates as streaming begins.

### Review Nodes

When the "Include review stage" option is enabled, each model also generates a review node with type `NodeType.REVIEW`. These nodes contain:

- **Header**: "{Model} Review"
- **Content**: The model's critique of other opinions
- **Metadata**: `{ model, persona, reviewedOpinions: [...] }`
- **Edge**: Connected from the reviewer's opinion node

Review nodes are positioned below opinion nodes in the visual layout.

### Synthesis Node

The chairman model generates a synthesis node with type `NodeType.SYNTHESIS`. This node contains:

- **Header**: "Synthesis ({Chairman Name})"
- **Content**: Meta-analysis of all opinions (and reviews if enabled)
- **Metadata**: `{ model: chairmanModel }`
- **Edge**: Connected from all opinion nodes (or review nodes if enabled)

The synthesis node is the final node in the committee flow, positioned below all opinions and reviews.

## Edge Types

The CommitteeFeature creates three edge types to represent relationships between nodes:

| Edge Type            | From                 | To             | Meaning                             |
| -------------------- | -------------------- | -------------- | ----------------------------------- |
| `EdgeType.OPINION`   | Human (question)     | Opinion nodes  | How the question reached each model |
| `EdgeType.REVIEW`    | Opinion node         | Review node    | The opinion being reviewed          |
| `EdgeType.SYNTHESIS` | Opinion/Review nodes | Synthesis node | Inputs to final synthesis           |

## Execution Flow

### Phase 1: Setup and Web Grounding (Optional)

1. Create the human question node
2. If web grounding enabled:
    - Derive search query from question
    - Run web search
    - Append sources to question node
    - Inject search results into message context for all models

### Phase 2: Parallel Opinion Generation

All committee members generate opinions simultaneously:

```text
Promise.all([
  generateOpinion(node1, model1, messages),
  generateOpinion(node2, model2, messages),
  generateOpinion(node3, model3, messages),
])
```

Each opinion:

1. Injects persona as system prompt if provided
2. Registers with StreamingManager (enables stop/continue buttons)
3. Streams response to canvas in real-time
4. Updates graph on completion

The canvas shows a fan layout with opinion nodes spread horizontally below the question node.

### Phase 3: Parallel Review Generation (Optional)

If review is enabled, each model generates a review of all other opinions:

```text
Promise.all([
  generateReview(opinion1, model1, [opinion2, opinion3]),
  generateReview(opinion2, model2, [opinion1, opinion3]),
  generateReview(opinion3, model3, [opinion1, opinion2]),
])
```

Each review prompt includes:

- Original question context
- All other opinions (anonymized or labeled)
- Instruction to critique strengths, weaknesses, and disagreements

Review nodes are positioned in a second row below the opinion nodes.

### Phase 4: Chairman Synthesis

After all opinions (and reviews) complete, the chairman model synthesizes:

1. Receives all opinions (and reviews if enabled)
2. Receives prompt to identify consensus and disagreements
3. Streams synthesis to final node
4. Connects all source nodes to synthesis node

### Phase 5: Web Sources Appended

If web grounding was enabled, sources are appended to:

- Each opinion node
- Synthesis node

This ensures citations are visible at every level.

## Streaming and Abort Handling

### StreamingManager Integration

Each opinion, review, and synthesis generation registers with StreamingManager:

```javascript
this.streamingManager.register(nodeId, {
    abortController,
    featureId: 'committee',
    context: { model, modelName, messages, index, nodeId, persona },
    onContinue: async (nodeId, state) => {
        await this.continueOpinion(nodeId, state.context);
    },
});
```

This enables:

- **Stop button**: Appears in node header, aborts this specific stream
- **Continue button**: Appears after stopping, resumes from stored content
- **Parallel abort**: Each stream has independent abort controller

### Continue/Resume Functionality

The feature implements full continue capability for all three phases:

- `continueOpinion()`: Appends "Please continue your response" to messages
- `continueReview()`: Builds continuation with original review context
- `continueSynthesis()`: Continues synthesis with all opinions context

Each continue method:

1. Retrieves current node content
2. Builds messages including that content
3. Continues streaming from where it left off
4. Updates both canvas and graph

### Abort Handling

The `abort()` method handles user-initiated cancellation:

```javascript
abort() {
    for (const [nodeId, abortController] of this._activeCommittee.abortControllers) {
        abortController.abort();
        this.streamingManager.unregister(nodeId);
    }
}
```

Aborts are handled gracefully:

- Aborted opinions resolve with empty string (allowing others to continue)
- Aborted reviews similarly resolve, preventing cascade failures
- Synthesis continues if it has at least one opinion to work with

## Data Structures

### Committee Data State

```javascript
{
    question: string,           // User's question
    context: string | null,       // Selected node content
    members: Array<{              // Committee members
        model: string,            // Model ID (e.g., "openai/gpt-4o")
        persona: string           // Persona prompt (optional)
    }>,
    chairmanModel: string,        // Chairman model ID
    includeReview: boolean,      // Whether review phase enabled
    personaSuggestions: Array,    // AI-generated personas
}
```

### Active Committee State

```javascript
{
    opinionNodeIds: string[],     // IDs of opinion nodes
    reviewNodeIds: string[],      // IDs of review nodes
    synthesisNodeId: string,      // ID of synthesis node
    abortControllers: Map<string, AbortController>,
}
```

### Node Metadata

Opinion nodes store:

```javascript
{
    model: string,    // e.g., "openai/gpt-4o"
    persona: string,  // e.g., "You are a skeptical scientist..."
}
```

Review nodes store:

```javascript
{
    model: string,
    persona: string,
    reviewedOpinions: number[],  // Indices of opinions reviewed
}
```

Synthesis nodes store:

```javascript
{
    model: string,   // Chairman model
}
```

## Layout Algorithm

The committee uses a fan layout calculated in `executeCommittee()`:

```javascript
const basePos = humanNode.position;
const spacing = 380;
const verticalOffset = 200;
const totalWidth = (members.length - 1) * spacing;
const startX = basePos.x - totalWidth / 2;

// Opinion nodes: row 1
position: { x: startX + i * spacing, y: basePos.y + verticalOffset }

// Review nodes: row 2 (if enabled)
position: { x: startX + i * spacing, y: basePos.y + verticalOffset * 2 }

// Synthesis node: centered below
position: { x: basePos.x, y: basePos.y + verticalOffset * (includeReview ? 3 : 2) }
```

After layout is calculated:

1. Nodes are created and added to graph
2. Edges are created connecting question to opinions
3. Canvas renders nodes
4. Viewport zooms to fit entire committee

## Integration Points

### FeatureRegistry Registration

CommitteeFeature is registered as a built-in feature with priority `PRIORITY.BUILTIN`:

```javascript
import { CommitteeFeature } from './plugins/committee.js';

registry.registerFeature(new CommitteeFeature(ctx), PRIORITY.BUILTIN);
```

### Slash Command

The `/committee` command is declared in `getSlashCommands()`:

```javascript
getSlashCommands() {
    return [
        {
            command: '/committee',
            description: 'Ask multiple LLMs and synthesize their perspectives',
            placeholder: 'Your question for the committee...',
        },
    ];
}
```

### AppContext Dependencies

CommitteeFeature uses these injected dependencies:

- `this.graph`: Add/update nodes and edges
- `this.canvas`: Render nodes, update content, viewport control
- `this.chat`: Send messages to LLM providers
- `this.modelPicker`: Get available models, current selection
- `this.modalManager`: Register and show committee modal
- `this.streamingManager`: Register streaming, show stop/continue buttons
- `this.chatInput`: Clear input after execution
- `this.storage`: Track recently used models
- `this.saveSession()`: Persist after each phase
- `this.showToast()`: User notifications
- `this.buildLLMRequest()`: Used for web search query derivation

## Error Handling

### Opinion Failure

If one opinion fails:

- Committee continues with remaining models
- Synthesis receives available opinions only
- Failed node shows error message
- Other streams continue unaffected

### Review Failure

If review fails:

- Error shown in review node
- Synthesis proceeds without that review
- Other reviews continue

### Synthesis Failure

If synthesis fails:

- All opinions remain visible and usable
- User can read individual opinions as fallback
- Error shown in synthesis node

### Network/Abort Errors

Distinguished from other errors:

- `AbortError`: Graceful cancellation, resolves with empty content
- Other errors: Logged, shown in node, may affect downstream phases

## CSS and Styling

Committee modal styles are defined in `modals.css` with these key classes:

- `.committee-question-group`: Question textarea
- `.committee-suggestions-*`: Persona suggestion cards
- `.committee-members-*`: Member configuration rows
- `.committee-member-row`: Individual member configuration
- `.committee-member-model`: Model dropdown
- `.committee-member-persona`: Persona input with preset dropdown
- `.committee-options-group`: Checkboxes for review and web grounding
- `.committee-chairman-group`: Chairman model selector

## Testing Considerations

### Unit Tests

Key pure functions for testing:

- `formatSourcesSection()`: Formats web search results as markdown

### Integration Tests

Test files:

- `tests/test_committee_plugin.js`: CommitteeFeature plugin tests
- `tests/test_committee_*.js` (if created): Specific phase tests

### E2E Tests

Relevant Cypress tests:

- Tests for modal interactions
- Tests for streaming behavior
- Tests for abort handling

## Open Questions & Future Decisions

### Resolved

1. **Parallel vs Sequential**: Parallel was chosen for speed and independence
2. **Optional Review**: Review is optional to balance cost vs thoroughness
3. **Persona Sources**: Both static presets and dynamic suggestions implemented
4. **Web Grounding**: Optional feature to provide current information to all models

### Deferred / Future

1. **Configurable synthesis prompts**: Allow customizing chairman instructions
2. **Model expertise hints**: Tag models with domains, weight opinions accordingly
3. **Cost estimation**: Show estimated API cost before starting committee
4. **Multiple chairmen**: Run parallel syntheses with different chairmen
5. **Follow-up committees**: Iterative refinement after initial synthesis
6. **Tournament bracket**: Large model sets (10+) compete in rounds

## References

- **HLD**: `/docs/high-level-design.md` - Context on multi-LLM as a core feature
- **Explanation**: `/docs/explanation/committee-architecture.md` - Design rationale and alternatives
- **How-to**: `/docs/how-to/llm-committee.md` - User documentation
- **Implementation**: `src/canvas_chat/static/js/plugins/committee.js` - Full source
- **Node Types**: `src/canvas_chat/static/js/graph-types.js:235-237`
- **Edge Types**: `src/canvas_chat/static/js/graph-types.js:304-306`
- **Default Sizes**: `src/canvas_chat/static/js/graph-types.js:265-267`
