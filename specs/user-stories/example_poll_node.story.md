# Example Poll Node

## Scenario: Poll node type can be created

- Given I open Canvas Chat
- When I wait for the app to initialize
- When I create a "poll" node via the app API
- Then the graph should include a node of type "poll"
