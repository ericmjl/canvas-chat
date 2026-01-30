/**
 * Agent Module Index
 *
 * This module provides the Base Agent + Sub-Agent Architecture for Canvas Chat.
 *
 * Core concepts:
 * - AgentDefinition: Declarative specification of what an agent is and can do
 * - EngineAdapter: Interface for executing agents (framework-agnostic)
 * - RunController: Orchestrates agent execution, events, and DAG integration
 * - MemoryStore: Retain/recall/reflect memory primitives
 * - ToolRegistry: MCP-backed tool invocation with permission checking
 * - StateStore: Abstraction over CRDT/graph persistence
 * - BlobStore: Large artifact and attachment storage
 *
 * Usage:
 *   import { RunController, createAgentDefinition, EventType } from './agent/index.js';
 *
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

// Re-export all types and utilities
export {
    // Agent types
    createAgentDefinition,
    createRunRequest,
    createAgentRun,
    createRunContext,
    createPlan,
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
    ToolDefinition,
    ToolParameter,
    ToolInvocation,
    ToolResult,
    MCPClient,
    ToolRegistry,
    toolRegistry,
    createToolDefinition,
} from './tool-registry.js';

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
    LogLevel,
    AgentLogger,
    createComponentLogger,
    engineLogger,
    memoryLogger,
    controllerLogger,
    typesLogger,
    eventLogger,
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
