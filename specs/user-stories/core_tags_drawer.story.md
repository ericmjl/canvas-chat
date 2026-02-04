# Tag Drawer

## Scenario: Tag drawer opens and closes
- Given I open Canvas Chat
- When I wait for the app to initialize
- When I open the tag drawer
- Then the tag drawer should be visible
- When I close the tag drawer
- Then the tag drawer should be hidden
