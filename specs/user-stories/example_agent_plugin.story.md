# Example Agent Plugin

## Scenario: Agent-backed commands are registered
- Given I open Canvas Chat
- When I wait for the app to initialize
- Then slash command "/analyze" should be registered
- And slash command "/coordinate" should be registered
