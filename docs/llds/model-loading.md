# Model Loading and Selection

**Created**: 2026-03-18
**Status**: Complete
**Component**: Frontend (App, Chat, Storage)
**Supersedes**: N/A

## Context and Design Philosophy

The model loading system provides a seamless experience where users set their API key once, and models automatically appear in the model picker. This "magic" behavior is achieved through dynamic fetching from providers on startup and whenever API keys change.

### Design Goals

1. **Zero-configuration defaults**: Default models should work out of the box if possible
2. **Just-in-time loading**: Models load when needed, not all at once
3. **Graceful degradation**: If one provider fails, others continue working
4. **Fast startup**: Parallel fetching from all providers simultaneously

## Technical Design

### Provider Model Fetching

The `loadModels()` function orchestrates parallel fetching:

```javascript
async loadModels() {
    const keys = storage.getApiKeys();

    // Build provider list from configured keys
    const providers = [
        { name: 'openai', key: keys.openai },
        { name: 'anthropic', key: keys.anthropic },
        { name: 'google', key: keys.google },
        { name: 'groq', key: keys.groq },
        { name: 'github', key: keys.github },
    ];

    // Parallel fetch from all providers with keys
    const fetchPromises = providers
        .filter((p) => p.key) // Skip providers without keys
        .map((p) => chat.fetchProviderModels(p.name, p.key));

    const results = await Promise.all(fetchPromises);
}
```

### Model Picker Population

After fetching, models are sorted and added to the picker:

```javascript
// Sort models: user-defined > provider-recommended > alphabetically
allModels.sort((a, b) => {
    if (a.isUserDefined && !b.isUserDefined) return -1;
    if (!a.isUserDefined && b.isUserDefined) return 1;
    return a.name.localeCompare(b.name);
});

// Add to picker
this.modelPicker.innerHTML = '';
for (const model of allModels) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = `${model.name} (${model.provider})`;
    this.modelPicker.appendChild(option);
}

// Restore last selection
const savedModel = storage.getCurrentModel();
if (savedModel && allModels.find((m) => m.id === savedModel)) {
    this.modelPicker.value = savedModel;
}
```

### Dynamic Reload Triggers

Models are reloaded in these scenarios:

| Trigger              | Location                                | Behavior             |
| -------------------- | --------------------------------------- | -------------------- |
| API key saved        | `modal-manager.js:saveSettings()`       | Calls `loadModels()` |
| Custom model added   | `modal-manager.js:addCustomModel()`     | Calls `loadModels()` |
| Custom model deleted | `modal-manager.js:deleteCustomModel()`  | Calls `loadModels()` |
| Copilot auth refresh | `modal-manager.js:refreshCopilotAuth()` | Calls `loadModels()` |
| App startup          | `app.js:init()`                         | Calls `loadModels()` |

### Model ID Convention

Models follow the `provider/model-id` convention:

| Provider       | Example Model ID               |
| -------------- | ------------------------------ |
| OpenAI         | `openai/gpt-4o`                |
| Anthropic      | `anthropic/claude-sonnet-4-5`  |
| Google         | `google/gemini-1.5-pro`        |
| Groq           | `groq/llama-3.1-70b-versatile` |
| GitHub Copilot | `github_copilot/gpt-4o`        |
| Ollama         | `ollama/llama3`                |

### Custom Models

Users can define custom models via Settings:

```javascript
// Custom model structure
{
    id: 'custom/my-model',
    name: 'My Custom Model',
    provider: 'Custom',
    baseUrl: 'https://api.example.com/v1',
    isUserDefined: true
}
```

Custom models appear in the picker alongside dynamically fetched models.

### Model Picker States

The model picker displays different states based on configuration:

| State         | Condition                | Display                                        |
| ------------- | ------------------------ | ---------------------------------------------- |
| No keys       | `allModels.length === 0` | "Configure API keys in Settings ⚙️" (disabled) |
| Models loaded | Normal operation         | List of available models                       |
| Loading       | During fetch             | (No explicit loading state; fetch is fast)     |

## API Key Retrieval

When sending a message, the system retrieves the API key for the selected model:

```javascript
getApiKeyForModel(model) {
    if (!model) return null;

    // Special case: DALL-E uses OpenAI key
    if (model.startsWith('dall-e')) {
        return storage.getApiKeyForProvider('openai');
    }

    const provider = model.split('/')[0].toLowerCase();
    return storage.getApiKeyForProvider(provider);
}
```

## OpenRouter Support

OpenRouter uses a single API key for multiple providers. The system supports OpenRouter models with:

- Custom model definition with OpenRouter base URL
- Single key for all OpenRouter models
- Provider field shows "OpenRouter"

## Admin Mode

In admin mode, models are loaded from server configuration instead of dynamically fetching:

```javascript
async loadModelsAdminMode() {
    const allModels = this.adminModels;
    // Populate picker with admin-configured models
    // No API key validation needed
}
```

Admin mode hides API key settings in the frontend since keys are managed server-side.

## References

- **Specs**: `docs/specs/core-specs.md` (CHAT-REQ-006 through CHAT-REQ-008g)
- **Storage**: `docs/llds/storage-persistence.md`
- **Chat Module**: `docs/llds/chat-module.md`
- **Implementation**: `app.js:loadModels()`, `chat.js:fetchProviderModels()`
