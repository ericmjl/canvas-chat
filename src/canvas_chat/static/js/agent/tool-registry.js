/**
 * Tool Registry for Agent MCP Integration
 *
 * This module provides a registry for MCP (Model Context Protocol) tools
 * that agents can invoke during execution. Tools are registered with
 * their capabilities and invoked through uniform interfaces.
 *
 * Key concepts:
 * - ToolDefinition: Declarative specification of a tool
 * - ToolRegistry: Central registry for all available tools
 * - MCPClient: Client for connecting to MCP servers
 *
 * Integration with agents:
 * - Tools are registered at startup from config or plugins
 * - Agents declare allowed tools in their definition
 * - RunController checks permissions before invoking
 * - Host context provides tools.invoke() to engines
 *
 * @module tool-registry
 */

import { createComponentLogger } from './debug-logger.js';

const toolLogger = createComponentLogger('Tools');

// =============================================================================
// Tool Definition Types
// =============================================================================

/**
 * @typedef {Object} ToolParameter
 * @property {string} name - Parameter name
 * @property {string} type - JSON Schema type (string, number, boolean, object, array)
 * @property {string} [description] - Human-readable description
 * @property {boolean} [required] - Whether the parameter is required
 * @property {*} [default] - Default value if not provided
 * @property {Object} [schema] - Full JSON Schema for complex types
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} id - Unique tool identifier (e.g., 'web_search', 'mcp:fetch/get_url')
 * @property {string} name - Human-readable name
 * @property {string} description - What the tool does
 * @property {ToolParameter[]} parameters - Input parameters
 * @property {string} [category] - Tool category (search, fetch, compute, transform)
 * @property {string} [mcpServer] - MCP server name if tool is MCP-backed
 * @property {boolean} [requiresApproval] - Whether tool always requires HITL approval
 * @property {Object} [metadata] - Additional tool metadata
 */

/**
 * @typedef {Object} ToolInvocation
 * @property {string} toolId - Tool identifier
 * @property {Object} args - Tool arguments
 * @property {string} [runId] - Associated run ID
 * @property {string} [agentId] - Invoking agent ID
 */

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success - Whether invocation succeeded
 * @property {*} result - Tool output (on success)
 * @property {string} [error] - Error message (on failure)
 * @property {number} [durationMs] - Execution duration
 * @property {Object} [metadata] - Additional result metadata
 */

/**
 * @typedef {Object} MCPServerConfig
 * @property {string} name - Server name
 * @property {string} transport - Transport type ('stdio', 'http', 'websocket')
 * @property {string} [command] - Command to start server (for stdio)
 * @property {string[]} [args] - Command arguments
 * @property {string} [url] - Server URL (for http/websocket)
 * @property {Object} [env] - Environment variables
 * @property {Object} [metadata] - Additional metadata
 */

// =============================================================================
// Tool Categories
// =============================================================================

/**
 * Standard tool categories
 * @readonly
 * @enum {string}
 */
export const ToolCategory = Object.freeze({
    SEARCH: 'search', // Web search, knowledge base search
    FETCH: 'fetch', // URL fetching, file reading
    COMPUTE: 'compute', // Code execution, calculations
    TRANSFORM: 'transform', // Data transformation, formatting
    STORAGE: 'storage', // File writing, blob storage
    EXTERNAL: 'external', // External API calls
    CUSTOM: 'custom', // User-defined tools
});

// =============================================================================
// MCP Client
// =============================================================================

/**
 * MCP Client for connecting to MCP servers
 *
 * This is a simplified client that wraps MCP server communication.
 * In production, this would use the full MCP SDK.
 */
export class MCPClient {
    /**
     * @param {MCPServerConfig} config - Server configuration
     */
    constructor(config) {
        this.config = config;
        this.name = config.name;
        this.transport = config.transport;
        this.connected = false;
        this.tools = new Map();

        toolLogger.info(`MCPClient created for server: ${this.name}`);
    }

    /**
     * Connect to the MCP server
     * @returns {Promise<void>}
     */
    async connect() {
        toolLogger.debug(`Connecting to MCP server: ${this.name}...`);

        try {
            // In production, this would establish actual MCP connection
            // For now, we simulate connection for built-in tools
            switch (this.transport) {
                case 'stdio':
                    await this._connectStdio();
                    break;
                case 'http':
                    await this._connectHttp();
                    break;
                case 'websocket':
                    await this._connectWebsocket();
                    break;
                default:
                    throw new Error(`Unknown transport: ${this.transport}`);
            }

            this.connected = true;
            toolLogger.info(`Connected to MCP server: ${this.name}`);
        } catch (error) {
            toolLogger.error(`Failed to connect to MCP server: ${this.name}`, error);
            throw error;
        }
    }

