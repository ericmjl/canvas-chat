# Committee Architecture

This document explains the design decisions behind the LLM committee feature, which orchestrates multiple AI models to provide diverse perspectives on a question.

## Context

When making important decisions or exploring complex topics, getting a single AI's perspective may be insufficient. Different models have different strengths, training data, and biases. The committee feature was designed to:

1. Leverage the unique capabilities of different AI models
2. Identify consensus and disagreement among models
3. Provide users with a synthesized view of multiple perspectives
4. Make AI limitations more visible through multi-model comparison

## Design Decision

We implemented a **parallel multi-model consultation with optional peer review and chairman synthesis** pattern.

## User Flow

1. **User asks a question** via `/committee <question>`
2. **Configuration modal** appears where user selects:
   - 2-5 committee member models
   - 1 chairman model (for synthesis)
   - Whether to include peer review phase
3. **Opinions phase**: All models respond to the question in parallel
4. **Review phase** (optional): Each model reviews and ranks others' opinions
5. **Synthesis phase**: Chairman model analyzes all opinions (and reviews) and provides a final answer

All phases stream in real-time, creating nodes on the canvas as responses arrive.

## Architecture Components

### 1. Parallel Opinion Streaming

**Implementation:** `stream_single_opinion()` in `app.py`

Each committee member's opinion is streamed concurrently using:

- Python's `asyncio.create_task()` for parallelization
- `asyncio.Queue` for event communication
- Server-Sent Events (SSE) to stream to the frontend

Why parallel?

- Faster total time (3 models in ~10s vs ~30s sequential)
- All models receive the question simultaneously
- No model is influenced by others' opinions (independence)

### 2. Optional Peer Review

**Implementation:** `stream_single_review()` in `app.py`

When enabled, each model receives:

- The original question
- All other models' opinions (anonymized as "Opinion A", "Opinion B", etc.)
- Instructions to review, critique, and rank the opinions

Why optional?

- **Cost:** Review phase doubles the API calls (5 opinions → 5 reviews)
- **Time:** Adds 30-60 seconds to total duration
- **Value:** Most useful for high-stakes decisions, less useful for exploratory questions

### 3. Chairman Synthesis

**Implementation:** Final phase in `/api/committee` endpoint

The chairman model receives:

- The original question
- All committee opinions (with model names)
- All reviews (if review phase was enabled)

The chairman is prompted to:

- Identify areas of agreement
- Note significant disagreements
- Assess which perspectives are most accurate/helpful
- Provide a comprehensive final answer

Why a separate synthesis step?

- Avoids "tyranny of the majority" (chairman can disagree with consensus if justified)
- Provides meta-analysis (what does the pattern of agreement/disagreement tell us?)
- Single coherent answer (vs requiring user to read 3-5 separate opinions)

## Implementation Details

### Event Streaming Architecture

The committee uses SSE events to communicate progress:

```text
opinion_start → opinion_chunk* → opinion_done
review_start → review_chunk* → review_done
synthesis_start → synthesis_chunk* → synthesis_done
```

Frontend creates nodes progressively as each phase completes.

### Concurrency Management

Key technical challenge: Multiple async streams (3-5 opinions) need to:

1. Stream concurrently (not sequentially)
2. Send events to a single SSE response stream
3. Handle failures gracefully (one model failing doesn't break others)

Solution: `asyncio.Queue` as a shared event bus

- Each opinion task pushes events to the queue
- Main generator pulls from queue and yields SSE events
- Tasks continue even if one fails

### Error Handling

Robust failure modes:

- **One opinion fails:** Committee continues with remaining models; synthesis notes which models contributed
- **Review fails:** Reviews are optional; synthesis works without them
- **Synthesis fails:** User still has all individual opinions as fallback

### Graph Structure

Committee creates a specific graph pattern:

```text
HUMAN (question)
  ├─→ OPINION (model 1)
  ├─→ OPINION (model 2)
  └─→ OPINION (model 3)
        ├─→ REVIEW (model 1 reviews others)
        ├─→ REVIEW (model 2 reviews others)
        └─→ REVIEW (model 3 reviews others)
              └─→ SYNTHESIS (chairman's final answer)
```

Edge types:

- HUMAN → OPINION: `opinion` edge (how the question reached each model)
- OPINION → REVIEW: `review` edge (opinions being reviewed)
- OPINION/REVIEW → SYNTHESIS: `synthesis` edge (inputs to final answer)

## Alternatives Considered

### Sequential consultation (rejected)

Ask model 1, then show model 2 what model 1 said, etc.

**Advantages:**

- Models can build on each other's ideas
- More conversational/deliberative

**Disadvantages:**

- Slower (sequential = 3x longer for 3 models)
- Order bias (later models influenced by earlier ones)
- Lost model independence

### Voting system (rejected)

Each model votes yes/no on a proposition.

**Advantages:**

- Simple aggregation (majority wins)
- Clear decision output

**Disadvantages:**

- Only works for yes/no questions
- Doesn't capture nuance or reasoning
- Loses rich explanations

### Arena-style debate (rejected)

Models argue with each other across multiple rounds.

**Advantages:**

- More thorough exploration of ideas
- Weaknesses get challenged directly

**Disadvantages:**

- Very expensive (many back-and-forth rounds)
- Very slow (minutes to complete)
- Risk of models "agreeing to agree" or getting stuck

### Average/combine outputs (rejected)

Take the average of multiple model responses.

**Advantages:**

- Fully automated (no synthesis needed)
- Simple aggregation

**Disadvantages:**

- Doesn't work for text (what's the "average" of two paragraphs?)
- Loses individual perspectives
- No meta-analysis of agreement/disagreement

