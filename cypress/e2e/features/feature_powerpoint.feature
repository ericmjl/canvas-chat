Feature: PowerPoint Feature

  Scenario: PowerPoint feature is registered
    Given I open Canvas Chat
    When I wait for the app to initialize
    Then feature plugin "powerpoint" should be registered