    /**
     * Disconnect from the MCP server
     * @returns {Promise<void>}
     */
    async disconnect() {
        toolLogger.debug(`Disconnecting from MCP server: ${this.name}...`);
        this.connected = false;
        this.tools.clear();
        toolLogger.info(`Disconnected from MCP server: ${this.name}`);
    }

    /**
     * List available tools from this server
     * @returns {Promise<ToolDefinition[]>}
     */
    async listTools() {
        if (!this.connected) {
            throw new Error(`Not connected to MCP server: ${this.name}`);
        }

        // Return cached tools
        return Array.from(this.tools.values());
    }

    /**
     * Invoke a tool on this server
     * @param {string} toolId - Tool identifier
     * @param {Object} args - Tool arguments
     * @returns {Promise<ToolResult>}
     */
    async invoke(toolId, args) {
        if (!this.connected) {
            throw new Error(`Not connected to MCP server: ${this.name}`);
        }

        const startTime = Date.now();
        toolLogger.debug(`Invoking tool: ${toolId}`, args);

        try {
            // In production, this would send request to MCP server
            // For now, we delegate to registered handlers
            const tool = this.tools.get(toolId);
            if (!tool) {
                throw new Error(`Tool not found: ${toolId}`);
            }

            const result = await tool.handler(args);
            const durationMs = Date.now() - startTime;

            toolLogger.debug(`Tool ${toolId} completed in ${durationMs}ms`, result);

            return {
                success: true,
                result,
                durationMs,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            toolLogger.error(`Tool ${toolId} failed after ${durationMs}ms`, error);

            return {
                success: false,
                error: error.message,
                durationMs,
            };
        }
    }

    /**
     * Register a local tool handler (for built-in tools)
     * @param {ToolDefinition} tool - Tool definition
     * @param {Function} handler - Tool handler function
     */
    registerLocalTool(tool, handler) {
        this.tools.set(tool.id, { ...tool, handler });
        toolLogger.debug(`Registered local tool: ${tool.id}`);
    }

    // Private connection methods (simplified for now)
    async _connectStdio() {
        // In production: spawn subprocess and communicate via stdio
        toolLogger.trace(`Stdio connection not implemented, using mock`);
    }

    async _connectHttp() {
        // In production: establish HTTP connection to MCP server
        toolLogger.trace(`HTTP connection not implemented, using mock`);
    }

    async _connectWebsocket() {
        // In production: establish WebSocket connection to MCP server
        toolLogger.trace(`WebSocket connection not implemented, using mock`);
    }
}

// =============================================================================
// Tool Registry
// =============================================================================

/**
 * Central registry for all available tools
 *
 * Tools can be:
 * - Built-in (registered by core features)
 * - MCP-backed (from MCP servers)
 * - Plugin-provided (from plugins)
 */
export class ToolRegistry {
    constructor() {
        /** @type {Map<string, ToolDefinition>} */
        this.tools = new Map();

        /** @type {Map<string, MCPClient>} */
        this.mcpClients = new Map();

        /** @type {Map<string, Function>} */
        this.handlers = new Map();

        toolLogger.info('ToolRegistry initialized');
    }

    /**
     * Register a tool
     * @param {ToolDefinition} tool - Tool definition
     * @param {Function} [handler] - Optional handler for direct invocation
     */
    registerTool(tool, handler) {
        if (this.tools.has(tool.id)) {
            toolLogger.warn(`Tool ${tool.id} already registered, replacing`);
        }

        this.tools.set(tool.id, tool);

        if (handler) {
            this.handlers.set(tool.id, handler);
        }

        toolLogger.info(`Registered tool: ${tool.id} (${tool.name})`);
    }

    /**
     * Unregister a tool
     * @param {string} toolId - Tool identifier
     */
    unregisterTool(toolId) {
        this.tools.delete(toolId);
        this.handlers.delete(toolId);
        toolLogger.info(`Unregistered tool: ${toolId}`);
    }

    /**
     * Get a tool definition
     * @param {string} toolId - Tool identifier
     * @returns {ToolDefinition|null}
     */
    getTool(toolId) {
        return this.tools.get(toolId) || null;
    }

    /**
     * List all registered tools
     * @param {Object} [filter] - Optional filter
     * @param {string} [filter.category] - Filter by category
     * @param {string} [filter.mcpServer] - Filter by MCP server
     * @returns {ToolDefinition[]}
     */
    listTools(filter = {}) {
        let tools = Array.from(this.tools.values());

        if (filter.category) {
            tools = tools.filter((t) => t.category === filter.category);
        }

        if (filter.mcpServer) {
            tools = tools.filter((t) => t.mcpServer === filter.mcpServer);
        }

        return tools;
    }

