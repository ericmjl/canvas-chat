/**
 * Agent Module Index
 *
 * This module provides the Base Agent + Sub-Agent Architecture for Canvas Chat.
 *
 * Core concepts:
 * - BaseAgent: Primary orchestrator for user message handling
 * - AgentDefinition: Declarative specification of what an agent is and can do
 * - EngineAdapter: Interface for executing agents (framework-agnostic)
 * - RunController: Orchestrates agent execution, events, and DAG integration
 * - MemoryStore: Retain/recall/reflect memory primitives
 * - ToolRegistry: MCP-backed tool invocation with permission checking
 * - StateStore: Abstraction over CRDT/graph persistence
 * - BlobStore: Large artifact and attachment storage
 *
 * Usage:
 *   import { BaseAgent, RunController, createAgentDefinition, EventType } from './agent/index.js';
 *
 *   // Create base agent for message handling
 *   const baseAgent = new BaseAgent({ graph, canvas, chat, ... });
 *
 *   // Invoke with user input
 *   const result = await baseAgent.invoke({
 *       message: 'Hello',
 *       context: selectedText,
 *       selectedNodeIds: ['node-1'],
 *   });
 *
 *   // Or use RunController directly for advanced usage
 *   const controller = new RunController({ graph, canvas, chat });
 *   controller.registerAgent(createAgentDefinition({ ... }));
 *
 *   for await (const event of controller.startRun(request)) {
 *       console.log(event.type, event.data);
 *   }
 *
 * Debug logging:
 *   // Enable in browser console:
 *   window.enableAgentDebug()
 *
 *   // Or add URL parameter:
 *   ?agent_debug=true
 *
 *   // Or set in localStorage:
 *   localStorage.setItem('AGENT_DEBUG', 'true')
 *
 *   // Set log level (TRACE, DEBUG, INFO, WARN, ERROR):
 *   window.setAgentLogLevel('DEBUG')
 */

import { getToolRegistry } from './tool-registry.js';

// Base Agent - primary orchestrator
export { BaseAgent, createBaseAgentDefinition } from './base-agent.js';

// Re-export all types and utilities
export {
    // Agent types
    createAgentDefinition,
    createRunRequest,
    createAgentRun,
    createRunContext,
    createAgentPlan,
    createPlanStep,
    createEvent,
    // Event types
    EventType,
    RunStatusType,
} from './agent-types.js';

export {
    // Engine adapter
    EngineAdapter,
    BuiltinEngineAdapter,
    EngineRegistry,
} from './engine-adapter.js';

export {
    // Memory store
    MemoryTypeEnum,
    MemoryStore,
    InMemoryStore,
    MemoryStoreRegistry,
} from './memory-store.js';

export {
    // Run controller
    RunController,
    DEFAULT_GUARDRAILS,
} from './run-controller.js';

export {
    // Tool registry (MCP integration)
    // Note: ToolDefinition, ToolParameter, etc. are JSDoc types, not runtime exports
    MCPClient,
    ToolRegistry,
    ToolCategory,
    getToolRegistry,
    initializeToolRegistry,
    registerBuiltInTools,
    loadToolsFromBackend,
    createToolDefinition,
} from './tool-registry.js';

export const toolRegistry = getToolRegistry();

export {
    // Graph tools for agents
    getGraphToolDefinitions,
    registerGraphTools,
} from './graph-tools.js';

export {
    // Agentic executor for tool-using sub-agents
    executeAgenticTask,
    buildGraphToolsContextMessage,
    GRAPH_TOOLS_SYSTEM_PROMPT,
} from './agentic-executor.js';

export {
    // State store (CRDT abstraction)
    StateStore,
    CRDTStateStore,
    StateStoreRegistry,
    stateStoreRegistry,
} from './state-store.js';

export {
    // Blob store (large artifact storage)
    BlobStore,
    IndexedDBBlobStore,
    ServerBlobStore,
    InMemoryBlobStore,
    BlobStoreRegistry,
    blobStoreRegistry,
} from './blob-store.js';

export {
    // Debug logging utilities
    DebugLogger,
    LogLevel,
    isDebugEnabled,
    createComponentLogger,
    createLogger,
    engineLogger,
    memoryLogger,
    controllerLogger,
    typesLogger,
    eventLogger,
    reflectionLogger,
    agentLogger,
    enableAgentDebug,
    disableAgentDebug,
    setAgentLogLevel,
} from './debug-logger.js';

export {
    // Blob store utilities
    configureBlobStore,
    getBlobStoreConfig,
    initializeBlobStore,
    getBlobStore,
    shouldUseBlobStore,
    storeFileData,
    retrieveFileData,
    getDisplayUrl,
    fileToBase64,
    base64ToBlob,
    createNodeStorageMetadata,
    getNodeFileData,
} from './blob-store-utils.js';

export {
    // Working node manager - live progress indicators for agent/skill execution
    WorkingNodeManager,
    createWorkingNodeManager,
} from './working-node-manager.js';

export {
    // Skill types
    DEFAULT_SKILL_PERMISSIONS,
    createSkillMetadata,
    createSkillDefinition,
    createSkillRun,
    createSkillInvocationRequest,
} from './skill-types.js';

export {
    // Skill registry - metadata storage and discovery
    SkillRegistry,
    getSkillRegistry,
    registerBuiltInSkills,
} from './skill-registry.js';

export {
    // Skill resolver - on-demand definition loading
    SkillResolver,
    getBuiltinInstructions,
    BUILTIN_SKILL_INSTRUCTIONS,
} from './skill-resolver.js';

export {
    // Skill invocation service - main entry point
    SkillInvocationService,
    createSkillInvocationService,
} from './skill-invocation-service.js';
