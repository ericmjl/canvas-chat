# FlashcardsFeature Low-Level Design

**Project:** Canvas-Chat
**Created:** 2026-03-16
**Status:** Implementation
**Related HLD:** `/docs/high-level-design.md`

## Context and Design Philosophy

The FlashcardsFeature exists to transform static content from LLM conversations into active learning tools. When users receive explanations, tutorials, or summaries from LLMs, the information is often consumed once and forgotten. Spaced repetition transforms this passive consumption into durable learning.

The design philosophy centers on three principles:

1. **Seamless extraction** - Flashcards are generated directly from existing content nodes. Users select a node and request flashcards without copying/pasting or switching contexts. The generation is grounded in the selected content, ensuring cards test actual knowledge from the source.

2. **Minimal friction review** - When flashcards are due, users receive a non-intrusive toast notification. The review flow is self-contained in a modal: see question, type answer, get immediate feedback via LLM grading, apply SM-2 scheduling. No external apps or accounts required.

3. **Transparent scheduling** - The SM-2 algorithm runs entirely client-side. Users can see card status (New, Due, Learning) directly on the node. There's no "black box" - the next review date is computable from the node's SRS metadata.

This feature directly supports the "Rich LLM Features" principle from the HLD: "Flashcards - Generate spaced-repetition cards from content."

## Technical Details

### SM-2 Spaced Repetition Algorithm

The implementation follows the standard SM-2 algorithm with minor adaptations for web use:

**Quality Ratings:**

- `0-2` = Fail (complete blackout to serious difficulty)
- `3` = Hard (correct with significant difficulty)
- `4` = Good (correct with some hesitation)
- `5` = Easy (perfect response)

**Algorithm Implementation:**

```javascript
function applySM2(srs, quality) {
    const result = { ...srs };

    if (quality < 3) {
        // Failed: reset to beginning
        result.repetitions = 0;
        result.interval = 1;
    } else {
        // Passed: calculate new interval
        if (result.repetitions === 0) {
            result.interval = 1;
        } else if (result.repetitions === 1) {
            result.interval = 6;
        } else {
            result.interval = Math.round(result.interval * result.easeFactor);
        }

        // Update ease factor based on quality
        result.easeFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
        result.easeFactor = Math.max(1.3, result.easeFactor); // Minimum 1.3
        result.repetitions++;
    }

    result.lastReviewDate = new Date().toISOString();
    result.nextReviewDate = new Date(Date.now() + result.interval * 86400000).toISOString();

    return result;
}
```

**Interval Progression:**

| Repetitions | Interval (days)       |
| ----------- | --------------------- |
| 0 → 1       | 1                     |
| 1 → 2       | 6                     |
| 2+          | interval × easeFactor |

**Ease Factor Range:** Minimum 1.3, default 2.5. Higher values indicate easier cards.

**Due Date Calculation:** A card is due when `nextReviewDate <= now`. New cards (no SRS data) are always due.

### Flashcard Node Structure

Flashcard nodes store their state in the graph's Yjs CRDT:

```javascript
{
    id: string,                    // UUID
    type: 'flashcard',
    content: string,               // Question (front of card)
    back: string,                  // Answer (back of card)
    srs: {
        easeFactor: number,        // Default 2.5, min 1.3
        interval: number,          // Days until next review
        repetitions: number,       // Successful review count
        nextReviewDate: string,    // ISO timestamp
        lastReviewDate: string     // ISO timestamp
    },
    position: { x: number, y: number },
    width: number,                 // Default 400
    height: number,                // Default 280
    created_at: number,
    tags: string[],
    title: string | null,
    summary: string | null,
    model: string | null
}
```

### Two-Component Architecture

The flashcard feature combines two distinct plugin concepts:

1. **FlashcardNode** (Level 1 - Custom Node Type): Extends `BaseNode` protocol. Handles rendering, status display, flip animation, edit fields. Registered with `NodeRegistry`.

2. **FlashcardFeature** (Level 2 - Feature Plugin): Extends `FeaturePlugin`. Handles flashcard generation, grading, review workflow, and due card tracking. Registered with `FeatureRegistry`.

This separation follows the plugin architecture guidelines: node rendering logic stays with the node type, while complex workflows (generation, grading, review) stay with the feature.

### FlashcardNode Rendering

The FlashcardNode protocol renders the card with SRS status:

```javascript
renderContent(canvas) {
    // Determine SRS status for display
    let statusClass = 'new';
    let statusText = 'New';
    if (this.node.srs?.nextReviewDate) {
        const reviewDate = new Date(this.node.srs.nextReviewDate);
        if (reviewDate <= new Date()) {
            statusClass = 'due';
            statusText = 'Due';
        } else {
            statusClass = 'learning';
            const daysUntil = Math.ceil((reviewDate - now) / 86400000);
            statusText = daysUntil === 1 ? 'Due tomorrow' : `Due in ${daysUntil} days`;
        }
    }

    return `
        <div class="flashcard-container">
            <div class="flashcard-status ${statusClass}">${statusText}</div>
            <div class="flashcard-card">
                <div class="flashcard-front">...</div>
                <div class="flashcard-back">...</div>
            </div>
        </div>
    `;
}
```

