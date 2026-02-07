"""OpenAI Agents SDK integration for Canvas Chat.

Provides a backend execution path for agentic runs using the OpenAI Agents SDK,
with graph tools implemented against a snapshot of the frontend DAG.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import json

from agents import Agent, Runner, RunContextWrapper, function_tool
from agents import AsyncOpenAI, OpenAIResponsesModel

try:
    from agents import OpenAIChatCompletionsModel
except Exception:  # pragma: no cover - optional in older SDK versions
    try:
        from agents.models import OpenAIChatCompletionsModel
    except Exception:
        OpenAIChatCompletionsModel = None

try:
    from agents.extensions.models.litellm_model import LitellmModel
except Exception:  # pragma: no cover - optional in older SDK versions
    LitellmModel = None


# =============================================================================
# Graph Snapshot
# =============================================================================


@dataclass
class GraphSnapshot:
    """Lightweight snapshot of the conversation graph for tool execution."""

    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]

    def __init__(self, data: dict[str, Any] | None):
        payload = data or {}
        self.nodes = list(payload.get("nodes", []) or [])
        self.edges = list(payload.get("edges", []) or [])

        self._nodes_by_id = {
            node.get("id"): node for node in self.nodes if node.get("id")
        }
        self._children: dict[str, list[str]] = {}
        self._parents: dict[str, list[str]] = {}

        for edge in self.edges:
            source = edge.get("source")
            target = edge.get("target")
            if not source or not target:
                continue
            self._children.setdefault(source, []).append(target)
            self._parents.setdefault(target, []).append(source)

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        return self._nodes_by_id.get(node_id)

    def get_children(self, node_id: str) -> list[str]:
        return list(self._children.get(node_id, []))

    def get_parents(self, node_id: str) -> list[str]:
        return list(self._parents.get(node_id, []))

    def get_edge_type(self, source_id: str, target_id: str) -> str | None:
        for edge in self.edges:
            if edge.get("source") == source_id and edge.get("target") == target_id:
                return edge.get("type")
        return None


@dataclass
class GraphToolContext:
    """Context passed to graph tools."""

    graph: GraphSnapshot
    selected_node_ids: list[str]
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    on_tool: Callable[[dict[str, Any]], None] | None = None


def _record_tool_call(
    ctx: RunContextWrapper[GraphToolContext],
    tool_id: str,
    args: dict[str, Any],
) -> None:
    payload = {"toolId": tool_id, "args": args}
    ctx.context.tool_calls.append(payload)
    if ctx.context.on_tool:
        ctx.context.on_tool(payload)


# =============================================================================
# Graph Tool Implementations
# =============================================================================


@function_tool(name_override="graph:findPathToRoot")
def graph_find_path_to_root(
    ctx: RunContextWrapper[GraphToolContext],
    nodeId: str,
    stopAtBranchPoint: bool = True,
) -> dict[str, Any]:
    """Find the path from a node back to a branch point or root."""
    _record_tool_call(
        ctx, "graph:findPathToRoot", {"nodeId": nodeId, "stopAtBranchPoint": stopAtBranchPoint}
    )
    graph = ctx.context.graph
    if not graph.get_node(nodeId):
        return {"success": False, "error": f"Node not found: {nodeId}"}

    node_ids: list[str] = [nodeId]
    current_id = nodeId

    while True:
        parents = graph.get_parents(current_id)
        if not parents:
            break

        if len(parents) > 1:
            for parent_id in parents:
                if parent_id not in node_ids:
                    node_ids.insert(0, parent_id)
            break

        parent_id = parents[0]
        if stopAtBranchPoint and len(graph.get_children(parent_id)) > 1:
            node_ids.insert(0, parent_id)
            break

        node_ids.insert(0, parent_id)
        current_id = parent_id

    return {
        "success": True,
        "result": {
            "startNodeId": nodeId,
            "endNodeId": node_ids[0] if node_ids else nodeId,
            "nodeIds": node_ids,
            "pathLength": len(node_ids),
            "isBranched": len(node_ids) > 1,
        },
    }


@function_tool(name_override="graph:getNodeContent")
def graph_get_node_content(
    ctx: RunContextWrapper[GraphToolContext],
    nodeId: str,
    maxLength: int = 500,
) -> dict[str, Any]:
    """Get the content and metadata for a node."""
    _record_tool_call(ctx, "graph:getNodeContent", {"nodeId": nodeId, "maxLength": maxLength})
    node = ctx.context.graph.get_node(nodeId)
    if not node:
        return {"success": False, "error": f"Node not found: {nodeId}"}

    content = node.get("content") or ""
    truncated = len(content) > maxLength
    if truncated:
        content = content[:maxLength] + "..."

    return {
        "success": True,
        "result": {
            "nodeId": node.get("id"),
            "type": node.get("type"),
            "title": node.get("title") or "Untitled",
            "content": content,
            "contentLength": len(node.get("content") or ""),
            "truncated": truncated,
        },
    }


@function_tool(name_override="graph:getPathContent")
def graph_get_path_content(
    ctx: RunContextWrapper[GraphToolContext],
    nodeIds: list[str],
    maxLengthPerNode: int = 300,
) -> dict[str, Any]:
    """Get content from multiple nodes along a path."""
    _record_tool_call(
        ctx,
        "graph:getPathContent",
        {"nodeIds": nodeIds, "maxLengthPerNode": maxLengthPerNode},
    )
    graph = ctx.context.graph
    nodes: list[dict[str, Any]] = []
    for node_id in nodeIds:
        node = graph.get_node(node_id)
        if not node:
            continue
        content = node.get("content") or ""
        if len(content) > maxLengthPerNode:
            content = content[:maxLengthPerNode] + "..."
        nodes.append(
            {
                "nodeId": node.get("id"),
                "type": node.get("type"),
                "title": node.get("title") or "Untitled",
                "content": content,
            }
        )

    return {
        "success": True,
        "result": {
            "nodes": nodes,
            "totalNodes": len(nodes),
        },
    }


@function_tool(name_override="graph:getRelatedNodes")
def graph_get_related_nodes(
    ctx: RunContextWrapper[GraphToolContext],
    nodeId: str,
    direction: str = "children",
) -> dict[str, Any]:
    """Get parent or child nodes of a given node."""
    _record_tool_call(
        ctx, "graph:getRelatedNodes", {"nodeId": nodeId, "direction": direction}
    )
    graph = ctx.context.graph
    if not graph.get_node(nodeId):
        return {"success": False, "error": f"Node not found: {nodeId}"}

    node_ids = (
        graph.get_children(nodeId)
        if direction == "children"
        else graph.get_parents(nodeId)
    )
    nodes = []
    for node_id in node_ids:
        node = graph.get_node(node_id)
        if node:
            nodes.append(
                {
                    "nodeId": node.get("id"),
                    "type": node.get("type"),
                    "title": node.get("title") or "Untitled",
                }
            )

    return {"success": True, "result": {"nodes": nodes, "count": len(nodes)}}


@function_tool(name_override="graph:checkBranchPoint")
def graph_check_branch_point(
    ctx: RunContextWrapper[GraphToolContext],
    nodeId: str,
) -> dict[str, Any]:
    """Check if a node is a branch point (has multiple children)."""
    _record_tool_call(ctx, "graph:checkBranchPoint", {"nodeId": nodeId})
    graph = ctx.context.graph
    if not graph.get_node(nodeId):
        return {"success": False, "error": f"Node not found: {nodeId}"}

    children = graph.get_children(nodeId)
    parents = graph.get_parents(nodeId)
    return {
        "success": True,
        "result": {
            "nodeId": nodeId,
            "isBranchPoint": len(children) > 1,
            "isLeafNode": len(children) == 0,
            "childCount": len(children),
            "parentCount": len(parents),
        },
    }


@function_tool(name_override="graph:getPreviousReflections")
def graph_get_previous_reflections(
    ctx: RunContextWrapper[GraphToolContext],
    branchNodeId: str,
    leafNodeId: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Find previous reflection nodes attached to a branch point or its ancestors."""
    _record_tool_call(
        ctx,
        "graph:getPreviousReflections",
        {"branchNodeId": branchNodeId, "leafNodeId": leafNodeId, "limit": limit},
    )
    graph = ctx.context.graph
    reflections: list[dict[str, Any]] = []
    visited: set[str] = set()

    def collect_from_parent(parent_id: str) -> None:
        for child_id in graph.get_children(parent_id):
            if child_id in visited:
                continue
            edge_type = graph.get_edge_type(parent_id, child_id)
            if edge_type == "run_reflection":
                node = graph.get_node(child_id)
                if node:
                    reflections.append(
                        {
                            "nodeId": child_id,
                            "content": node.get("content") or "",
                            "title": node.get("title") or "Untitled",
                        }
                    )
                    visited.add(child_id)

    collect_from_parent(branchNodeId)

    current_id = branchNodeId
    path_visited = {branchNodeId}
    while True:
        parents = graph.get_parents(current_id)
        if not parents:
            break
        parent_id = parents[0]
        if parent_id in path_visited:
            break
        path_visited.add(parent_id)
        collect_from_parent(parent_id)
        current_id = parent_id

    if limit and len(reflections) > limit:
        reflections = reflections[:limit]

    return {
        "success": True,
        "result": {
            "reflections": reflections,
            "count": len(reflections),
        },
    }


