"""Tool registry for managing and executing tools.

This module provides a registry for built-in tools and MCP (Model Context Protocol)
tool bridges. Tools can be:

1. Built-in tools: Python functions registered directly
2. MCP tools: Tools accessed via MCP server connections (stdio or http)

Tool namespacing:
- Built-in tools: plain names (e.g., "findPathToRoot", "getNodeContent")
- MCP tools: "mcp:server/tool" format (e.g., "mcp:github/create_issue")
"""

import asyncio
import json
import logging
import subprocess
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

logger = logging.getLogger(__name__)


@dataclass
class ToolDefinition:
    """Definition of a tool that can be invoked."""

    name: str  # Tool name (e.g., "findPathToRoot" or "mcp:github/create_issue")
    description: str  # Human-readable description
    parameters: dict[str, Any]  # JSON Schema for parameters
    handler: Callable[..., Any] | None = None  # Python handler (for built-in tools)
    mcp_server: str | None = None  # MCP server ID (for MCP tools)
    mcp_tool_name: str | None = None  # Tool name on MCP server


@dataclass
class MCPServerConfig:
    """Configuration for an MCP server connection."""

    id: str  # Server identifier
    type: str  # "stdio" or "http"
    command: str | None = None  # For stdio: command to run
    args: list[str] = field(default_factory=list)  # For stdio: command args
    env: dict[str, str] = field(default_factory=dict)  # For stdio: environment vars
    url: str | None = None  # For http: server URL
    headers: dict[str, str] = field(default_factory=dict)  # For http: request headers


