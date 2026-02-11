# Built-in Tools API Reference

Canvas Chat provides a set of built-in tools that agents can use out of the box. These tools are always available and don't require MCP server configuration.

## Overview

Tools are organized into categories:

| Category      | Description                          |
| ------------- | ------------------------------------ |
| **Search**    | Web search and information retrieval |
| **Fetch**     | URL and file content fetching        |
| **Compute**   | Code execution                       |
| **Transform** | Text transformation operations       |
| **Graph**     | Conversation DAG navigation          |

## Search Tools

### web_search

Search the web for information using Exa API.

**Parameters:**

| Name         | Type   | Required | Default | Description                 |
| ------------ | ------ | -------- | ------- | --------------------------- |
| `query`      | string | Yes      | -       | Search query                |
| `numResults` | number | No       | 5       | Number of results to return |

**Returns:**

```json
{
    "query": "machine learning basics",
    "results": [
        {
            "title": "Introduction to ML",
            "url": "https://example.com/ml-intro",
            "snippet": "Machine learning is..."
        }
    ]
}
```

**Requirements:** Requires `EXA_API_KEY` environment variable.

**Example:**

```yaml
allowedTools:
    - web_search
```

---

## Fetch Tools

### fetch_url

Fetch and extract content from a URL.

**Parameters:**

| Name     | Type   | Required | Default      | Description                                  |
| -------- | ------ | -------- | ------------ | -------------------------------------------- |
| `url`    | string | Yes      | -            | URL to fetch                                 |
| `format` | string | No       | `"markdown"` | Output format: `text`, `html`, or `markdown` |

**Returns:**

```json
{
    "url": "https://example.com/article",
    "title": "Article Title",
    "content": "# Article Title\n\nArticle content in markdown..."
}
```

**Example:**

```yaml
allowedTools:
    - fetch_url
```

---

### read_file

Read content from a file in the workspace.

**Parameters:**

| Name   | Type   | Required | Description                     |
| ------ | ------ | -------- | ------------------------------- |
| `path` | string | Yes      | File path relative to workspace |

**Returns:**

```json
{
    "path": "src/main.py",
    "content": "import os\n..."
}
```

**Note:** File system access may be limited depending on the deployment environment.

---

## Compute Tools

### execute_code

Execute Python code in a sandboxed Pyodide environment.

**Parameters:**

| Name       | Type   | Required | Default    | Description            |
| ---------- | ------ | -------- | ---------- | ---------------------- |
| `code`     | string | Yes      | -          | Python code to execute |
| `language` | string | No       | `"python"` | Programming language   |

**Returns:**

```json
{
    "success": true,
    "output": "Hello, World!\n",
    "returnValue": null
}
```

**Security:** This tool may require approval depending on HITL configuration.

**Example:**

```yaml
allowedTools:
    - execute_code
hitl:
    requireToolApproval: true
    autoApproveTools: [] # Require approval for code execution
```

---

## Transform Tools

### transform_text

Transform text using various operations.

**Parameters:**

| Name        | Type   | Required | Description          |
| ----------- | ------ | -------- | -------------------- |
| `text`      | string | Yes      | Text to transform    |
| `operation` | string | Yes      | Operation to perform |

**Supported Operations:**

| Operation    | Description          |
| ------------ | -------------------- |
| `uppercase`  | Convert to uppercase |
| `lowercase`  | Convert to lowercase |
| `word_count` | Count words in text  |

**Returns:**

```json
{
    "result": "HELLO WORLD"
}
```

---

## Graph Tools

Graph tools enable agents to navigate, query, and manipulate the conversation DAG (Directed Acyclic Graph). All graph tools use the `graph:` prefix.

### Read-Only Graph Tools

These tools query the graph without modifying it.

#### graph:getNode

Get a node by ID including its content and metadata.

**Parameters:**

| Name     | Type   | Required | Description         |
| -------- | ------ | -------- | ------------------- |
| `nodeId` | string | Yes      | Node ID to retrieve |