@function_tool(name_override="graph:findNodesByType")
def graph_find_nodes_by_type(
    ctx: RunContextWrapper[GraphToolContext],
    nodeType: str,
    limit: int = 20,
) -> dict[str, Any]:
    """Find nodes by type."""
    _record_tool_call(ctx, "graph:findNodesByType", {"nodeType": nodeType, "limit": limit})
    graph = ctx.context.graph
    matches = [node for node in graph.nodes if node.get("type") == nodeType]
    nodes = [
        {
            "nodeId": node.get("id"),
            "type": node.get("type"),
            "title": node.get("title") or "Untitled",
        }
        for node in matches[:limit]
    ]
    return {"success": True, "result": {"nodes": nodes, "count": len(nodes)}}


GRAPH_TOOLS = {
    "graph:findPathToRoot": graph_find_path_to_root,
    "graph:getNodeContent": graph_get_node_content,
    "graph:getPathContent": graph_get_path_content,
    "graph:getRelatedNodes": graph_get_related_nodes,
    "graph:checkBranchPoint": graph_check_branch_point,
    "graph:getPreviousReflections": graph_get_previous_reflections,
    "graph:findNodesByType": graph_find_nodes_by_type,
}


def _select_graph_tools(allowed_tools: list[str] | None) -> list[Any]:
    if not allowed_tools:
        return list(GRAPH_TOOLS.values())

    normalized = [str(tool).strip() for tool in allowed_tools if str(tool).strip()]
    if "*" in normalized:
        return list(GRAPH_TOOLS.values())

    return [GRAPH_TOOLS[name] for name in normalized if name in GRAPH_TOOLS]


