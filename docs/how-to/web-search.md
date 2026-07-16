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

1. Click the Settings button (gear icon)
2. Open the **Search** category in the settings sidebar
3. Get an API key from [Exa](https://exa.ai/)
4. Paste it into the "Exa API key (web search)" field
5. Click Save Settings

Without an Exa key, search uses DuckDuckGo automatically.

## Basic search

Type `/search` followed by your query in the chat input:

```text
/search latest research on mRNA vaccines
```

Press Enter. Canvas Chat will:

1. Create a SEARCH node showing your query
2. Call the search provider (Exa or DuckDuckGo) to find relevant results
3. Show the results in a **carousel drawer** beneath the search node (no extra nodes cluttering the canvas)

The search node body shows the query and the result count. The drawer hosts one result at a time. Each result shows:

- The page title
- The URL
- A snippet of the content

## Context-aware search

When you select text or nodes before searching, Canvas Chat uses that context to refine your query.

### Example: Vague queries with context

1. In a conversation about quantum computing, select a node that mentions "Toffoli gates"
2. Type `/search how does this work?`
3. The AI refines your vague query to: *"how Toffoli gate CCNOT quantum computing works"*

The search node will show both your original query and the refined version.

### Why this matters

Without context, "how does this work?" is too vague to search. By providing context (the selected node), the AI resolves pronouns like "this" into specific technical terms, producing better search results.

## Working with search results (carousel drawer)

Open the drawer beneath a SEARCH node (it appears automatically after a search) to browse and curate results.

### Navigate results

Use the **◀ / ▶** buttons (or step through) to move between results one at a time, PowerPoint-style. The counter shows e.g. `2 / 5`.

### Choose what feeds your replies

Each result has a **Context** checkbox. Checked results are included as context when you reply to the SEARCH node. All results start checked; uncheck the ones you don't need to keep your prompts focused.

### Open a page's full text

Click **View content** on a result to fetch the page and open it as an opt-in child reference node showing the full page text. This is the only time a separate node is created — the canvas stays clean until you decide a result is worth reading in depth. The child node links back to the search node and can be collapsed like any other node.

### Reply to results

Select the SEARCH node (or reply to it) and type your question. The AI automatically uses your **checked** results as context. For any result you've opened with **View content**, the full page text is used instead of the snippet — so expand the results you care about before asking for deeper analysis.

## Search positioning

Search nodes are positioned automatically:

- If you have nodes selected: the search appears to the right of them
- If nothing is selected: the search appears to the right of the most recent leaf node
- Results stay inside the search node's drawer; a child node is only created when you use **View content**

## Tips

**Use specific queries** for better results:

- ✅ Good: `/search transformer attention mechanism pytorch implementation`
- ❌ Vague: `/search machine learning`

**Combine with context** for conversational searches:

1. Discuss a topic in several nodes
2. Select the relevant nodes
3. Type `/search what are alternatives?` — the AI resolves "alternatives" based on your conversation

**Curate before you ask** - Browse the carousel, uncheck irrelevant results, and use View content on the 1-2 best pages. Replies then draw on exactly the material you chose.

**Use in research workflows:**

1. Start with `/search` to find sources
2. Open the best 2-3 results with View content
3. Use `/research` for comprehensive synthesis (see [How to conduct deep research](deep-research.md))

## Limits

- Maximum 5-10 search results per query
- DuckDuckGo provides basic search (no API key needed)
- Exa provides neural search with richer content (API key required)
- View content fetches up to 8000 characters of page text per result
- The `/research` command requires an Exa API key (no fallback)