**Returns:**

```json
{
    "success": true,
    "node": {
        "id": "node-123",
        "type": "human",
        "title": "Question",
        "content": "How does this work?",
        "metadata": {},
        "position": { "x": 100, "y": 200 }
    }
}
```

---

#### graph:getChildren

Get all child nodes of a given node.

**Parameters:**

| Name     | Type   | Required | Description    |
| -------- | ------ | -------- | -------------- |
| `nodeId` | string | Yes      | Parent node ID |

**Returns:**

```json
{
    "success": true,
    "children": [
        { "id": "node-124", "type": "ai", "title": "Response A" },
        { "id": "node-125", "type": "ai", "title": "Response B" }
    ]
}
```

---

#### graph:getParents

Get all parent nodes of a given node.

**Parameters:**

| Name     | Type   | Required | Description   |
| -------- | ------ | -------- | ------------- |
| `nodeId` | string | Yes      | Child node ID |

**Returns:**

```json
{
    "success": true,
    "parents": [{ "id": "node-122", "type": "human", "title": "Question" }]
}
```

---

#### graph:findPathToRoot

Find the path from a node back to the nearest branch point or root.

**Parameters:**

| Name           | Type    | Required | Default | Description                                         |
| -------------- | ------- | -------- | ------- | --------------------------------------------------- |
| `nodeId`       | string  | Yes      | -       | Starting node ID                                    |
| `stopAtBranch` | boolean | No       | true    | Stop at first branch point instead of going to root |

**Returns:**

```json
{
    "success": true,
    "path": {
        "leafNodeId": "node-123",
        "branchNodeId": "node-001",
        "nodeIds": ["node-001", "node-122", "node-123"],
        "nodes": [
            { "id": "node-001", "type": "human", "title": "Root", "content": "..." },
            { "id": "node-122", "type": "ai", "title": "Response", "content": "..." },
            { "id": "node-123", "type": "human", "title": "Follow-up", "content": "..." }
        ]
    }
}
```

---

#### graph:getPathContent

Get formatted content from a path of nodes for reflection/analysis.

**Parameters:**

| Name      | Type     | Required | Description               |
| --------- | -------- | -------- | ------------------------- |
| `nodeIds` | string[] | Yes      | Array of node IDs in path |

**Returns:**

```json
{
    "success": true,
    "content": "[human] Root Question\nHow does this work?\n\n---\n\n[ai] Response\nHere's how it works...",
    "nodeCount": 2
}
```

---

### Write Graph Tools

These tools modify the graph. Use with caution.

#### graph:addEdge

Create an edge between two nodes in the graph.

**Parameters:**

| Name       | Type   | Required | Default   | Description                                          |
| ---------- | ------ | -------- | --------- | ---------------------------------------------------- |
| `source`   | string | Yes      | -         | Source node ID                                       |
| `target`   | string | Yes      | -         | Target node ID                                       |
| `edgeType` | string | No       | `"reply"` | Edge type: `reply`, `run_reflection`, `run_artifact` |

**Returns:**

```json
{
    "success": true,
    "edgeId": "edge-abc123",
    "source": "node-001",
    "target": "node-002"
}
```

**Example:**

```yaml
allowedTools:
    - graph:addEdge
hitl:
    requireMutationApproval: true # Recommended for write tools
```

---

#### graph:updateMetadata

Update metadata on a node (deep merge with existing metadata).

**Parameters:**

| Name       | Type   | Required | Description                            |
| ---------- | ------ | -------- | -------------------------------------- |
| `nodeId`   | string | Yes      | Node ID to update                      |
| `metadata` | object | Yes      | Metadata object to merge with existing |

**Merge Behavior:**

- Arrays are appended (existing + new)
- Objects are shallow-merged
- Primitives are overwritten

**Returns:**

```json
{
    "success": true,
    "nodeId": "node-123",
    "metadata": { "reflectionNodeIds": ["ref-001", "ref-002"], "analyzed": true }
}
```

**Example:**

