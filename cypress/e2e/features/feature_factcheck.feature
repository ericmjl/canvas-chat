Feature: Factcheck Feature

  Scenario: Factcheck slash command is registered
    Given I open Canvas Chat
    When I wait for the app to initialize
    Then slash command "/factcheck" should be registered
