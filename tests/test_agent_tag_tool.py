"""Pass-through behavior for the voice tag_node tool.

The backend does not mutate tags. It validates the call and returns a
tag_update instruction for the client to apply.
"""

import pytest

from canvas_chat.app import AgentRequest, _agent_execute_tool


@pytest.mark.anyio
async def test_tag_node_returns_frontend_instruction():
    """Add returns a tag_update payload and does not touch canvas state."""
    request = AgentRequest(messages=[])
    result = await _agent_execute_tool(
        "tag_node",
        {
            "action": "add",
            "tag_name": "Important",
            "node_ids": ["node-1"],
        },
        request,
    )
    assert result["type"] == "tag"
    assert result["tag_update"] == {
        "action": "add",
        "tag_name": "Important",
        "tag_color_name": "",
        "node_ids": ["node-1"],
    }


@pytest.mark.anyio
async def test_tag_node_requires_node_ids_for_add():
    """Add without node ids is an error, not a tag_update."""
    request = AgentRequest(messages=[])
    result = await _agent_execute_tool(
        "tag_node",
        {"action": "add", "tag_name": "Important"},
        request,
    )
    assert result["type"] == "error"
    assert "node_ids" in result["content"]
    assert "tag_update" not in result
