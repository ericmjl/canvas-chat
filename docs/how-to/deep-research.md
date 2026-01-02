# How to conduct deep research

The `/research` command performs comprehensive research on a topic by querying multiple sources and synthesizing them into a detailed report.

## Prerequisites

You need an Exa API key configured in Settings:

1. Click the ⚙️ Settings button
2. Get an API key from [Exa](https://exa.ai/)
3. Paste it into the "Exa API Key" field
4. Click Save

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

Exa's research API:

1. **Plans the research** - Breaks down your topic into sub-questions
2. **Searches multiple sources** - Queries the web for relevant information
3. **Synthesizes findings** - Combines information from all sources into a coherent report
4. **Cites sources** - Includes links to the pages used

You'll see status updates as it progresses. Example status messages include:

- "Research started..."
- "Planning research..."
- "Searching sources..."
- "Synthesizing report..."

The exact messages may vary based on Exa's API responses.

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

Use `/research` when you want:

- A synthesized report combining multiple sources
- Comprehensive coverage of a topic
- Citation-backed analysis

## Limits

- Requires Exa API key (paid feature, costs $0.01-0.05 per research)
- Research takes 30-90 seconds to complete
- Cannot be stopped once started - Exa's Research API does not support cancellation of ongoing research tasks. Once initiated, research runs to completion.
- Wide nodes may overflow on small screens

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
