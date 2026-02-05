/**
 * PDF viewer and text extraction (PDF.js)
 *
 * Loaded by the PDF plugin only. Worker is configured here so app.js stays untouched.
 * Uses CDN so no need to serve node_modules; same version as package.json (pdfjs-dist).
 */

/** Action bar definitions for PDF viewer pagination (used by fetch-result-node for PDF content) */
export const PDF_PREV_PAGE = { id: 'pdf-prev-page', label: '◀ Prev', title: 'Previous page (←)' };
export const PDF_NEXT_PAGE = { id: 'pdf-next-page', label: 'Next ▶', title: 'Next page (→)' };

const PDFJS_CDN_VERSION = '5.4.624';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/build`;

let pdfjsLibPromise = null;

/**
 * Get the PDF.js library (lazy load from CDN, set worker once).
 * @returns {Promise<typeof import('pdfjs-dist')>}
 */
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

/**
 * Load a PDF document from URL or ArrayBuffer.
 * @param {string|ArrayBuffer|Uint8Array} source - URL or binary source
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function loadDocument(source) {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument(source);
    return loadingTask.promise;
}

/**
 * Extract text from all pages of a loaded PDF.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @returns {Promise<string>} Plain text with "## Page N" between pages
 */
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
    const full = parts.length ? parts.join('\n\n') : '(No extractable text; this may be a scanned PDF)';
    return full;
}

/**
 * Render one page of a PDF to a canvas element.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNum - 1-based page number
 * @param {HTMLCanvasElement} canvas
 * @param {number} [scale=1.5]
 * @returns {Promise<{ viewport: import('pdfjs-dist').PageViewport }>}
 */
export async function renderPageToCanvas(pdfDoc, pageNum, canvas, scale = 1.5) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const ctx = canvas.getContext('2d');
    await page.render({
        canvasContext: ctx,
        viewport,
    }).promise;
    return { viewport };
}

/**
 * Render one page to canvas only (no text layer).
 * Text selection is provided via the output panel with extracted text.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNum - 1-based page number
 * @param {HTMLCanvasElement} canvasEl
 * @param _textLayerEl
 * @param {number} [scale=1.5]
 * @returns {Promise<void>}
 */
export async function renderPageWithTextLayer(pdfDoc, pageNum, canvasEl, _textLayerEl, scale = 1.5) {
    await renderPageToCanvas(pdfDoc, pageNum, canvasEl, scale);
}

// -----------------------------------------------------------------------------
// IndexedDB storage for uploaded PDFs (by node id)
// -----------------------------------------------------------------------------
const PDF_STORE_NAME = 'canvas-chat-pdf';
const DB_NAME = 'canvas-chat-pdf-db';
const DB_VERSION = 1;

/**
 * Open IndexedDB for PDF storage.
 * @returns {Promise<IDBDatabase>}
 */
function openPdfDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(PDF_STORE_NAME, { keyPath: 'nodeId' });
        };
    });
}

/**
 * Store PDF bytes for a node (upload path).
 * @param {string} nodeId
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<void>}
 */
export async function setPdfForNode(nodeId, arrayBuffer) {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
        tx.objectStore(PDF_STORE_NAME).put({ nodeId, arrayBuffer });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Get PDF bytes for a node.
 * @param {string} nodeId
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function getPdfForNode(nodeId) {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PDF_STORE_NAME, 'readonly');
        const req = tx.objectStore(PDF_STORE_NAME).get(nodeId);
        req.onsuccess = () => {
            db.close();
            resolve(req.result ? req.result.arrayBuffer : null);
        };
        req.onerror = () => reject(req.error);
    });
}
