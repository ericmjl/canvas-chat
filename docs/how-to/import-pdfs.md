# How to import PDFs

Canvas Chat can extract text from PDF files and create notes from them. This is useful for bringing research papers, reports, and documents into your canvas for discussion and analysis.

## Import methods

There are three ways to import a PDF:

### From a URL

Use the `/note` command with a PDF URL:

```text
/note https://arxiv.org/pdf/2301.12345.pdf
```

The application detects `.pdf` URLs automatically and routes them through the PDF extraction pipeline instead of the standard URL fetcher.

### From the paperclip button

1. Click the paperclip button next to the chat input
2. Select a PDF file from your computer
3. The file uploads and text extraction begins

### Drag and drop

1. Drag a PDF file from your file manager
2. Drop it anywhere on the canvas
3. A note node appears at the drop location with the extracted content

## What happens during import

When you import a PDF:

1. The file is uploaded to the server (maximum 25 MB)
2. Text is extracted from all pages using PyMuPDF
3. A warning banner is prepended to the content
4. A PDF note node (teal colored) appears on the canvas

## The warning banner

All PDF imports include a warning banner at the top:

> **PDF Import** — Text was extracted automatically and may contain errors. Consider sourcing the original if precision is critical. Edit this note to correct any issues.

This reminds you that:

- OCR and text extraction can introduce errors
- Complex layouts (tables, multi-column) may not extract cleanly
- Mathematical formulas may not extract cleanly, but you can edit the note and add LaTeX math notation (e.g., `\(E = mc^2\)` or `\[...\]`) which will render properly
- You should verify critical information against the original

## Working with imported PDFs

Once imported, PDF notes work like any other note:

- Select them as context for questions
- Include them in matrix evaluations
- Ask the AI to summarize or analyze them
- Edit the content to fix extraction errors

## Limits

- Maximum file size: 25 MB
- Only PDF files are supported for direct import (use `/note` with a URL for web pages)
- Scanned PDFs with no embedded text may extract as empty or garbled content
- Password-protected PDFs cannot be processed
