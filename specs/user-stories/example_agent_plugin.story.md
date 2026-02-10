# Example Agent Plugin

## Scenario: Example agent plugin does not register slash commands

- Given I open Canvas Chat
- When I wait for the app to initialize
- Then slash command "/analyze" should not be registered
- And slash command "/coordinate" should not be registered
