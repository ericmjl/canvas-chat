Feature: Canvas Chat entry

  Scenario: Open the app and see primary controls
    Given I open Canvas Chat
    When I wait for the app to initialize
    Then I should see the toolbar
    And I should see the "New Canvas" button
