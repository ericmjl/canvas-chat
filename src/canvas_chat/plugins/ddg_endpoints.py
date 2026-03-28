"""DuckDuckGo search and research API endpoints plugin.

This module contains DDG-specific request/response models and endpoints for
web search and iterative deep research. It is registered from `canvas_chat.app`
via `register_endpoints(app)`.

Why this lives here (not app.py):
- Keeps app.py focused on core app wiring
- Keeps DDG-specific models, prompts, and endpoints co-located
"""

from __future__ import annotations

import asyncio
import json
import logging
import traceback
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)


# --- Request/response models ---


class DDGSearchRequest(BaseModel):
    """Request body for DuckDuckGo search endpoint."""

    query: str
    max_results: int = 10


class DDGSearchResult(BaseModel):
    """A single DuckDuckGo search result."""

    title: str
    url: str
    snippet: str


class DDGResearchRequest(BaseModel):
    """Request body for DDG-based deep research fallback endpoint.

    This is used when Exa's /research is unavailable (no Exa API key).
    The backend orchestrates an iterative search -> fetch -> summarize loop
    using DuckDuckGo + free URL fetching + the user's selected LLM.
    """

    instructions: str
    context: str | None = None
    model: str
    api_key: str | None = None
    base_url: str | None = None
    max_iterations: int = 4
    max_sources: int = 40
    max_queries_per_iteration: int = 4
    max_results_per_query: int = 10


class DDGResearchSource(BaseModel):
    """A single discovered source for DDG-based research."""

    url: str
    title: str
    snippet: str | None = None
    summary: str
    iteration: int
    query: str


@dataclass(frozen=True)
class DDGResearchRuntime:
    """Clamped limits and strings for one DDG research SSE run."""

    instructions: str
    context: str
    model: str
    api_key: str | None
    base_url: str | None
    max_iterations: int
    max_sources: int
    max_queries_per_iteration: int
    max_results_per_query: int
    max_sources_per_iteration: int


def build_ddg_research_runtime(request: DDGResearchRequest) -> DDGResearchRuntime:
    max_iterations = max(1, min(request.max_iterations, 8))
    max_sources = max(5, min(request.max_sources, 80))
    max_queries_per_iteration = max(1, min(request.max_queries_per_iteration, 8))
    max_results_per_query = max(1, min(request.max_results_per_query, 25))
    per_iteration_sources = max_sources_per_iteration(max_sources, max_iterations)
    return DDGResearchRuntime(
        instructions=request.instructions.strip(),
        context=(request.context or "").strip(),
        model=request.model,
        api_key=request.api_key,
        base_url=request.base_url,
        max_iterations=max_iterations,
        max_sources=max_sources,
        max_queries_per_iteration=max_queries_per_iteration,
        max_results_per_query=max_results_per_query,
        max_sources_per_iteration=per_iteration_sources,
    )


# --- DDG Deep Research prompt templates ---

DDG_RESEARCH_QUERY_GEN_SYSTEM_PROMPT = """You are a web research assistant.
Your job is to turn a user's research instructions (and optional context) into
effective DuckDuckGo search queries.

Output rules (strict):
- Output ONLY valid JSON.
- Output must be a JSON array of strings.
- 3 to 6 queries.
- Each query should be concise (<= 12 words) and specific.
- Avoid quotes around the entire query.
- Avoid duplicate or near-duplicate queries.
"""

DDG_RESEARCH_PAGE_SUMMARY_SYSTEM_PROMPT = """You are a research assistant.
Given a user's research instructions and the content of a web page, write a
tailored summary that directly helps answer the instructions.

Write in markdown. Rules:
- Start with 1-2 sentences of the most relevant takeaway.
- Then add 3-6 bullet points of supporting details (only from the page).
- If the page is irrelevant, say so briefly and suggest what would be relevant.
- Do NOT invent facts not present in the page.
"""

