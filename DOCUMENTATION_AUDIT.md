# Documentation Accuracy Audit

This document identifies inaccuracies and gaps in the Canvas-Chat documentation, prioritized for fixing.

## Critical Inaccuracies (Fix Immediately)

### 1. **AGENTS.md: renderEdgeWithFreshPositions() doesn't exist**

- **Location**: `AGENTS.md` lines 733, 753, 756
- **Issue**: Documents `canvas.renderEdgeWithFreshPositions(edge, graph)` but this method doesn't exist
- **Reality**: The method is `canvas.renderEdge(edge, graph)` which automatically fetches fresh positions
- **Impact**: HIGH - Developers will try to use a non-existent method
- **Fix**: Update AGENTS.md to use correct method name `renderEdge(edge, graph)`

### 2. **Slash Command Registration Pattern Incomplete**

- **Location**: `docs/how-to/create-feature-plugins.md`, `docs/how-to/build-plugins.md`
- **Issue**: Documentation only shows registration via `FeatureRegistry.register()` with `slashCommands` array, but doesn't explain the dual pattern
- **Reality**: Plugins can ALSO implement `getSlashCommands()` method that returns command metadata (command, description, placeholder). FeatureRegistry calls this to populate the slash command menu via `getSlashCommandsWithMetadata()`
- **Evidence**:
  - `note.js` implements `getSlashCommands()` method
  - `FeatureRegistry.getSlashCommandsWithMetadata()` calls `feature.getSlashCommands()` on each feature
  - Built-in features are registered with `slashCommands` array in `registerBuiltInFeatures()`
  - External plugins (like poll.js) can use either pattern
- **Impact**: MEDIUM - Confusing for plugin developers who see both patterns
- **Fix**: Document both registration patterns clearly:
  - Pattern 1: Register via `FeatureRegistry.register()` with `slashCommands` array (for built-ins)
  - Pattern 2: Implement `getSlashCommands()` method (for metadata in command menu)
  - Explain when to use each

### 3. **AppContext API Missing Properties**

- **Location**: `docs/reference/app-context-api.md`
- **Issue**: Several AppContext properties are not documented
- **Missing Properties**:
  - `chatInput` (HTMLInputElement) - Chat input element
  - `undoManager` (UndoManager) - Undo/redo functionality
  - `modalManager` (ModalManager) - Modal management (mentioned but not fully documented)
  - `updateCollapseButtonForNode` (function) - Helper for collapse button updates
  - `adminMode` (boolean) - Whether admin mode is enabled
  - `adminModels` (array) - Models configured by admin (admin mode only)
- **Impact**: MEDIUM - Plugin developers won't know these are available
- **Fix**: Add complete property list to AppContext API reference

## High Priority Gaps (Document Missing)

### 4. **File Upload Handler Plugin API Reference - MISSING**

