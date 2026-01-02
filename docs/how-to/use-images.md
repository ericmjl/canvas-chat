# How to analyze images with AI

Canvas Chat supports multimodal conversations where you can upload images and discuss them with vision-capable LLMs.

## Prerequisites

You need an API key for a vision-capable model. These providers support image analysis:

- **OpenAI**: GPT-4o, GPT-4 Turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku
- **Google AI**: Gemini 1.5 Pro, Gemini 1.5 Flash

Make sure you have at least one of these configured in Settings.

## Adding images to your canvas

There are three ways to add images:

### Method 1: Paste from clipboard

1. Copy an image (from a screenshot, browser, or image editor)
2. Click in the canvas area
3. Press **Cmd+V** (Mac) or **Ctrl+V** (Windows/Linux)
4. An IMAGE node appears with your pasted image

### Method 2: Drag and drop

1. Open a folder with images
2. Drag an image file onto the canvas
3. Drop it anywhere on the canvas
4. An IMAGE node appears at the drop location

### Method 3: File upload button

1. Click the **📎** (Upload Image) button in the toolbar
2. Select an image file from your computer
3. An IMAGE node appears on the canvas

## Supported formats

- **JPEG/JPG**: Photos, screenshots
- **PNG**: Screenshots, diagrams, images with transparency
- **GIF**: Static images (first frame of animated GIFs)
- **WebP**: Modern web format

Images are automatically resized to a maximum of 2048 pixels on the longest side to optimize for API usage while preserving quality.

## Analyzing images

Once you have an image on the canvas:

1. **Select the image node** by clicking on it
2. **Type your question** in the chat input:
   - "What's in this image?"
   - "Describe the architecture shown here"
   - "Extract the text from this screenshot"
   - "What's wrong with this code?"
3. **Press Enter** to send

The AI response appears as a new node connected to the image.

## Combining images with conversation context

You can include images in larger conversation contexts:

### Multi-select with images

1. **Cmd/Ctrl+Click** to select both image nodes and text nodes
2. Type your message
3. The AI sees all selected content as context

Example: Select an image of a chart and a text node describing a dataset, then ask "Does this visualization accurately represent the data?"

### Branching from images

1. Select an image node
2. Use the **↩️ Reply** button or just type
3. Ask follow-up questions about the same image

The conversation branches from the image, maintaining visual context.

## Highlighting images

You can extract portions of images using the highlight feature. This is useful when an image contains multiple elements and you want to focus on one:

1. Click on an image node
2. Click the **🌿 Branch from Selection** button
3. A HIGHLIGHT node is created showing the image

Note: Currently, highlighting captures the entire image. Cropping specific regions is not yet supported.

## Use cases

### Code review

Upload a screenshot of code and ask:

- "What bugs do you see in this code?"
- "How would you refactor this?"
- "Explain what this function does"

### Diagram analysis

Upload architecture diagrams, flowcharts, or wireframes:

- "Describe the data flow in this architecture"
- "What are the potential failure points?"
- "Convert this flowchart to pseudocode"

### Document extraction

Upload photos of documents, whiteboards, or handwritten notes:

- "Transcribe this handwritten text"
- "Summarize the key points from this whiteboard"
- "Extract the table data as markdown"

### Visual debugging

Upload error screenshots, UI issues, or log outputs:

- "What does this error message mean?"
- "Why might this UI look broken?"
- "Parse these logs and find the issue"

## Tips

**Choose the right model** for image tasks. GPT-4o and Claude 3.5 Sonnet offer excellent vision capabilities.

**Be specific in your prompts.** Instead of "describe this", try "list all the UI components visible in this screenshot and their purposes."

**Combine with text context.** Select relevant text nodes alongside images to give the AI more context about what you're working on.

**Use for iteration.** Upload a design mockup, get feedback, make changes, upload the revision, and ask "Is this better?"

## Limits

- Maximum image dimension: 2048px (larger images are automatically resized)
- Supported formats: JPEG, PNG, GIF, WebP
- Images are stored in your browser's local storage (IndexedDB)
- Not all models support vision - check your model supports images before uploading