DDG_RESEARCH_ADJACENT_QUERY_SYSTEM_PROMPT = """You are a research assistant.
Given the user's research instructions and what we've learned so far, propose
new DuckDuckGo search queries to explore intellectually adjacent ideas (related
mechanisms, alternatives, critiques, edge cases, or applications).

Output rules (strict):
- Output ONLY valid JSON.
- Output must be a JSON array of strings.
- 2 to 5 queries.
- Each query should be concise (<= 12 words) and specific.
- Avoid duplicate or near-duplicate queries.
"""

DDG_RESEARCH_SYNTHESIS_SYSTEM_PROMPT = """You are a research report writer.
You will be given a user's research instructions and a list of sources with
short summaries.
Write a coherent report that answers the instructions using ONLY the provided sources.

Write in markdown. Rules:
- Provide a clear structure with headings.
- Prefer precise, falsifiable statements over vague generalities.
- When making a claim that comes from a source, cite it inline as a markdown
  link: [Source Name](url)
- CRITICAL: URLs in markdown links must be formatted exactly as:
  [text](https://example.com/path)
  - The URL must be complete and valid
  - Do NOT add any characters after the URL inside the parentheses
  - Do NOT add brackets, punctuation, or special characters after the URL
  - The closing parenthesis ) must immediately follow the last character of the URL
- Example CORRECT: [The Guardian](https://example.com/article)
- Example WRONG: [The Guardian](https://example.com/article【)
- Example WRONG: [The Guardian](https://example.com/article)【
- If evidence is thin or conflicting, say so explicitly.
"""

# Input-side token budget for fetched page markdown in the per-page summarize
# prompt (instructions, context, URL, and snippet are added on top). Clipping
# uses LiteLLM's token counter for ``model`` when available so the cap tracks
# tokenizer density instead of a fixed character slice.
DDG_PAGE_BODY_MAX_INPUT_TOKENS = 3000