- **Location**: `docs/reference/` (doesn't exist)
- **Issue**: No reference documentation for file upload handler plugin system
- **What's Missing**:
  - `FileUploadHandlerPlugin` (JS) base class API
  - `FileUploadRegistry` (JS) registration and lookup API
  - `FileUploadHandlerPlugin` (Python) base class API
  - `FileUploadRegistry` (Python) registration API
  - How to create custom file type handlers
- **Impact**: HIGH - File upload handlers are a major plugin type but undocumented
- **Priority**: Create `docs/reference/file-upload-handler-api.md`

### 5. **Python Plugin API Reference - MISSING**

- **Location**: `docs/reference/` (doesn't exist)
- **Issue**: No reference documentation for Python plugins
- **What's Missing**:
  - `FileUploadHandlerPlugin` (Python) base class
  - `FileUploadRegistry` (Python) registration
  - How Python plugins are loaded (importlib)
  - Plugin configuration (`PluginConfig` dataclass)
  - Backend plugin patterns
- **Impact**: HIGH - Python plugins are a core feature but undocumented
- **Priority**: Create `docs/reference/python-plugin-api.md` or add to existing file upload docs

### 6. **Plugin Configuration Reference - INCOMPLETE**

- **Location**: `docs/reference/` (doesn't exist)
- **Issue**: Plugin configuration formats are mentioned in how-to guides but not in reference docs
- **What's Missing**:
  - `PluginConfig` dataclass reference
  - All three configuration formats (JS-only, Python-only, paired) with examples
  - How plugin IDs work (explicit vs derived)
  - How Python plugins are loaded at startup
  - How JavaScript plugins are served and injected
- **Impact**: MEDIUM - Configuration is critical but not fully documented
- **Priority**: Create `docs/reference/plugin-configuration.md` or add to config reference

### 7. **External Plugin Auto-Registration Pattern - INCOMPLETE**

- **Location**: `docs/how-to/build-plugins.md`, `docs/how-to/create-feature-plugins.md`
- **Issue**: How external plugins register themselves when loaded from config.yaml is not fully explained
- **What's Missing**:
  - The `window.app` global access pattern
  - The `app-plugin-system-ready` event
  - How to check if plugin system is ready
  - Example of self-registering plugin (poll.js pattern)
- **Impact**: MEDIUM - External plugins need this to work
- **Priority**: Add section to build-plugins.md explaining external plugin registration

## Medium Priority Inaccuracies

### 8. **Canvas API: renderEdge() Signature Documentation**

- **Location**: `docs/reference/app-context-api.md` line 222
- **Issue**: Shows only legacy signature `renderEdge(edge, fromPos, toPos)`
- **Reality**: Method supports two signatures:
  - `renderEdge(edge, graph)` - Recommended, automatically fetches fresh positions
  - `renderEdge(edge, sourcePos, targetPos)` - Legacy, uses explicit positions
- **Impact**: MEDIUM - Developers might use outdated pattern
- **Fix**: Update Canvas API docs to show both signatures, recommend the graph signature

### 9. **FeatureRegistry: getSlashCommandsWithMetadata() Not Documented**

- **Location**: `docs/reference/feature-registry-api.md`
- **Issue**: `getSlashCommandsWithMetadata()` method exists but is not documented
- **Reality**: Returns commands with full metadata (command, description, placeholder) for UI display
- **Impact**: LOW - Used internally by slash command menu, but should be documented for completeness
- **Fix**: Add to FeatureRegistry API reference

### 10. **Built-in Features Count Inaccuracy**

- **Location**: `AGENTS.md` line 2540, `docs/how-to/create-feature-plugins.md`
- **Issue**: Says "6 features" but actually registers 7 features (committee, flashcards, matrix, factcheck, research, code, note)
- **Impact**: LOW - Minor inaccuracy
- **Fix**: Update count to 7

## Medium Priority Gaps

### 11. **ModalManager Plugin API - MISSING**

- **Location**: `docs/reference/` (doesn't exist)
- **Issue**: ModalManager plugin registration methods are not documented
- **What's Missing**:
  - `registerModal(pluginId, modalId, htmlTemplate)`
  - `showPluginModal(pluginId, modalId)`
  - `hidePluginModal(pluginId, modalId)`
  - `getPluginModal(pluginId, modalId)`
- **Impact**: MEDIUM - Plugins need modals but API is undocumented
- **Priority**: Add to AppContext API or create separate ModalManager reference

### 12. **StreamingManager API - MISSING**

- **Location**: `docs/reference/` (doesn't exist)
- **Issue**: StreamingManager is mentioned in guides but API is not documented
- **What's Missing**:
  - `register(nodeId, config)` method
  - `unregister(nodeId)` method
  - `stopGroup(groupId)` method
  - Configuration options (abortController, featureId, groupId, onStop, onContinue)
- **Impact**: MEDIUM - StreamingManager is the preferred way to handle streaming but API is undocumented
- **Priority**: Create `docs/reference/streaming-manager-api.md` or add to AppContext API

### 13. **Node Protocol API Reference - INCOMPLETE**

- **Location**: `docs/reference/` (may exist but need to check)
- **Issue**: BaseNode protocol methods may not be fully documented
- **What to Verify**:
  - All BaseNode methods (getTypeLabel, getTypeIcon, renderContent, getActions, getEventBindings, etc.)
  - NodeRegistry registration API
  - Custom node type creation patterns
- **Impact**: MEDIUM - Custom node types are Level 1 plugins but may be underdocumented
- **Priority**: Verify completeness of node-protocols.md

### 14. **Canvas Event System - INCOMPLETE**

- **Location**: `docs/reference/app-context-api.md`
- **Issue**: Canvas event emission and handling not fully documented
- **What's Missing**:
  - How to emit canvas events (`canvas.emit('eventName', nodeId, ...args)`)
  - How `getCanvasEventHandlers()` works
  - Event handler signature (receives args directly, not wrapped in event object)
  - Difference between canvas events and feature registry events
- **Impact**: MEDIUM - Custom nodes need to emit events but pattern is unclear
- **Priority**: Add section to AppContext API or create separate canvas events reference

## Low Priority Gaps

### 15. **Python Backend API Endpoints - MISSING**

- **Location**: `docs/reference/` (doesn't exist)
- **Issue**: Backend API endpoints for plugins are not documented
- **What's Missing**:
  - `/api/upload-file` endpoint (generic file upload)
  - How to create custom backend endpoints for plugins
  - Request/response formats
  - Error handling patterns
- **Impact**: LOW - Most plugins won't need custom endpoints, but paired plugins might
- **Priority**: Create `docs/reference/backend-api.md` or add to plugin guides

### 16. **Plugin Testing Patterns - INCOMPLETE**

- **Location**: `docs/how-to/create-feature-plugins.md`, `docs/how-to/build-plugins.md`
- **Issue**: Testing section exists but could be more comprehensive
- **What's Missing**:
  - How to test file upload handlers
  - How to test Python plugins
  - How to test paired plugins (JS + Python)
  - Mocking patterns for AppContext
- **Impact**: LOW - Testing is covered but could be more detailed
- **Priority**: Expand testing sections in existing guides

### 17. **Plugin Lifecycle Events - INCOMPLETE**

- **Location**: `docs/reference/extension-hooks.md` (may exist)
- **Issue**: Need to verify all lifecycle events are documented
- **What to Verify**:
  - When `onLoad()` is called (before/after what?)
  - When `onUnload()` is called
  - Plugin initialization order
  - Event subscription timing
- **Impact**: LOW - Lifecycle is documented but details may be missing
- **Priority**: Verify and complete lifecycle documentation

## Summary by Priority

### Critical (Fix Immediately)

1. ✅ AGENTS.md: renderEdgeWithFreshPositions() doesn't exist
2. ✅ Slash command registration pattern incomplete
3. ✅ AppContext API missing properties

### High Priority (Document Next)

1. ✅ File Upload Handler Plugin API Reference - MISSING
2. ✅ Python Plugin API Reference - MISSING
3. ✅ Plugin Configuration Reference - INCOMPLETE
4. ✅ External Plugin Auto-Registration Pattern - INCOMPLETE

### Medium Priority

1. ✅ Canvas API: renderEdge() signature documentation
2. ✅ FeatureRegistry: getSlashCommandsWithMetadata() not documented
3. ✅ Built-in features count inaccuracy
4. ✅ ModalManager Plugin API - MISSING
5. ✅ StreamingManager API - MISSING
6. ✅ Node Protocol API Reference - INCOMPLETE
7. ✅ Canvas Event System - INCOMPLETE

### Low Priority

1. ✅ Python Backend API Endpoints - MISSING
2. ✅ Plugin Testing Patterns - INCOMPLETE
3. ✅ Plugin Lifecycle Events - INCOMPLETE

## Recommended Writing Order

1. **Fix Critical Inaccuracies** (Items 1-3)
   - Quick fixes, high impact
   - Prevents developer confusion

2. **File Upload Handler API Reference** (Item 4)
   - High impact, frequently needed
   - Complete the plugin system documentation

3. **Python Plugin API Reference** (Item 5)
   - High impact, paired with file upload docs
   - Complete backend plugin documentation

4. **Plugin Configuration Reference** (Item 6)
   - High impact, needed for all plugins
   - Complete the configuration story

5. **External Plugin Registration** (Item 7)
   - Medium impact, needed for external plugins
   - Complete the plugin loading story

6. **StreamingManager API** (Item 12)
   - Medium impact, preferred pattern
   - Complete streaming documentation

7. **ModalManager Plugin API** (Item 11)
   - Medium impact, needed for UI plugins
   - Complete modal system documentation

8. **Remaining Medium Priority Items** (Items 8-10, 13-14)
   - Complete API references
   - Fill documentation gaps

9. **Low Priority Items** (Items 15-17)
   - Nice to have
   - Complete documentation coverage
