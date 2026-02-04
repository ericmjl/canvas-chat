# Search Overlay

## Scenario: Search overlay opens and closes
- Given I open Canvas Chat
- When I wait for the app to initialize
- When I open the search overlay
- Then the search overlay should be visible
- When I close the search overlay
- Then the search overlay should be hidden