### Node Actions

FlashcardNode provides these actions in the action bar:

- **Flip Card** - Toggle CSS class to reveal answer (keyboard: `f`)
- **Review Card** - Open review modal for single card
- **Edit Content** - Open edit modal with question and answer fields
- **Copy** - Copy card content to clipboard
- **Reply** - Create a reply node

## Flashcard Generation Workflow

### Trigger: Create Flashcards Button

Flashcards are created from content nodes via the "Create Flashcards" button that appears on content nodes (AI responses, notes, summaries). The flow:

1. User clicks "Create Flashcards" button on a content node
2. Canvas emits `createFlashcards` event
3. `FlashcardFeature.handleCreateFlashcards()` is invoked with the source node ID

### Generation Modal

The generation modal (`flashcard:generation`) provides:

- **Number of cards** - Input (1-10, default 5)
- **Focus/angle** - Optional textarea for guiding generation (e.g., "focus on definitions")
- **Generate button** - Triggers LLM generation
- **Candidate list** - Shows generated cards with:
  - Checkbox for selection
  - Question/answer display
  - Edit button for modification
- **Accept Selected** - Creates flashcard nodes from selected candidates

### LLM Prompt for Generation

```javascript
buildFlashcardPrompt({ content, count, focus, existingCards }) {
    return `Based on the following content, generate exactly ${count} flashcards for spaced repetition learning.
Each flashcard should test a key concept, fact, or relationship grounded in the content.

Focus/angle: ${focus || '(none)'}

Rules:
- Ground every question and answer strictly in the provided content
- Keep answers concise (1-2 sentences)
- Return ONLY a JSON array with no additional text
- Use the format: [{"front": "question", "back": "concise answer"}, ...]
${existingCardsSection}
Content:
${content}`;
}
```

### Node Creation

When cards are accepted:

1. Each card becomes a `FlashcardNode` with:
    - `content` = question
    - `back` = answer
    - `srs` = initial SRS data (interval: 0, easeFactor: 2.5, repetitions: 0)
2. Nodes are positioned in a row below the source node
3. Edges of type `GENERATES` connect source node to each flashcard
4. Session saves automatically

## Review Workflow

### Due Card Detection

On app load, `FlashcardFeature.checkDueFlashcardsOnLoad()` runs:

```javascript
function isFlashcardDue(card) {
    if (card.type !== NodeType.FLASHCARD) return false;
    if (!card.srs || !card.srs.nextReviewDate) return true; // New card
    return new Date(card.srs.nextReviewDate) <= new Date();
}
```

### Toast Notification

If due cards exist, a toast appears:

- Message: "You have N card(s) due for review"
- "Review Now" button - Opens review modal
- "Later" button - Dismisses toast (auto-dismisses after 10 seconds)

### Review Modal

The review modal (`flashcard:review`) provides:

- **Progress indicator** - "1/5", "2/5", etc.
- **Question display** - Shows the flashcard question
- **Answer input** - Textarea for user's answer
- **Submit button** - Grades the answer via LLM
- **Result section** (shown after submit):
  - Correct answer display
  - Verdict (Correct / Partially Correct / Incorrect)
  - LLM explanation
  - Override buttons ("I knew this" / "I didn't know this")
- **Next button** - Applies SM-2 and moves to next card

### LLM Grading

The grading prompt considers a "strictness" setting (stored in localStorage):

- **Lenient** - Accepts paraphrasing, synonyms, general gist
- **Medium** (default) - Requires key concepts, accepts terminology differences
- **Strict** - Requires precise terminology, complete coverage

```javascript
const prompt = `You are grading a flashcard answer. Compare the user's answer to the correct answer...

Question: ${card.content}
Correct Answer: ${card.back}
User's Answer: ${userAnswer}

Respond with ONLY a JSON object:
{"correct": true/false, "partial": true/false, "explanation": "brief explanation"}

${gradingRules}`;
```

The LLM returns structured JSON which determines:

- Quality 4 (Good) for correct
- Quality 3 (Hard) for partial
- Quality 1 (Fail) for incorrect

### SM-2 Application

After grading (or override), `handleReviewNext()` applies SM-2:

```javascript
const quality = this.reviewState.currentQuality || 4;
const currentSrs = card.srs || { interval: 0, easeFactor: 2.5, repetitions: 0 };
const newSrs = applySM2(currentSrs, quality);
this.graph.updateNode(cardId, { srs: newSrs });
this.canvas.renderNode(updatedCard); // Re-render to show new status
```

