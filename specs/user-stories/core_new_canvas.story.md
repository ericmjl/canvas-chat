# New Canvas

## Scenario: New canvas clears the graph

- Given I open Canvas Chat
- When I wait for the app to initialize
- When I create a "note" node via the app API
- Then the graph should have at least 1 nodes
- When I click "New Canvas"
- Then the graph should have exactly 0 nodes
