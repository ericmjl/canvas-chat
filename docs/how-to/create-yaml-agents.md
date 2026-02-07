# Creating Config-Based Agents

This guide explains how to define agents via `config.yaml` instead of writing JavaScript code. Config-based agents are ideal for:

- Simple workflows that primarily need LLM reasoning + built-in tools
- Rapid prototyping of agent behaviors
- Non-developers who want to customize agent behavior
- Extracting prompts and configurations from code

## Overview

Config-based agents are defined in the `agents:` section of `config.yaml`. They support:

- **System prompts**: Define agent personality and instructions
- **Slash commands**: Register commands like `/myagent` that users can invoke
- **Tool access**: Grant access to built-in and MCP tools
- **Budgets**: Set token, tool call, and timeout limits
- **HITL policies**: Configure human-in-the-loop approvals
- **Sub-agents**: Define nested agents for delegation

## Quick Start

Add an agent to your `config.yaml`:

```yaml
agents:
    - id: my-assistant
      name: My Assistant
      slashCommand: /assist
      systemPrompt: |
          You are a helpful assistant that answers questions clearly and concisely.
          When asked about code, provide examples in Python.
      allowedTools:
          - web_search
          - fetch_url
      budgets:
          maxTokens: 50000
          maxToolCalls: 10
          timeoutMs: 60000
```

After saving the config and restarting the server, users can invoke `/assist` in the chat input to use your agent.

## Agent Configuration Reference

### Required Fields

| Field  | Type   | Description                                        |
| ------ | ------ | -------------------------------------------------- |
| `id`   | string | Unique identifier for the agent (e.g., `my-agent`) |
| `name` | string | Human-readable display name                        |

### Optional Fields

| Field                   | Type     | Default    | Description                                     |
| ----------------------- | -------- | ---------- | ----------------------------------------------- |
| `slashCommand`          | string   | none       | Slash command trigger (e.g., `/myagent`)        |
| `engine`                | string   | `built-in` | Execution engine (`built-in` or custom adapter) |
| `model`                 | string   | (default)  | LLM model ID (uses model picker if empty)       |
| `systemPrompt`          | string   | empty      | System instructions for the agent               |
| `allowedTools`          | string[] | `[]`       | Tool IDs the agent can use                      |
| `defaultOutputNodeType` | string   | `ai`       | Node type for agent outputs                     |
| `outputDisplay`         | object   | null       | Data-driven display config for output nodes     |
| `budgets`               | object   | defaults   | Token/tool/time limits                          |
| `hitl`                  | object   | defaults   | Human-in-the-loop policies                      |
| `subagents`             | object   | `{}`       | Nested sub-agent definitions                    |

### Budgets Configuration

```yaml
budgets:
    maxTokens: 50000 # Maximum tokens for generation (default: 50000)
    maxToolCalls: 20 # Maximum tool invocations (default: 20)
    timeoutMs: 300000 # Timeout in milliseconds (default: 5 minutes)
```

### HITL Configuration

```yaml
hitl:
    requireToolApproval: false # Require approval for tool calls
    requireSubagentApproval: false # Require approval for sub-agent spawns
    requireMutationApproval: true # Require approval for canvas mutations
    autoApproveTools: # Tools to auto-approve
        - web_search
        - fetch_url
```

### Output Display Configuration

Customize how agent output nodes appear without writing JavaScript code:

```yaml
outputDisplay:
    typeLabel: My Custom Node # Display name in node header
    typeIcon: ✨ # Emoji icon next to the label
    actions: # Action buttons to show
        - reply
        - copy
        - edit-content
```

Available action IDs:

- `reply` - Reply to this node
- `copy` - Copy content to clipboard
- `edit-content` - Edit the content
- `summarize` - Create a summary
- `branch` - Branch from selection
- `fetch-summarize` - Fetch and summarize URL
- `create-flashcards` - Generate flashcards
- `run-code` - Execute code (for code nodes)
- `generate` - AI generate (for code nodes)

### Post-Create Hooks Configuration

Execute automatic graph operations after an artifact is created. This enables declarative graph manipulation without writing JavaScript code:

```yaml
postCreate:
    usePathContext: true # Enable $branch and $leaf resolution
    edges:
        - from: $branch # Create edge from branch point to artifact
          to: $artifact
          edgeType: run_reflection
        - from: $leaf # Create edge from leaf node to artifact
          to: $artifact
          edgeType: run_reflection
    metadataUpdates:
        - target: $source # Update source nodes
          metadata:
              reflectionNodeIds: [$artifact] # Arrays are appended
        - target: $branch
          metadata:
              hasReflection: true
```

