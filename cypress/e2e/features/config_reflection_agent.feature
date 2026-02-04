Feature: Config-Based Reflection Agent

  Scenario: Config-based reflection agent is registered
    Given I open Canvas Chat
    When I wait for the app to initialize
    Then slash command "/reflect-config" should be registered
