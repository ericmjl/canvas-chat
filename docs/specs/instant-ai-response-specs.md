# Instant AI Response Specifications

**Created**: 2026-03-18
**Status**: Active
**HLD**: [High-Level Design](../high-level-design.md) (Section 4.6)
**LLD**: [Instant AI Response LLD](../llds/instant-ai-response.md)

## Feature Overview

Instant AI Response (also called "Copilot Mode") provides real-time AI suggestions as users type in the chat input. When enabled with valid API keys, the system displays a "ghost" AI node that streams suggestions, which users can accept with Tab or ignore by continuing to type.

## Status Key

- `[ ]` Active requirement
- `[x]` Implemented requirement
- `[D]` Deferred requirement

---

## Feature Toggle Specifications

### [ ] INST-UI-001

When the user navigates to Settings, the system SHALL display an "Instant AI Response" section with a toggle switch.

### [ ] INST-UI-002

When the user enables the toggle, the system SHALL save the preference to localStorage.

### [ ] INST-UI-003

When the user disables the toggle, the system SHALL immediately cancel any pending suggestion and reset to IDLE state.

---

## Debouncing Specifications

### [ ] INST-CTL-001

When the user types in the chat input, the system SHALL wait 500ms (debounce delay) after the last keystroke before triggering a suggestion request.

### [ ] INST-CTL-002

When the user types fewer than 10 characters, the system SHALL NOT trigger a suggestion request.

### [ ] INST-CTL-003

When the user continues typing while a suggestion is streaming, the system SHALL cancel the current streaming request and start a new debounce timer.

### [ ] INST-CTL-004

When the user clears the chat input completely, the system SHALL cancel any pending suggestion and reset to IDLE state.

---

## Ghost Node Specifications

### [ ] INST-NODE-001

When a suggestion request is triggered, the system SHALL create a ghost AI node on the canvas with 50% opacity and dashed border styling.

### [ ] INST-NODE-002

When the system receives streaming tokens from the LLM, the system SHALL update the ghost node content in real-time.

### [ ] INST-NODE-003

When the suggestion is accepted (Tab pressed), the system SHALL convert the ghost node to a regular AI node with full opacity and solid border.

### [ ] INST-NODE-004

When the suggestion is cancelled (Escape pressed), the system SHALL remove the ghost node from the canvas and cancel any ongoing streaming.

### [ ] INST-NODE-005

When the suggestion is superseded (user continues typing), the system SHALL finalize the ghost node as a real AI node and begin a new suggestion.

---

## Acceptance Interaction Specifications

### [ ] INST-KEY-001

When the user presses the Tab key while a ghost node is streaming, the system SHALL finalize the suggestion as a real AI node.

### [ ] INST-KEY-002

When the user presses the Escape key while a ghost node is streaming, the system SHALL cancel the suggestion and remove the ghost node.

### [ ] INST-KEY-003

When the user presses Enter before any suggestion is triggered, the system SHALL treat the input as a normal message send (existing behavior).

### [ ] INST-KEY-004

When the user presses Enter while a ghost node is streaming, the system SHALL accept the current suggestion and also finalize the human message.

---

## Context Building Specifications

### [ ] INST-CTX-001

When building context for a suggestion request, the system SHALL include the conversation history from selected parent nodes.

### [ ] INST-CTX-002

When building context for a suggestion request, the system SHALL include the user's current typed input as the final message.

### [ ] INST-CTX-003

When no parent nodes are selected, the system SHALL build context from the most recent conversation branch.

---

## Error Handling Specifications

### [ ] INST-ERR-001

When the suggestion request fails due to network error, the system SHALL remove the ghost node and show a subtle error indicator on the chat input.

### [ ] INST-ERR-002

When the suggestion request fails due to authentication error, the system SHALL remove the ghost node and show a toast notification directing user to Settings.

### [ ] INST-ERR-003

When the LLM response exceeds 2000 tokens, the system SHALL truncate the response at 2000 tokens and show "..." indicator.

---

## API Key Validation Specifications

### [ ] INST-AUTH-001

When Instant AI is enabled but no API keys are configured, the system SHALL show a toast notification on first typing attempt.

### [ ] INST-AUTH-002

When the configured API key becomes invalid, the system SHALL show an authentication error toast and fall back to traditional send mode.

---

## Slash Command Specifications

### [ ] INST-SLASH-001

When the user types `/instant`, the system SHALL toggle the Instant AI Response feature on/off.

### [ ] INST-SLASH-002

When the user types `/instant on`, the system SHALL enable Instant AI Response.

### [ ] INST-SLASH-003

When the user types `/instant off`, the system SHALL disable Instant AI Response.

---

## Settings Persistence Specifications

### [ ] INST-PERSIST-001

The system SHALL persist the Instant AI enabled/disabled state to localStorage.

### [ ] INST-PERSIST-002

The system SHALL persist the selected model for Instant AI to localStorage.

### [ ] INST-PERSIST-003

The system SHALL load the Instant AI preferences from localStorage on application startup.
