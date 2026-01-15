# How to fact-check claims

The `/factcheck` command verifies factual claims using web search and LLM analysis. It extracts claims from text, searches for evidence, and provides verdicts with explanations and sources.

## What is fact-checking?

When you use `/factcheck`:

1. **Extracts claims** from your text (or uses selected text)
2. **Searches the web** for evidence supporting or refuting each claim
3. **Analyzes results** using an LLM to determine a verdict
4. **Displays results** in an interactive factcheck node with verdicts, explanations, and source links

## Using factcheck

### Method 1: Fact-check selected text

1. **Select a node** containing claims you want to verify
2. Type `/factcheck` in the chat input
3. Optionally add text after the command (e.g., `/factcheck verify these`)
4. Press Enter

The factcheck feature extracts claims from the selected node's content and verifies them.

### Method 2: Fact-check typed claims

1. Type `/factcheck` followed by your claims
2. Press Enter

Example:

```text
/factcheck The Eiffel Tower is 330 meters tall. Paris is the capital of France.
```

### Method 3: Fact-check a numbered list

If you have a note node with numbered claims:

1. **Select the note node** containing the numbered list
2. Type `/factcheck` (or `/factcheck verify these`)
3. Press Enter

The feature automatically extracts each numbered item as a separate claim.

## Claim selection modal

If more than 5 claims are found, a modal appears for you to select which claims to verify:

- **Select All** / **Deselect All** - Toggle all claims at once
- **Individual checkboxes** - Select specific claims
- **Warning** - If you select more than 5 claims, a warning appears (informational only)
- **Execute** - Starts verification for selected claims

## Verdict types

Each claim receives one of these verdicts:

| Verdict | Badge | Meaning |
| ------- | ----- | ------- |
| **VERIFIED** | ✅ | Claim is accurate and supported by reliable sources |
| **PARTIALLY_TRUE** | ⚠️ | Claim is mostly correct but contains inaccuracies or missing context |
| **MISLEADING** | 🔶 | Claim is technically true but presented in a misleading way |
| **FALSE** | ❌ | Claim is factually incorrect |
| **UNVERIFIABLE** | ❓ | Cannot determine truth due to lack of reliable sources |
| **ERROR** | ⚠️ | Verification failed due to an error |

## Reading factcheck results

The factcheck node displays:

- **Claim text** - The original claim being verified
- **Status badge** - Visual indicator of the verdict
- **Explanation** - Brief explanation of why this verdict was reached (1-2 sentences)
- **Sources** - Links to supporting evidence (up to 3 sources per claim)

### Expanding claims

Click on any claim header to expand and see the full explanation and sources. Click again to collapse.

## Tips

### Vague references

If you use vague references like "verify this" or "fact check these", the feature will:

1. Use the selected node's content as context
2. Resolve the vague reference into specific claims
3. If resolution fails, use the context directly

### Best practices

- **Be specific** - Clear, factual statements work best
- **Numbered lists** - Automatically extracted as separate claims
- **Select nodes** - Provides context for vague references
- **Multiple claims** - Can verify up to 10 claims at once (5 recommended for performance)

### Performance

- **5 or fewer claims** - Verified immediately in parallel
- **More than 5 claims** - Modal appears for selection (you can still select all)
- **Parallel processing** - All selected claims are verified simultaneously

## Examples

### Example 1: Simple claim

```text
/factcheck The speed of light is 299,792,458 meters per second
```

Result: ✅ VERIFIED with explanation and sources.

### Example 2: Multiple claims

```text
/factcheck Water boils at 100°C at sea level. The Earth is flat. Python is a programming language.
```

Result: Three claims with different verdicts (✅, ❌, ✅).

### Example 3: Numbered list in note

1. Select a note node containing:

   ```text
   1. The Eiffel Tower was built in 1889
   2. Paris is the capital of France
   3. The moon is made of cheese
   ```

2. Type `/factcheck verify these`

Result: Three claims extracted and verified (✅, ✅, ❌).

## Limitations

- **Search quality** - Verdicts depend on search result quality
- **LLM analysis** - Verdicts are AI-generated and should be verified
- **Source limits** - Up to 3 sources per claim
- **Search queries** - Up to 3 search queries per claim
- **Claim limit** - Maximum 10 claims per factcheck

## Related features

- **[Web search](../how-to/web-search.md)** - Simple web search without verification
- **[Deep research](../how-to/deep-research.md)** - Comprehensive research reports
- **[LLM committee](../how-to/llm-committee.md)** - Multi-LLM consultation for complex questions
