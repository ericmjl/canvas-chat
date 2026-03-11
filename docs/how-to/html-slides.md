# How to create HTML slides

Canvas Chat can create and display single-file HTML presentations directly on the canvas. Slides are shown inside a node with Prev/Next controls and can be opened in a new tab for full-screen or sharing.

## Creating slides

Use the **`/slides`** slash command in the chat input.

### Option 1: Generate from a topic

Type `/slides` followed by a short topic. The app will show a spinner, then generate a self-contained HTML deck using your configured LLM.

Examples:

- `/slides Introduction to Python for data science`
- `/slides Three takeaways from our Q4 launch`
- `/slides Compare REST vs GraphQL in 5 slides`

The model is prompted to output one complete HTML file (no markdown fence, no preamble). The format matches the [html-presentations skill](https://github.com/ericmjl/skills/tree/main/skills/html-presentations): a `.deck` with `.slide` elements, keyboard navigation (Space/arrows, Escape for overview), and a bottom nav bar.

### Option 2: Paste existing HTML

If you already have a single-file HTML presentation (e.g. from the html-presentations skill or another generator), paste it after `/slides`. The app detects HTML when the text starts with `<!` or contains `<div class="deck"` and creates a slides node with that content.

1. Type `/slides` (with a space).
2. Paste your full HTML into the input.
3. Send the message.

A slides node appears with your deck embedded.

## Using the slides node

- **Prev / Next** — Move between slides. You can also click inside the iframe and use the deck’s own keyboard shortcuts (Space, arrow keys, Escape for overview).
- **Open in new tab** — Opens the same HTML in a new browser tab (e.g. for presenting or sharing).
- **Download** — Downloads the presentation as a `.html` file (filename from the node title, or `slides.html`).
- **Reply (r)** — Start a new branch from this node.
- **Copy (c)** — Copy the raw HTML to the clipboard.

## Format compatibility

Slides work best when the HTML:

- Is a single file (no external CSS/JS).
- Uses a container with class `deck` and children with class `slide`; the current slide has class `active`.
- Includes its own navigation (keyboard and/or buttons).

The [html-presentations skill](https://github.com/ericmjl/skills/tree/main/skills/html-presentations) produces compatible decks. Other generators that output similar structure (themed, self-contained HTML) should work as well.