class ToolRegistry:
    """Registry for managing and executing tools.

    Supports both built-in Python tools and MCP server tools.
    """

    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}
        self._mcp_servers: dict[str, MCPServerConfig] = {}
        self._mcp_processes: dict[str, subprocess.Popen] = {}

    # =========================================================================
    # Built-in Tool Registration
    # =========================================================================

    def register_tool(
        self,
        name: str,
        handler: Callable[..., Any],
        description: str = "",
        parameters: dict[str, Any] | None = None,
    ) -> None:
        """Register a built-in Python tool.

        Args:
            name: Tool name (will be accessible as-is)
            handler: Async or sync function to handle tool calls
            description: Human-readable description
            parameters: JSON Schema for parameters (optional)
        """
        self._tools[name] = ToolDefinition(
            name=name,
            description=description,
            parameters=parameters or {"type": "object", "properties": {}},
            handler=handler,
        )
        logger.info(f"Registered built-in tool: {name}")

    # =========================================================================
    # MCP Server Registration
    # =========================================================================

    def register_mcp_server(self, config: MCPServerConfig) -> None:
        """Register an MCP server configuration.

        Args:
            config: MCP server configuration
        """
        self._mcp_servers[config.id] = config
        logger.info(f"Registered MCP server: {config.id} ({config.type})")

    async def discover_mcp_tools(self, server_id: str) -> list[ToolDefinition]:
        """Discover tools from an MCP server.

        Args:
            server_id: ID of the registered MCP server

        Returns:
            List of tool definitions from the server
        """
        server = self._mcp_servers.get(server_id)
        if not server:
            raise ValueError(f"MCP server not found: {server_id}")

        tools = []

        if server.type == "stdio":
            tools = await self._discover_stdio_tools(server)
        elif server.type == "http":
            tools = await self._discover_http_tools(server)
        else:
            raise ValueError(f"Unknown MCP server type: {server.type}")

        # Register discovered tools
        for tool in tools:
            mcp_name = f"mcp:{server_id}/{tool.mcp_tool_name}"
            tool.name = mcp_name
            self._tools[mcp_name] = tool
            logger.info(f"Discovered MCP tool: {mcp_name}")

        return tools

    async def _discover_stdio_tools(
        self, server: MCPServerConfig
    ) -> list[ToolDefinition]:
        """Discover tools from an stdio MCP server."""
        # Start the MCP server process if not running
        if server.id not in self._mcp_processes:
            process = subprocess.Popen(
                [server.command] + server.args,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**dict(subprocess.os.environ), **server.env},
            )
            self._mcp_processes[server.id] = process

        # Send tools/list request
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {},
        }

        process = self._mcp_processes[server.id]
        process.stdin.write((json.dumps(request) + "\n").encode())
        process.stdin.flush()

        # Read response
        response_line = process.stdout.readline().decode()
        response = json.loads(response_line)

        tools = []
        for tool_info in response.get("result", {}).get("tools", []):
            tools.append(
                ToolDefinition(
                    name="",  # Will be set by caller
                    description=tool_info.get("description", ""),
                    parameters=tool_info.get("inputSchema", {}),
                    mcp_server=server.id,
                    mcp_tool_name=tool_info.get("name"),
                )
            )

        return tools

    async def _discover_http_tools(
        self, server: MCPServerConfig
    ) -> list[ToolDefinition]:
        """Discover tools from an HTTP MCP server."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{server.url}/jsonrpc",
                headers={**server.headers, "Content-Type": "application/json"},
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/list",
                    "params": {},
                },
            )
            response.raise_for_status()
            data = response.json()

        tools = []
        for tool_info in data.get("result", {}).get("tools", []):
            tools.append(
                ToolDefinition(
                    name="",  # Will be set by caller
                    description=tool_info.get("description", ""),
                    parameters=tool_info.get("inputSchema", {}),
                    mcp_server=server.id,
                    mcp_tool_name=tool_info.get("name"),
                )
            )

        return tools

    # =========================================================================
    # Tool Execution
    # =========================================================================

    async def execute_tool(
        self, name: str, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        """Execute a tool by name.

        Args:
            name: Tool name (built-in or mcp:server/tool format)
            arguments: Tool arguments

        Returns:
            Tool execution result

        Raises:
            ValueError: If tool not found
            Exception: If tool execution fails
        """
        tool = self._tools.get(name)
        if not tool:
            raise ValueError(f"Tool not found: {name}")

        if tool.handler:
            # Built-in tool
            return await self._execute_builtin(tool, arguments)
        elif tool.mcp_server:
            # MCP tool
            return await self._execute_mcp(tool, arguments)
        else:
            raise ValueError(f"Tool has no handler or MCP server: {name}")

    async def _execute_builtin(
        self, tool: ToolDefinition, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        """Execute a built-in Python tool."""
        try:
            if asyncio.iscoroutinefunction(tool.handler):
                result = await tool.handler(**arguments)
            else:
                result = tool.handler(**arguments)

            return {"success": True, "result": result}
        except Exception as e:
            logger.error(f"Tool {tool.name} failed: {e}")
            return {"success": False, "error": str(e)}

    async def _execute_mcp(
        self, tool: ToolDefinition, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        """Execute an MCP tool."""
        server = self._mcp_servers.get(tool.mcp_server)
        if not server:
            raise ValueError(f"MCP server not found: {tool.mcp_server}")

        if server.type == "stdio":
            return await self._execute_mcp_stdio(server, tool, arguments)
        elif server.type == "http":
            return await self._execute_mcp_http(server, tool, arguments)
        else:
            raise ValueError(f"Unknown MCP server type: {server.type}")

    async def _execute_mcp_stdio(
        self,
        server: MCPServerConfig,
        tool: ToolDefinition,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a tool via stdio MCP server."""
        process = self._mcp_processes.get(server.id)
        if not process:
            raise ValueError(f"MCP server not running: {server.id}")

        request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": tool.mcp_tool_name,
                "arguments": arguments,
            },
        }

        process.stdin.write((json.dumps(request) + "\n").encode())
        process.stdin.flush()

        response_line = process.stdout.readline().decode()
        response = json.loads(response_line)

        if "error" in response:
            return {"success": False, "error": response["error"]}

        return {"success": True, "result": response.get("result")}

    async def _execute_mcp_http(
        self,
        server: MCPServerConfig,
        tool: ToolDefinition,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a tool via HTTP MCP server."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{server.url}/jsonrpc",
                    headers={**server.headers, "Content-Type": "application/json"},
                    json={
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {
                            "name": tool.mcp_tool_name,
                            "arguments": arguments,
                        },
                    },
                    timeout=60.0,
                )
                response.raise_for_status()
                data = response.json()

                if "error" in data:
                    return {"success": False, "error": data["error"]}

                return {"success": True, "result": data.get("result")}
            except Exception as e:
                logger.error(f"MCP HTTP tool call failed: {e}")
                return {"success": False, "error": str(e)}

    # =========================================================================
    # Utility Methods
    # =========================================================================

    def get_tool(self, name: str) -> ToolDefinition | None:
        """Get a tool definition by name."""
        return self._tools.get(name)

    def list_tools(self) -> list[dict[str, Any]]:
        """List all registered tools."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
                "type": "mcp" if tool.mcp_server else "builtin",
            }
            for tool in self._tools.values()
        ]

    def cleanup(self) -> None:
        """Clean up MCP server processes."""
        for name, process in self._mcp_processes.items():
            try:
                process.terminate()
                process.wait(timeout=5)
            except Exception as e:
                logger.error(f"Error cleaning up MCP server {name}: {e}")
        self._mcp_processes.clear()


# Global registry instance
_tool_registry: ToolRegistry | None = None


def get_tool_registry() -> ToolRegistry:
    """Get the global tool registry instance."""
    global _tool_registry
    if _tool_registry is None:
        _tool_registry = ToolRegistry()
    return _tool_registry
