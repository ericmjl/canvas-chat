# Research Feature

## Scenario: Research slash commands are registered
- Given I open Canvas Chat
- When I wait for the app to initialize
- Then slash command "/search" should be registered
- And slash command "/research" should be registered