#### Variable References

Variable references are placeholders that get resolved at runtime when postCreate hooks execute.
They allow declarative specification of graph operations without knowing node IDs in advance.

| Reference   | Description                                                         | When Available                  |
| ----------- | ------------------------------------------------------------------- | ------------------------------- |
| `$artifact` | The artifact node just created by this agent run                    | Always                          |
| `$source`   | Each source node that triggered the run (expands to multiple nodes) | Always                          |
| `$branch`   | The branch point node in the conversation path                      | Requires `usePathContext: true` |
| `$leaf`     | The leaf node where the user invoked the agent                      | Requires `usePathContext: true` |

**Understanding Path Context:**

When `usePathContext: true` is set, the engine traces back from the source node to find:

- **`$leaf`**: The node where the user triggered the agent (typically a human message)
- **`$branch`**: The nearest branch point (a node with multiple children) or root node

This path represents the conversation thread being analyzed.

**Expansion Behavior:**

- `$artifact` always resolves to exactly one node ID
- `$source` may resolve to multiple node IDs if agent was triggered by multiple selections
- `$branch` and `$leaf` resolve to single node IDs

When used in edges, variable references expand to create edges for each combination.
For example, `from: $source, to: $artifact` creates an edge from each source node to the artifact.

**Variables in Metadata:**

Variable references can also be used in metadata values:

```yaml
metadataUpdates:
    - target: $branch
      metadata:
          reflectionNodeIds: [$artifact] # Stores the artifact node ID
          analyzedBy: [$artifact] # Same - stores artifact ID
```

#### Edge Types

| Type             | Description                |
| ---------------- | -------------------------- |
| `reply`          | Standard conversation edge |
| `run_reflection` | Reflection analysis edge   |
| `run_artifact`   | Run to artifact edge       |
| `run_trigger`    | Trigger to run edge        |
| `subagent`       | Parent to sub-agent edge   |

#### Complete Example: Reflection Agent

```yaml
agents:
    - id: reflection-analysis
      name: Reflection Analysis
      slashCommand: /reflect
      systemPrompt: |
          You analyze conversation paths and synthesize insights.
          Focus on key decisions, turning points, and implications.
      allowedTools:
          - graph:findPathToRoot
          - graph:getPathContent
      defaultOutputNodeType: reflection
      outputDisplay:
          typeLabel: Reflection
          typeIcon: 🔮
          actions: [reply, copy]
      postCreate:
          usePathContext: true
          edges:
              - from: $branch
                to: $artifact
                edgeType: run_reflection
              - from: $leaf
                to: $artifact
                edgeType: run_reflection
          metadataUpdates:
              - target: $branch
                metadata:
                    reflectionNodeIds: [$artifact]
              - target: $leaf
                metadata:
                    reflectionNodeIds: [$artifact]
```

## Available Tools

### Built-in Tools

These tools are always available:

| Tool ID          | Description                         |
| ---------------- | ----------------------------------- |
| `web_search`     | Search the web using Exa API        |
| `fetch_url`      | Fetch and extract content from URLs |
| `read_file`      | Read file contents                  |
| `execute_code`   | Execute Python code in sandbox      |
| `transform_text` | Transform text operations           |

### Graph Tools

Tools for navigating the conversation DAG. See [Built-in Tools API Reference](../reference/built-in-tools-api.md) for detailed documentation.

| Tool ID                        | Description                         |
| ------------------------------ | ----------------------------------- |
| `graph:findPathToRoot`         | Find path from node to branch point |
| `graph:getNodeContent`         | Get content of a specific node      |
| `graph:getPathContent`         | Get content from multiple nodes     |
| `graph:getPreviousReflections` | Find previous reflection nodes      |
| `graph:checkBranchPoint`       | Check if node is a branch point     |
| `graph:getRelatedNodes`        | Get parent/child nodes              |
| `graph:findNodesByType`        | Find nodes by type                  |

### MCP Tools

Tools from configured MCP servers use the `mcp:server-name/tool-name` format.
MCP servers must be configured in the `mcpServers:` section of config.yaml first.

```yaml
allowedTools:
    - mcp:filesystem/read_file # Specific tool from filesystem server
    - mcp:github/create_issue # Specific tool from github server
    - mcp:brave-search/* # Wildcard for all tools from server
```

Example agent using MCP tools:

