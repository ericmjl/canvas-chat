# Manual Testing Plan for Canvas Chat

This guide provides a prescriptive, step-by-step testing plan for newcomers and contributors.
Follow each section carefully before submitting PRs.

## Prerequisites

1. Run `pixi run dev` to start the development server
2. Open `http://localhost:8000` in your browser
3. Open browser DevTools (F12) and watch the Console tab for errors
4. Clear localStorage if you have stale state: run `localStorage.clear()` in console then refresh

## Core Chat Functionality

### Test 1: Basic Chat Flow

**Steps:**

1. Click into the main input area at the bottom
2. Type "Hello, how are you today?" and press Enter
3. **Verify:** A HUMAN node appears with your message
4. **Verify:** An AI node appears and streams a response
5. **Verify:** After streaming completes, the AI node shows the full response
6. **Verify:** Console has no errors

### Test 2: Reply to an AI Node

**Steps:**

1. After Test 1, click on the AI node to select it
2. **Verify:** Node is highlighted with a blue border
3. Click the Reply button (speech bubble icon) in the node actions OR press `r`
4. Type "Tell me more" and press Enter
5. **Verify:** A new HUMAN node appears as a child of the AI node
6. **Verify:** A new AI node streams a response
7. **Verify:** Edges connect the nodes correctly in the graph

### Test 3: Branch a Conversation

**Steps:**

1. Click on any node with existing children to select it
2. Press `r` or click Reply
3. Type a different question and press Enter
4. **Verify:** A new branch is created (the original children remain, new branch appears)
5. **Verify:** Both branches are visible on the canvas

## Slash Commands

### Test 4: /reflect Command

**Steps:**

1. Have at least 3-4 nodes in your conversation
2. Select a leaf node (a node with no children)
3. Type `/reflect` in the input and press Enter
4. **Verify:** A REFLECTION node appears IMMEDIATELY with a spinner/progress indicator
5. **Verify:** Progress messages appear in the node (e.g., "Thinking...", "Using tool: graph:getPathContent")
6. **Verify:** After completion, the node shows structured reflection content
7. **Verify:** An edge connects the selected node to the reflection node

### Test 5: /committee Command

**Steps:**

1. Select a node
2. Type `/committee What is the best programming language for data science?` and press Enter
3. **Verify:** Committee settings modal appears
4. Select 2-3 models and click Start
5. **Verify:** OPINION nodes appear for each model
6. **Verify:** SYNTHESIS node appears and streams the final synthesis
7. **Verify:** Edges connect opinions to synthesis node correctly

### Test 6: /reflect After /committee

**Steps:**