def clip_page_markdown_to_input_token_budget(
    text: str,
    *,
    model: str,
    max_input_tokens: int,
) -> str:
    """Return a prefix of ``text`` whose token count is at most ``max_input_tokens``.

    Uses :func:`litellm.token_counter` for ``model`` when it succeeds; otherwise
    falls back to a ~4 characters per token heuristic. Avoids counting or
    binary-searching over extremely long strings by capping an initial slice.
    """
    if not text:
        return ""
    if max_input_tokens <= 0:
        return ""

    try:
        import litellm
    except ImportError:
        litellm = None

    def token_count(fragment: str) -> int:
        if litellm is None:
            return max(1, len(fragment) // 4)
        try:
            return int(litellm.token_counter(model=model, text=fragment))
        except Exception:
            return max(1, len(fragment) // 4)

    # Cheap bound for Latin-ish text; refine if the slice is still too token-dense.
    char_upper = max_input_tokens * 8
    if len(text) > char_upper:
        text = text[:char_upper]

    if token_count(text) <= max_input_tokens:
        return text

    lo, hi = 0, len(text)
    best = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        prefix = text[:mid]
        if token_count(prefix) <= max_input_tokens:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return text[:best]


def max_sources_per_iteration(max_sources: int, max_iterations: int) -> int:
    """Compute per-iteration source cap so sources are spread across iterations.

    Ensures at least 5 sources per iteration and uses ceiling division so
    total capacity is not reduced when max_sources is not divisible by
    max_iterations.
    """
    return max(
        5,
        (max_sources + max_iterations - 1) // max_iterations,
    )


async def ddg_search_with_retry(
    ddgs: Any,
    query: str,
    *,
    max_results: int,
    max_retries: int = 3,
) -> list[dict]:
    """Run ``ddgs.text`` with exponential backoff on empty results or errors."""
    for attempt in range(max_retries):
        try:
            results = list(
                ddgs.text(
                    query,
                    max_results=max_results,
                )
            )
            if results:
                return results
            if attempt < max_retries - 1:
                wait_time = 2.0 * (2**attempt)
                logger.warning(
                    f"DDG query returned empty results: {query} "
                    f"(attempt {attempt + 1}/{max_retries}, waiting {wait_time}s)"
                )
                await asyncio.sleep(wait_time)
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = 2.0 * (2**attempt)
                logger.warning(
                    f"DDG query failed: {query} ({e}) "
                    f"(attempt {attempt + 1}/{max_retries}, waiting {wait_time}s)"
                )
                await asyncio.sleep(wait_time)
            else:
                logger.error(f"DDG query failed after retries: {query} ({e})")
    return []


async def ddg_fetch_page_to_source(
    r: dict,
    *,
    runtime: DDGResearchRuntime,
    client: httpx.AsyncClient,
    iteration: int,
    semaphore: asyncio.Semaphore,
) -> DDGResearchSource | None:
    """Fetch URL, summarize with LLM, return source row (or None on failure)."""
    from canvas_chat.app import (
        fetch_url_directly,
        fetch_url_via_jina,
        run_structured_summarize,
    )

    url = r["url"]
    query = r["query"]
    snippet = r["snippet"]
    instructions = runtime.instructions
    context = runtime.context

    async with semaphore:
        try:
            try:
                title, content_md = await fetch_url_via_jina(url, client)
            except Exception:
                title, content_md = await fetch_url_directly(url, client)

            content_md = (content_md or "").strip()
            if not content_md:
                return None

            content_for_llm = clip_page_markdown_to_input_token_budget(
                content_md,
                model=runtime.model,
                max_input_tokens=DDG_PAGE_BODY_MAX_INPUT_TOKENS,
            )

            user_prompt = (
                f"Research instructions:\n{instructions}\n\n"
                + (f"Context:\n{context[:2000]}\n\n" if context else "")
                + (f"Search query that found this page: {query}\n\n")
                + f"Page title: {title}\n"
                + f"URL: {url}\n"
                + (f"Snippet: {snippet}\n\n" if snippet else "\n")
                + (f"Page content (markdown):\n{content_for_llm}\n")
            )

            summary = await run_structured_summarize(
                model=runtime.model,
                api_key=runtime.api_key,
                base_url=runtime.base_url,
                user_prompt=user_prompt,
                system_prompt=DDG_RESEARCH_PAGE_SUMMARY_SYSTEM_PROMPT,
                max_tokens=450,
                temperature=0.3,
            )

            final_title = (
                title if title and title != "Untitled" else (r["title"] or "Untitled")
            )

            return DDGResearchSource(
                url=url,
                title=final_title,
                snippet=snippet or None,
                summary=summary,
                iteration=iteration,
                query=query,
            )

        except Exception as e:
            logger.warning(f"Failed to process URL: {url} ({e})")
            return None


async def ddg_synthesize_final_report(
    runtime: DDGResearchRuntime,
    sources_md: str,
) -> str:
    """Synthesis report markdown, or fallback body on LLM failure."""
    from canvas_chat.app import run_structured_summarize

    synthesis_user_prompt = (
        f"Research instructions:\n{runtime.instructions}\n\n"
        + (f"Context:\n{runtime.context[:2000]}\n\n" if runtime.context else "")
        + f"Sources (title, url, summary):\n{sources_md}\n"
    )
    try:
        return await run_structured_summarize(
            model=runtime.model,
            api_key=runtime.api_key,
            base_url=runtime.base_url,
            user_prompt=synthesis_user_prompt,
            system_prompt=DDG_RESEARCH_SYNTHESIS_SYSTEM_PROMPT,
            max_tokens=8192,
            temperature=0.3,
        )
    except Exception as e:
        logger.error(f"Report synthesis failed: {e}")
        return (
            f"**Research Report**\n\n"
            f"*Note: Report generation encountered an error. "
            f"Below are the sources that were found:*\n\n"
            f"## Sources Found\n\n"
            f"{sources_md}\n\n"
            f"*Error: {str(e)}*"
        )


async def ddg_research_event_stream(
    runtime: DDGResearchRuntime,
) -> AsyncIterator[dict[str, Any]]:
    """SSE events for one DDG deep-research run."""
    from ddgs import DDGS

    from canvas_chat.app import run_structured_string_list

    try:
        if not runtime.instructions:
            yield {"event": "error", "data": "Empty research instructions"}
            return

        yield {
            "event": "status",
            "data": "Generating initial search queries...",
        }

        seed_user_prompt = (
            f"Research instructions:\n{runtime.instructions}\n\n"
            + (f"Context:\n{runtime.context[:2000]}\n\n" if runtime.context else "")
            + "Return JSON array of DDG search queries."
        )
        next_queries = await run_structured_string_list(
            model=runtime.model,
            api_key=runtime.api_key,
            base_url=runtime.base_url,
            system_prompt=DDG_RESEARCH_QUERY_GEN_SYSTEM_PROMPT,
            user_prompt=seed_user_prompt,
        )

        if not next_queries:
            next_queries = [runtime.instructions[:120]]

        seen_queries: set[str] = set()
        seen_urls: set[str] = set()
        sources: list[DDGResearchSource] = []
        min_iterations = min(3, runtime.max_iterations)

        async with httpx.AsyncClient(timeout=30.0) as client:
            for iteration in range(1, runtime.max_iterations + 1):
                iteration_queries = [
                    q
                    for q in next_queries
                    if q.strip() and q.strip().lower() not in seen_queries
                ][: runtime.max_queries_per_iteration]

                if not iteration_queries:
                    yield {
                        "event": "status",
                        "data": "No new queries to search; stopping early.",
                    }
                    break

                for q in iteration_queries:
                    seen_queries.add(q.strip().lower())

                yield {
                    "event": "status",
                    "data": (
                        f"Iteration {iteration}/{runtime.max_iterations}: "
                        "searching DuckDuckGo..."
                    ),
                }

                url_to_result: dict[str, dict] = {}

                with DDGS() as ddgs:
                    for q in iteration_queries:
                        results = await ddg_search_with_retry(
                            ddgs,
                            q,
                            max_results=runtime.max_results_per_query,
                        )

                        query_lower = q.lower()
                        query_words = set(query_lower.split())
                        relevant_results = []
                        for r in results:
                            url = (r.get("href") or "").strip()
                            if not url:
                                continue
                            if url in url_to_result or url in seen_urls:
                                continue

                            title = (r.get("title") or "").lower()
                            snippet = (r.get("body") or "").lower()
                            combined_text = f"{title} {snippet}"

                            min_matches = 2 if len(query_words) > 2 else 1
                            matches = sum(
                                1 for word in query_words if word in combined_text
                            )

                            if matches >= min_matches:
                                relevant_results.append(r)
                            else:
                                logger.debug(
                                    f"Skipping irrelevant result for "
                                    f"'{q}': {r.get('title', 'Untitled')}"
                                )

                        for r in relevant_results:
                            url = (r.get("href") or "").strip()
                            url_to_result[url] = {
                                "query": q,
                                "title": (r.get("title") or "Untitled").strip(),
                                "snippet": (r.get("body") or "").strip(),
                                "url": url,
                            }

                        await asyncio.sleep(1.0)

                if not url_to_result:
                    yield {
                        "event": "status",
                        "data": (
                            f"Iteration {iteration}: no relevant "
                            "results found. This may indicate rate "
                            "limiting or poor query quality."
                        ),
                    }
                    if iteration == 1 and len(sources) == 0:
                        yield {
                            "event": "error",
                            "data": (
                                "No relevant search results found. "
                                "This may be due to DuckDuckGo rate "
                                "limiting. Please try again in a few "
                                "minutes, or add an Exa API key for "
                                "more reliable research."
                            ),
                        }
                        return
                    learned_blob = "\n".join(
                        [f"- {s.title}: {s.summary[:200]}" for s in sources[-10:]]
                    )
                    next_queries = await run_structured_string_list(
                        model=runtime.model,
                        api_key=runtime.api_key,
                        base_url=runtime.base_url,
                        system_prompt=DDG_RESEARCH_ADJACENT_QUERY_SYSTEM_PROMPT,
                        user_prompt=(
                            f"Research instructions:\n{runtime.instructions}\n\n"
                            f"What we learned so far:\n{learned_blob}\n\n"
                            f"Previous queries:\n"
                            f"{', '.join(sorted(seen_queries))}\n\n"
                            "Return JSON array of new DDG queries."
                        ),
                    )
                    continue

                remaining_total = runtime.max_sources - len(sources)
                num_to_process = min(
                    len(url_to_result),
                    remaining_total,
                    runtime.max_sources_per_iteration,
                )
                yield {
                    "event": "status",
                    "data": (
                        f"Iteration {iteration}: "
                        f"fetching {num_to_process} pages in parallel..."
                    ),
                }

                for url in url_to_result:
                    seen_urls.add(url)

                sem = asyncio.Semaphore(6)
                items_to_process = list(url_to_result.values())[:num_to_process]
                tasks = [
                    ddg_fetch_page_to_source(
                        r,
                        runtime=runtime,
                        client=client,
                        iteration=iteration,
                        semaphore=sem,
                    )
                    for r in items_to_process
                ]
                results_list = await asyncio.gather(*tasks)

                for src in results_list:
                    if src is not None:
                        sources.append(src)
                        yield {
                            "event": "source",
                            "data": json.dumps(src.model_dump()),
                        }

                should_continue = iteration < min_iterations or (
                    iteration < runtime.max_iterations
                    and len(sources) < runtime.max_sources
                )

                if not should_continue:
                    if len(sources) >= runtime.max_sources:
                        yield {
                            "event": "status",
                            "data": (
                                f"Reached max sources ({runtime.max_sources}) "
                                f"after {iteration} iterations; "
                                "synthesizing report..."
                            ),
                        }
                    break

                num_sources_for_context = min(15, len(sources))
                learned_blob = "\n".join(
                    [
                        f"- {s.title} ({s.url}): {s.summary[:240]}"
                        for s in sources[-num_sources_for_context:]
                    ]
                )

                query_prompt = (
                    f"Research instructions:\n{runtime.instructions}\n\n"
                    f"What we've learned so far ({len(sources)} sources):\n"
                    f"{learned_blob}\n\n"
                    f"Previous search queries we've already tried:\n"
                    f"{', '.join(sorted(list(seen_queries)[-20:]))}\n\n"
                    "Generate NEW search queries that explore "
                    "DIFFERENT aspects of the research topic. Focus on:\n"
                    "- Specific subtopics we haven't covered yet\n"
                    "- Alternative perspectives or approaches\n"
                    "- Related but distinct concepts\n"
                    "- Practical applications or examples\n\n"
                    "Return a JSON array of 4-6 new, diverse search queries."
                )

                next_queries = await run_structured_string_list(
                    model=runtime.model,
                    api_key=runtime.api_key,
                    base_url=runtime.base_url,
                    system_prompt=DDG_RESEARCH_ADJACENT_QUERY_SYSTEM_PROMPT,
                    user_prompt=query_prompt,
                )

                if not next_queries or len(next_queries) < 2:
                    logger.warning(
                        f"Iteration {iteration}: "
                        "LLM didn't generate enough queries, "
                        "creating fallback queries"
                    )
                    fallback_terms = [
                        "recipe",
                        "ingredients",
                        "substitute",
                        "adaptation",
                        "variation",
                        "how to",
                        "tutorial",
                    ]
                    fallback_queries = []
                    for term in fallback_terms[:4]:
                        if term not in seen_queries:
                            fallback_queries.append(f"{runtime.instructions} {term}")
                    next_queries = (
                        fallback_queries[:4]
                        if fallback_queries
                        else [runtime.instructions]
                    )

        if len(sources) < 3:
            yield {
                "event": "status",
                "data": (
                    f"Warning: Only found {len(sources)} relevant "
                    "sources. This may indicate DuckDuckGo rate "
                    "limiting. Results may be incomplete."
                ),
            }

        yield {
            "event": "status",
            "data": "Synthesizing final report...",
        }

        if not sources:
            yield {
                "event": "error",
                "data": (
                    "No relevant sources found. This is likely due to "
                    "DuckDuckGo rate limiting. Please try again in a "
                    "few minutes, or add an Exa API key for more "
                    "reliable research."
                ),
            }
            return

        sources_md = "\n".join(
            [f"- [{s.title}]({s.url}): {s.summary}" for s in sources]
        )

        report = await ddg_synthesize_final_report(runtime, sources_md)

        report_stripped = report.rstrip()
        if (
            report
            and report_stripped
            and not report_stripped.endswith((".", "!", "?", ":", "\n", "---", "```"))
        ):
            report += (
                "\n\n*Note: Report may be incomplete due to response length limits.*"
            )

        yield {"event": "content", "data": report}
        yield {
            "event": "sources",
            "data": json.dumps([{"title": s.title, "url": s.url} for s in sources]),
        }
        yield {"event": "done", "data": ""}

    except Exception as e:
        logger.error(f"DDG research failed: {e}")
        logger.error(traceback.format_exc())
        yield {"event": "error", "data": str(e)}


# =============================================================================
# Endpoint registration
# =============================================================================


def register_endpoints(app: Any) -> None:
    """Register DuckDuckGo search and research endpoints on the provided FastAPI app."""
    from fastapi import HTTPException

    @app.post("/api/ddg/search")
    async def ddg_search(request: DDGSearchRequest):
        """
        Search the web using DuckDuckGo.

        This is a free fallback for users who don't have an Exa API key.
        Returns search results in the same format as Exa search.
        """
        logger.info(
            f"DDG search request: query='{request.query}', "
            f"max_results={request.max_results}"
        )

        try:
            from ddgs import DDGS

            with DDGS() as ddgs:
                results = list(
                    ddgs.text(request.query, max_results=request.max_results)
                )

            formatted_results = []
            for result in results:
                formatted_results.append(
                    DDGSearchResult(
                        title=result.get("title", "Untitled"),
                        url=result.get("href", ""),
                        snippet=result.get("body", ""),
                    )
                )

            logger.info(f"DDG returned {len(formatted_results)} results")
            return {
                "query": request.query,
                "results": formatted_results,
                "num_results": len(formatted_results),
                "provider": "duckduckgo",
            }

        except Exception as e:
            logger.error(f"DDG search failed: {e}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/ddg/research")
    async def ddg_research(request: DDGResearchRequest):
        """
        Perform pseudo deep research using DuckDuckGo + free URL fetching +
        the user's LLM.

        This endpoint is a fallback for /research when no Exa API key is configured.
        It streams progress and results via SSE, similar to Exa research.
        """
        from canvas_chat.app import inject_admin_credentials

        inject_admin_credentials(request)

        runtime = build_ddg_research_runtime(request)

        logger.info(
            "DDG research request: "
            f"instructions='{request.instructions[:100]}...', "
            f"model={request.model}, "
            f"max_iterations={runtime.max_iterations}, "
            f"max_sources={runtime.max_sources}, "
            f"max_sources_per_iteration={runtime.max_sources_per_iteration}"
        )

        return EventSourceResponse(ddg_research_event_stream(runtime))