```yaml
# First, configure the MCP server in mcpServers:
mcpServers:
    - name: git
      type: stdio
      command: uvx
      args:
          - mcp-server-git
          - '--repository'
          - '.'

agents:
    - id: git-assistant
      name: Git Assistant
      slashCommand: /git-agent
      systemPrompt: |
          You help users explore their git repository.
          Use the available tools to inspect commits and history.
      allowedTools:
          - mcp:git/git_status # From MCP server
          - mcp:git/git_log
          - web_search # Can mix with built-in tools
```

## Examples

### Research Agent

```yaml
agents:
    - id: researcher
      name: Research Assistant
      slashCommand: /research-config
      systemPrompt: |
          You are a research assistant. When given a topic:
          1. Search for relevant information using web_search
          2. Retrieve detailed content from promising URLs
          3. Synthesize findings into a comprehensive summary

          Always cite your sources with URLs.
      allowedTools:
          - web_search
          - fetch_url
      budgets:
          maxTokens: 100000
          maxToolCalls: 30
          timeoutMs: 300000
```

### Reflection Agent

```yaml
agents:
    - id: reflection-agent
      name: Reflection Agent
      slashCommand: /reflect-config
      systemPrompt: |
          You are analyzing a conversation thread to produce insights.
          You will be given a path through a conversation.
          Synthesize what you learn about the direction the conversation took.

          Provide a concise synthesis (2-3 paragraphs) that:
          1. Summarizes the key direction/theme
          2. Notes what was learned or decided
          3. Highlights interesting patterns or insights
      engine: agentic
      allowedTools:
          - graph:findPathToRoot
          - graph:getNodeContent
          - graph:getPreviousReflections
      budgets:
          maxTokens: 1000
          maxToolCalls: 10
          timeoutMs: 30000
      defaultOutputNodeType: reflection
      outputMode: single_node
      outputDisplay:
          typeLabel: Reflection
          typeIcon: 🔮
          actions:
              - reply
              - copy
```

Tip: set `outputMode: single_node` to render a single working node that streams and finalizes into the output, instead of creating a separate RUN node and artifact node.

Note: use `engine: agentic` for agents that need to call graph tools. The built-in engine streams a single response and does not execute tool calls.

### Supervisor with Sub-Agents

```yaml
agents:
    - id: supervisor
      name: Task Supervisor
      slashCommand: /supervise
      systemPrompt: |
          You coordinate specialized workers for complex tasks.
          Delegate research to the retriever sub-agent.
          Delegate summarization to the summarizer sub-agent.
          Synthesize their outputs into a final response.
      subagents:
          retriever:
              id: retriever
              name: Information Retriever
              systemPrompt: You retrieve and filter relevant information.
              allowedTools:
                  - web_search
                  - fetch_url
              budgets:
                  maxTokens: 30000
                  maxToolCalls: 15
          summarizer:
              id: summarizer
              name: Content Summarizer
              systemPrompt: You summarize content clearly and concisely.
              allowedTools: []
              budgets:
                  maxTokens: 20000
                  maxToolCalls: 0
```

## Priority and Conflicts

Config-based agents are loaded after feature plugins. If a slash command conflicts:

1. **Feature plugins take precedence**: Built-in `/reflect` won't be overwritten
2. **Use unique commands**: Use `/reflect-config` instead of `/reflect`
3. **Check console logs**: Conflicts are logged at startup

## Debugging

Enable agent debug logging in the browser console:

```javascript
window.enableAgentDebug();
window.setAgentLogLevel('DEBUG');
```

Check agent registration:

```javascript
app.baseAgent.listSubAgents();
```

## Migrating from Code to Config

To migrate an existing JavaScript agent to config:

1. **Extract the system prompt** to `systemPrompt` field
2. **List required tools** in `allowedTools`
3. **Set budgets** based on typical usage
4. **Choose a unique slash command**
5. **Remove or slim down the JavaScript plugin** (keep UI-only code if needed)

For complex features with custom UI, keep the JavaScript plugin and use config for just the prompts and tool permissions.

## See Also

- [Built-in Tools API](../reference/built-in-tools-api.md) - All built-in tools available to agents
- [Plugin Architecture](../explanation/plugin-architecture.md) - When to use code vs config
- [Agent Architecture](../explanation/agent-architecture.md) - How agents work internally
- [Feature Plugin API](../reference/feature-plugin-api.md) - For complex features needing code
- [config.example.yaml](../../config.example.yaml) - Full configuration reference
