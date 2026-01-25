# Running AI E2E Tests

This guide explains how to run the AI interaction tests that use Ollama.

## Prerequisites

### 1. Install Ollama

Ollama is required to run AI tests locally. Install it with:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Verify Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

Should return JSON with available models.

### 2. Pull gemma3n:e4b model

The tests use `gemma3n:e4b` model (6.9B parameters). Pull it with:

```bash
ollama pull gemma3n:e4b
```

Note: This downloads ~7.5GB and may take 2-5 minutes on first pull.

### 3. Verify backend is running

The backend server must be running on port 7865:

```bash
# Terminal 1: Start backend
pixi run dev
```

Verify backend is healthy:

```bash
curl http://127.0.0.1:7865/health
```

Should return: `{"status":"ok","service":"canvas-chat","ollama":true}`

## Running Tests Locally

### Run all Cypress tests (basic + AI)

```bash
# Terminal 2: Run all Cypress tests
pixi run npm run cy:run
```

### Run only AI tests

```bash
# Terminal 2: Run only AI tests
pixi run npx cypress run --config specPattern="cypress/e2e/**/*ai*.cy.js"
```

### Run tests in interactive mode

```bash
# Terminal 2: Open Cypress test runner
pixi run npm run cy:open
```

Then select `ai_chat.cy.js` from the test runner interface.

## Test Coverage

The AI test suite includes 6 tests:

### Basic Flow Tests (fast, ~30s total)

- `configures ollama and creates human + ai nodes` - Verifies Ollama configuration and node creation
- `checks ollama model is available in picker` - Confirms model is in dropdown
- `checks that gemma3n:e4b is available` - Verifies original model is also available

### Streaming Tests (slower, ~30-60s total)

- `sends simple math question and receives answer` - Tests simple Q&A
- `handles multi-turn conversation with context` - Tests conversation memory
- `verifies streaming UI shows correctly` - Tests streaming UI controls

**Total test time:** ~1-2 minutes locally (depends on CPU speed)

## Test Behavior

### Model Selection

Tests use `gemma3:270m` (268M parameters) by default for faster execution on CPU-only machines. This is the smallest available gemma model.

Original target model `gemma3n:e4b` (6.9B) is also verified to be available.

### Ollama Performance

On CPU-only machines (like GitHub Actions runners):

- First response: 10-30 seconds (model loading)
- Streaming: 20-60 seconds per response
- Total per test: 30-90 seconds

On machines with GPU acceleration:

- First response: 2-5 seconds
- Streaming: 5-15 seconds per response
- Total per test: 10-30 seconds

### Test Timeouts

Tests use generous timeouts to accommodate CPU-only performance:

- Model fetch: 10s
- Node appearance: 10s
- Streaming wait: 8s (for partial streaming verification)
- AI node content: 10s

## CI/CD Configuration

The `.github/workflows/cypress-tests.yml` file has been updated with two parallel jobs:

1. **cypress-basic**: Runs basic E2E tests (no external dependencies)
    - Excludes AI tests with `excludeSpecPattern="**/*ai*.cy.js"`
    - Fast feedback for UI/interaction changes

2. **cypress-ai**: Runs AI tests with Ollama service
    - Uses Docker service for Ollama on port 11434
    - Pulls `gemma3n:e4b` model on first run (cached in subsequent runs)
    - Cache key: `ollama-gemma3n-e4b`
    - Runs only AI tests with `specPattern="cypress/e2e/**/*ai*.cy.js"`

### Model Caching

Ollama model weights are cached in GitHub Actions to avoid repeated downloads (~7.5GB per run):

- Cache path: `~/.ollama/models`
- Cache key: `ollama-gemma3n-e4b`
- Restore keys: `ollama-gemma3n-` (allows model updates)
- Cache expires: 7 days after last use (GitHub Actions default)

## Troubleshooting

### Tests fail with "ollama not found"

**Problem:** Ollama service not running or not installed.

**Solution:**

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running, start Ollama
ollama serve &

# If not installed, install it
curl -fsSL https://ollama.com/install.sh | sh

# Pull required model
ollama pull gemma3n:e4b
```

### Tests timeout waiting for AI response

**Problem:** Ollama is too slow on CPU-only machine.

**Solution:**

- Tests use smaller `gemma3:270m` model by default
- Verify only basic node creation (not full streaming completion)
- Run tests interactively to observe progress
- Consider using a machine with GPU for faster testing

### Model not available in picker

**Problem:** Ollama models not appearing in model dropdown.

**Solution:**

```bash
# Verify Ollama is running and has models
curl http://localhost:11434/api/tags

# Check if gemma3n:e4b is downloaded
ollama list | grep gemma3n

# If missing, pull it
ollama pull gemma3n:e4b

# In Cypress test, verify settings:
# 1. Open settings modal
# 2. Check base URL is set to http://localhost:11434
# 3. Close settings and wait for model refresh
```

### Tests pass locally but fail in CI

**Problem:** CI environment differences.

**Solution:**

- Check CI logs for Ollama service health
- Verify model was pulled successfully (look for "Model pulled successfully" in logs)
- Compare local and CI test execution times
- Run tests with `cypress open` locally to observe behavior

## Continuous Testing

For development workflow, consider running tests locally after each AI-related change:

```bash
# In one terminal, keep backend and Ollama running
pixi run dev

# In another terminal, run AI tests on each code change
pixi run npx cypress run --config specPattern="cypress/e2e/**/*ai*.cy.js"
```

This catches regressions early before pushing to CI/CD.
