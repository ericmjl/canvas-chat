# Chat Input

## Scenario: Sending a message creates nodes
- Given I open Canvas Chat
- When I wait for the app to initialize
- When I send the message "Hello from test"
- Then the graph should have at least 1 nodes
