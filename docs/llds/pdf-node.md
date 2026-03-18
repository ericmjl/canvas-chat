# PdfNode: PDF Viewer Node

**Created**: 2026-03-16
**Status**: Implementation
**Related HLD**: [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The PdfNode provides a visual interface for viewing PDF documents directly on the canvas. It addresses a core need identified in the HLD: enabling users to work with diverse content types beyond plain text, including documents, data, and multimedia.

### Why This Node Type Exists

PDF viewing capability was added to support several user workflows:

- **Research workflows**: Importing research papers, reports, and technical documents for discussion with LLMs
- **Reference materials**: Keeping relevant PDFs accessible within the conversation canvas
- **Multi-document comparison**: Using matrix nodes to compare content across multiple PDFs
- **Text extraction for search**: Making PDF content searchable and selectable within the canvas

The design philosophy emphasizes **lazy rendering** and **progressive enhancement**. The PDF is not fully rendered until the user interacts with the node. This keeps initial canvas load times fast while still providing a rich viewing experience.

### Design Decisions

1. **Unified with FetchResultNode**: PDF nodes share the same underlying node type as URL-fetched content (`fetch_result`). This reduces code duplication and ensures consistent behavior across different content types.

2. **Dual storage approach**: Uploaded PDFs are stored in IndexedDB for fast local access, while text is extracted via the backend and stored in the graph for searchability.

3. **Output panel for text**: Extracted text appears in the collapsible output panel below the PDF viewer, enabling text selection, search, and highlight creation.

4. **Client-side rendering**: PDF.js runs entirely in the browser, avoiding server costs and providing instant feedback.

## Technical Details

### Architecture Overview

The PDF viewing system spans three main modules:

| Module                 | Location                       | Responsibility                                         |
| ---------------------- | ------------------------------ | ------------------------------------------------------ |
| `pdf-node.js`          | `plugins/pdf-node.js`          | Node protocol, file upload handler registration        |
| `pdf-viewer.js`        | `plugins/pdf-viewer.js`        | PDF.js integration, IndexedDB storage, text extraction |
| `fetch-result-node.js` | `plugins/fetch-result-node.js` | Node rendering, pagination UI, keyboard shortcuts      |

### PDF.js Integration

PDF rendering uses PDF.js (version 5.4.624) loaded from jsDelivr CDN:

```javascript
const PDFJS_CDN_VERSION = '5.4.624';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/build`;
```

The library is lazily loaded when first needed:

```javascript
export async function getPdfJs() {
    if (pdfjsLibPromise === null) {
        pdfjsLibPromise = (async () => {
            const pdfjs = await import(/* webpackIgnore: true */ `${PDFJS_BASE}/pdf.mjs`);
            const lib = pdfjs.default ?? pdfjs;
            if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
                lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.mjs`;
            }
            return lib;
        })();
    }
    return pdfjsLibPromise;
}
```

### Loading and Rendering

PDFs can be loaded from two sources:

1. **Uploaded files**: Retrieved from IndexedDB using `getPdfForNode(nodeId)`
2. **URLs**: Loaded directly from the URL via the `pdf_url` metadata field

The rendering pipeline:

```javascript
async function hydratePdfViewer(wrapper, node) {
    // 1. Determine source (URL or IndexedDB)
    const source = pdfUrl || (await getPdfForNode(nodeId));

    // 2. Load PDF document
    const pdfDoc = await loadDocument(source);

    // 3. Render first page to canvas
    await renderPageToCanvas(pdfDoc, 1, canvasEl, scale);

    // 4. Extract text from all pages
    const text = await extractTextFromDocument(pdfDoc);

    // 5. Update graph with extracted text
    this.graph.updateNode(nodeId, { content: newContent });
}
```

### IndexedDB Storage

Uploaded PDFs are stored in a dedicated IndexedDB database to avoid the limitations of localStorage (size limits, synchronous API):

```javascript
const DB_NAME = 'canvas-chat-pdf-db';
const PDF_STORE_NAME = 'canvas-chat-pdf';

export async function setPdfForNode(nodeId, arrayBuffer) {
    const db = await openPdfDb();
    // Store as { nodeId, arrayBuffer }
    tx.objectStore(PDF_STORE_NAME).put({ nodeId, arrayBuffer });
}

export async function getPdfForNode(nodeId) {
    const db = await openPdfDb();
    // Retrieve ArrayBuffer for PDF.js
    return req.result ? req.result.arrayBuffer : null;
}
```

### Node Rendering

PDF nodes are rendered using the `FetchResultNode` protocol class. The rendering logic checks for PDF-specific metadata:

```javascript
// In fetch-result-node.js renderContent()
const pdfUrl = metadata.pdf_url;
const pdfSource = metadata.pdf_source;
if (contentType === 'pdf' && (pdfUrl || pdfSource === 'upload')) {
    return `
        <div class="pdf-viewer-container"
             data-node-id="${nodeId}"
             ${pdfUrl ? `data-pdf-url="${safeUrl}"` : 'data-pdf-source="upload"'}
             data-pdf-hydrated="false">
            <div class="pdf-viewer-page-info">Page 1 of 1</div>
            <div class="pdf-viewer-loading">Loading PDF...</div>
            <div class="pdf-viewer-page" style="display:none;">
                <canvas class="pdf-viewer-canvas"></canvas>
            </div>
        </div>
    `;
}
```

The `data-pdf-hydrated="false"` attribute signals to the canvas that hydration is needed. The canvas delegates to the URL fetch plugin's `hydratePdfViewer()` method.

### CSS Styling

PDF viewer styling is defined in `nodes.css`:

```css
.pdf-viewer-container {
    width: 100%;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--node-pdf, #e8f4f8);
    border-radius: 4px;
}

.pdf-viewer-canvas {
    display: block;
    vertical-align: top;
}
```

## Pagination and Text Extraction

### Pagination Controls

PDF nodes include pagination buttons in the action bar, implemented in `fetch-result-node.js`:

```javascript
// Action bar shows Prev/Next buttons for PDFs
getAdditionalActions() {
    const isPdf = metadata.content_type === 'pdf' &&
                  (metadata.pdf_url || metadata.pdf_source === 'upload');
    const pdfActions = isPdf ? [PDF_PREV_PAGE, PDF_NEXT_PAGE] : [];
    return [...pdfActions, Actions.SUMMARIZE, Actions.CREATE_FLASHCARDS];
}
```

Keyboard shortcuts are also bound for PDF pagination:

```javascript
getKeyboardShortcuts() {
    const base = super.getKeyboardShortcuts();
    if (isPdf) {
        base.ArrowLeft = { action: 'pdf-prev-page', handler: 'pdf-prev-page' };
        base.ArrowRight = { action: 'pdf-next-page', handler: 'pdf-next-page' };
    }
    return base;
}
```

### Page State Management

Page state is stored on the DOM element for quick access:

```javascript
const state = { currentPage: 1, numPages };
state.showPage = showPage;
container._pdfState = state;

async function showPage(pageNum) {
    state.currentPage = pageNum;
    await renderPageToCanvas(pdfDoc, pageNum, canvasEl, scale);
    pageInfo.textContent = `Page ${pageNum} of ${numPages}`;
}
```

### Text Extraction

Text extraction runs after the first page renders. The process iterates through all pages:

```javascript
export async function extractTextFromDocument(pdfDoc) {
    const numPages = pdfDoc.numPages;
    const parts = [];
    for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item) => item.str).join(' ');
        if (text.trim()) {
            parts.push(`## Page ${i}\n\n${text.trim()}`);
        }
    }
    const full = parts.length ? parts.join('\n\n') : '(No extractable text)';
    return full;
}
```

The extracted text is stored in the node's content with page markers (`## Page N`) that serve two purposes:

1. **Structure**: Visual separation of pages in the output panel
2. **Navigation targets**: Each heading gets an ID for scroll targeting (`id="pdf-page-N"`)

### Output Panel Integration

The output panel displays extracted text with page headings:

```javascript
// In fetch-result-node.js renderOutputPanel()
if (metadata.content_type === 'pdf' && this.node.content) {
    const html = canvas.renderMarkdown(this.node.content);
    // Add IDs to page headings for scroll targeting
    return html.replace(
        /<h2([^>]*)>(Page (\d+))<\/h2>/gi,
        (match, attrs, inner, pageNum) => `<h2 id="pdf-page-${pageNum}"${attrs}>${inner}</h2>`
    );
}
```

This enables the scroll-to-page feature:

```javascript
scrollOutputPanelToPage(nodeId, pageNum) {
    const heading = panelBody.querySelector(`#pdf-page-${pageNum}`);
    if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
```

## File Upload Handler

The PDF file upload handler (`PdfFileUploadHandler`) extends `FileUploadHandlerPlugin` and integrates with the file upload registry:

```javascript
class PdfFileUploadHandler extends FileUploadHandlerPlugin {
    async handleUpload(file, position = null, _context = {}) {
        // Validate file type and size (25 MB limit)
        this.validateFile(file, MAX_SIZE, 'PDF');

        // Create placeholder node
        const pdfNode = createNode(NodeType.FETCH_RESULT, `Processing PDF: ${file.name}...`, { position });

        // Store PDF in IndexedDB
        const arrayBuffer = await file.arrayBuffer();
        await setPdfForNode(pdfNode.id, arrayBuffer);

        // Upload to backend for text extraction
        const response = await fetch(apiUrl('/api/upload-file'), {
            method: 'POST',
            body: formData,
        });

        // Update node with extracted content and metadata
        this.graph.updateNode(pdfNode.id, {
            content: data.content,
            title: data.title || file.name,
            metadata: {
                content_type: 'pdf',
                pdf_source: 'upload',
                page_count: data.page_count,
            },
        });
    }
}

// Registration
FileUploadRegistry.register({
    id: 'pdf',
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
    handler: PdfFileUploadHandler,
    priority: PRIORITY.BUILTIN,
});
```

### Backend Text Extraction

The backend endpoint (`/api/upload-file`) uses PyMuPDF (fitz) to extract text from uploaded PDFs:

```python
# In app.py or file upload handler
import fitz  # PyMuPDF

def extract_text_from_pdf(file_bytes):
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text_parts = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text()
        if text.strip():
            text_parts.append(f"## Page {page_num}\n\n{text.strip()}")
    return "\n\n".join(text_parts), doc.page_count
```

## Open Questions and Future Decisions

### Resolved

1. ✅ PDF.js for client-side rendering
2. ✅ PyMuPDF for backend text extraction

### Deferred

1. Text layer for selection - add overlay for direct selection
2. Thumbnail navigation - sidebar with page previews
3. Annotation support - highlight, annotate on PDF pages
4. Search within PDF - dedicated search UI
5. Render scale optimization - quality/performance setting
6. Scanned PDF handling - OCR integration

**Trade-off**: OCR is computationally expensive and would require backend processing. Tesseract.js could run client-side but with significant performance impact.

## References to HLD

This design implements several principles from the [High-Level Design](../high-level-design.md):

### Node Types (Section 6)

PDF nodes fall under the "Documents" category in the HLD's node type taxonomy:

| Category  | Node Types                            |
| --------- | ------------------------------------- |
| Documents | PDFs, PowerPoint, YouTube transcripts |

### Plugin-Extensible (Section 4.3)

The PDF node follows the three-level plugin architecture:

1. **Level 1**: Custom node type (`PdfNode` protocol class)
2. **Level 2**: Feature integration (file upload handler)
3. **Level 3**: Canvas hydration hook (lazy loading)

### Local-First (Section 4.1)

PDF storage uses IndexedDB, keeping all user data in the browser. No server-side storage of PDF files.

### Streaming-First (Section 4.5)

While PDF viewing isn't streaming, the progressive rendering (placeholder -> loading -> first page) follows the same philosophy of showing feedback immediately rather than waiting for complete operations.

### Vanilla JavaScript (Section 8.1)

The PDF implementation uses plain JavaScript with PDF.js, avoiding framework dependencies.
