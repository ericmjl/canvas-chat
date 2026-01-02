# How to use the LLM committee feature

The `/committee` command consults multiple AI models in parallel, optionally has them review each other's responses, then synthesizes their perspectives into a final answer.

## When to use a committee

Committees are useful when:

- You want multiple perspectives on a complex question
- Different models might have different strengths (reasoning, creativity, domain knowledge)
- You're making an important decision and want diverse viewpoints
- You want to identify areas of agreement and disagreement among AIs

## Prerequisites

You need API keys configured for the models you want to use:

1. Click the ⚙️ Settings button
2. Add API keys for providers (OpenAI, Anthropic, Google, Groq, GitHub)
3. Or use Ollama for local models (no API key needed)

Each model you select must have a valid API key for its provider.

## Basic committee usage

Type `/committee` followed by your question:

```text
/committee What are the main risks of using microservices architecture for a small startup?
```

Press Enter. A modal appears where you can:

1. **Edit the question** if needed
2. **Select committee members** (2-5 models)
3. **Choose a chairman model** (synthesizes the final answer)
4. **Enable review phase** (optional, slower but more thorough)

Click "Start Committee" to begin.

## Committee configuration

### Selecting committee members

The modal shows all available models as checkboxes. By default, Canvas Chat pre-selects:

- Your currently selected model
- Up to 2 other recently used models

**Requirements:**

- Minimum: 2 models
- Maximum: 5 models

**Tips for selection:**

- Mix model families for diversity (e.g., GPT-4, Claude, Gemini)
- Include both large and small models (small models run faster)
- For technical questions, include models known for reasoning (Claude, o1)
- For creative questions, include models known for creativity

### Choosing a chairman

The chairman model receives all committee opinions and synthesizes a final answer. Choose a model that's good at:

- Analyzing multiple perspectives
- Identifying consensus and disagreement
- Providing balanced summaries

**Recommendation:** Use a large, capable model (GPT-4o, Claude Sonnet 4) as chairman, even if smaller models serve on the committee.

### Review phase (optional)

When enabled, the committee process includes an extra step:

1. All models provide their initial opinions (as usual)
2. Each model reviews and ranks the other opinions
3. The chairman sees both opinions and reviews when synthesizing

**Enable review when:**

- The question is particularly complex
- You want to see how models critique each other
- Time is not a constraint (review adds 30-60 seconds)

**Disable review when:**

- You want faster results
- The question is straightforward
- Cost is a concern (review doubles the API calls)

## How the committee works

### Phase 1: Gathering opinions

All selected models respond to your question in parallel. You'll see:

```text
[OPINION] GPT-4o: streaming response...
[OPINION] Claude Sonnet 4: streaming response...
[OPINION] Gemini 1.5 Pro: streaming response...
```

Each model's opinion streams in real-time, appearing in its own OPINION node on the canvas.

### Phase 2: Reviews (optional)

If enabled, each model reviews the others' opinions:

```text
[REVIEW] GPT-4o reviewing other opinions...
[REVIEW] Claude Sonnet 4 reviewing other opinions...
```

Reviews include:

- Strengths of each opinion
- Weaknesses or gaps
- Ranking from best to worst

### Phase 3: Chairman synthesis

The chairman model receives all opinions (and reviews, if applicable) and synthesizes:

```text
[SYNTHESIS] Claude Opus 4: synthesizing final answer...
```

The synthesis typically includes:

- Areas of agreement among models
- Points of disagreement and their significance
- The chairman's assessment of the most accurate/helpful answer
- A comprehensive final recommendation

## Working with committee results

The canvas will show:

1. **Your question node** (HUMAN type)
2. **Opinion nodes** (one per committee member)
3. **Review nodes** (if review phase was enabled)
4. **Synthesis node** (the final answer)

All nodes are connected with edges showing the flow:

- Question → Opinions (solid lines)
- Opinions → Reviews (dashed lines)
- Opinions/Reviews → Synthesis (solid lines)

