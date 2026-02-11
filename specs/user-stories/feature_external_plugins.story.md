# External Plugins

## Scenario: External plugins listed by the backend are loaded

- Given I stub external plugins list with valid plugins
- And I open Canvas Chat
- When I wait for the app to initialize
- And I reload external plugins for testing
- Then external plugins should be loaded
- And external plugins should include id "poll"
- And external plugins should include id "example-poll-node"
