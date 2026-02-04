Feature: Core App Loads

  Scenario: App loads with toolbar and canvas
    Given I open Canvas Chat
    When I wait for the app to initialize
    Then I should see the toolbar
    And the canvas should be visible