def _normalize_model_name(model_id: str) -> str:
    if model_id.startswith("openai/"):
        return model_id.split("/", 1)[1]
    return model_id


def _provider_from_model_id(model_id: str) -> str:
    if "/" in model_id:
        return model_id.split("/", 1)[0].lower()
    return "openai"


def _is_openai_model(model_id: str) -> bool:
    return model_id.startswith("openai/") or "/" not in model_id


def _build_model(
    model_id: str,
    api_key: str | None,
    base_url: str | None,
) -> Any:
    if not model_id:
        model_id = "openai/gpt-4o-mini"

    model_name = _normalize_model_name(model_id)
    provider = _provider_from_model_id(model_id)
    client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)

    if _is_openai_model(model_id):
        return OpenAIResponsesModel(model=model_name, openai_client=client)

    if base_url:
        if OpenAIChatCompletionsModel is None:
            raise RuntimeError(
                "OpenAIChatCompletionsModel unavailable in this Agents SDK version."
            )
        return OpenAIChatCompletionsModel(model=model_name, openai_client=client)

    if provider in {"anthropic", "gemini", "google"}:
        if LitellmModel is None:
            raise RuntimeError("LitellmModel unavailable in this Agents SDK version.")
        return LitellmModel(model=model_id, api_key=api_key)

    raise RuntimeError(
        "Non-OpenAI models require an OpenAI-compatible base_url."
    )


