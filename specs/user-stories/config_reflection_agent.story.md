# Config-Based Reflection Agent

## Scenario: Config-based reflection agent is registered

- Given I open Canvas Chat
- When I wait for the app to initialize
- Then slash command "/reflect-config" should be registered

## Scenario: Config-based reflection requires a selected node

- Given I open Canvas Chat
- When I wait for the app to initialize
- And slash command "/reflect-config" should be registered
- And I clear any selected nodes
- And I record the current node count as "beforeReflectConfig"
- And I send the message "/reflect-config"
- Then I should see a toast with text "Please select a node before running /reflect-config"
- And the graph node count should be unchanged from "beforeReflectConfig"