    /**
     * Check if a tool is allowed for an agent
     * @param {string} toolId - Tool identifier
     * @param {string[]} allowedTools - List of allowed tool IDs
     * @returns {boolean}
     */
    isToolAllowed(toolId, allowedTools) {
        // Wildcard allows all tools
        if (allowedTools.includes('*')) {
            return true;
        }

        // Check exact match
        if (allowedTools.includes(toolId)) {
            return true;
        }

        // Check category wildcard (e.g., 'search:*' allows all search tools)
        const tool = this.getTool(toolId);
        if (tool?.category) {
            const categoryWildcard = `${tool.category}:*`;
            if (allowedTools.includes(categoryWildcard)) {
                return true;
            }
        }

        // Check MCP server wildcard (e.g., 'mcp:server/*' allows all tools from server)
        if (tool?.mcpServer) {
            const serverWildcard = `mcp:${tool.mcpServer}/*`;
            if (allowedTools.includes(serverWildcard)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Connect to an MCP server
     * @param {MCPServerConfig} config - Server configuration
     * @returns {Promise<MCPClient>}
     */
    async connectMCPServer(config) {
        toolLogger.info(`Connecting to MCP server: ${config.name}`);

        const client = new MCPClient(config);
        await client.connect();

        this.mcpClients.set(config.name, client);

        // Import tools from server
        const serverTools = await client.listTools();
        for (const tool of serverTools) {
            this.registerTool({ ...tool, mcpServer: config.name });
        }

        toolLogger.info(`Connected to MCP server: ${config.name}, imported ${serverTools.length} tools`);
        return client;
    }

    /**
     * Disconnect from an MCP server
     * @param {string} serverName - Server name
     * @returns {Promise<void>}
     */
    async disconnectMCPServer(serverName) {
        const client = this.mcpClients.get(serverName);
        if (client) {
            await client.disconnect();
            this.mcpClients.delete(serverName);

            // Remove tools from this server
            for (const [toolId, tool] of this.tools) {
                if (tool.mcpServer === serverName) {
                    this.unregisterTool(toolId);
                }
            }
        }
    }

    /**
     * Invoke a tool
     * @param {ToolInvocation} invocation - Tool invocation request
     * @returns {Promise<ToolResult>}
     */
    async invoke(invocation) {
        const { toolId, args, runId, agentId } = invocation;
        const startTime = Date.now();

        toolLogger.entry('invoke', { toolId, args, runId, agentId });

        const tool = this.getTool(toolId);
        if (!tool) {
            toolLogger.exit('invoke', { success: false, error: 'Tool not found' });
            return {
                success: false,
                error: `Tool not found: ${toolId}`,
                durationMs: Date.now() - startTime,
            };
        }

        try {
            let result;

            // If tool is MCP-backed, invoke via MCP client
            if (tool.mcpServer) {
                const client = this.mcpClients.get(tool.mcpServer);
                if (!client) {
                    throw new Error(`MCP server not connected: ${tool.mcpServer}`);
                }
                result = await client.invoke(toolId, args);
            } else {
                // Direct handler invocation
                const handler = this.handlers.get(toolId);
                if (!handler) {
                    throw new Error(`No handler registered for tool: ${toolId}`);
                }
                const output = await handler(args);
                result = {
                    success: true,
                    result: output,
                    durationMs: Date.now() - startTime,
                };
            }

            toolLogger.exit('invoke', result);
            return result;
        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                durationMs: Date.now() - startTime,
            };
            toolLogger.exit('invoke', errorResult);
            return errorResult;
        }
    }

    /**
     * Get tool definitions formatted for LLM
     * @param {string[]} toolIds - Tool IDs to include
     * @returns {Object[]} - Tool definitions in OpenAI-compatible format
     */
    getToolsForLLM(toolIds) {
        const tools = [];

        for (const toolId of toolIds) {
            const tool = this.getTool(toolId);
            if (!tool) continue;

            // Build parameter schema
            const properties = {};
            const required = [];

            for (const param of tool.parameters || []) {
                properties[param.name] = {
                    type: param.type,
                    description: param.description,
                };
                if (param.schema) {
                    properties[param.name] = { ...properties[param.name], ...param.schema };
                }
                if (param.default !== undefined) {
                    properties[param.name].default = param.default;
                }
                if (param.required) {
                    required.push(param.name);
                }
            }

            tools.push({
                type: 'function',
                function: {
                    name: tool.id,
                    description: tool.description,
                    parameters: {
                        type: 'object',
                        properties,
                        required,
                    },
                },
            });
        }

        return tools;
    }
}

// =============================================================================
// Built-in Tools
// =============================================================================

/**
 * Register built-in tools with a registry
 * @param {ToolRegistry} registry - Tool registry
 * @param {Object} context - App context for tool handlers
 */
export function registerBuiltInTools(registry, context) {
    toolLogger.info('Registering built-in tools...');

    // Web search tool
    registry.registerTool(
        {
            id: 'web_search',
            name: 'Web Search',
            description: 'Search the web for information using Exa API',
            category: ToolCategory.SEARCH,
            parameters: [
                {
                    name: 'query',
                    type: 'string',
                    description: 'Search query',
                    required: true,
                },
                {
                    name: 'numResults',
                    type: 'number',
                    description: 'Number of results to return',
                    default: 5,
                },
            ],
        },
        async (args) => {
            // In production, this would call the Exa API
            // For now, return a placeholder
            toolLogger.debug('web_search invoked', args);

            if (context?.chat?.search) {
                return await context.chat.search(args.query, args.numResults);
            }

            return {
                query: args.query,
                results: [],
                message: 'Search not available - Exa API key not configured',
            };
        }
    );

    // URL fetch tool
    registry.registerTool(
        {
            id: 'fetch_url',
            name: 'Fetch URL',
            description: 'Fetch content from a URL',
            category: ToolCategory.FETCH,
            parameters: [
                {
                    name: 'url',
                    type: 'string',
                    description: 'URL to fetch',
                    required: true,
                },
                {
                    name: 'format',
                    type: 'string',
                    description: 'Output format (text, html, markdown)',
                    default: 'markdown',
                },
            ],
        },
        async (args) => {
            toolLogger.debug('fetch_url invoked', args);

            try {
                const response = await fetch('/api/fetch-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: args.url, format: args.format }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return await response.json();
            } catch (error) {
                return { error: error.message, url: args.url };
            }
        }
    );

    // Read file tool (for code agents)
    registry.registerTool(
        {
            id: 'read_file',
            name: 'Read File',
            description: 'Read content from a file in the workspace',
            category: ToolCategory.FETCH,
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'File path relative to workspace',
                    required: true,
                },
            ],
        },
        async (args) => {
            toolLogger.debug('read_file invoked', args);
            // This would integrate with file system access
            return { error: 'File system access not available in browser' };
        }
    );

    // Execute code tool
    registry.registerTool(
        {
            id: 'execute_code',
            name: 'Execute Code',
            description: 'Execute Python code in a sandboxed environment',
            category: ToolCategory.COMPUTE,
            requiresApproval: true,
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Python code to execute',
                    required: true,
                },
                {
                    name: 'language',
                    type: 'string',
                    description: 'Programming language',
                    default: 'python',
                },
            ],
        },
        async (args) => {
            toolLogger.debug('execute_code invoked', args);

            // This would integrate with Pyodide or server-side execution
            if (context?.pyodideRunner) {
                return await context.pyodideRunner.execute(args.code);
            }

            return { error: 'Code execution not available' };
        }
    );

