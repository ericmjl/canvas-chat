# Example Minimal Agent Plugin

## Scenario: Minimal agent command is registered

- Given I open Canvas Chat
- When I wait for the app to initialize
- Then slash command "/simple" should be registered
