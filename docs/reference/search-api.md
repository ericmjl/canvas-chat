# Search API reference

Canvas Chat provides multiple search endpoints for web search functionality.

## POST /api/ddg/search

Search the web using DuckDuckGo. This endpoint requires no API key and serves as a free fallback when Exa is not configured.

**Request body:**

```json
{
  "query": "python async programming",
  "max_results": 10
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | - | The search query |
| `max_results` | integer | No | 10 | Maximum number of results to return |

**Response:**

```json
{
  "query": "python async programming",
  "results": [
    {
      "title": "Async IO in Python: A Complete Walkthrough",
      "url": "https://realpython.com/async-io-python/",
      "snippet": "Learn how to use async and await in Python..."
    }
  ],
  "num_results": 5,
  "provider": "duckduckgo"
}
```

**Errors:** 500 if DuckDuckGo search fails (rate limiting, network error).

## POST /api/exa/search

Search the web using Exa's neural search API. Provides richer results with content extraction.

**Request body:**

```json
{
  "query": "python async programming",
  "api_key": "your-exa-api-key",
  "num_results": 5,
  "search_type": "auto"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | - | The search query |
| `api_key` | string | Yes | - | Your Exa API key |
| `num_results` | integer | No | 5 | Maximum number of results |
| `search_type` | string | No | "auto" | Search type: "auto", "neural", or "keyword" |

**Response:**

```json
{
  "query": "python async programming",
  "results": [
    {
      "title": "Async IO in Python: A Complete Walkthrough",
      "url": "https://realpython.com/async-io-python/",
      "snippet": "Learn how to use async and await in Python...",
      "published_date": "2024-01-15",
      "author": "Brad Solomon"
    }
  ],
  "num_results": 5
}
```

**Errors:** 500 if Exa API fails (invalid key, rate limiting, etc.).

## POST /api/fetch-url

Fetch the content of a URL and return it as markdown. Uses Jina Reader API with fallback to direct fetch.

**Request body:**

```json
{
  "url": "https://example.com/article"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | The URL to fetch |

**Response:**

```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "content": "# Article Title\n\nMarkdown content..."
}
```

**Errors:** 500 if fetch fails, 504 if request times out.

## POST /api/exa/get-contents

Fetch full page contents using Exa's content extraction API. Provides cleaner extraction than direct fetch.

**Request body:**

```json
{
  "url": "https://example.com/article",
  "api_key": "your-exa-api-key"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | The URL to fetch |
| `api_key` | string | Yes | Your Exa API key |

**Response:**

```json
{
  "title": "Article Title",
  "url": "https://example.com/article",
  "text": "Clean extracted text content...",
  "published_date": "2024-01-15",
  "author": "John Doe"
}
```

**Errors:** 404 if no content found, 500 for Exa API errors.

## Frontend fallback behavior

The frontend automatically chooses the appropriate endpoint based on API key availability:

| Operation | With Exa Key | Without Exa Key |
|-----------|--------------|-----------------|
| `/search` command | POST /api/exa/search | POST /api/ddg/search |
| Fetch & Summarize | POST /api/exa/get-contents | POST /api/fetch-url |
| `/research` command | POST /api/exa/research | Not available (shows alert) |