    // Transform text tool
    registry.registerTool(
        {
            id: 'transform_text',
            name: 'Transform Text',
            description: 'Transform text using various operations',
            category: ToolCategory.TRANSFORM,
            parameters: [
                {
                    name: 'text',
                    type: 'string',
                    description: 'Text to transform',
                    required: true,
                },
                {
                    name: 'operation',
                    type: 'string',
                    description: 'Operation (summarize, extract_json, format_markdown, etc.)',
                    required: true,
                },
            ],
        },
        async (args) => {
            toolLogger.debug('transform_text invoked', args);
            // Simple text transformations
            switch (args.operation) {
                case 'uppercase':
                    return { result: args.text.toUpperCase() };
                case 'lowercase':
                    return { result: args.text.toLowerCase() };
                case 'word_count':
                    return { result: args.text.split(/\s+/).length };
                default:
                    return { error: `Unknown operation: ${args.operation}` };
            }
        }
    );

    toolLogger.info('Built-in tools registered');
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalRegistry = null;

/**
 * Get the global tool registry instance
 * @returns {ToolRegistry}
 */
export function getToolRegistry() {
    if (!globalRegistry) {
        globalRegistry = new ToolRegistry();
    }
    return globalRegistry;
}

/**
 * Initialize the global tool registry with built-in tools
 * @param {Object} context - App context
 * @returns {ToolRegistry}
 */
export function initializeToolRegistry(context) {
    const registry = getToolRegistry();
    registerBuiltInTools(registry, context);
    return registry;
}
