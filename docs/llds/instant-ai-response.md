# Instant AI Response (Copilot Mode)

**Created**: 2026-03-18
**Status**: Design Phase
**Component**: Frontend Feature Plugin
**Supersedes**: N/A

## Context and Design Philosophy

### Problem Statement

Traditional chat interfaces require an explicit "send" action to trigger AI responses. While functional, this creates friction in fluid conversations where users want immediate AI assistance as they think out loud. GitHub Copilot demonstrated that AI can feel more like a collaborator when it anticipates and responds in real-time.

### Design Goals

1. **Immediate presence**: AI node appears as the user types, not after sending
2. **Non-blocking**: User remains in control - can accept, ignore, or override
3. **Resource efficient**: Debounced requests prevent excessive API calls
4. **Opt-in**: Traditional send-button flow remains the default

### User Experience Flow

```text
User starts typing message
    ↓
[Debounce 500ms]
    ↓
If Instant AI Response enabled + API keys set:
    Create "ghost" AI node on canvas
    Stream suggestion in real-time
    ↓
User actions:
  - Press Tab → Accept suggestion (finalize node)
  - Continue typing → Suggestion updates, original becomes human node
  - Press Escape → Cancel suggestion
  - Press Enter → Treat as normal send
```

## Technical Design

### Architecture

The feature is implemented as a **Feature Plugin** (`instant-ai.js`) that:

1. Watches chat input for changes
2. Debounces input to avoid excessive API calls
3. Creates a special "pending" AI node that streams in real-time
4. Handles Tab acceptance, Escape cancellation, and continuation scenarios

### State Machine

```text
IDLE → TRIGGERED → STREAMING → ACCEPTED | CANCELLED | SUPERSEDED

- IDLE: No pending suggestion, normal typing
- TRIGGERED: Debounce complete, request sent
- STREAMING: Receiving tokens, showing in ghost node
- ACCEPTED: User pressed Tab, ghost becomes real node
- CANCELLED: User pressed Escape, ghost removed
- SUPERSEDED: User kept typing, suggestion cancelled (new suggestion starts)
```

### Debouncing Strategy

- **Delay**: 500ms after last keystroke before triggering
- **Minimum length**: 10 characters minimum to trigger (avoid trivial suggestions)
- **Reset**: Any input change resets the debounce timer

### Ghost Node Behavior

A "ghost" AI node differs from a regular AI node:

| Property | Regular AI Node     | Ghost AI Node                  |
| -------- | ------------------- | ------------------------------ |
| Visual   | Solid styling       | 50% opacity, dashed border     |
| Content  | Saved to graph      | Temporarily displayed          |
| Edges    | Created immediately | Edges created on accept        |
| Undo     | Normal undo         | Cancel restores previous state |

### API Request Batching

The feature batches the user's typed content with context:

```javascript
async triggerSuggestion(inputText, context) {
    // Build messages: context + user's current input
    const messages = [
        ...context,
        { role: 'user', content: inputText }
    ];

    // Send to /api/chat with streaming
    await streamWithAbort(pendingNodeId, abortController, messages, model,
        onChunk: (chunk) => updateGhostNode(chunk),
        onDone: () => finalizeGhostNode(),
        onError: () => showGhostNodeError()
    );
}
```

### Key Interactions

#### Tab to Accept

When user presses Tab:

1. Cancel any ongoing streaming
2. Create human node with typed content
3. Convert ghost AI node to real AI node
4. Create reply edge from human to AI
5. Save to graph, clear pending state

#### Typing Continuation

When user continues typing while ghost is streaming:

1. Cancel current streaming (abort signal)
2. Create human node with previous typed content
3. Convert ghost to real AI node
4. Start new debounce with new content

#### Escape to Cancel

When user presses Escape:

1. Remove ghost node from canvas
2. Cancel any ongoing streaming
3. Return to IDLE state
4. Chat input retains focus

#### Enter Without Suggestion

If user presses Enter before suggestion triggers:

- Treat as normal send (no ghost, just human + AI flow)

## Component Inventory

### InstantAIPlugin Class

```javascript
export class InstantAIPlugin extends FeaturePlugin {
    constructor(context) {
        super(context);
        this.state = 'IDLE';
        this.debounceTimer = null;
        this.pendingNodeId = null;
        this.abortController = null;
        this.currentInput = '';
    }

    getSlashCommands() {
        return [
            {
                command: '/instant',
                description: 'Toggle instant AI response mode',
                placeholder: null,
            },
        ];
    }
}
```

### Ghost Node Renderer

Ghost nodes render identically to AI nodes except:

- `opacity: 0.5` on container
- `border-style: dashed` instead of solid
- No content saved until accepted

### Settings Toggle

In Settings modal, add new section:

```text
┌─────────────────────────────────────┐
│ Instant AI Response                 │
│                                     │
│ [✓] Enable instant AI suggestions  │
│                                     │
│ Model: [dropdown]                    │
│ Debounce delay: [500ms ▼]           │
│ Min characters: [10 ▼]              │
└─────────────────────────────────────┘
```

## Open Questions & Future Decisions

### Resolved

1. ✅ Feature is opt-in, not default behavior
2. ✅ Uses existing `/api/chat` endpoint with streaming
3. ✅ Ghost node visual distinction via CSS

### Deferred

1. Context window management - should we limit context for suggestions?
2. Mobile/touch handling - Tab key not available on mobile
3. Keyboard shortcut customization - allow users to remap Tab acceptance
4. Suggestion quality tuning - how to balance speed vs. quality?

## Edge Cases

### No API Keys Set

When Instant AI is enabled but no API keys are configured:

- Show toast notification: "Enable instant AI response in Settings"
- Disable trigger until keys are added

### Network Failure

If the suggestion request fails:

- Remove ghost node
- Show subtle error indicator on chat input
- Continue allowing normal send flow

### Very Long Responses

If AI response exceeds reasonable length:

- Cap at ~2000 tokens for suggestions
- Show "..." truncation indicator
- Full response available after acceptance

### Multiple Rapid Inputs

If user types, deletes, types again quickly:

- Cancel previous suggestion
- Start new debounce
- No race conditions (abort cancels old streams)

## Data Flow

```text
ChatInput 'input' event
    ↓
InstantAIPlugin.handleInputChange()
    ↓
If (enabled && input.length >= minChars):
    Clear previous timer
    Start new debounce (500ms)
    ↓
After debounce:
    Create ghost AI node
    Build context + input
    Start streaming
    ↓
User action (Tab/Escape/Continue):
    Accept/Cancel/Supersede
```

## References

- **HLD**: `/docs/high-level-design.md` (Section 4.6)
- **Feature Plugin Base**: `/docs/reference/feature-plugin-api.md`
- **Streaming Architecture**: `/docs/explanation/streaming-architecture.md`
- **Chat Module LLD**: `/docs/llds/chat-module.md`