### Reading the synthesis

The synthesis node contains the chairman's analysis. It should answer:

- Where did models agree?
- Where did they disagree, and why?
- What's the recommended answer based on all perspectives?

### Follow-up questions

Reply to the synthesis node to ask follow-up questions:

```text
Can you elaborate on the disagreement about database scaling?
```

The AI has access to all committee opinions and can reference specific model perspectives.

### Branching from opinions

Select text from any opinion or review node and click **🌿 Branch** to:

- Ask a model to elaborate on a specific point
- Challenge an assumption in an opinion
- Explore a disagreement in depth

## Context-aware committees

When you select text or nodes before running `/committee`, the AI refines your question based on that context.

### Example: Building on research

1. Run `/research microservices architecture trade-offs`
2. Read the research report
3. Select the research node
4. Type `/committee should we use this for our startup?`
5. The AI refines to: *"Should a small startup use microservices architecture for their initial product, considering the trade-offs discussed in the research?"*

All committee members receive the research context, leading to more informed opinions.

## Tips for effective committees

### Ask clear, scoped questions

✅ Good:

```text
/committee For a Python data pipeline processing 10M records/day, should we use Apache Spark or stick with pandas + multiprocessing?
```

❌ Too vague:

```text
/committee which technology is better?
```

### Use review for high-stakes decisions

Enable review when:

- Making architectural decisions
- Evaluating business strategy
- Analyzing security/privacy concerns
- Choosing between alternatives with significant trade-offs

### Mix model strengths

**Reasoning-heavy questions:**

- Include: Claude Sonnet 4, o1, Gemini 1.5 Pro
- Chairman: Claude Opus 4

**Creative questions:**

- Include: GPT-4o, Claude 3.5 Sonnet, Gemini
- Chairman: GPT-4o

**Coding questions:**

- Include: GPT-4o, Claude 3.5 Sonnet, Llama models
- Chairman: Claude Sonnet 4

### Manage costs

Committee runs can be expensive:

- 3 models without review: ~3-5 API calls
- 3 models with review: ~7-10 API calls
- 5 models with review: ~16-20 API calls

**Cost-saving strategies:**

- Use smaller models for opinions (GPT-4o-mini, Haiku)
- Reserve large models for chairman role
- Disable review for exploratory questions
- Use Ollama local models (free) as some committee members

## Limits

- Minimum 2 committee members, maximum 5
- All models must have valid API keys (except Ollama)
- Cannot stop committee once started (let it complete or refresh the page)
- Large committees with review can take 2-3 minutes to complete

## Troubleshooting

### "At least 2 committee models required"

- You must select at least 2 models
- Click checkboxes to select more models

### "API key missing for [provider]"

- One of your selected models needs an API key
- Go to Settings and add the missing key, or deselect that model

### One opinion fails but others succeed

- The committee continues with working models
- The failed model's opinion won't appear
- Synthesis will note which models contributed

### Committee stuck on "Gathering opinions..."

- Check browser console for errors (F12)
- One model may be timing out (wait up to 60 seconds)
- Refresh the page if it exceeds 2 minutes

## Advanced: Combining with other features

### Committee → Matrix

After getting diverse opinions, evaluate them systematically:

1. Run `/committee` on a question
2. Select all opinion nodes
3. Run `/matrix compare these opinions against correctness, practicality, and clarity`

### Research → Committee → Decision

Full decision-making workflow:

1. `/research` to gather comprehensive information
2. `/committee` to get multiple AI perspectives on the research
3. Select synthesis + key opinions
4. Ask final clarifying questions
5. Make informed decision based on diverse viewpoints

### Multiple committees

For complex decisions, run sequential committees:

1. First committee: "What are the main options for solving X?"
2. Second committee: "Given these options, what are the risks of option A?"
3. Third committee: "Should we pursue option A or B given these trade-offs?"

Each committee builds on the previous, creating a decision tree.
