# PowerPointNode Low-Level Design

**Created**: 2026-03-16
**Status**: Implementation
**Related HLD**: [High-Level Design](../high-level-design.md)

## Context and Design Philosophy

The PowerPointNode enables users to upload PowerPoint (.pptx) files directly onto the canvas, transforming static presentations into interactive, navigable objects. This node type exists because LLM workflows often involve analyzing or presenting slide decks, and users need a way to visually explore, annotate, and extract insights from presentations without leaving the canvas environment.

The design philosophy centers on three principles. First, progressive enhancement ensures the node remains usable even when backend dependencies like LibreOffice are unavailable by generating placeholder renderings. Second, rich interactivity distinguishes this from a simple image viewer by providing per-slide navigation, title editing, caption generation, and narrative weaving capabilities. Third, seamless integration with the broader canvas ecosystem allows slide images to be extracted as separate Image nodes, creating connections that maintain conversation context.

## Technical Details

### Architecture Overview

The PowerPoint implementation spans three primary modules. The frontend `powerpoint-node.js` defines both the node protocol and the feature plugin, handling rendering, user interactions, and LLM orchestration. The backend `pptx_handler.py` manages file processing, converting PPTX files into structured slide data with rendered images. The API endpoints in `pptx_endpoints.py` expose LLM-powered features for caption generation and narrative weaving.

```text
PowerPoint Upload Flow:
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  File Drop      │────▶│  Backend Handler │────▶│  SSE Stream     │
│  (Frontend)     │     │  (pptx_handler)  │     │  (pptx_endpoints)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │ LibreOffice       │     │ Frontend Node   │
                        │ python-pptx       │     │ Rendering       │
                        └──────────────────┘     └─────────────────┘
```

### LibreOffice Rendering Pipeline

The backend uses LibreOffice in headless mode to convert PPTX slides into PNG images. This approach ensures accurate rendering that matches what users see in PowerPoint, including fonts, layouts, and embedded media. The conversion process follows these steps:

First, the uploaded file is saved to a temporary directory. Then LibreOffice is invoked with specific flags for headless operation, including `--headless`, `--nologo`, `--nolockcheck`, `--nodefault`, and `--nofirststartwizard`. The conversion target uses the Impress PNG export filter (`png:impress_png_Export`) for best results.

A robust fallback mechanism exists for environments without LibreOffice. When the command is not found, the handler generates placeholder images using PIL that display the slide title and text content in a simple layout. This allows the UI to function even in minimal deployments, with a note indicating that LibreOffice is required for accurate rendering.

The PNG output undergoes several transformations before reaching the frontend. Images are resized to a standard width of 1024 pixels for storage and 240 pixels for thumbnails. PNG files are transcoded to WebP format for reduced bandwidth, with quality settings of 90 for full images and 70 for thumbnails. If WebP encoding fails, the system gracefully falls back to PNG.

Some LibreOffice builds only render the first slide when using plain PNG conversion. To handle this, the pipeline detects when fewer images are produced than expected slides and automatically falls back to PDF export followed by PyMuPDF rasterization. This two-stage approach ensures reliable multi-slide output across different LibreOffice versions and platforms.

### python-pptx Text Extraction

Text content extraction uses the python-pptx library to extract per-slide information before image rendering begins. This enables immediate display of slide metadata in the UI while images render in the background.

Slide titles are extracted using a two-phase approach. The system first attempts to retrieve the title placeholder shape that PowerPoint designates as the title. If that fails (common with certain templates), a heuristic identifies the first non-empty text line from any shape on the slide, truncated to 120 characters.

Text content is collected from all shapes with text frames on each slide, joined with newlines. This provides the raw material for LLM-powered caption generation.

### Streaming Upload Architecture

The upload process uses Server-Sent Events (SSE) to stream results to the frontend, providing progressive feedback during the potentially lengthy conversion process. The stream emits four event types.

The `metadata` event fires first, containing slide count, titles, and text content extracted via python-pptx. This allows the UI to display the slide structure immediately. The `progress` event periodically indicates rendering status. Individual `slide` events deliver each rendered image as it completes, enabling incremental display. Finally, the `done` event signals completion and includes the rendering mode indicator.

This architecture ensures the user sees meaningful content within seconds of upload while full rendering continues in the background.

### Slide Navigation Drawer

The slide drawer (output panel) provides a thumbnail-based navigation interface. Each row displays a 64x48 pixel thumbnail, slide number, editable title input, caption preview, and action buttons. The current slide is highlighted with an accent border and background color.

