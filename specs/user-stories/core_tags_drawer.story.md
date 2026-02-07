# Tag Drawer

## Scenario: Tag drawer opens and closes
- Given I open Canvas Chat
- When I wait for the app to initialize
- When I open the tag drawer
- Then the tag drawer should be visible
- When I close the tag drawer
- Then the tag drawer should be hidden

## Scenario: Removing a tag chip clears it from the node
- Given I open Canvas Chat
- When I wait for the app to initialize
- And I create a tagged node with color "#ffc9c9" and name "Important", stored as "taggedNode"
- And I remove the tag color "#ffc9c9" from the node stored as "taggedNode"
- Then the node stored as "taggedNode" should not have tag color "#ffc9c9"
