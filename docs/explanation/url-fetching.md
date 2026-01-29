# URL fetching architecture

Canvas Chat provides two ways to fetch web content into the canvas, each designed for different use cases and user configurations.

## The two URL fetching paths

### 1. `/note <url>` — zero-config fetching

When a user types `/note https://example.com/article`, the content is fetched via `/api/fetch-url`. This endpoint uses a fallback strategy:

1. **Try Jina Reader API first** (`r.jina.ai`) — free, good markdown conversion
2. **Fall back to direct fetch + html2text** — if Jina fails (rate limits, blocked domains)

This path:

- Requires no API key or configuration
- Works immediately for any user
- Returns content as clean markdown
- Creates a standalone `FETCH_RESULT` node

The design philosophy here is **progressive disclosure**: new users can start fetching web content into their canvas without any setup friction. They discover the feature, try it, and it just works.

### 2. Fetch + Summarize button — premium extraction

When a user clicks the "Fetch & Summarize" button on a `REFERENCE` node (from search results), the content is fetched using **Exa API** (`/api/exa/get-contents`). This path:

- Requires an Exa API key configured in Settings
- Provides higher quality content extraction
- Creates two linked nodes: `FETCH_RESULT` → `SUMMARY`
- Automatically generates an LLM summary of the content

Users who have invested in configuring their Exa API key get a more powerful workflow with automatic summarization.

## Why two separate implementations?

The intentional duplication serves the user experience:

1. **Zero friction for beginners**: A user discovering `/note` shouldn't need to configure API keys before they can try it. The zero-config path uses free services that require no authentication.

2. **Robustness through fallback**: Jina Reader occasionally blocks domains or rate-limits requests. The direct fetch fallback ensures `/note <url>` works reliably even when Jina is unavailable.

3. **Premium quality for power users**: Users who configure Exa get better content extraction. Exa specializes in web content retrieval and handles edge cases (paywalls, dynamic content, etc.) better than generic solutions.

4. **Consistent output format**: Both paths create `FETCH_RESULT` nodes with the same structure (`**[Title](url)**\n\n<content>`), so downstream features (editing, re-summarizing) work identically regardless of how the content was fetched.

## Trade-offs

| Aspect | `/note <url>` | Exa API (Fetch + Summarize) |
| ------ | ------------- | --------------------------- |
| Setup required | None | Exa API key |
| Cost | Free | Paid (per request) |
| Fetch strategy | Jina Reader → direct fetch | Exa API only |
| Content quality | Good for most public pages | Better for complex pages |
| Output | Raw markdown only | Markdown + AI summary |
| Use case | Quick capture | Deep reading workflow |

## Dependencies

The zero-config path uses:

- **Jina Reader API** (`r.jina.ai`) — free service, no authentication required
- **html2text** — Python library for HTML-to-markdown conversion (fallback)
- **httpx** — async HTTP client (already a dependency)

## Markdown-only output (no raw HTML/CSS)

Both URL fetching paths **always return markdown**, never raw HTML or page CSS. This is intentional:

- **Security and isolation**: Node content is rendered in a `.node-content` div in the main document (no iframe or Shadow DOM). If we stored and rendered raw HTML from a fetched page, any `<style>` tags in that HTML would apply to the whole app and could hide the toolbar, break layout, or make the canvas unclickable (similar to custom CSS in embedded notebooks like Marimo affecting the host UI).
- **Jina path**: We request `Accept: text/markdown` and receive markdown directly.
- **Direct-fetch path**: We convert the response with html2text before returning, so the frontend never receives raw HTML. That way we never inject page CSS into the canvas.

Keeping fetched content as markdown-only ensures that third-party page styles and structure cannot interfere with Canvas Chat’s UI.

## Future considerations

The current architecture could be extended:

- Offering a "summarize" action on any `FETCH_RESULT` node (not just Exa-fetched ones)
- Adding user preference for preferred fetch method
- Caching fetched content to avoid redundant requests

However, keeping the paths separate maintains clarity about what each feature does and avoids surprising users with different behavior based on their configuration state.
