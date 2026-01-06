# How to search the web

The `/search` command lets you search the web and bring results directly into your canvas as nodes you can explore and discuss.

## Search providers

Canvas Chat supports two search providers:

| Provider | API Key Required | Features |
|----------|------------------|----------|
| **Exa** | Yes | Neural search, content extraction, richer snippets |
| **DuckDuckGo** | No | Basic web search, free fallback |

If you have an Exa API key configured, searches use Exa. Otherwise, searches automatically fall back to DuckDuckGo.

## Setting up Exa (optional)

For richer search results with content extraction:

1. Click the Settings button
2. Get an API key from [Exa](https://exa.ai/)
3. Paste it into the "Exa API Key" field
4. Click Save

## Basic search

Type `/search` followed by your query in the chat input:

```text
/search latest research on mRNA vaccines
```

Press Enter. Canvas Chat will:

1. Create a SEARCH node showing your query
2. Call the Exa API to find relevant results
3. Create REFERENCE nodes for each search result (up to 5)
4. Connect them to the search node with dashed lines

Each reference node shows:

- The page title
- The URL
- A snippet of the content
- Published date and author (when available)

## Context-aware search

When you select text or nodes before searching, Canvas Chat uses that context to refine your query.

### Example: Vague queries with context

1. In a conversation about quantum computing, select a node that mentions "Toffoli gates"
2. Type `/search how does this work?`
3. The AI refines your vague query to: *"how Toffoli gate CCNOT quantum computing works"*

The search node will show both your original query and the refined version.

### Why this matters

Without context, "how does this work?" is too vague to search. By providing context (the selected node), the AI resolves pronouns like "this" into specific technical terms, producing better search results.

## Working with search results

### Read a snippet

Click any REFERENCE node to see the title, URL, and preview text.

### Fetch full content

Click the **"Fetch & Summarize"** button on a reference node to:

1. Fetch the full page content via Exa
2. Create a FETCH_RESULT node with the complete text
3. Generate an AI summary automatically

This creates two new nodes connected to the reference:

- **Fetch result** (full content as markdown)
- **Summary** (concise AI-generated summary)

### Reply to results

Select one or more reference nodes and type in the chat input to ask questions about those specific results. The AI will use the snippets as context.

For deeper analysis, fetch the full content first, then ask questions.

## Search positioning

Search nodes are positioned automatically:

- If you have nodes selected: search appears to the right of them
- If nothing is selected: search appears to the right of the most recent leaf node
- Reference nodes fan out to the right of the search node

## Tips

**Use specific queries** for better results:

- ✅ Good: `/search transformer attention mechanism pytorch implementation`
- ❌ Vague: `/search machine learning`

**Combine with context** for conversational searches:

1. Discuss a topic in several nodes
2. Select the relevant nodes
3. Type `/search what are alternatives?` — the AI resolves "alternatives" based on your conversation

**Fetch selectively** - Don't fetch all results. Read the snippets first, then fetch only the most promising 1-2 pages to avoid clutter.

**Use in research workflows:**

1. Start with `/search` to find sources
2. Fetch full content for 2-3 best results
3. Use `/research` for comprehensive synthesis (see [How to conduct deep research](deep-research.md))

## Limits

- Maximum 5-10 search results per query
- DuckDuckGo provides basic search (no API key needed)
- Exa provides neural search with richer content (API key required)
- Fetch & Summarize requires an LLM provider API key
- The `/research` command requires an Exa API key (no fallback)
