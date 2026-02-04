# Settings Modal

## Scenario: Settings modal opens and closes
- Given I open Canvas Chat
- When I wait for the app to initialize
- When I open the "Settings" modal
- Then the "Settings" modal should be visible
- When I close the "Settings" modal
- Then the "Settings" modal should be hidden