```yaml
allowedTools:
    - graph:updateMetadata
```

---

### Legacy Graph Tools

These tools are also available for backward compatibility:

| Tool ID                        | Description                    |
| ------------------------------ | ------------------------------ |
| `graph:getNodeContent`         | Get content of a specific node |
| `graph:getPreviousReflections` | Find previous reflection nodes |
| `graph:checkBranchPoint`       | Check if node is branch point  |
| `graph:getRelatedNodes`        | Get parent/child nodes         |
| `graph:findNodesByType`        | Find nodes by type             |

---

## MCP Tools

In addition to built-in tools, agents can use tools from configured MCP servers. MCP tools use the format `mcp:server-name/tool-name`.

**Example:**

```yaml
# First configure MCP server in mcpServers section
mcpServers:
    - name: git
      type: stdio
      command: uvx
      args: [mcp-server-git, '--repository', '.']

# Then reference in agent
agents:
    - id: git-agent
      allowedTools:
          - mcp:git/git_status
          - mcp:git/git_log
          - web_search # Can mix with built-in tools
```

See [Creating Config-Based Agents](../how-to/create-yaml-agents.md) for more examples.

---

## Quick Reference

### All Built-in Tools

| Tool ID                        | Category  | Description                       |
| ------------------------------ | --------- | --------------------------------- |
| `web_search`                   | Search    | Web search via Exa API            |
| `fetch_url`                    | Fetch     | Fetch URL content                 |
| `read_file`                    | Fetch     | Read workspace file               |
| `execute_code`                 | Compute   | Execute Python code               |
| `transform_text`               | Transform | Text transformations              |
| `graph:getNode`                | Graph     | Get node by ID                    |
| `graph:getChildren`            | Graph     | Get child nodes                   |
| `graph:getParents`             | Graph     | Get parent nodes                  |
| `graph:findPathToRoot`         | Graph     | Find path to branch point         |
| `graph:getPathContent`         | Graph     | Get formatted content from path   |
| `graph:addEdge`                | Graph     | Create edge between nodes (write) |
| `graph:updateMetadata`         | Graph     | Update node metadata (write)      |
| `graph:getNodeContent`         | Graph     | Get node content (legacy)         |
| `graph:getPreviousReflections` | Graph     | Find reflections (legacy)         |
| `graph:checkBranchPoint`       | Graph     | Check if branch point (legacy)    |
| `graph:getRelatedNodes`        | Graph     | Get parents/children (legacy)     |
| `graph:findNodesByType`        | Graph     | Find nodes by type (legacy)       |

### Example: Research Agent with Multiple Tools

```yaml
agents:
    - id: research-agent
      name: Research Assistant
      slashCommand: /research
      systemPrompt: |
          You are a research assistant. Search the web, fetch content,
          and synthesize findings.
      allowedTools:
          - web_search
          - fetch_url
          - graph:getNodeContent
          - graph:findPathToRoot
      budgets:
          maxTokens: 100000
          maxToolCalls: 30
      hitl:
          requireToolApproval: false
```

---

## Error Handling

All tools return consistent error formats:

```json
{
    "success": false,
    "error": "Error description"
}
```

Common errors:

- `Node not found: {nodeId}` - Invalid node ID
- `Tool not found: {toolId}` - Unknown tool
- `Search not available - Exa API key not configured` - Missing API key
- `File system access not available in browser` - Environment limitation

---

## Source Code

- Built-in tools: [tool-registry.js](../../src/canvas_chat/static/js/agent/tool-registry.js)
- Graph tools: [graph-tools.js](../../src/canvas_chat/static/js/agent/graph-tools.js)
- Backend tool registry: [tool_registry.py](../../src/canvas_chat/tool_registry.py)

## See Also

- [Creating Config-Based Agents](../how-to/create-yaml-agents.md) - Define agents in YAML
- [Agent Architecture](../explanation/agent-architecture.md) - How agents work
- [config.example.yaml](../../config.example.yaml) - Configuration reference
