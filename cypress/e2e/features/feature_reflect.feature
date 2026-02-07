Feature: Reflect Feature

  Scenario: Reflect slash command is registered
    Given I open Canvas Chat
    When I wait for the app to initialize
    Then slash command "/reflect" should be registered

  Scenario: Reflect requires a selected node
    Given I open Canvas Chat
    When I wait for the app to initialize
    And slash command "/reflect" should be registered
    And I clear any selected nodes
    And I record the current node count as "beforeReflect"
    And I send the message "/reflect"
    Then I should see a toast with text "Please select a node to reflect on"
    And the graph node count should be unchanged from "beforeReflect"

  Scenario: Reflect creates a reflection node when a node is selected
    Given I open Canvas Chat
    When I wait for the app to initialize
    And slash command "/reflect" should be registered
    And I stub the agent stream response
    And I create a "human" node and store its id as "selectedNodeId"
    And I select the node stored as "selectedNodeId"
    And I record the current node count as "beforeReflect"
    And I send the message "/reflect"
    Then the graph should have at least 1 more node than "beforeReflect"
    And the graph should include a node of type "reflection"
