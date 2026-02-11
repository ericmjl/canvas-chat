# Help Modal

## Scenario: Help modal opens and closes

- Given I open Canvas Chat
- When I wait for the app to initialize
- When I open the "Help" modal
- Then the "Help" modal should be visible
- When I close the "Help" modal
- Then the "Help" modal should be hidden