### Review Completion

When all cards are reviewed:

1. Modal closes
2. Session saves
3. Toast shows "Reviewed N cards"
4. Nodes re-render with updated SRS status

## Due Cards Tracking

### Storage Location

SRS data is stored directly on each FlashcardNode in the CRDT graph:

```javascript
// In graph Y.Map
node.set('srs', {
    easeFactor: 2.5,
    interval: 6,
    repetitions: 2,
    nextReviewDate: '2026-03-25T00:00:00.000Z',
    lastReviewDate: '2026-03-19T00:00:00.000Z',
});
```

### Persistence

SRS data persists with the session via IndexedDB. No additional storage mechanism required.

### Query Functions

Two pure functions in `utils.js` enable due card queries:

```javascript
function isFlashcardDue(card) { ... }
function getDueFlashcards(nodes) { ... }
```

Used by:

- `checkDueFlashcardsOnLoad()` - App startup
- `startFlashcardReview()` - "Review All" feature

## Integration Points

### FeatureRegistry Registration

FlashcardFeature is registered as a built-in feature (no slash commands):

```javascript
{
    id: 'flashcards',
    feature: FlashcardFeature,
    slashCommands: [], // Event-driven, no slash commands
    priority: PRIORITY.BUILTIN
}
```

### Canvas Event Handlers

FlashcardFeature provides canvas event handlers:

```javascript
getCanvasEventHandlers() {
    return {
        createFlashcards: this.handleCreateFlashcards.bind(this),
        reviewCard: this.reviewSingleCard.bind(this),
        flipCard: this.handleFlipCard.bind(this),
    };
}
```

### Modal Registration

Two modals are registered in `onLoad()`:

1. **Generation Modal** (`flashcard:generation`): Flashcard creation UI
2. **Review Modal** (`flashcard:review`): Review session UI

## Limits and Constraints

| Limit                     | Value         | Rationale                                               |
| ------------------------- | ------------- | ------------------------------------------------------- |
| Cards per generation      | 10 max        | Prevents overwhelming API costs; user can generate more |
| Answer length for grading | ~50 words max | LLM grading degrades with very long inputs              |
| Ease factor minimum       | 1.3           | Prevents cards from becoming too frequent               |
| Toast auto-dismiss        | 10 seconds    | Non-intrusive but allows time to notice                 |

## Open Questions & Future Decisions

### Resolved (Implementation Complete)

1. ✅ **No slash command** - Flashcards are triggered via button on content nodes, not `/flashcards`. This keeps the UI cleaner and makes generation more contextual (source node is explicit).

2. ✅ **LLM grading** - Answers are graded by the LLM rather than simple string matching. This allows partial credit and handles paraphrasing.

3. ✅ **Strictness setting** - Users can choose lenient/medium/strict grading via settings modal.

4. ✅ **Edit after creation** - FlashcardNode provides custom edit fields for question and answer.

5. ✅ **Override buttons** - Users can manually mark correct/incorrect regardless of LLM verdict.

### Deferred / Future Considerations

1. **Export/Import** - Flashcard decks could be exported as JSON for backup or import from Anki format.

2. **Deck organization** - Currently all flashcards exist in a flat list. Could add tagging or folders for organization.

3. **Statistics** - Track review history over time: accuracy rate, cards mastered, time spent. Display in a "stats" view.

4. **Cram mode** - Option to review cards regardless of due date (useful before exams).

5. **Audio pronunciation** - Text-to-speech for questions and answers (useful for language learning).

6. **Image support** - Allow images on cards (currently text-only).

7. **Multi-side cards** - Cards with more than 2 sides (e.g., front → back1 → back2 → ...).

## References

### High-Level Design

- `/docs/high-level-design.md` - Core canvas-chat architecture, node types, plugin system

### Implementation

**Frontend:**

- `src/canvas_chat/static/js/plugins/flashcards.js` - Complete FlashcardFeature implementation
- `src/canvas_chat/static/js/plugins/flashcard-node.js` - FlashcardNode protocol
- `src/canvas_chat/static/js/graph-types.js` - `FlashcardNode` typedef and factory functions
- `src/canvas_chat/static/js/utils.js` - `applySM2()`, `isFlashcardDue()`, `getDueFlashcards()`
- `src/canvas_chat/static/js/feature-registry.js` - Feature registration
- `src/canvas_chat/static/css/nodes.css` - Flashcard node styles

**Tests:**

- `tests/test_flashcards.js` - SM-2 algorithm tests, due detection tests, FlashcardNode tests
- `tests/test_flashcards_plugin.js` - FlashcardFeature plugin tests

### Related Features

- Node protocols: `src/canvas_chat/static/js/node-protocols.js`
- Storage: `src/canvas_chat/static/js/storage.js` (strictness setting)
- Chat: `src/canvas_chat/static/js/chat.js` (LLM grading calls)