def _extract_tool_calls(run_result: Any) -> list[dict[str, Any]]:
    tool_calls: list[dict[str, Any]] = []
    items = getattr(run_result, "new_items", []) or []
    for item in items:
        item_type = getattr(item, "type", None)
        if item_type != "tool_call_item":
            continue
        tool_name = (
            getattr(item, "name", None)
            or getattr(item, "tool_name", None)
            or getattr(item, "tool", None)
            or "tool"
        )
        tool_calls.append({"toolId": tool_name})
    return tool_calls


async def run_agents_sdk(
    *,
    system_prompt: str,
    user_message: str,
    model: str,
    api_key: str | None,
    base_url: str | None,
    selected_node_ids: list[str],
    graph_snapshot: dict[str, Any] | None,
    allowed_tools: list[str] | None,
) -> dict[str, Any]:
    """Execute an agent run using the OpenAI Agents SDK."""
    graph = GraphSnapshot(graph_snapshot)
    context = GraphToolContext(graph=graph, selected_node_ids=selected_node_ids)

    tools = _select_graph_tools(allowed_tools)
    agent = Agent(
        name="Canvas Agent",
        instructions=system_prompt or "",
        tools=tools,
        model=_build_model(model, api_key, base_url),
    )

    result = await Runner.run(agent, user_message or "", context=context)
    content = getattr(result, "final_output", "") or ""
    tool_calls = context.tool_calls or _extract_tool_calls(result)

    return {
        "success": True,
        "content": content,
        "tool_calls": tool_calls,
    }


def _get_attr(obj: Any, name: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def _extract_text_delta(event: Any) -> str | None:
    data = _get_attr(event, "data")
    if data is None:
        return None

    response_event = _get_attr(data, "event") or data
    event_type = _get_attr(response_event, "type")
    if not isinstance(event_type, str):
        return None

    if "output_text.delta" not in event_type:
        return None

    delta = _get_attr(response_event, "delta") or _get_attr(response_event, "text")
    if isinstance(delta, str):
        return delta
    return None


async def run_agents_sdk_stream(
    *,
    system_prompt: str,
    user_message: str,
    model: str,
    api_key: str | None,
    base_url: str | None,
    selected_node_ids: list[str],
    graph_snapshot: dict[str, Any] | None,
    allowed_tools: list[str] | None,
):
    """Stream agent output using the OpenAI Agents SDK."""
    graph = GraphSnapshot(graph_snapshot)
    context = GraphToolContext(graph=graph, selected_node_ids=selected_node_ids)

    tool_buffer: list[dict[str, Any]] = []

    def on_tool(payload: dict[str, Any]) -> None:
        tool_buffer.append(payload)

    context.on_tool = on_tool

    tools = _select_graph_tools(allowed_tools)
    agent = Agent(
        name="Canvas Agent",
        instructions=system_prompt or "",
        tools=tools,
        model=_build_model(model, api_key, base_url),
    )

    stream = Runner.run_streamed(agent, user_message or "", context=context)

    async for event in stream.stream_events():
        while tool_buffer:
            payload = tool_buffer.pop(0)
            yield {"event": "tool", "data": json.dumps(payload)}

        event_type = _get_attr(event, "type")
        if event_type == "agent_updated_stream_event":
            new_agent = _get_attr(event, "new_agent")
            agent_name = _get_attr(new_agent, "name") or "agent"
            yield {"event": "progress", "data": f"Switched to {agent_name}"}
            continue

        if event_type == "raw_response_event":
            delta = _extract_text_delta(event)
            if delta:
                yield {"event": "message", "data": delta}

    while tool_buffer:
        payload = tool_buffer.pop(0)
        yield {"event": "tool", "data": json.dumps(payload)}

    yield {
        "event": "done",
        "data": json.dumps({"tool_calls": context.tool_calls}),
    }