Navigation supports multiple interaction modes. Arrow key shortcuts (Left/Right) navigate between slides when the node is selected. Clicking thumbnails in the drawer jumps directly to any slide. The node body displays the current slide with previous/next buttons and a counter showing position.

The drawer implements in-place DOM patching to avoid full node re-renders during navigation. This prevents focus loss from input fields and eliminates visual flashing. The `_patchPowerPointDomInPlace` method selectively updates only the changed elements within both the node body and drawer.

### Caption and Title Generation

The LLM-powered caption feature generates one-paragraph descriptions and optional titles for individual slides or entire decks. Three API endpoints support this functionality.

The single-slide endpoint (`/api/pptx/caption-title-slide`) accepts slide text, optional existing title, and filename, returning a structured title and caption. The deck endpoint (`/api/pptx/caption-title-deck`) processes all slides in a single LLM call for consistency across the presentation. The suggestions endpoint (`/api/pptx/narrative-style-suggestions`) generates AI-powered presets for the weave narrative feature.

All endpoints support structured output when the model permits, falling back to JSON parsing from text responses when necessary. The system normalizes output to ensure captions are single paragraphs without newlines or bullet points.

Frontend state tracks enrichment status per slide using `slideEnrichStatuses` (values: idle, queued, running, done, error) and stores generated content in `slideTitles` and `slideCaptions` objects keyed by slide index.

### Slide Extraction

Users can extract the current slide as a separate Image node by clicking the slide image. This mirrors the PDF viewer behavior, showing a tooltip with an "Extract" action that creates a new node containing only that slide's image. The new node connects to the PowerPoint node via a HIGHLIGHT edge, preserving the relationship between the source presentation and extracted content.

## Weave Narrative Mode

The weave narrative feature transforms a deck's titles and captions into a cohesive written output. It supports multiple output structures including continuous narrative, executive summary with bullet points, and speaker notes format.

### Preset System

When users open the weave modal, the system automatically requests narrative style suggestions from the LLM. These suggestions are represented as presets with properties including label, description, voice/persona guidance, audience hint, desired length (short/medium/long), output structure, and slide inclusion mode (all slides or only those with captions).

If the suggestion endpoint fails, three fallback presets are available: Story Arc (coherent narrative), Executive Summary (high-level bullets with next steps), and Speaker Notes (slide-by-slide talking points).

### Modal Workflow

The weave modal presents AI-suggested presets as radio card selections. Selecting a preset auto-fills the voice, audience, length, structure, and inclusion controls. Users can customize these settings or create their own by modifying any field. The Generate button creates a new AI node connected to the PowerPoint node and streams the generated narrative into it.

The generation prompt incorporates the selected voice and audience rules, the length guidelines (paragraph count targets), and the structure rules (narrative flow versus bullet points versus speaker notes format). Only slides matching the inclusion criteria (all or only captioned) are included in the prompt.

## File Upload Handler

The file upload system uses a two-layer registration mechanism. Backend registration in `pptx_handler.py` uses the FileUploadRegistry to declare supported MIME types and extensions. Frontend registration in `powerpoint-node.js` provides the PowerPointFileUploadHandler class that implements the actual upload logic.

The frontend handler validates file type by both extension (.pptx, .ppt) and MIME type, rejecting invalid files with a clear error message. File size is validated against a 50 MB maximum. Upon valid upload, a placeholder node is created immediately with processing state, then updated progressively as SSE events arrive.

## Open Questions & Future Decisions

### Resolved

1. ✅ LibreOffice for server-side rendering
2. ✅ python-pptx for text extraction

### Deferred

1. Rendering performance - lazy loading for large decks
2. Collaborative editing - conflict resolution for multiplayer
3. Template support - preserve theme colors/fonts
4. Export capabilities - create PPTX from content

## References to HLD

This implementation supports the following HLD principles:

- **Plugin-Extensible** (Section 4.3): PowerPointNode demonstrates Level 1 (custom node type) and Level 2 (feature plugin) extensibility. The NodeRegistry handles rendering while FeatureRegistry manages slash commands and canvas event handlers.

- **Documents Node Category** (Section 6): The PowerPointNode belongs to the Documents category alongside PDF and YouTube transcript nodes, sharing common patterns for file upload, content extraction, and navigation.

- **Streaming-First** (Section 4.4): SSE streaming provides progressive feedback during upload, and the streaming infrastructure supports weave narrative generation.

- **Local-First** (Section 4.1): All slide data, titles, and captions persist in the browser via CRDT, requiring no server-side storage.
