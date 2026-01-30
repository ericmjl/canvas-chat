/**
 * Tests for agent-types.js
 *
 * Tests core type factory functions and validation.
 */

// =============================================================================
// Test Utilities
// =============================================================================

const testResults = [];

function test(name, fn) {
    try {
        fn();
        testResults.push({ name, passed: true });
        console.log(`✓ ${name}`);
    } catch (error) {
        testResults.push({ name, passed: false, error: error.message });
        console.log(`✗ ${name}: ${error.message}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Expected true');
    }
}

function assertDeepEqual(actual, expected, path = '') {
    if (typeof actual !== typeof expected) {
        throw new Error(`${path}: Type mismatch - expected ${typeof expected}, got ${typeof actual}`);
    }
    if (typeof expected === 'object' && expected !== null) {
        if (Array.isArray(expected)) {
            assertEqual(actual.length, expected.length, `${path}.length`);
            for (let i = 0; i < expected.length; i++) {
                assertDeepEqual(actual[i], expected[i], `${path}[${i}]`);
            }
        } else {
            for (const key of Object.keys(expected)) {
                assertDeepEqual(actual[key], expected[key], `${path}.${key}`);
            }
        }
    } else {
        assertEqual(actual, expected, path);
    }
}

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
    // Import modules
    const {
        createAgentDefinition,
        createRunRequest,
        createAgentRun,
        createRunContext,
        createAgentPlan,
        createPlanStep,
        createEvent,
        EventType,
        RunStatusType,
    } = await import('../src/canvas_chat/static/js/agent/agent-types.js');

    // -------------------------------------------------------------------------
    // Agent Definition Tests
    // -------------------------------------------------------------------------

    test('createAgentDefinition creates minimal definition', () => {
        const def = createAgentDefinition({
            id: 'test-agent',
            name: 'Test Agent',
            model: 'openai/gpt-4o',
            systemPrompt: 'You are a helpful assistant.',
        });

        assertEqual(def.id, 'test-agent');
        assertEqual(def.name, 'Test Agent');
        assertEqual(def.engine, 'builtin'); // Default
        assertEqual(def.model, 'openai/gpt-4o');
        assertEqual(def.systemPrompt, 'You are a helpful assistant.');
        assertTrue(Array.isArray(def.allowedTools));
        assertEqual(def.allowedTools.length, 0);
    });

    test('createAgentDefinition applies defaults', () => {
        const def = createAgentDefinition({
            id: 'test-agent',
            name: 'Test Agent',
            model: 'openai/gpt-4o',
            systemPrompt: 'Test',
        });

        assertEqual(def.budgets.maxTokens, 100000);
        assertEqual(def.budgets.maxToolCalls, 20);
        assertEqual(def.budgets.timeoutMs, 300000);
        assertEqual(def.hitl.requireApprovalForTools, false);
        assertEqual(def.hitl.requireApprovalForMutations, true);
    });

    test('createAgentDefinition allows optional model (uses app default)', () => {
        // When model is not specified, it should default to null
        // At runtime, null means "use the app-level default model"
        const def = createAgentDefinition({
            id: 'test-agent',
            name: 'Test Agent',
            systemPrompt: 'Test',
            // Note: no model specified
        });

        assertEqual(def.model, null, 'Model should be null when not specified');
        assertEqual(def.id, 'test-agent');
        assertEqual(def.name, 'Test Agent');
        assertEqual(def.systemPrompt, 'Test');
    });

    test('createAgentDefinition accepts custom budgets', () => {
        const def = createAgentDefinition({
            id: 'test-agent',
            name: 'Test Agent',
            model: 'openai/gpt-4o',
            systemPrompt: 'Test',
            budgets: {
                maxTokens: 100000,
                maxToolCalls: 50,
                timeoutMs: 600000,
            },
        });

        assertEqual(def.budgets.maxTokens, 100000);
        assertEqual(def.budgets.maxToolCalls, 50);
        assertEqual(def.budgets.timeoutMs, 600000);
    });

    test('createAgentDefinition accepts subagents', () => {
        const def = createAgentDefinition({
            id: 'supervisor',
            name: 'Supervisor',
            model: 'openai/gpt-4o',
            systemPrompt: 'You supervise workers.',
            subagents: {
                retriever: {
                    id: 'retriever',
                    name: 'Retriever',
                    model: 'openai/gpt-4o-mini',
                    systemPrompt: 'You retrieve information.',
                },
            },
        });

        assertTrue('retriever' in def.subagents);
        assertEqual(def.subagents.retriever.name, 'Retriever');
    });

    // -------------------------------------------------------------------------
    // Run Request Tests
    // -------------------------------------------------------------------------

    test('createRunRequest creates basic request', () => {
        const context = createRunContext({
            sourceNodeIds: ['node-1'],
            userQuery: 'Hello',
        });
        const request = createRunRequest('test-agent', context);

        assertEqual(request.agentId, 'test-agent');
        assertEqual(request.context.sourceNodeIds[0], 'node-1');
        assertEqual(request.context.userQuery, 'Hello');
    });

    // -------------------------------------------------------------------------
    // Agent Run Tests
    // -------------------------------------------------------------------------

    test('createAgentRun initializes with pending status', () => {
        const context = createRunContext({
            sourceNodeIds: [],
        });
        const run = createAgentRun('run-123', 'test-agent', context);

        assertEqual(run.id, 'run-123');
        assertEqual(run.agentId, 'test-agent');
        assertEqual(run.status, 'pending');
        assertTrue(run.startedAt > 0);
        assertEqual(run.completedAt, null);
        assertTrue(Array.isArray(run.events));
        assertTrue(Array.isArray(run.artifactNodeIds));
    });

    test('createAgentRun initializes metrics', () => {
        const context = createRunContext({
            sourceNodeIds: [],
        });
        const run = createAgentRun('run-123', 'test-agent', context);

        assertEqual(run.metrics.tokensUsed, 0);
        assertEqual(run.metrics.toolCallsCount, 0);
        assertEqual(run.metrics.subagentSpawns, 0);
        assertEqual(run.metrics.durationMs, 0);
    });

    // -------------------------------------------------------------------------
    // Run Context Tests
    // -------------------------------------------------------------------------

    test('createRunContext creates with source nodes', () => {
        const context = createRunContext({
            sourceNodeIds: ['node-1', 'node-2'],
            userQuery: 'What is the weather?',
            slashCommand: '/research',
        });

        assertEqual(context.sourceNodeIds.length, 2);
        assertEqual(context.userQuery, 'What is the weather?');
        assertEqual(context.slashCommand, '/research');
    });

    // -------------------------------------------------------------------------
    // Plan Tests
    // -------------------------------------------------------------------------

    test('createAgentPlan creates plan with steps', () => {
        const steps = [
            createPlanStep('Search for information'),
            createPlanStep('Analyze results'),
            createPlanStep('Generate summary'),
        ];
        const plan = createAgentPlan('Research and summarize', steps);

        assertEqual(plan.summary, 'Research and summarize');
        assertEqual(plan.steps.length, 3);
        assertEqual(plan.steps[0].description, 'Search for information');
        assertEqual(plan.steps[0].status, 'pending');
        assertTrue(plan.steps[0].id.length > 0);
        assertEqual(plan.currentStepIndex, -1);
    });

    // -------------------------------------------------------------------------
    // Event Tests
    // -------------------------------------------------------------------------

    test('createEvent creates event with timestamp', () => {
        const event = createEvent(EventType.RUN_STARTED, 'run-123', {
            agentId: 'test-agent',
        });

        assertEqual(event.type, EventType.RUN_STARTED);
        assertEqual(event.runId, 'run-123');
        assertEqual(event.data.agentId, 'test-agent');
        assertTrue(event.timestamp > 0);
    });

    test('EventType has all required event types', () => {
        // Run lifecycle
        assertTrue(EventType.RUN_STARTED !== undefined);
        assertTrue(EventType.RUN_STATUS !== undefined);
        assertTrue(EventType.RUN_COMPLETED !== undefined);
        assertTrue(EventType.RUN_FAILED !== undefined);

        // Token streaming
        assertTrue(EventType.TOKEN_DELTA !== undefined);

        // Tool calls
        assertTrue(EventType.TOOL_CALL_REQUESTED !== undefined);
        assertTrue(EventType.TOOL_CALL_COMPLETED !== undefined);

        // Sub-agents
        assertTrue(EventType.SUBAGENT_SPAWN_REQUESTED !== undefined);
        assertTrue(EventType.SUBAGENT_SPAWN_COMPLETED !== undefined);

        // Artifacts
        assertTrue(EventType.ARTIFACT_CREATED !== undefined);

        // Mutations
        assertTrue(EventType.MUTATION_PROPOSED !== undefined);

        // Approvals
        assertTrue(EventType.APPROVAL_REQUESTED !== undefined);
        assertTrue(EventType.APPROVAL_RESOLVED !== undefined);

        // Plans and progress
        assertTrue(EventType.PLAN_CREATED !== undefined);
        assertTrue(EventType.PLAN_UPDATED !== undefined);
        assertTrue(EventType.PROGRESS_UPDATE !== undefined);
        assertTrue(EventType.RATIONALE_NOTE !== undefined);
    });

    test('RunStatusType has all required status types', () => {
        assertTrue(RunStatusType.PENDING !== undefined);
        assertTrue(RunStatusType.RUNNING !== undefined);
        assertTrue(RunStatusType.COMPLETED !== undefined);
        assertTrue(RunStatusType.FAILED !== undefined);
        assertTrue(RunStatusType.CANCELLED !== undefined);
        assertTrue(RunStatusType.PAUSED !== undefined);
    });

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------

    const passed = testResults.filter((r) => r.passed).length;
    const failed = testResults.filter((r) => !r.passed).length;

    console.log('\n' + '='.repeat(50));
    console.log(`Agent Types Tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
});