## Why This Architecture Works

1. **Independence:** Parallel opinions ensure models aren't anchored to others' responses
2. **Transparency:** User sees all opinions, not just a black-box aggregate
3. **Meta-analysis:** Synthesis highlights agreement/disagreement patterns
4. **Flexibility:** Optional review for when thoroughness matters
5. **Speed:** Parallelization keeps total time reasonable (<60s for 3 models)
6. **Cost-awareness:** Review is optional; users choose speed vs thoroughness

## Performance Characteristics

### Timing

- 2 models, no review: ~10-15 seconds
- 3 models, no review: ~10-20 seconds
- 3 models, with review: ~40-60 seconds
- 5 models, with review: ~60-90 seconds

Time is dominated by:

- Slowest model in each phase (parallelization limited by slowest member)
- Chairman synthesis (usually 10-20 seconds)

### Cost

- 3 models, no review: ~4-6 API calls (3 opinions + 1 synthesis)
- 3 models, with review: ~10-12 calls (3 opinions + 3 reviews + 3 inputs to synthesis + synthesis)
- 5 models, with review: ~20-25 calls

Cost-saving strategies:

- Use smaller models for opinions (GPT-4o-mini, Claude Haiku)
- Reserve large models for chairman
- Disable review for exploratory questions

### API Key Management

Each model requires its provider's API key:

- OpenAI models → `openai` key
- Anthropic models → `anthropic` key
- Google models → `google` key
- Groq models → `groq` key
- GitHub models → `github` key
- Ollama models → no key needed (local)

Frontend sends `api_keys` dict; backend routes each model to the correct key.

## Context Propagation

When user selects nodes or text before running `/committee`:

1. Frontend builds context string from selected content
2. Context is sent to `/api/refine-query` to improve the question
3. Both original and refined questions are shown to user
4. All committee members receive the refined question + conversation history

This enables conversational committees:

- "What do you think about this?" (where "this" = selected research paper)
- "Should we use this approach?" (where "this" = architecture discussion from earlier nodes)

## Future Enhancements

Potential improvements:

### Configurable synthesis prompts

Allow users to customize how the chairman synthesizes (focus on pros/cons, focus on consensus, etc.)

### Model expertise hints

Let users tag models with domains ("good at math", "good at creative writing") and have chairman weight opinions accordingly

### Iterative refinement

After synthesis, allow user to ask follow-up questions that trigger a second committee round

### Cost estimation

Show estimated API cost before starting committee

### Parallel synthesis

If multiple chairman candidates are selected, run multiple syntheses in parallel and let user compare

### Tournament bracket

For very large model sets (10+ models), run multiple committees and have winners face off

## Testing Committee Behavior

To verify the committee works correctly:

1. **Diverse opinions test:** Ask a controversial question ("Is tabs or spaces better?") to 3 different models. Verify they give different perspectives.

2. **Agreement test:** Ask a factual question with clear answer ("What is 2+2?"). Verify models agree and synthesis reflects consensus.

3. **Review quality test:** Enable review and verify reviews actually critique opinions (not just summarize them).

4. **Failure handling test:** Select a model with invalid API key. Verify committee continues with remaining models.

5. **Context propagation test:** Select a research node and run `/committee what are the implications?`. Verify models received research context (their opinions should reference it).

## Summary

The committee architecture balances:

- **Independence** (parallel opinions)
- **Thoroughness** (optional review)
- **Synthesis** (chairman meta-analysis)
- **Speed** (async parallelization)
- **Cost** (optional review, flexible model selection)
- **Transparency** (all opinions visible)

This design serves both exploratory use ("What do various AIs think?") and decision-making use ("Which option should I choose?") while keeping the system predictable, fast enough for interactive use, and cost-conscious.
