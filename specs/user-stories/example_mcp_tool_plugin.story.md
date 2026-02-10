# Example MCP Tool Plugin

## Scenario: MCP tool commands are registered

- Given I open Canvas Chat
- When I wait for the app to initialize
- Then slash command "/tools" should be registered
- And slash command "/search-web" should be registered
- And slash command "/analyze-text" should not be registered
- And slash command "/calculate" should be registered