1. Complete Test 5 (committee → synthesis)
2. Select the SYNTHESIS node (the final one)
3. Type `/reflect` and press Enter
4. **Verify:** Reflection node appears with spinner inside
5. **Verify:** Edge goes from SYNTHESIS node → REFLECTION node only
6. **Verify:** NO unexpected edges to OPINION or REVIEW nodes (this was a known bug - verify it's fixed)

### Test 7: Config-Based Agent (if configured)

**Prerequisites:** Uncomment an agent in `config.yaml` (e.g., `/research-config`)

**Steps:**

1. Type `/` in the input area
2. **Verify:** The config-based agent appears in the slash command autocomplete menu
3. Type the full command (e.g., `/research-config quantum computing`) and press Enter
4. **Verify:** Agent executes without "Engine not found" error
5. **Verify:** Output node appears with the agent's response

## Canvas Interactions

### Test 8: Pan and Zoom

**Steps:**

1. Click and drag on empty canvas space
2. **Verify:** Canvas pans in the direction you drag
3. Use mouse wheel to zoom in and out
4. **Verify:** Zoom level changes (nodes get bigger/smaller)
5. Press Home key or double-click empty space
6. **Verify:** Canvas resets to fit all nodes

### Test 9: Multi-Select Nodes

**Steps:**

1. Hold Shift and click on multiple nodes
2. **Verify:** All clicked nodes are selected (multiple blue borders)
3. Drag one of the selected nodes
4. **Verify:** All selected nodes move together
5. Press Delete key
6. **Verify:** All selected nodes are deleted

### Test 10: Node Selection and Focus

**Steps:**

1. Click on a node to select it
2. **Verify:** Node gets a blue border
3. Click on another node
4. **Verify:** First node is deselected, second node is selected
5. Click on empty canvas
6. **Verify:** No nodes are selected
7. **Verify:** Input area is NOT focused when clicking canvas (known focus bug area)

## Error Handling

### Test 11: API Key Missing

**Steps:**

1. Clear your API keys: `localStorage.removeItem('openai_api_key')` (or equivalent)
2. Try to send a chat message
3. **Verify:** Settings modal appears prompting for API key
4. **Verify:** No cryptic errors in console

### Test 12: Network Error Recovery

**Steps:**

1. Open Network tab in DevTools
2. Disable network (set to Offline)
3. Try to send a chat message
4. **Verify:** Graceful error message appears (not a crash)
5. Re-enable network
6. Try again
7. **Verify:** Message sends successfully

## Undo/Redo

### Test 13: Basic Undo/Redo

**Steps:**

1. Create a new node (type a message and send)
2. Press Ctrl+Z (Cmd+Z on Mac)
3. **Verify:** Node is removed from canvas
4. Press Ctrl+Shift+Z (Cmd+Shift+Z on Mac)
5. **Verify:** Node reappears

### Test 14: Undo After Move

**Steps:**

1. Select a node
2. Drag it to a new position
3. Press Ctrl+Z
4. **Verify:** Node returns to original position

## File Uploads

### Test 15: PDF Upload

**Steps:**

1. Click the file upload button (📎 icon)
2. Select a PDF file
3. **Verify:** PDF node appears on canvas
4. **Verify:** PDF thumbnail/preview is visible
5. Click on the PDF node and ask a question about it
6. **Verify:** AI response references the PDF content

### Test 16: Image Upload

**Steps:**

1. Click the file upload button
2. Select an image file (PNG, JPG)
3. **Verify:** Image node appears on canvas
4. **Verify:** Image is displayed in the node
5. Click on the image node and ask "What's in this image?"
6. **Verify:** AI describes the image (if using a vision-capable model)

## Settings and Persistence

### Test 17: Settings Modal

**Steps:**

1. Click the Settings gear icon (⚙️)
2. **Verify:** Settings modal opens
3. Enter API keys
4. Click Save
5. **Verify:** Modal closes
6. Refresh the page
7. Open Settings again
8. **Verify:** API keys are still saved (shown as masked)

### Test 18: Session Persistence

**Steps:**

1. Create several nodes in a conversation
2. Take note of the node positions
3. Close the browser tab
4. Re-open `http://localhost:8000`
5. **Verify:** Your conversation is restored
6. **Verify:** Node positions are preserved

## Performance

### Test 19: Large Graph Performance

**Steps:**

1. Create 20+ nodes in a conversation (use quick replies)
2. Pan around the canvas
3. **Verify:** Smooth panning (no jitter)
4. Zoom in and out
5. **Verify:** Zoom is smooth
6. Select multiple nodes
7. **Verify:** No noticeable lag

## Console Error Audit

### Test 20: Zero Console Errors

**Steps:**

1. Clear your browser console
2. Perform all the tests above
3. At the end, check the console
4. **Verify:** No JavaScript errors
5. **Verify:** No "undefined" or "null" errors
6. **Verify:** Warnings are acceptable but errors are not

---

## Checklist for PR Submissions

Before submitting a PR, verify:

- [ ] Tests 1-3 (Basic Chat) pass
- [ ] Test 4-5 (Slash Commands) pass with your changes
- [ ] Test 10 (Node Selection and Focus) doesn't regress
- [ ] Test 13-14 (Undo/Redo) don't regress
- [ ] Test 20 (Zero Console Errors) passes
- [ ] `pixi run test` passes (Python tests)
- [ ] `pixi run test-js` passes (JavaScript tests)
- [ ] JSDoc linting passes (`pixi run jsdoc`)

---

## Known Issues to Watch For

1. **Reflection Edge Bug**: After committee→synthesis→reflect, reflection node should NOT have an edge to a review node
2. **Focus Issues**: After certain interactions, input might lose focus or gain focus unexpectedly
3. **Engine Config**: Config agents using "built-in" or "Builtin" should normalize to "builtin"
4. **Working Node Spinner**: For long operations, spinner should be INSIDE the node, not floating
