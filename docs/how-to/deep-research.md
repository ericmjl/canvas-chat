# How to conduct deep research

The `/research` command performs comprehensive research on a topic by querying multiple sources and synthesizing them into a detailed report.

## Prerequisites

**With Exa API key (recommended):**

- Higher quality, curated sources
- Faster research (30-90 seconds)
- Costs $0.01-0.05 per research

**Without Exa API key (free fallback):**

- Uses DuckDuckGo search + your LLM
- Slower (2-5 minutes)
- Broader but potentially noisier sources
- Free (only LLM token costs)

To configure Exa:

1. Click the ⚙️ Settings button
2. Get an API key from [Exa](https://exa.ai/)
3. Paste it into the "Exa API Key" field
4. Click Save

If you don't have an Exa key, `/research` will automatically use the DuckDuckGo fallback.

## Basic research

Type `/research` followed by your research topic:

```text
/research recent advances in CRISPR gene editing for treating sickle cell disease
```

Press Enter. Canvas Chat will:

1. Create a RESEARCH node
2. Stream a comprehensive report as it's generated
3. Cite sources automatically

The research process typically takes 30-90 seconds depending on the topic's complexity.

## How research works

**With Exa API key:**
Exa's research API handles the entire process:

1. **Plans the research** - Breaks down your topic into sub-questions
2. **Searches multiple sources** - Queries the web for relevant information
3. **Synthesizes findings** - Combines information from all sources into a coherent report
4. **Cites sources** - Includes links to the pages used

**With DuckDuckGo fallback (no Exa key):**
The system performs iterative research using your LLM:

1. **Generates search queries** - Converts your instructions into DuckDuckGo search terms
2. **Searches and fetches** - Finds pages and extracts content (3-5 iterations)
3. **Summarizes sources** - Your LLM creates tailored summaries for each page
4. **Expands queries** - Generates new queries to explore adjacent topics
5. **Synthesizes report** - Combines all summaries into a final report

You'll see status updates as it progresses. Example status messages include:

- "Generating initial search queries..."
- "Iteration 1/4: searching DuckDuckGo..."
- "Iteration 1: fetching 12 pages in parallel..."
- "Synthesizing final report..."

The exact messages depend on which provider is used.

## Context-aware research

When you select text or nodes before running `/research`, the AI refines your instructions based on that context.

### Example: Building on a conversation

1. Have a discussion about business ideas in several nodes
2. Select a node mentioning "sustainable fashion marketplace"
3. Type `/research market size and competitors`
4. The AI refines this to: *"Research market size and competitors for sustainable fashion marketplace, including industry trends and key players"*

The research node shows both your original instruction and the refined version.

## Research quality: Standard vs Pro

Exa offers two research models:

- **`exa-research`** (default) - Fast, good for most topics
- **`exa-research-pro`** - Slower, more comprehensive, better for complex topics

> **Future enhancement:** Pro mode (`exa-research-pro`) is not yet exposed in the UI. To use it, you would need to modify the API call in the code. This feature may be added in a future release.

## Working with research results

### Read the report

Research nodes are wider than normal nodes (500px) to accommodate formatted markdown reports. The report includes:

- An introduction to the topic
- Key findings organized by theme
- Supporting details with citations
- A conclusion or summary

### Citations and sources

Click any cited link to open the source in a new browser tab. Sources appear as markdown links inline: `[Source Name](url)`.

### Branch from findings

Select specific text in the research report and click **🌿 Branch** to create a highlight node. This lets you:

- Ask follow-up questions about a specific finding
- Compare findings from multiple research nodes
- Build a knowledge graph around key insights

### Continue the conversation

Reply to the research node to ask clarifying questions:

```text
Can you explain the third-generation CRISPR tools mentioned in the report?
```

The AI has access to the full research content and can elaborate on any section.

## Research positioning

Research nodes appear automatically:

- If you have nodes selected: research appears to the right
- If nothing is selected: research appears to the right of the most recent node

Research nodes are **500px wide** (vs 360px for normal nodes) to better display formatted reports.

## Tips for effective research

### Be specific but not narrow

✅ Good:

```text
/research quantum error correction techniques used in superconducting qubits, including surface codes and recent improvements
```

❌ Too vague:

```text
/research quantum computing
```

❌ Too narrow (use /search instead):

```text
/research exact page count of Nature paper 10.1038/12345
```

### Use context for follow-up research

After getting initial results, select the research node and run a follow-up:

```text
/research how could these techniques be applied to topological qubits?
```

The AI uses your first research as context for the second.

### Combine with other features

**Research → Matrix evaluation:**

1. Research multiple competing approaches
2. Select the research node
3. Run `/matrix compare these approaches against ease of implementation, scalability, and cost`

**Research → Committee:**

1. Get research findings
2. Run `/committee what are the biggest risks with this approach?`
3. Multiple AI models debate the risks based on your research

### When to use /research vs /search

Use `/search` when you want to:

- Browse multiple sources yourself
- Quickly find a specific page or fact
- See what information is available
- Search without an Exa API key (uses DuckDuckGo as fallback)

Use `/research` when you want:

- A synthesized report combining multiple sources
- Comprehensive coverage of a topic
- Citation-backed analysis

**Note:** `/research` works with or without an Exa API key. Without Exa, it uses a free DuckDuckGo-based fallback that performs iterative research using your LLM. The fallback is slower but produces comprehensive reports.

## Limits

**With Exa:**

- Costs $0.01-0.05 per research
- Takes 30-90 seconds to complete
- Can be stopped using the stop button in the node header

**With DuckDuckGo fallback:**

- Free (only LLM token costs)
- Takes 2-5 minutes (more API calls)
- May be rate-limited by DuckDuckGo (retries automatically)
- Quality depends on your LLM model
- Can be stopped using the stop button in the node header

**Both:**

- Wide nodes may overflow on small screens
- Can be stopped and resumed using the stop/continue buttons

## Troubleshooting

### "Research failed: 402 Payment Required"

- Your Exa account has run out of credits
- Add credits at [Exa](https://exa.ai/)

### Research returns very brief results

- Topic may be too narrow or too obscure
- Try rephrasing with more context
- Consider using `/search` for niche topics

### Sources are not clickable

- Check that the research completed successfully
- Sources should appear as markdown links `[text](url)`
- If plain URLs appear, the research may have been interrupted

### DuckDuckGo fallback returns irrelevant sources

- This may indicate rate limiting
- The system automatically retries with exponential backoff
- If you see "Warning: Only found X relevant sources", wait a few minutes and try again
- Consider adding an Exa API key for more reliable results

### Research report is cut off mid-sentence

- This can happen if the LLM hits token limits during synthesis
- The system detects truncation and adds a warning note
- Try rephrasing your research query to be more specific
- With Exa, this is less common as Exa handles synthesis internally
