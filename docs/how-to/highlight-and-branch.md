# How to highlight text and branch conversations

Text highlighting lets you extract specific passages from nodes and respond to them, creating focused sub-conversations on the canvas.

## What is highlighting?

When you select text within a node and create a highlight:

1. A new HIGHLIGHT node appears containing just that text
2. A dashed line connects the original node to the highlight
3. You can reply to or branch from the highlight independently

This is useful for:

- Responding to a specific point in a long message
- Extracting key quotes or findings for later reference
- Branching the conversation in a new direction from one specific idea

## Creating a highlight

### Method 1: Highlight and branch

1. **Select text** within any node by clicking and dragging
2. A tooltip appears showing the selected text
3. Click the **"🌿 Branch"** button in the tooltip
4. Optionally type a reply or command in the input field
5. Click "Branch" (or press Enter)

A highlight node appears near the viewport center, connected to the source node with a dashed line.

### Method 2: Highlight then reply separately

1. Select text and click "🌿 Branch"
2. Leave the reply field empty
3. Click "Branch"
4. The highlight node appears
5. Select it and type in the chat input to reply

## What happens when you branch

### Without a reply

Just creates the highlight node:

```text
Original node: "Quantum computing uses qubits which can exist in superposition..."

Highlight node: "> Quantum computing uses qubits which can exist in superposition"
```

The `>` prefix formats it as a blockquote.

### With a reply

Creates the highlight node and immediately responds to it:

1. You select: *"uses qubits which can exist in superposition"*
2. You type: `explain this in simpler terms`
3. Result: Highlight node + AI response node

### With a slash command

You can use slash commands when branching:

1. Select: *"revenue grew 40% last quarter"*
2. Type: `/research what market factors contributed to this growth`
3. Result: Highlight node + Research node

The selected text becomes context for the slash command, helping the AI refine its search or research query.

## Working with highlights

### Highlight nodes are full nodes

They work exactly like other nodes:

- Reply to them
- Select them as context for new messages
- Delete them if no longer needed
- Move them around the canvas

### Dashed connections

The dashed line from source → highlight is a HIGHLIGHT edge type. This visually distinguishes highlights from regular replies (solid lines).

### Multiple highlights from one node

You can create many highlights from the same node:

```text
Research paper node
  ↦ "Methodology section" (highlight)
  ↦ "Key finding #1" (highlight)
  ↦ "Surprising result" (highlight)
```

Each can spawn its own conversation thread.

## Common use cases

### Discussing research or long documents

When working with imported PDFs or research reports:

1. Skim the full document node
2. Highlight key findings, one at a time
3. Ask questions about each highlight
4. Build a knowledge graph of interconnected insights

### Responding to specific points

In a long AI response with multiple ideas:

1. Highlight just the part you want to discuss
2. Reply to that specific point
3. The conversation focuses without repeating the entire context

**Without highlights:**

```text
You: "Can you elaborate on the third paragraph about database indexing?"
AI: [has to re-identify which part you meant]
```

**With highlights:**

```text
You: [highlight third paragraph]
You: "Can you elaborate on this?"
AI: [knows exactly what "this" refers to]
```

### Extracting images from nodes

When a node contains an image (like a screenshot or diagram):

1. **Right-click the image**
2. Select **"Extract as separate node"**
3. A new IMAGE node appears containing just that image
4. Connected to the original via a HIGHLIGHT edge

This works like text highlighting but for visual content.

## Tips for effective highlighting

### Keep highlights focused

✅ Good: Highlight a single idea or finding

```text
> "The model achieved 94% accuracy on the validation set"
```

❌ Too broad: Highlighting multiple paragraphs

```text
> [giant wall of text spanning 5 different topics]
```

For large sections, just reply to the full node instead.

### Use highlights for non-linear reading

When reading a long document:

- Don't read top-to-bottom
- Scan for interesting parts
- Highlight and explore each in depth
- Create a web of interconnected insights

### Combine with matrix evaluation

After highlighting several key points:

1. Select all highlight nodes
2. Run `/matrix evaluate these findings against novelty, feasibility, and impact`

### Branch from highlights

Highlights can themselves be highlighted:

```text
Research node
  ↦ Highlight A
      ↦ Highlight A.1 (specific sentence within A)
          ↦ Deep dive conversation
```

This creates nested focus, zooming in on increasingly specific details.

## Context propagation

When you highlight text and then reply or run a command:

### The selected text becomes context

If you highlight: *"transformer attention mechanism"*

Then type: `/search how does this work?`

The AI refines your query to: *"how transformer attention mechanism works"*

The vague pronoun "this" is resolved using your highlighted text as context.

### Why this matters

It enables conversational slash commands:

- `/search what are alternatives?` — alternatives to what? Your highlight!
- `/research explain the implications` — implications of what? Your highlight!

## Differences from regular replies

| Feature | Regular Reply | Highlight + Reply |
| ------- | ------------- | ----------------- |
| Creates nodes | 1 (reply) | 2 (highlight + reply) |
| Edge type | REPLY (solid) | HIGHLIGHT (dashed) |
| Source content | Full parent node | Selected text only |
| Use case | Continue conversation | Focus on specific point |

## Troubleshooting

### "🌿 Branch" button doesn't appear

- Make sure you've selected text (click and drag)
- Try selecting text again
- Some nodes may not support text selection (check node type)

### Highlight appears in wrong location

- Highlights appear near the viewport center
- Move them manually by dragging
- Or use auto-layout (🔀 button) to reorganize

### Selected text is not visible in highlight node

- Check that you selected text before clicking Branch
- Highlights should show the text with `>` prefix (blockquote)
- If empty, try creating the highlight again

### Can't highlight images

- Images use a different mechanism: right-click → "Extract as separate node"
- This creates an IMAGE node, not a HIGHLIGHT node
- Connected with the same dashed line style

## Advanced patterns

### Multi-stage highlighting

1. Import a research paper (PDF) - see [How to import PDFs](import-pdfs.md) for details on drag/drop and `/note` URL methods
2. Highlight key sections
3. For each section, highlight specific sentences
4. Ask detailed questions about each sentence
5. Build a deep understanding layer by layer

### Highlight + Committee

1. Find a controversial claim in a node
2. Highlight just that claim
3. Run `/committee is this claim accurate?` - see [How to use LLM committee](llm-committee.md) for details
4. Get multiple AI perspectives on that specific assertion

### Highlight + Matrix

1. Highlight 5-10 different ideas from various sources
2. Select all highlights
3. Run `/matrix compare these ideas against originality, feasibility, evidence` - see [How to use matrix evaluation](use-matrix-evaluation.md) for details
